import NativeEscTscPrinter from './NativeEscTscPrinter';
import { bytesToBase64 } from './encoding';

export async function writeBytes(bytes: Uint8Array): Promise<void> {
  await NativeEscTscPrinter.write(bytesToBase64(bytes));
}

export async function encodeText(
  text: string,
  encoding = 'utf8'
): Promise<Uint8Array> {
  const normalized = encoding.toLowerCase().replace('-', '');
  if (normalized === 'utf8') {
    return new TextEncoder().encode(text);
  }
  const encoded = await NativeEscTscPrinter.encode(text, encoding);
  const binary = atob(encoded);
  const output = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    output[index] = binary.charCodeAt(index);
  }
  return output;
}
