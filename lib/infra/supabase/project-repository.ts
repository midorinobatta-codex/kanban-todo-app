import { getSupabaseClient } from '@/lib/supabase/client';
import {
  mapProjectRow,
  type CreateProjectInput,
  type Project,
  type ProjectRow,
} from '@/lib/domain/project';

const PROJECT_SELECT_COLUMNS =
  'id, title, description, created_at, started_at, due_date, status';

type LinkedTaskRow = {
  project_task_id: string | null;
  status: 'todo' | 'doing' | 'waiting' | 'done';
  due_date: string | null;
};

async function getCurrentUserId(): Promise<string> {
  const supabase = getSupabaseClient();

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error) {
    throw error;
  }

  if (!user) {
    throw new Error('ログイン情報を確認できませんでした');
  }

  return user.id;
}

function isOverdue(dueDate: string | null): boolean {
  if (!dueDate) return false;

  const [year, month, day] = dueDate.split('-').map(Number);
  const due = new Date(year, month - 1, day);

  const today = new Date();
  const todayOnly = new Date(today.getFullYear(), today.getMonth(), today.getDate());

  return due < todayOnly;
}

export async function listProjects(): Promise<Project[]> {
  const supabase = getSupabaseClient();
  const userId = await getCurrentUserId();

  const { data, error } = await supabase
    .from('tasks')
    .select(PROJECT_SELECT_COLUMNS)
    .eq('user_id', userId)
    .eq('gtd_category', 'project')
    .order('created_at', { ascending: false });

  if (error) {
    throw error;
  }

  const projects = ((data ?? []) as ProjectRow[]).map(mapProjectRow);

  if (projects.length === 0) {
    return projects;
  }

  const projectIds = projects.map((project) => project.id);

  const { data: linkedTaskData, error: linkedTaskError } = await supabase
    .from('tasks')
    .select('project_task_id, status, due_date')
    .eq('user_id', userId)
    .eq('gtd_category', 'next_action')
    .in('project_task_id', projectIds);

  if (linkedTaskError) {
    throw linkedTaskError;
  }

  const statsMap = (linkedTaskData ?? []).reduce(
    (acc, row) => {
      const task = row as LinkedTaskRow;
      if (!task.project_task_id) return acc;

      if (!acc[task.project_task_id]) {
        acc[task.project_task_id] = {
          linkedTaskCount: 0,
          nextActionCount: 0,
          doneCount: 0,
          overdueCount: 0,
        };
      }

      acc[task.project_task_id].linkedTaskCount += 1;

      if (task.status === 'done') {
        acc[task.project_task_id].doneCount += 1;
      } else {
        acc[task.project_task_id].nextActionCount += 1;
      }

      if (isOverdue(task.due_date) && task.status !== 'done') {
        acc[task.project_task_id].overdueCount += 1;
      }

      return acc;
    },
    {} as Record<
      string,
      {
        nextActionCount: number;
        linkedTaskCount: number;
        doneCount: number;
        overdueCount: number;
      }
    >,
  );

  return projects.map((project) => {
    const stats = statsMap[project.id] ?? {
      linkedTaskCount: 0,
      nextActionCount: 0,
      doneCount: 0,
      overdueCount: 0,
    };

    const completionRate =
      stats.linkedTaskCount === 0
        ? 0
        : Math.round((stats.doneCount / stats.linkedTaskCount) * 100);

    return {
      ...project,
      linkedTaskCount: stats.linkedTaskCount,
      nextActionCount: stats.nextActionCount,
      doneCount: stats.doneCount,
      overdueCount: stats.overdueCount,
      completionRate,
    };
  });
}

export async function createProject(input: CreateProjectInput): Promise<Project> {
  const supabase = getSupabaseClient();
  const userId = await getCurrentUserId();
  const title = input.title.trim();

  if (!title) {
    throw new Error('プロジェクト名を入力してください');
  }

  const { data, error } = await supabase
    .from('tasks')
    .insert({
      user_id: userId,
      title,
      description: null,
      assignee: null,
      priority: 'medium',
      importance: 'medium',
      urgency: 'medium',
      status: 'todo',
      gtd_category: 'project',
      project_task_id: null,
      due_date: null,
      started_at: null,
    })
    .select(PROJECT_SELECT_COLUMNS)
    .single();

  if (error) {
    throw error;
  }

  return mapProjectRow(data as ProjectRow);
}

export async function deleteProject(projectId: string): Promise<void> {
  const supabase = getSupabaseClient();
  const userId = await getCurrentUserId();

  const { error: unlinkError } = await supabase
    .from('tasks')
    .update({ project_task_id: null })
    .eq('user_id', userId)
    .eq('project_task_id', projectId);

  if (unlinkError) {
    throw unlinkError;
  }

  const { error: deleteError } = await supabase
    .from('tasks')
    .delete()
    .eq('user_id', userId)
    .eq('id', projectId)
    .eq('gtd_category', 'project');

  if (deleteError) {
    throw deleteError;
  }
}
