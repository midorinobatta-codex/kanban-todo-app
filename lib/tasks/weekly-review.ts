import type { Task } from '@/lib/types';
import { buildTaskStalledBuckets } from '@/lib/tasks/focus';
import { formatDate, parseDateOnly, toDateOnlyString } from '@/lib/tasks/presentation';

type UnknownRecord = Record<string, unknown>;

export type WeeklyReviewTopItem = {
  id: string;
  title: string;
  minutes: number;
  sessionCount: number;
};

export type WeeklyReviewStallTrend = {
  key: 'waitingOverdue' | 'waitingNoDate' | 'doingStale' | 'overdueTodo';
  label: string;
  count: number;
  detail: string;
};

export type WeeklyReviewResult = {
  weekStart: string;
  weekEnd: string;
  weekLabel: string;
  totalMinutes: number;
  completedCount: number;
  sessionCount: number;
  adjustmentCount: number;
  taskTopItems: WeeklyReviewTopItem[];
  projectTopItems: WeeklyReviewTopItem[];
  stallTrends: WeeklyReviewStallTrend[];
};

export type BuildWeeklyReviewArgs = {
  tasks: Task[];
  sessions: unknown[];
  adjustments?: unknown[];
  projectTaskMap?: Record<string, Task>;
  referenceDate?: Date;
  topLimit?: number;
};

type NormalizedSession = {
  id: string;
  taskId: string | null;
  occurredAt: string | null;
  minutes: number;
};

type NormalizedAdjustment = {
  id: string;
  taskId: string | null;
  occurredAt: string | null;
  minutes: number;
};

function asRecord(value: unknown): UnknownRecord | null {
  return value && typeof value === 'object' ? (value as UnknownRecord) : null;
}

function readString(record: UnknownRecord, keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) {
      return value;
    }
  }
  return null;
}

function readNumber(record: UnknownRecord, keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === 'string' && value.trim()) {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return null;
}

function calculateDurationMinutes(startedAt: string | null, endedAt: string | null) {
  if (!startedAt || !endedAt) return null;

  const start = new Date(startedAt);
  const end = new Date(endedAt);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;

  const diff = end.getTime() - start.getTime();
  if (diff <= 0) return 0;

  return Math.round(diff / (1000 * 60));
}

function normalizeSession(value: unknown, index: number): NormalizedSession | null {
  const record = asRecord(value);
  if (!record) return null;

  const taskId = readString(record, ['taskId', 'task_id']);
  const startedAt = readString(record, ['startedAt', 'started_at', 'startAt', 'start_at', 'started']);
  const endedAt = readString(record, ['endedAt', 'ended_at', 'endAt', 'end_at', 'ended']);
  const occurredAt =
    endedAt ??
    startedAt ??
    readString(record, ['occurredAt', 'occurred_at', 'createdAt', 'created_at', 'updatedAt', 'updated_at']);

  const explicitMinutes = readNumber(record, [
    'durationMinutes',
    'duration_minutes',
    'minutes',
    'duration',
    'elapsedMinutes',
    'elapsed_minutes',
  ]);

  const embeddedAdjustmentMinutes =
    readNumber(record, [
      'manualAdjustmentMinutes',
      'manual_adjustment_minutes',
      'adjustmentMinutes',
      'adjustment_minutes',
      'correctedMinutes',
      'corrected_minutes',
    ]) ?? 0;

  const calculatedMinutes = calculateDurationMinutes(startedAt, endedAt);
  const baseMinutes = explicitMinutes ?? calculatedMinutes ?? 0;
  const minutes = Math.max(0, Math.round(baseMinutes + embeddedAdjustmentMinutes));

  if (!occurredAt && minutes <= 0) return null;

  return {
    id: readString(record, ['id']) ?? `session-${index}`,
    taskId,
    occurredAt,
    minutes,
  };
}

function normalizeAdjustment(value: unknown, index: number): NormalizedAdjustment | null {
  const record = asRecord(value);
  if (!record) return null;

  const minutes =
    readNumber(record, [
      'minutes',
      'adjustmentMinutes',
      'adjustment_minutes',
      'manualAdjustmentMinutes',
      'manual_adjustment_minutes',
      'correctedMinutes',
      'corrected_minutes',
      'deltaMinutes',
      'delta_minutes',
    ]) ?? 0;

  const occurredAt =
    readString(record, ['appliedAt', 'applied_at', 'createdAt', 'created_at', 'occurredAt', 'occurred_at']) ?? null;

  if (!occurredAt || minutes === 0) return null;

  return {
    id: readString(record, ['id']) ?? `adjustment-${index}`,
    taskId: readString(record, ['taskId', 'task_id']),
    occurredAt,
    minutes: Math.round(minutes),
  };
}

