'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { getSupabaseClient } from '@/lib/supabase/client';
import {
  IMPORTANCE_LABELS,
  TASK_IMPORTANCE_VALUES,
  TASK_GTD_LABELS,
  TASK_GTD_VALUES,
  TASK_PROGRESS_LABELS,
  TASK_PROGRESS_ORDER,
  TASK_URGENCY_VALUES,
  URGENCY_LABELS,
  type Task,
  type TaskGtdCategory,
  type TaskImportance,
  type TaskPriority,
  type TaskProgress,
  type TaskUrgency,
} from '@/lib/types';

const defaultNewTaskState = {
  title: '',
  description: '',
  assignee: '',
  priority: 'medium' as TaskPriority,
  importance: 'medium' as TaskImportance,
  urgency: 'medium' as TaskUrgency,
  dueDate: '',
  gtdCategory: 'next_action' as TaskGtdCategory
};

const levelClassName = {
  low: 'bg-emerald-100 text-emerald-700',
  medium: 'bg-amber-100 text-amber-700',
  high: 'bg-rose-100 text-rose-700'
} as const satisfies Record<TaskPriority | TaskImportance | TaskUrgency, string>;

type KanbanBoardProps = {
  userId: string;
  userEmail?: string | null;
  onLogout: () => Promise<void>;
  loggingOut?: boolean;
};

type ViewMode = 'kanban' | 'matrix' | 'gtd';

type MatrixQuadrantKey = 'important_urgent' | 'important_notUrgent' | 'notImportant_urgent' | 'notImportant_notUrgent';

const MATRIX_QUADRANTS: Array<{
  key: MatrixQuadrantKey;
  title: string;
  subtitle: string;
}> = [
  { key: 'important_urgent', title: '重要 × 緊急', subtitle: '今すぐ対応' },
  { key: 'important_notUrgent', title: '重要 × 非緊急', subtitle: '計画的に進める' },
  { key: 'notImportant_urgent', title: '非重要 × 緊急', subtitle: 'できれば委任' },
  { key: 'notImportant_notUrgent', title: '非重要 × 非緊急', subtitle: '後回し候補' }
];

const GTD_SECTIONS: Array<{ key: TaskGtdCategory; title: string }> = [
  { key: 'next_action', title: '次にやる' },
  { key: 'delegated', title: '他者依頼' },
  { key: 'project', title: 'プロジェクト' },
  { key: 'someday', title: 'いつか / 保留' }
];

function isOverdue(dueDate: string | null) {
  if (!dueDate) return false;

  const [year, month, day] = dueDate.split('-').map(Number);
  const due = new Date(year, month - 1, day);

  const today = new Date();
  const todayOnly = new Date(today.getFullYear(), today.getMonth(), today.getDate());

  return due < todayOnly;
}

