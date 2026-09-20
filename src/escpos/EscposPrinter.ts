import NativeEscTscPrinter from '../NativeEscTscPrinter';
import { base64ToBytes, concatBytes, encodeUtf8 } from '../encoding';
import { encodeText, writeBytes } from '../transport';
import type { PrintPicOptions, PrintTextOptions } from '../types';
import {
  buildBarCode,
  buildColumnLine,
  buildQrCode,
  buildRasterImage,
  buildText,
  cutPaper,
  openDrawer,
  printAndFeed,
  printerAlign,
  printerInit,
  printerLeftSpace,
  printerLineSpace,
  printerUnderline,
  selectCodePage,
} from './commands';
import {
  ALIGN,
  BARCODE_TEXT,
  BARCODETYPE,
  ERROR_CORRECTION,
  ROTATION,
  WIDTH_58,
  WIDTH_80,
} from './constants';

async function send(...parts: Uint8Array[]): Promise<void> {
  await writeBytes(concatBytes(...parts));
}

export const EscposPrinter = {
  ALIGN,
  BARCODETYPE,
  ERROR_CORRECTION,
  ROTATION,
  BARCODE_TEXT,
  width58: WIDTH_58,
  width80: WIDTH_80,

  printerInit(): Promise<void> {
    return send(printerInit());
  },

  printerAlign(align: number): Promise<void> {
    return send(printerAlign(align));
  },

  printerLeftSpace(dots: number): Promise<void> {
    return send(printerLeftSpace(dots));
  },

  printerLineSpace(dots: number): Promise<void> {
    return send(printerLineSpace(dots));
  },

  printerUnderLine(line: number): Promise<void> {
    return send(printerUnderline(line));
  },

  async printText(text: string, options: PrintTextOptions = {}): Promise<void> {
    const encoding = options.encoding ?? 'utf8';
    const encoded = await encodeText(text, encoding);
    const commands: Uint8Array[] = [];
    if (options.codepage != null) {
      commands.push(selectCodePage(options.codepage));
    }
    commands.push(buildText(text, encoded, options));
    await send(...commands);
  },

  async printColumn(
    widths: number[],
    aligns: number[],
    cells: string[],
    options: PrintTextOptions = {}
  ): Promise<void> {
    const line = `${buildColumnLine(widths, aligns, cells)}\n`;
    await this.printText(line, options);
  },

  async printPic(
    base64Image: string,
    options: PrintPicOptions = {}
  ): Promise<void> {
    const paperSize = options.paperSize === 80 ? WIDTH_80 : WIDTH_58;
    const width = options.width ?? paperSize;
    const raster = await NativeEscTscPrinter.rasterizeMono(base64Image, width);
    const data = base64ToBytes(raster.data);
    const commands: Uint8Array[] = [];

    if (options.center) {
      commands.push(printerAlign(ALIGN.CENTER));
    } else if ((options.left ?? 0) > 0) {
      commands.push(printerLeftSpace(options.left ?? 0));
    }

    commands.push(buildRasterImage(raster.widthBytes, raster.height, data));

    if (options.autoCut !== false) {
      commands.push(printAndFeed(3), cutPaper());
    }

    await send(...commands);
  },

  printQRCode(
    content: string,
    size = 6,
    align: number = ALIGN.CENTER,
    errorCorrection: number = ERROR_CORRECTION.L
  ): Promise<void> {
    return send(
      printerAlign(align),
      buildQrCode(content, size, errorCorrection),
      bytesFromLf()
    );
  },

  printBarCode(
    content: string,
    symbology: number = BARCODETYPE.CODE128,
    width = 3,
    height = 80,
    align: number = ALIGN.CENTER,
    textPosition: number = BARCODE_TEXT.BELOW
  ): Promise<void> {
    return send(
      printerAlign(align),
      buildBarCode(content, symbology, width, height, textPosition),
      bytesFromLf()
    );
  },

  cutPaper(): Promise<void> {
    return send(cutPaper());
  },

  cutOnePoint(): Promise<void> {
    return send(cutPaper(true));
  },

  openDrawer(pin = 0, onTime = 250, offTime = 250): Promise<void> {
    return send(openDrawer(pin, onTime, offTime));
  },

  printAndFeed(lines = 1): Promise<void> {
    return send(printAndFeed(lines));
  },
};

function bytesFromLf(): Uint8Array {
  return encodeUtf8('\n');
}
