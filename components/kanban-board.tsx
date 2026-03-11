'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabaseClient } from '@/lib/supabase/client';
import { PRIORITY_LABELS, STATUS_LABELS, STATUS_ORDER, Task, TaskPriority, TaskStatus } from '@/lib/types';

const defaultNewTaskState = {
  title: '',
  description: '',
  assignee: '',
  priority: 'medium' as TaskPriority,
  dueDate: ''
};

const priorityClassName: Record<TaskPriority, string> = {
  low: 'bg-emerald-100 text-emerald-700',
  medium: 'bg-amber-100 text-amber-700',
  high: 'bg-rose-100 text-rose-700'
};

function isOverdue(dueDate: string | null) {
  if (!dueDate) return false;
  const today = new Date();
  const due = new Date(dueDate);
  return due < new Date(today.getFullYear(), today.getMonth(), today.getDate());
}

export function KanbanBoard() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [updatingTaskId, setUpdatingTaskId] = useState<string | null>(null);
  const [newTask, setNewTask] = useState(defaultNewTaskState);
  const [keyword, setKeyword] = useState('');
  const [priorityFilter, setPriorityFilter] = useState<'all' | TaskPriority>('all');
  const [loggingOut, setLoggingOut] = useState(false);
  const router = useRouter();

  const fetchTasks = useCallback(async (showRefreshing = false) => {
    if (showRefreshing) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    setError(null);

    try {
      const { data, error: fetchError } = await getSupabaseClient()
        .from('tasks')
        .select('*')
        .order('created_at', { ascending: false });

      if (fetchError) {
        setError(fetchError.message);
      } else {
        setTasks((data as Task[]) ?? []);
      }
    } catch {
      setError('タスク取得に失敗しました。Supabase設定を確認してください。');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void fetchTasks();
  }, [fetchTasks]);

  const filteredTasks = useMemo(() => {
    const normalizedKeyword = keyword.trim().toLowerCase();

    return tasks.filter((task) => {
      const byPriority = priorityFilter === 'all' || task.priority === priorityFilter;
      if (!byPriority) return false;
      if (!normalizedKeyword) return true;

      const haystack = `${task.title} ${task.description ?? ''} ${task.assignee ?? ''}`.toLowerCase();
      return haystack.includes(normalizedKeyword);
    });
  }, [keyword, priorityFilter, tasks]);

  const groupedTasks = useMemo(
    () =>
      STATUS_ORDER.reduce(
        (acc, status) => {
          acc[status] = filteredTasks.filter((task) => task.status === status);
          return acc;
        },
        {
          todo: [] as Task[],
          in_progress: [] as Task[],
          done: [] as Task[]
        }
      ),
    [filteredTasks]
  );

  const addTask = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!newTask.title.trim()) return;

    setSaving(true);
    setError(null);

    try {
      const { data, error: insertError } = await getSupabaseClient()
        .from('tasks')
        .insert({
          title: newTask.title.trim(),
          description: newTask.description.trim() || null,
          assignee: newTask.assignee.trim() || null,
          priority: newTask.priority,
          due_date: newTask.dueDate || null,
          status: 'todo'
        })
        .select('*')
        .single();

      if (insertError) {
        setError(insertError.message);
      } else {
        setTasks((prev) => [data as Task, ...prev]);
        setNewTask(defaultNewTaskState);
      }
    } catch {
      setError('タスク追加に失敗しました。');
    } finally {
      setSaving(false);
    }
  };

  const updateStatus = async (task: Task, status: TaskStatus) => {
    if (task.status === status) return;

    setUpdatingTaskId(task.id);
    setError(null);

    try {
      const { data, error: updateError } = await getSupabaseClient()
        .from('tasks')
        .update({ status })
        .eq('id', task.id)
        .select('*')
        .single();

      if (updateError) {
        setError(updateError.message);
        return;
      }

      setTasks((prev) => prev.map((item) => (item.id === task.id ? (data as Task) : item)));
    } catch {
      setError('ステータス更新に失敗しました。');
    } finally {
      setUpdatingTaskId(null);
    }
  };


  const logout = async () => {
    setLoggingOut(true);
    setError(null);

    try {
      const { error: logoutError } = await getSupabaseClient().auth.signOut();

      if (logoutError) {
        setError(logoutError.message);
        setLoggingOut(false);
        return;
      }

      router.replace('/login');
    } catch {
      setError('ログアウトに失敗しました。');
      setLoggingOut(false);
    }
  };

  const deleteTask = async (id: string) => {
    setUpdatingTaskId(id);
    setError(null);

    try {
      const { error: deleteError } = await getSupabaseClient().from('tasks').delete().eq('id', id);

      if (deleteError) {
        setError(deleteError.message);
        return;
      }

      setTasks((prev) => prev.filter((task) => task.id !== id));
    } catch {
      setError('タスク削除に失敗しました。');
    } finally {
      setUpdatingTaskId(null);
    }
  };

  return (
    <main className="mx-auto flex min-h-screen max-w-7xl flex-col gap-6 p-6 lg:p-10">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">業務TodoカンバンMVP</h1>
          <p className="mt-2 text-sm text-slate-600">タスクの追加・進捗更新・完了管理をシンプルに行えます。</p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => void fetchTasks(true)}
            disabled={loading || refreshing}
            className="rounded border border-slate-300 bg-white px-3 py-2 text-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {refreshing ? '更新中...' : '再読込'}
          </button>
          <button
            type="button"
            onClick={() => void logout()}
            disabled={loggingOut}
            className="rounded border border-rose-300 bg-white px-3 py-2 text-sm text-rose-700 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loggingOut ? 'ログアウト中...' : 'ログアウト'}
          </button>
        </div>
      </header>

      <section className="grid gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm md:grid-cols-4">
        <input
          value={keyword}
          onChange={(event) => setKeyword(event.target.value)}
          placeholder="タイトル・説明・担当者で検索"
          className="rounded border border-slate-300 px-3 py-2 text-sm md:col-span-3"
        />
        <select
          value={priorityFilter}
          onChange={(event) => setPriorityFilter(event.target.value as 'all' | TaskPriority)}
          className="rounded border border-slate-300 px-3 py-2 text-sm"
        >
          <option value="all">優先度: すべて</option>
          <option value="high">優先度: 高</option>
          <option value="medium">優先度: 中</option>
          <option value="low">優先度: 低</option>
        </select>
      </section>

      <form onSubmit={addTask} className="grid gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm md:grid-cols-5">
        <input
          required
          maxLength={80}
          value={newTask.title}
          onChange={(event) => setNewTask((prev) => ({ ...prev, title: event.target.value }))}
          placeholder="タスク名"
          className="rounded border border-slate-300 px-3 py-2 text-sm"
        />
        <input
          maxLength={40}
          value={newTask.assignee}
          onChange={(event) => setNewTask((prev) => ({ ...prev, assignee: event.target.value }))}
          placeholder="担当者"
          className="rounded border border-slate-300 px-3 py-2 text-sm"
        />
        <select
          value={newTask.priority}
          onChange={(event) => setNewTask((prev) => ({ ...prev, priority: event.target.value as TaskPriority }))}
          className="rounded border border-slate-300 px-3 py-2 text-sm"
        >
          <option value="low">優先度: 低</option>
          <option value="medium">優先度: 中</option>
          <option value="high">優先度: 高</option>
        </select>
        <input
          type="date"
          value={newTask.dueDate}
          onChange={(event) => setNewTask((prev) => ({ ...prev, dueDate: event.target.value }))}
          className="rounded border border-slate-300 px-3 py-2 text-sm"
        />
        <button
          disabled={saving}
          className="rounded bg-sky-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {saving ? '追加中...' : 'タスク追加'}
        </button>
        <textarea
          value={newTask.description}
          onChange={(event) => setNewTask((prev) => ({ ...prev, description: event.target.value }))}
          placeholder="詳細説明（任意）"
          className="rounded border border-slate-300 px-3 py-2 text-sm md:col-span-5"
          rows={2}
        />
      </form>

      {error && <p className="rounded border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}

      {loading ? (
        <p className="text-sm text-slate-500">読み込み中...</p>
      ) : (
        <section className="grid gap-4 md:grid-cols-3">
          {STATUS_ORDER.map((status) => (
            <article key={status} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <h2 className="mb-3 text-lg font-semibold">
                {STATUS_LABELS[status]} <span className="text-sm text-slate-500">({groupedTasks[status].length})</span>
              </h2>

              <div className="space-y-3">
                {groupedTasks[status].map((task) => {
                  const disabled = updatingTaskId === task.id;

                  return (
                    <div key={task.id} className="rounded border border-slate-200 p-3">
                      <p className="font-medium">{task.title}</p>
                      {task.description && <p className="mt-1 text-sm text-slate-600">{task.description}</p>}

                      <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-600">
                        {task.assignee && <span className="rounded bg-slate-100 px-2 py-1">担当: {task.assignee}</span>}
                        <span className={`rounded px-2 py-1 ${priorityClassName[task.priority]}`}>
                          優先度: {PRIORITY_LABELS[task.priority]}
                        </span>
                        {task.due_date && (
                          <span className={`rounded px-2 py-1 ${isOverdue(task.due_date) ? 'bg-rose-100 text-rose-700' : 'bg-slate-100'}`}>
                            期限: {task.due_date}
                          </span>
                        )}
                      </div>

                      <div className="mt-3 flex flex-wrap gap-2">
                        {STATUS_ORDER.map((nextStatus) => (
                          <button
                            type="button"
                            key={nextStatus}
                            onClick={() => void updateStatus(task, nextStatus)}
                            disabled={disabled || task.status === nextStatus}
                            className="rounded border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {STATUS_LABELS[nextStatus]}
                          </button>
                        ))}
                        <button
                          type="button"
                          onClick={() => void deleteTask(task.id)}
                          disabled={disabled}
                          className="rounded border border-rose-300 px-2 py-1 text-xs text-rose-700 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          削除
                        </button>
                      </div>
                    </div>
                  );
                })}

                {groupedTasks[status].length === 0 && <p className="text-sm text-slate-400">条件に一致するタスクはありません</p>}
              </div>
            </article>
          ))}
        </section>
      )}
    </main>
  );
}
