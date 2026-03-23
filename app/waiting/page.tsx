'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Session } from '@supabase/supabase-js';
import { getSupabaseClient } from '@/lib/supabase/client';
import { useTasks } from '@/lib/hooks/use-tasks';
import { buildWaitingGroups, getWaitingAlertLevel } from '@/lib/tasks/clarify';
import { formatDate, isWaitingResponseOverdue, isWaitingWithoutResponseDate } from '@/lib/tasks/presentation';

export default function WaitingPage() {
  const [session, setSession] = useState<Session | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const router = useRouter();
  const { tasks, isLoading, error } = useTasks();

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

  const waitingGroups = useMemo(() => buildWaitingGroups(tasks), [tasks]);
  const allWaiting = waitingGroups.flatMap((group) => group.items);
  const summary = useMemo(
    () => ({
      overdue: allWaiting.filter((task) => isWaitingResponseOverdue(task)).length,
      noDate: allWaiting.filter((task) => isWaitingWithoutResponseDate(task)).length,
      noOwner: allWaiting.filter((task) => !task.assignee?.trim()).length,
    }),
    [allWaiting],
  );

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
            <p className="mt-1 text-sm text-slate-600">相手別にボールの所在を見ながら、要フォロー順に確認できます。</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link href="/inbox" className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">Clarify</Link>
            <Link href="/" className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">Board</Link>
          </div>
        </div>
      </header>

      <section className="grid gap-3 sm:grid-cols-3">
        <SummaryCard label="要フォロー" value={`${summary.overdue}件`} danger={summary.overdue > 0} />
        <SummaryCard label="回答予定日未設定" value={`${summary.noDate}件`} danger={summary.noDate > 0} />
        <SummaryCard label="相手未設定" value={`${summary.noOwner}件`} danger={summary.noOwner > 0} />
      </section>

      {error ? <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p> : null}

      {isLoading ? (
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
                  return (
                    <Link
                      key={task.id}
                      href={task.project_task_id ? `/projects/${task.project_task_id}` : '/'}
                      className={`rounded-xl border px-4 py-3 transition hover:bg-slate-50 ${
                        alertLevel === 'danger'
                          ? 'border-rose-200 bg-rose-50/60'
                          : alertLevel === 'warning'
                            ? 'border-amber-200 bg-amber-50/60'
                            : 'border-slate-200 bg-white'
                      }`}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <div className="text-sm font-semibold text-slate-900">{task.title}</div>
                          <div className="mt-1 text-xs text-slate-600">
                            {task.gtd_category === 'delegated' ? 'Delegated' : 'Waiting'} ・ 回答予定 {formatDate(task.waiting_response_date)}
                            {task.project_task_id ? ' ・ project 連動あり' : ''}
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-2 text-[11px]">
                          {isWaitingResponseOverdue(task) ? <span className="rounded-full bg-rose-100 px-2 py-1 font-semibold text-rose-700">期限超過</span> : null}
                          {!task.assignee?.trim() ? <span className="rounded-full bg-amber-100 px-2 py-1 font-semibold text-amber-700">相手未設定</span> : null}
                          {isWaitingWithoutResponseDate(task) ? <span className="rounded-full bg-amber-100 px-2 py-1 font-semibold text-amber-700">回答日未設定</span> : null}
                        </div>
                      </div>
                    </Link>
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
