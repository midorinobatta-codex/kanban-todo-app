import type { Project } from '@/lib/domain/project';
import type { Task } from '@/lib/types';

const GOAL_MAX_LENGTH = 72;
export const PROJECT_NO_NEXT_ACTION_REASON = '次アクション未設定';
export const PROJECT_NO_NEXT_ACTION_DETAIL = '次に進める一手がまだなく、止まり候補として確認したい状態です';
export const PROJECT_NO_ACTIVE_NEXT_ACTION_REASON = '進める一手なし';
export const PROJECT_NO_ACTIVE_NEXT_ACTION_DETAIL = '関連タスクはあるが、未完了の次アクションがなく次に進める一手がありません';

function collapseWhitespace(value: string) {
  return value.replace(/\s+/g, ' ').trim();
}

export function getProjectGoalSnippet(description: string | null | undefined, maxLength = GOAL_MAX_LENGTH) {
  if (!description) return null;
  const singleLine = collapseWhitespace(description);
  if (!singleLine) return null;
  if (singleLine.length <= maxLength) return singleLine;
  return `${singleLine.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

export function getTaskMap(tasks: Task[]) {
  return tasks.reduce(
    (acc, task) => {
      acc[task.id] = task;
      return acc;
    },
    {} as Record<string, Task>,
  );
}

export function getNextCandidateTask(
  task: Pick<Task, 'id' | 'next_candidate_task_id'>,
  taskMap: Record<string, Task>,
) {
  if (!task.next_candidate_task_id) return null;
  if (task.next_candidate_task_id === task.id) return null;
  return taskMap[task.next_candidate_task_id] ?? null;
}

export function hasBrokenNextCandidate(
  task: Pick<Task, 'id' | 'next_candidate_task_id'>,
  taskMap: Record<string, Task>,
) {
  if (!task.next_candidate_task_id) return false;
  if (task.next_candidate_task_id === task.id) return true;
  return !taskMap[task.next_candidate_task_id];
}

export function getNextCandidateLabel(
  task: Pick<Task, 'id' | 'next_candidate_task_id'>,
  taskMap: Record<string, Task>,
  emptyLabel = '未設定',
) {
  if (!task.next_candidate_task_id) return emptyLabel;
  if (task.next_candidate_task_id === task.id) return '自分自身は設定不可';
  const nextTask = taskMap[task.next_candidate_task_id];
  if (!nextTask) return 'リンク切れ';
  return nextTask.title;
}

export type ProjectRelationshipIssue = {
  projectId: string;
  reason: string;
  detail: string;
  tone: 'danger' | 'warning' | 'info';
  score: number;
};

export function buildProjectRelationshipIssue(
  project: Project,
  tasks: Task[],
  taskMap: Record<string, Task>,
): ProjectRelationshipIssue | null {
  const linkedTasks = tasks.filter(
    (task) => task.gtd_category === 'next_action' && task.project_task_id === project.id,
  );
  const activeLinkedTasks = linkedTasks.filter((task) => task.status !== 'done');
  const brokenCandidateCount = linkedTasks.filter((task) => hasBrokenNextCandidate(task, taskMap)).length;
  const validCandidateCount = activeLinkedTasks.filter((task) => Boolean(getNextCandidateTask(task, taskMap))).length;

  if (brokenCandidateCount > 0) {
    return {
      projectId: project.id,
      reason: '候補リンク切れ',
      detail: `${brokenCandidateCount}件の「この後に見る候補」を見直したい状態です`,
      tone: 'warning',
      score: 1,
    };
  }

  if (project.linkedTaskCount === 0) {
    return {
      projectId: project.id,
      reason: PROJECT_NO_NEXT_ACTION_REASON,
      detail: PROJECT_NO_NEXT_ACTION_DETAIL,
      tone: 'warning',
      score: 2,
    };
  }

  if (project.nextActionCount === 0 && project.status !== 'done') {
    return {
      projectId: project.id,
      reason: PROJECT_NO_ACTIVE_NEXT_ACTION_REASON,
      detail: PROJECT_NO_ACTIVE_NEXT_ACTION_DETAIL,
      tone: 'info',
      score: 3,
    };
  }

  if (activeLinkedTasks.length > 0 && validCandidateCount === 0) {
    return {
      projectId: project.id,
      reason: 'この後候補なし',
      detail: '関連タスクはあるが、終わった後に見る候補がまだありません',
      tone: 'info',
      score: 4,
    };
  }

  return null;
}
