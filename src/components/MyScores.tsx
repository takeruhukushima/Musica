// MAGI
/**
 * マイ楽譜（§12 / 第2段階 コア: 自作品の閲覧・更新・削除）。
 *
 * - 本人の公開作品を一覧表示する（要約フィールドのみで表示 / §15）。
 * - 「原本を表示」で source blob を取得し、その場で描画する（描画エンジンは操作時にロード）。
 * - 「編集」は editSource（ABC）優先で取り込み画面へ渡し、更新公開へ繋ぐ（§5）。
 * - 「削除」は本人のレコードのみ。表示・キャッシュの失効は一覧再取得で反映（§5）。
 * - 未ログイン時はログインを促す。他人の作品は上書き・削除できない（§4）。
 */
import { useEffect, useState } from 'preact/hooks';
import { useAuth } from '../lib/atproto/useAuth';
import { listScores, deleteScore, fetchBlobText, getScore, type ScoreListItem } from '../lib/atproto/records';
import { setEditHandoff } from '../lib/editHandoff';
import type { ScoreRecord } from '../lib/atproto/lexicon';

const importHref = `${import.meta.env.BASE_URL.replace(/\/$/, '')}/import/`;

export function MyScores() {
  const auth = useAuth();
  const [items, setItems] = useState<ScoreListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [busyRkey, setBusyRkey] = useState('');
  const [renderFor, setRenderFor] = useState<string>('');
  const [renderHtml, setRenderHtml] = useState<string>('');

  async function refresh() {
    if (auth.status !== 'signedIn' || !auth.agent || !auth.did) return;
    setLoading(true);
    setError('');
    try {
      const { items } = await listScores(auth.agent, auth.did);
      setItems(items);
    } catch (e) {
      setError(`一覧を取得できませんでした: ${(e as Error).message}`);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (auth.status === 'signedIn') void refresh();
    if (auth.status === 'signedOut') setItems([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth.status, auth.did]);

  async function onDelete(item: ScoreListItem) {
    if (!auth.agent) return;
    if (!confirm(`「${item.value.title}」を削除します。よろしいですか？`)) return;
    setBusyRkey(item.rkey);
    try {
      await deleteScore(auth.agent, item.rkey, item.cid);
      setItems((xs) => xs.filter((x) => x.rkey !== item.rkey));
      if (renderFor === item.rkey) {
        setRenderFor('');
        setRenderHtml('');
      }
    } catch (e) {
      alert(`削除に失敗しました: ${(e as Error).message}`);
    } finally {
      setBusyRkey('');
    }
  }

  async function onEdit(item: ScoreListItem) {
    if (!auth.agent || !auth.did) return;
    setBusyRkey(item.rkey);
    try {
      // 最新の CID を取り直して競合検出の基準にする（§9）。
      const fresh = await getScore(auth.agent, auth.did, item.rkey);
      const rec = fresh.value;
      // 更新は editSource 起点（§5）。ABC があれば ABC を、無ければ原本 MusicXML を編集対象に。
      const useEdit = rec.editFormat === 'abc' && rec.editSource;
      const blob = useEdit ? rec.editSource! : rec.source;
      const editorText = await fetchBlobText(auth.agent, auth.did, blob);
      setEditHandoff({
        target: { did: auth.did, rkey: item.rkey, cid: fresh.cid },
        meta: metaOf(rec),
        editorText,
        createdAt: rec.createdAt,
      });
      window.location.href = importHref;
    } catch (e) {
      alert(`編集用の取り込みに失敗しました: ${(e as Error).message}`);
      setBusyRkey('');
    }
  }

  async function onView(item: ScoreListItem) {
    if (!auth.agent || !auth.did) return;
    if (renderFor === item.rkey) {
      setRenderFor('');
      setRenderHtml('');
      return;
    }
    setBusyRkey(item.rkey);
    setError('');
    try {
      const xml = await fetchBlobText(auth.agent, auth.did, item.value.source);
      const { renderScore } = await import('../lib/render/verovio');
      const { result, render } = await renderScore(xml);
      if (!result.ok || !render) {
        alert('この作品を描画できませんでした。');
        return;
      }
      setRenderFor(item.rkey);
      setRenderHtml(render.pages.join('\n'));
    } catch (e) {
      alert(`原本の取得に失敗しました: ${(e as Error).message}`);
    } finally {
      setBusyRkey('');
    }
  }

  if (auth.status === 'loading') return <p class="muted">認証確認中…</p>;
  if (auth.status !== 'signedIn') {
    return (
      <p class="muted">
        マイ楽譜を表示するには、ヘッダからログインしてください。ログインなしでも
        <a href={importHref}>取り込み画面</a>で貼り付け・描画・確認再生は使えます。
      </p>
    );
  }

  return (
    <div class="myscores">
      <div class="myscores-head">
        <p class="muted small">@{auth.handle ?? auth.did} の公開作品</p>
        <button class="btn small" type="button" onClick={() => void refresh()} disabled={loading}>
          {loading ? '取得中…' : '再読み込み'}
        </button>
      </div>
      {error && <p class="publish-msg error" role="alert">{error}</p>}
      {!loading && items.length === 0 && (
        <p class="muted">まだ公開作品がありません。<a href={importHref}>取り込み画面</a>から公開できます。</p>
      )}
      <ul class="score-list">
        {items.map((item) => (
          <li key={item.rkey} class="score-item">
            <div class="score-item-main">
              <strong>{item.value.title || '（無題）'}</strong>
              <span class="muted small">
                {summaryLine(item.value)} · 更新 {formatDate(item.value.updatedAt)}
              </span>
            </div>
            <div class="score-item-actions">
              <button class="btn small" type="button" disabled={busyRkey === item.rkey} onClick={() => void onView(item)}>
                {renderFor === item.rkey ? '閉じる' : '原本を表示'}
              </button>
              <button class="btn small" type="button" disabled={busyRkey === item.rkey} onClick={() => void onEdit(item)}>
                編集
              </button>
              <button class="btn small danger" type="button" disabled={busyRkey === item.rkey} onClick={() => void onDelete(item)}>
                削除
              </button>
            </div>
            {renderFor === item.rkey && (
              <div class="score-scroll inline-score">
                <div class="score" dangerouslySetInnerHTML={{ __html: renderHtml }} aria-label={`${item.value.title} の譜面`} />
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function metaOf(rec: ScoreRecord) {
  return {
    title: rec.title,
    description: rec.description,
    composer: rec.composer,
    arranger: rec.arranger,
    lyricist: rec.lyricist,
    tags: rec.tags,
    rights: rec.rights,
  };
}

function summaryLine(rec: ScoreRecord): string {
  const parts = rec.parts?.length ? `${rec.parts.length}パート` : '';
  const dur = rec.durationSec ? `${Math.round(rec.durationSec)}秒` : '';
  const fmt = rec.editFormat === 'abc' ? 'ABC由来' : 'MusicXML';
  return [fmt, parts, dur].filter(Boolean).join(' · ');
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString('ja-JP', { dateStyle: 'medium', timeStyle: 'short' });
  } catch {
    return iso;
  }
}
// /MAGI
