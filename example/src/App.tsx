import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  ALIGN,
  BluetoothManager,
  EscposPrinter,
  FONTTYPE,
  TscPrinter,
  type PrinterDevice,
} from 'react-native-esc-tsc-printer';

type Tab = 'devices' | 'tsc' | 'esc';

export default function App() {
  const [tab, setTab] = useState<Tab>('devices');
  const [status, setStatus] = useState('Idle');
  const [busy, setBusy] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [connected, setConnected] = useState(false);
  const [devices, setDevices] = useState<PrinterDevice[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const transportLabel = Platform.OS === 'ios' ? 'BLE' : 'Classic SPP';

  const selected = useMemo(
    () => devices.find((device) => device.id === selectedId) ?? null,
    [devices, selectedId]
  );

  useEffect(() => {
    const found = BluetoothManager.onDeviceFound((device) => {
      setDevices((current) => {
        if (current.some((item) => item.id === device.id)) {
          return current;
        }
        return [...current, device];
      });
    });
    const done = BluetoothManager.onScanDone(() => {
      setBusy(false);
      setStatus('Scan complete');
    });
    const onConnected = BluetoothManager.onConnected((device) => {
      setConnected(true);
      setSelectedId(device.id);
      setStatus(`Connected to ${device.name}`);
    });
    const lost = BluetoothManager.onConnectionLost(() => {
      setConnected(false);
      setStatus('Connection lost');
    });
    const disconnected = BluetoothManager.onDisconnected(() => {
      setConnected(false);
      setStatus('Disconnected');
    });

    BluetoothManager.isBluetoothEnabled()
      .then(setEnabled)
      .catch(() => setEnabled(false));

    return () => {
      found.remove();
      done.remove();
      onConnected.remove();
      lost.remove();
      disconnected.remove();
    };
  }, []);

  async function run(label: string, task: () => Promise<void>) {
    try {
      setBusy(true);
      setStatus(label);
      await task();
      setStatus(`${label} — done`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="dark-content" />
      <View style={styles.header}>
        <Text style={styles.title}>ESC / TSC Printer</Text>
        <Text style={styles.subtitle}>
          {Platform.OS === 'ios'
            ? 'iOS uses Bluetooth Low Energy. Classic SPP printers will not appear.'
            : 'Android uses Classic Bluetooth SPP for most ESC/TSC printers.'}
        </Text>
        <Text style={styles.meta}>
          Transport {transportLabel} · BT {enabled ? 'on' : 'off'} ·{' '}
          {connected ? 'connected' : 'not connected'}
        </Text>
      </View>

      <View style={styles.tabs}>
        {(['devices', 'tsc', 'esc'] as const).map((item) => (
          <Pressable
            key={item}
            onPress={() => setTab(item)}
            style={[styles.tab, tab === item && styles.tabActive]}
          >
            <Text
              style={[styles.tabText, tab === item && styles.tabTextActive]}
            >
              {item === 'devices'
                ? 'Devices'
                : item === 'tsc'
                  ? 'TSC label'
                  : 'ESC receipt'}
            </Text>
          </Pressable>
        ))}
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        {tab === 'devices' ? (
          <DevicesPanel
            busy={busy}
            devices={devices}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onEnable={() =>
              run('Enabling Bluetooth', async () => {
                const granted = await BluetoothManager.requestPermissions();
                if (!granted) {
                  throw new Error('Bluetooth permission denied');
                }
                const on = await BluetoothManager.enableBluetooth();
                setEnabled(on);
              })
            }
            onScan={() =>
              run('Scanning', async () => {
                const granted = await BluetoothManager.requestPermissions();
                if (!granted) {
                  throw new Error('Bluetooth permission denied');
                }
                setDevices([]);
                const result = await BluetoothManager.scanDevices(8000);
                setDevices(result.found);
                setEnabled(true);
              })
            }
            onConnect={() =>
              run('Connecting', async () => {
                if (!selected) {
                  throw new Error('Select a printer first');
                }
                await BluetoothManager.connect(selected.id);
                setConnected(true);
              })
            }
            onDisconnect={() =>
              run('Disconnecting', async () => {
                await BluetoothManager.disconnect();
                setConnected(false);
              })
            }
          />
        ) : null}

        {tab === 'tsc' ? (
          <TscPanel
            connected={connected}
            onPrint={() =>
              run('Printing TSC label', async () => {
                await TscPrinter.printLabel({
                  width: 40,
                  height: 30,
                  gap: 2,
                  text: [
                    {
                      text: 'Hello TSC',
                      x: 20,
                      y: 20,
                      fonttype: FONTTYPE.FONT_3,
                      xscal: 1,
                      yscal: 1,
                    },
                    {
                      text: 'Font 3 works',
                      x: 20,
                      y: 50,
                    },
                  ],
                  barcode: [
                    {
                      x: 20,
                      y: 90,
                      height: 40,
                      code: '1234567890',
                    },
                  ],
                  qrcode: [
                    {
                      x: 220,
                      y: 90,
                      width: 4,
                      code: 'https://github.com',
                    },
                  ],
                });
              })
            }
          />
        ) : null}

        {tab === 'esc' ? (
          <EscPanel
            connected={connected}
            onPrint={() =>
              run('Printing ESC receipt', async () => {
                await EscposPrinter.printerInit();
                await EscposPrinter.printerAlign(ALIGN.CENTER);
                await EscposPrinter.printText('My Store\n', {
                  widthtimes: 1,
                  heighttimes: 1,
                });
                await EscposPrinter.printText('Sales Receipt\n', {});
                await EscposPrinter.printerAlign(ALIGN.LEFT);
                await EscposPrinter.printColumn(
                  [16, 6, 10],
                  [ALIGN.LEFT, ALIGN.CENTER, ALIGN.RIGHT],
                  ['Product', 'Qty', 'Total']
                );
                await EscposPrinter.printColumn(
                  [16, 6, 10],
                  [ALIGN.LEFT, ALIGN.CENTER, ALIGN.RIGHT],
                  ['Coffee', '2', '6.00']
                );
                await EscposPrinter.printText('Thank you!\n\n', {});
                await EscposPrinter.printAndFeed(3);
              })
            }
          />
        ) : null}
      </ScrollView>

      <View style={styles.footer}>
        {busy ? <ActivityIndicator /> : null}
        <Text style={styles.status}>{status}</Text>
      </View>
    </SafeAreaView>
  );
}

function DevicesPanel({
  busy,
  devices,
  selectedId,
  onSelect,
  onEnable,
  onScan,
  onConnect,
  onDisconnect,
}: {
  busy: boolean;
  devices: PrinterDevice[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onEnable: () => void;
  onScan: () => void;
  onConnect: () => void;
  onDisconnect: () => void;
}) {
  return (
    <View>
      <View style={styles.row}>
        <Action
          label="Permissions / Enable"
          onPress={onEnable}
          disabled={busy}
        />
        <Action label="Scan" onPress={onScan} disabled={busy} />
      </View>
      <View style={styles.row}>
        <Action label="Connect" onPress={onConnect} disabled={busy} />
        <Action label="Disconnect" onPress={onDisconnect} disabled={busy} />
      </View>
      {devices.length === 0 ? (
        <Text style={styles.empty}>
          No printers yet. Scan to discover devices.
        </Text>
      ) : (
        devices.map((device) => (
          <Pressable
            key={device.id}
            onPress={() => onSelect(device.id)}
            style={[
              styles.device,
              selectedId === device.id && styles.deviceSelected,
            ]}
          >
            <Text style={styles.deviceName}>{device.name}</Text>
            <Text style={styles.deviceMeta}>
              {device.type.toUpperCase()} · {device.address}
            </Text>
          </Pressable>
        ))
      )}
    </View>
  );
}

function TscPanel({
  connected,
  onPrint,
}: {
  connected: boolean;
  onPrint: () => void;
}) {
  return (
    <View>
      <Text style={styles.panelTitle}>TSC / TSPL label</Text>
      <Text style={styles.copy}>
        This job uses built-in bitmap font "3" so Latin text prints on printers
        that do not have the TSS24.BF2 Chinese font file. Use a TSPL label
        printer, not an ESC/POS-only receipt printer.
      </Text>
      <Action
        label="Print sample label"
        onPress={onPrint}
        disabled={!connected}
      />
    </View>
  );
}

function EscPanel({
  connected,
  onPrint,
}: {
  connected: boolean;
  onPrint: () => void;
}) {
  return (
    <View>
      <Text style={styles.panelTitle}>ESC/POS receipt</Text>
      <Text style={styles.copy}>
        Sends a short receipt with columns. This path is for ESC/POS thermal
        printers.
      </Text>
      <Action
        label="Print sample receipt"
        onPress={onPrint}
        disabled={!connected}
      />
    </View>
  );
}

function Action({
  label,
  onPress,
  disabled,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={[styles.button, disabled && styles.buttonDisabled]}
    >
      <Text style={styles.buttonText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#f4f1ea',
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 8,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#1c1914',
  },
  subtitle: {
    marginTop: 8,
    fontSize: 14,
    lineHeight: 20,
    color: '#5c564c',
  },
  meta: {
    marginTop: 8,
    fontSize: 13,
    color: '#8a8276',
  },
  tabs: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 8,
  },
  tab: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: '#e7e1d6',
  },
  tabActive: {
    backgroundColor: '#1c1914',
  },
  tabText: {
    color: '#1c1914',
    fontWeight: '600',
  },
  tabTextActive: {
    color: '#f4f1ea',
  },
  body: {
    padding: 20,
    gap: 12,
  },
  row: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
  },
  button: {
    flex: 1,
    backgroundColor: '#c45c26',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  buttonDisabled: {
    opacity: 0.4,
  },
  buttonText: {
    color: '#fffaf3',
    fontWeight: '700',
  },
  device: {
    backgroundColor: '#fffaf3',
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#ddd4c5',
  },
  deviceSelected: {
    borderColor: '#c45c26',
    backgroundColor: '#f8e6d8',
  },
  deviceName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1c1914',
  },
  deviceMeta: {
    marginTop: 4,
    color: '#6f675c',
  },
  empty: {
    color: '#6f675c',
    marginTop: 8,
  },
  panelTitle: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 8,
    color: '#1c1914',
  },
  copy: {
    color: '#5c564c',
    lineHeight: 20,
    marginBottom: 16,
  },
  footer: {
    minHeight: 52,
    borderTopWidth: 1,
    borderTopColor: '#ddd4c5',
    paddingHorizontal: 20,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  status: {
    flex: 1,
    color: '#1c1914',
  },
});
