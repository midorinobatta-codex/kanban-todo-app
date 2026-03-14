'use client';

import Link from 'next/link';
import {
  FormEvent,
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type DragEvent,
  type KeyboardEvent,
  type PointerEvent,
} from 'react';
import { getSupabaseClient } from '@/lib/supabase/client';
import {
  IMPORTANCE_LABELS,
  TASK_GTD_LABELS,
  TASK_GTD_VALUES,
  TASK_IMPORTANCE_VALUES,
  TASK_PROGRESS_LABELS,
  TASK_PROGRESS_ORDER,
  TASK_URGENCY_VALUES,
  URGENCY_LABELS,
  type Task,
  type TaskGtdCategory,
  type TaskImportance,
  type TaskPriority,
  type TaskProgress,
  type TaskUrgency,
} from '@/lib/types';
import { useProjects } from '@/lib/hooks/use-projects';
import { TaskEditModal, type TaskEditValues } from '@/components/task-edit-modal';
import { updateTaskStatus } from '@/lib/infra/supabase/task-status';
import { AlertStrip, type AlertStripItem } from '@/components/ui/alert-strip';
import { ExportActions } from '@/components/ui/export-actions';
import { HistoryPanel } from '@/components/ui/history-panel';
import {
  formatDate,
  getSuggestedWaitingResponseDate,
  isDueSoon,
  isDueToday,
  isOverdue,
  isWaitingResponseOverdue,
  isWaitingResponseToday,
  isWaitingWithoutResponseDate,
  normalizeDateValue,
} from '@/lib/tasks/presentation';
import { buildHistoryRows, buildTaskExportRows, downloadCsv, downloadJson } from '@/lib/tasks/export';
import { useTaskHistory } from '@/lib/tasks/history';
import { buildStalledTaskList, buildTaskFocusDeck, buildTaskStalledBuckets, isDoingStale } from '@/lib/tasks/focus';

const BOARD_PREFERENCES_KEY = 'kanban-board-preferences-v1';

const defaultNewTaskState = {
  title: '',
  description: '',
  assignee: '自分',
  priority: 'medium' as TaskPriority,
  importance: 'medium' as TaskImportance,
  urgency: 'medium' as TaskUrgency,
  dueDate: '',
  gtdCategory: 'next_action' as TaskGtdCategory,
  projectTaskId: '',
};

const levelClassName = {
  low: 'bg-emerald-100 text-emerald-700',
  medium: 'bg-amber-100 text-amber-700',
  high: 'bg-rose-100 text-rose-700',
} as const satisfies Record<TaskPriority | TaskImportance | TaskUrgency, string>;

type KanbanBoardProps = {
  userId: string;
  userEmail?: string | null;
  onLogout: () => Promise<void>;
  loggingOut?: boolean;
};

type ViewMode = 'kanban' | 'matrix' | 'gtd' | 'today';

type MatrixQuadrantKey =
  | 'important_urgent'
  | 'important_notUrgent'
  | 'notImportant_urgent'
  | 'notImportant_notUrgent';

type TodayGroupKey =
  | 'overdue'
  | 'waitingResponseOverdue'
  | 'dueToday'
  | 'waitingResponseToday'
  | 'waitingNoDate'
  | 'doing'
  | 'highPriority'
  | 'projectLinked'
  | 'other';

type TaskSortKey = 'newest' | 'dueSoon' | 'importanceHigh' | 'urgencyHigh';

type BoardPreferences = {
  keyword: string;
  gtdFilter: 'all' | TaskGtdCategory;
  importanceFilter: 'all' | TaskImportance;
  urgencyFilter: 'all' | TaskUrgency;
  sortKey: TaskSortKey;
  viewMode: ViewMode;
  showSomedayInNormalViews: boolean;
  projectFilterId: string;
};

const TASK_SORT_LABELS: Record<TaskSortKey, string> = {
  newest: '新しい順',
  dueSoon: '期限が近い順',
  importanceHigh: '重要度高い順',
  urgencyHigh: '緊急度高い順',
};

const VIEW_MODE_LABELS: Record<ViewMode, string> = {
  kanban: 'カンバン',
  today: '今日',
  matrix: 'マトリクス',
  gtd: 'GTD',
};

const BULK_GTD_OPTIONS: Array<Exclude<TaskGtdCategory, 'project'>> = [
  'next_action',
  'delegated',
  'someday',
];

const MATRIX_QUADRANTS: Array<{
  key: MatrixQuadrantKey;
  title: string;
  subtitle: string;
}> = [
  { key: 'important_urgent', title: '重要 × 緊急', subtitle: '今すぐ対応' },
  { key: 'important_notUrgent', title: '重要 × 非緊急', subtitle: '計画的に進める' },
  { key: 'notImportant_urgent', title: '非重要 × 緊急', subtitle: 'できれば委任' },
  { key: 'notImportant_notUrgent', title: '非重要 × 非緊急', subtitle: '後回し候補' },
];

const GTD_SECTIONS: Array<{ key: TaskGtdCategory; title: string }> = [
  { key: 'next_action', title: '次にやる' },
  { key: 'someday', title: 'いつか / 保留' },
  { key: 'project', title: 'プロジェクト' },
  { key: 'delegated', title: '他者依頼' },
];

const TODAY_SECTIONS: Array<{
  key: TodayGroupKey;
  title: string;
  subtitle: string;
}> = [
  { key: 'overdue', title: '期限超過', subtitle: 'まず最優先で片付ける' },
  { key: 'waitingResponseOverdue', title: '回答予定日超過', subtitle: '待ちの再確認や催促が必要' },
  { key: 'dueToday', title: '今日期限', subtitle: '今日中に終える候補' },
  { key: 'waitingResponseToday', title: '今日回答予定', subtitle: '今日待ち解除を確認したいタスク' },
  { key: 'waitingNoDate', title: '待ち・回答日未設定', subtitle: '回答予定日を入れて抜け漏れを防ぐ' },
  { key: 'doing', title: '進行中', subtitle: '途中の仕事を前に進める' },
  { key: 'highPriority', title: '高重要 / 高緊急', subtitle: '優先して手を付ける' },
  { key: 'projectLinked', title: 'プロジェクト次アクション', subtitle: 'PJを前進させる一手' },
  { key: 'other', title: '残りの候補', subtitle: '余力があれば確認' },
];

const sortWeight: Record<'low' | 'medium' | 'high', number> = {
  high: 0,
  medium: 1,
  low: 2,
};

function sortTasks(tasks: Task[], sortKey: TaskSortKey) {
  const copied = [...tasks];

  copied.sort((a, b) => {
    switch (sortKey) {
      case 'dueSoon':
        return normalizeDateValue(a.due_date) - normalizeDateValue(b.due_date);

      case 'importanceHigh':
        return sortWeight[a.importance] - sortWeight[b.importance];

      case 'urgencyHigh':
        return sortWeight[a.urgency] - sortWeight[b.urgency];

      case 'newest':
      default:
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    }
  });

  return copied;
}

function buildTodayTaskGroups(tasks: Task[]) {
  return tasks.reduce(
    (acc, task) => {
      if (task.status === 'done') {
        return acc;
      }

      if (isWaitingResponseOverdue(task)) {
        acc.waitingResponseOverdue.push(task);
      } else if (isOverdue(task.due_date)) {
        acc.overdue.push(task);
      } else if (isWaitingResponseToday(task)) {
        acc.waitingResponseToday.push(task);
      } else if (isDueToday(task.due_date)) {
        acc.dueToday.push(task);
      } else if (isWaitingWithoutResponseDate(task)) {
        acc.waitingNoDate.push(task);
      } else if (task.status === 'doing') {
        acc.doing.push(task);
      } else if (task.importance === 'high' || task.urgency === 'high') {
        acc.highPriority.push(task);
      } else if (task.gtd_category === 'next_action' && task.project_task_id) {
        acc.projectLinked.push(task);
      } else {
        acc.other.push(task);
      }

      return acc;
    },
    {
      overdue: [] as Task[],
      waitingResponseOverdue: [] as Task[],
      dueToday: [] as Task[],
      waitingResponseToday: [] as Task[],
      waitingNoDate: [] as Task[],
      doing: [] as Task[],
      highPriority: [] as Task[],
      projectLinked: [] as Task[],
      other: [] as Task[],
    },
  );
}

function isValidViewMode(value: unknown): value is ViewMode {
  return value === 'kanban' || value === 'matrix' || value === 'gtd' || value === 'today';
}

function isValidTaskSortKey(value: unknown): value is TaskSortKey {
  return value === 'newest' || value === 'dueSoon' || value === 'importanceHigh' || value === 'urgencyHigh';
}

function isValidTaskGtdCategoryOrAll(value: unknown): value is 'all' | TaskGtdCategory {
  return value === 'all' || TASK_GTD_VALUES.includes(value as TaskGtdCategory);
}

function isValidImportanceFilter(value: unknown): value is 'all' | TaskImportance {
  return value === 'all' || TASK_IMPORTANCE_VALUES.includes(value as TaskImportance);
}

function isValidUrgencyFilter(value: unknown): value is 'all' | TaskUrgency {
  return value === 'all' || TASK_URGENCY_VALUES.includes(value as TaskUrgency);
}

