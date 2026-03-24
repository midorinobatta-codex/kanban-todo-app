import type { Project } from '@/lib/domain/project';
import { buildProjectStalledBuckets, buildStalledProjectList, buildTaskStalledBuckets } from '@/lib/tasks/focus';
import { buildProjectRelationshipIssue } from '@/lib/tasks/relationships';
import type { Task, WaitingLink } from '@/lib/types';
import { buildLatestWaitingLinkByTaskId, buildWaitingTaskSignal } from '@/lib/waiting-links/overview';

export type HealthSignal = 'on_track' | 'watch' | 'risk';

export type ProjectHealthRow = {
  project: Project;
  signal: HealthSignal;
  signalLabel: string;
  signalScore: number;
  updatedAt: string | null;
  stalledTaskCount: number;
  waitingOverdueCount: number;
  waitingUnreadCount: number;
  waitingQuestionCount: number;
  waitingLinkMissingCount: number;
  waitingCompletedNeedsActionCount: number;
  nextActionMissingCount: number;
  highImportanceHighUrgencyCount: number;
  relationIssue: ReturnType<typeof buildProjectRelationshipIssue>;
  prompts: string[];
};

export type HealthOverview = {
  stalledTaskCount: number;
  waitingOverdueCount: number;
  waitingUnreadCount: number;
  waitingQuestionCount: number;
  waitingLinkMissingCount: number;
  projectWithoutNextActionCount: number;
  projectWithoutActiveActionCount: number;
  highImportanceHighUrgencyCount: number;
  urgentHighImportanceCount: number;
  latestTaskUpdatedAt: string | null;
  riskyProjects: ProjectHealthRow[];
  projectRows: ProjectHealthRow[];
};

function maxUpdatedAt(tasks: Task[]) {
  if (tasks.length === 0) return null;
  return tasks.reduce<string | null>((latest, task) => {
    const candidate = task.updated_at ?? task.created_at;
    if (!latest) return candidate;
    return new Date(candidate).getTime() > new Date(latest).getTime() ? candidate : latest;
  }, null);
}

