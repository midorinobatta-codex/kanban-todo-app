import type { Project } from '@/lib/domain/project';
import { isOverdue, isWaitingResponseOverdue } from '@/lib/tasks/presentation';
import type { Task, WaitingLink } from '@/lib/types';
import { buildProjectRelationshipIssue } from '@/lib/tasks/relationships';
import { buildWaitingTaskSignal } from '@/lib/waiting-links/overview';

export type PortfolioReason =
  | '回答超過'
  | '進行停滞'
  | '次アクション未設定'
  | '期限超過'
  | '次候補なし'
  | '候補リンク切れ'
  | '返信あり未確認'
  | '相手から質問あり'
  | 'リンク未発行'
  | '完了返答未処理'
  | 'waiting 日付未設定';

export type PortfolioRow = {
  project: Project;
  signal: 'on_track' | 'watch' | 'risk';
  signalLabel: string;
  reasons: PortfolioReason[];
  activeTaskCount: number;
  waitingOverdueCount: number;
  staleDoingCount: number;
  latestUpdatedAt: string | null;
  focusTaskCount: number;
};

function isDoingStale(task: Task, now = Date.now()) {
  if (task.status !== 'doing') return false;
  const updated = new Date(task.updated_at ?? task.created_at).getTime();
  return now - updated > 1000 * 60 * 60 * 24 * 3;
}

function getLatest(tasks: Task[]) {
  if (tasks.length === 0) return null;
  return tasks.reduce<string | null>((acc, task) => {
    const candidate = task.updated_at ?? task.created_at;
    if (!acc) return candidate;
    return new Date(candidate).getTime() > new Date(acc).getTime() ? candidate : acc;
  }, null);
}

export function buildPortfolioOverview(projects: Project[], tasks: Task[], waitingLinks: WaitingLink[]) {
  const latestLinkByTaskId = new Map<string, WaitingLink>();
  for (const link of waitingLinks) {
    const existing = latestLinkByTaskId.get(link.task_id);
    if (!existing || new Date(existing.created_at).getTime() < new Date(link.created_at).getTime()) {
      latestLinkByTaskId.set(link.task_id, link);
    }
  }

  const reasonCount = new Map<PortfolioReason, number>();
  const countReason = (reason: PortfolioReason) => reasonCount.set(reason, (reasonCount.get(reason) ?? 0) + 1);

  const rows: PortfolioRow[] = projects.map((project) => {
    const projectTasks = tasks.filter((task) => task.project_task_id === project.id && task.gtd_category === 'next_action');
    const reasons: PortfolioReason[] = [];
    const now = Date.now();

    const waitingOverdueCount = projectTasks.filter((task) => isWaitingResponseOverdue(task)).length;
    const waitingNoDateCount = projectTasks.filter((task) => task.status === 'waiting' && !task.waiting_response_date).length;
    const staleDoingCount = projectTasks.filter((task) => isDoingStale(task, now)).length;
    const overdueCount = projectTasks.filter((task) => task.status !== 'done' && isOverdue(task.due_date)).length;
    const noNextAction = project.linkedTaskCount > 0 && project.nextActionCount === 0 && project.status !== 'done';
    const noFocus = projectTasks.filter((task) => task.status !== 'done' && (task.importance === 'high' || task.urgency === 'high')).length;

    if (waitingOverdueCount > 0) reasons.push('回答超過');
    if (waitingNoDateCount > 0) reasons.push('waiting 日付未設定');
    if (staleDoingCount > 0) reasons.push('進行停滞');
    if (overdueCount > 0) reasons.push('期限超過');
    if (noNextAction) reasons.push('次アクション未設定');

    let unreadResponses = 0;
    let questionResponses = 0;
    let missingLinks = 0;
    let completedButWaiting = 0;

    for (const task of projectTasks) {
      const link = latestLinkByTaskId.get(task.id);
      const signal = buildWaitingTaskSignal(task, link);
      if (signal.hasUnreadResponse) unreadResponses += 1;
      if (signal.hasQuestion) questionResponses += 1;
      if (signal.isLinkMissing) missingLinks += 1;
      if (signal.hasCompletedResponse && task.status === 'waiting') completedButWaiting += 1;
    }

    if (unreadResponses > 0) reasons.push('返信あり未確認');
    if (questionResponses > 0) reasons.push('相手から質問あり');
    if (missingLinks > 0) reasons.push('リンク未発行');
    if (completedButWaiting > 0) reasons.push('完了返答未処理');

    const relationIssue = buildProjectRelationshipIssue(project, tasks, Object.fromEntries(tasks.map((task) => [task.id, task])));
    if (relationIssue?.reason.includes('候補')) reasons.push('候補リンク切れ');
    if (relationIssue?.reason.includes('次候補')) reasons.push('次候補なし');

    const score =
      waitingOverdueCount * 2 +
      staleDoingCount * 2 +
      overdueCount * 2 +
      Number(noNextAction) * 3 +
      unreadResponses +
      questionResponses * 2 +
      missingLinks +
      completedButWaiting +
      waitingNoDateCount;

    const signal: PortfolioRow['signal'] = score >= 7 ? 'risk' : score >= 2 ? 'watch' : 'on_track';

    for (const reason of reasons) countReason(reason);

    return {
      project,
      signal,
      signalLabel: signal === 'risk' ? '危険' : signal === 'watch' ? '要注意' : 'On track',
      reasons,
      activeTaskCount: projectTasks.filter((task) => task.status !== 'done').length,
      waitingOverdueCount,
      staleDoingCount,
      latestUpdatedAt: getLatest(projectTasks),
      focusTaskCount: noFocus,
    };
  }).sort((a, b) => {
    const w: Record<PortfolioRow['signal'], number> = { risk: 2, watch: 1, on_track: 0 };
    if (w[b.signal] !== w[a.signal]) return w[b.signal] - w[a.signal];
    return a.project.title.localeCompare(b.project.title, 'ja');
  });

  const summary = {
    projectCount: projects.length,
    onTrackCount: rows.filter((row) => row.signal === 'on_track').length,
    watchCount: rows.filter((row) => row.signal === 'watch').length,
    riskCount: rows.filter((row) => row.signal === 'risk').length,
    waitingOverdueCount: rows.reduce((acc, row) => acc + row.waitingOverdueCount, 0),
    staleCount: rows.reduce((acc, row) => acc + row.staleDoingCount, 0),
    noNextActionProjectCount: rows.filter((row) => row.reasons.includes('次アクション未設定')).length,
    noRecentUpdateCount: rows.filter((row) => {
      if (!row.latestUpdatedAt) return true;
      return Date.now() - new Date(row.latestUpdatedAt).getTime() > 1000 * 60 * 60 * 24 * 7;
    }).length,
    waitingUnreadCount: rows.filter((row) => row.reasons.includes('返信あり未確認')).length,
    waitingQuestionCount: rows.filter((row) => row.reasons.includes('相手から質問あり')).length,
    waitingLinkMissingCount: rows.filter((row) => row.reasons.includes('リンク未発行')).length,
  };

  return {
    summary,
    rows,
    reasonTotals: Array.from(reasonCount.entries()).sort((a, b) => b[1] - a[1]),
  };
}
