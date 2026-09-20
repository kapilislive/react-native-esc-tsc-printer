# react-native-esc-tsc-printer

React Native Bluetooth library for **ESC/POS receipt printers** and **TSC/TSPL label printers**. Command bytes are built in TypeScript. Native code only handles Bluetooth transport and image rasterization.

| Platform | Transport | Typical cheap ESC/TSC printers |
| --- | --- | --- |
| Android | Classic Bluetooth SPP | Supported |
| iOS | Bluetooth Low Energy (chunked writes) | Not visible unless the printer also exposes BLE |

## Why TSC text actually prints

Older libraries defaulted TSPL `TEXT` to font `TSS24.BF2`. That Chinese outline font is often missing on clone printers, so barcodes and QR codes printed while text stayed blank. This library defaults to built-in bitmap font `"3"` (`FONTTYPE.FONT_3`), escapes quotes in TSPL strings, honors `yscal` separately from `xscal`, and emits `CODEPAGE 1252` unless you override it.

```ts
import {
  BluetoothManager,
  FONTTYPE,
  TscPrinter,
} from 'react-native-esc-tsc-printer';

await BluetoothManager.requestPermissions();
await BluetoothManager.enableBluetooth();
const { found } = await BluetoothManager.scanDevices();
await BluetoothManager.connect(found[0].id);

await TscPrinter.printLabel({
  width: 40,
  height: 30,
  gap: 2,
  text: [{ text: 'Hello TSC', x: 20, y: 20, fonttype: FONTTYPE.FONT_3 }],
});
```

Use `FONTTYPE.SIMPLIFIED_CHINESE` (`TSS24.BF2`) only when that font is installed on the printer.

Do not send TSPL to an ESC/POS-only receipt printer. The printer will print the words `SIZE`, `GAP`, and `TEXT` as receipt text.

`BluetoothTscPrinter` and `BluetoothEscposPrinter` are aliases for `TscPrinter` and `EscposPrinter`.

## Installation

```sh
npm install react-native-esc-tsc-printer
# or
yarn add react-native-esc-tsc-printer
```

React Native autolinking covers Android and iOS. Add Bluetooth usage copy on iOS if your host app does not already have it:

```xml
<key>NSBluetoothAlwaysUsageDescription</key>
<string>Bluetooth is used to connect to ESC/POS and TSC label printers.</string>
```

Android 12+ needs `BLUETOOTH_SCAN` and `BLUETOOTH_CONNECT`. The library manifest already declares them; call `BluetoothManager.requestPermissions()` at runtime.

## BluetoothManager

```ts
await BluetoothManager.isBluetoothEnabled();
await BluetoothManager.requestPermissions();
await BluetoothManager.enableBluetooth(); // Android prompt; iOS returns current power state
await BluetoothManager.scanDevices(8000);
await BluetoothManager.stopScan();
await BluetoothManager.connect(device.id);
await BluetoothManager.getConnectedDevice();
await BluetoothManager.isDeviceConnected();
await BluetoothManager.disconnect();

BluetoothManager.onDeviceFound((device) => {});
BluetoothManager.onScanDone(() => {});
BluetoothManager.onConnected((device) => {});
BluetoothManager.onDisconnected(() => {});
BluetoothManager.onConnectionLost(() => {});
```

`device.type` is `'spp'` on Android and `'ble'` on iOS. Event subscriptions have a `.remove()` method.

## TscPrinter (labels)

`printLabel` builds one TSPL job: `SIZE` / `GAP` / `DIRECTION` / `CODEPAGE` / `CLS` / elements / `PRINT 1,1`.

```ts
await TscPrinter.printLabel({
  width: 40,
  height: 30,
  gap: 2,
  codepage: TscPrinter.CODEPAGE.WPC1252,
  text: [
    { text: 'Hello TSC', x: 20, y: 20, xscal: 1, yscal: 1 },
  ],
  barcode: [{ x: 20, y: 90, code: '1234567890' }],
  qrcode: [{ x: 220, y: 90, width: 4, code: 'https://example.com' }],
  image: [{ x: 0, y: 0, width: 200, image: base64Png }],
});
```