export function buildHealthOverview(
  projects: Project[],
  tasks: Task[],
  taskMap: Record<string, Task>,
  waitingLinks: WaitingLink[] = [],
): HealthOverview {
  const taskBuckets = buildTaskStalledBuckets(tasks, taskMap);
  const projectBuckets = buildProjectStalledBuckets(projects, tasks, taskMap);

  const latestLinkByTaskId = buildLatestWaitingLinkByTaskId(waitingLinks);
  const projectRows = projects
    .map<ProjectHealthRow>((project) => {
      const linkedTasks = tasks.filter((task) => task.project_task_id === project.id && task.gtd_category === 'next_action');
      const waitingOrDelegated = linkedTasks.filter((task) => task.status === 'waiting' || task.gtd_category === 'delegated');
      const stalledTaskCount = linkedTasks.filter(
        (task) =>
          taskBuckets.waitingOverdue.some((item) => item.id === task.id) ||
          taskBuckets.doingStale.some((item) => item.id === task.id) ||
          taskBuckets.overdueTodo.some((item) => item.id === task.id),
      ).length;
      const waitingOverdueCount = linkedTasks.filter((task) => taskBuckets.waitingOverdue.some((item) => item.id === task.id)).length;
      const waitingSignals = waitingOrDelegated.map((task) => buildWaitingTaskSignal(task, latestLinkByTaskId.get(task.id)));
      const waitingUnreadCount = waitingSignals.filter((item) => item.hasUnreadResponse).length;
      const waitingQuestionCount = waitingSignals.filter((item) => item.hasQuestion).length;
      const waitingLinkMissingCount = waitingSignals.filter((item) => item.isLinkMissing).length;
      const waitingCompletedNeedsActionCount = waitingSignals.filter((item) => item.hasCompletedResponse).length;
      const nextActionMissingCount =
        project.linkedTaskCount === 0 || (project.linkedTaskCount > 0 && project.nextActionCount === 0 && project.status !== 'done')
          ? 1
          : 0;
      const highImportanceHighUrgencyCount = linkedTasks.filter(
        (task) => task.status !== 'done' && task.importance === 'high' && task.urgency === 'high',
      ).length;
      const relationIssue = buildProjectRelationshipIssue(project, tasks, taskMap);

      const signalScore =
        waitingOverdueCount * 3 +
        stalledTaskCount * 2 +
        waitingUnreadCount * 2 +
        waitingQuestionCount * 2 +
        waitingLinkMissingCount +
        waitingCompletedNeedsActionCount +
        project.overdueCount * 2 +
        nextActionMissingCount * 3 +
        (relationIssue ? 2 : 0) +
        highImportanceHighUrgencyCount;

      const signal: HealthSignal = signalScore >= 6 ? 'risk' : signalScore >= 2 ? 'watch' : 'on_track';
      const signalLabel = signal === 'risk' ? '危険' : signal === 'watch' ? '要注意' : 'On track';
      const prompts = [
        waitingOverdueCount > 0 ? '誰待ちで、いつ再確認しますか？' : null,
        waitingUnreadCount > 0 ? '返信をまだ確認していません。先に内容を見ますか？' : null,
        waitingQuestionCount > 0 ? '相手から質問が来ています。判断を返せますか？' : null,
        waitingLinkMissingCount > 0 ? 'リンク未発行の Waiting があります。共有URLを作成しますか？' : null,
        waitingCompletedNeedsActionCount > 0 ? '完了返答あり。次アクション化されているか確認しますか？' : null,
        stalledTaskCount > 0 ? '止まっている理由は何ですか？' : null,
        nextActionMissingCount > 0 ? '次に動かす1手は何ですか？' : null,
        relationIssue ? `${relationIssue.reason} をどう直しますか？` : null,
        highImportanceHighUrgencyCount > 0 ? '高重要×高緊急が偏っていませんか？' : null,
      ].filter((value): value is string => Boolean(value));

      return {
        project,
        signal,
        signalLabel,
        signalScore,
        updatedAt: maxUpdatedAt(linkedTasks),
        stalledTaskCount,
        waitingOverdueCount,
        waitingUnreadCount,
        waitingQuestionCount,
        waitingLinkMissingCount,
        waitingCompletedNeedsActionCount,
        nextActionMissingCount,
        highImportanceHighUrgencyCount,
        relationIssue,
        prompts,
      };
    })
    .sort((left, right) => {
      if (right.signalScore !== left.signalScore) return right.signalScore - left.signalScore;
      if (right.stalledTaskCount !== left.stalledTaskCount) return right.stalledTaskCount - left.stalledTaskCount;
      return right.project.createdAt.localeCompare(left.project.createdAt);
    });

  const riskyProjectIds = new Set(buildStalledProjectList(projects, 999, tasks, taskMap).map((item) => item.project.id));
  const riskyProjects = projectRows.filter((item) => item.signal !== 'on_track' || riskyProjectIds.has(item.project.id)).slice(0, 12);

  return {
    stalledTaskCount:
      taskBuckets.waitingOverdue.length + taskBuckets.doingStale.length + taskBuckets.overdueTodo.length,
    waitingOverdueCount: taskBuckets.waitingOverdue.length,
    waitingUnreadCount: tasks
      .filter((task) => task.status === 'waiting' || task.gtd_category === 'delegated')
      .filter((task) => buildWaitingTaskSignal(task, latestLinkByTaskId.get(task.id)).hasUnreadResponse).length,
    waitingQuestionCount: tasks
      .filter((task) => task.status === 'waiting' || task.gtd_category === 'delegated')
      .filter((task) => buildWaitingTaskSignal(task, latestLinkByTaskId.get(task.id)).hasQuestion).length,
    waitingLinkMissingCount: tasks
      .filter((task) => task.status === 'waiting' || task.gtd_category === 'delegated')
      .filter((task) => buildWaitingTaskSignal(task, latestLinkByTaskId.get(task.id)).isLinkMissing).length,
    projectWithoutNextActionCount: projectBuckets.noActions.length,
    projectWithoutActiveActionCount: projectBuckets.noActiveActions.length,
    highImportanceHighUrgencyCount: tasks.filter(
      (task) => task.status !== 'done' && task.importance === 'high' && task.urgency === 'high',
    ).length,
    urgentHighImportanceCount: tasks.filter(
      (task) => task.status !== 'done' && (task.importance === 'high' || task.urgency === 'high'),
    ).length,
    latestTaskUpdatedAt: maxUpdatedAt(tasks),
    riskyProjects,
    projectRows,
  };
}
