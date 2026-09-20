export const ESC = 0x1b;
export const GS = 0x1d;
export const FS = 0x1c;
export const LF = 0x0a;
export const CR = 0x0d;

export const ALIGN = {
  LEFT: 0,
  CENTER: 1,
  RIGHT: 2,
} as const;

export const ERROR_CORRECTION = {
  L: 48,
  M: 49,
  Q: 50,
  H: 51,
} as const;

export const BARCODETYPE = {
  UPC_A: 65,
  UPC_E: 66,
  JAN13: 67,
  JAN8: 68,
  CODE39: 69,
  ITF: 70,
  CODABAR: 71,
  CODE93: 72,
  CODE128: 73,
} as const;

export const ROTATION = {
  OFF: 0,
  ON: 1,
} as const;

export const BARCODE_TEXT = {
  NONE: 0,
  ABOVE: 1,
  BELOW: 2,
  BOTH: 3,
} as const;

export const WIDTH_58 = 384;
export const WIDTH_80 = 576;
