export const TASK_PROGRESS_VALUES = ["todo", "doing", "waiting", "done"] as const;
export type TaskProgress = (typeof TASK_PROGRESS_VALUES)[number];

export const TASK_PROGRESS_ORDER: TaskProgress[] = ["todo", "doing", "waiting", "done"];

export const TASK_PROGRESS_LABELS: Record<TaskProgress, string> = {
  todo: "未着手",
  doing: "進行中",
  waiting: "待ち",
  done: "完了",
};

export const TASK_PRIORITY_VALUES = ["low", "medium", "high"] as const;
export type TaskPriority = (typeof TASK_PRIORITY_VALUES)[number];

export const PRIORITY_LABELS: Record<TaskPriority, string> = {
  low: "低",
  medium: "中",
  high: "高",
};

export type Task = {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  assignee: string | null;
  priority: TaskPriority;
  status: TaskProgress;
  due_date: string | null;
  created_at: string;
  updated_at: string;
};

// 互換用
export type TaskStatus = TaskProgress;
export const STATUS_ORDER = TASK_PROGRESS_ORDER;
export const STATUS_LABELS = TASK_PROGRESS_LABELS;