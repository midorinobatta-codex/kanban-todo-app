import type { Project } from '@/lib/domain/project';
import type { Task } from '@/lib/types';
import {
  formatRelativeDueText,
  isDueToday,
  isOverdue,
  isWaitingResponseOverdue,
  isWaitingResponseToday,
  isWaitingWithoutResponseDate,
  startOfToday,
} from '@/lib/tasks/presentation';

export type FocusTaskItem = {
  task: Task;
  reason: string;
  detail: string;
  tone: 'danger' | 'warning' | 'info';
  score: number;
};

export type FocusProjectItem = {
  project: Project;
  reason: string;
  detail: string;
  tone: 'danger' | 'warning' | 'info';
  score: number;
};

export type TaskStalledBuckets = {
  waitingOverdue: Task[];
  waitingNoDate: Task[];
  doingStale: Task[];
  overdueTodo: Task[];
};

export type ProjectStalledBuckets = {
  overdue: Project[];
  noDueDate: Project[];
  noStartedAt: Project[];
  noActions: Project[];
  waiting: Project[];
};

export type StalledTaskItem = {
  task: Task;
  reason: string;
  detail: string;
  tone: 'danger' | 'warning' | 'info';
  score: number;
};

export type StalledProjectItem = {
  project: Project;
  reason: string;
  detail: string;
  tone: 'danger' | 'warning' | 'info';
  score: number;
};

function daysFromTimestamp(value: string | null | undefined) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  const today = startOfToday();
  const target = new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
  return Math.round((today.getTime() - target.getTime()) / (1000 * 60 * 60 * 24));
}

export function isDoingStale(task: Task, staleDays = 3) {
  if (task.status !== 'doing') return false;
  const sinceUpdated = daysFromTimestamp(task.updated_at) ?? daysFromTimestamp(task.created_at);
  if (sinceUpdated === null) return false;
  return sinceUpdated >= staleDays;
}

export function buildTaskStalledBuckets(tasks: Task[]): TaskStalledBuckets {
  return tasks.reduce<TaskStalledBuckets>(
    (acc, task) => {
      if (task.status === 'done') return acc;
      if (isWaitingResponseOverdue(task)) acc.waitingOverdue.push(task);
      if (isWaitingWithoutResponseDate(task)) acc.waitingNoDate.push(task);
      if (isDoingStale(task)) acc.doingStale.push(task);
      if ((task.status === 'todo' || task.status === 'doing') && isOverdue(task.due_date)) {
        acc.overdueTodo.push(task);
      }
      return acc;
    },
    {
      waitingOverdue: [],
      waitingNoDate: [],
      doingStale: [],
      overdueTodo: [],
    },
  );
}

function buildTaskFocusEntry(task: Task): FocusTaskItem {
  if (isWaitingResponseOverdue(task)) {
    return {
      task,
      reason: '回答予定日超過',
      detail: `回答予定 ${formatRelativeDueText(task.waiting_response_date)}`,
      tone: 'danger',
      score: 0,
    };
  }

  if (isOverdue(task.due_date)) {
    return {
      task,
      reason: '期限超過',
      detail: `期限 ${formatRelativeDueText(task.due_date)}`,
      tone: 'danger',
      score: 1,
    };
  }

  if (isDueToday(task.due_date)) {
    return {
      task,
      reason: '今日期限',
      detail: '今日中に終える候補',
      tone: 'warning',
      score: 2,
    };
  }

  if (isWaitingResponseToday(task)) {
    return {
      task,
      reason: '今日回答予定',
      detail: '待ち解除を確認したいタスク',
      tone: 'warning',
      score: 3,
    };
  }

  if (isWaitingWithoutResponseDate(task)) {
    return {
      task,
      reason: '待ち日付未設定',
      detail: '回答予定日を入れて抜け漏れ防止',
      tone: 'warning',
      score: 4,
    };
  }

  if (isDoingStale(task)) {
    const days = daysFromTimestamp(task.updated_at) ?? 0;
    return {
      task,
      reason: '進行停滞',
      detail: `${days}日更新なし`,
      tone: 'warning',
      score: 5,
    };
  }

  if (task.status === 'doing') {
    return {
      task,
      reason: '進行中',
      detail: '着手済みの流れを止めない',
      tone: 'info',
      score: 6,
    };
  }

  if (task.importance === 'high' && task.urgency === 'high') {
    return {
      task,
      reason: '高重要 × 高緊急',
      detail: '先に処理したい候補',
      tone: 'warning',
      score: 7,
    };
  }

  if (task.importance === 'high' || task.urgency === 'high') {
    return {
      task,
      reason: '高重要 / 高緊急',
      detail: '優先度高めの候補',
      tone: 'info',
      score: 8,
    };
  }

  if (task.gtd_category === 'next_action' && task.project_task_id) {
    return {
      task,
      reason: 'Projectを前進',
      detail: 'プロジェクトを動かす一手',
      tone: 'info',
      score: 9,
    };
  }

  return {
    task,
    reason: '通常候補',
    detail: '次の手として確認',
    tone: 'info',
    score: 10,
  };
}

export function buildTaskFocusDeck(tasks: Task[], limit = 3): FocusTaskItem[] {
  return tasks
    .filter((task) => task.status !== 'done' && task.gtd_category !== 'project')
    .map((task) => buildTaskFocusEntry(task))
    .sort((left, right) => {
      if (left.score !== right.score) return left.score - right.score;
      return new Date(right.task.created_at).getTime() - new Date(left.task.created_at).getTime();
    })
    .slice(0, limit);
}

