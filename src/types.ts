export type PrinterTransport = 'spp' | 'ble';

export type PrinterDevice = {
  id: string;
  name: string;
  address: string;
  type: PrinterTransport;
};

export type TextEncoding = 'utf8' | 'gbk' | 'gb18030' | 'gb2312';

export type TscTextElement = {
  text: string;
  x: number;
  y: number;
  fonttype?: string;
  rotation?: number;
  xscal?: number;
  yscal?: number;
  bold?: boolean;
};

export type TscQrCodeElement = {
  x: number;
  y: number;
  width: number;
  level?: string;
  rotation?: number;
  code: string;
};

export type TscBarcodeElement = {
  x?: number;
  y?: number;
  type?: string;
  height?: number;
  wide?: number;
  narrow?: number;
  readable?: number;
  rotation?: number;
  code: string;
};

export type TscImageElement = {
  x: number;
  y: number;
  width: number;
  mode?: number;
  image: string;
};

export type TscReverseElement = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type TscPrintLabelOptions = {
  width: number;
  height: number;
  gap?: number;
  speed?: number;
  density?: number;
  direction?: number;
  reference?: [number, number];
  tear?: 'ON' | 'OFF';
  sound?: number;
  home?: number;
  codepage?: string | number;
  encoding?: TextEncoding;
  text?: TscTextElement[];
  qrcode?: TscQrCodeElement[];
  barcode?: TscBarcodeElement[];
  image?: TscImageElement[];
  reverse?: TscReverseElement[];
};

export type RasterizedImage = {
  x: number;
  y: number;
  mode: number;
  widthBytes: number;
  height: number;
  data: Uint8Array;
};

export type PrintTextOptions = {
  encoding?: TextEncoding;
  codepage?: number;
  widthtimes?: number;
  heigthtimes?: number;
  heighttimes?: number;
  fonttype?: number;
  cut?: boolean;
};

export type PrintPicOptions = {
  width?: number;
  left?: number;
  center?: boolean;
  autoCut?: boolean;
  paperSize?: number;
};

export type PrintQrOptions = {
  size?: number;
  errorCorrection?: number;
  align?: number;
};

export type ConnectedDevice = PrinterDevice & {
  connected: boolean;
};
