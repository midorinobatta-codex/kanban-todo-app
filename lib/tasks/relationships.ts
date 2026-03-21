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
  linkedTaskCount: number;
  activeLinkedTaskCount: number;
  brokenCandidateTaskIds: string[];
  missingNextCandidateTaskIds: string[];
};

function isTerminalMissingNextCandidateTask(activeLinkedTasks: Task[], taskMap: Record<string, Task>) {
  const missingNextCandidateTasks = activeLinkedTasks.filter((task) => !task.next_candidate_task_id);
  if (missingNextCandidateTasks.length !== 1) return false;

  const [terminalCandidate] = missingNextCandidateTasks;
  if (!terminalCandidate) return false;
  if (activeLinkedTasks.length === 1) return true;

  const activeLinkedTaskIds = new Set(activeLinkedTasks.map((task) => task.id));
  const incomingCounts = new Map<string, number>();
  let internalReferenceCount = 0;

  for (const task of activeLinkedTasks) {
    if (!task.next_candidate_task_id || task.id === terminalCandidate.id) continue;

    const nextTask = getNextCandidateTask(task, taskMap);
    if (!nextTask || !activeLinkedTaskIds.has(nextTask.id)) return false;

    internalReferenceCount += 1;
    incomingCounts.set(nextTask.id, (incomingCounts.get(nextTask.id) ?? 0) + 1);
  }

  if (internalReferenceCount !== activeLinkedTasks.length - 1) return false;
  if ((incomingCounts.get(terminalCandidate.id) ?? 0) === 0) return false;

  const rootCount = activeLinkedTasks.filter((task) => (incomingCounts.get(task.id) ?? 0) === 0).length;
  return rootCount === 1;
}

export function getProjectRelationshipSnapshot(
  project: Pick<Project, 'id'>,
  tasks: Task[],
  taskMap: Record<string, Task>,
) {
  const linkedTasks = tasks.filter(
    (task) => task.gtd_category === 'next_action' && task.project_task_id === project.id,
  );
  const activeLinkedTasks = linkedTasks.filter((task) => task.status !== 'done');
  const brokenCandidateTasks = linkedTasks.filter((task) => hasBrokenNextCandidate(task, taskMap));
  const validCandidateTasks = activeLinkedTasks.filter((task) => Boolean(getNextCandidateTask(task, taskMap)));
  const missingNextCandidateTasks = activeLinkedTasks.filter((task) => !task.next_candidate_task_id);
  const hasTerminalMissingNextCandidate = brokenCandidateTasks.length === 0 && isTerminalMissingNextCandidateTask(activeLinkedTasks, taskMap);

  return {
    linkedTasks,
    activeLinkedTasks,
    brokenCandidateTasks,
    validCandidateTasks,
    missingNextCandidateTasks,
    hasTerminalMissingNextCandidate,
  };
}

export function buildProjectRelationshipIssue(
  project: Project,
  tasks: Task[],
  taskMap: Record<string, Task>,
): ProjectRelationshipIssue | null {
  const {
    linkedTasks,
    activeLinkedTasks,
    brokenCandidateTasks,
    validCandidateTasks,
    missingNextCandidateTasks,
    hasTerminalMissingNextCandidate,
  } = getProjectRelationshipSnapshot(project, tasks, taskMap);
  const brokenCandidateCount = brokenCandidateTasks.length;
  const validCandidateCount = validCandidateTasks.length;

  if (brokenCandidateCount > 0) {
    return {
      projectId: project.id,
      reason: '候補リンク切れ',
      detail: `${brokenCandidateCount}件の「次候補」を見直したい状態です`,
      tone: 'warning',
      score: 1,
      linkedTaskCount: linkedTasks.length,
      activeLinkedTaskCount: activeLinkedTasks.length,
      brokenCandidateTaskIds: brokenCandidateTasks.map((task) => task.id),
      missingNextCandidateTaskIds: missingNextCandidateTasks.map((task) => task.id),
    };
  }

  if (project.linkedTaskCount === 0) {
    return {
      projectId: project.id,
      reason: PROJECT_NO_NEXT_ACTION_REASON,
      detail: PROJECT_NO_NEXT_ACTION_DETAIL,
      tone: 'warning',
      score: 2,
      linkedTaskCount: linkedTasks.length,
      activeLinkedTaskCount: activeLinkedTasks.length,
      brokenCandidateTaskIds: brokenCandidateTasks.map((task) => task.id),
      missingNextCandidateTaskIds: missingNextCandidateTasks.map((task) => task.id),
    };
  }

  if (project.nextActionCount === 0 && project.status !== 'done') {
    return {
      projectId: project.id,
      reason: PROJECT_NO_ACTIVE_NEXT_ACTION_REASON,
      detail: PROJECT_NO_ACTIVE_NEXT_ACTION_DETAIL,
      tone: 'info',
      score: 3,
      linkedTaskCount: linkedTasks.length,
      activeLinkedTaskCount: activeLinkedTasks.length,
      brokenCandidateTaskIds: brokenCandidateTasks.map((task) => task.id),
      missingNextCandidateTaskIds: missingNextCandidateTasks.map((task) => task.id),
    };
  }

  if (missingNextCandidateTasks.length > 0 && !hasTerminalMissingNextCandidate) {
    return {
      projectId: project.id,
      reason: '次候補なし task あり',
      detail:
        validCandidateCount === 0
          ? `${missingNextCandidateTasks.length}件の進行中 task で「次候補」が未設定です`
          : `${missingNextCandidateTasks.length}件の進行中 task で「次候補」が未設定です（設定済み ${validCandidateCount}件）`,
      tone: 'info',
      score: 4,
      linkedTaskCount: linkedTasks.length,
      activeLinkedTaskCount: activeLinkedTasks.length,
      brokenCandidateTaskIds: brokenCandidateTasks.map((task) => task.id),
      missingNextCandidateTaskIds: missingNextCandidateTasks.map((task) => task.id),
    };
  }

  return null;
}
