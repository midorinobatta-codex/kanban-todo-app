export const TASK_PROGRESS_VALUES = ['todo', 'doing', 'waiting', 'done'] as const;

export type TaskProgress = (typeof TASK_PROGRESS_VALUES)[number];
export type TaskStatus = TaskProgress;

export type TaskPriority = 'low' | 'medium' | 'high';

export type Task = {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  assignee: string | null;
  priority: TaskPriority;
  status: TaskStatus;
  due_date: string | null;
  created_at: string;
  updated_at: string;
};

export const TASK_PROGRESS_LABELS: Record<TaskProgress, string> = {
  todo: '未着手',
  doing: '進行中',
  waiting: '待ち',
  done: '完了'
};

export const STATUS_LABELS = TASK_PROGRESS_LABELS;

export const PRIORITY_LABELS: Record<TaskPriority, string> = {
  low: '低',
  medium: '中',
  high: '高'
};

export const TASK_PROGRESS_ORDER: TaskProgress[] = ['todo', 'doing', 'waiting', 'done'];
export const STATUS_ORDER = TASK_PROGRESS_ORDER;
