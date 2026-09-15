// MAGI
/**
 * 公開パネル（§5 公開手順 / §9 / §12）。
 *
 * - 取り込み済みの原本（MusicXML）と作品情報を、本人 PDS へ blob + レコードとして保存する。
 * - ログインは公開操作でのみ必要（AC-18）。未ログイン時は下書き保存のみ可能。
 * - target がある場合は更新公開（swapRecord による競合検出 / AC-20）。
 * - editSource（ABC 原文）があれば同時に blob 保存する（§9）。
 */
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { useAuth } from '../lib/atproto/useAuth';
import { validateMeta, scoreUri, type ScoreMeta } from '../lib/atproto/lexicon';
import { publishScore, updateScore, ConflictError, type PublishInput } from '../lib/atproto/records';
import { saveDraft } from '../lib/drafts';
import type { EditHandoff } from '../lib/editHandoff';

export interface PublishContent {
  musicXml: string;
  editSourceText?: string;
  editFormat?: 'abc';
  durationSec?: number;
}

interface Props {
  content: PublishContent | null;
  target?: EditHandoff['target'] | null;
  initialMeta?: ScoreMeta;
  createdAt?: string;
}

type Phase = 'idle' | 'publishing' | 'done' | 'error';

export function PublishPanel({ content, target, initialMeta, createdAt }: Props) {
  const auth = useAuth();
  const [meta, setMeta] = useState<ScoreMeta>(initialMeta ?? { title: '' });
  const [tagsText, setTagsText] = useState((initialMeta?.tags ?? []).join(', '));
  const [phase, setPhase] = useState<Phase>('idle');
  const [message, setMessage] = useState('');
  const [resultUri, setResultUri] = useState('');
  // ユーザーが一度でもフォームを触ったら、取り込み内容からの自動プレフィルで上書きしない。
  const touched = useRef(false);

  const initialKey = JSON.stringify(initialMeta ?? null);
  useEffect(() => {
    if (touched.current || !initialMeta) return;
    setMeta(initialMeta);
    setTagsText((initialMeta.tags ?? []).join(', '));
    // initialKey を依存にして、取り込み内容が変わったときだけ再プレフィルする。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialKey]);

  function edit(next: Partial<ScoreMeta>) {
    touched.current = true;
    setMeta((m) => ({ ...m, ...next }));
  }

  const isUpdate = !!target;
  const canEditForm = !!content;

  const parsedTags = useMemo(
    () =>
      tagsText
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean),
    [tagsText],
  );

  function buildInput(): PublishInput {
    return {
      ...meta,
      tags: parsedTags,
      // 取り込み画面の原本は常に MusicXML（ABC は変換済み / §6）。
      musicXml: content!.musicXml,
      sourceFormat: 'musicxml',
      sourceName: makeSourceName(meta.title),
      editSourceText: content!.editSourceText,
      editFormat: content!.editFormat,
      durationSec: content!.durationSec,
    };
  }

  async function onPublish() {
    if (!content) return;
    const errs = validateMeta({ ...meta, tags: parsedTags });
    if (errs.length > 0) {
      setPhase('error');
      setMessage(errs.join(' '));
      return;
    }
    if (auth.status !== 'signedIn' || !auth.agent) {
      setPhase('error');
      setMessage('公開するにはログインしてください。');
      return;
    }
    setPhase('publishing');
    setMessage(isUpdate ? '更新を送信中…' : '公開中…');
    try {
      const input = buildInput();
      const res = isUpdate
        ? await updateScore(auth.agent, target!.rkey, { ...input, createdAt }, target!.cid)
        : await publishScore(auth.agent, input);
      setResultUri(scoreUri(res.did, res.rkey));
      setPhase('done');
      setMessage(isUpdate ? '更新しました。' : '公開しました。');
    } catch (e) {
      setPhase('error');
      if (e instanceof ConflictError) setMessage(e.message);
      else setMessage(`公開に失敗しました: ${(e as Error).message}`);
    }
  }

  function onSaveDraft() {
    if (!content) return;
    saveDraft({
      title: meta.title || '（無題）',
      meta: { ...meta, tags: parsedTags },
      musicXml: content.musicXml,
      sourceFormat: 'musicxml',
      sourceName: makeSourceName(meta.title),
      editSourceText: content.editSourceText,
      editFormat: content.editFormat,
      target: target ? { ...target } : undefined,
    });
    setMessage('端末内に下書きを保存しました（公開はされていません）。');
    setPhase('idle');
  }

  return (
    <section class="publish">
      <h3>{isUpdate ? 'この作品を更新して公開' : '作品として公開'}</h3>
      {!content && <p class="muted small">先に有効な楽譜を取り込むと、ここで公開できます。</p>}

      <div class="fields" aria-disabled={!canEditForm}>
        <label>
          タイトル<span class="req">必須</span>
          <input
            type="text"
            value={meta.title}
            disabled={!canEditForm}
            onInput={(e) => edit({ title: (e.target as HTMLInputElement).value })}
          />
        </label>
        <div class="row3">
          <label>
            作曲者
            <input type="text" value={meta.composer ?? ''} disabled={!canEditForm}
              onInput={(e) => edit({ composer: (e.target as HTMLInputElement).value })} />
          </label>
          <label>
            編曲者
            <input type="text" value={meta.arranger ?? ''} disabled={!canEditForm}
              onInput={(e) => edit({ arranger: (e.target as HTMLInputElement).value })} />
          </label>
          <label>
            作詞者
            <input type="text" value={meta.lyricist ?? ''} disabled={!canEditForm}
              onInput={(e) => edit({ lyricist: (e.target as HTMLInputElement).value })} />
          </label>
        </div>
        <label>
          説明
          <textarea rows={2} value={meta.description ?? ''} disabled={!canEditForm}
            onInput={(e) => edit({ description: (e.target as HTMLTextAreaElement).value })} />
        </label>
        <div class="row2">
          <label>
            タグ（カンマ区切り）
            <input type="text" value={tagsText} disabled={!canEditForm}
              onInput={(e) => { touched.current = true; setTagsText((e.target as HTMLInputElement).value); }} />
          </label>
          <label>
            権利・ライセンス
            <input type="text" value={meta.rights ?? ''} disabled={!canEditForm}
              onInput={(e) => edit({ rights: (e.target as HTMLInputElement).value })} />
          </label>
        </div>
      </div>

      <div class="publish-actions">
        <button class="btn primary" type="button" disabled={!canEditForm || phase === 'publishing'} onClick={() => void onPublish()}>
          {phase === 'publishing' ? '送信中…' : isUpdate ? '更新して公開' : '公開する'}
        </button>
        <button class="btn" type="button" disabled={!canEditForm || phase === 'publishing'} onClick={onSaveDraft}>
          下書き保存
        </button>
        {auth.status !== 'signedIn' && (
          <span class="muted small">公開にはヘッダからログインしてください。下書き保存はログイン不要です。</span>
        )}
      </div>

      {content?.editFormat === 'abc' && (
        <p class="muted small">編集用ソース（ABC 原文）も同時に保存します。原本は MusicXML です。</p>
      )}

      {message && (
        <p class={`publish-msg ${phase}`} role={phase === 'error' ? 'alert' : 'status'}>
          {message}
          {phase === 'done' && resultUri && (
            <>
              {' '}
              <code class="uri">{resultUri}</code>
            </>
          )}
        </p>
      )}
    </section>
  );
}

/** 作品タイトルから安全なファイル名を作る（パスとして扱わない / §9）。 */
function makeSourceName(title: string): string {
  const base = (title || 'musica').replace(/[\\/:*?"<>|]+/g, '_').replace(/\s+/g, '_').slice(0, 60);
  return `${base || 'musica'}.musicxml`;
}
// /MAGI
