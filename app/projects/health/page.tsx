'use client';

import Link from 'next/link';
import { useDeferredValue, useMemo, useState, type ReactNode } from 'react';
import { AlertStrip, type AlertStripItem } from '@/components/ui/alert-strip';
import { useProjects } from '@/lib/hooks/use-projects';
import { useTasks } from '@/lib/hooks/use-tasks';
import { buildHealthOverview } from '@/lib/tasks/health';
import { formatDate, formatProjectDisplayName } from '@/lib/tasks/presentation';
import { getTaskMap } from '@/lib/tasks/relationships';

export default function ProjectsHealthPage() {
  const { projects, isLoading, error } = useProjects();
  const { tasks, error: tasksError } = useTasks();
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query);

  const taskMap = useMemo(() => getTaskMap(tasks), [tasks]);
  const overview = useMemo(() => buildHealthOverview(projects, tasks, taskMap), [projects, taskMap, tasks]);

  const filteredRows = useMemo(() => {
    const normalized = deferredQuery.trim().toLowerCase();
    if (!normalized) return overview.projectRows;
    return overview.projectRows.filter((item) => {
      const haystack = `${formatProjectDisplayName(item.project.title)} ${item.project.description ?? ''}`.toLowerCase();
      return haystack.includes(normalized);
    });
  }, [deferredQuery, overview.projectRows]);

  const alerts = useMemo<AlertStripItem[]>(() => {
    const items: AlertStripItem[] = [];
    if (overview.stalledTaskCount > 0) {
      items.push({ id: 'stalled', label: '停滞案件', count: `${overview.stalledTaskCount}件`, tone: 'danger' });
    }
    if (overview.waitingOverdueCount > 0) {
      items.push({ id: 'waiting', label: 'Waiting期限超過', count: `${overview.waitingOverdueCount}件`, tone: 'danger' });
    }
    if (overview.projectWithoutNextActionCount > 0) {
      items.push({ id: 'no-next-action', label: '次アクション未設定PJ', count: `${overview.projectWithoutNextActionCount}件`, tone: 'warning' });
    }
    if (overview.highImportanceHighUrgencyCount > 0) {
      items.push({ id: 'important-urgent', label: '高重要×高緊急', count: `${overview.highImportanceHighUrgencyCount}件`, tone: 'info' });
    }
    return items;
  }, [overview.highImportanceHighUrgencyCount, overview.projectWithoutNextActionCount, overview.stalledTaskCount, overview.waitingOverdueCount]);

  return (
    <main className="min-h-screen bg-slate-100 py-8 text-slate-900">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 sm:px-6 lg:px-8">
        <header className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-sm font-medium text-sky-700">管理者向け健康診断</p>
              <h1 className="mt-1 text-3xl font-semibold tracking-tight">FlowFocus Health</h1>
              <p className="mt-2 max-w-3xl text-sm text-slate-600">
                現場入力を増やさず、既存の停滞・Waiting・次アクション情報から「今どこを聞くべきか」だけを軽く見ます。
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link href="/" className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50">
                Boardへ戻る
              </Link>
              <Link href="/projects" className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50">
                Projects
              </Link>
              <Link href="/projects/viewer" className="rounded-lg border border-slate-900 bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700">
                Viewer
              </Link>
            </div>
          </div>
        </header>

        <AlertStrip items={alerts} title="要確認シグナル" compact defaultCollapsed={false} />

        <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          <StatCard label="停滞案件数" value={`${overview.stalledTaskCount}件`} danger={overview.stalledTaskCount > 0} />
          <StatCard label="Waiting期限超過" value={`${overview.waitingOverdueCount}件`} danger={overview.waitingOverdueCount > 0} />
          <StatCard label="直近更新日" value={formatDate(overview.latestTaskUpdatedAt, '更新なし')} />
          <StatCard label="次アクション未設定 project" value={`${overview.projectWithoutNextActionCount}件`} danger={overview.projectWithoutNextActionCount > 0} />
          <StatCard label="進める一手なし project" value={`${overview.projectWithoutActiveActionCount}件`} danger={overview.projectWithoutActiveActionCount > 0} />
          <StatCard label="重要度×緊急度の偏り" value={`${overview.highImportanceHighUrgencyCount} / ${overview.urgentHighImportanceCount}件`} />
        </section>

        <section className="grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]">
          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-col gap-3 border-b border-slate-200 pb-4 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">project 一覧</h2>
                <p className="mt-1 text-sm text-slate-500">危険信号が強い順。各行に「次に聞くこと」を添えています。</p>
              </div>
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="project を検索"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm sm:max-w-xs"
              />
            </div>

            <div className="mt-4 space-y-3">
              {filteredRows.length === 0 ? (
                <p className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-sm text-slate-500">対象の project はありません。</p>
              ) : (
                filteredRows.map((item) => <ProjectHealthCard key={item.project.id} item={item} />)
              )}
            </div>
          </div>

          <aside className="space-y-6">
            <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">危険信号の強い project</h2>
                  <p className="mt-1 text-sm text-slate-500">優先して声をかけたい順です。</p>
                </div>
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">{overview.riskyProjects.length}件</span>
              </div>
              <div className="mt-4 space-y-2">
                {overview.riskyProjects.length === 0 ? (
                  <p className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-sm text-slate-500">今は大きな危険信号はありません。</p>
                ) : (
                  overview.riskyProjects.map((item) => (
                    <Link key={item.project.id} href={`/projects/${item.project.id}`} className="block rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 transition hover:bg-slate-100">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-slate-900">{formatProjectDisplayName(item.project.title)}</p>
                          <p className="mt-1 text-xs text-slate-500">{item.signalLabel} / 更新 {formatDate(item.updatedAt, '未記録')}</p>
                        </div>
                        <SignalBadge signal={item.signal}>{item.signalLabel}</SignalBadge>
                      </div>
                    </Link>
                  ))
                )}
              </div>
            </section>

            <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-lg font-semibold text-slate-900">この画面の見方</h2>
              <ul className="mt-3 space-y-2 text-sm text-slate-600">
                <li>・ 正確な工数管理ではなく、止まりやすい project を先に見つけるための画面です。</li>
                <li>・ On track / 要注意 / 危険 は、停滞・Waiting・次アクション欠落を元に自動判定しています。</li>
                <li>・ 詳細確認は project detail へ遷移し、現場入力を増やさずに解消してください。</li>
              </ul>
            </section>
          </aside>
        </section>

        {(error || tasksError) ? (
          <p className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error ?? tasksError}</p>
        ) : null}
        {isLoading ? <p className="text-sm text-slate-500">読み込み中...</p> : null}
      </div>
    </main>
  );
}

