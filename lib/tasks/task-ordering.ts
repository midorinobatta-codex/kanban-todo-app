import type { Task } from '@/lib/types';

function formatDateKey(value: Date) {
  const year = value.getFullYear();
  const month = `${value.getMonth() + 1}`.padStart(2, '0');
  const day = `${value.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function toDateValue(value: string | null | undefined) {
  if (!value) return Number.POSITIVE_INFINITY;

  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return Number.POSITIVE_INFINITY;

  return parsed.getTime();
}

function getDueBucket(task: Task, todayKey: string) {
  if (task.status === 'done') return 4;
  if (!task.due_date) return 3;
  if (task.due_date < todayKey) return 0;
  if (task.due_date === todayKey) return 1;
  return 2;
}

export function compareTasksByDuePriority(left: Task, right: Task, now: Date = new Date()) {
  const todayKey = formatDateKey(now);
  const leftBucket = getDueBucket(left, todayKey);
  const rightBucket = getDueBucket(right, todayKey);

  if (leftBucket !== rightBucket) {
    return leftBucket - rightBucket;
  }

  const leftDue = toDateValue(left.due_date);
  const rightDue = toDateValue(right.due_date);

  if (leftDue !== rightDue) {
    return leftDue - rightDue;
  }

  const rightCreatedAt = new Date(right.created_at).getTime();
  const leftCreatedAt = new Date(left.created_at).getTime();

  if (rightCreatedAt !== leftCreatedAt) {
    return rightCreatedAt - leftCreatedAt;
  }

  return left.title.localeCompare(right.title, 'ja');
}