export function KanbanBoard({
  userId,
  userEmail,
  onLogout,
  loggingOut = false,
}: KanbanBoardProps) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [updatingTaskId, setUpdatingTaskId] = useState<string | null>(null);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);
  const [dragOverStatus, setDragOverStatus] = useState<TaskProgress | null>(null);

  const [keyword, setKeyword] = useState('');
  const deferredKeyword = useDeferredValue(keyword);
  const [gtdFilter, setGtdFilter] = useState<'all' | TaskGtdCategory>('all');
  const [importanceFilter, setImportanceFilter] = useState<'all' | TaskImportance>('all');
  const [urgencyFilter, setUrgencyFilter] = useState<'all' | TaskUrgency>('all');
  const [sortKey, setSortKey] = useState<TaskSortKey>('newest');
  const [viewMode, setViewMode] = useState<ViewMode>('kanban');
  const [showSomedayInNormalViews, setShowSomedayInNormalViews] = useState(false);
  const [projectFilterId, setProjectFilterId] = useState('all');
  const [newTask, setNewTask] = useState(defaultNewTaskState);
  const [preferencesReady, setPreferencesReady] = useState(false);
  const [expandedProjectIds, setExpandedProjectIds] = useState<Record<string, boolean>>({});
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedTaskIds, setSelectedTaskIds] = useState<string[]>([]);
  const [bulkUpdating, setBulkUpdating] = useState(false);
  const [bulkWaitingResponseDate, setBulkWaitingResponseDate] = useState('');
  const [expandedSectionKeys, setExpandedSectionKeys] = useState<Record<string, boolean>>({});
  const { entries: historyEntries, append: appendHistoryEntry, clear: clearHistoryEntries } = useTaskHistory();

  const { projects } = useProjects();

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(BOARD_PREFERENCES_KEY);
      if (!raw) {
        setPreferencesReady(true);
        return;
      }

      const parsed = JSON.parse(raw) as Partial<BoardPreferences>;

      if (typeof parsed.keyword === 'string') setKeyword(parsed.keyword);
      if (isValidTaskGtdCategoryOrAll(parsed.gtdFilter)) setGtdFilter(parsed.gtdFilter);
      if (isValidImportanceFilter(parsed.importanceFilter)) setImportanceFilter(parsed.importanceFilter);
      if (isValidUrgencyFilter(parsed.urgencyFilter)) setUrgencyFilter(parsed.urgencyFilter);
      if (isValidTaskSortKey(parsed.sortKey)) setSortKey(parsed.sortKey);
      if (isValidViewMode(parsed.viewMode)) setViewMode(parsed.viewMode);
      if (typeof parsed.showSomedayInNormalViews === 'boolean') {
        setShowSomedayInNormalViews(parsed.showSomedayInNormalViews);
      }
      if (typeof parsed.projectFilterId === 'string' && parsed.projectFilterId.trim()) {
        setProjectFilterId(parsed.projectFilterId);
      }
    } catch {
      window.localStorage.removeItem(BOARD_PREFERENCES_KEY);
    }

    setPreferencesReady(true);
  }, []);

  useEffect(() => {
    if (!preferencesReady) return;

    const nextPreferences: BoardPreferences = {
      keyword,
      gtdFilter,
      importanceFilter,
      urgencyFilter,
      sortKey,
      viewMode,
      showSomedayInNormalViews,
      projectFilterId,
    };

    window.localStorage.setItem(BOARD_PREFERENCES_KEY, JSON.stringify(nextPreferences));
  }, [
    gtdFilter,
    importanceFilter,
    keyword,
    preferencesReady,
    projectFilterId,
    showSomedayInNormalViews,
    sortKey,
    urgencyFilter,
    viewMode,
  ]);

  const projectTasks = useMemo(
    () => tasks.filter((task) => task.gtd_category === 'project'),
    [tasks],
  );

  const projectTaskMap = useMemo(() => {
    return projectTasks.reduce(
      (acc, task) => {
        acc[task.id] = task;
        return acc;
      },
      {} as Record<string, Task>,
    );
  }, [projectTasks]);

  const projectNextActionCountMap = useMemo(() => {
    return tasks.reduce(
      (acc, task) => {
        if (task.gtd_category !== 'next_action' || !task.project_task_id) return acc;
        acc[task.project_task_id] = (acc[task.project_task_id] ?? 0) + 1;
        return acc;
      },
      {} as Record<string, number>,
    );
  }, [tasks]);

  const fetchTasks = useCallback(
    async (showRefreshing = false) => {
      if (showRefreshing) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      setError(null);

      const { data, error: fetchError } = await getSupabaseClient()
        .from('tasks')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (fetchError) {
        setError(fetchError.message);
      } else {
        setTasks((data as Task[]) ?? []);
      }

      setLoading(false);
      setRefreshing(false);
    },
    [userId],
  );

  useEffect(() => {
    void fetchTasks();
  }, [fetchTasks]);

  useEffect(() => {
    if (projectFilterId === 'all') return;

    const exists = tasks.some(
      (task) => task.id === projectFilterId || task.project_task_id === projectFilterId,
    );

    if (!exists) {
      setProjectFilterId('all');
    }
  }, [projectFilterId, tasks]);

  const filteredTasks = useMemo(() => {
    const normalizedKeyword = deferredKeyword.trim().toLowerCase();

    const base = tasks.filter((task) => {
      if (gtdFilter !== 'all' && task.gtd_category !== gtdFilter) {
        return false;
      }

      if (importanceFilter !== 'all' && task.importance !== importanceFilter) {
        return false;
      }

      if (urgencyFilter !== 'all' && task.urgency !== urgencyFilter) {
        return false;
      }

      if (projectFilterId !== 'all') {
        const isProjectSelf = task.id === projectFilterId;
        const isChildTask = task.project_task_id === projectFilterId;
        if (!isProjectSelf && !isChildTask) {
          return false;
        }
      }

      if (!normalizedKeyword) {
        return true;
      }

      const haystack = `${task.title} ${task.description ?? ''} ${task.assignee ?? ''}`.toLowerCase();

      return haystack.includes(normalizedKeyword);
    });

    return sortTasks(base, sortKey);
  }, [deferredKeyword, gtdFilter, importanceFilter, projectFilterId, sortKey, tasks, urgencyFilter]);

  useEffect(() => {
    setExpandedProjectIds((prev) => {
      const visibleIds = new Set(
        filteredTasks.filter((task) => task.gtd_category === 'project').map((task) => task.id),
      );
      const nextEntries = Object.entries(prev).filter(([projectId]) => visibleIds.has(projectId));
      if (nextEntries.length === Object.keys(prev).length) {
        return prev;
      }
      return Object.fromEntries(nextEntries);
    });
  }, [filteredTasks]);

  const visibleTasksForNormalViews = useMemo(() => {
    let base = filteredTasks;

    if (!showSomedayInNormalViews && gtdFilter !== 'someday') {
      base = base.filter((task) => task.gtd_category !== 'someday');
    }

    if (viewMode === 'kanban' || viewMode === 'matrix' || viewMode === 'today') {
      base = base.filter((task) => task.gtd_category !== 'project');
    }

    return base;
  }, [filteredTasks, gtdFilter, showSomedayInNormalViews, viewMode]);

  const groupedTasks = useMemo(() => {
    return TASK_PROGRESS_ORDER.reduce(
      (acc, status) => {
        acc[status] = visibleTasksForNormalViews.filter((task) => task.status === status);
        return acc;
      },
      {
        todo: [] as Task[],
        doing: [] as Task[],
        waiting: [] as Task[],
        done: [] as Task[],
      },
    );
  }, [visibleTasksForNormalViews]);

  const matrixTasks = useMemo(() => {
    return visibleTasksForNormalViews.reduce(
      (acc, task) => {
        const isImportantHigh = task.importance === 'high';
        const isUrgencyHigh = task.urgency === 'high';

        if (isImportantHigh && isUrgencyHigh) {
          acc.important_urgent.push(task);
        } else if (isImportantHigh) {
          acc.important_notUrgent.push(task);
        } else if (isUrgencyHigh) {
          acc.notImportant_urgent.push(task);
        } else {
          acc.notImportant_notUrgent.push(task);
        }

        return acc;
      },
      {
        important_urgent: [] as Task[],
        important_notUrgent: [] as Task[],
        notImportant_urgent: [] as Task[],
        notImportant_notUrgent: [] as Task[],
      },
    );
  }, [visibleTasksForNormalViews]);

  const gtdTasks = useMemo(() => {
    return filteredTasks.reduce(
      (acc, task) => {
        if (task.gtd_category === 'next_action' && task.project_task_id) {
          return acc;
        }

        acc[task.gtd_category].push(task);
        return acc;
      },
      {
        next_action: [] as Task[],
        delegated: [] as Task[],
        project: [] as Task[],
        someday: [] as Task[],
      },
    );
  }, [filteredTasks]);

  const projectChildrenByProjectId = useMemo(() => {
    return sortTasks(
      filteredTasks.filter(
        (task) => task.gtd_category === 'next_action' && Boolean(task.project_task_id),
      ),
      sortKey,
    ).reduce(
      (acc, task) => {
        if (!task.project_task_id) return acc;
        (acc[task.project_task_id] ??= []).push(task);
        return acc;
      },
      {} as Record<string, Task[]>,
    );
  }, [filteredTasks, sortKey]);

  const todayTasks = useMemo(() => {
    return buildTodayTaskGroups(visibleTasksForNormalViews);
  }, [visibleTasksForNormalViews]);

  const visibleTodaySections = useMemo(() => {
    return TODAY_SECTIONS.filter((section) => todayTasks[section.key].length > 0);
  }, [todayTasks]);

  const incompleteTaskCount = useMemo(() => {
    return visibleTasksForNormalViews.filter((task) => task.status !== 'done').length;
  }, [visibleTasksForNormalViews]);

  const todaySummary = useMemo(() => {
    const urgentActionCount =
      todayTasks.overdue.length + todayTasks.dueToday.length + todayTasks.waitingResponseOverdue.length;
    const doingCount = todayTasks.doing.length;
    const waitingOverdueCount = todayTasks.waitingResponseOverdue.length;
    const waitingNoDateCount = todayTasks.waitingNoDate.length;
    const projectCount = todayTasks.projectLinked.length;
    const totalCount = Object.values(todayTasks).reduce((sum, list) => sum + list.length, 0);

    return {
      urgentActionCount,
      doingCount,
      waitingOverdueCount,
      waitingNoDateCount,
      projectCount,
      totalCount,
    };
  }, [todayTasks]);

  const visibleTaskCount = useMemo(() => {
    if (viewMode === 'gtd') {
      return filteredTasks.length;
    }
    return visibleTasksForNormalViews.length;
  }, [filteredTasks.length, viewMode, visibleTasksForNormalViews.length]);

  const activeFilterChips = useMemo(() => {
    const chips: string[] = [];

    if (keyword.trim()) chips.push(`検索: ${keyword.trim()}`);
    if (gtdFilter !== 'all') chips.push(`GTD: ${TASK_GTD_LABELS[gtdFilter]}`);
    if (importanceFilter !== 'all') chips.push(`重要度: ${IMPORTANCE_LABELS[importanceFilter]}`);
    if (urgencyFilter !== 'all') chips.push(`緊急度: ${URGENCY_LABELS[urgencyFilter]}`);
    if (projectFilterId !== 'all') {
      const projectTitle = projectTaskMap[projectFilterId]?.title ?? projects.find((project) => project.id === projectFilterId)?.title;
      chips.push(`関連PJ: ${projectTitle ?? '指定あり'}`);
    }
    if (viewMode !== 'gtd' && showSomedayInNormalViews) {
      chips.push('保留も表示');
    }

    return chips;
  }, [
    gtdFilter,
    importanceFilter,
    keyword,
    projectFilterId,
    projectTaskMap,
    projects,
    showSomedayInNormalViews,
    sortKey,
    urgencyFilter,
    viewMode,
  ]);


  const boardHistoryEntries = useMemo(() => historyEntries, [historyEntries]);

  const exportableTasks = useMemo(() => {
    return viewMode === 'gtd' ? filteredTasks : visibleTasksForNormalViews;
  }, [filteredTasks, viewMode, visibleTasksForNormalViews]);

  const handleExportVisibleTasksCsv = useCallback(() => {
    downloadCsv(`board-${viewMode}-tasks`, buildTaskExportRows(exportableTasks, projectTaskMap));
    appendHistoryEntry({
      scope: 'board',
      action: 'export_csv',
      summary: `${VIEW_MODE_LABELS[viewMode]}をCSV出力`,
      detail: `表示中 ${exportableTasks.length}件を出力`,
      tone: 'info',
    });
  }, [appendHistoryEntry, exportableTasks, projectTaskMap, viewMode]);

  const handleExportVisibleTasksJson = useCallback(() => {
    downloadJson(`board-${viewMode}-tasks`, buildTaskExportRows(exportableTasks, projectTaskMap));
    appendHistoryEntry({
      scope: 'board',
      action: 'export_json',
      summary: `${VIEW_MODE_LABELS[viewMode]}をJSON出力`,
      detail: `表示中 ${exportableTasks.length}件を出力`,
      tone: 'info',
    });
  }, [appendHistoryEntry, exportableTasks, projectTaskMap, viewMode]);

  const handleExportHistoryCsv = useCallback(() => {
    downloadCsv('board-history', buildHistoryRows(boardHistoryEntries));
  }, [boardHistoryEntries]);

  const handleExportHistoryJson = useCallback(() => {
    downloadJson('board-history', buildHistoryRows(boardHistoryEntries));
  }, [boardHistoryEntries]);

  const bulkSelectableTasks = useMemo(() => {
    if (viewMode === 'gtd') {
      return [
        ...gtdTasks.next_action,
        ...gtdTasks.delegated,
        ...gtdTasks.someday,
        ...Object.values(projectChildrenByProjectId).flat(),
      ];
    }

    return visibleTasksForNormalViews.filter((task) => task.gtd_category !== 'project');
  }, [gtdTasks, projectChildrenByProjectId, viewMode, visibleTasksForNormalViews]);

  const bulkSelectableTaskIds = useMemo(
    () => Array.from(new Set(bulkSelectableTasks.map((task) => task.id))),
    [bulkSelectableTasks],
  );

  const selectedTasks = useMemo(() => {
    const selectedSet = new Set(selectedTaskIds);
    return tasks.filter((task) => selectedSet.has(task.id));
  }, [selectedTaskIds, tasks]);

  const allVisibleSelected = useMemo(
    () =>
      bulkSelectableTaskIds.length > 0 &&
      bulkSelectableTaskIds.every((taskId) => selectedTaskIds.includes(taskId)),
    [bulkSelectableTaskIds, selectedTaskIds],
  );

  const selectedWaitingWithDateCount = useMemo(
    () => selectedTasks.filter((task) => task.status === 'waiting' && Boolean(task.waiting_response_date)).length,
    [selectedTasks],
  );

  const selectedNonWaitingTaskCount = useMemo(
    () => selectedTasks.filter((task) => task.status !== 'waiting').length,
    [selectedTasks],
  );

  const todayQuickSelections = useMemo(
    () => [
      {
        key: 'urgent',
        label: '今すぐ対応',
        taskIds: [...todayTasks.overdue, ...todayTasks.dueToday, ...todayTasks.waitingResponseOverdue].map((task) => task.id),
      },
      {
        key: 'waitingOverdue',
        label: '回答超過',
        taskIds: todayTasks.waitingResponseOverdue.map((task) => task.id),
      },
      {
        key: 'waitingToday',
        label: '今日回答予定',
        taskIds: todayTasks.waitingResponseToday.map((task) => task.id),
      },
      {
        key: 'waitingNoDate',
        label: '待ち日付未設定',
        taskIds: todayTasks.waitingNoDate.map((task) => task.id),
      },
      {
        key: 'doing',
        label: '進行中',
        taskIds: todayTasks.doing.map((task) => task.id),
      },
    ].map((item) => ({ ...item, taskIds: Array.from(new Set(item.taskIds)) })),
    [todayTasks],
  );

  const todayFocusTasks = useMemo(() => buildTaskFocusDeck(visibleTasksForNormalViews, 3), [visibleTasksForNormalViews]);

  const stalledTaskBuckets = useMemo(() => buildTaskStalledBuckets(visibleTasksForNormalViews), [visibleTasksForNormalViews]);
  const stalledTasks = useMemo(() => buildStalledTaskList(visibleTasksForNormalViews, 4), [visibleTasksForNormalViews]);

  const boardAlertItems = useMemo(() => {
    const items: AlertStripItem[] = [];
    const dueSoonCount = visibleTasksForNormalViews.filter(
      (task) => task.status !== 'done' && isDueSoon(task.due_date),
    ).length;
    const waitingNoDateCount = visibleTasksForNormalViews.filter((task) => isWaitingWithoutResponseDate(task)).length;
    const stalledCount =
      stalledTaskBuckets.waitingOverdue.length +
      stalledTaskBuckets.waitingNoDate.length +
      stalledTaskBuckets.doingStale.length;
    const missingStartProjectCount = projects.filter((project) => !project.startedAt).length;
    const missingDueProjectCount = projects.filter((project) => !project.dueDate).length;
    const projectWithoutActionCount = projects.filter((project) => project.nextActionCount === 0).length;

    if (viewMode !== 'today' && dueSoonCount > 0) {
      items.push({ id: 'due-soon', label: '期限接近', count: `${dueSoonCount}件`, tone: 'warning' });
    }

    if (viewMode !== 'today' && waitingNoDateCount > 0) {
      items.push({ id: 'waiting-no-date', label: '待ち日付未設定', count: `${waitingNoDateCount}件`, tone: 'warning' });
    }

    if (stalledCount > 0) {
      items.push({ id: 'stalled', label: '止まり候補', count: `${stalledCount}件`, tone: 'danger' });
    }

    if (missingStartProjectCount > 0) {
      items.push({
        id: 'project-missing-start',
        label: '開始日未記録PJ',
        count: `${missingStartProjectCount}件`,
        tone: 'info',
        href: '/projects/viewer#missing-start-projects',
      });
    }

    if (missingDueProjectCount > 0) {
      items.push({
        id: 'project-missing-due',
        label: '期限未設定PJ',
        count: `${missingDueProjectCount}件`,
        tone: 'info',
        href: '/projects#missing-due-projects',
      });
    }

    if (projectWithoutActionCount > 0) {
      items.push({
        id: 'project-no-action',
        label: '次アクション未設定PJ',
        count: `${projectWithoutActionCount}件`,
        tone: 'neutral',
        href: '/projects',
      });
    }

    return items;
  }, [projects, stalledTaskBuckets, viewMode, visibleTasksForNormalViews]);

  const stalledTaskQuickSelections = useMemo(
    () => [
      { key: 'stalledWaiting', label: '回答超過', taskIds: stalledTaskBuckets.waitingOverdue.map((task) => task.id) },
      { key: 'stalledNoDate', label: '待ち日付未設定', taskIds: stalledTaskBuckets.waitingNoDate.map((task) => task.id) },
      { key: 'stalledDoing', label: '進行停滞', taskIds: stalledTaskBuckets.doingStale.map((task) => task.id) },
      { key: 'stalledDue', label: '期限超過', taskIds: stalledTaskBuckets.overdueTodo.map((task) => task.id) },
    ].map((item) => ({ ...item, taskIds: Array.from(new Set(item.taskIds)) })),
    [stalledTaskBuckets],
  );

  const toggleSectionExpanded = useCallback((key: string) => {
    setExpandedSectionKeys((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const getLimitedItems = useCallback(
    <T,>(key: string, items: T[], limit = 12) => (expandedSectionKeys[key] ? items : items.slice(0, limit)),
    [expandedSectionKeys],
  );

  const sectionHasMore = useCallback(
    (key: string, items: unknown[], limit = 12) => !expandedSectionKeys[key] && items.length > limit,
    [expandedSectionKeys],
  );

  useEffect(() => {
    const selectableSet = new Set(bulkSelectableTaskIds);
    setSelectedTaskIds((prev) => prev.filter((taskId) => selectableSet.has(taskId)));
  }, [bulkSelectableTaskIds]);

  const addTask = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!newTask.title.trim()) return;

    setSaving(true);
    setError(null);
    setNotice(null);

    const { data, error: insertError } = await getSupabaseClient()
      .from('tasks')
      .insert({
        user_id: userId,
        title: newTask.title.trim(),
        description: newTask.description.trim() || null,
        assignee: newTask.assignee.trim() || null,
        priority: newTask.priority,
        importance: newTask.importance,
        urgency: newTask.urgency,
        due_date: newTask.dueDate || null,
        status: 'todo',
        gtd_category: newTask.gtdCategory,
        project_task_id:
          newTask.gtdCategory === 'next_action' ? newTask.projectTaskId || null : null,
      })
      .select('*')
      .single();

    if (insertError) {
      setError(insertError.message);
    } else {
      setTasks((prev) => [data as Task, ...prev]);
      setNewTask(defaultNewTaskState);
      setNotice('タスクを追加しました。');
      appendHistoryEntry({
        scope: 'board',
        action: 'create_task',
        summary: `タスク追加: ${newTask.title.trim()}`,
        detail: `GTD ${TASK_GTD_LABELS[newTask.gtdCategory]} / 重要度 ${IMPORTANCE_LABELS[newTask.importance]} / 緊急度 ${URGENCY_LABELS[newTask.urgency]}`,
        tone: 'success',
        contextId: newTask.projectTaskId || undefined,
      });
    }

    setSaving(false);
  };

  const updateStatus = async (task: Task, status: TaskProgress) => {
    if (task.status === status) return;

    setUpdatingTaskId(task.id);
    setError(null);
    setNotice(null);

    try {
      const updatedTask = await updateTaskStatus(task, status);
      setTasks((prev) => prev.map((item) => (item.id === task.id ? updatedTask : item)));
      setNotice(`「${task.title}」の進捗を更新しました。`);
      appendHistoryEntry({
        scope: 'board',
        action: 'update_status',
        summary: `進捗更新: ${task.title}`,
        detail: `${TASK_PROGRESS_LABELS[task.status]} → ${TASK_PROGRESS_LABELS[status]}`,
        tone: 'info',
        contextId: task.project_task_id ?? undefined,
      });
    } catch (updateError) {
      const message = updateError instanceof Error ? updateError.message : '進捗更新に失敗しました';
      setError(message);
    }

    setUpdatingTaskId(null);
  };


  const applySuggestedWaiting = useCallback(async (task: Task) => {
    const suggestedDate = task.waiting_response_date || getSuggestedWaitingResponseDate();

    setUpdatingTaskId(task.id);
    setError(null);
    setNotice(null);

    const { data, error: updateError } = await getSupabaseClient()
      .from('tasks')
      .update({ status: 'waiting', waiting_response_date: suggestedDate })
      .eq('id', task.id)
      .select('*')
      .single();

    if (updateError) {
      setError(updateError.message);
      setUpdatingTaskId(null);
      return;
    }

    setTasks((prev) => prev.map((item) => (item.id === task.id ? (data as Task) : item)));
    setNotice(`「${task.title}」を待ちにして回答予定日 ${formatDate(suggestedDate)} を設定しました。`);
    appendHistoryEntry({
      scope: 'board',
      action: 'suggest_waiting',
      summary: `待ち＋回答予定日: ${task.title}`,
      detail: `回答予定日 ${formatDate(suggestedDate)}`,
      tone: 'warning',
      contextId: task.project_task_id ?? undefined,
    });
    setUpdatingTaskId(null);
  }, [appendHistoryEntry]);

  const saveTaskEdits = async (values: TaskEditValues) => {
    if (!editingTask) return;

    setUpdatingTaskId(editingTask.id);
    setError(null);
    setNotice(null);

    const nextProjectTaskId =
      values.gtdCategory === 'next_action' ? values.projectTaskId || null : null;

    const { data, error: updateError } = await getSupabaseClient()
      .from('tasks')
      .update({
        title: values.title.trim(),
        description: values.description.trim() || null,
        assignee: values.assignee.trim() || null,
        importance: values.importance,
        urgency: values.urgency,
        status: values.status,
        due_date: values.dueDate || null,
        waiting_response_date:
          values.status === 'waiting' ? values.waitingResponseDate || null : null,
        gtd_category: values.gtdCategory,
        project_task_id: nextProjectTaskId,
      })
      .eq('id', editingTask.id)
      .select('*')
      .single();

    if (updateError) {
      setError(updateError.message);
      setUpdatingTaskId(null);
      return;
    }

    setTasks((prev) => prev.map((item) => (item.id === editingTask.id ? (data as Task) : item)));
    setNotice(`「${values.title}」を更新しました。`);
    appendHistoryEntry({
      scope: 'board',
      action: 'edit_task',
      summary: `タスク更新: ${values.title}`,
      detail: `進捗 ${TASK_PROGRESS_LABELS[values.status]} / GTD ${TASK_GTD_LABELS[values.gtdCategory]}`,
      tone: 'success',
      contextId: nextProjectTaskId ?? undefined,
    });
    setEditingTask(null);
    setUpdatingTaskId(null);
  };

  const deleteTask = async (id: string) => {
    const deletingTask = tasks.find((task) => task.id === id) ?? null;
    const confirmed = window.confirm(
      deletingTask
        ? `「${deletingTask.title}」を削除します。よろしいですか？`
        : 'このタスクを削除します。よろしいですか？',
    );

    if (!confirmed) return;

    setUpdatingTaskId(id);
    setError(null);
    setNotice(null);

    const { error: deleteError } = await getSupabaseClient().from('tasks').delete().eq('id', id);

    if (deleteError) {
      setError(deleteError.message);
      setUpdatingTaskId(null);
      return;
    }

    setTasks((prev) => {
      const remainingTasks = prev.filter((task) => task.id !== id);

      if (deletingTask?.gtd_category !== 'project') {
        return remainingTasks;
      }

      return remainingTasks.map((task) =>
        task.project_task_id === id ? { ...task, project_task_id: null } : task,
      );
    });

    setNotice(
      deletingTask ? `「${deletingTask.title}」を削除しました。` : 'タスクを削除しました。',
    );
    setUpdatingTaskId(null);
  };

  const handleTaskDragStart = (taskId: string) => {
    setDraggedTaskId(taskId);
    setNotice(null);
  };

  const handleTaskDragEnd = () => {
    setDraggedTaskId(null);
    setDragOverStatus(null);
  };

  const handleColumnDragOver = (event: DragEvent<HTMLDivElement>, status: TaskProgress) => {
    if (!draggedTaskId) return;
    event.preventDefault();
    if (dragOverStatus !== status) {
      setDragOverStatus(status);
    }
  };

  const handleColumnDrop = async (event: DragEvent<HTMLDivElement>, status: TaskProgress) => {
    event.preventDefault();

    const droppedTaskId = draggedTaskId;
    setDraggedTaskId(null);
    setDragOverStatus(null);

    if (!droppedTaskId) return;

    const droppedTask = tasks.find((task) => task.id === droppedTaskId);
    if (!droppedTask) return;

    await updateStatus(droppedTask, status);
  };

  const toggleTaskSelection = useCallback((taskId: string) => {
    setSelectedTaskIds((prev) =>
      prev.includes(taskId) ? prev.filter((id) => id !== taskId) : [...prev, taskId],
    );
  }, []);

  const clearTaskSelection = useCallback(() => {
    setSelectedTaskIds([]);
  }, []);

  const handleToggleSelectAllVisible = useCallback(() => {
    setSelectedTaskIds((prev) => {
      if (
        bulkSelectableTaskIds.length > 0 &&
        bulkSelectableTaskIds.every((taskId) => prev.includes(taskId))
      ) {
        return prev.filter((taskId) => !bulkSelectableTaskIds.includes(taskId));
      }

      return Array.from(new Set([...prev, ...bulkSelectableTaskIds]));
    });
  }, [bulkSelectableTaskIds]);

  const applyBulkStatusChange = useCallback(
    async (nextStatus: TaskProgress) => {
      const targetTasks = selectedTasks.filter((task) => task.status !== nextStatus);
      if (targetTasks.length === 0) return;

      setBulkUpdating(true);
      setError(null);
      setNotice(null);

      try {
        const updatedTasks = await Promise.all(
          targetTasks.map((task) => updateTaskStatus(task, nextStatus)),
        );
        const updatedTaskMap = new Map(updatedTasks.map((task) => [task.id, task]));

        setTasks((prev) => prev.map((task) => updatedTaskMap.get(task.id) ?? task));
        setSelectedTaskIds([]);
        setNotice(`選択中 ${updatedTasks.length}件の進捗を「${TASK_PROGRESS_LABELS[nextStatus]}」に更新しました。`);
        appendHistoryEntry({
          scope: 'board',
          action: 'bulk_status',
          summary: `一括進捗更新 ${updatedTasks.length}件`,
          detail: `進捗を ${TASK_PROGRESS_LABELS[nextStatus]} に更新`,
          tone: 'info',
        });
      } catch (bulkError) {
        const message =
          bulkError instanceof Error ? bulkError.message : '一括進捗更新に失敗しました';
        setError(message);
      }

      setBulkUpdating(false);
    },
    [selectedTasks],
  );

  const applyBulkFieldChange = useCallback(
    async (updates: Record<string, unknown>, successMessage: string) => {
      if (selectedTaskIds.length === 0) return;

      setBulkUpdating(true);
      setError(null);
      setNotice(null);

      const { data, error: bulkError } = await getSupabaseClient()
        .from('tasks')
        .update(updates)
        .in('id', selectedTaskIds)
        .select('*');

      if (bulkError) {
        setError(bulkError.message);
        setBulkUpdating(false);
        return;
      }

      const updatedTaskMap = new Map(((data as Task[]) ?? []).map((task) => [task.id, task]));
      setTasks((prev) => prev.map((task) => updatedTaskMap.get(task.id) ?? task));
      setSelectedTaskIds([]);
      setNotice(successMessage);
      appendHistoryEntry({
        scope: 'board',
        action: 'bulk_field',
        summary: `一括更新 ${selectedTaskIds.length}件`,
        detail: successMessage,
        tone: 'info',
      });
      setBulkUpdating(false);
    },
    [selectedTaskIds],
  );


  const applySelectionPreset = useCallback((taskIds: string[]) => {
    const uniqueIds = Array.from(new Set(taskIds));
    if (uniqueIds.length === 0) return;

    setSelectionMode(true);
    setSelectedTaskIds(uniqueIds);
  }, []);

  const applyBulkWaitingResponseDate = useCallback(async () => {
    if (selectedTaskIds.length === 0) return;

    const nextWaitingResponseDate = bulkWaitingResponseDate || getSuggestedWaitingResponseDate();

    setBulkUpdating(true);
    setError(null);
    setNotice(null);

    const shouldSwitchToWaiting = selectedTasks.some((task) => task.status !== 'waiting');

    const { data, error: bulkError } = await getSupabaseClient()
      .from('tasks')
      .update(
        shouldSwitchToWaiting
          ? { status: 'waiting', waiting_response_date: nextWaitingResponseDate }
          : { waiting_response_date: nextWaitingResponseDate },
      )
      .in('id', selectedTaskIds)
      .select('*');

    if (bulkError) {
      setError(bulkError.message);
      setBulkUpdating(false);
      return;
    }

    const updatedTaskMap = new Map(((data as Task[]) ?? []).map((task) => [task.id, task]));
    setTasks((prev) => prev.map((task) => updatedTaskMap.get(task.id) ?? task));
    setSelectedTaskIds([]);
    setBulkWaitingResponseDate('');
    setNotice(
      shouldSwitchToWaiting
        ? `選択中 ${selectedTaskIds.length}件を待ちにして回答予定日 ${formatDate(nextWaitingResponseDate)} を設定しました。`
        : `選択中 ${selectedTaskIds.length}件の回答予定日を ${formatDate(nextWaitingResponseDate)} に更新しました。`,
    );
    appendHistoryEntry({
      scope: 'board',
      action: 'bulk_waiting_date',
      summary: `回答予定日を一括設定 ${selectedTaskIds.length}件`,
      detail: shouldSwitchToWaiting ? `待ちへ変更して回答予定日 ${formatDate(nextWaitingResponseDate)} を設定` : `回答予定日を ${formatDate(nextWaitingResponseDate)} に更新`,
      tone: 'warning',
    });
    setBulkUpdating(false);
  }, [bulkWaitingResponseDate, selectedTaskIds, selectedTasks]);

  const clearBulkWaitingResponseDate = useCallback(async () => {
    const waitingTaskIds = selectedTasks
      .filter((task) => task.status === 'waiting' && task.waiting_response_date)
      .map((task) => task.id);

    if (waitingTaskIds.length === 0) return;

    setBulkUpdating(true);
    setError(null);
    setNotice(null);

    const { data, error: bulkError } = await getSupabaseClient()
      .from('tasks')
      .update({ waiting_response_date: null })
      .in('id', waitingTaskIds)
      .select('*');

    if (bulkError) {
      setError(bulkError.message);
      setBulkUpdating(false);
      return;
    }

    const updatedTaskMap = new Map(((data as Task[]) ?? []).map((task) => [task.id, task]));
    setTasks((prev) => prev.map((task) => updatedTaskMap.get(task.id) ?? task));
    setSelectedTaskIds([]);
    setNotice(`選択中 ${waitingTaskIds.length}件の回答予定日を外しました。`);
    appendHistoryEntry({
      scope: 'board',
      action: 'bulk_clear_waiting_date',
      summary: `回答予定日を一括解除 ${waitingTaskIds.length}件`,
      tone: 'warning',
    });
    setBulkUpdating(false);
  }, [selectedTasks]);

  const handleBulkDelete = useCallback(async () => {
    if (selectedTaskIds.length === 0) return;

    const confirmed = window.confirm(`選択中 ${selectedTaskIds.length}件を削除します。よろしいですか？`);
    if (!confirmed) return;

    setBulkUpdating(true);
    setError(null);
    setNotice(null);

    const selectedSet = new Set(selectedTaskIds);
    const deletingProjectIds = tasks
      .filter((task) => selectedSet.has(task.id) && task.gtd_category === 'project')
      .map((task) => task.id);

    const { error: bulkError } = await getSupabaseClient().from('tasks').delete().in('id', selectedTaskIds);

    if (bulkError) {
      setError(bulkError.message);
      setBulkUpdating(false);
      return;
    }

    setTasks((prev) => {
      const remaining = prev.filter((task) => !selectedSet.has(task.id));
      if (deletingProjectIds.length === 0) return remaining;

      return remaining.map((task) =>
        deletingProjectIds.includes(task.project_task_id ?? '')
          ? { ...task, project_task_id: null }
          : task,
      );
    });
    setSelectedTaskIds([]);
    setNotice(`選択中 ${selectedTaskIds.length}件を削除しました。`);
    setBulkUpdating(false);
  }, [selectedTaskIds, tasks]);

  const resetBoardFilters = () => {
    setKeyword('');
    setGtdFilter('all');
    setImportanceFilter('all');
    setUrgencyFilter('all');
    setSortKey('newest');
    setViewMode('kanban');
    setShowSomedayInNormalViews(false);
    setProjectFilterId('all');
    setSelectionMode(false);
    setSelectedTaskIds([]);
    window.localStorage.removeItem(BOARD_PREFERENCES_KEY);
    setNotice('Board の表示条件を初期化しました。');
  };

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-[106rem] flex-col gap-6 px-4 py-6 sm:px-6">
      <header className="sticky top-0 z-40 -mx-4 px-4 py-1 backdrop-blur sm:-mx-6 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white/95 px-4 py-3 shadow-sm ring-1 ring-slate-900/5 sm:px-5">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold text-slate-900">FlowFocus</h1>
            <span className="rounded-full bg-blue-50 px-2.5 py-1 text-[11px] font-semibold text-blue-700">
              {VIEW_MODE_LABELS[viewMode]}
            </span>
            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-600">
              表示中 {visibleTaskCount}件
            </span>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2">
            <Link
              href="/projects"
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
            >
              Projects
            </Link>
            <button
              type="button"
              onClick={() => void fetchTasks(true)}
              disabled={loading || refreshing}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {refreshing ? '更新中...' : '再読込'}
            </button>
            <ExportActions
              label="Export"
              onExportCsv={handleExportVisibleTasksCsv}
              onExportJson={handleExportVisibleTasksJson}
            />
            <button
              type="button"
              onClick={() => void onLogout()}
              disabled={loggingOut}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loggingOut ? 'ログアウト中...' : 'ログアウト'}
            </button>
            {userEmail ? <span className="text-[11px] text-slate-500">{userEmail}</span> : null}
          </div>
        </div>
      </header>

      <div className="grid gap-6 xl:grid-cols-[340px_minmax(0,1fr)]">
        <aside className="space-y-6 xl:sticky xl:top-32 xl:self-start">
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">検索 / 表示</h2>
              </div>
              <button
                type="button"
                onClick={resetBoardFilters}
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 transition hover:bg-slate-50"
              >
                条件をリセット
              </button>
            </div>

            <div className="mt-4 space-y-3">
              <input
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                placeholder="タイトル・説明・担当者で検索"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />

              <select
                value={gtdFilter}
                onChange={(e) => setGtdFilter(e.target.value as 'all' | TaskGtdCategory)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              >
                <option value="all">GTD: すべて</option>
                {TASK_GTD_VALUES.map((category) => (
                  <option key={category} value={category}>
                    GTD: {TASK_GTD_LABELS[category]}
                  </option>
                ))}
              </select>

              <select
                value={importanceFilter}
                onChange={(e) => setImportanceFilter(e.target.value as 'all' | TaskImportance)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              >
                <option value="all">重要度: すべて</option>
                {TASK_IMPORTANCE_VALUES.map((importance) => (
                  <option key={importance} value={importance}>
                    重要度: {IMPORTANCE_LABELS[importance]}
                  </option>
                ))}
              </select>

              <select
                value={urgencyFilter}
                onChange={(e) => setUrgencyFilter(e.target.value as 'all' | TaskUrgency)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              >
                <option value="all">緊急度: すべて</option>
                {TASK_URGENCY_VALUES.map((urgency) => (
                  <option key={urgency} value={urgency}>
                    緊急度: {URGENCY_LABELS[urgency]}
                  </option>
                ))}
              </select>

              <select
                value={projectFilterId}
                onChange={(e) => setProjectFilterId(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              >
                <option value="all">関連プロジェクト: すべて</option>
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.title}
                  </option>
                ))}
              </select>

              <select
                value={sortKey}
                onChange={(e) => setSortKey(e.target.value as TaskSortKey)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              >
                {(Object.keys(TASK_SORT_LABELS) as TaskSortKey[]).map((key) => (
                  <option key={key} value={key}>
                    並び順: {TASK_SORT_LABELS[key]}
                  </option>
                ))}
              </select>

              <div className="grid grid-cols-4 gap-2 rounded-xl bg-slate-100 p-1">
                <ViewModeButton
                  active={viewMode === 'kanban'}
                  onClick={() => setViewMode('kanban')}
                  label="カンバン"
                />
                <ViewModeButton
                  active={viewMode === 'today'}
                  onClick={() => setViewMode('today')}
                  label="今日"
                />
                <ViewModeButton
                  active={viewMode === 'matrix'}
                  onClick={() => setViewMode('matrix')}
                  label="マトリクス"
                />
                <ViewModeButton
                  active={viewMode === 'gtd'}
                  onClick={() => setViewMode('gtd')}
                  label="GTD"
                />
              </div>

              {viewMode !== 'gtd' ? (
                <label className="flex items-center gap-2 text-sm text-slate-600">
                  <input
                    type="checkbox"
                    checked={showSomedayInNormalViews}
                    onChange={(e) => setShowSomedayInNormalViews(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300"
                  />
                  保留も表示
                </label>
              ) : null}
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">タスク追加</h2>

            <form onSubmit={(e) => void addTask(e)} className="mt-4 space-y-3">
              <input
                required
                value={newTask.title}
                onChange={(e) => setNewTask((prev) => ({ ...prev, title: e.target.value }))}
                placeholder="タイトル"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />

              <input
                value={newTask.assignee}
                onChange={(e) => setNewTask((prev) => ({ ...prev, assignee: e.target.value }))}
                placeholder="担当者"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />

              <textarea
                value={newTask.description}
                onChange={(e) => setNewTask((prev) => ({ ...prev, description: e.target.value }))}
                placeholder="説明"
                rows={4}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />

              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-1">
                <select
                  value={newTask.importance}
                  onChange={(e) =>
                    setNewTask((prev) => ({
                      ...prev,
                      importance: e.target.value as TaskImportance,
                    }))
                  }
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                >
                  {TASK_IMPORTANCE_VALUES.map((importance) => (
                    <option key={importance} value={importance}>
                      重要度: {IMPORTANCE_LABELS[importance]}
                    </option>
                  ))}
                </select>

                <select
                  value={newTask.urgency}
                  onChange={(e) =>
                    setNewTask((prev) => ({
                      ...prev,
                      urgency: e.target.value as TaskUrgency,
                    }))
                  }
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                >
                  {TASK_URGENCY_VALUES.map((urgency) => (
                    <option key={urgency} value={urgency}>
                      緊急度: {URGENCY_LABELS[urgency]}
                    </option>
                  ))}
                </select>
              </div>

              <input
                type="date"
                value={newTask.dueDate}
                onChange={(e) => setNewTask((prev) => ({ ...prev, dueDate: e.target.value }))}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />

              <select
                value={newTask.gtdCategory}
                onChange={(e) =>
                  setNewTask((prev) => {
                    const gtdCategory = e.target.value as TaskGtdCategory;
                    return {
                      ...prev,
                      gtdCategory,
                      projectTaskId: gtdCategory === 'next_action' ? prev.projectTaskId : '',
                    };
                  })
                }
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              >
                {TASK_GTD_VALUES.map((category) => (
                  <option key={category} value={category}>
                    GTD: {TASK_GTD_LABELS[category]}
                  </option>
                ))}
              </select>

              {newTask.gtdCategory === 'next_action' ? (
                <select
                  value={newTask.projectTaskId}
                  onChange={(e) =>
                    setNewTask((prev) => ({ ...prev, projectTaskId: e.target.value }))
                  }
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                >
                  <option value="">関連プロジェクト: 未設定</option>
                  {projectTasks.map((projectTask) => (
                    <option key={projectTask.id} value={projectTask.id}>
                      関連プロジェクト: {projectTask.title}
                    </option>
                  ))}
                </select>
              ) : null}

              <button
                type="submit"
                disabled={saving}
                className="w-full rounded-lg bg-slate-900 px-4 py-3 text-sm font-medium text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving ? '保存中...' : 'タスクを追加'}
              </button>
            </form>
          </section>

          {error ? (
            <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {error}
            </p>
          ) : null}

          {notice ? (
            <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
              {notice}
            </p>
          ) : null}

          <HistoryPanel
            entries={boardHistoryEntries}
            onClear={clearHistoryEntries}
            onExportCsv={handleExportHistoryCsv}
            onExportJson={handleExportHistoryJson}
            title="履歴"
            emptyLabel="まだ履歴はありません。タスク追加や一括操作を行うとここに残ります。"
          />
        </aside>

        <section className="space-y-6">
          <div className="sticky top-28 z-30 space-y-1.5">
            <section className="rounded-2xl border border-slate-200 bg-white/95 p-2 shadow-sm backdrop-blur">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-sm font-semibold text-slate-900 sm:text-base">
                    {VIEW_MODE_LABELS[viewMode]} の現在地
                  </h2>
                  <div className="inline-flex items-center rounded-full bg-blue-50 px-2.5 py-1 text-[11px] font-medium text-blue-700">
                    表示モード: {VIEW_MODE_LABELS[viewMode]}
                  </div>
                  <div className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-700">
                    並び順: {TASK_SORT_LABELS[sortKey]}
                  </div>
                  <Link
                    href="/projects"
                    className="rounded-full border border-slate-300 bg-white px-3 py-1 text-[11px] font-medium text-slate-700 transition hover:bg-slate-50"
                  >
                    Project
                  </Link>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectionMode((prev) => !prev);
                      if (selectionMode) {
                        setSelectedTaskIds([]);
                      }
                    }}
                    className={`rounded-lg border px-3 py-2 text-xs font-medium transition sm:text-sm ${
                      selectionMode
                        ? 'border-slate-900 bg-slate-900 text-white hover:bg-slate-800'
                        : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    {selectionMode ? '複数選択を終了' : '複数選択'}
                  </button>

                  {selectionMode ? (
                    <button
                      type="button"
                      onClick={handleToggleSelectAllVisible}
                      disabled={bulkSelectableTaskIds.length === 0}
                      className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 sm:text-sm"
                    >
                      {allVisibleSelected ? '表示中を解除' : '表示中を全選択'}
                    </button>
                  ) : null}
                </div>
              </div>

              <div className="mt-1.5 grid gap-1.5 md:grid-cols-2 xl:grid-cols-4">
                <CompactContextStat label="表示中タスク" value={`${visibleTaskCount}件`} />
                {viewMode === 'today' ? (
                  <>
                    <CompactContextStat
                      label="今すぐ対応"
                      value={`${todaySummary.urgentActionCount}件`}
                      danger={todaySummary.urgentActionCount > 0}
                    />
                    <CompactContextStat
                      label="回答予定日超過"
                      value={`${todaySummary.waitingOverdueCount}件`}
                      danger={todaySummary.waitingOverdueCount > 0}
                    />
                    <CompactContextStat
                      label="待ち日付未設定"
                      value={`${todaySummary.waitingNoDateCount}件`}
                      danger={todaySummary.waitingNoDateCount > 0}
                    />
                  </>
                ) : (
                  <>
                    <CompactContextStat label="未完了" value={`${incompleteTaskCount}件`} />
                    <CompactContextStat label="進行中" value={`${groupedTasks.doing.length}件`} />
                    <CompactContextStat
                      label="待ち"
                      value={`${groupedTasks.waiting.length}件`}
                      danger={groupedTasks.waiting.length > 0}
                    />
                  </>
                )}
              </div>

              <div className="mt-1.5 space-y-1.5">
                <AlertStrip items={boardAlertItems} compact defaultCollapsed />
                <div className="flex flex-wrap items-center gap-2">
                  {activeFilterChips.map((chip) => (
                    <FilterChip key={chip} label={chip} />
                  ))}
                  {selectionMode ? <FilterChip label={`選択中 ${selectedTaskIds.length}件`} subtle /> : null}
                </div>
              </div>

              {viewMode === 'today' ? (
                <div className="mt-2 grid gap-2 xl:grid-cols-[minmax(0,1.6fr)_minmax(20rem,1fr)]">
                  <section className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="text-sm font-semibold text-slate-900">今やる1件 と 次にやる2件</h3>
                      <span className="text-[11px] text-slate-500">主役を最優先で表示</span>
                    </div>
                    {todayFocusTasks.length === 0 ? (
                      <p className="mt-2 text-xs text-slate-500">条件内に優先候補はありません。</p>
                    ) : (
                      <div className="mt-2 grid gap-2 xl:grid-cols-[minmax(0,1.4fr)_minmax(18rem,1fr)]">
                        <FeaturedFocusTaskCard
                          title={todayFocusTasks[0].task.title}
                          reason={todayFocusTasks[0].reason}
                          detail={todayFocusTasks[0].detail}
                          tone={todayFocusTasks[0].tone}
                          projectTitle={todayFocusTasks[0].task.project_task_id ? projectTaskMap[todayFocusTasks[0].task.project_task_id]?.title ?? null : null}
                          onOpen={() => setEditingTask(todayFocusTasks[0].task)}
                          onDone={() => void updateStatus(todayFocusTasks[0].task, 'done')}
                          onWaiting={() => void applySuggestedWaiting(todayFocusTasks[0].task)}
                        />
                        <div className="grid gap-2">
                          {todayFocusTasks.slice(1).map((item) => (
                            <FocusTaskCard
                              key={item.task.id}
                              title={item.task.title}
                              reason={item.reason}
                              detail={item.detail}
                              tone={item.tone}
                              projectTitle={item.task.project_task_id ? projectTaskMap[item.task.project_task_id]?.title ?? null : null}
                              onOpen={() => setEditingTask(item.task)}
                              onDone={() => void updateStatus(item.task, 'done')}
                              onWaiting={() => void applySuggestedWaiting(item.task)}
                            />
                          ))}
                          {todayFocusTasks.length === 1 ? (
                            <div className="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-6 text-xs text-slate-400">次点候補はありません。</div>
                          ) : null}
                        </div>
                      </div>
                    )}
                  </section>

                  <section className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="text-sm font-semibold text-slate-900">止まり案件</h3>
                      <span className="text-[11px] text-slate-500">危険順に自動整列</span>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {stalledTaskQuickSelections.map((preset) => (
                        <QuickSelectButton
                          key={preset.key}
                          label={preset.label}
                          count={preset.taskIds.length}
                          disabled={preset.taskIds.length === 0}
                          onClick={() => applySelectionPreset(preset.taskIds)}
                        />
                      ))}
                    </div>
                    <div className="mt-2 space-y-2">
                      {stalledTasks.length === 0 ? (
                        <p className="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-5 text-xs text-slate-500">止まり案件はありません。</p>
                      ) : (
                        stalledTasks.map((item) => (
                          <StalledTaskRow
                            key={item.task.id}
                            title={item.task.title}
                            reason={item.reason}
                            detail={item.detail}
                            tone={item.tone}
                            projectTitle={item.task.project_task_id ? projectTaskMap[item.task.project_task_id]?.title ?? null : null}
                            onOpen={() => setEditingTask(item.task)}
                            onDone={() => void updateStatus(item.task, 'done')}
                            onWaiting={() => void applySuggestedWaiting(item.task)}
                          />
                        ))
                      )}
                    </div>
                  </section>
                </div>
              ) : (
                <div className="mt-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-medium text-slate-600">止まり案件（危険順）</span>
                    {stalledTaskQuickSelections.map((preset) => (
                      <QuickSelectButton
                        key={preset.key}
                        label={preset.label}
                        count={preset.taskIds.length}
                        disabled={preset.taskIds.length === 0}
                        onClick={() => applySelectionPreset(preset.taskIds)}
                      />
                    ))}
                    <span className="text-[11px] text-slate-500">待ちに送る時は回答予定日を自動提案</span>
                  </div>
                  {stalledTasks.length > 0 ? (
                    <div className="mt-2 grid gap-2 lg:grid-cols-2">
                      {stalledTasks.slice(0, 2).map((item) => (
                        <StalledTaskRow
                          key={item.task.id}
                          title={item.task.title}
                          reason={item.reason}
                          detail={item.detail}
                          tone={item.tone}
                          projectTitle={item.task.project_task_id ? projectTaskMap[item.task.project_task_id]?.title ?? null : null}
                          onOpen={() => setEditingTask(item.task)}
                          onDone={() => void updateStatus(item.task, 'done')}
                          onWaiting={() => void applySuggestedWaiting(item.task)}
                        />
                      ))}
                    </div>
                  ) : null}
                </div>
              )}

              {viewMode === 'today' ? (
                <div className="mt-1.5 flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                  <span className="text-xs font-medium text-slate-600">クイック選択</span>
                  {todayQuickSelections.map((preset) => (
                    <QuickSelectButton
                      key={preset.key}
                      label={preset.label}
                      count={preset.taskIds.length}
                      disabled={preset.taskIds.length === 0}
                      onClick={() => applySelectionPreset(preset.taskIds)}
                    />
                  ))}
                </div>
              ) : null}

              {selectionMode ? (
                <div className="mt-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    {(['doing', 'waiting', 'done', 'todo'] as TaskProgress[]).map((status) => (
                      <QuickActionButton
                        key={status}
                        label={TASK_PROGRESS_LABELS[status]}
                        disabled={selectedTaskIds.length === 0 || bulkUpdating}
                        onClick={() => void applyBulkStatusChange(status)}
                      />
                    ))}

                    <InlineBulkSelect
                      placeholder="重要度を一括変更"
                      disabled={selectedTaskIds.length === 0 || bulkUpdating}
                      options={TASK_IMPORTANCE_VALUES.map((importance) => ({
                        value: importance,
                        label: `重要度: ${IMPORTANCE_LABELS[importance]}`,
                      }))}
                      onSelect={(value) =>
                        void applyBulkFieldChange(
                          { importance: value },
                          `選択中 ${selectedTaskIds.length}件の重要度を更新しました。`,
                        )
                      }
                    />

                    <InlineBulkSelect
                      placeholder="緊急度を一括変更"
                      disabled={selectedTaskIds.length === 0 || bulkUpdating}
                      options={TASK_URGENCY_VALUES.map((urgency) => ({
                        value: urgency,
                        label: `緊急度: ${URGENCY_LABELS[urgency]}`,
                      }))}
                      onSelect={(value) =>
                        void applyBulkFieldChange(
                          { urgency: value },
                          `選択中 ${selectedTaskIds.length}件の緊急度を更新しました。`,
                        )
                      }
                    />

                    <InlineBulkSelect
                      placeholder="GTDを一括変更"
                      disabled={selectedTaskIds.length === 0 || bulkUpdating}
                      options={BULK_GTD_OPTIONS.map((category) => ({
                        value: category,
                        label: `GTD: ${TASK_GTD_LABELS[category]}`,
                      }))}
                      onSelect={(value) =>
                        void applyBulkFieldChange(
                          value === 'next_action' ? { gtd_category: value } : { gtd_category: value, project_task_id: null },
                          `選択中 ${selectedTaskIds.length}件のGTD分類を更新しました。`,
                        )
                      }
                    />
                  </div>

                  <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-slate-200 pt-2">
                    <input
                      type="date"
                      value={bulkWaitingResponseDate}
                      onChange={(event) => setBulkWaitingResponseDate(event.target.value)}
                      disabled={selectedTaskIds.length === 0 || bulkUpdating}
                      className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-700 disabled:cursor-not-allowed disabled:opacity-50 sm:text-sm"
                    />
                    <QuickDatePresetButton
                      label="次営業日"
                      disabled={selectedTaskIds.length === 0 || bulkUpdating}
                      onClick={() => setBulkWaitingResponseDate(getSuggestedWaitingResponseDate(1))}
                    />
                    <QuickDatePresetButton
                      label="3営業日"
                      disabled={selectedTaskIds.length === 0 || bulkUpdating}
                      onClick={() => setBulkWaitingResponseDate(getSuggestedWaitingResponseDate(3))}
                    />
                    <button
                      type="button"
                      onClick={() => void applyBulkWaitingResponseDate()}
                      disabled={selectedTaskIds.length === 0 || bulkUpdating}
                      className="rounded-lg border border-violet-300 bg-white px-3 py-2 text-xs font-medium text-violet-700 transition hover:bg-violet-50 disabled:cursor-not-allowed disabled:opacity-50 sm:text-sm"
                    >
                      {selectedNonWaitingTaskCount > 0 ? '待ち＋回答日自動設定' : '回答日を更新'}
                    </button>
                    <button
                      type="button"
                      onClick={() => void clearBulkWaitingResponseDate()}
                      disabled={selectedWaitingWithDateCount === 0 || bulkUpdating}
                      className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 sm:text-sm"
                    >
                      回答日を外す
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        clearTaskSelection();
                        setSelectionMode(false);
                        setBulkWaitingResponseDate('');
                      }}
                      disabled={!selectionMode}
                      className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 sm:text-sm"
                    >
                      選択解除
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleBulkDelete()}
                      disabled={selectedTaskIds.length === 0 || bulkUpdating}
                      className="rounded-lg border border-rose-300 bg-white px-3 py-2 text-xs font-medium text-rose-700 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50 sm:text-sm"
                    >
                      一括削除
                    </button>
                  </div>
                </div>
              ) : null}
            </section>
          </div>


          {loading ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-8 text-sm text-slate-500 shadow-sm">
              読み込み中...
            </div>
          ) : viewMode === 'kanban' ? (
            <section className="grid gap-4 xl:grid-cols-4">
              {TASK_PROGRESS_ORDER.map((status) => (
                <TaskGroupCard
                  key={status}
                  title={TASK_PROGRESS_LABELS[status]}
                  subtitle={`${groupedTasks[status].length}件 / ドラッグでも移動できます`}
                  dropTargetStatus={status}
                  dragActive={dragOverStatus === status}
                  onDragOver={(event) => handleColumnDragOver(event, status)}
                  onDragLeave={() => setDragOverStatus((prev) => (prev === status ? null : prev))}
                  onDrop={(event) => void handleColumnDrop(event, status)}
                >
                  {groupedTasks[status].length === 0 ? (
                    <EmptyState label="ここにドラッグして移動できます" />
                  ) : (
                    <div className="space-y-3">
                      {getLimitedItems(`kanban-${status}`, groupedTasks[status]).map((task) => (
                        <TaskCard
                          key={task.id}
                          task={task}
                          disabled={updatingTaskId === task.id}
                          onUpdateStatus={updateStatus}
                          onDelete={deleteTask}
                          onEdit={setEditingTask}
                          onDragStart={handleTaskDragStart}
                          onDragEnd={handleTaskDragEnd}
                          dragging={draggedTaskId === task.id}
                          draggable={!selectionMode && updatingTaskId !== task.id}
                          selectionMode={selectionMode}
                          selectable
                          selected={selectedTaskIds.includes(task.id)}
                          onToggleSelect={toggleTaskSelection}
                          projectTaskMap={projectTaskMap}
                          projectNextActionCountMap={projectNextActionCountMap}
                          mode="kanban"
                        />
                      ))}

                      <SectionExpandButton
                        hiddenCount={groupedTasks[status].length - getLimitedItems(`kanban-${status}`, groupedTasks[status]).length}
                        expanded={Boolean(expandedSectionKeys[`kanban-${status}`])}
                        onToggle={() => toggleSectionExpanded(`kanban-${status}`)}
                      />
                    </div>
                  )}
                </TaskGroupCard>
              ))}
            </section>
          ) : viewMode === 'matrix' ? (
            <section className="grid gap-4 md:grid-cols-2">
              {MATRIX_QUADRANTS.map((quadrant) => (
                <TaskGroupCard
                  key={quadrant.key}
                  title={quadrant.title}
                  subtitle={quadrant.subtitle}
                >
                  {matrixTasks[quadrant.key].length === 0 ? (
                    <EmptyState label="タスクなし" />
                  ) : (
                    matrixTasks[quadrant.key].map((task) => (
                      <TaskCard
                        key={task.id}
                        task={task}
                        disabled={updatingTaskId === task.id}
                        onUpdateStatus={updateStatus}
                        onDelete={deleteTask}
                        onEdit={setEditingTask}
                        selectionMode={selectionMode}
                        selectable
                        selected={selectedTaskIds.includes(task.id)}
                        onToggleSelect={toggleTaskSelection}
                        projectTaskMap={projectTaskMap}
                        projectNextActionCountMap={projectNextActionCountMap}
                        mode="matrix"
                      />
                    ))
                  )}
                </TaskGroupCard>
              ))}
            </section>
          ) : viewMode === 'gtd' ? (
            <section className="grid gap-4 md:grid-cols-2">
              {GTD_SECTIONS.map((section) => (
                <TaskGroupCard
                  key={section.key}
                  title={section.title}
                  subtitle={
                    section.key === 'project'
                      ? `${gtdTasks.project.length}件 / クリックで編集、配下は折りたたみ表示`
                      : `${gtdTasks[section.key].length}件`
                  }
                >
                  {gtdTasks[section.key].length === 0 ? (
                    <EmptyState label="タスクなし" />
                  ) : section.key === 'project' ? (
                    gtdTasks.project.map((task) => (
                      <ProjectTaskAccordionCard
                        key={task.id}
                        task={task}
                        disabled={updatingTaskId === task.id}
                        onEdit={setEditingTask}
                        expanded={Boolean(expandedProjectIds[task.id])}
                        onToggle={() =>
                          setExpandedProjectIds((prev) => ({
                            ...prev,
                            [task.id]: !prev[task.id],
                          }))
                        }
                        childTasks={projectChildrenByProjectId[task.id] ?? []}
                        childDisabledTaskId={updatingTaskId}
                        childDraggedTaskId={draggedTaskId}
                        onUpdateStatus={updateStatus}
                        onDelete={deleteTask}
                        onChildEdit={setEditingTask}
                        onDragStart={handleTaskDragStart}
                        onDragEnd={handleTaskDragEnd}
                        projectTaskMap={projectTaskMap}
                        projectNextActionCountMap={projectNextActionCountMap}
                        selectionMode={selectionMode}
                        selectedTaskIds={selectedTaskIds}
                        onToggleSelect={toggleTaskSelection}
                        expandedSectionKeys={expandedSectionKeys}
                        getLimitedItems={getLimitedItems}
                        onToggleSectionExpanded={toggleSectionExpanded}
                      />
                    ))
                  ) : (
                    <div className="space-y-3">
                      {getLimitedItems(`gtd-${section.key}`, gtdTasks[section.key]).map((task) => (
                        <TaskCard
                          key={task.id}
                          task={task}
                          disabled={updatingTaskId === task.id}
                          onUpdateStatus={updateStatus}
                          onDelete={deleteTask}
                          onEdit={setEditingTask}
                          selectionMode={selectionMode}
                          selectable
                          selected={selectedTaskIds.includes(task.id)}
                          onToggleSelect={toggleTaskSelection}
                          projectTaskMap={projectTaskMap}
                          projectNextActionCountMap={projectNextActionCountMap}
                          mode="gtd"
                        />
                      ))}

                      <SectionExpandButton
                        hiddenCount={gtdTasks[section.key].length - getLimitedItems(`gtd-${section.key}`, gtdTasks[section.key]).length}
                        expanded={Boolean(expandedSectionKeys[`gtd-${section.key}`])}
                        onToggle={() => toggleSectionExpanded(`gtd-${section.key}`)}
                      />
                    </div>
                  )}
                </TaskGroupCard>
              ))}
            </section>
          ) : visibleTodaySections.length === 0 ? (
            <section className="grid gap-4 md:grid-cols-2">
              <TaskGroupCard title="今日の候補" subtitle="0件 / 該当なし">
                <EmptyState label="今日ビューに該当するタスクはありません" />
              </TaskGroupCard>
            </section>
          ) : (
            <section className="grid gap-4 md:grid-cols-2">
              {visibleTodaySections.map((section) => (
                <TaskGroupCard
                  key={section.key}
                  title={section.title}
                  subtitle={`${todayTasks[section.key].length}件 / ${section.subtitle}`}
                >
                  <div className="space-y-3">
                    {getLimitedItems(`today-${section.key}`, todayTasks[section.key]).map((task) => (
                      <TaskCard
                        key={task.id}
                        task={task}
                        disabled={updatingTaskId === task.id}
                        onUpdateStatus={updateStatus}
                        onDelete={deleteTask}
                        onEdit={setEditingTask}
                        selectionMode={selectionMode}
                        selectable
                        selected={selectedTaskIds.includes(task.id)}
                        onToggleSelect={toggleTaskSelection}
                        projectTaskMap={projectTaskMap}
                        projectNextActionCountMap={projectNextActionCountMap}
                        mode="gtd"
                      />
                    ))}

                    <SectionExpandButton
                      hiddenCount={todayTasks[section.key].length - getLimitedItems(`today-${section.key}`, todayTasks[section.key]).length}
                      expanded={Boolean(expandedSectionKeys[`today-${section.key}`])}
                      onToggle={() => toggleSectionExpanded(`today-${section.key}`)}
                    />
                  </div>
                </TaskGroupCard>
              ))}
            </section>
          )}
        </section>
      </div>

      <TaskEditModal
        open={editingTask !== null}
        task={editingTask}
        projectTasks={projectTasks}
        saving={updatingTaskId === editingTask?.id}
        onClose={() => {
          if (updatingTaskId) return;
          setEditingTask(null);
        }}
        onSave={saveTaskEdits}
        onDelete={
          editingTask
            ? async () => {
                const targetId = editingTask.id;
                await deleteTask(targetId);
                setEditingTask(null);
              }
            : undefined
        }
      />
    </main>
  );
}

function ViewModeButton({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-md px-3 py-2 text-sm transition ${
        active ? 'bg-white font-medium text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
      }`}
    >
      {label}
    </button>
  );
}

function QuickSelectButton({
  label,
  count,
  disabled,
  onClick,
}: {
  label: string;
  count: number;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="rounded-full border border-slate-300 bg-white px-3 py-1 text-xs font-medium text-slate-700 transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {label} {count}件
    </button>
  );
}

function QuickActionButton({
  label,
  disabled,
  onClick,
}: {
  label: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 sm:text-sm"
    >
      {label}にする
    </button>
  );
}

function QuickDatePresetButton({
  label,
  disabled,
  onClick,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-[11px] font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 sm:text-xs"
    >
      {label}
    </button>
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

function InlineBulkSelect({
  placeholder,
  disabled,
  options,
  onSelect,
}: {
  placeholder: string;
  disabled: boolean;
  options: Array<{ value: string; label: string }>;
  onSelect: (value: string) => void;
}) {
  return (
    <select
      defaultValue=""
      disabled={disabled}
      onChange={(event) => {
        const value = event.target.value;
        if (!value) return;
        onSelect(value);
        event.target.value = '';
      }}
      className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 sm:text-sm"
    >
      <option value="">{placeholder}</option>
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

function TaskGroupCard({
  title,
  subtitle,
  children,
  dropTargetStatus,
  dragActive = false,
  onDragOver,
  onDragLeave,
  onDrop,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
  dropTargetStatus?: TaskProgress;
  dragActive?: boolean;
  onDragOver?: (event: DragEvent<HTMLDivElement>) => void;
  onDragLeave?: () => void;
  onDrop?: (event: DragEvent<HTMLDivElement>) => void;
}) {
  return (
    <article
      className={`rounded-2xl border bg-white p-4 shadow-sm transition ${
        dragActive ? 'border-sky-400 ring-2 ring-sky-200' : 'border-slate-200'
      }`}
      onDragOver={dropTargetStatus ? onDragOver : undefined}
      onDragLeave={dropTargetStatus ? onDragLeave : undefined}
      onDrop={dropTargetStatus ? onDrop : undefined}
    >
      <div className="mb-4">
        <h2 className="text-xl font-semibold text-slate-900">{title}</h2>
        <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
      </div>
      <div className="space-y-3">{children}</div>
    </article>
  );
}

function EmptyState({ label = '条件に一致するタスクはありません' }: { label?: string }) {
  return (
    <div className="rounded-2xl bg-slate-50 px-4 py-6 text-sm text-slate-500 ring-1 ring-dashed ring-slate-300">
      <div className="text-base">○</div>
      <div className="mt-1">{label}</div>
    </div>
  );
}

function ProjectTaskAccordionCard({
  task,
  disabled,
  onEdit,
  expanded,
  onToggle,
  childTasks,
  childDisabledTaskId,
  childDraggedTaskId,
  onUpdateStatus,
  onDelete,
  onChildEdit,
  onDragStart,
  onDragEnd,
  projectTaskMap,
  projectNextActionCountMap,
  selectionMode,
  selectedTaskIds,
  onToggleSelect,
  expandedSectionKeys,
  getLimitedItems,
  onToggleSectionExpanded,
}: {
  task: Task;
  disabled: boolean;
  onEdit: (task: Task) => void;
  expanded: boolean;
  onToggle: () => void;
  childTasks: Task[];
  childDisabledTaskId: string | null;
  childDraggedTaskId: string | null;
  onUpdateStatus: (task: Task, status: TaskProgress) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onChildEdit: (task: Task) => void;
  onDragStart: (taskId: string) => void;
  onDragEnd: () => void;
  projectTaskMap: Record<string, Task>;
  projectNextActionCountMap: Record<string, number>;
  selectionMode: boolean;
  selectedTaskIds: string[];
  onToggleSelect: (taskId: string) => void;
  expandedSectionKeys: Record<string, boolean>;
  getLimitedItems: <T>(key: string, items: T[], limit?: number) => T[];
  onToggleSectionExpanded: (key: string) => void;
}) {
  return (
    <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-3">
      <TaskCard
        task={task}
        disabled={disabled}
        onEdit={onEdit}
        projectTaskMap={projectTaskMap}
        projectNextActionCountMap={projectNextActionCountMap}
        mode="gtd"
      />

      <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-slate-900">配下の次アクション</p>
            <p className="mt-1 text-xs text-slate-500">
              {childTasks.length}件 / プロジェクト文脈でまとめて確認
            </p>
          </div>
          <button
            type="button"
            onClick={onToggle}
            data-no-card-click="true"
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
          >
            {expanded ? '折りたたむ' : `展開する (${childTasks.length}件)`}
          </button>
        </div>

        {expanded ? (
          childTasks.length === 0 ? (
            <div className="mt-3">
              <EmptyState label="このプロジェクトの次アクションはありません" />
            </div>
          ) : (
            <div className="mt-3 space-y-3">
              {getLimitedItems(`gtd-project-${task.id}`, childTasks).map((childTask) => (
                <TaskCard
                  key={childTask.id}
                  task={childTask}
                  disabled={childDisabledTaskId === childTask.id}
                  onUpdateStatus={onUpdateStatus}
                  onDelete={onDelete}
                  onEdit={onChildEdit}
                  onDragStart={onDragStart}
                  onDragEnd={onDragEnd}
                  dragging={childDraggedTaskId === childTask.id}
                  draggable={!selectionMode && childDisabledTaskId !== childTask.id}
                  selectionMode={selectionMode}
                  selectable
                  selected={selectedTaskIds.includes(childTask.id)}
                  onToggleSelect={onToggleSelect}
                  projectTaskMap={projectTaskMap}
                  projectNextActionCountMap={projectNextActionCountMap}
                  mode="gtd"
                />
              ))}

              <SectionExpandButton
                hiddenCount={childTasks.length - getLimitedItems(`gtd-project-${task.id}`, childTasks).length}
                expanded={Boolean(expandedSectionKeys[`gtd-project-${task.id}`])}
                onToggle={() => onToggleSectionExpanded(`gtd-project-${task.id}`)}
              />
            </div>
          )
        ) : null}
      </div>
    </div>
  );
}

function FeaturedFocusTaskCard({
  title,
  reason,
  detail,
  tone,
  projectTitle,
  onOpen,
  onDone,
  onWaiting,
}: {
  title: string;
  reason: string;
  detail: string;
  tone: 'danger' | 'warning' | 'info';
  projectTitle?: string | null;
  onOpen: () => void;
  onDone: () => void;
  onWaiting: () => void;
}) {
  const toneClassName =
    tone === 'danger'
      ? 'border-rose-200 bg-rose-50 text-rose-700'
      : tone === 'warning'
        ? 'border-amber-200 bg-amber-50 text-amber-700'
        : 'border-blue-200 bg-blue-50 text-blue-700';

  return (
    <article className="rounded-3xl border border-slate-900 bg-gradient-to-br from-white via-slate-50 to-blue-50 p-6 shadow-md ring-1 ring-slate-900/10">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">今やる1件</p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <div className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold ${toneClassName}`}>{reason}</div>
        {projectTitle ? <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-600">Project: {projectTitle}</span> : null}
      </div>
      <h4 className="mt-4 text-2xl font-semibold tracking-tight text-slate-900">{title}</h4>
      <p className="mt-2 text-sm leading-6 text-slate-600">{detail}</p>
      <div className="mt-5 flex flex-wrap gap-2">
        <button type="button" onClick={onDone} className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-medium text-white transition hover:bg-slate-800">完了</button>
        <button type="button" onClick={onWaiting} className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-medium text-blue-700 transition hover:bg-blue-100">待ち＋日付</button>
        <button type="button" onClick={onOpen} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 transition hover:bg-slate-50">開く</button>
      </div>
    </article>
  );
}

function StalledTaskRow({
  title,
  reason,
  detail,
  tone,
  projectTitle,
  onOpen,
  onDone,
  onWaiting,
}: {
  title: string;
  reason: string;
  detail: string;
  tone: 'danger' | 'warning' | 'info';
  projectTitle?: string | null;
  onOpen: () => void;
  onDone: () => void;
  onWaiting: () => void;
}) {
  const toneClassName =
    tone === 'danger'
      ? 'border-rose-200 bg-rose-50 text-rose-700'
      : tone === 'warning'
        ? 'border-amber-200 bg-amber-50 text-amber-700'
        : 'border-blue-200 bg-blue-50 text-blue-700';

  return (
    <article className={`rounded-xl border p-3 ${tone === 'danger' ? 'border-rose-200 bg-rose-50/70' : tone === 'warning' ? 'border-amber-200 bg-amber-50/70' : 'border-slate-200 bg-white'} shadow-sm`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <div className={`inline-flex rounded-full border px-2 py-1 text-[11px] font-semibold ${toneClassName}`}>{reason}</div>
            {projectTitle ? <span className="rounded-full border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-600">Project: {projectTitle}</span> : null}
          </div>
          <p className="mt-2 truncate text-sm font-semibold text-slate-900">{title}</p>
          <p className="mt-1 text-xs text-slate-600">{detail}</p>
        </div>
        <div className="flex flex-wrap gap-2" data-no-card-click="true">
          <button type="button" onClick={onOpen} className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-[11px] font-medium text-slate-700 transition hover:bg-slate-50">開く</button>
          <button type="button" onClick={onWaiting} className="rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1.5 text-[11px] font-medium text-blue-700 transition hover:bg-blue-100">待ち＋日付</button>
          <button type="button" onClick={onDone} className="rounded-lg bg-slate-900 px-2.5 py-1.5 text-[11px] font-medium text-white transition hover:bg-slate-800">完了</button>
        </div>
      </div>
    </article>
  );
}

function FocusTaskCard({
  title,
  reason,
  detail,
  tone,
  projectTitle,
  onOpen,
  onDone,
  onWaiting,
}: {
  title: string;
  reason: string;
  detail: string;
  tone: 'danger' | 'warning' | 'info';
  projectTitle?: string | null;
  onOpen: () => void;
  onDone: () => void;
  onWaiting: () => void;
}) {
  const toneClassName =
    tone === 'danger'
      ? 'border-rose-200 bg-rose-50 text-rose-700'
      : tone === 'warning'
        ? 'border-amber-200 bg-amber-50 text-amber-700'
        : 'border-blue-200 bg-blue-50 text-blue-700';

  return (
    <article className="rounded-xl border border-slate-200 bg-slate-50/80 p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">次にやる</p>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <div className={`inline-flex rounded-full border px-2 py-1 text-[11px] font-semibold ${toneClassName}`}>{reason}</div>
            {projectTitle ? <span className="rounded-full border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-600">Project: {projectTitle}</span> : null}
          </div>
          <h4 className="mt-2 truncate text-sm font-semibold text-slate-900">{title}</h4>
        </div>
      </div>
      <p className="mt-1 text-xs text-slate-600">{detail}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" onClick={onDone} className="rounded-lg bg-slate-900 px-3 py-1.5 text-[11px] font-medium text-white transition hover:bg-slate-800">完了</button>
        <button type="button" onClick={onWaiting} className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-[11px] font-medium text-blue-700 transition hover:bg-blue-100">待ち＋日付</button>
        <button type="button" onClick={onOpen} className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-[11px] font-medium text-slate-700 transition hover:bg-slate-50">開く</button>
      </div>
    </article>
  );
}

function SectionExpandButton({
  hiddenCount,
  expanded,
  onToggle,
}: {
  hiddenCount: number;
  expanded: boolean;
  onToggle: () => void;
}) {
  if (hiddenCount <= 0 && !expanded) return null;

  return (
    <div className="flex justify-end">
      <button
        type="button"
        onClick={onToggle}
        className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 transition hover:bg-slate-50"
      >
        {expanded ? '折りたたむ' : `さらに ${hiddenCount} 件`}
      </button>
    </div>
  );
}

type TaskCardMode = 'kanban' | 'matrix' | 'gtd';

type TaskCardProps = {
  task: Task;
  disabled: boolean;
  onUpdateStatus?: (task: Task, status: TaskProgress) => Promise<void>;
  onDelete?: (id: string) => Promise<void>;
  onEdit: (task: Task) => void;
  onDragStart?: (taskId: string) => void;
  onDragEnd?: () => void;
  dragging?: boolean;
  draggable?: boolean;
  selectionMode?: boolean;
  selectable?: boolean;
  selected?: boolean;
  onToggleSelect?: (taskId: string) => void;
  projectTaskMap: Record<string, Task>;
  projectNextActionCountMap: Record<string, number>;
  mode: TaskCardMode;
};

function TaskCard({
  task,
  disabled,
  onEdit,
  onDragStart,
  onDragEnd,
  dragging = false,
  draggable = false,
  selectionMode = false,
  selectable = false,
  selected = false,
  onToggleSelect,
  projectTaskMap,
  projectNextActionCountMap,
  mode,
}: TaskCardProps) {
  const linkedProjectTitle = task.project_task_id ? projectTaskMap[task.project_task_id]?.title : null;
  const linkedNextActionCount =
    task.gtd_category === 'project' ? projectNextActionCountMap[task.id] ?? 0 : 0;

  const gtdLabel =
    task.gtd_category === 'next_action' && task.project_task_id
      ? TASK_GTD_LABELS.project
      : TASK_GTD_LABELS[task.gtd_category];

  const showAssignee = Boolean(task.assignee && task.assignee !== '自分');
  const showCompactTags = mode !== 'kanban';
  const showMetaTags = mode === 'gtd';
  const showWaitingResponseTag = task.status === 'waiting';
  const waitingResponseOverdue = isWaitingResponseOverdue(task);
  const waitingResponseMissing = isWaitingWithoutResponseDate(task);
  const doingStale = isDoingStale(task);

  const pointerStartRef = useRef<{ x: number; y: number } | null>(null);
  const movedRef = useRef(false);

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    if ((event.target as HTMLElement).closest('[data-no-card-click="true"]')) return;
    pointerStartRef.current = { x: event.clientX, y: event.clientY };
    movedRef.current = false;
  };

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!pointerStartRef.current) return;

    const deltaX = Math.abs(event.clientX - pointerStartRef.current.x);
    const deltaY = Math.abs(event.clientY - pointerStartRef.current.y);

    if (deltaX > 6 || deltaY > 6) {
      movedRef.current = true;
    }
  };

  const handlePointerUp = (event: PointerEvent<HTMLDivElement>) => {
    const clickedInteractive = (event.target as HTMLElement).closest('[data-no-card-click="true"]');

    if (!clickedInteractive && !movedRef.current && !disabled) {
      onEdit(task);
    }

    pointerStartRef.current = null;
    movedRef.current = false;
  };

  const handlePointerCancel = () => {
    pointerStartRef.current = null;
    movedRef.current = false;
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    if (!disabled) {
      onEdit(task);
    }
  };

  const showProjectTag = mode !== 'kanban' && Boolean(linkedProjectTitle);

  return (
    <div
      role="button"
      tabIndex={disabled ? -1 : 0}
      draggable={draggable}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
      onKeyDown={handleKeyDown}
      onDragStart={() => {
        movedRef.current = true;
        onDragStart?.(task.id);
      }}
      onDragEnd={() => {
        handlePointerCancel();
        onDragEnd?.();
      }}
      className={`rounded-xl border bg-white p-4 shadow-sm transition focus:outline-none focus:ring-2 focus:ring-slate-300 ${
        selected ? 'border-slate-900 ring-1 ring-slate-200' : 'border-slate-200'
      } ${draggable ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'} ${dragging ? 'opacity-50' : ''}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          {selectionMode && selectable ? (
            <label
              data-no-card-click="true"
              className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center"
              onClick={(event) => event.stopPropagation()}
            >
              <input
                type="checkbox"
                checked={selected}
                onChange={() => onToggleSelect?.(task.id)}
                className="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-400"
              />
            </label>
          ) : null}

          {task.gtd_category === 'project' ? (
            <Link
              href={`/projects/${task.id}`}
              data-no-card-click="true"
              className="text-lg font-semibold text-slate-900 hover:underline"
            >
              {task.title}
            </Link>
          ) : (
            <p className="text-lg font-semibold text-slate-900">{task.title}</p>
          )}
        </div>
      </div>

      {task.description ? <p className="mt-1 text-sm text-slate-600">{task.description}</p> : null}

      <div className="mt-3 flex flex-wrap gap-2 text-xs">
        {showMetaTags ? (
          <>
            <span className="rounded-md bg-blue-50 px-2 py-1 text-blue-700">
              GTD: {gtdLabel}
            </span>
            <span className={`rounded-md px-2 py-1 ${levelClassName[task.importance]}`}>
              重要度: {IMPORTANCE_LABELS[task.importance]}
            </span>
            <span className={`rounded-md px-2 py-1 ${levelClassName[task.urgency]}`}>
              緊急度: {URGENCY_LABELS[task.urgency]}
            </span>
          </>
        ) : null}

        {doingStale ? (
          <span className="rounded-md bg-amber-100 px-2 py-1 text-amber-700">
            進行停滞
          </span>
        ) : null}

        {task.gtd_category === 'project' && showCompactTags ? (
          <span className="rounded-md bg-blue-50 px-2 py-1 text-blue-700">
            次アクション: {linkedNextActionCount}件
          </span>
        ) : null}

        {task.gtd_category === 'project' && linkedNextActionCount === 0 && showCompactTags ? (
          <span className="rounded-md bg-amber-100 px-2 py-1 text-amber-700">
            次アクション未設定
          </span>
        ) : null}

        {task.due_date ? (
          <span
            className={`rounded-md px-2 py-1 ${
              isOverdue(task.due_date) && task.status !== 'done'
                ? 'bg-rose-100 text-rose-700'
                : isDueSoon(task.due_date) && task.status !== 'done'
                  ? 'bg-amber-100 text-amber-700'
                  : 'bg-slate-100 text-slate-700'
            }`}
          >
            期限: {formatDate(task.due_date)}
          </span>
        ) : null}

        {showWaitingResponseTag ? (
          <span
            className={`rounded-md px-2 py-1 ${
              waitingResponseOverdue
                ? 'bg-rose-100 text-rose-700'
                : waitingResponseMissing
                  ? 'bg-amber-100 text-amber-700'
                  : 'bg-blue-50 text-blue-700'
            }`}
          >
            回答予定: {waitingResponseMissing ? '未設定' : formatDate(task.waiting_response_date)}
          </span>
        ) : null}

        {showProjectTag ? (
          <span className="rounded-md bg-slate-100 px-2 py-1 text-slate-700">
            Project: {linkedProjectTitle}
          </span>
        ) : null}

        {showAssignee ? (
          <span className="rounded-md bg-slate-100 px-2 py-1 text-slate-700">
            担当: {task.assignee}
          </span>
        ) : null}
      </div>
    </div>
  );
}
