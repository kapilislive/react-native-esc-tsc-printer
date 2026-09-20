import { BluetoothManager } from './bluetooth/BluetoothManager';
import { EscposPrinter } from './escpos/EscposPrinter';
import {
  ALIGN,
  BARCODE_TEXT,
  BARCODETYPE as ESCPOS_BARCODETYPE,
  ERROR_CORRECTION,
  ROTATION as ESCPOS_ROTATION,
} from './escpos/constants';
import { TscPrinter } from './tsc/TscPrinter';
import {
  BARCODETYPE as TSC_BARCODETYPE,
  BITMAP_MODE,
  CODEPAGE,
  DENSITY,
  DIRECTION,
  EEC,
  FONTMUL,
  FONTTYPE,
  PRINT_SPEED,
  READABLE,
  ROTATION as TSC_ROTATION,
  TEAR,
} from './tsc/constants';
import { buildTsplScript, escapeTspl } from './tsc/commands';
import { buildColumnLine, buildText, padCell } from './escpos/commands';
export type {
  ConnectedDevice,
  PrintPicOptions,
  PrintTextOptions,
  PrinterDevice,
  TscBarcodeElement,
  TscImageElement,
  TscPrintLabelOptions,
  TscQrCodeElement,
  TscTextElement,
} from './types';

export {
  ALIGN,
  BARCODE_TEXT,
  BITMAP_MODE,
  BluetoothManager,
  CODEPAGE,
  DENSITY,
  DIRECTION,
  EEC,
  ERROR_CORRECTION,
  ESCPOS_BARCODETYPE,
  ESCPOS_ROTATION,
  EscposPrinter,
  FONTMUL,
  FONTTYPE,
  PRINT_SPEED,
  READABLE,
  TEAR,
  TSC_BARCODETYPE,
  TSC_ROTATION,
  TscPrinter,
  buildColumnLine,
  buildText,
  buildTsplScript,
  escapeTspl,
  padCell,
};

export const BluetoothTscPrinter = TscPrinter;
export const BluetoothEscposPrinter = EscposPrinter;
