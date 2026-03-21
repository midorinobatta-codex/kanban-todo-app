'use client';

import { useCallback, useEffect, useState } from 'react';
import type { Task } from '@/lib/types';
import { getSupabaseClient } from '@/lib/supabase/client';

type UseTasksResult = {
  tasks: Task[];
  isLoading: boolean;
  error: string | null;
  reload: () => Promise<void>;
};

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  if (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof (error as { message?: unknown }).message === 'string'
  ) {
    return (error as { message: string }).message;
  }

  return fallback;
}

export function useTasks(): UseTasksResult {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const supabase = getSupabaseClient();
      const { data, error: fetchError } = await supabase
        .from('tasks')
        .select('*')
        .order('created_at', { ascending: false });

      if (fetchError) {
        throw fetchError;
      }

      setTasks((data as Task[]) ?? []);
    } catch (err) {
      console.error(err);
      setError(getErrorMessage(err, 'タスクの取得に失敗しました'));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  return {
    tasks,
    isLoading,
    error,
    reload,
  };
}
