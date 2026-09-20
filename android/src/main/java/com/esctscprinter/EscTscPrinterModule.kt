package com.esctscprinter

import android.Manifest
import android.annotation.SuppressLint
import android.app.Activity
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothManager
import android.bluetooth.BluetoothSocket
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.util.Base64
import com.facebook.react.bridge.ActivityEventListener
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.WritableMap
import com.facebook.react.modules.core.PermissionAwareActivity
import com.facebook.react.modules.core.PermissionListener
import java.io.InputStream
import java.io.OutputStream
import java.nio.charset.Charset
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.Executors

@SuppressLint("MissingPermission")
class EscTscPrinterModule(reactContext: ReactApplicationContext) :
  NativeEscTscPrinterSpec(reactContext),
  ActivityEventListener,
  PermissionListener {

  private val mainHandler = Handler(Looper.getMainLooper())
  private val ioExecutor = Executors.newSingleThreadExecutor()
  private val foundDevices = ConcurrentHashMap<String, WritableMap>()
  private val sppUuid: UUID = UUID.fromString("00001101-0000-1000-8000-00805F9B34FB")

  private var permissionPromise: Promise? = null
  private var enablePromise: Promise? = null
  private var scanPromise: Promise? = null
  private var scanning = false
  private var socket: BluetoothSocket? = null
  private var outputStream: OutputStream? = null
  private var inputStream: InputStream? = null
  private var connectedDevice: BluetoothDevice? = null
  private var readerThread: Thread? = null

  private val discoveryReceiver = object : BroadcastReceiver() {
    override fun onReceive(context: Context?, intent: Intent?) {
      when (intent?.action) {
        BluetoothDevice.ACTION_FOUND -> {
          val device = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            intent.getParcelableExtra(BluetoothDevice.EXTRA_DEVICE, BluetoothDevice::class.java)
          } else {
            @Suppress("DEPRECATION")
            intent.getParcelableExtra(BluetoothDevice.EXTRA_DEVICE)
          } ?: return
          emitDevice(device)
        }
        BluetoothAdapter.ACTION_DISCOVERY_FINISHED -> finishScan()
      }
    }
  }

  private fun adapter(): BluetoothAdapter? {
    val manager = reactApplicationContext.getSystemService(Context.BLUETOOTH_SERVICE) as BluetoothManager
    return manager.adapter
  }

  override fun initialize() {
    super.initialize()
    reactApplicationContext.addActivityEventListener(this)
    val filter = IntentFilter().apply {
      addAction(BluetoothDevice.ACTION_FOUND)
      addAction(BluetoothAdapter.ACTION_DISCOVERY_FINISHED)
    }
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      reactApplicationContext.registerReceiver(discoveryReceiver, filter, Context.RECEIVER_EXPORTED)
    } else {
      reactApplicationContext.registerReceiver(discoveryReceiver, filter)
    }
  }

  override fun invalidate() {
    try {
      reactApplicationContext.unregisterReceiver(discoveryReceiver)
    } catch (_: Exception) {
    }
    reactApplicationContext.removeActivityEventListener(this)
    closeSocket()
    ioExecutor.shutdownNow()
    super.invalidate()
  }

  override fun isEnabled(promise: Promise) {
    promise.resolve(adapter()?.isEnabled == true)
  }

  override fun requestPermissions(promise: Promise) {
    val needed = missingPermissions()
    if (needed.isEmpty()) {
      promise.resolve(true)
      return
    }
    val activity = reactApplicationContext.getCurrentActivity()
    if (activity !is PermissionAwareActivity) {
      promise.reject("NO_ACTIVITY", "Unable to request Bluetooth permissions")
      return
    }
    permissionPromise = promise
    activity.requestPermissions(needed, REQUEST_PERMISSIONS, this)
  }

  override fun enableBluetooth(promise: Promise) {
    val bluetoothAdapter = adapter()
    if (bluetoothAdapter == null) {
      promise.reject("UNSUPPORTED", "Bluetooth is not supported on this device")
      return
    }
    if (bluetoothAdapter.isEnabled) {
      promise.resolve(true)
      return
    }
    val activity = reactApplicationContext.getCurrentActivity()
    if (activity == null) {
      promise.reject("NO_ACTIVITY", "Unable to prompt Bluetooth enable")
      return
    }
    enablePromise = promise
    activity.startActivityForResult(Intent(BluetoothAdapter.ACTION_REQUEST_ENABLE), REQUEST_ENABLE)
  }

  override fun scan(timeoutMs: Double, promise: Promise) {
    val bluetoothAdapter = adapter()
    if (bluetoothAdapter == null || !bluetoothAdapter.isEnabled) {
      promise.reject("BT_DISABLED", "Bluetooth is not enabled")
      return
    }
    if (scanning) {
      promise.reject("SCAN_IN_PROGRESS", "A scan is already running")
      return
    }

    foundDevices.clear()
    scanPromise = promise
    scanning = true

    bluetoothAdapter.bondedDevices?.forEach { emitDevice(it) }
    bluetoothAdapter.startDiscovery()

    val timeout = timeoutMs.toLong().coerceAtLeast(1000)
    mainHandler.postDelayed({ finishScan() }, timeout)
  }

  override fun stopScan(promise: Promise) {
    finishScan()
    promise.resolve(null)
  }

  override fun connect(id: String, promise: Promise) {
    ioExecutor.execute {
      try {
        val bluetoothAdapter = adapter()
          ?: throw IllegalStateException("Bluetooth is not supported")
        bluetoothAdapter.cancelDiscovery()
        closeSocket()

        val device = bluetoothAdapter.getRemoteDevice(id)
        val created = try {
          device.createRfcommSocketToServiceRecord(sppUuid)
        } catch (_: Exception) {
          device.javaClass
            .getMethod("createRfcommSocket", Int::class.javaPrimitiveType)
            .invoke(device, 1) as BluetoothSocket
        }
        created.connect()
        socket = created
        outputStream = created.outputStream
        inputStream = created.inputStream
        connectedDevice = device
        startReader()
        val map = deviceMap(device)
        reactApplicationContext.runOnNativeModulesQueueThread {
          emitOnConnected(map)
        }
        promise.resolve(null)
      } catch (error: Exception) {
        closeSocket()
        promise.reject("CONNECT_FAILED", error.message, error)
      }
    }
  }

  override fun disconnect(promise: Promise) {
    ioExecutor.execute {
      closeSocket()
      reactApplicationContext.runOnNativeModulesQueueThread {
        emitOnDisconnected(emptyEvent())
      }
      promise.resolve(null)
    }
  }

  override fun write(base64Data: String, promise: Promise) {
    ioExecutor.execute {
      val stream = outputStream
      if (stream == null) {
        promise.reject("NOT_CONNECTED", "No printer is connected")
        return@execute
      }
      try {
        val bytes = Base64.decode(base64Data, Base64.DEFAULT)
        var offset = 0
        while (offset < bytes.size) {
          val end = minOf(offset + WRITE_CHUNK, bytes.size)
          stream.write(bytes, offset, end - offset)
          offset = end
        }
        stream.flush()
        promise.resolve(null)
      } catch (error: Exception) {
        closeSocket()
        reactApplicationContext.runOnNativeModulesQueueThread {
          emitOnConnectionLost(emptyEvent())
        }
        promise.reject("WRITE_FAILED", error.message, error)
      }
    }
  }

  override fun encode(text: String, encoding: String, promise: Promise) {
    try {
      val charset = charsetFor(encoding)
      promise.resolve(Base64.encodeToString(text.toByteArray(charset), Base64.NO_WRAP))
    } catch (error: Exception) {
      promise.reject("ENCODE_FAILED", error.message, error)
    }
  }

  override fun rasterizeMono(base64Image: String, targetWidth: Double, promise: Promise) {
    try {
      val result = ImageRaster.rasterizeMono(base64Image, targetWidth.toInt())
      val map = Arguments.createMap()
      map.putInt("widthBytes", result.widthBytes)
      map.putInt("height", result.height)
      map.putString("data", Base64.encodeToString(result.data, Base64.NO_WRAP))
      promise.resolve(map)
    } catch (error: Exception) {
      promise.reject("RASTER_FAILED", error.message, error)
    }
  }

  override fun getConnectedDevice(promise: Promise) {
    val device = connectedDevice
    if (device == null) {
      promise.resolve(emptyDevice())
    } else {
      promise.resolve(deviceMap(device))
    }
  }

  override fun isConnected(promise: Promise) {
    promise.resolve(socket?.isConnected == true)
  }

  override fun onActivityResult(activity: Activity, requestCode: Int, resultCode: Int, data: Intent?) {
    if (requestCode == REQUEST_ENABLE) {
      enablePromise?.resolve(resultCode == Activity.RESULT_OK || adapter()?.isEnabled == true)
      enablePromise = null
    }
  }

  override fun onNewIntent(intent: Intent) = Unit

  override fun onRequestPermissionsResult(
    requestCode: Int,
    permissions: Array<String>,
    grantResults: IntArray
  ): Boolean {
    if (requestCode != REQUEST_PERMISSIONS) {
      return false
    }
    val granted = grantResults.isNotEmpty() && grantResults.all { it == PackageManager.PERMISSION_GRANTED }
    permissionPromise?.resolve(granted)
    permissionPromise = null
    return true
  }

  private fun emitDevice(device: BluetoothDevice) {
    val address = device.address ?: return
    if (foundDevices.containsKey(address)) {
      return
    }
    val map = deviceMap(device)
    foundDevices[address] = map
    reactApplicationContext.runOnNativeModulesQueueThread {
      emitOnDeviceFound(cloneMap(map))
    }
  }

  private fun finishScan() {
    if (!scanning) {
      return
    }
    scanning = false
    adapter()?.cancelDiscovery()
    mainHandler.removeCallbacksAndMessages(null)
    val devices = Arguments.createArray()
    foundDevices.values.forEach { devices.pushMap(cloneMap(it)) }
    scanPromise?.resolve(devices)
    scanPromise = null
    reactApplicationContext.runOnNativeModulesQueueThread {
      emitOnScanDone(emptyEvent())
    }
  }

  private fun startReader() {
    readerThread = Thread {
      val buffer = ByteArray(256)
      try {
        while (!Thread.currentThread().isInterrupted) {
          val read = inputStream?.read(buffer) ?: break
          if (read < 0) {
            break
          }
        }
      } catch (_: Exception) {
      }
      if (socket != null) {
        closeSocket()
        reactApplicationContext.runOnNativeModulesQueueThread {
          emitOnConnectionLost(emptyEvent())
        }
      }
    }.also { it.start() }
  }

  private fun closeSocket() {
    synchronized(this) {
      try {
        readerThread?.interrupt()
        inputStream?.close()
        outputStream?.close()
        socket?.close()
      } catch (_: Exception) {
      } finally {
        readerThread = null
        inputStream = null
        outputStream = null
        socket = null
        connectedDevice = null
      }
    }
  }

  private fun deviceMap(device: BluetoothDevice): WritableMap {
    val map = Arguments.createMap()
    map.putString("id", device.address ?: "")
    map.putString("name", device.name ?: device.address ?: "Unknown")
    map.putString("address", device.address ?: "")
    map.putString("type", "spp")
    return map
  }

  private fun emptyDevice(): WritableMap {
    val map = Arguments.createMap()
    map.putString("id", "")
    map.putString("name", "")
    map.putString("address", "")
    map.putString("type", "spp")
    return map
  }

  private fun emptyEvent(): WritableMap {
    val map = Arguments.createMap()
    map.putBoolean("ok", true)
    return map
  }

  private fun cloneMap(source: WritableMap): WritableMap {
    val copy = Arguments.createMap()
    copy.merge(source)
    return copy
  }

  private fun charsetFor(encoding: String): Charset {
    return when (encoding.lowercase().replace("-", "")) {
      "gbk" -> Charset.forName("GBK")
      "gb2312" -> Charset.forName("GB2312")
      "gb18030" -> Charset.forName("GB18030")
      else -> Charsets.UTF_8
    }
  }

  private fun missingPermissions(): Array<String> {
    val required = mutableListOf<String>()
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      required += Manifest.permission.BLUETOOTH_SCAN
      required += Manifest.permission.BLUETOOTH_CONNECT
    } else {
      required += Manifest.permission.BLUETOOTH
      required += Manifest.permission.BLUETOOTH_ADMIN
      required += Manifest.permission.ACCESS_FINE_LOCATION
    }
    return required
      .filter { reactApplicationContext.checkSelfPermission(it) != PackageManager.PERMISSION_GRANTED }
      .toTypedArray()
  }

  companion object {
    const val NAME = NativeEscTscPrinterSpec.NAME
    private const val REQUEST_PERMISSIONS = 4211
    private const val REQUEST_ENABLE = 4212
    private const val WRITE_CHUNK = 1024
  }
}
