import NativeEscTscPrinter from '../NativeEscTscPrinter';
import type { NativeDevice } from '../NativeEscTscPrinter';
import type { ConnectedDevice, PrinterDevice } from '../types';

function toDevice(native: NativeDevice): PrinterDevice {
  return {
    id: native.id,
    name: native.name,
    address: native.address,
    type: native.type === 'ble' ? 'ble' : 'spp',
  };
}

export const BluetoothManager = {
  EVENT_DEVICE_FOUND: 'onDeviceFound',
  EVENT_DEVICE_DISCOVER_DONE: 'onScanDone',
  EVENT_CONNECTED: 'onConnected',
  EVENT_DISCONNECTED: 'onDisconnected',
  EVENT_CONNECTION_LOST: 'onConnectionLost',

  isBluetoothEnabled(): Promise<boolean> {
    return NativeEscTscPrinter.isEnabled();
  },

  requestPermissions(): Promise<boolean> {
    return NativeEscTscPrinter.requestPermissions();
  },

  enableBluetooth(): Promise<boolean> {
    return NativeEscTscPrinter.enableBluetooth();
  },

  async scanDevices(timeoutMs = 8000): Promise<{
    found: PrinterDevice[];
    paired: PrinterDevice[];
  }> {
    const devices = await NativeEscTscPrinter.scan(timeoutMs);
    return {
      found: devices.map(toDevice),
      paired: devices.filter((device) => device.type === 'spp').map(toDevice),
    };
  },

  stopScan(): Promise<void> {
    return NativeEscTscPrinter.stopScan();
  },

  connect(address: string): Promise<void> {
    return NativeEscTscPrinter.connect(address);
  },

  disconnect(): Promise<void> {
    return NativeEscTscPrinter.disconnect();
  },

  async getConnectedDevice(): Promise<ConnectedDevice> {
    const connected = await NativeEscTscPrinter.isConnected();
    if (!connected) {
      return {
        id: '',
        name: '',
        address: '',
        type: 'spp',
        connected: false,
      };
    }
    const device = await NativeEscTscPrinter.getConnectedDevice();
    return { ...toDevice(device), connected: true };
  },

  async isDeviceConnected(): Promise<boolean> {
    return NativeEscTscPrinter.isConnected();
  },

  onDeviceFound(listener: (device: PrinterDevice) => void) {
    return NativeEscTscPrinter.onDeviceFound((device: NativeDevice) => {
      listener(toDevice(device));
    });
  },

  onScanDone(listener: () => void) {
    return NativeEscTscPrinter.onScanDone(() => {
      listener();
    });
  },

  onConnected(listener: (device: PrinterDevice) => void) {
    return NativeEscTscPrinter.onConnected((device: NativeDevice) => {
      listener(toDevice(device));
    });
  },

  onDisconnected(listener: () => void) {
    return NativeEscTscPrinter.onDisconnected(() => {
      listener();
    });
  },

  onConnectionLost(listener: () => void) {
    return NativeEscTscPrinter.onConnectionLost(() => {
      listener();
    });
  },
};