export function KanbanBoard({ userId, userEmail, onLogout, loggingOut = false }: KanbanBoardProps) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [updatingTaskId, setUpdatingTaskId] = useState<string | null>(null);
  const [newTask, setNewTask] = useState(defaultNewTaskState);
  const [keyword, setKeyword] = useState('');
  const [gtdFilter, setGtdFilter] = useState<'all' | TaskGtdCategory>('all');
  const [importanceFilter, setImportanceFilter] = useState<'all' | TaskImportance>('all');
  const [urgencyFilter, setUrgencyFilter] = useState<'all' | TaskUrgency>('all');
  const [viewMode, setViewMode] = useState<ViewMode>('kanban');

  const fetchTasks = useCallback(
    async (showRefreshing = false) => {
      if (showRefreshing) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      setError(null);

      const { data, error: fetchError } = await getSupabaseClient()
        .from('tasks')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (fetchError) {
        setError(fetchError.message);
      } else {
        setTasks((data as Task[]) ?? []);
      }

      setLoading(false);
      setRefreshing(false);
    },
    [userId]
  );

  useEffect(() => {
    void fetchTasks();
  }, [fetchTasks]);

  const filteredTasks = useMemo(() => {
    const normalizedKeyword = keyword.trim().toLowerCase();

    return tasks.filter((task) => {
      const byGtdCategory = gtdFilter === 'all' ? true : task.gtd_category === gtdFilter;
      if (!byGtdCategory) return false;

      const byImportance = importanceFilter === 'all' ? true : task.importance === importanceFilter;
      if (!byImportance) return false;

      const byUrgency = urgencyFilter === 'all' ? true : task.urgency === urgencyFilter;
      if (!byUrgency) return false;

      if (!normalizedKeyword) return true;

      const haystack = `${task.title} ${task.description ?? ''} ${task.assignee ?? ''}`.toLowerCase();
      return haystack.includes(normalizedKeyword);
    });
  }, [gtdFilter, importanceFilter, keyword, tasks, urgencyFilter]);

  const groupedTasks = useMemo(() => {
    return TASK_PROGRESS_ORDER.reduce(
      (acc, status) => {
        acc[status] = filteredTasks.filter((task) => task.status === status);
        return acc;
      },
      {
        todo: [] as Task[],
        doing: [] as Task[],
        waiting: [] as Task[],
        done: [] as Task[]
      }
    );
  }, [filteredTasks]);

  const matrixTasks = useMemo(() => {
    return filteredTasks.reduce(
      (acc, task) => {
        const isImportantHigh = task.importance === 'high';
        const isUrgencyHigh = task.urgency === 'high';

        if (isImportantHigh && isUrgencyHigh) {
          acc.important_urgent.push(task);
        } else if (isImportantHigh && !isUrgencyHigh) {
          acc.important_notUrgent.push(task);
        } else if (!isImportantHigh && isUrgencyHigh) {
          acc.notImportant_urgent.push(task);
        } else {
          acc.notImportant_notUrgent.push(task);
        }

        return acc;
      },
      {
        important_urgent: [] as Task[],
        important_notUrgent: [] as Task[],
        notImportant_urgent: [] as Task[],
        notImportant_notUrgent: [] as Task[]
      }
    );
  }, [filteredTasks]);

  const gtdTasks = useMemo(() => {
    return filteredTasks.reduce(
      (acc, task) => {
        acc[task.gtd_category].push(task);
        return acc;
      },
      {
        next_action: [] as Task[],
        delegated: [] as Task[],
        project: [] as Task[],
        someday: [] as Task[]
      }
    );
  }, [filteredTasks]);

  const addTask = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!newTask.title.trim()) return;

    setSaving(true);
    setError(null);

    const { data, error: insertError } = await getSupabaseClient()
      .from('tasks')
      .insert({
        user_id: userId,
        title: newTask.title.trim(),
        description: newTask.description.trim() || null,
        assignee: newTask.assignee.trim() || null,
        priority: newTask.priority,
        importance: newTask.importance,
        urgency: newTask.urgency,
        due_date: newTask.dueDate || null,
        status: 'todo',
        gtd_category: newTask.gtdCategory
      })
      .select('*')
      .single();

    if (insertError) {
      setError(insertError.message);
    } else {
      setTasks((prev) => [data as Task, ...prev]);
      setNewTask(defaultNewTaskState);
    }

    setSaving(false);
  };

  const updateStatus = async (task: Task, status: TaskProgress) => {
    if (task.status === status) return;

    setUpdatingTaskId(task.id);
    setError(null);

    const { data, error: updateError } = await getSupabaseClient()
      .from('tasks')
      .update({ status })
      .eq('id', task.id)
      .select('*')
      .single();

    if (updateError) {
      setError(updateError.message);
      setUpdatingTaskId(null);
      return;
    }

    setTasks((prev) => prev.map((item) => (item.id === task.id ? (data as Task) : item)));
    setUpdatingTaskId(null);
  };

  const deleteTask = async (id: string) => {
    setUpdatingTaskId(id);
    setError(null);

    const { error: deleteError } = await getSupabaseClient().from('tasks').delete().eq('id', id);

    if (deleteError) {
      setError(deleteError.message);
      setUpdatingTaskId(null);
      return;
    }

    setTasks((prev) => prev.filter((task) => task.id !== id));
    setUpdatingTaskId(null);
  };

  return (
    <main className="mx-auto flex min-h-screen max-w-7xl flex-col gap-6 p-6 lg:p-10">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">業務TodoカンバンMVP</h1>
          <p className="mt-2 text-sm text-slate-600">タスクの追加・進捗更新・完了管理をシンプルに行えます。</p>
          {userEmail && <p className="mt-1 text-xs text-slate-500">ログイン中: {userEmail}</p>}
        </div>
        <div className="flex items-center gap-2">
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
            onClick={() => void onLogout()}
            disabled={loggingOut}
            className="rounded border border-slate-300 bg-white px-3 py-2 text-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loggingOut ? 'ログアウト中...' : 'ログアウト'}
          </button>
        </div>
      </header>

      <section className="grid gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm md:grid-cols-3 lg:grid-cols-4">
        <input
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          placeholder="タイトル・説明・担当者で検索"
          className="rounded border border-slate-300 px-3 py-2 text-sm md:col-span-3"
        />
        <select
          value={gtdFilter}
          onChange={(e) => setGtdFilter(e.target.value as 'all' | TaskGtdCategory)}
          className="rounded border border-slate-300 px-3 py-2 text-sm"
        >
          <option value="all">GTD: すべて</option>
          {TASK_GTD_VALUES.map((category) => (
            <option key={category} value={category}>
              GTD: {TASK_GTD_LABELS[category]}
            </option>
          ))}
        </select>

        <select
          value={importanceFilter}
          onChange={(e) => setImportanceFilter(e.target.value as 'all' | TaskImportance)}
          className="rounded border border-slate-300 px-3 py-2 text-sm"
        >
          <option value="all">重要度: すべて</option>
          {TASK_IMPORTANCE_VALUES.map((importance) => (
            <option key={importance} value={importance}>
              重要度: {IMPORTANCE_LABELS[importance]}
            </option>
          ))}
        </select>

        <select
          value={urgencyFilter}
          onChange={(e) => setUrgencyFilter(e.target.value as 'all' | TaskUrgency)}
          className="rounded border border-slate-300 px-3 py-2 text-sm"
        >
          <option value="all">緊急度: すべて</option>
          {TASK_URGENCY_VALUES.map((urgency) => (
            <option key={urgency} value={urgency}>
              緊急度: {URGENCY_LABELS[urgency]}
            </option>
          ))}
        </select>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div className="inline-flex rounded-md border border-slate-300 bg-slate-100 p-1">
          <button
            type="button"
            onClick={() => setViewMode('kanban')}
            className={`rounded px-3 py-1.5 text-sm ${
              viewMode === 'kanban' ? 'bg-white font-medium text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            カンバン表示
          </button>
          <button
            type="button"
            onClick={() => setViewMode('matrix')}
            className={`rounded px-3 py-1.5 text-sm ${
              viewMode === 'matrix' ? 'bg-white font-medium text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            マトリクス表示
          </button>
          <button
            type="button"
            onClick={() => setViewMode('gtd')}
            className={`rounded px-3 py-1.5 text-sm ${
              viewMode === 'gtd' ? 'bg-white font-medium text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            GTD表示
          </button>
        </div>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="mb-4 text-lg font-semibold">タスク追加</h2>
        <form onSubmit={(e) => void addTask(e)} className="grid gap-3 md:grid-cols-2">
          <input
            required
            value={newTask.title}
            onChange={(e) => setNewTask((prev) => ({ ...prev, title: e.target.value }))}
            placeholder="タイトル"
            className="rounded border border-slate-300 px-3 py-2 text-sm"
          />
          <input
            value={newTask.assignee}
            onChange={(e) => setNewTask((prev) => ({ ...prev, assignee: e.target.value }))}
            placeholder="担当者"
            className="rounded border border-slate-300 px-3 py-2 text-sm"
          />
          <textarea
            value={newTask.description}
            onChange={(e) => setNewTask((prev) => ({ ...prev, description: e.target.value }))}
            placeholder="説明"
            className="rounded border border-slate-300 px-3 py-2 text-sm md:col-span-2"
            rows={3}
          />
          <select
            value={newTask.importance}
            onChange={(e) => setNewTask((prev) => ({ ...prev, importance: e.target.value as TaskImportance }))}
            className="rounded border border-slate-300 px-3 py-2 text-sm"
          >
            {TASK_IMPORTANCE_VALUES.map((importance) => (
              <option key={importance} value={importance}>
                重要度: {IMPORTANCE_LABELS[importance]}
              </option>
            ))}
          </select>
          <select
            value={newTask.urgency}
            onChange={(e) => setNewTask((prev) => ({ ...prev, urgency: e.target.value as TaskUrgency }))}
            className="rounded border border-slate-300 px-3 py-2 text-sm"
          >
            {TASK_URGENCY_VALUES.map((urgency) => (
              <option key={urgency} value={urgency}>
                緊急度: {URGENCY_LABELS[urgency]}
              </option>
            ))}
          </select>
          <input
            type="date"
            value={newTask.dueDate}
            onChange={(e) => setNewTask((prev) => ({ ...prev, dueDate: e.target.value }))}
            className="rounded border border-slate-300 px-3 py-2 text-sm"
          />
          <select
            value={newTask.gtdCategory}
            onChange={(e) => setNewTask((prev) => ({ ...prev, gtdCategory: e.target.value as TaskGtdCategory }))}
            className="rounded border border-slate-300 px-3 py-2 text-sm"
          >
            {TASK_GTD_VALUES.map((category) => (
              <option key={category} value={category}>
                GTD: {TASK_GTD_LABELS[category]}
              </option>
            ))}
          </select>
          <button
            type="submit"
            disabled={saving}
            className="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60 md:col-span-2"
          >
            {saving ? '保存中...' : 'タスクを追加'}
          </button>
        </form>
      </section>

      {error && <p className="rounded border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p>}

      {loading ? (
        <p className="text-sm text-slate-500">読み込み中...</p>
      ) : (
        <>
          {viewMode === 'kanban' ? (
            <section className="grid gap-4 lg:grid-cols-4">
              {TASK_PROGRESS_ORDER.map((status) => (
                <article key={status} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                  <h2 className="mb-3 text-lg font-semibold">
                    {TASK_PROGRESS_LABELS[status]} <span className="text-sm text-slate-500">({groupedTasks[status].length})</span>
                  </h2>
                  <div className="space-y-3">
                    {groupedTasks[status].map((task) => (
                      <TaskCard
                        key={task.id}
                        task={task}
                        disabled={updatingTaskId === task.id}
                        onUpdateStatus={updateStatus}
                        onDelete={deleteTask}
                      />
                    ))}
                    {groupedTasks[status].length === 0 && <p className="text-sm text-slate-400">条件に一致するタスクはありません</p>}
                  </div>
                </article>
              ))}
            </section>
          ) : viewMode === 'matrix' ? (
            <section className="grid gap-4 md:grid-cols-2">
              {MATRIX_QUADRANTS.map((quadrant) => (
                <article key={quadrant.key} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                  <h2 className="text-lg font-semibold">{quadrant.title}</h2>
                  <p className="mb-3 text-sm text-slate-500">{quadrant.subtitle}</p>
                  <div className="space-y-3">
                    {matrixTasks[quadrant.key].map((task) => (
                      <TaskCard
                        key={task.id}
                        task={task}
                        disabled={updatingTaskId === task.id}
                        onUpdateStatus={updateStatus}
                        onDelete={deleteTask}
                      />
                    ))}
                    {matrixTasks[quadrant.key].length === 0 && <p className="text-sm text-slate-400">タスクなし</p>}
                  </div>
                </article>
              ))}
            </section>
          ) : (
            <section className="grid gap-4 md:grid-cols-2">
              {GTD_SECTIONS.map((section) => (
                <article key={section.key} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                  <h2 className="mb-3 text-lg font-semibold">
                    {section.title} <span className="text-sm text-slate-500">({gtdTasks[section.key].length})</span>
                  </h2>
                  <div className="space-y-3">
                    {gtdTasks[section.key].map((task) => (
                      <TaskCard
                        key={task.id}
                        task={task}
                        disabled={updatingTaskId === task.id}
                        onUpdateStatus={updateStatus}
                        onDelete={deleteTask}
                      />
                    ))}
                    {gtdTasks[section.key].length === 0 && <p className="text-sm text-slate-400">タスクなし</p>}
                  </div>
                </article>
              ))}
            </section>
          )}
        </>
      )}
    </main>
  );
}

type TaskCardProps = {
  task: Task;
  disabled: boolean;
  onUpdateStatus: (task: Task, status: TaskProgress) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
};

function TaskCard({ task, disabled, onUpdateStatus, onDelete }: TaskCardProps) {
  return (
    <div className="rounded border border-slate-200 p-3">
      <p className="font-medium">{task.title}</p>
      {task.description && <p className="mt-1 text-sm text-slate-600">{task.description}</p>}
      <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-600">
        {task.assignee && <span className="rounded bg-slate-100 px-2 py-1">担当: {task.assignee}</span>}
        <span className={`rounded px-2 py-1 ${levelClassName[task.importance]}`}>重要度: {IMPORTANCE_LABELS[task.importance]}</span>
        <span className={`rounded px-2 py-1 ${levelClassName[task.urgency]}`}>緊急度: {URGENCY_LABELS[task.urgency]}</span>
        <span className="rounded bg-indigo-100 px-2 py-1 text-indigo-700">GTD: {TASK_GTD_LABELS[task.gtd_category]}</span>
        {task.due_date && (
          <span className={`rounded px-2 py-1 ${isOverdue(task.due_date) ? 'bg-rose-100 text-rose-700' : 'bg-slate-100'}`}>
            期限: {task.due_date}
          </span>
        )}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {TASK_PROGRESS_ORDER.map((nextStatus) => (
          <button
            type="button"
            key={nextStatus}
            onClick={() => void onUpdateStatus(task, nextStatus)}
            disabled={disabled || task.status === nextStatus}
            className="rounded border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {TASK_PROGRESS_LABELS[nextStatus]}
          </button>
        ))}
        <button
          type="button"
          onClick={() => void onDelete(task.id)}
          disabled={disabled}
          className="rounded border border-rose-300 px-2 py-1 text-xs text-rose-700 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          削除
        </button>
      </div>
    </div>
  );
}