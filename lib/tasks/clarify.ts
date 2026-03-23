import type { Task } from '@/lib/types';
import { getSuggestedWaitingResponseDate, isWaitingResponseOverdue, isWaitingWithoutResponseDate } from '@/lib/tasks/presentation';

export type ClarifyDestination = 'next_action' | 'project' | 'delegated' | 'someday' | 'done' | 'trash';

export function isClarifyCandidate(task: Task) {
  if (task.gtd_category === 'project') return false;
  if (task.status === 'done') return false;
  if (task.status === 'waiting') return false;
  if (task.project_task_id) return false;
  if (task.due_date || task.waiting_response_date) return false;
  if (task.description?.trim()) return false;
  if (task.gtd_category === 'delegated' || task.gtd_category === 'someday') return false;
  return true;
}

export function buildClarifyQueue(tasks: Task[]) {
  return tasks
    .filter(isClarifyCandidate)
    .sort((left, right) => new Date(left.created_at).getTime() - new Date(right.created_at).getTime());
}

export type WaitingGroup = {
  owner: string;
  items: Task[];
};

function daysSince(value: string | null | undefined) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return Math.floor((Date.now() - parsed.getTime()) / (1000 * 60 * 60 * 24));
}

export function getWaitingAlertLevel(task: Task): 'danger' | 'warning' | 'info' {
  if (isWaitingResponseOverdue(task)) return 'danger';
  if (!task.assignee?.trim()) return 'warning';
  if (isWaitingWithoutResponseDate(task)) return 'warning';
  const age = daysSince(task.updated_at) ?? daysSince(task.created_at);
  if ((age ?? 0) >= 7) return 'warning';
  return 'info';
}

export function getWaitingSortScore(task: Task) {
  if (isWaitingResponseOverdue(task)) return 0;
  if (!task.assignee?.trim()) return 1;
  if (isWaitingWithoutResponseDate(task)) return 2;
  const age = daysSince(task.updated_at) ?? daysSince(task.created_at) ?? 0;
  if (age >= 14) return 3;
  if (age >= 7) return 4;
  return 5;
}

export function buildWaitingGroups(tasks: Task[]) {
  const waitingTasks = tasks
    .filter((task) => task.status === 'waiting' || task.gtd_category === 'delegated')
    .sort((left, right) => {
      const scoreDiff = getWaitingSortScore(left) - getWaitingSortScore(right);
      if (scoreDiff !== 0) return scoreDiff;
      return new Date(left.created_at).getTime() - new Date(right.created_at).getTime();
    });

  const groups = waitingTasks.reduce<Record<string, Task[]>>((acc, task) => {
    const key = task.assignee?.trim() || '担当未設定';
    acc[key] = [...(acc[key] ?? []), task];
    return acc;
  }, {});

  return Object.entries(groups)
    .map(([owner, items]) => ({ owner, items }))
    .sort((left, right) => left.items.length - right.items.length)
    .sort((left, right) => {
      const leftTop = left.items[0];
      const rightTop = right.items[0];
      if (!leftTop || !rightTop) return 0;
      return getWaitingSortScore(leftTop) - getWaitingSortScore(rightTop);
    });
}

export function getSuggestedDelegatedDate(task: Task) {
  return task.waiting_response_date ?? getSuggestedWaitingResponseDate(2);
}
