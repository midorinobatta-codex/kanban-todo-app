'use client';

import Link from 'next/link';
import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { useProjects } from '@/lib/hooks/use-projects';
import type { Project } from '@/lib/domain/project';
import { AlertStrip, type AlertStripItem } from '@/components/ui/alert-strip';
import { ExportActions } from '@/components/ui/export-actions';
import { HistoryPanel } from '@/components/ui/history-panel';
import {
  dayDiffFromToday,
  formatDate,
  formatDurationDays,
  formatProjectDisplayName,
  formatRelativeDueText,
  parseDateOnly,
} from '@/lib/tasks/presentation';
import { buildHistoryRows, buildProjectExportRows, downloadCsv, downloadJson } from '@/lib/tasks/export';
import { useTaskHistory } from '@/lib/tasks/history';
import { buildProjectFocusDeck, buildProjectStalledBuckets, buildStalledProjectList } from '@/lib/tasks/focus';

const DAY_WIDTH = 26;

type ViewerFilterKey = 'all' | 'risk' | 'active' | 'waiting' | 'due_soon';

const FILTER_LABELS: Record<ViewerFilterKey, string> = {
  all: 'すべて',
  risk: '要確認',
  active: '進行中中心',
  waiting: '待ち中心',
  due_soon: '期限接近',
};

function isViewerEligible(project: Project) {
  return Boolean(project.startedAt && project.dueDate);
}

function projectMatchesFilter(project: Project, filterKey: ViewerFilterKey) {
  const dueDiff = dayDiffFromToday(project.dueDate);

  switch (filterKey) {
    case 'risk':
      return project.overdueCount > 0 || !project.startedAt || !project.dueDate || project.nextActionCount === 0;
    case 'active':
      return project.status === 'doing' || (project.nextActionCount > 0 && project.completionRate < 100);
    case 'waiting':
      return project.status === 'waiting';
    case 'due_soon':
      return dueDiff !== null && dueDiff >= 0 && dueDiff <= 7;
    case 'all':
    default:
      return true;
  }
}