export function getWeekWindow(referenceDate = new Date()) {
  const base = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), referenceDate.getDate());
  const day = base.getDay();
  const diffFromMonday = (day + 6) % 7;

  const weekStartDate = new Date(base);
  weekStartDate.setDate(base.getDate() - diffFromMonday);

  const weekEndDate = new Date(weekStartDate);
  weekEndDate.setDate(weekStartDate.getDate() + 6);

  return {
    weekStartDate,
    weekEndDate,
    weekStart: toDateOnlyString(weekStartDate),
    weekEnd: toDateOnlyString(weekEndDate),
  };
}

function isDateWithinWeek(value: string | null | undefined, weekStartDate: Date, weekEndDate: Date) {
  const parsed = parseDateOnly(value);
  if (!parsed) return false;
  return parsed >= weekStartDate && parsed <= weekEndDate;
}

function sortTopItems(items: WeeklyReviewTopItem[], limit: number) {
  return [...items]
    .sort((left, right) => {
      if (right.minutes !== left.minutes) return right.minutes - left.minutes;
      if (right.sessionCount !== left.sessionCount) return right.sessionCount - left.sessionCount;
      return left.title.localeCompare(right.title, 'ja');
    })
    .slice(0, limit);
}

function buildTaskMap(tasks: Task[]) {
  return tasks.reduce<Record<string, Task>>((acc, task) => {
    acc[task.id] = task;
    return acc;
  }, {});
}

function buildProjectMap(tasks: Task[], providedMap?: Record<string, Task>) {
  if (providedMap) return providedMap;

  return tasks.reduce<Record<string, Task>>((acc, task) => {
    if (task.gtd_category === 'project') {
      acc[task.id] = task;
    }
    return acc;
  }, {});
}

function resolveTaskLabel(taskId: string | null, taskMap: Record<string, Task>) {
  if (!taskId) {
    return { id: 'unassigned-task', title: '未紐付けタスク' };
  }

  const task = taskMap[taskId];
  if (!task) {
    return { id: taskId, title: '削除済みタスク' };
  }

  return { id: task.id, title: task.title };
}

function resolveProjectLabel(
  taskId: string | null,
  taskMap: Record<string, Task>,
  projectTaskMap: Record<string, Task>,
) {
  if (!taskId) {
    return { id: 'unassigned-project', title: '関連project未設定' };
  }

  const task = taskMap[taskId];
  if (!task) {
    return { id: 'missing-project', title: '関連project未設定' };
  }

  if (task.gtd_category === 'project') {
    return { id: task.id, title: task.title };
  }

  if (task.project_task_id && projectTaskMap[task.project_task_id]) {
    return { id: task.project_task_id, title: projectTaskMap[task.project_task_id].title };
  }

  return { id: 'unassigned-project', title: '関連project未設定' };
}

function accumulateTopItems(
  sourceItems: Array<{ taskId: string | null; minutes: number; isSession: boolean }>,
  labelResolver: (taskId: string | null) => { id: string; title: string },
) {
  const map = new Map<string, WeeklyReviewTopItem>();

  for (const item of sourceItems) {
    if (item.minutes === 0) continue;

    const resolved = labelResolver(item.taskId);
    const current = map.get(resolved.id) ?? {
      id: resolved.id,
      title: resolved.title,
      minutes: 0,
      sessionCount: 0,
    };

    current.minutes += item.minutes;
    if (item.isSession) current.sessionCount += 1;

    map.set(resolved.id, current);
  }

  return Array.from(map.values());
}

export function formatMinutesAsHours(minutes: number) {
  const normalized = Math.max(0, Math.round(minutes));
  const hours = Math.floor(normalized / 60);
  const remainder = normalized % 60;

  if (hours === 0) return `${remainder}分`;
  if (remainder === 0) return `${hours}時間`;
  return `${hours}時間${remainder}分`;
}

