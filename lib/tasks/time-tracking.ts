import {
  TASK_GTD_LABELS,
  TASK_PROGRESS_LABELS,
  type Task,
  type WorkSessionEntry,
} from '@/lib/types';

export type DailyReviewTaskSummary = {
  taskId: string;
  title: string;
  projectTitle: string | null;
  totalMinutes: number;
  timerMinutes: number;
  adjustmentMinutes: number;
  entryCount: number;
};

export type DailyReviewSummary = {
  dateKey: string;
  totalMinutes: number;
  timerMinutes: number;
  adjustmentMinutes: number;
  sessionCount: number;
  adjustmentCount: number;
  completedCount: number;
  taskSummaries: DailyReviewTaskSummary[];
  sessionEntries: WorkSessionEntry[];
};

export function getLocalDateKey(input: string | Date = new Date()) {
  const date = typeof input === 'string' ? new Date(input) : input;
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function diffMinutes(startAt: string, endAt: string = new Date().toISOString()) {
  const diffMs = new Date(endAt).getTime() - new Date(startAt).getTime();
  if (!Number.isFinite(diffMs) || diffMs <= 0) return 1;
  return Math.max(1, Math.round(diffMs / 60000));
}

export function formatMinutesTotal(minutes: number) {
  const sign = minutes < 0 ? '-' : '';
  const abs = Math.abs(minutes);
  const hours = Math.floor(abs / 60);
  const rest = abs % 60;

  if (hours === 0) {
    return `${sign}${rest}分`;
  }

  if (rest === 0) {
    return `${sign}${hours}時間`;
  }

  return `${sign}${hours}時間${rest}分`;
}

export function getEffectiveTaskMinutes(task: Pick<Task, 'tracked_minutes' | 'manual_adjustment_minutes'>) {
  return (task.tracked_minutes ?? 0) + (task.manual_adjustment_minutes ?? 0);
}

export function summarizeDailyReview(
  tasks: Task[],
  sessions: WorkSessionEntry[],
  dateKey: string,
  projectTaskMap: Record<string, Task>,
): DailyReviewSummary {
  const taskMap = new Map(tasks.map((task) => [task.id, task]));
  const sessionEntries = sessions.filter((entry) => getLocalDateKey(entry.started_at) === dateKey);

  const taskSummaryMap = new Map<string, DailyReviewTaskSummary>();
  let totalMinutes = 0;
  let timerMinutes = 0;
  let adjustmentMinutes = 0;
  let adjustmentCount = 0;

  for (const entry of sessionEntries) {
    totalMinutes += entry.duration_minutes;
    if (entry.entry_type === 'timer') {
      timerMinutes += entry.duration_minutes;
    } else {
      adjustmentMinutes += entry.duration_minutes;
      adjustmentCount += 1;
    }

    const task = taskMap.get(entry.task_id);
    const current = taskSummaryMap.get(entry.task_id) ?? {
      taskId: entry.task_id,
      title: task?.title ?? '(削除済みタスク)',
      projectTitle: task?.project_task_id ? projectTaskMap[task.project_task_id]?.title ?? null : null,
      totalMinutes: 0,
      timerMinutes: 0,
      adjustmentMinutes: 0,
      entryCount: 0,
    };

    current.totalMinutes += entry.duration_minutes;
    current.entryCount += 1;
    if (entry.entry_type === 'timer') {
      current.timerMinutes += entry.duration_minutes;
    } else {
      current.adjustmentMinutes += entry.duration_minutes;
    }

    taskSummaryMap.set(entry.task_id, current);
  }

  const completedCount = tasks.filter(
    (task) => task.status === 'done' && getLocalDateKey(task.updated_at) === dateKey,
  ).length;

  const taskSummaries = Array.from(taskSummaryMap.values()).sort((a, b) => {
    if (b.totalMinutes !== a.totalMinutes) return b.totalMinutes - a.totalMinutes;
    return a.title.localeCompare(b.title, 'ja');
  });

  return {
    dateKey,
    totalMinutes,
    timerMinutes,
    adjustmentMinutes,
    sessionCount: sessionEntries.filter((entry) => entry.entry_type === 'timer').length,
    adjustmentCount,
    completedCount,
    taskSummaries,
    sessionEntries,
  };
}

export function buildTaskTimeExportRows(tasks: Task[], projectTaskMap: Record<string, Task>) {
  return tasks.map((task) => ({
    taskId: task.id,
    title: task.title,
    status: TASK_PROGRESS_LABELS[task.status],
    gtd: TASK_GTD_LABELS[task.gtd_category],
    projectTitle: task.project_task_id ? projectTaskMap[task.project_task_id]?.title ?? '' : '',
    trackedMinutes: task.tracked_minutes ?? 0,
    trackedLabel: formatMinutesTotal(task.tracked_minutes ?? 0),
    manualAdjustmentMinutes: task.manual_adjustment_minutes ?? 0,
    manualAdjustmentLabel: formatMinutesTotal(task.manual_adjustment_minutes ?? 0),
    totalMinutes: getEffectiveTaskMinutes(task),
    totalLabel: formatMinutesTotal(getEffectiveTaskMinutes(task)),
    timerActive: task.session_started_at ? 'yes' : 'no',
    sessionStartedAt: task.session_started_at ?? '',
    startedAt: task.started_at ?? '',
    updatedAt: task.updated_at,
  }));
}

export function buildDailyReviewExportRows(args: {
  summary: DailyReviewSummary;
  tasks: Task[];
  projectTaskMap: Record<string, Task>;
  note: string;
}) {
  const { summary, tasks, projectTaskMap, note } = args;
  const taskMap = new Map(tasks.map((task) => [task.id, task]));

  const summaryRow = {
    section: 'summary',
    date: summary.dateKey,
    totalMinutes: summary.totalMinutes,
    totalLabel: formatMinutesTotal(summary.totalMinutes),
    timerMinutes: summary.timerMinutes,
    timerLabel: formatMinutesTotal(summary.timerMinutes),
    adjustmentMinutes: summary.adjustmentMinutes,
    adjustmentLabel: formatMinutesTotal(summary.adjustmentMinutes),
    sessionCount: summary.sessionCount,
    adjustmentCount: summary.adjustmentCount,
    completedCount: summary.completedCount,
    note,
  };

  const taskRows = summary.taskSummaries.map((item) => ({
    section: 'task',
    date: summary.dateKey,
    taskId: item.taskId,
    title: item.title,
    projectTitle: item.projectTitle ?? '',
    totalMinutes: item.totalMinutes,
    totalLabel: formatMinutesTotal(item.totalMinutes),
    timerMinutes: item.timerMinutes,
    timerLabel: formatMinutesTotal(item.timerMinutes),
    adjustmentMinutes: item.adjustmentMinutes,
    adjustmentLabel: formatMinutesTotal(item.adjustmentMinutes),
    entryCount: item.entryCount,
  }));

  const sessionRows = summary.sessionEntries.map((entry) => {
    const task = taskMap.get(entry.task_id);
    return {
      section: 'session',
      date: summary.dateKey,
      entryId: entry.id,
      taskId: entry.task_id,
      title: task?.title ?? '(削除済みタスク)',
      projectTitle: task?.project_task_id ? projectTaskMap[task.project_task_id]?.title ?? '' : '',
      entryType: entry.entry_type,
      startedAt: entry.started_at,
      endedAt: entry.ended_at ?? '',
      durationMinutes: entry.duration_minutes,
      durationLabel: formatMinutesTotal(entry.duration_minutes),
      note: entry.note ?? '',
    };
  });

  return [summaryRow, ...taskRows, ...sessionRows];
}