Optional fields: `speed`, `density`, `direction`, `reference`, `tear`, `sound`, `home`, `encoding` (`utf8` default, or `gbk` / `gb18030` for older Chinese firmware).

## EscposPrinter (receipts)

```ts
await EscposPrinter.printerInit();
await EscposPrinter.printerAlign(EscposPrinter.ALIGN.CENTER);
await EscposPrinter.printText('My Store\n', { widthtimes: 1, heighttimes: 1 });
await EscposPrinter.printColumn(
  [16, 6, 10],
  [EscposPrinter.ALIGN.LEFT, EscposPrinter.ALIGN.CENTER, EscposPrinter.ALIGN.RIGHT],
  ['Coffee', '2', '6.00']
);
await EscposPrinter.printQRCode('https://example.com', 6);
await EscposPrinter.cutPaper();
```

Images: `printPic(base64, { width: 384, center: true, paperSize: 58, autoCut: true })`.

## Testing locally

Bluetooth printers need a **physical device**. The iOS Simulator and Android Emulator cannot talk to a real ESC/TSC printer.

### Prerequisites

- Node.js `22+` (example app requires `>= 22.11.0`)
- [Yarn 4](https://yarnpkg.com/) via Corepack (`corepack enable`)
- Android Studio + a phone with Bluetooth (API 24+)
- For iOS: Xcode, CocoaPods, and a physical iPhone (BLE printers only)

```sh
corepack enable
yarn
```

Use Yarn from the repo root. This is a Yarn workspaces monorepo; do not install with npm.

### Unit tests (no printer)

These cover TSPL/ESC command generation, including the TSC font-3 text path:

```sh
yarn test
yarn typecheck
yarn lint
```

### Example app (real printer)

The [`example/`](example/) app already depends on this repo’s local sources. JavaScript changes show up after Metro refresh. Native (Kotlin / Objective-C) changes need a rebuild.

**Android (Classic Bluetooth SPP — this is what most cheap ESC/TSC printers use)**

1. Enable USB debugging and connect the phone.
2. Pair the printer in Android Bluetooth settings first (optional but helps).
3. From the repo root:

```sh
yarn example start
```

In a second terminal:

```sh
yarn example android
```

**iOS (BLE only)**

Classic SPP printers will not appear. Use a dual-mode or BLE printer, or test Android instead.

```sh
cd example
bundle install
bundle exec pod install --project-directory=ios
cd ..
yarn example ios
```

Run on a device, not the simulator: in Xcode open `example/ios/EscTscPrinterExample.xcworkspace`, pick your iPhone, then Run.

### What to do in the example UI

1. **Devices** tab → **Permissions / Enable** → allow Bluetooth (and nearby devices on Android 12+).
2. **Scan** → select the printer → **Connect**.
3. **TSC label** tab → **Print sample label** on a TSPL label printer. You should see the words `Hello TSC` and `Font 3 works`, plus a barcode and QR. Blank text with a printed barcode still means the printer does not have `TSS24.BF2`; this demo uses font `3` so Latin text should print.
4. **ESC receipt** tab → **Print sample receipt** on an ESC/POS receipt printer.

Do not send TSC jobs to an ESC/POS-only printer (you will see `SIZE` / `GAP` / `TEXT` printed as receipt text). Do not send ESC jobs to a TSPL-only label printer.

### Use this package from another local app

In that app’s `package.json`:

```json
{
  "dependencies": {
    "react-native-esc-tsc-printer": "file:../react-native-esc-tsc-printer"
  }
}
```

Then install and rebuild the native app (`npx pod-install` on iOS). Point the path at this repo. Autolinking picks up `android/` and `ios/`. Call `BluetoothManager.requestPermissions()` before scanning.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

MIT