export function buildWeeklyReview({
  tasks,
  sessions,
  adjustments = [],
  projectTaskMap,
  referenceDate = new Date(),
  topLimit = 5,
}: BuildWeeklyReviewArgs): WeeklyReviewResult {
  const { weekStartDate, weekEndDate, weekStart, weekEnd } = getWeekWindow(referenceDate);
  const taskMap = buildTaskMap(tasks);
  const resolvedProjectTaskMap = buildProjectMap(tasks, projectTaskMap);

  const normalizedSessions = sessions
    .map((item, index) => normalizeSession(item, index))
    .filter((item): item is NormalizedSession => Boolean(item))
    .filter((item) => isDateWithinWeek(item.occurredAt, weekStartDate, weekEndDate));

  const normalizedAdjustments = adjustments
    .map((item, index) => normalizeAdjustment(item, index))
    .filter((item): item is NormalizedAdjustment => Boolean(item))
    .filter((item) => isDateWithinWeek(item.occurredAt, weekStartDate, weekEndDate));

  const totalMinutes =
    normalizedSessions.reduce((sum, item) => sum + item.minutes, 0) +
    normalizedAdjustments.reduce((sum, item) => sum + item.minutes, 0);

  // completed_at をまだ持っていない前提なので、週内に done へ更新された近似として updated_at を使う
  const completedCount = tasks.filter(
    (task) => task.status === 'done' && isDateWithinWeek(task.updated_at, weekStartDate, weekEndDate),
  ).length;

  const touchedTaskIds = new Set<string>();
  for (const item of normalizedSessions) {
    if (item.taskId) touchedTaskIds.add(item.taskId);
  }
  for (const item of normalizedAdjustments) {
    if (item.taskId) touchedTaskIds.add(item.taskId);
  }

  const weeklyRelevantTasks = tasks.filter((task) => {
    if (task.gtd_category === 'project') return false;

    return (
      touchedTaskIds.has(task.id) ||
      isDateWithinWeek(task.updated_at, weekStartDate, weekEndDate) ||
      isDateWithinWeek(task.created_at, weekStartDate, weekEndDate)
    );
  });

  const stalledBuckets = buildTaskStalledBuckets(weeklyRelevantTasks);

const stallTrendBase: WeeklyReviewStallTrend[] = [
  {
    key: 'waitingOverdue',
    label: '回答予定日超過',
    count: stalledBuckets.waitingOverdue.length,
    detail: '待ちの再確認や催促が必要',
  },
  {
    key: 'waitingNoDate',
    label: '待ち日付未設定',
    count: stalledBuckets.waitingNoDate.length,
    detail: '回答予定日を入れて抜け漏れ防止',
  },
  {
    key: 'doingStale',
    label: '進行停滞',
    count: stalledBuckets.doingStale.length,
    detail: '進行中だが更新が止まり気味',
  },
  {
    key: 'overdueTodo',
    label: '期限超過',
    count: stalledBuckets.overdueTodo.length,
    detail: 'todo / doing のまま期限を超過',
  },
];

const stallTrends = [...stallTrendBase].sort((left, right) => {
  if (right.count !== left.count) return right.count - left.count;
  return left.label.localeCompare(right.label, 'ja');
});

  const sourceItems = [
    ...normalizedSessions.map((item) => ({
      taskId: item.taskId,
      minutes: item.minutes,
      isSession: true,
    })),
    ...normalizedAdjustments.map((item) => ({
      taskId: item.taskId,
      minutes: item.minutes,
      isSession: false,
    })),
  ];

  const taskTopItems = sortTopItems(
    accumulateTopItems(sourceItems, (taskId) => resolveTaskLabel(taskId, taskMap)),
    topLimit,
  );

  const projectTopItems = sortTopItems(
    accumulateTopItems(sourceItems, (taskId) => resolveProjectLabel(taskId, taskMap, resolvedProjectTaskMap)),
    topLimit,
  );

  return {
    weekStart,
    weekEnd,
    weekLabel: `${formatDate(weekStart)} 〜 ${formatDate(weekEnd)}`,
    totalMinutes,
    completedCount,
    sessionCount: normalizedSessions.length,
    adjustmentCount: normalizedAdjustments.length,
    taskTopItems,
    projectTopItems,
    stallTrends,
  };
}