export function buildProjectStalledBuckets(projects: Project[]): ProjectStalledBuckets {
  return projects.reduce<ProjectStalledBuckets>(
    (acc, project) => {
      if (project.overdueCount > 0) acc.overdue.push(project);
      if (!project.dueDate) acc.noDueDate.push(project);
      if (!project.startedAt) acc.noStartedAt.push(project);
      if (project.nextActionCount === 0) acc.noActions.push(project);
      if (project.status === 'waiting') acc.waiting.push(project);
      return acc;
    },
    {
      overdue: [],
      noDueDate: [],
      noStartedAt: [],
      noActions: [],
      waiting: [],
    },
  );
}

function buildStalledTaskEntry(task: Task): StalledTaskItem | null {
  if (isWaitingResponseOverdue(task)) {
    return { task, reason: '回答予定日超過', detail: `回答予定 ${formatRelativeDueText(task.waiting_response_date)}`, tone: 'danger', score: 0 };
  }
  if (isWaitingWithoutResponseDate(task)) {
    return { task, reason: '待ち日付未設定', detail: '回答予定日をまだ入れていません', tone: 'warning', score: 1 };
  }
  if (isDoingStale(task)) {
    const days = daysFromTimestamp(task.updated_at) ?? 0;
    return { task, reason: '進行停滞', detail: `${days}日更新なし`, tone: 'warning', score: 2 };
  }
  if ((task.status === 'todo' || task.status === 'doing') && isOverdue(task.due_date)) {
    return { task, reason: '期限超過', detail: `期限 ${formatRelativeDueText(task.due_date)}`, tone: 'danger', score: 3 };
  }
  return null;
}

export function buildStalledTaskList(tasks: Task[], limit = 4): StalledTaskItem[] {
  return tasks
    .filter((task) => task.status !== 'done' && task.gtd_category !== 'project')
    .map((task) => buildStalledTaskEntry(task))
    .filter((item): item is StalledTaskItem => Boolean(item))
    .sort((left, right) => {
      if (left.score !== right.score) return left.score - right.score;
      return new Date(right.task.updated_at).getTime() - new Date(left.task.updated_at).getTime();
    })
    .slice(0, limit);
}

function buildStalledProjectEntry(project: Project): StalledProjectItem | null {
  if (project.overdueCount > 0) {
    return { project, reason: '期限超過あり', detail: `${project.overdueCount}件の期限超過`, tone: 'danger', score: 0 };
  }
  if (project.nextActionCount === 0) {
    return { project, reason: '次アクション未設定', detail: 'project はあるが一手が未定義', tone: 'warning', score: 1 };
  }
  if (!project.startedAt) {
    return { project, reason: '開始日未記録', detail: 'started_at が未記録です', tone: 'warning', score: 2 };
  }
  if (!project.dueDate) {
    return { project, reason: '期限未設定', detail: 'ガントや期限判断から漏れやすい状態です', tone: 'info', score: 3 };
  }
  if (project.status === 'waiting') {
    return { project, reason: '待ち案件', detail: '止まりやすいので再確認したい案件です', tone: 'warning', score: 4 };
  }
  return null;
}

export function buildStalledProjectList(projects: Project[], limit = 4): StalledProjectItem[] {
  return projects
    .map((project) => buildStalledProjectEntry(project))
    .filter((item): item is StalledProjectItem => Boolean(item))
    .sort((left, right) => {
      if (left.score !== right.score) return left.score - right.score;
      if (right.project.overdueCount !== left.project.overdueCount) return right.project.overdueCount - left.project.overdueCount;
      return right.project.createdAt.localeCompare(left.project.createdAt);
    })
    .slice(0, limit);
}

function buildProjectFocusEntry(project: Project): FocusProjectItem {
  if (project.overdueCount > 0) {
    return {
      project,
      reason: '期限超過あり',
      detail: `${project.overdueCount}件の期限超過`,
      tone: 'danger',
      score: 0,
    };
  }

  if (!project.dueDate) {
    return {
      project,
      reason: '期限未設定',
      detail: 'Viewer / ガント対象から漏れやすい',
      tone: 'warning',
      score: 1,
    };
  }

  if (!project.startedAt) {
    return {
      project,
      reason: '開始日未記録',
      detail: 'started_at がまだ未記録',
      tone: 'warning',
      score: 2,
    };
  }

  if (project.nextActionCount === 0) {
    return {
      project,
      reason: '次アクション未設定',
      detail: 'project はあるが一手が未定義',
      tone: 'info',
      score: 3,
    };
  }

  if (project.status === 'waiting') {
    return {
      project,
      reason: '待ち案件',
      detail: '止まりやすいので確認',
      tone: 'warning',
      score: 4,
    };
  }

  return {
    project,
    reason: '進行中',
    detail: `${project.nextActionCount}件の次アクション`,
    tone: 'info',
    score: 5,
  };
}

export function buildProjectFocusDeck(projects: Project[], limit = 3): FocusProjectItem[] {
  return [...projects]
    .map((project) => buildProjectFocusEntry(project))
    .sort((left, right) => {
      if (left.score !== right.score) return left.score - right.score;
      if (right.project.overdueCount !== left.project.overdueCount) {
        return right.project.overdueCount - left.project.overdueCount;
      }
      return right.project.createdAt.localeCompare(left.project.createdAt);
    })
    .slice(0, limit);
}
