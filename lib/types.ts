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

export const WORK_SESSION_ENTRY_TYPES = ["timer", "manual_adjustment"] as const;
export type WorkSessionEntryType = (typeof WORK_SESSION_ENTRY_TYPES)[number];

export const TASK_TEMPLATE_RECURRENCE_VALUES = ["daily", "weekly", "monthly"] as const;
export type TaskTemplateRecurrence = (typeof TASK_TEMPLATE_RECURRENCE_VALUES)[number];

export const TASK_TEMPLATE_RECURRENCE_LABELS: Record<TaskTemplateRecurrence, string> = {
  daily: "毎日",
  weekly: "毎週",
  monthly: "毎月",
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
  next_candidate_task_id: string | null;
  due_date: string | null;
  waiting_response_date: string | null;
  started_at: string | null;
  tracked_minutes: number;
  manual_adjustment_minutes: number;
  session_started_at: string | null;
  template_id: string | null;
  template_period_key: string | null;
  created_at: string;
  updated_at: string;
};

export type TaskTemplate = {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  recurrence_type: TaskTemplateRecurrence;
  default_gtd_category: Exclude<TaskGtdCategory, 'project'>;
  start_date: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type WorkSessionEntry = {
  id: string;
  user_id: string;
  task_id: string;
  entry_type: WorkSessionEntryType;
  started_at: string;
  ended_at: string | null;
  duration_minutes: number;
  note: string | null;
  created_at: string;
  updated_at: string;
};

// 互換用
export type TaskStatus = TaskProgress;
export const STATUS_ORDER = TASK_PROGRESS_ORDER;
export const STATUS_LABELS = TASK_PROGRESS_LABELS;
