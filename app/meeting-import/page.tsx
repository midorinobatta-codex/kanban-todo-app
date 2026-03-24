'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Session } from '@supabase/supabase-js';
import { getSupabaseClient } from '@/lib/supabase/client';
import { TASK_GTD_LABELS } from '@/lib/types';
import {
  convertMeetingCandidateToTaskFields,
  MEETING_IMPORT_CANDIDATE_TYPES,
  MEETING_IMPORT_PROMPT,
  parseMeetingImportResponse,
  type MeetingImportCandidate,
  type MeetingImportCandidateType,
} from '@/lib/ai/meeting-import';

type CandidateState = MeetingImportCandidate & {
  adopted: boolean;
  rejected: boolean;
  saving: boolean;
};

const TYPE_LABELS: Record<MeetingImportCandidateType, string> = {
  next_action: '次アクション',
  waiting: 'Waiting',
  project: 'Project',
  someday: 'Someday',
};

function getSuggestedWaitingDate() {
  const next = new Date();
  next.setDate(next.getDate() + 2);
  return next.toISOString().slice(0, 10);
}

export default function MeetingImportPage() {
  const [session, setSession] = useState<Session | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [rawResponse, setRawResponse] = useState('');
  const [summary, setSummary] = useState('');
  const [parseError, setParseError] = useState<string | null>(null);
  const [parseWarnings, setParseWarnings] = useState<string[]>([]);
  const [copyNotice, setCopyNotice] = useState<string | null>(null);
  const [pageNotice, setPageNotice] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<CandidateState[]>([]);
  const router = useRouter();

  useEffect(() => {
    const supabase = getSupabaseClient();
    void supabase.auth.getSession().then(({ data }) => {
      setSession(data.session ?? null);
      setAuthLoading(false);
    });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession ?? null);
      setAuthLoading(false);
    });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!authLoading && !session) {
      router.replace('/login');
    }
  }, [authLoading, router, session]);

  const visibleCandidates = useMemo(
    () => candidates.filter((candidate) => !candidate.rejected && !candidate.adopted),
    [candidates],
  );

  const adoptedCount = useMemo(() => candidates.filter((candidate) => candidate.adopted).length, [candidates]);

  const handleCopyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(MEETING_IMPORT_PROMPT);
      setCopyNotice('会議メモ整理用プロンプトをコピーしました。');
    } catch {
      setCopyNotice('コピーに失敗しました。手動でプロンプト欄を選択してコピーしてください。');
    }
  };

  const handleParse = () => {
    setCopyNotice(null);
    setPageNotice(null);
    const result = parseMeetingImportResponse(rawResponse);
    if (!result.ok) {
      setParseError(result.error);
      setParseWarnings([]);
      setCandidates([]);
      setSummary('');
      return;
    }

    setParseError(null);
    setParseWarnings(result.warnings);
    setSummary(result.payload.summary);
    setCandidates(result.payload.candidates.map((candidate) => ({ ...candidate, adopted: false, rejected: false, saving: false })));
  };

  const handleReject = (candidateId: string) => {
    setCandidates((prev) => prev.map((candidate) => (
      candidate.id === candidateId ? { ...candidate, rejected: true } : candidate
    )));
  };

  const handleDraftChange = (candidateId: string, field: 'title' | 'type', value: string) => {
    setCandidates((prev) => prev.map((candidate) => {
      if (candidate.id !== candidateId) return candidate;
      if (field === 'title') return { ...candidate, title: value };
      return { ...candidate, type: value as MeetingImportCandidateType };
    }));
  };

  const handleAdopt = async (candidateId: string) => {
    if (!session) return;
    const target = candidates.find((candidate) => candidate.id === candidateId);
    if (!target) return;

    const trimmedTitle = target.title.trim();
    if (!trimmedTitle) {
      setPageNotice('タイトルが空の候補は保存できません。編集してから採用してください。');
      return;
    }

    setPageNotice(null);
    setCandidates((prev) => prev.map((candidate) => (
      candidate.id === candidateId ? { ...candidate, saving: true } : candidate
    )));

    const mapped = convertMeetingCandidateToTaskFields(target.type);
    const description = [summary.trim(), target.reason.trim()].filter(Boolean).join('\n\n');

    const { error } = await getSupabaseClient().from('tasks').insert({
      user_id: session.user.id,
      title: trimmedTitle,
      description: description || null,
      assignee: null,
      priority: 'medium',
      importance: 'medium',
      urgency: 'medium',
      status: mapped.status,
      gtd_category: mapped.gtdCategory,
      project_task_id: null,
      waiting_response_date: mapped.status === 'waiting' ? getSuggestedWaitingDate() : null,
    });

    if (error) {
      setPageNotice(error.message);
      setCandidates((prev) => prev.map((candidate) => (
        candidate.id === candidateId ? { ...candidate, saving: false } : candidate
      )));
      return;
    }

    setCandidates((prev) => prev.map((candidate) => (
      candidate.id === candidateId ? { ...candidate, adopted: true, saving: false } : candidate
    )));
    setPageNotice(`「${trimmedTitle}」を ${TYPE_LABELS[target.type]} として保存しました。`);
  };

  if (authLoading || !session) {
    return <main className="flex min-h-screen items-center justify-center text-slate-500">認証状態を確認しています...</main>;
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-6 px-4 py-6 sm:px-6">
      <header className="rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-semibold text-slate-900">会議メモ取込</h1>
              <span className="rounded-full bg-violet-50 px-2.5 py-1 text-[11px] font-semibold text-violet-700">AI候補取込</span>
            </div>
            <p className="mt-1 text-sm text-slate-600">FlowFocus はプロンプト管理と候補採用に集中し、ChatGPT 側で会議メモ整理を行う半手動フローです。</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link href="/inbox" className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">Clarify</Link>
            <Link href="/waiting" className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">Waiting</Link>
            <Link href="/" className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">Board</Link>
          </div>
        </div>
      </header>

      {copyNotice ? <p className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-700">{copyNotice}</p> : null}
      {pageNotice ? <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{pageNotice}</p> : null}
      {parseError ? <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{parseError}</p> : null}
      {parseWarnings.length > 0 ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <div className="font-medium">一部の候補は補正または読み飛ばしました。</div>
          <ul className="mt-2 list-disc pl-5">
            {parseWarnings.map((warning) => <li key={warning}>{warning}</li>)}
          </ul>
        </div>
      ) : null}

      <section className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">1. ChatGPT に渡すプロンプト</h2>
              <p className="mt-1 text-sm text-slate-600">この欄をそのままコピーし、音声文字起こしや会議メモを追記して ChatGPT で処理します。</p>
            </div>
            <button type="button" onClick={handleCopyPrompt} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800">プロンプトをコピー</button>
          </div>
          <textarea readOnly value={MEETING_IMPORT_PROMPT} rows={18} className="mt-4 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700" />
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">2. ChatGPT の返答を貼り付け</h2>
          <p className="mt-1 text-sm text-slate-600">JSON だけが理想ですが、コードブロック付きや前後に短い説明がある場合も取り込めます。</p>
          <textarea
            value={rawResponse}
            onChange={(event) => setRawResponse(event.target.value)}
            placeholder='{"summary":"...","candidates":[...]}'
            rows={18}
            className="mt-4 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm"
          />
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-slate-500">エラー時は JSON 形式 / candidates 配列 / type の値 を確認してください。</p>
            <button type="button" onClick={handleParse} className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-violet-500">候補を読み込む</button>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">3. 候補を確認して採用</h2>
            <p className="mt-1 text-sm text-slate-600">AI は保存を確定しません。必要な候補だけを採用し、Clarify / Waiting / Project 構造へ自然に戻します。</p>
          </div>
          <div className="rounded-xl bg-slate-100 px-3 py-2 text-sm text-slate-700">保存済み {adoptedCount}件 / 残り {visibleCandidates.length}件</div>
        </div>

        {summary ? (
          <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">会議要点</div>
            <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">{summary}</p>
          </div>
        ) : null}

        {visibleCandidates.length === 0 ? (
          <div className="mt-4 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">まだ候補はありません。プロンプトをコピーして ChatGPT の返答を貼り付けると、ここに採用候補が並びます。</div>
        ) : (
          <div className="mt-4 grid gap-3">
            {visibleCandidates.map((candidate) => (
              <article key={candidate.id} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex-1 space-y-3">
                    <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_180px]">
                      <div>
                        <label className="mb-1 block text-xs font-semibold text-slate-500">タイトル</label>
                        <input value={candidate.title} onChange={(event) => handleDraftChange(candidate.id, 'title', event.target.value)} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm" />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-semibold text-slate-500">種別</label>
                        <select value={candidate.type} onChange={(event) => handleDraftChange(candidate.id, 'type', event.target.value)} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">
                          {MEETING_IMPORT_CANDIDATE_TYPES.map((type) => <option key={type} value={type}>{TYPE_LABELS[type]}</option>)}
                        </select>
                      </div>
                    </div>
                    <div>
                      <div className="text-xs font-semibold text-slate-500">理由</div>
                      <p className="mt-1 text-sm text-slate-600">{candidate.reason}</p>
                    </div>
                    <div className="text-xs text-slate-500">保存先: {candidate.type === 'waiting' ? 'Waiting / Delegated' : TASK_GTD_LABELS[convertMeetingCandidateToTaskFields(candidate.type).gtdCategory]}</div>
                  </div>
                  <div className="flex flex-col gap-2 sm:w-40">
                    <button type="button" onClick={() => void handleAdopt(candidate.id)} disabled={candidate.saving} className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-blue-500 disabled:opacity-60">{candidate.saving ? '保存中...' : '採用'}</button>
                    <button type="button" onClick={() => void handleAdopt(candidate.id)} disabled={candidate.saving} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100 disabled:opacity-60">編集して採用</button>
                    <button type="button" onClick={() => handleReject(candidate.id)} disabled={candidate.saving} className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700 transition hover:bg-rose-100 disabled:opacity-60">却下</button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
