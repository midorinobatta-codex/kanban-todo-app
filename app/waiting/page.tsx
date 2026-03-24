'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Session } from '@supabase/supabase-js';
import { getSupabaseClient } from '@/lib/supabase/client';
import { useTaskHistory } from '@/lib/tasks/history';
import { useTasks } from '@/lib/hooks/use-tasks';
import { buildWaitingGroups, getWaitingAlertLevel } from '@/lib/tasks/clarify';
import { formatDate, isWaitingResponseOverdue, isWaitingWithoutResponseDate } from '@/lib/tasks/presentation';
import { WAITING_RESPONSE_STATUS_LABELS, type WaitingLink } from '@/lib/types';
import { generateWaitingToken } from '@/lib/waiting-links/token';
import { getWaitingLinkState, truncateComment } from '@/lib/waiting-links/presentation';

type LinkByTask = Record<string, WaitingLink | null>;

export default function WaitingPage() {
  const [session, setSession] = useState<Session | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [links, setLinks] = useState<WaitingLink[]>([]);
  const [linkLoading, setLinkLoading] = useState(true);
  const [busyTaskId, setBusyTaskId] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const router = useRouter();
  const { tasks, isLoading, error, reload } = useTasks();
  const { append } = useTaskHistory();

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
    if (!authLoading && !session) router.replace('/login');
  }, [authLoading, router, session]);

  const loadLinks = async () => {
    setLinkLoading(true);
    const supabase = getSupabaseClient();
    const { data, error: loadError } = await supabase
      .from('waiting_links')
      .select('*')
      .order('created_at', { ascending: false });

    if (loadError) {
      setNotice({ type: 'error', message: '返信リンクの取得に失敗しました。再読み込みしてください。' });
    }
    setLinks((data as WaitingLink[] | null) ?? []);
    setLinkLoading(false);
  };

  useEffect(() => {
    if (!session) return;
    void loadLinks();
  }, [session]);

  const waitingGroups = useMemo(() => buildWaitingGroups(tasks), [tasks]);
  const allWaiting = waitingGroups.flatMap((group) => group.items);

  const activeLinkByTaskId = useMemo<LinkByTask>(() => {
    const map: LinkByTask = {};
    for (const link of links) {
      if (!map[link.task_id] || new Date(map[link.task_id]!.created_at).getTime() < new Date(link.created_at).getTime()) {
        map[link.task_id] = link;
      }
    }
    return map;
  }, [links]);

  const summary = useMemo(
    () => ({
      overdue: allWaiting.filter((task) => isWaitingResponseOverdue(task)).length,
      noDate: allWaiting.filter((task) => isWaitingWithoutResponseDate(task)).length,
      noOwner: allWaiting.filter((task) => !task.assignee?.trim()).length,
      unread: allWaiting.filter((task) => activeLinkByTaskId[task.id]?.has_unread_response).length,
      noLink: allWaiting.filter((task) => !activeLinkByTaskId[task.id] || !activeLinkByTaskId[task.id]?.is_active).length,
    }),
    [activeLinkByTaskId, allWaiting],
  );

  const createOrReissueLink = async (taskId: string, reissue = false) => {
    const task = tasks.find((item) => item.id === taskId);
    if (!task || !session) return;
    setBusyTaskId(taskId);
    setNotice(null);

    const supabase = getSupabaseClient();
    try {
      if (reissue) {
        const { error: revokeError } = await supabase.from('waiting_links').update({ is_active: false }).eq('task_id', taskId).eq('is_active', true);
        if (revokeError) throw revokeError;
      }

      const token = generateWaitingToken();
      const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 30).toISOString();
      const { error: insertError } = await supabase.from('waiting_links').insert({
        user_id: session.user.id,
        task_id: task.id,
        token,
        mode: 'reply',
        is_active: true,
        expires_at: expiresAt,
        requester_name: session.user.email ?? 'FlowFocus user',
        task_title: task.title,
        request_detail: task.description,
        request_due_date: task.waiting_response_date,
      });
      if (insertError) throw insertError;

      append({
        scope: 'board',
        action: reissue ? 'waiting_link_reissued' : 'waiting_link_created',
        summary: `${task.title} の返信リンクを${reissue ? '再発行' : '作成'}しました。`,
        detail: `token: ${token.slice(0, 8)}...`,
        tone: 'info',
        contextId: task.id,
      });

      try {
        await navigator.clipboard.writeText(`${window.location.origin}/waiting-links/${token}`);
      } catch {
        setNotice({
          type: 'success',
          message: `${reissue ? '返信リンクを再発行' : '返信リンクを作成'}しました。共有URLのコピーはブラウザ制限で失敗しました。`,
        });
      }

      await loadLinks();
      setNotice((current) => current ?? { type: 'success', message: `${reissue ? '返信リンクを再発行' : '返信リンクを作成'}しました。` });
    } catch {
      setNotice({ type: 'error', message: `${reissue ? '返信リンクの再発行' : '返信リンクの作成'}に失敗しました。時間をおいて再試行してください。` });
    } finally {
      setBusyTaskId(null);
    }
  };

  const revokeLink = async (taskId: string) => {
    const link = activeLinkByTaskId[taskId];
    if (!link) return;
    setBusyTaskId(taskId);
    setNotice(null);

    try {
      const supabase = getSupabaseClient();
      const { error: revokeError } = await supabase.from('waiting_links').update({ is_active: false }).eq('id', link.id);
      if (revokeError) throw revokeError;
      await loadLinks();
      setNotice({ type: 'success', message: '返信リンクを無効化しました。' });
    } catch {
      setNotice({ type: 'error', message: '返信リンクの無効化に失敗しました。' });
    } finally {
      setBusyTaskId(null);
    }
  };

  const markAsChecked = async (taskId: string) => {
    const link = activeLinkByTaskId[taskId];
    if (!link) return;
    setBusyTaskId(taskId);

    const supabase = getSupabaseClient();
    await supabase.from('waiting_links').update({ has_unread_response: false }).eq('id', link.id);
    await loadLinks();
    await reload();
    setBusyTaskId(null);
  };

  if (authLoading || !session) {
    return <main className="flex min-h-screen items-center justify-center text-slate-500">認証状態を確認しています...</main>;
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-6 px-4 py-6 sm:px-6">
      <header className="rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-semibold text-slate-900">Waiting</h1>
              <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-700">誰待ちを見落とさない</span>
            </div>
            <p className="mt-1 text-sm text-slate-600">返信リンクの発行・再発行・無効化まで一画面で扱えます。</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link href="/portfolio" className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">Portfolio</Link>
            <Link href="/projects/health" className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">Health</Link>
            <Link href="/" className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">Board</Link>
          </div>
        </div>
      </header>

      <section className="grid gap-3 sm:grid-cols-5">
        <SummaryCard label="要フォロー" value={`${summary.overdue}件`} danger={summary.overdue > 0} />
        <SummaryCard label="回答予定日未設定" value={`${summary.noDate}件`} danger={summary.noDate > 0} />
        <SummaryCard label="相手未設定" value={`${summary.noOwner}件`} danger={summary.noOwner > 0} />
        <SummaryCard label="返信あり未確認" value={`${summary.unread}件`} danger={summary.unread > 0} />
        <SummaryCard label="リンク未発行" value={`${summary.noLink}件`} danger={summary.noLink > 0} />
      </section>

      {error ? <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p> : null}
      {notice ? (
        <p className={`rounded-xl border px-4 py-3 text-sm ${notice.type === 'error' ? 'border-rose-200 bg-rose-50 text-rose-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}`}>
          {notice.message}
        </p>
      ) : null}

      {isLoading || linkLoading ? (
        <section className="rounded-2xl border border-slate-200 bg-white px-5 py-10 text-center text-slate-500 shadow-sm">Waiting を読み込み中です...</section>
      ) : waitingGroups.length === 0 ? (
        <section className="rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-10 text-center shadow-sm">
          <h2 className="text-xl font-semibold text-emerald-900">待ち案件はありません</h2>
          <p className="mt-2 text-sm text-emerald-800">止まっているボールは見当たりません。Board に戻って実行に集中できます。</p>
        </section>
      ) : (
        <section className="grid gap-4">
          {waitingGroups.map((group) => (
            <article key={group.owner} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">{group.owner}</h2>
                  <p className="text-sm text-slate-500">{group.items.length}件 / 要フォロー順に表示</p>
                </div>
                <div className="flex flex-wrap gap-2 text-xs">
                  <span className="rounded-full bg-rose-50 px-2.5 py-1 font-medium text-rose-700">超過 {group.items.filter((task) => isWaitingResponseOverdue(task)).length}</span>
                  <span className="rounded-full bg-amber-50 px-2.5 py-1 font-medium text-amber-700">未設定 {group.items.filter((task) => isWaitingWithoutResponseDate(task)).length}</span>
                </div>
              </div>
              <div className="grid gap-3">
                {group.items.map((task) => {
                  const alertLevel = getWaitingAlertLevel(task);
                  const link = activeLinkByTaskId[task.id];
                  const state = getWaitingLinkState(link ?? null, Boolean(task.assignee?.trim()), isWaitingResponseOverdue(task));
                  const latestStatus = link?.latest_response_status ? WAITING_RESPONSE_STATUS_LABELS[link.latest_response_status] : null;

                  return (
                    <div
                      key={task.id}
                      className={`rounded-xl border px-4 py-3 ${
                        alertLevel === 'danger'
                          ? 'border-rose-200 bg-rose-50/60'
                          : alertLevel === 'warning'
                            ? 'border-amber-200 bg-amber-50/60'
                            : 'border-slate-200 bg-white'
                      }`}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <Link href={task.project_task_id ? `/projects/${task.project_task_id}` : '/'} className="text-sm font-semibold text-slate-900 underline-offset-2 hover:underline">{task.title}</Link>
                          <div className="mt-1 text-xs text-slate-600">
                            {task.gtd_category === 'delegated' ? 'Delegated' : 'Waiting'} ・ 回答予定 {formatDate(task.waiting_response_date)}
                            {task.project_task_id ? ' ・ project 連動あり' : ''}
                          </div>
                          {link?.latest_response_at ? (
                            <div className="mt-1 text-xs text-slate-700">
                              最新返信 {formatDate(link.latest_response_at)} {latestStatus ? `・ ${latestStatus}` : ''}
                              {link.latest_response_summary ? ` ・ ${truncateComment(link.latest_response_summary)}` : ''}
                            </div>
                          ) : null}
                        </div>
                        <div className="flex flex-wrap gap-2 text-[11px]">
                          {isWaitingResponseOverdue(task) ? <span className="rounded-full bg-rose-100 px-2 py-1 font-semibold text-rose-700">回答予定日超過</span> : null}
                          {!task.assignee?.trim() ? <span className="rounded-full bg-amber-100 px-2 py-1 font-semibold text-amber-700">相手未設定</span> : null}
                          {isWaitingWithoutResponseDate(task) ? <span className="rounded-full bg-amber-100 px-2 py-1 font-semibold text-amber-700">回答日未設定</span> : null}
                          {state === 'response_unread' ? <span className="rounded-full bg-sky-100 px-2 py-1 font-semibold text-sky-700">返信あり未確認</span> : null}
                          {(state === 'link_missing' || state === 'link_inactive') ? <span className="rounded-full bg-slate-200 px-2 py-1 font-semibold text-slate-700">リンク未発行</span> : null}
                        </div>
                      </div>

                      <div className="mt-3 flex flex-wrap gap-2">
                        <button type="button" disabled={busyTaskId === task.id} onClick={() => void createOrReissueLink(task.id, false)} className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50">{busyTaskId === task.id ? '処理中...' : '返信リンク作成'}</button>
                        <button type="button" disabled={busyTaskId === task.id} onClick={() => void createOrReissueLink(task.id, true)} className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50">{busyTaskId === task.id ? '処理中...' : '再発行'}</button>
                        <button type="button" disabled={!link || busyTaskId === task.id} onClick={() => void revokeLink(task.id)} className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-medium text-rose-700 hover:bg-rose-100 disabled:opacity-50">無効化</button>
                        <button type="button" disabled={!link || busyTaskId === task.id} onClick={() => void markAsChecked(task.id)} className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-1.5 text-xs font-medium text-sky-700 hover:bg-sky-100 disabled:opacity-50">返信を確認済みにする</button>
                        {link ? (
                          <button
                            type="button"
                            className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-100"
                            onClick={() => void navigator.clipboard.writeText(`${window.location.origin}/waiting-links/${link.token}`)}
                          >
                            共有URLをコピー
                          </button>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            </article>
          ))}
        </section>
      )}
    </main>
  );
}

function SummaryCard({ label, value, danger = false }: { label: string; value: string; danger?: boolean }) {
  return (
    <div className={`rounded-2xl border px-4 py-4 shadow-sm ${danger ? 'border-rose-200 bg-rose-50' : 'border-slate-200 bg-white'}`}>
      <div className="text-sm text-slate-500">{label}</div>
      <div className="mt-1 text-2xl font-semibold text-slate-900">{value}</div>
    </div>
  );
}
