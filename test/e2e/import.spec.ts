// MAGI
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const representative = readFileSync(resolve(process.cwd(), 'test/fixtures/valid/representative.musicxml'), 'utf8');

test.describe('取り込み画面（第1段階 貼る→鳴る）', () => {
  test('ホームは Verovio を読み込まない（軽量性 / §15）', async ({ page }) => {
    const requested: string[] = [];
    page.on('request', (r) => requested.push(r.url()));
    await page.goto('/Musica/');
    await page.waitForLoadState('networkidle');
    expect(requested.some((u) => u.includes('verovio-module'))).toBe(false);
  });

  test('MusicXML を貼ると描画され確認再生 UI が出る（AC-07 / AC-18）', async ({ page }) => {
    await page.goto('/Musica/import/');
    await page.fill('#abc-input', representative);
    // Verovio 遅延ロード＋描画を待つ（Verovio は入れ子 SVG を出力するため first を見る）
    await expect(page.locator('.score svg').first()).toBeVisible({ timeout: 45_000 });
    // グリフ（use/path）が存在する（無害化後も保持）
    const glyphs = page.locator('.score use, .score path');
    expect(await glyphs.count()).toBeGreaterThan(0);
    // 形式バッジ
    await expect(page.locator('.pane.left .badge')).toContainText('MusicXML');
    // 確認再生コントロール
    await expect(page.locator('.playback')).toBeVisible();
    // ログインを求められない（第1段階）
    await expect(page.locator('text=ログイン')).toHaveCount(0);
  });

  test('DOCTYPE 入り XML は音楽の言葉で拒否される（AC-14 / §12）', async ({ page }) => {
    await page.goto('/Musica/import/');
    await page.fill('#abc-input', '<!DOCTYPE x><score-partwise version="4.0"><part-list/></score-partwise>');
    await expect(page.locator('.panel-block.error')).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('.panel-block.error')).toContainText('安全のため');
    await expect(page.locator('.score svg')).toHaveCount(0);
  });
});
// /MAGI
