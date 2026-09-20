import type {
  RasterizedImage,
  TscPrintLabelOptions,
  TscTextElement,
} from '../types';
import { DEFAULT_TSC_FONT } from './constants';

export function escapeTspl(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function line(command: string): string {
  return `${command}\r\n`;
}

function clampMul(value: number | undefined, fallback = 1): number {
  if (value == null || Number.isNaN(value)) {
    return fallback;
  }
  return Math.min(10, Math.max(1, Math.round(value)));
}

function fontName(fonttype?: string): string {
  if (fonttype == null || fonttype === '') {
    return DEFAULT_TSC_FONT;
  }
  return fonttype;
}

function textCommand(element: TscTextElement): string {
  const xscal = clampMul(element.xscal);
  const yscal = clampMul(element.yscal, xscal);
  const rotation = element.rotation ?? 0;
  const font = fontName(element.fonttype);
  const escaped = escapeTspl(element.text);
  const command = line(
    `TEXT ${element.x},${element.y},"${font}",${rotation},${xscal},${yscal},"${escaped}"`
  );

  if (!element.bold) {
    return command;
  }

  return (
    command +
    line(
      `TEXT ${element.x + 1},${element.y},"${font}",${rotation},${xscal},${yscal},"${escaped}"`
    ) +
    line(
      `TEXT ${element.x},${element.y + 1},"${font}",${rotation},${xscal},${yscal},"${escaped}"`
    )
  );
}

export function buildTsplScript(options: TscPrintLabelOptions): string {
  if (options.width == null || options.height == null) {
    throw new Error('TSC printLabel requires width and height in millimeters');
  }

  let script = '';

  if (options.speed != null) {
    script += line(`SPEED ${options.speed}`);
  }
  if (options.density != null) {
    script += line(`DENSITY ${options.density}`);
  }

  script += line(`SIZE ${options.width} mm,${options.height} mm`);
  script += line(`GAP ${options.gap ?? 0} mm,0 mm`);
  script += line(`DIRECTION ${options.direction ?? 0}`);

  const [refX, refY] = options.reference ?? [0, 0];
  script += line(`REFERENCE ${refX},${refY}`);
  script += line(`SET TEAR ${options.tear ?? 'ON'}`);

  if (options.codepage != null) {
    script += line(`CODEPAGE ${options.codepage}`);
  }

  if (options.home === 1) {
    script += line('BACKFEED 16');
    script += line('HOME');
  }

  script += line('CLS');

  for (const element of options.text ?? []) {
    script += textCommand(element);
  }

  for (const qr of options.qrcode ?? []) {
    const level = qr.level ?? 'L';
    const rotation = qr.rotation ?? 0;
    script += line(
      `QRCODE ${qr.x},${qr.y},${level},${qr.width},A,${rotation},M2,S1,"${escapeTspl(qr.code)}"`
    );
  }

  for (const barcode of options.barcode ?? []) {
    const x = barcode.x ?? 0;
    const y = barcode.y ?? 0;
    const type = barcode.type ?? '128';
    const height = barcode.height ?? 40;
    const readable = barcode.readable ?? 1;
    const rotation = barcode.rotation ?? 0;
    const narrow = barcode.narrow ?? 1;
    const wide = barcode.wide ?? 2;
    script += line(
      `BARCODE ${x},${y},"${type}",${height},${readable},${rotation},${narrow},${wide},"${escapeTspl(barcode.code)}"`
    );
  }

  for (const area of options.reverse ?? []) {
    script += line(`REVERSE ${area.x},${area.y},${area.width},${area.height}`);
  }

  return script;
}

export function bitmapHeader(
  x: number,
  y: number,
  widthBytes: number,
  height: number,
  mode: number
): string {
  return `BITMAP ${x},${y},${widthBytes},${height},${mode},`;
}

export async function buildTsplJob(
  options: TscPrintLabelOptions,
  images: RasterizedImage[],
  encodeText: (value: string) => Uint8Array | Promise<Uint8Array>
): Promise<Uint8Array> {
  const parts: Uint8Array[] = [await encodeText(buildTsplScript(options))];

  for (const image of images) {
    parts.push(
      await encodeText(
        bitmapHeader(
          image.x,
          image.y,
          image.widthBytes,
          image.height,
          image.mode
        )
      )
    );
    parts.push(image.data);
    parts.push(await encodeText('\r\n'));
  }

  parts.push(await encodeText('PRINT 1,1\r\n'));
  if (options.sound === 1) {
    parts.push(await encodeText('SOUND 2,100\r\n'));
  }

  const length = parts.reduce((sum, part) => sum + part.length, 0);
  const output = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }
  return output;
}
