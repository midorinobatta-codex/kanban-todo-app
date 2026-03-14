
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

export const TASK_IMPORTANCE_VALUES = ["low", "medium", "high"] as const;
export type TaskImportance = (typeof TASK_IMPORTANCE_VALUES)[number];

export const IMPORTANCE_LABELS: Record<TaskImportance, string> = {
  low: "低",
  medium: "中",
  high: "高",
};

export const TASK_URGENCY_VALUES = ["low", "medium", "high"] as const;
export type TaskUrgency = (typeof TASK_URGENCY_VALUES)[number];

export const URGENCY_LABELS: Record<TaskUrgency, string> = {
  low: "低",
  medium: "中",
  high: "高",
};

export const TASK_GTD_VALUES = ["next_action", "delegated", "project", "someday"] as const;
export type TaskGtdCategory = (typeof TASK_GTD_VALUES)[number];

export const TASK_GTD_LABELS: Record<TaskGtdCategory, string> = {
  next_action: "次にやる",
  delegated: "他者依頼",
  project: "プロジェクト",
  someday: "いつか / 保留",
};

export type Task = {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  assignee: string | null;
  priority: TaskPriority;
  importance: TaskImportance;
  urgency: TaskUrgency;
  status: TaskProgress;
  gtd_category: TaskGtdCategory;
  project_task_id: string | null;
  due_date: string | null;
  waiting_response_date: string | null;
  started_at: string | null;
  created_at: string;
  updated_at: string;
};

// 互換用
export type TaskStatus = TaskProgress;
export const STATUS_ORDER = TASK_PROGRESS_ORDER;
export const STATUS_LABELS = TASK_PROGRESS_LABELS;
