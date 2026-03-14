'use client';

import { FormEvent, useEffect, useState } from 'react';
import {
  IMPORTANCE_LABELS,
  TASK_GTD_LABELS,
  TASK_GTD_VALUES,
  TASK_IMPORTANCE_VALUES,
  TASK_PROGRESS_LABELS,
  TASK_PROGRESS_ORDER,
  TASK_URGENCY_VALUES,
  URGENCY_LABELS,
  type Task,
  type TaskGtdCategory,
  type TaskImportance,
  type TaskProgress,
  type TaskUrgency,
} from '@/lib/types';

export type TaskEditValues = {
  title: string;
  description: string;
  assignee: string;
  importance: TaskImportance;
  urgency: TaskUrgency;
  status: TaskProgress;
  dueDate: string;
  waitingResponseDate: string;
  gtdCategory: TaskGtdCategory;
  projectTaskId: string;
};

type TaskEditModalProps = {
  open: boolean;
  task: Task | null;
  projectTasks: Task[];
  saving?: boolean;
  onClose: () => void;
  onSave: (values: TaskEditValues) => Promise<void>;
  onDelete?: () => Promise<void>;
};

function buildInitialValues(task: Task): TaskEditValues {
  return {
    title: task.title,
    description: task.description ?? '',
    assignee: task.assignee ?? '',
    importance: task.importance,
    urgency: task.urgency,
    status: task.status,
    dueDate: task.due_date ?? '',
    waitingResponseDate: task.waiting_response_date ?? '',
    gtdCategory: task.gtd_category,
    projectTaskId: task.project_task_id ?? '',
  };
}

