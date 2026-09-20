export {};

declare global {
  function btoa(data: string): string;
  function atob(data: string): string;

  class TextEncoder {
    encode(input?: string): Uint8Array;
  }

  class TextDecoder {
    decode(input?: ArrayBuffer | ArrayBufferView): string;
  }
}
