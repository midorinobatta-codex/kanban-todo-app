'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useProjects } from '@/lib/hooks/use-projects';
import { useTasks } from '@/lib/hooks/use-tasks';
import { formatDate, formatProjectDisplayName } from '@/lib/tasks/presentation';
import { buildPortfolioOverview } from '@/lib/portfolio/overview';
import { getSupabaseClient } from '@/lib/supabase/client';
import type { WaitingLink } from '@/lib/types';

export default function PortfolioPage() {
  const { projects, isLoading, error } = useProjects();
  const { tasks, isLoading: taskLoading, error: taskError } = useTasks();
  const [waitingLinks, setWaitingLinks] = useState<WaitingLink[]>([]);

  useEffect(() => {
    const load = async () => {
      const supabase = getSupabaseClient();
      const { data } = await supabase.from('waiting_links').select('*');
      setWaitingLinks((data as WaitingLink[] | null) ?? []);
    };
    void load();
  }, []);

  const overview = useMemo(() => buildPortfolioOverview(projects, tasks, waitingLinks), [projects, tasks, waitingLinks]);

  return (
    <main className="min-h-screen bg-slate-100 py-8 text-slate-900">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 sm:px-6 lg:px-8">
        <header className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-sky-700">管理者向けポートフォリオ / 健康診断</p>
              <h1 className="mt-1 text-3xl font-semibold tracking-tight">Portfolio Health</h1>
              <p className="mt-2 text-sm text-slate-600">停滞・Waiting・返信状況の受動データのみで、先に聞くべき project を見つける画面です。</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link href="/" className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">Board</Link>
              <Link href="/waiting" className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">Waiting</Link>
              <Link href="/projects/health" className="rounded-lg border border-slate-900 bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700">既存Health</Link>
            </div>
          </div>
        </header>

        <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <StatCard label="project 総数" value={`${overview.summary.projectCount}`} />
          <StatCard label="On track" value={`${overview.summary.onTrackCount}`} />
          <StatCard label="要注意" value={`${overview.summary.watchCount}`} danger={overview.summary.watchCount > 0} />
          <StatCard label="危険" value={`${overview.summary.riskCount}`} danger={overview.summary.riskCount > 0} />
          <StatCard label="Waiting 期限超過" value={`${overview.summary.waitingOverdueCount}`} danger={overview.summary.waitingOverdueCount > 0} />
          <StatCard label="進行停滞" value={`${overview.summary.staleCount}`} danger={overview.summary.staleCount > 0} />
          <StatCard label="次アクション未設定PJ" value={`${overview.summary.noNextActionProjectCount}`} danger={overview.summary.noNextActionProjectCount > 0} />
          <StatCard label="直近更新なしPJ" value={`${overview.summary.noRecentUpdateCount}`} danger={overview.summary.noRecentUpdateCount > 0} />
        </section>

        <section className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_360px]">
          <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold">要注意 project 一覧</h2>
            <div className="mt-4 space-y-3">
              {overview.rows.map((row) => (
                <article key={row.project.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-base font-semibold text-slate-900">{formatProjectDisplayName(row.project.title)}</h3>
                        <SignalPill signal={row.signal}>{row.signalLabel}</SignalPill>
                      </div>
                      <p className="mt-1 text-xs text-slate-500">完了率 {Math.round(row.project.completionRate)}% ・ 関連タスク {row.project.linkedTaskCount}件 ・ 進める一手 {row.project.nextActionCount}件</p>
                      <p className="mt-1 text-xs text-slate-500">Waiting超過 {row.waitingOverdueCount}件 ・ 進行停滞 {row.staleDoingCount}件 ・ 最終更新 {formatDate(row.latestUpdatedAt, '未記録')}</p>
                    </div>
                    <Link href={`/projects/${row.project.id}`} className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100">Project Detail</Link>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {row.reasons.length === 0 ? <span className="text-xs text-slate-500">理由タグなし</span> : row.reasons.map((reason) => <span key={reason} className="rounded-full bg-amber-100 px-2 py-1 text-[11px] font-semibold text-amber-700">{reason}</span>)}
                  </div>
                </article>
              ))}
            </div>
          </section>

          <aside className="space-y-6">
            <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-lg font-semibold">理由別集計</h2>
              <div className="mt-3 space-y-2">
                {overview.reasonTotals.map(([reason, count]) => (
                  <div key={reason} className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
                    <span>{reason}</span>
                    <span className="font-semibold">{count}</span>
                  </div>
                ))}
              </div>
            </section>
          </aside>
        </section>

        {(error || taskError) ? <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error ?? taskError}</p> : null}
        {(isLoading || taskLoading) ? <p className="text-sm text-slate-500">読み込み中...</p> : null}
      </div>
    </main>
  );
}

function StatCard({ label, value, danger = false }: { label: string; value: string; danger?: boolean }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs text-slate-500">{label}</p>
      <p className={`mt-1 text-2xl font-semibold ${danger ? 'text-rose-600' : 'text-slate-900'}`}>{value}</p>
    </div>
  );
}

function SignalPill({ signal, children }: { signal: 'on_track' | 'watch' | 'risk'; children: ReactNode }) {
  const className = signal === 'risk'
    ? 'border-rose-200 bg-rose-50 text-rose-700'
    : signal === 'watch'
      ? 'border-amber-200 bg-amber-50 text-amber-700'
      : 'border-emerald-200 bg-emerald-50 text-emerald-700';
  return <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${className}`}>{children}</span>;
}
