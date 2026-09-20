import NativeEscTscPrinter from '../NativeEscTscPrinter';
import { base64ToBytes } from '../encoding';
import { encodeText, writeBytes } from '../transport';
import type { RasterizedImage, TscPrintLabelOptions } from '../types';
import { buildTsplJob } from './commands';
import {
  BARCODETYPE,
  BITMAP_MODE,
  CODEPAGE,
  DENSITY,
  DIRECTION,
  EEC,
  FONTMUL,
  FONTTYPE,
  PRINT_SPEED,
  READABLE,
  ROTATION,
  TEAR,
} from './constants';

async function rasterizeImages(
  options: TscPrintLabelOptions
): Promise<RasterizedImage[]> {
  const images: RasterizedImage[] = [];
  for (const image of options.image ?? []) {
    const raster = await NativeEscTscPrinter.rasterizeMono(
      image.image,
      image.width
    );
    images.push({
      x: image.x,
      y: image.y,
      mode: image.mode ?? BITMAP_MODE.OVERWRITE,
      widthBytes: raster.widthBytes,
      height: raster.height,
      data: base64ToBytes(raster.data),
    });
  }
  return images;
}

export const TscPrinter = {
  DIRECTION,
  DENSITY,
  BARCODETYPE,
  FONTTYPE,
  EEC,
  ROTATION,
  FONTMUL,
  BITMAP_MODE,
  PRINT_SPEED,
  TEAR,
  READABLE,
  CODEPAGE,

  async printLabel(options: TscPrintLabelOptions): Promise<void> {
    const encoding = options.encoding ?? 'utf8';
    const images = await rasterizeImages(options);
    const job = await buildTsplJob(
      {
        ...options,
        codepage: options.codepage ?? CODEPAGE.WPC1252,
      },
      images,
      (value) => encodeText(value, encoding)
    );
    await writeBytes(job);
  },
};
