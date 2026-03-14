import { getSupabaseClient } from '@/lib/supabase/client';
import type { Task, TaskProgress } from '@/lib/types';

function getProjectIdToStart(task: Task, nextStatus: TaskProgress): string | null {
  if (nextStatus !== 'doing') {
    return null;
  }

  if (task.gtd_category === 'project') {
    return task.id;
  }

  if (task.gtd_category === 'next_action' && task.project_task_id) {
    return task.project_task_id;
  }

  return null;
}

export async function updateTaskStatus(task: Task, nextStatus: TaskProgress): Promise<Task> {
  const supabase = getSupabaseClient();
  const projectIdToStart = getProjectIdToStart(task, nextStatus);
  const nextStartedAt =
    task.gtd_category === 'project' && nextStatus === 'doing' && !task.started_at
      ? new Date().toISOString()
      : task.started_at;

  const { data, error } = await supabase
    .from('tasks')
    .update({
      status: nextStatus,
      ...(nextStatus !== 'waiting' ? { waiting_response_date: null } : {}),
      ...(nextStartedAt !== task.started_at ? { started_at: nextStartedAt } : {}),
    })
    .eq('id', task.id)
    .select('*')
    .single();

  if (error) {
    throw error;
  }

  if (projectIdToStart) {
    const { error: projectError } = await supabase
      .from('tasks')
      .update({ started_at: new Date().toISOString() })
      .eq('id', projectIdToStart)
      .eq('gtd_category', 'project')
      .is('started_at', null);

    if (projectError) {
      throw projectError;
    }
  }

  return data as Task;
}