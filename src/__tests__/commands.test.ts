import { ALIGN } from '../escpos/constants';
import {
  buildColumnLine,
  buildQrCode,
  padCell,
  printerInit,
} from '../escpos/commands';
import { buildTsplJob, buildTsplScript, escapeTspl } from '../tsc/commands';
import { FONTTYPE } from '../tsc/constants';

describe('TSPL text commands', () => {
  it('uses built-in font 3 by default instead of TSS24.BF2', () => {
    const script = buildTsplScript({
      width: 40,
      height: 30,
      gap: 2,
      text: [{ text: 'Hello World', x: 20, y: 20 }],
    });

    expect(script).toContain('SIZE 40 mm,30 mm\r\n');
    expect(script).toContain('GAP 2 mm,0 mm\r\n');
    expect(script).toContain('CLS\r\n');
    expect(script).toContain('TEXT 20,20,"3",0,1,1,"Hello World"\r\n');
    expect(script).not.toContain('TSS24.BF2');
  });

  it('honors yscal independently from xscal', () => {
    const script = buildTsplScript({
      width: 40,
      height: 30,
      text: [{ text: 'Hi', x: 0, y: 8, xscal: 1, yscal: 2 }],
    });

    expect(script).toContain('TEXT 0,8,"3",0,1,2,"Hi"\r\n');
  });

  it('escapes quotes and backslashes in TSPL strings', () => {
    expect(escapeTspl('Say "hi" \\ ok')).toBe('Say \\"hi\\" \\\\ ok');

    const script = buildTsplScript({
      width: 40,
      height: 30,
      text: [{ text: 'Say "hi"', x: 10, y: 10 }],
    });

    expect(script).toContain('TEXT 10,10,"3",0,1,1,"Say \\"hi\\""\r\n');
  });

  it('only uses Chinese outline fonts when requested', () => {
    const script = buildTsplScript({
      width: 40,
      height: 30,
      text: [
        {
          text: '中文',
          x: 0,
          y: 0,
          fonttype: FONTTYPE.SIMPLIFIED_CHINESE,
        },
      ],
    });

    expect(script).toContain('TEXT 0,0,"TSS24.BF2",0,1,1,"中文"\r\n');
  });

  it('emits QR, barcode, reverse, then PRINT 1,1', async () => {
    const job = await buildTsplJob(
      {
        width: 40,
        height: 30,
        codepage: 1252,
        text: [{ text: 'Label', x: 20, y: 20 }],
        qrcode: [{ x: 20, y: 96, width: 3, code: 'hello' }],
        barcode: [{ x: 120, y: 96, code: '1234567890' }],
        reverse: [{ x: 0, y: 0, width: 10, height: 10 }],
        sound: 1,
      },
      [],
      (value) => new TextEncoder().encode(value)
    );

    const script = new TextDecoder().decode(job);
    expect(script).toContain('CODEPAGE 1252\r\n');
    expect(script).toContain('QRCODE 20,96,L,3,A,0,M2,S1,"hello"\r\n');
    expect(script).toContain(
      'BARCODE 120,96,"128",40,1,0,1,2,"1234567890"\r\n'
    );
    expect(script).toContain('REVERSE 0,0,10,10\r\n');
    expect(script.endsWith('SOUND 2,100\r\n')).toBe(true);
    expect(script).toContain('PRINT 1,1\r\n');
  });
});

describe('ESC/POS commands', () => {
  it('initializes the printer with ESC @', () => {
    expect(Array.from(printerInit())).toEqual([0x1b, 0x40]);
  });

  it('pads receipt columns', () => {
    expect(padCell('A', 4, ALIGN.LEFT)).toBe('A   ');
    expect(padCell('A', 4, ALIGN.RIGHT)).toBe('   A');
    expect(padCell('A', 4, ALIGN.CENTER)).toBe(' A  ');
    expect(
      buildColumnLine([5, 3], [ALIGN.LEFT, ALIGN.RIGHT], ['Item', '2'])
    ).toBe('Item   2');
  });

  it('builds a QR command envelope', () => {
    const bytes = Array.from(buildQrCode('A', 4));
    expect(bytes.slice(0, 3)).toEqual([0x1d, 0x28, 0x6b]);
    expect(bytes).toContain(65);
  });
});
