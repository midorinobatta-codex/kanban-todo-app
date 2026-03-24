'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { getSupabaseClient } from '@/lib/supabase/client';
import { WAITING_RESPONSE_STATUS_LABELS, WAITING_RESPONSE_STATUS_VALUES, type WaitingResponseStatus } from '@/lib/types';
import { formatDate } from '@/lib/tasks/presentation';

type PublicWaitingLink = {
  id: string;
  token: string;
  mode: 'reply';
  requester_name: string | null;
  task_title: string;
  request_detail: string | null;
  request_due_date: string | null;
  expires_at: string | null;
  latest_response_at: string | null;
};
type SupabaseLikeError = { message?: string; code?: string };

export default function WaitingLinkPublicPage() {
  const params = useParams<{ token: string }>();
  const token = useMemo(() => params?.token ?? '', [params]);
  const [link, setLink] = useState<PublicWaitingLink | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  const [status, setStatus] = useState<WaitingResponseStatus>('in_progress');
  const [responderName, setResponderName] = useState('');
  const [responseDueDate, setResponseDueDate] = useState('');
  const [comment, setComment] = useState('');

  const getRpcErrorMessage = (prefix: string, err: unknown) => {
    if (typeof err === 'object' && err !== null) {
      const { message, code } = err as SupabaseLikeError;
      const text = message?.toLowerCase() ?? '';
      if (
        code === '42883' ||
        text.includes("function public.get_waiting_link_public") ||
        text.includes("function public.submit_waiting_response") ||
        text.includes("relation \"public.waiting_links\" does not exist")
      ) {
        return `${prefix} Waiting 用のDB関数/テーブルが未適用です。管理者にセットアップ状況を確認してください。`;
      }
    }
    return prefix;
  };

  useEffect(() => {
    if (!token) return;

    const load = async () => {
      setLoading(true);
      setError(null);
      const supabase = getSupabaseClient();
      const { data, error: rpcError } = await supabase.rpc('get_waiting_link_public', { p_token: token });
      if (rpcError) {
        setError(getRpcErrorMessage('リンクの取得に失敗しました。', rpcError));
        setLoading(false);
        return;
      }

      const row = Array.isArray(data) ? data[0] : null;
      if (!row) {
        setError('この返信リンクは無効化済み、または期限切れです。');
      } else {
        setLink(row as PublicWaitingLink);
      }
      setLoading(false);
    };

    void load();
  }, [token]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!token || saving) return;

    setSaving(true);
    setError(null);

    const supabase = getSupabaseClient();
    const { error: rpcError } = await supabase.rpc('submit_waiting_response', {
      p_token: token,
      p_responder_name: responderName,
      p_response_status: status,
      p_response_due_date: responseDueDate || null,
      p_comment: comment,
    });

    if (rpcError) {
      setError(getRpcErrorMessage('返信の送信に失敗しました。時間をおいて再度お試しください。', rpcError));
      setSaving(false);
      return;
    }

    setDone(true);
    setSaving(false);
  };

  return (
    <main className="mx-auto min-h-screen w-full max-w-2xl px-4 py-8 sm:px-6">
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-semibold text-slate-900">FlowFocus 返信フォーム</h1>
        <p className="mt-1 text-sm text-slate-600">ログイン不要で回答できます。</p>

        {loading ? <p className="mt-6 text-sm text-slate-500">読み込み中...</p> : null}
        {error ? <p className="mt-6 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p> : null}

        {link && !done ? (
          <>
            <div className="mt-6 space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm">
              <p><span className="font-medium text-slate-700">件名:</span> {link.task_title}</p>
              <p><span className="font-medium text-slate-700">依頼内容:</span> {link.request_detail || '（未記入）'}</p>
              <p><span className="font-medium text-slate-700">回答希望日:</span> {formatDate(link.request_due_date)}</p>
              <p><span className="font-medium text-slate-700">依頼者:</span> {link.requester_name || 'FlowFocus user'}</p>
            </div>

            <form onSubmit={(event) => void handleSubmit(event)} className="mt-5 grid gap-3">
              <label className="grid gap-1 text-sm">
                <span className="font-medium text-slate-700">現在の状況</span>
                <select value={status} onChange={(event) => setStatus(event.target.value as WaitingResponseStatus)} className="rounded-lg border border-slate-300 px-3 py-2">
                  {WAITING_RESPONSE_STATUS_VALUES.map((value) => (
                    <option key={value} value={value}>{WAITING_RESPONSE_STATUS_LABELS[value]}</option>
                  ))}
                </select>
              </label>

              <label className="grid gap-1 text-sm">
                <span className="font-medium text-slate-700">回答予定日</span>
                <input type="date" value={responseDueDate} onChange={(event) => setResponseDueDate(event.target.value)} className="rounded-lg border border-slate-300 px-3 py-2" />
              </label>

              <label className="grid gap-1 text-sm">
                <span className="font-medium text-slate-700">コメント / 質問</span>
                <textarea value={comment} onChange={(event) => setComment(event.target.value)} rows={4} className="rounded-lg border border-slate-300 px-3 py-2" />
              </label>

              <label className="grid gap-1 text-sm">
                <span className="font-medium text-slate-700">氏名 / 表示名（任意）</span>
                <input value={responderName} onChange={(event) => setResponderName(event.target.value)} className="rounded-lg border border-slate-300 px-3 py-2" />
              </label>

              <button type="submit" disabled={saving} className="mt-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-60">
                {saving ? '送信中...' : '返信を送信'}
              </button>
            </form>
          </>
        ) : null}

        {done ? <p className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">返信を送信しました。ありがとうございました。</p> : null}
      </section>
    </main>
  );
}
