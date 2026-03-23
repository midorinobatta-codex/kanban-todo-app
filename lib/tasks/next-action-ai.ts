import type { Task } from '@/lib/types';
import { isDoingStale } from '@/lib/tasks/focus';
import { getProjectGoalSnippet } from '@/lib/tasks/relationships';

export type NextActionSuggestion = {
  title: string;
  reason: string;
};

function splitIdeas(value: string | null | undefined) {
  if (!value) return [];
  return value
    .split(/[。\n]/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 4);
}

function shortenToAction(value: string) {
  const cleaned = value.replace(/[「」]/g, '').trim();
  if (cleaned.length <= 42) return cleaned;
  return `${cleaned.slice(0, 41).trimEnd()}…`;
}

export function buildNextActionSuggestions(project: Task, linkedTasks: Task[]): NextActionSuggestion[] {
  const activeTasks = linkedTasks.filter((task) => task.status !== 'done');
  const doneTasks = linkedTasks.filter((task) => task.status === 'done');
  const ideas: NextActionSuggestion[] = [];
  const goalSnippet = getProjectGoalSnippet(project.description, 96);

  if (activeTasks.length === 0) {
    ideas.push({
      title: `「${shortenToAction(project.title)}」の最初の一手を書き出す`,
      reason: '関連 task がまだ無いため、project 名から最初の一歩を提案',
    });
  }

  const stalledTask = activeTasks.find((task) => task.status === 'waiting' || isDoingStale(task));
  if (stalledTask) {
    ideas.push({
      title:
        stalledTask.status === 'waiting'
          ? `${shortenToAction(stalledTask.title)} をフォローする`
          : `${shortenToAction(stalledTask.title)} を 15 分で進める`,
      reason: stalledTask.status === 'waiting' ? '待ち・止まり task から次の打ち手を推定' : '更新が止まっている task から再開アクションを提案',
    });
  }

  const missingDueTask = activeTasks.find((task) => !task.due_date && task.status === 'todo');
  if (missingDueTask) {
    ideas.push({
      title: `${shortenToAction(missingDueTask.title)} の完了条件を決める`,
      reason: '未完了 task の曖昧さを減らして着手しやすくするため',
    });
  }

  for (const idea of splitIdeas(project.description)) {
    ideas.push({
      title: `${shortenToAction(idea)} を確認する`,
      reason: 'project description から具体化できる断片を抽出',
    });
  }

  if (goalSnippet && doneTasks.length > 0) {
    ideas.push({
      title: `${shortenToAction(goalSnippet)} の残りを整理する`,
      reason: '完了済み task と description を合わせて残タスクを推定',
    });
  }

  return ideas
    .filter((item, index, array) => array.findIndex((candidate) => candidate.title === item.title) === index)
    .filter((item) => item.title.length > 0)
    .slice(0, 5);
}