function StatCard({ label, value, danger = false }: { label: string; value: string; danger?: boolean }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className={`mt-2 text-2xl font-semibold ${danger ? 'text-rose-600' : 'text-slate-900'}`}>{value}</p>
    </div>
  );
}

function SignalBadge({ signal, children }: { signal: 'on_track' | 'watch' | 'risk'; children: ReactNode }) {
  const className = signal === 'risk'
    ? 'border-rose-200 bg-rose-50 text-rose-700'
    : signal === 'watch'
      ? 'border-amber-200 bg-amber-50 text-amber-700'
      : 'border-emerald-200 bg-emerald-50 text-emerald-700';
  return <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${className}`}>{children}</span>;
}

function ProjectHealthCard({ item }: { item: ReturnType<typeof buildHealthOverview>['projectRows'][number] }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base font-semibold text-slate-900">{formatProjectDisplayName(item.project.title)}</h3>
            <SignalBadge signal={item.signal}>{item.signalLabel}</SignalBadge>
          </div>
          <p className="mt-1 text-sm text-slate-500">最終更新 {formatDate(item.updatedAt, '未記録')} / 関連 task {item.project.linkedTaskCount}件</p>
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          <MetricPill label="停滞" value={item.stalledTaskCount} danger={item.stalledTaskCount > 0} />
          <MetricPill label="Waiting超過" value={item.waitingOverdueCount} danger={item.waitingOverdueCount > 0} />
          <MetricPill label="高重×高緊" value={item.highImportanceHighUrgencyCount} />
        </div>
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto]">
        <div className="space-y-2">
          <p className="text-sm font-medium text-slate-700">次に聞くこと</p>
          <ul className="space-y-1 text-sm text-slate-600">
            {item.prompts.length === 0 ? <li>特別な確認事項はありません。</li> : item.prompts.slice(0, 3).map((prompt) => <li key={prompt}>・ {prompt}</li>)}
          </ul>
          {item.relationIssue ? <p className="text-xs text-slate-500">理由: {item.relationIssue.reason} / {item.relationIssue.detail}</p> : null}
        </div>
        <div className="flex items-end justify-end">
          <Link href={`/projects/${item.project.id}`} className="rounded-lg border border-slate-900 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100">
            詳細を見る
          </Link>
        </div>
      </div>
    </div>
  );
}

function MetricPill({ label, value, danger = false }: { label: string; value: number; danger?: boolean }) {
  return <span className={`rounded-full px-2.5 py-1 font-medium ${danger ? 'bg-rose-100 text-rose-700' : 'bg-white text-slate-600 ring-1 ring-slate-200'}`}>{label} {value}</span>;
}
