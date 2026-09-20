import type { CodegenTypes, TurboModule } from 'react-native';
import { TurboModuleRegistry } from 'react-native';

export type NativeDevice = {
  id: string;
  name: string;
  address: string;
  type: string;
};

export type NativeEmptyEvent = {
  ok: boolean;
};

export type NativeRasterResult = {
  widthBytes: number;
  height: number;
  data: string;
};

export interface Spec extends TurboModule {
  isEnabled(): Promise<boolean>;
  requestPermissions(): Promise<boolean>;
  enableBluetooth(): Promise<boolean>;
  scan(timeoutMs: number): Promise<ReadonlyArray<NativeDevice>>;
  stopScan(): Promise<void>;
  connect(id: string): Promise<void>;
  disconnect(): Promise<void>;
  write(base64Data: string): Promise<void>;
  encode(text: string, encoding: string): Promise<string>;
  rasterizeMono(
    base64Image: string,
    targetWidth: number
  ): Promise<NativeRasterResult>;
  getConnectedDevice(): Promise<NativeDevice>;
  isConnected(): Promise<boolean>;

  readonly onDeviceFound: CodegenTypes.EventEmitter<NativeDevice>;
  readonly onScanDone: CodegenTypes.EventEmitter<NativeEmptyEvent>;
  readonly onConnected: CodegenTypes.EventEmitter<NativeDevice>;
  readonly onDisconnected: CodegenTypes.EventEmitter<NativeEmptyEvent>;
  readonly onConnectionLost: CodegenTypes.EventEmitter<NativeEmptyEvent>;
}

export default TurboModuleRegistry.getEnforcing<Spec>('EscTscPrinter');
