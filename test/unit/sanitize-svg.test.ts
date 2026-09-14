// MAGI
// @vitest-environment jsdom
// DOMPurify は happy-dom を DOM 非対応と判定して素通しすることがあるため、
// より互換性の高い jsdom を使う（実ブラウザ挙動に近い）。
import { describe, it, expect } from 'vitest';
import { sanitizeSvg } from '../../src/lib/render/sanitizeSvg';

describe('sanitizeSvg — AC-16 表示テキストの無害化', () => {
  it('script 要素を除去する', () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script><g/></svg>';
    const out = sanitizeSvg(svg);
    expect(out).not.toContain('<script');
    expect(out).not.toContain('alert');
  });

  it('イベント属性(on*)を除去する', () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg"><rect onload="evil()" onclick="x()"/></svg>';
    const out = sanitizeSvg(svg);
    expect(out).not.toContain('onload');
    expect(out).not.toContain('onclick');
  });

  it('外部参照(href)を除去し内部フラグメント参照は残す', () => {
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">' +
      '<use xlink:href="#glyph-1"/><image href="https://evil.example/x.png"/></svg>';
    const out = sanitizeSvg(svg);
    expect(out).toContain('#glyph-1');
    expect(out).not.toContain('evil.example');
  });

  it('歌詞やコードシンボルのマークアップをテキスト化する', () => {
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg"><text>&lt;img src=x onerror=alert(1)&gt;</text></svg>';
    const out = sanitizeSvg(svg);
    // 実行可能な <img> 要素として復元されず、テキスト（エスケープ済み）のまま残る。
    expect(out).not.toContain('<img');
    expect(out).toContain('&lt;img');
  });

  it('通常の描画要素(path, g, text)は保持する', () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg"><g class="staff"><path d="M0 0 L10 10"/><text>C major</text></g></svg>';
    const out = sanitizeSvg(svg);
    expect(out).toContain('<path');
    expect(out).toContain('C major');
  });
});
// /MAGI
