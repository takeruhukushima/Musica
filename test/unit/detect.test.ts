// MAGI
import { describe, it, expect } from 'vitest';
import { detectText, detectBytes } from '../../src/lib/detect';

describe('detectText', () => {
  it('MusicXML の score-partwise を判別', () => {
    const xml = '<?xml version="1.0"?><score-partwise version="4.0"></score-partwise>';
    expect(detectText(xml).format).toBe('musicxml');
  });

  it('BOM と先頭空白を無視して XML を判別', () => {
    const xml = '﻿\n  <?xml version="1.0"?><score-partwise/>';
    expect(detectText(xml).format).toBe('musicxml');
  });

  it('ABC の情報フィールドを判別', () => {
    const abc = 'X:1\nT:Test\nM:4/4\nL:1/8\nK:C\nCDEF|';
    expect(detectText(abc).format).toBe('abc');
  });

  it('空入力は unknown', () => {
    expect(detectText('   ').format).toBe('unknown');
  });

  it('無関係なテキストは unknown', () => {
    expect(detectText('hello world').format).toBe('unknown');
  });
});

describe('detectBytes', () => {
  it('ZIP マジックバイトを .mxl と判別', () => {
    const zip = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0, 0, 0, 0]);
    expect(detectBytes(zip).format).toBe('mxl');
  });

  it('UTF-8 テキストのバイト列を判別', () => {
    const bytes = new TextEncoder().encode('X:1\nK:C\nCDEF|');
    expect(detectBytes(bytes).format).toBe('abc');
  });
});
// /MAGI
