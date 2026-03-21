'use client';

import Link from 'next/link';
import { FormEvent, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { useProjects } from '@/lib/hooks/use-projects';
import { useTasks } from '@/lib/hooks/use-tasks';
import type { CreateProjectInput, Project } from '@/lib/domain/project';
import { AlertStrip, type AlertStripItem } from '@/components/ui/alert-strip';
import { ExportActions } from '@/components/ui/export-actions';
import { HistoryPanel } from '@/components/ui/history-panel';
import { formatDate, formatProjectDisplayName } from '@/lib/tasks/presentation';
import {
  PROJECT_NO_ACTIVE_NEXT_ACTION_DETAIL,
  PROJECT_NO_NEXT_ACTION_DETAIL,
  buildProjectRelationshipIssue,
  getTaskMap,
} from '@/lib/tasks/relationships';
import { buildHistoryRows, buildProjectExportRows, downloadCsv, downloadJson } from '@/lib/tasks/export';
import { useTaskHistory } from '@/lib/tasks/history';
import { buildProjectFocusDeck, buildProjectStalledBuckets, buildStalledProjectList } from '@/lib/tasks/focus';

type ProjectSortKey =
  | 'created_desc'
  | 'created_asc'
  | 'completion_desc'
  | 'overdue_desc'
  | 'actions_desc'
  | 'title_asc';

type ProjectQuickFilter =
  | 'all'
  | 'overdue_only'
  | 'incomplete_only'
  | 'completed_only';

const PROJECT_SORT_LABELS: Record<ProjectSortKey, string> = {
  created_desc: '新しい順',
  created_asc: '古い順',
  completion_desc: '完了率が高い順',
  overdue_desc: '期限超過が多い順',
  actions_desc: '次アクションが多い順',
  title_asc: '名前順',
};

const PROJECT_QUICK_FILTER_LABELS: Record<ProjectQuickFilter, string> = {
  all: 'すべて',
  overdue_only: '期限超過あり',
  incomplete_only: '未完了あり',
  completed_only: '完了率100%',
};

function sortProjects(projects: Project[], sortKey: ProjectSortKey): Project[] {
  const copied = [...projects];

  switch (sortKey) {
    case 'created_asc':
      return copied.sort((a, b) => a.createdAt.localeCompare(b.createdAt));

    case 'completion_desc':
      return copied.sort((a, b) => {
        if (b.completionRate !== a.completionRate) return b.completionRate - a.completionRate;
        if (b.doneCount !== a.doneCount) return b.doneCount - a.doneCount;
        return b.createdAt.localeCompare(a.createdAt);
      });

    case 'overdue_desc':
      return copied.sort((a, b) => {
        if (b.overdueCount !== a.overdueCount) return b.overdueCount - a.overdueCount;
        if (b.nextActionCount !== a.nextActionCount) return b.nextActionCount - a.nextActionCount;
        return b.createdAt.localeCompare(a.createdAt);
      });

    case 'actions_desc':
      return copied.sort((a, b) => {
        if (b.nextActionCount !== a.nextActionCount) return b.nextActionCount - a.nextActionCount;
        return b.createdAt.localeCompare(a.createdAt);
      });

    case 'title_asc':
      return copied.sort((a, b) => a.title.localeCompare(b.title, 'ja'));

    case 'created_desc':
    default:
      return copied.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
}

function filterProjectsByQuery(projects: Project[], query: string): Project[] {
  const normalized = query.trim().toLowerCase();

  if (!normalized) return projects;

  return projects.filter((project) => {
    const haystack = `${formatProjectDisplayName(project.title)} ${project.description ?? ''}`.toLowerCase();
    return haystack.includes(normalized);
  });
}

function filterProjectsByQuickFilter(
  projects: Project[],
  quickFilter: ProjectQuickFilter,
): Project[] {
  switch (quickFilter) {
    case 'overdue_only':
      return projects.filter((project) => project.overdueCount > 0);

    case 'incomplete_only':
      return projects.filter((project) => project.linkedTaskCount > 0 && project.completionRate < 100);

    case 'completed_only':
      return projects.filter((project) => project.linkedTaskCount > 0 && project.completionRate === 100);

    case 'all':
    default:
      return projects;
  }
}

function statusLabel(status: Project['status'] | undefined): string {
  switch (status) {
    case 'todo':
      return '未着手';
    case 'doing':
      return '進行中';
    case 'waiting':
      return '待ち';
    case 'done':
      return '完了';
    default:
      return '未設定';
  }
}

export default function ProjectsPage() {
  const { projects, isLoading, error, createProject, deleteProject } = useProjects();
  const { tasks, error: tasksError } = useTasks();
  const [sortKey, setSortKey] = useState<ProjectSortKey>('created_desc');
  const [searchQuery, setSearchQuery] = useState('');
  const deferredSearchQuery = useDeferredValue(searchQuery);
  const [quickFilter, setQuickFilter] = useState<ProjectQuickFilter>('all');
  const [newProjectTitle, setNewProjectTitle] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [projectRenderCount, setProjectRenderCount] = useState(24);
  const [pageNotice, setPageNotice] = useState<string | null>(null);
  const newProjectTitleInputRef = useRef<HTMLInputElement | null>(null);
  const [pageError, setPageError] = useState<string | null>(null);
  const { entries: historyEntries, append: appendHistoryEntry, clear: clearHistoryEntries } = useTaskHistory();

  const filteredAndSortedProjects = useMemo(() => {
    const byQuery = filterProjectsByQuery(projects, deferredSearchQuery);
    const byQuickFilter = filterProjectsByQuickFilter(byQuery, quickFilter);
    return sortProjects(byQuickFilter, sortKey);
  }, [deferredSearchQuery, projects, quickFilter, sortKey]);

  useEffect(() => {
    setProjectRenderCount(24);
  }, [deferredSearchQuery, quickFilter, sortKey]);

  const visibleProjects = useMemo(() => filteredAndSortedProjects.slice(0, projectRenderCount), [filteredAndSortedProjects, projectRenderCount]);
  const focusedProjects = useMemo(() => buildProjectFocusDeck(filteredAndSortedProjects, 3), [filteredAndSortedProjects]);
  const taskMap = useMemo(() => getTaskMap(tasks), [tasks]);
  const stalledProjectBuckets = useMemo(() => buildProjectStalledBuckets(filteredAndSortedProjects, tasks, taskMap), [filteredAndSortedProjects, taskMap, tasks]);
  const stalledProjects = useMemo(() => buildStalledProjectList(filteredAndSortedProjects, 4, tasks, taskMap), [filteredAndSortedProjects, taskMap, tasks]);
  const hiddenProjectCount = Math.max(filteredAndSortedProjects.length - visibleProjects.length, 0);

  const missingDueProjects = useMemo(() => {
    return filteredAndSortedProjects.filter((project) => !project.dueDate);
  }, [filteredAndSortedProjects]);


  const missingStartProjects = useMemo(() => {
    return filteredAndSortedProjects.filter((project) => !project.startedAt);
  }, [filteredAndSortedProjects]);

  const projectsWithoutActions = useMemo(() => {
    return filteredAndSortedProjects.filter((project) => project.linkedTaskCount === 0);
  }, [filteredAndSortedProjects]);

  const projectsWithoutActiveActions = useMemo(() => {
    return filteredAndSortedProjects.filter(
      (project) => project.linkedTaskCount > 0 && project.nextActionCount === 0 && project.status !== 'done',
    );
  }, [filteredAndSortedProjects]);

  const projectsWithoutNextCandidates = useMemo(() => {
    return filteredAndSortedProjects.filter((project) =>
      buildProjectRelationshipIssue(project, tasks, taskMap)?.reason === 'この後候補なし',
    );
  }, [filteredAndSortedProjects, taskMap, tasks]);

  const projectsWithBrokenNextCandidates = useMemo(() => {
    return filteredAndSortedProjects.filter((project) =>
      buildProjectRelationshipIssue(project, tasks, taskMap)?.reason === '候補リンク切れ',
    );
  }, [filteredAndSortedProjects, taskMap, tasks]);

  const projectRelationshipIssues = useMemo(() => {
    return filteredAndSortedProjects.reduce<Record<string, ReturnType<typeof buildProjectRelationshipIssue>>>((acc, project) => {
      acc[project.id] = buildProjectRelationshipIssue(project, tasks, taskMap);
      return acc;
    }, {});
  }, [filteredAndSortedProjects, taskMap, tasks]);

  const projectAlertItems = useMemo(() => {
    const items: AlertStripItem[] = [];

    if (missingStartProjects.length > 0) {
      items.push({
        id: 'missing-start',
        label: '開始日未記録',
        count: `${missingStartProjects.length}件`,
        tone: 'warning',
        href: '#missing-start-projects',
      });
    }

    if (missingDueProjects.length > 0) {
      items.push({
        id: 'missing-due',
        label: '期限未設定',
        count: `${missingDueProjects.length}件`,
        tone: 'warning',
        href: '#missing-due-projects',
      });
    }

    if (projectsWithoutActions.length > 0) {
      items.push({
        id: 'no-actions',
        label: '次アクション未設定',
        count: `${projectsWithoutActions.length}件`,
        tone: 'warning',
        description: PROJECT_NO_NEXT_ACTION_DETAIL,
        href: '#no-action-projects',
      });
    }

    if (projectsWithoutActiveActions.length > 0) {
      items.push({
        id: 'no-active-actions',
        label: '進める一手なし',
        count: `${projectsWithoutActiveActions.length}件`,
        tone: 'info',
        description: PROJECT_NO_ACTIVE_NEXT_ACTION_DETAIL,
        href: '#no-active-action-projects',
      });
    }

    if (projectsWithoutNextCandidates.length > 0) {
      items.push({
        id: 'no-next-candidates',
        label: 'この後候補なし',
        count: `${projectsWithoutNextCandidates.length}件`,
        tone: 'info',
        description: '関連タスクはあるが、「この後に見る候補」がまだ未設定です。',
        href: '#no-next-candidate-projects',
      });
    }

    if (projectsWithBrokenNextCandidates.length > 0) {
      items.push({
        id: 'broken-next-candidates',
        label: '候補リンク切れ',
        count: `${projectsWithBrokenNextCandidates.length}件`,
        tone: 'warning',
        description: '「この後に見る候補」が削除済み、または不正な project です。',
        href: '#broken-next-candidate-projects',
      });
    }

    return items;
  }, [missingDueProjects.length, missingStartProjects.length, projectsWithBrokenNextCandidates.length, projectsWithoutActions.length, projectsWithoutActiveActions.length, projectsWithoutNextCandidates.length]);

  const stats = useMemo(() => {
    const visibleProjectCount = filteredAndSortedProjects.length;
    const overdueProjectCount = filteredAndSortedProjects.filter(
      (project) => project.overdueCount > 0,
    ).length;
    const incompleteProjectCount = filteredAndSortedProjects.filter(
      (project) => project.nextActionCount > 0 && project.completionRate < 100,
    ).length;
    const totalNextActions = filteredAndSortedProjects.reduce(
      (sum, project) => sum + project.nextActionCount,
      0,
    );
    const averageCompletionRate =
      visibleProjectCount === 0
        ? 0
        : Math.round(
            filteredAndSortedProjects.reduce(
              (sum, project) => sum + project.completionRate,
              0,
            ) / visibleProjectCount,
          );

    return {
      visibleProjectCount,
      overdueProjectCount,
      incompleteProjectCount,
      totalNextActions,
      averageCompletionRate,
    };
  }, [filteredAndSortedProjects]);

  const projectHistoryEntries = useMemo(() => historyEntries.filter((entry) => entry.scope === 'projects'), [historyEntries]);

  const handleExportProjectsCsv = () => {
    downloadCsv('projects-list', buildProjectExportRows(filteredAndSortedProjects));
    appendHistoryEntry({
      scope: 'projects',
      action: 'export_csv',
      summary: 'ProjectsをCSV出力',
      detail: `表示中 ${filteredAndSortedProjects.length}件を出力`,
      tone: 'info',
    });
  };

  const handleExportProjectsJson = () => {
    downloadJson('projects-list', buildProjectExportRows(filteredAndSortedProjects));
    appendHistoryEntry({
      scope: 'projects',
      action: 'export_json',
      summary: 'ProjectsをJSON出力',
      detail: `表示中 ${filteredAndSortedProjects.length}件を出力`,
      tone: 'info',
    });
  };

  const handleExportProjectHistoryCsv = () => {
    downloadCsv('projects-history', buildHistoryRows(projectHistoryEntries));
  };

  const handleExportProjectHistoryJson = () => {
    downloadJson('projects-history', buildHistoryRows(projectHistoryEntries));
  };

  const activeFilterChips = useMemo(() => {
    const chips: string[] = [];

    if (searchQuery.trim()) chips.push(`検索: ${searchQuery.trim()}`);
    if (quickFilter !== 'all') {
      chips.push(`クイック絞り込み: ${PROJECT_QUICK_FILTER_LABELS[quickFilter]}`);
    }
    chips.push(`並び順: ${PROJECT_SORT_LABELS[sortKey]}`);

    return chips;
  }, [quickFilter, searchQuery, sortKey]);

  const handleCreateProject = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const title = newProjectTitle.trim();
    if (!title) return;

    setSubmitting(true);
    setPageError(null);
    setPageNotice(null);

    try {
      await createProject({ title } as CreateProjectInput);
      setNewProjectTitle('');
      setPageNotice('プロジェクトを作成しました。');
      newProjectTitleInputRef.current?.focus();
      appendHistoryEntry({
        scope: 'projects',
        action: 'create_project',
        summary: `プロジェクト作成: ${title}`,
        tone: 'success',
      });
    } catch (createError) {
      const message =
        createError instanceof Error ? createError.message : 'プロジェクトの作成に失敗しました';
      setPageError(message);
    }

    setSubmitting(false);
  };

  const handleDeleteProject = async (project: Project) => {
    const confirmed = window.confirm(`「${formatProjectDisplayName(project.title)}」を削除します。よろしいですか？`);
    if (!confirmed) return;

    setPageError(null);
    setPageNotice(null);

    try {
      await deleteProject(project.id);
      setPageNotice(`「${formatProjectDisplayName(project.title)}」を削除しました。`);
      appendHistoryEntry({
        scope: 'projects',
        action: 'delete_project',
        summary: `プロジェクト削除: ${formatProjectDisplayName(project.title)}`,
        tone: 'danger',
        contextId: project.id,
      });
    } catch (deleteError) {
      const message =
        deleteError instanceof Error ? deleteError.message : 'プロジェクトの削除に失敗しました';
      setPageError(message);
    }
  };

  return (
    <main className="mx-auto flex w-full max-w-[106rem] flex-col gap-6 px-4 py-6 sm:px-6">
      <header className="sticky top-0 z-40 -mx-4 px-4 py-1 backdrop-blur sm:-mx-6 sm:px-6">
        <div className="rounded-2xl border border-slate-200 bg-white/95 px-4 py-3 shadow-sm ring-1 ring-slate-900/5 sm:px-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <h1 className="text-2xl font-semibold text-slate-900">Projects</h1>
              <span className="rounded-full bg-blue-50 px-2.5 py-1 text-[11px] font-semibold text-blue-700">一覧判断</span>
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-600">表示中 {stats.visibleProjectCount}件</span>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Link
                href="/projects/viewer"
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
              >
                Viewer
              </Link>
              <Link
                href="/"
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
              >
                Board
              </Link>
              <ExportActions
                label="Export"
                onExportCsv={handleExportProjectsCsv}
                onExportJson={handleExportProjectsJson}
              />
            </div>
          </div>
        </div>
      </header>

      <div className="grid gap-6 xl:grid-cols-[340px_minmax(0,1fr)]">
        <aside className="space-y-6 xl:sticky xl:top-32 xl:self-start">
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">Add project</h2>
            <p className="mt-1 text-sm text-slate-500">
              GTD分類が「project」のタスクとして作成します。
            </p>

            <form onSubmit={(e) => void handleCreateProject(e)} className="mt-4 space-y-3">
              <input
                ref={newProjectTitleInputRef}
                value={newProjectTitle}
                onChange={(e) => setNewProjectTitle(e.target.value)}
                placeholder="例: 展示会準備"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                autoFocus
              />
              <button
                type="submit"
                disabled={submitting}
                className="w-full rounded-lg bg-slate-900 px-4 py-3 text-sm font-medium text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {submitting ? '作成中...' : 'Add project'}
              </button>
            </form>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">検索 / 絞り込み</h2>

            <div className="mt-4 space-y-3">
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="プロジェクト名・説明で検索"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />

              <select
                value={sortKey}
                onChange={(e) => setSortKey(e.target.value as ProjectSortKey)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              >
                <option value="created_desc">新しい順</option>
                <option value="created_asc">古い順</option>
                <option value="completion_desc">完了率が高い順</option>
                <option value="overdue_desc">期限超過が多い順</option>
                <option value="actions_desc">次アクションが多い順</option>
                <option value="title_asc">名前順</option>
              </select>

              <div className="flex flex-wrap gap-2">
                <QuickFilterButton
                  label="すべて"
                  active={quickFilter === 'all'}
                  onClick={() => setQuickFilter('all')}
                />
                <QuickFilterButton
                  label="期限超過あり"
                  active={quickFilter === 'overdue_only'}
                  onClick={() => setQuickFilter('overdue_only')}
                />
                <QuickFilterButton
                  label="未完了あり"
                  active={quickFilter === 'incomplete_only'}
                  onClick={() => setQuickFilter('incomplete_only')}
                />
                <QuickFilterButton
                  label="完了率100%"
                  active={quickFilter === 'completed_only'}
                  onClick={() => setQuickFilter('completed_only')}
                />
              </div>

            </div>
          </section>

          <details id="missing-start-projects" className="group rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 marker:hidden [&::-webkit-details-marker]:hidden">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">開始日未記録</h2>
                <p className="mt-1 text-sm text-slate-500">doing 起点の started_at がまだ入っていない project です。</p>
              </div>
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] text-slate-600">{missingStartProjects.length}件</span>
            </summary>

            {missingStartProjects.length === 0 ? (
              <p className="mt-4 text-sm text-slate-400">該当なし</p>
            ) : (
              <div className="mt-4 space-y-2">
                {missingStartProjects.map((project) => (
                  <Link
                    key={project.id}
                    href={`/projects/${project.id}`}
                    className="block rounded-xl border border-slate-200 px-4 py-3 text-sm transition hover:bg-slate-50"
                  >
                    <div className="font-medium text-slate-900">{formatProjectDisplayName(project.title)}</div>
                    <div className="mt-1 text-xs text-slate-500">
                      {statusLabel(project.status)} / 期限 {formatDate(project.dueDate)}
                    </div>
                  </Link>
                ))}
              </div>
            )}

          </details>

          <details id="no-active-action-projects" className="group rounded-2xl border border-sky-200 bg-sky-50/40 p-5 shadow-sm">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 marker:hidden [&::-webkit-details-marker]:hidden">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">進める一手なし</h2>
                <p className="mt-1 text-sm text-slate-600">関連タスクはあるものの、未完了の一手が残っていない project です。</p>
              </div>
              <span className="rounded-full bg-sky-100 px-2.5 py-1 text-[11px] text-sky-700">{projectsWithoutActiveActions.length}件</span>
            </summary>

            {projectsWithoutActiveActions.length === 0 ? (
              <p className="mt-4 text-sm text-slate-400">該当なし</p>
            ) : (
              <div className="mt-4 space-y-2">
                {projectsWithoutActiveActions.map((project) => (
                  <Link
                    key={project.id}
                    href={`/projects/${project.id}`}
                    className="block rounded-xl border border-sky-200 bg-white px-4 py-3 text-sm transition hover:bg-sky-50/60"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="font-medium text-slate-900">{formatProjectDisplayName(project.title)}</div>
                        <div className="mt-1 text-xs text-sky-700">{PROJECT_NO_ACTIVE_NEXT_ACTION_DETAIL}</div>
                      </div>
                      <span className="rounded-full bg-sky-100 px-2 py-1 text-[11px] font-medium text-sky-700">要確認</span>
                    </div>
                    <div className="mt-2 text-xs text-slate-500">
                      {statusLabel(project.status)} / 関連タスク {project.linkedTaskCount}件 / 完了 {project.doneCount}件
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </details>


          <details id="no-next-candidate-projects" className="group rounded-2xl border border-cyan-200 bg-cyan-50/40 p-5 shadow-sm">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 marker:hidden [&::-webkit-details-marker]:hidden">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">この後候補なし</h2>
                <p className="mt-1 text-sm text-slate-600">進める一手はあるものの、「この後に見る候補」がまだ未設定の project です。</p>
              </div>
              <span className="rounded-full bg-cyan-100 px-2.5 py-1 text-[11px] text-cyan-700">{projectsWithoutNextCandidates.length}件</span>
            </summary>

            {projectsWithoutNextCandidates.length === 0 ? (
              <p className="mt-4 text-sm text-slate-400">該当なし</p>
            ) : (
              <div className="mt-4 space-y-2">
                {projectsWithoutNextCandidates.map((project) => (
                  <Link
                    key={project.id}
                    href={`/projects/${project.id}`}
                    className="block rounded-xl border border-cyan-200 bg-white px-4 py-3 text-sm transition hover:bg-cyan-50/60"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="font-medium text-slate-900">{formatProjectDisplayName(project.title)}</div>
                        <div className="mt-1 text-xs text-cyan-700">関連タスクはあるが、終わった後に見る候補がまだありません</div>
                      </div>
                      <span className="rounded-full bg-cyan-100 px-2 py-1 text-[11px] font-medium text-cyan-700">要確認</span>
                    </div>
                    <div className="mt-2 text-xs text-slate-500">
                      {statusLabel(project.status)} / 関連タスク {project.linkedTaskCount}件 / 進める一手 {project.nextActionCount}件
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </details>

          <details id="broken-next-candidate-projects" className="group rounded-2xl border border-rose-200 bg-rose-50/40 p-5 shadow-sm">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 marker:hidden [&::-webkit-details-marker]:hidden">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">候補リンク切れ</h2>
                <p className="mt-1 text-sm text-slate-600">「この後に見る候補」が削除済み、または不正な project です。</p>
              </div>
              <span className="rounded-full bg-rose-100 px-2.5 py-1 text-[11px] text-rose-700">{projectsWithBrokenNextCandidates.length}件</span>
            </summary>

            {projectsWithBrokenNextCandidates.length === 0 ? (
              <p className="mt-4 text-sm text-slate-400">該当なし</p>
            ) : (
              <div className="mt-4 space-y-2">
                {projectsWithBrokenNextCandidates.map((project) => (
                  <Link
                    key={project.id}
                    href={`/projects/${project.id}`}
                    className="block rounded-xl border border-rose-200 bg-white px-4 py-3 text-sm transition hover:bg-rose-50/60"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="font-medium text-slate-900">{formatProjectDisplayName(project.title)}</div>
                        <div className="mt-1 text-xs text-rose-700">{projectRelationshipIssues[project.id]?.detail ?? '「この後に見る候補」を見直したい状態です'}</div>
                      </div>
                      <span className="rounded-full bg-rose-100 px-2 py-1 text-[11px] font-medium text-rose-700">要確認</span>
                    </div>
                    <div className="mt-2 text-xs text-slate-500">
                      {statusLabel(project.status)} / 関連タスク {project.linkedTaskCount}件 / 進める一手 {project.nextActionCount}件
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </details>

          <details id="no-action-projects" className="group rounded-2xl border border-amber-200 bg-amber-50/40 p-5 shadow-sm">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 marker:hidden [&::-webkit-details-marker]:hidden">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">次アクション未設定</h2>
                <p className="mt-1 text-sm text-slate-600">保存はできますが、止まり候補として先に見つけたい project です。</p>
              </div>
              <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[11px] text-amber-700">{projectsWithoutActions.length}件</span>
            </summary>

            {projectsWithoutActions.length === 0 ? (
              <p className="mt-4 text-sm text-slate-400">該当なし</p>
            ) : (
              <div className="mt-4 space-y-2">
                {projectsWithoutActions.map((project) => (
                  <Link
                    key={project.id}
                    href={`/projects/${project.id}`}
                    className="block rounded-xl border border-amber-200 bg-white px-4 py-3 text-sm transition hover:bg-amber-50/60"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="font-medium text-slate-900">{formatProjectDisplayName(project.title)}</div>
                        <div className="mt-1 text-xs text-amber-700">{PROJECT_NO_NEXT_ACTION_DETAIL}</div>
                      </div>
                      <span className="rounded-full bg-amber-100 px-2 py-1 text-[11px] font-medium text-amber-700">要確認</span>
                    </div>
                    <div className="mt-2 text-xs text-slate-500">
                      {statusLabel(project.status)} / 期限 {formatDate(project.dueDate)}
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </details>

          <details id="missing-due-projects" className="group rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 marker:hidden [&::-webkit-details-marker]:hidden">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">期限未設定</h2>
                <p className="mt-1 text-sm text-slate-500">期限が未設定の project です。</p>
              </div>
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] text-slate-600">{missingDueProjects.length}件</span>
            </summary>

            {missingDueProjects.length === 0 ? (
              <p className="mt-4 text-sm text-slate-400">該当なし</p>
            ) : (
              <div className="mt-4 space-y-2">
                {missingDueProjects.map((project) => (
                  <Link
                    key={project.id}
                    href={`/projects/${project.id}`}
                    className="block rounded-xl border border-slate-200 px-4 py-3 text-sm transition hover:bg-slate-50"
                  >
                    <div className="font-medium text-slate-900">{formatProjectDisplayName(project.title)}</div>
                    <div className="mt-1 text-xs text-slate-500">
                      {statusLabel(project.status)} / 次アクション {project.nextActionCount}件
                    </div>
                  </Link>
                ))}
              </div>

            )}
          </details>

          {pageError || error || tasksError ? (
            <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {pageError ?? error ?? tasksError}
            </p>
          ) : null}

          {pageNotice ? (
            <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
              {pageNotice}
            </p>
          ) : null}

          <HistoryPanel
            title="履歴"
            entries={projectHistoryEntries}
            onClear={clearHistoryEntries}
            onExportCsv={handleExportProjectHistoryCsv}
            onExportJson={handleExportProjectHistoryJson}
            emptyLabel="Projects画面の操作履歴はまだありません。"
          />
        </aside>

        <section className="space-y-6">
          <div className="sticky top-28 z-30 space-y-2">
            <section className="rounded-2xl border border-slate-200 bg-white/95 p-2.5 shadow-sm backdrop-blur">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-sm font-semibold text-slate-900 sm:text-base">Projects の現在地</h2>
                <div className="inline-flex items-center rounded-full bg-blue-50 px-2.5 py-1 text-[11px] font-medium text-blue-700">
                  表示モード: 一覧
                </div>
                <div className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-700">
                  並び順: {PROJECT_SORT_LABELS[sortKey]}
                </div>
                <div className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-700">
                  Project
                </div>
              </div>

              <div className="mt-1.5 grid gap-1.5 md:grid-cols-2 xl:grid-cols-4">
                <CompactContextStat label="期限超過あり" value={`${stats.overdueProjectCount}件`} danger={stats.overdueProjectCount > 0} />
                <CompactContextStat label="未完了あり" value={`${stats.incompleteProjectCount}件`} />
                <CompactContextStat label="次アクション総数" value={`${stats.totalNextActions}件`} />
                <CompactContextStat label="平均完了率" value={`${stats.averageCompletionRate}%`} />
              </div>

              {activeFilterChips.length > 0 ? (
                <div className="mt-2 flex flex-wrap gap-2">
                  {activeFilterChips.map((chip) => <FilterChip key={chip} label={chip} />)}
                </div>
              ) : null}
              <div className="mt-2">
                <AlertStrip items={projectAlertItems} compact />
              </div>

              <div className="mt-2 grid gap-2 xl:grid-cols-[minmax(0,1.6fr)_minmax(20rem,1fr)]">
                <section className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-sm font-semibold text-slate-900">今見る1件 / 次に見る2件</h3>
                    <span className="text-[11px] text-slate-500">最初に見る順番だけを残す</span>
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
                          <div className="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-6 text-xs text-slate-400">次点候補はありません。</div>
                        ) : null}
                      </div>
                    </div>
                  )}
                </section>

                <section className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-sm font-semibold text-slate-900">止まり案件</h3>
                    <span className="text-[11px] text-slate-500">理由と経過で自然に見つかる</span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <RiskChip label="期限超過あり" count={stalledProjectBuckets.overdue.length} danger />
                    <RiskChip label="開始日未記録" count={stalledProjectBuckets.noStartedAt.length} />
                    <RiskChip label="期限未設定" count={stalledProjectBuckets.noDueDate.length} />
                    <RiskChip label="次アクション未設定" count={stalledProjectBuckets.noActions.length} />
                    <RiskChip label="進める一手なし" count={stalledProjectBuckets.noActiveActions.length} />
                    <RiskChip label="この後候補なし" count={stalledProjectBuckets.noNextCandidate.length} />
                    <RiskChip label="候補リンク切れ" count={stalledProjectBuckets.brokenNextCandidate.length} />
                  </div>
                  <div className="mt-2 space-y-2">
                    {stalledProjects.length === 0 ? (
                      <p className="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-5 text-xs text-slate-500">止まり案件はありません。</p>
                    ) : (
                      stalledProjects.map((item) => <ProjectMiniLink key={item.project.id} item={item} />)
                    )}
                  </div>
                </section>
              </div>
            </section>
          </div>

          <section id="projects-list" className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-semibold text-slate-900">一覧</h2>
              </div>
            </div>

            {isLoading ? (
              <div className="mt-4 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-sm text-slate-500">
                読み込み中...
              </div>
            ) : filteredAndSortedProjects.length === 0 ? (
              <div className="mt-4 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-sm text-slate-500">
                条件に一致するプロジェクトはありません。
              </div>
            ) : (
              <>
                <div className="mt-4 grid gap-4 xl:grid-cols-2">
                {visibleProjects.map((project) => {
                  const relationIssue = projectRelationshipIssues[project.id];
                  const borderClass = project.linkedTaskCount === 0
                    ? 'border-amber-200 ring-1 ring-amber-100'
                    : project.nextActionCount === 0 && project.status !== 'done'
                      ? 'border-sky-200 ring-1 ring-sky-100'
                      : relationIssue?.reason === 'この後候補なし'
                        ? 'border-cyan-200 ring-1 ring-cyan-100'
                        : relationIssue?.reason === '候補リンク切れ'
                          ? 'border-rose-200 ring-1 ring-rose-100'
                          : 'border-slate-200 hover:border-slate-300';

                  return (
                  <article
                    key={project.id}
                    className={`rounded-2xl border bg-white p-5 shadow-sm transition hover:bg-slate-50/60 ${borderClass}`}
                  >
                    <Link
                      href={`/projects/${project.id}`}
                      className="block rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-300"
                      aria-label={`${formatProjectDisplayName(project.title)} の詳細を開く`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <h3 className="text-xl font-semibold text-slate-900">{formatProjectDisplayName(project.title)}</h3>
                          <p className="mt-1 text-sm text-slate-600">
                            {project.description ?? '説明は未設定です。'}
                          </p>
                        </div>

                        <div className="flex shrink-0 flex-col items-end gap-2">
                          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
                            {project.completionRate}%
                          </span>
                          {project.linkedTaskCount === 0 ? (
                            <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-medium text-amber-700">
                              次アクション未設定
                            </span>
                          ) : project.nextActionCount === 0 && project.status !== 'done' ? (
                            <span className="rounded-full bg-sky-100 px-2.5 py-1 text-[11px] font-medium text-sky-700">
                              進める一手なし
                            </span>
                          ) : relationIssue?.reason === 'この後候補なし' ? (
                            <span className="rounded-full bg-cyan-100 px-2.5 py-1 text-[11px] font-medium text-cyan-700">
                              この後候補なし
                            </span>
                          ) : relationIssue?.reason === '候補リンク切れ' ? (
                            <span className="rounded-full bg-rose-100 px-2.5 py-1 text-[11px] font-medium text-rose-700">
                              候補リンク切れ
                            </span>
                          ) : null}
                        </div>
                      </div>

                      <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-200">
                        <div
                          className="h-full rounded-full bg-slate-900"
                          style={{ width: `${project.completionRate}%` }}
                        />
                      </div>

                      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                        <InfoChip label="開始" value={formatDate(project.startedAt)} />
                        <InfoChip label="期限" value={formatDate(project.dueDate)} />
                        <InfoChip label="状態" value={statusLabel(project.status)} />
                        {project.linkedTaskCount === 0 ? <InfoChip label="要確認" value="次アクション未設定" warning /> : null}
                        {project.linkedTaskCount > 0 && project.nextActionCount === 0 && project.status !== 'done' ? <InfoChip label="要確認" value="進める一手なし" /> : null}
                        {relationIssue?.reason === 'この後候補なし' ? <InfoChip label="要確認" value="この後候補なし" /> : null}
                        {relationIssue?.reason === '候補リンク切れ' ? <InfoChip label="要確認" value="候補リンク切れ" danger /> : null}
                        <InfoChip label="進める一手" value={`${project.nextActionCount}件`} />
                        <InfoChip label="関連タスク" value={`${project.linkedTaskCount}件`} />
                        <InfoChip label="完了" value={`${project.doneCount}件`} />
                        <InfoChip
                          label="期限超過"
                          value={`${project.overdueCount}件`}
                          danger={project.overdueCount > 0}
                        />
                      </div>

                      <div className="mt-4 flex flex-wrap gap-2">
                        {!project.startedAt ? <FilterChip label="開始日未記録" /> : null}
                        {!project.dueDate ? <FilterChip label="期限未設定" /> : null}
                        {project.linkedTaskCount === 0 ? <FilterChip label="次アクション未設定" subtle /> : null}
                        {project.linkedTaskCount > 0 && project.nextActionCount === 0 && project.status !== 'done' ? <FilterChip label="進める一手なし" subtle /> : null}
                        {relationIssue?.reason === 'この後候補なし' ? <FilterChip label="この後候補なし" subtle /> : null}
                        {relationIssue?.reason === '候補リンク切れ' ? <FilterChip label="候補リンク切れ" subtle /> : null}
                      </div>
                    </Link>

                    <div className="mt-4 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => void handleDeleteProject(project)}
                        className="rounded-lg border border-rose-300 bg-white px-4 py-2 text-sm font-medium text-rose-700 transition hover:bg-rose-50"
                      >
                        削除
                      </button>
                    </div>
                  </article>
                  );
                })}
              </div>


              {hiddenProjectCount > 0 ? (
                <div className="mt-4 flex justify-center">
                  <button
                    type="button"
                    onClick={() => setProjectRenderCount((prev) => prev + 24)}
                    className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                  >
                    さらに {hiddenProjectCount} 件を表示
                  </button>
                </div>
              ) : null}
              </>
            )}
          </section>
        </section>
      </div>
    </main>
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

function CompactContextStat({
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
    <article className={`rounded-xl px-3 py-1.5 shadow-sm ring-1 ${danger ? 'bg-rose-50 ring-rose-200/90' : 'bg-slate-50 ring-slate-200/80'}`}>
      <div className="flex items-center justify-between gap-3">
        <p className="text-[11px] text-slate-600">{label}</p>
        <p className={`flex items-baseline gap-0.5 tabular-nums ${danger ? 'text-rose-700' : 'text-slate-900'}`}>
          <span className="text-lg font-semibold tracking-tight">{leading}</span>
          <span className="text-[11px] font-medium text-slate-500">{trailing}</span>
        </p>
      </div>
    </article>
  );
}

function FilterChip({ label, subtle = false }: { label: string; subtle?: boolean }) {
  return (
    <span
      className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ${
        subtle ? 'bg-slate-100 text-slate-600' : 'bg-blue-600 text-white'
      }`}
    >
      {label}
    </span>
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

function QuickFilterButton({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-4 py-2 text-sm font-medium transition ${
        active
          ? 'border-slate-900 bg-blue-600 text-white'
          : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
      }`}
    >
      {label}
    </button>
  );
}

function InfoChip({
  label,
  value,
  danger = false,
  warning = false,
}: {
  label: string;
  value: string;
  danger?: boolean;
  warning?: boolean;
}) {
  return (
    <div className={`rounded-xl px-4 py-3 ${danger ? 'bg-rose-50' : warning ? 'bg-amber-50' : 'bg-slate-50'}`}>
      <p className={`text-xs ${danger ? 'text-rose-600' : warning ? 'text-amber-700' : 'text-slate-500'}`}>{label}</p>
      <p className={`mt-1 text-sm font-medium ${danger ? 'text-rose-700' : warning ? 'text-amber-800' : 'text-slate-900'}`}>
        {value}
      </p>
    </div>
  );
}