export function TaskEditModal({
  open,
  task,
  projectTasks,
  saving = false,
  onClose,
  onSave,
  onDelete,
}: TaskEditModalProps) {
  const [values, setValues] = useState<TaskEditValues | null>(null);

  useEffect(() => {
    if (open && task) {
      setValues(buildInitialValues(task));
    }
  }, [open, task]);

  if (!open || !task || !values) return null;

  const selectableProjects = projectTasks.filter((projectTask) => projectTask.id !== task.id);
  const showWaitingResponseDate = values.status === 'waiting';

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!values.title.trim()) return;

    await onSave({
      ...values,
      title: values.title.trim(),
      description: values.description,
      assignee: values.assignee,
      waitingResponseDate: values.status === 'waiting' ? values.waitingResponseDate : '',
      projectTaskId: values.gtdCategory === 'next_action' ? values.projectTaskId : '',
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <div className="w-full max-w-3xl rounded-xl border border-slate-200 bg-white p-5 shadow-xl">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">タスク編集</h2>
            <p className="text-sm text-slate-500">内容を更新して保存します。</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded border border-slate-300 px-3 py-2 text-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            閉じる
          </button>
        </div>

        <form onSubmit={(e) => void handleSubmit(e)} className="grid gap-3 md:grid-cols-2">
          <input
            value={values.title}
            onChange={(e) =>
              setValues((prev) => (prev ? { ...prev, title: e.target.value } : prev))
            }
            required
            placeholder="タイトル"
            className="rounded border border-slate-300 px-3 py-2 text-sm"
          />

          <input
            value={values.assignee}
            onChange={(e) =>
              setValues((prev) => (prev ? { ...prev, assignee: e.target.value } : prev))
            }
            placeholder="担当者"
            className="rounded border border-slate-300 px-3 py-2 text-sm"
          />

          <textarea
            value={values.description}
            onChange={(e) =>
              setValues((prev) => (prev ? { ...prev, description: e.target.value } : prev))
            }
            placeholder="説明"
            rows={4}
            className="rounded border border-slate-300 px-3 py-2 text-sm md:col-span-2"
          />

          <select
            value={values.status}
            onChange={(e) =>
              setValues((prev) => {
                if (!prev) return prev;
                const nextStatus = e.target.value as TaskProgress;
                return {
                  ...prev,
                  status: nextStatus,
                  waitingResponseDate:
                    nextStatus === 'waiting' ? prev.waitingResponseDate : '',
                };
              })
            }
            className="rounded border border-slate-300 px-3 py-2 text-sm"
          >
            {TASK_PROGRESS_ORDER.map((value) => (
              <option key={value} value={value}>
                進捗: {TASK_PROGRESS_LABELS[value]}
              </option>
            ))}
          </select>

          <input
            type="date"
            value={values.dueDate}
            onChange={(e) =>
              setValues((prev) => (prev ? { ...prev, dueDate: e.target.value } : prev))
            }
            className="rounded border border-slate-300 px-3 py-2 text-sm"
          />

          {showWaitingResponseDate ? (
            <div className="md:col-span-2">
              <label className="mb-1 block text-sm font-medium text-slate-700">回答予定日</label>
              <input
                type="date"
                value={values.waitingResponseDate}
                onChange={(e) =>
                  setValues((prev) =>
                    prev ? { ...prev, waitingResponseDate: e.target.value } : prev,
                  )
                }
                className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
              />
              <p className="mt-1 text-xs text-slate-500">
                待ちの解除見込み日、または再確認したい日を設定します。
              </p>
            </div>
          ) : null}

          <select
            value={values.importance}
            onChange={(e) =>
              setValues((prev) =>
                prev ? { ...prev, importance: e.target.value as TaskImportance } : prev
              )
            }
            className="rounded border border-slate-300 px-3 py-2 text-sm"
          >
            {TASK_IMPORTANCE_VALUES.map((value) => (
              <option key={value} value={value}>
                重要度: {IMPORTANCE_LABELS[value]}
              </option>
            ))}
          </select>

          <select
            value={values.urgency}
            onChange={(e) =>
              setValues((prev) =>
                prev ? { ...prev, urgency: e.target.value as TaskUrgency } : prev
              )
            }
            className="rounded border border-slate-300 px-3 py-2 text-sm"
          >
            {TASK_URGENCY_VALUES.map((value) => (
              <option key={value} value={value}>
                緊急度: {URGENCY_LABELS[value]}
              </option>
            ))}
          </select>

          <select
            value={values.gtdCategory}
            onChange={(e) =>
              setValues((prev) => {
                if (!prev) return prev;
                const gtdCategory = e.target.value as TaskGtdCategory;
                return {
                  ...prev,
                  gtdCategory,
                  projectTaskId: gtdCategory === 'next_action' ? prev.projectTaskId : '',
                };
              })
            }
            className="rounded border border-slate-300 px-3 py-2 text-sm md:col-span-2"
          >
            {TASK_GTD_VALUES.map((value) => (
              <option key={value} value={value}>
                GTD: {TASK_GTD_LABELS[value]}
              </option>
            ))}
          </select>

          {values.gtdCategory === 'next_action' && (
            <select
              value={values.projectTaskId}
              onChange={(e) =>
                setValues((prev) => (prev ? { ...prev, projectTaskId: e.target.value } : prev))
              }
              className="rounded border border-slate-300 px-3 py-2 text-sm md:col-span-2"
            >
              <option value="">関連プロジェクト: 未設定</option>
              {selectableProjects.map((projectTask) => (
                <option key={projectTask.id} value={projectTask.id}>
                  関連プロジェクト: {projectTask.title}
                </option>
              ))}
            </select>
          )}

          <div className="flex justify-between gap-2 pt-2 md:col-span-2">
            <div>
              {onDelete ? (
                <button
                  type="button"
                  onClick={() => void onDelete()}
                  disabled={saving}
                  className="rounded border border-rose-300 px-4 py-2 text-sm text-rose-700 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  削除
                </button>
              ) : null}
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClose}
                disabled={saving}
                className="rounded border border-slate-300 px-4 py-2 text-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                キャンセル
              </button>
              <button
                type="submit"
                disabled={saving}
                className="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving ? '保存中...' : '保存'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
