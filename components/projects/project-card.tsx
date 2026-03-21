'use client';

import Link from 'next/link';
import { useState } from 'react';
import type { Project } from '@/lib/domain/project';

type ProjectCardProps = {
  project: Project;
  onDelete: (projectId: string) => Promise<void>;
};

export function ProjectCard({ project, onDelete }: ProjectCardProps) {
  const [isDeleting, setIsDeleting] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  async function handleDelete() {
    const confirmed = window.confirm(
      `「${project.title}」を削除しますか？\n紐づく次アクション自体は削除されず、関連プロジェクトが未設定に戻ります。`,
    );

    if (!confirmed) {
      return;
    }

    setIsDeleting(true);
    setLocalError(null);

    try {
      await onDelete(project.id);
    } catch (error) {
      if (error instanceof Error) {
        setLocalError(error.message);
      } else {
        setLocalError('プロジェクトの削除に失敗しました');
      }
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-slate-300 hover:shadow">
      <div className="flex items-start justify-between gap-3">
        <Link href={`/projects/${project.id}`} className="min-w-0 flex-1">
          <h3 className="truncate text-base font-semibold text-slate-900">
            {project.title}
          </h3>

          {project.description ? (
            <p className="mt-2 line-clamp-2 text-sm text-slate-600">
              {project.description}
            </p>
          ) : (
            <p className="mt-2 text-sm text-slate-500">説明は未設定です。</p>
          )}
        </Link>

        <div className="shrink-0 rounded-full bg-slate-100 px-3 py-1 text-sm font-medium text-slate-700">
          {project.completionRate}%
        </div>
      </div>

      <div className="mt-4">
        <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200">
          <div
            className="h-full rounded-full bg-slate-900 transition-all"
            style={{ width: `${project.completionRate}%` }}
          />
        </div>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2 text-xs">
        <div className="rounded-lg bg-slate-50 px-3 py-2">
          <p className="text-slate-500">進める一手</p>
          <p className="mt-1 font-semibold text-slate-900">
            {project.nextActionCount}件
          </p>
        </div>

        <div className="rounded-lg bg-emerald-50 px-3 py-2">
          <p className="text-emerald-700">関連タスク / 完了</p>
          <p className="mt-1 font-semibold text-emerald-800">
            {project.linkedTaskCount}件 / {project.doneCount}件
          </p>
        </div>

        <div className="rounded-lg bg-rose-50 px-3 py-2">
          <p className="text-rose-700">期限超過</p>
          <p className="mt-1 font-semibold text-rose-800">
            {project.overdueCount}件
          </p>
        </div>
      </div>

      {localError ? (
        <p className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {localError}
        </p>
      ) : null}

      <div className="mt-4 flex justify-between gap-2">
        <Link
          href={`/projects/${project.id}`}
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 transition hover:bg-slate-50"
        >
          詳細
        </Link>

        <button
          type="button"
          onClick={() => void handleDelete()}
          disabled={isDeleting}
          className="rounded-lg border border-rose-300 bg-white px-3 py-2 text-sm text-rose-700 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isDeleting ? '削除中...' : '削除'}
        </button>
      </div>
    </article>
  );
}