function buildTimelineDays(projects: Project[]) {
  const ranges = projects
    .map((project) => ({
      start: parseDateOnly(project.startedAt),
      end: parseDateOnly(project.dueDate),
    }))
    .filter((range): range is { start: Date; end: Date } => Boolean(range.start && range.end));

  if (ranges.length === 0) return [] as Date[];

  const minStart = new Date(Math.min(...ranges.map((range) => range.start.getTime())));
  const maxEnd = new Date(Math.max(...ranges.map((range) => range.end.getTime())));

  minStart.setDate(minStart.getDate() - 3);
  maxEnd.setDate(maxEnd.getDate() + 3);

  const days: Date[] = [];
  const cursor = new Date(minStart);
  while (cursor <= maxEnd) {
    days.push(new Date(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }

  return days;
}

function getBarStyle(project: Project, timelineDays: Date[]) {
  if (timelineDays.length === 0) return { width: 0, left: 0 };

  const firstDay = timelineDays[0];
  const startDate = parseDateOnly(project.startedAt);
  const dueDate = parseDateOnly(project.dueDate);
  if (!startDate || !dueDate) return { width: 0, left: 0 };

  const startIndex = Math.round((startDate.getTime() - firstDay.getTime()) / (1000 * 60 * 60 * 24));
  const endIndex = Math.round((dueDate.getTime() - firstDay.getTime()) / (1000 * 60 * 60 * 24));
  const width = Math.max((endIndex - startIndex + 1) * DAY_WIDTH, DAY_WIDTH);

  return {
    left: Math.max(startIndex * DAY_WIDTH, 0),
    width,
  };
}

function buildViewerAlerts(projects: Project[]) {
  const missingStart = projects.filter((project) => !project.startedAt).length;
  const missingDue = projects.filter((project) => !project.dueDate).length;
  const noActions = projects.filter((project) => project.nextActionCount === 0).length;
  const overdueProjects = projects.filter((project) => project.overdueCount > 0).length;

  const items: AlertStripItem[] = [];

  if (overdueProjects > 0) {
    items.push({ id: 'overdue', label: '期限超過あり', count: `${overdueProjects}件`, tone: 'danger' });
  }
  if (missingStart > 0) {
    items.push({ id: 'missing-start', label: '開始日未記録', count: `${missingStart}件`, tone: 'warning', href: '#missing-start-projects' });
  }
  if (missingDue > 0) {
    items.push({ id: 'missing-due', label: '期限未設定', count: `${missingDue}件`, tone: 'warning', href: '#missing-due-projects' });
  }
  if (noActions > 0) {
    items.push({ id: 'no-actions', label: '次アクション未設定', count: `${noActions}件`, tone: 'info' });
  }

  return items;
}

export default function ProjectsViewerPage() {
  const { projects, isLoading, error } = useProjects();
  const [searchQuery, setSearchQuery] = useState('');
  const [filterKey, setFilterKey] = useState<ViewerFilterKey>('all');
  const deferredSearchQuery = useDeferredValue(searchQuery);
  const [viewerRenderCount, setViewerRenderCount] = useState(40);
  const { entries: historyEntries, append: appendHistoryEntry, clear: clearHistoryEntries } = useTaskHistory();

  const filteredProjects = useMemo(() => {
    const normalizedQuery = deferredSearchQuery.trim().toLowerCase();

    return projects
      .filter((project) => {
        if (!projectMatchesFilter(project, filterKey)) return false;
        if (!normalizedQuery) return true;
        return `${formatProjectDisplayName(project.title)} ${project.description ?? ''}`.toLowerCase().includes(normalizedQuery);
      })
      .sort((left, right) => {
        if (right.overdueCount !== left.overdueCount) return right.overdueCount - left.overdueCount;
        if (right.completionRate !== left.completionRate) return right.completionRate - left.completionRate;
        return right.createdAt.localeCompare(left.createdAt);
      });
  }, [deferredSearchQuery, filterKey, projects]);

  const ganttProjects = useMemo(
    () => filteredProjects.filter((project) => isViewerEligible(project)),
    [filteredProjects],
  );

  const visibleGanttProjects = useMemo(() => ganttProjects.slice(0, viewerRenderCount), [ganttProjects, viewerRenderCount]);
  const hiddenGanttProjectCount = Math.max(ganttProjects.length - visibleGanttProjects.length, 0);
  const focusedProjects = useMemo(() => buildProjectFocusDeck(filteredProjects, 3), [filteredProjects]);
  const stalledProjectBuckets = useMemo(() => buildProjectStalledBuckets(filteredProjects), [filteredProjects]);
  const stalledProjects = useMemo(() => buildStalledProjectList(filteredProjects, 4), [filteredProjects]);

  const missingStartProjects = useMemo(
    () => filteredProjects.filter((project) => !project.startedAt),
    [filteredProjects],
  );

  const missingDueProjects = useMemo(
    () => filteredProjects.filter((project) => !project.dueDate),
    [filteredProjects],
  );

  const alerts = useMemo(() => buildViewerAlerts(filteredProjects), [filteredProjects]);
  const timelineDays = useMemo(() => buildTimelineDays(ganttProjects), [ganttProjects]);
  const totalTimelineWidth = timelineDays.length * DAY_WIDTH;
  const todayIndex = useMemo(() => {
    if (timelineDays.length === 0) return -1;
    const today = new Date();
    const todayOnly = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    return timelineDays.findIndex(
      (day) =>
        day.getFullYear() === todayOnly.getFullYear() &&
        day.getMonth() === todayOnly.getMonth() &&
        day.getDate() === todayOnly.getDate(),
    );
  }, [timelineDays]);

  const viewerHistoryEntries = useMemo(() => historyEntries.filter((entry) => entry.scope === 'viewer'), [historyEntries]);

  useEffect(() => {
    setViewerRenderCount(40);
  }, [deferredSearchQuery, filterKey]);

  const handleExportViewerCsv = () => {
    downloadCsv('project-viewer', buildProjectExportRows(filteredProjects));
    appendHistoryEntry({
      scope: 'viewer',
      action: 'export_csv',
      summary: 'ViewerをCSV出力',
      detail: `表示中 ${filteredProjects.length}件を出力`,
      tone: 'info',
    });
  };

  const handleExportViewerJson = () => {
    downloadJson('project-viewer', buildProjectExportRows(filteredProjects));
    appendHistoryEntry({
      scope: 'viewer',
      action: 'export_json',
      summary: 'ViewerをJSON出力',
      detail: `表示中 ${filteredProjects.length}件を出力`,
      tone: 'info',
    });
  };

  const handleExportViewerHistoryCsv = () => {
    downloadCsv('project-viewer-history', buildHistoryRows(viewerHistoryEntries));
  };

  const handleExportViewerHistoryJson = () => {
    downloadJson('project-viewer-history', buildHistoryRows(viewerHistoryEntries));
  };

  const summary = useMemo(() => {
    const visibleCount = filteredProjects.length;
    const eligibleCount = ganttProjects.length;
    const riskCount = filteredProjects.filter((project) => project.overdueCount > 0).length;
    const activeCount = filteredProjects.filter((project) => project.completionRate < 100).length;

    return { visibleCount, eligibleCount, riskCount, activeCount };
  }, [filteredProjects, ganttProjects]);

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-[120rem] flex-col gap-6 px-4 py-6 sm:px-6">
      <header className="sticky top-0 z-40 -mx-4 px-4 py-1 backdrop-blur sm:-mx-6 sm:px-6">
        <div className="rounded-2xl border border-slate-200 bg-white/95 p-4 shadow-sm ring-1 ring-slate-900/5 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h1 className="text-3xl font-semibold text-slate-900">Projects Viewer</h1>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Link
                href="/projects"
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
              >
                Projects
              </Link>
              <Link
                href="/"
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
              >
                Board
              </Link>
              <ExportActions
                label="Export"
                onExportCsv={handleExportViewerCsv}
                onExportJson={handleExportViewerJson}
              />
            </div>
          </div>

          <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <CompactSummaryCard label="表示中" value={`${summary.visibleCount}件`} />
              <CompactSummaryCard label="ガント対象" value={`${summary.eligibleCount}件`} />
              <CompactSummaryCard label="期限超過あり" value={`${summary.riskCount}件`} danger={summary.riskCount > 0} />
              <CompactSummaryCard label="未完了" value={`${summary.activeCount}件`} />
            </div>

            <div className="grid gap-2 sm:grid-cols-[minmax(14rem,18rem)_auto] sm:items-center">
              <input
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="プロジェクト名・説明で検索"
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
              />
              <div className="flex flex-wrap gap-2">
                {(Object.keys(FILTER_LABELS) as ViewerFilterKey[]).map((key) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setFilterKey(key)}
                    className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                      filterKey === key
                        ? 'border-slate-900 bg-slate-900 text-white'
                        : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    {FILTER_LABELS[key]}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </header>

      {error ? (
        <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p>
      ) : null}


      <section className="grid gap-6">
                <div className="grid gap-2 xl:grid-cols-[minmax(0,1.6fr)_minmax(20rem,1fr)]">
          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-slate-900">まず見る1件 + 次に見る2件</h2>
              <span className="text-[11px] text-slate-500">止まりや偏りを先頭表示</span>
            </div>
            {focusedProjects.length === 0 ? (
              <p className="mt-2 text-xs text-slate-500">該当プロジェクトはありません。</p>
            ) : (
              <div className="mt-2 grid gap-2 xl:grid-cols-[minmax(0,1.35fr)_minmax(18rem,1fr)]">
                <FeaturedProjectLink item={focusedProjects[0]} />
                <div className="grid gap-2">
                  {focusedProjects.slice(1).map((item) => (
                    <ProjectMiniLink key={item.project.id} item={item} />
                  ))}
                  {focusedProjects.length === 1 ? (
                    <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-xs text-slate-400">次点候補はありません。</div>
                  ) : null}
                </div>
              </div>
            )}
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-slate-900">止まり案件</h2>
              <span className="text-[11px] text-slate-500">危険順に自動整列</span>
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              <RiskChip label="期限超過あり" count={stalledProjectBuckets.overdue.length} danger />
              <RiskChip label="開始日未記録" count={stalledProjectBuckets.noStartedAt.length} />
              <RiskChip label="期限未設定" count={stalledProjectBuckets.noDueDate.length} />
              <RiskChip label="次アクション未設定" count={stalledProjectBuckets.noActions.length} />
            </div>
            <div className="mt-2 space-y-2">
              {stalledProjects.length === 0 ? (
                <p className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-5 text-xs text-slate-500">止まり案件はありません。</p>
              ) : (
                stalledProjects.map((item) => <ProjectMiniLink key={item.project.id} item={item} />)
              )}
            </div>
          </section>
        </div>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold text-slate-900">ガントチャート</h2>
          </div>
          <div className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
            {visibleGanttProjects.length} / {ganttProjects.length}件表示
          </div>
        </div>

        {isLoading ? (
          <div className="mt-4 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-sm text-slate-500">
            読み込み中...
          </div>
        ) : ganttProjects.length === 0 ? (
          <div className="mt-4 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-sm text-slate-500">
            started_at と due_date がそろったプロジェクトはありません。
          </div>
        ) : (
          <>
            <div className="mt-4 overflow-x-auto">
            <div className="grid min-w-max grid-cols-[320px_minmax(0,1fr)] gap-0">
              <div className="sticky left-0 z-20 border-r border-slate-200 bg-white">
                <div className="sticky top-0 z-20 grid h-14 items-end border-b border-slate-200 bg-white px-4 pb-3">
                  <span className="text-xs font-medium uppercase tracking-wide text-slate-500">Project</span>
                </div>
                {visibleGanttProjects.map((project) => (
                  <Link
                    key={project.id}
                    href={`/projects/${project.id}`}
                    className="block border-b border-slate-100 px-4 py-4 transition hover:bg-slate-50"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="font-medium text-slate-900">{formatProjectDisplayName(project.title)}</div>
                        <div className="mt-1 text-xs text-slate-500">{project.description ?? '説明は未設定です。'}</div>
                      </div>
                      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-700">
                        {project.completionRate}%
                      </span>
                    </div>
                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      <MiniInfo label="開始" value={formatDate(project.startedAt, '未記録')} />
                      <MiniInfo label="期限" value={formatDate(project.dueDate, '未設定')} danger={project.overdueCount > 0} />
                      <MiniInfo label="期間" value={formatDurationDays(project.startedAt, project.dueDate)} />
                      <MiniInfo label="残り" value={formatRelativeDueText(project.dueDate)} danger={project.overdueCount > 0} />
                    </div>
                  </Link>
                ))}
              </div>

              <div className="relative overflow-hidden">
                <div
                  className="sticky top-0 z-10 border-b border-slate-200 bg-white"
                  style={{ width: `${totalTimelineWidth}px`, minWidth: `${totalTimelineWidth}px` }}
                >
                  <div className="grid h-14 items-end" style={{ gridTemplateColumns: `repeat(${timelineDays.length}, ${DAY_WIDTH}px)` }}>
                    {timelineDays.map((day) => (
                      <div key={day.toISOString()} className="border-l border-slate-100 px-1 pb-2 text-center text-[10px] text-slate-500">
                        <div>{day.getMonth() + 1}/{day.getDate()}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {todayIndex >= 0 ? (
                  <div className="pointer-events-none absolute inset-y-0 z-10" style={{ left: `${todayIndex * DAY_WIDTH}px` }}>
                    <div className="h-full w-[2px] bg-rose-400/80" />
                  </div>
                ) : null}

                {visibleGanttProjects.map((project) => {
                  const bar = getBarStyle(project, timelineDays);
                  const isRisk = project.overdueCount > 0;
                  return (
                    <div
                      key={project.id}
                      className="relative border-b border-slate-100"
                      style={{ width: `${totalTimelineWidth}px`, minWidth: `${totalTimelineWidth}px` }}
                    >
                      <div className="grid h-[104px]" style={{ gridTemplateColumns: `repeat(${timelineDays.length}, ${DAY_WIDTH}px)` }}>
                        {timelineDays.map((day) => (
                          <div key={`${project.id}-${day.toISOString()}`} className="border-l border-slate-100 even:bg-slate-50/40" />
                        ))}
                      </div>

                      <div className="pointer-events-none absolute inset-y-0 left-0 right-0 flex items-center px-2">
                        <div
                          className={`flex h-12 items-center justify-between rounded-xl px-4 text-sm font-medium text-white shadow-sm ${
                            isRisk ? 'bg-rose-500' : project.status === 'done' ? 'bg-emerald-500' : 'bg-slate-900'
                          }`}
                          style={{ width: `${bar.width}px`, marginLeft: `${bar.left}px` }}
                        >
                          <span>{formatProjectDisplayName(project.title)}</span>
                          <span className="text-xs font-semibold opacity-90">{project.nextActionCount}件</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {hiddenGanttProjectCount > 0 ? (
            <div className="mt-4 flex justify-center">
              <button
                type="button"
                onClick={() => setViewerRenderCount((prev) => prev + 40)}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
              >
                さらに {hiddenGanttProjectCount} 件を表示
              </button>
            </div>
          ) : null}
          </>
        )}
      </section>
      </section>


      <div className="grid gap-6 xl:grid-cols-2">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <AlertStrip items={alerts} title="通知 / 警告" compact defaultCollapsed />
        </section>

        <HistoryPanel
          defaultCollapsed
          title="履歴"
          entries={viewerHistoryEntries}
          onClear={clearHistoryEntries}
          onExportCsv={handleExportViewerHistoryCsv}
          onExportJson={handleExportViewerHistoryJson}
          emptyLabel="Viewerの操作履歴はまだありません。"
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <details id="missing-start-projects" className="group rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 marker:hidden [&::-webkit-details-marker]:hidden">
            <div>
              <h2 className="text-xl font-semibold text-slate-900">開始日未記録</h2>
              <p className="mt-1 text-sm text-slate-500">started_at が入っていない project です。</p>
            </div>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
              {missingStartProjects.length}件
            </span>
          </summary>

          <div className="mt-4">
            <ViewerSideList projects={missingStartProjects} emptyLabel="該当なし" />
          </div>
        </details>

        <details id="missing-due-projects" className="group rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 marker:hidden [&::-webkit-details-marker]:hidden">
            <div>
              <h2 className="text-xl font-semibold text-slate-900">期限未設定</h2>
              <p className="mt-1 text-sm text-slate-500">due_date が未設定の project です。</p>
            </div>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
              {missingDueProjects.length}件
            </span>
          </summary>

          <div className="mt-4">
            <ViewerSideList projects={missingDueProjects} emptyLabel="該当なし" />
          </div>
        </details>
      </div>
    </main>
  );
}

function RiskChip({ label, count, danger = false }: { label: string; count: number; danger?: boolean }) {
  return (
    <span
      className={`inline-flex items-baseline gap-1 rounded-full px-3 py-1 text-xs font-medium shadow-sm ring-1 ${
        danger
          ? 'bg-rose-50 text-rose-700 ring-rose-200/90'
          : count > 0
            ? 'bg-amber-50 text-amber-700 ring-amber-200/90'
            : 'bg-white text-slate-500 ring-slate-200/80'
      }`}
    >
      <span>{label}</span>
      <span className="text-sm font-semibold tabular-nums">{count}</span>
      <span className="text-[11px]">件</span>
    </span>
  );
}

function CompactSummaryCard({
  label,
  value,
  danger = false,
}: {
  label: string;
  value: string;
  danger?: boolean;
}) {
  const match = value.match(/^(\d+)(.*)$/);
  const leading = match?.[1] ?? value;
  const trailing = match?.[2] ?? '';

  return (
    <article className={`rounded-xl px-3 py-2 shadow-sm ring-1 ${danger ? 'bg-rose-50 ring-rose-200/90' : 'bg-slate-50 ring-slate-200/80'}`}>
      <div className="flex items-center justify-between gap-3">
        <p className="text-[11px] text-slate-600">{label}</p>
        <p className={`flex items-baseline gap-0.5 tabular-nums ${danger ? 'text-rose-700' : 'text-slate-900'}`}>
          <span className="text-xl font-semibold tracking-tight">{leading}</span>
          <span className="text-[11px] font-medium text-slate-500">{trailing}</span>
        </p>
      </div>
    </article>
  );
}

function MiniInfo({
  label,
  value,
  danger = false,
}: {
  label: string;
  value: string;
  danger?: boolean;
}) {
  return (
    <div className={`rounded-lg px-3 py-2 ${danger ? 'bg-rose-50' : 'bg-slate-50'}`}>
      <div className="text-[11px] text-slate-500">{label}</div>
      <div className={`mt-1 text-xs font-medium ${danger ? 'text-rose-700' : 'text-slate-900'}`}>{value}</div>
    </div>
  );
}

function ViewerSideList({ projects, emptyLabel }: { projects: Project[]; emptyLabel: string }) {
  if (projects.length === 0) {
    return <div className="mt-4 rounded-2xl bg-slate-50 px-4 py-5 text-sm text-slate-500 ring-1 ring-dashed ring-slate-300"><div className="text-base">○</div><div className="mt-1">{emptyLabel}</div></div>;
  }

  return (
    <div className="mt-3 space-y-2">
      {projects.map((project) => (
        <Link
          key={project.id}
          href={`/projects/${project.id}`}
          className="block rounded-xl border border-slate-200 px-4 py-3 text-sm transition hover:bg-slate-50"
        >
          <div className="font-medium text-slate-900">{formatProjectDisplayName(project.title)}</div>
          <div className="mt-1 text-xs text-slate-500">
            {formatDate(project.startedAt, '開始日未記録')} / {formatDate(project.dueDate, '期限未設定')} / 次アクション {project.nextActionCount}件
          </div>
        </Link>
      ))}
    </div>
  );
}

function FeaturedProjectLink({ item }: { item: { project: Project; reason: string; detail: string; tone: 'danger' | 'warning' | 'info' } }) {
  const toneClassName =
    item.tone === 'danger'
      ? 'border-rose-200 bg-rose-50 text-rose-700'
      : item.tone === 'warning'
        ? 'border-amber-200 bg-amber-50 text-amber-700'
        : 'border-blue-200 bg-blue-50 text-blue-700';

  return (
    <Link href={`/projects/${item.project.id}`} className="rounded-3xl border border-slate-900 bg-gradient-to-br from-white via-slate-50 to-blue-50 p-5 shadow-md ring-1 ring-slate-900/10 transition hover:bg-slate-50">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">今見る1件</p>
      <div className={`mt-2 inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold ${toneClassName}`}>{item.reason}</div>
      <div className="mt-4 text-xl font-semibold text-slate-900">{formatProjectDisplayName(item.project.title)}</div>
      <div className="mt-2 text-sm leading-6 text-slate-600">{item.detail}</div>
    </Link>
  );
}

function ProjectMiniLink({ item }: { item: { project: Project; reason: string; detail: string; tone: 'danger' | 'warning' | 'info' } }) {
  const toneClassName =
    item.tone === 'danger'
      ? 'border-rose-200 bg-rose-50 text-rose-700'
      : item.tone === 'warning'
        ? 'border-amber-200 bg-amber-50 text-amber-700'
        : 'border-blue-200 bg-blue-50 text-blue-700';

  return (
    <Link href={`/projects/${item.project.id}`} className={`rounded-xl border p-3 transition ${item.tone === 'danger' ? 'border-rose-200 bg-rose-50/60' : 'border-slate-200 bg-slate-50/80'} hover:bg-slate-50`}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">次に見る</p>
      <div className="mt-1 flex flex-wrap items-center gap-2">
        <div className={`inline-flex rounded-full border px-2 py-1 text-[11px] font-semibold ${toneClassName}`}>{item.reason}</div>
      </div>
      <div className="mt-2 text-sm font-semibold text-slate-900">{formatProjectDisplayName(item.project.title)}</div>
      <div className="mt-1 text-xs text-slate-600">{item.detail}</div>
    </Link>
  );
}


