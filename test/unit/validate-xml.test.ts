// MAGI
import { describe, it, expect } from 'vitest';
import { validateMusicXml } from '../../src/lib/validate/xml';

const scoreOpen = '<?xml version="1.0" encoding="UTF-8"?><score-partwise version="4.0">';
const scoreClose = '</score-partwise>';
const minimalScore = scoreOpen + '<part-list/><part id="P1"><measure number="1"/></part>' + scoreClose;

describe('validateMusicXml — 正常系', () => {
  it('最小限の MusicXML を受理する', () => {
    const r = validateMusicXml(minimalScore);
    expect(r.ok).toBe(true);
    expect(r.stats?.elementCount).toBeGreaterThan(0);
  });

  it('コメント・CDATA を含んでも受理する', () => {
    const xml = scoreOpen + '<!-- comment --><credit><![CDATA[<!DOCTYPE fake>]]></credit>' + scoreClose;
    const r = validateMusicXml(xml);
    expect(r.ok).toBe(true);
  });

  it('予約実体・数値文字参照を許可する', () => {
    const xml = scoreOpen + '<work><work-title>A &amp; B &#65; &#x42;</work-title></work>' + scoreClose;
    expect(validateMusicXml(xml).ok).toBe(true);
  });
});

describe('validateMusicXml — §6 拒否条件（AC-14）', () => {
  it('DOCTYPE 宣言を拒否する', () => {
    const xml = '<?xml version="1.0"?><!DOCTYPE score>' + scoreOpen + scoreClose;
    const r = validateMusicXml(xml);
    expect(r.ok).toBe(false);
    expect(r.issues[0].code).toBe('doctype-forbidden');
  });

  it('外部実体を伴う DOCTYPE を拒否する（XXE）', () => {
    const xml =
      '<?xml version="1.0"?><!DOCTYPE foo [<!ENTITY xxe SYSTEM "file:///etc/passwd">]>' +
      scoreOpen + '<work-title>&xxe;</work-title>' + scoreClose;
    expect(validateMusicXml(xml).issues[0].code).toBe('doctype-forbidden');
  });

  it('実体展開爆弾（billion laughs）を DOCTYPE 拒否で排除する', () => {
    const xml =
      '<!DOCTYPE lolz [<!ENTITY lol "lol"><!ENTITY lol2 "&lol;&lol;">]>' + scoreOpen + '&lol2;' + scoreClose;
    expect(validateMusicXml(xml).ok).toBe(false);
  });

  it('スタンドアロンの ENTITY 宣言を拒否する', () => {
    const xml = scoreOpen + '<!ENTITY x "y">' + scoreClose;
    const r = validateMusicXml(xml);
    expect(r.ok).toBe(false);
    expect(r.issues[0].code).toBe('entity-forbidden');
  });

  it('非対応の宣言符号化を拒否する', () => {
    const xml = '<?xml version="1.0" encoding="ISO-8859-1"?>' + scoreOpen + scoreClose;
    expect(validateMusicXml(xml).issues[0].code).toBe('encoding-mismatch');
  });

  it('サイズ上限超過を拒否する', () => {
    const big = minimalScore;
    const r = validateMusicXml(big, 10 * 1024 * 1024);
    expect(r.issues[0].code).toBe('too-large');
  });

  it('過大ネストを拒否する', () => {
    let xml = scoreOpen;
    for (let i = 0; i < 300; i++) xml += '<g>';
    for (let i = 0; i < 300; i++) xml += '</g>';
    xml += scoreClose;
    expect(validateMusicXml(xml).issues[0].code).toBe('too-deep');
  });

  it('整形式でない XML（タグ不一致）を拒否する', () => {
    const xml = scoreOpen + '<a></b>' + scoreClose;
    expect(validateMusicXml(xml).issues[0].code).toBe('not-well-formed');
  });

  it('裸の & を拒否する', () => {
    const xml = scoreOpen + '<t>A & B</t>' + scoreClose;
    expect(validateMusicXml(xml).issues[0].code).toBe('not-well-formed');
  });

  it('MusicXML の root が無ければ not-musicxml', () => {
    const xml = '<?xml version="1.0"?><foo><bar/></foo>';
    expect(validateMusicXml(xml).issues[0].code).toBe('not-musicxml');
  });

  it('属性値内の > を誤検出しない', () => {
    const xml = scoreOpen + '<note attr="a > b"></note>' + scoreClose;
    expect(validateMusicXml(xml).ok).toBe(true);
  });
});
// /MAGI
