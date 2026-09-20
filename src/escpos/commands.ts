import { bytesFromNumbers, concatBytes, encodeUtf8 } from '../encoding';
import type { PrintTextOptions } from '../types';
import {
  ALIGN,
  BARCODE_TEXT,
  BARCODETYPE,
  ERROR_CORRECTION,
  ESC,
  GS,
  LF,
} from './constants';

export function printerInit(): Uint8Array {
  return bytesFromNumbers([ESC, 0x40]);
}

export function printerAlign(align: number): Uint8Array {
  return bytesFromNumbers([ESC, 0x61, align & 0xff]);
}

export function printerLeftSpace(dots: number): Uint8Array {
  return bytesFromNumbers([ESC, 0x24, dots & 0xff, (dots >> 8) & 0xff]);
}

export function printerLineSpace(dots: number): Uint8Array {
  return bytesFromNumbers([ESC, 0x33, dots & 0xff]);
}

export function printerUnderline(line: number): Uint8Array {
  return bytesFromNumbers([ESC, 0x2d, line & 0xff]);
}

export function setBold(enabled: boolean): Uint8Array {
  return bytesFromNumbers([ESC, 0x45, enabled ? 1 : 0]);
}

export function setCharacterSize(
  widthTimes: number,
  heightTimes: number
): Uint8Array {
  const width = Math.min(7, Math.max(0, widthTimes));
  const height = Math.min(7, Math.max(0, heightTimes));
  return bytesFromNumbers([GS, 0x21, (width << 4) | height]);
}

export function selectCodePage(page: number): Uint8Array {
  return bytesFromNumbers([ESC, 0x74, page & 0xff]);
}

export function cutPaper(partial = false): Uint8Array {
  if (partial) {
    return bytesFromNumbers([GS, 0x56, 66, 0]);
  }
  return bytesFromNumbers([GS, 0x56, 0]);
}

export function openDrawer(pin = 0, onTime = 250, offTime = 250): Uint8Array {
  const t1 = Math.min(255, Math.max(0, Math.round(onTime / 2)));
  const t2 = Math.min(255, Math.max(0, Math.round(offTime / 2)));
  return bytesFromNumbers([ESC, 0x70, pin & 0x01, t1, t2]);
}

export function printAndFeed(lines: number): Uint8Array {
  return bytesFromNumbers([ESC, 0x64, lines & 0xff]);
}

export function buildText(
  text: string,
  encoded: Uint8Array,
  options: PrintTextOptions = {}
): Uint8Array {
  const widthTimes = options.widthtimes ?? 0;
  const heightTimes = options.heighttimes ?? options.heigthtimes ?? 0;
  const parts = [
    setCharacterSize(widthTimes, heightTimes),
    encoded,
    text.endsWith('\n') ? new Uint8Array() : bytesFromNumbers([LF]),
  ];
  if (options.cut) {
    parts.push(printAndFeed(3), cutPaper());
  }
  return concatBytes(...parts.filter((part) => part.length > 0));
}

export function padCell(value: string, width: number, align: number): string {
  const text = value.length > width ? value.slice(0, width) : value;
  const pad = width - text.length;
  if (align === ALIGN.CENTER) {
    const left = Math.floor(pad / 2);
    return `${' '.repeat(left)}${text}${' '.repeat(pad - left)}`;
  }
  if (align === ALIGN.RIGHT) {
    return `${' '.repeat(pad)}${text}`;
  }
  return `${text}${' '.repeat(pad)}`;
}

export function buildColumnLine(
  widths: number[],
  aligns: number[],
  cells: string[]
): string {
  if (widths.length !== aligns.length || widths.length !== cells.length) {
    throw new Error('printColumn widths, aligns, and cells must match');
  }
  return widths
    .map((width, index) =>
      padCell(cells[index] ?? '', width, aligns[index] ?? ALIGN.LEFT)
    )
    .join('');
}

export function buildQrCode(
  content: string,
  size = 6,
  errorCorrection: number = ERROR_CORRECTION.L
): Uint8Array {
  const data = encodeUtf8(content);
  const storeLen = data.length + 3;
  const pL = storeLen & 0xff;
  const pH = (storeLen >> 8) & 0xff;
  const moduleSize = Math.min(16, Math.max(1, size));

  return concatBytes(
    bytesFromNumbers([GS, 0x28, 0x6b, 4, 0, 49, 65, 50, 0]),
    bytesFromNumbers([GS, 0x28, 0x6b, 3, 0, 49, 67, moduleSize]),
    bytesFromNumbers([GS, 0x28, 0x6b, 3, 0, 49, 69, errorCorrection]),
    bytesFromNumbers([GS, 0x28, 0x6b, pL, pH, 49, 80, 48]),
    data,
    bytesFromNumbers([GS, 0x28, 0x6b, 3, 0, 49, 81, 48])
  );
}

export function buildBarCode(
  content: string,
  symbology: number = BARCODETYPE.CODE128,
  width = 3,
  height = 80,
  textPosition: number = BARCODE_TEXT.BELOW
): Uint8Array {
  const data = encodeUtf8(content);
  return concatBytes(
    bytesFromNumbers([GS, 0x77, Math.min(6, Math.max(2, width))]),
    bytesFromNumbers([GS, 0x68, Math.min(255, Math.max(1, height))]),
    bytesFromNumbers([GS, 0x48, textPosition & 0x03]),
    bytesFromNumbers([GS, 0x6b, symbology, data.length]),
    data
  );
}

export function buildRasterImage(
  widthBytes: number,
  height: number,
  data: Uint8Array
): Uint8Array {
  return concatBytes(
    bytesFromNumbers([
      GS,
      0x76,
      0x30,
      0,
      widthBytes & 0xff,
      (widthBytes >> 8) & 0xff,
      height & 0xff,
      (height >> 8) & 0xff,
    ]),
    data
  );
}
