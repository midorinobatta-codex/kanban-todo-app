'use client';

import { FormEvent, useRef, useState } from 'react';
import type { CreateProjectInput } from '@/lib/domain/project';

type ProjectFormProps = {
  onSubmit: (input: CreateProjectInput) => Promise<void>;
};

export function ProjectForm({ onSubmit }: ProjectFormProps) {
  const [title, setTitle] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const titleInputRef = useRef<HTMLInputElement | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmedTitle = title.trim();

    if (!trimmedTitle) {
      setError('プロジェクト名を入力してください');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      await onSubmit({ title: trimmedTitle });
      setTitle('');
      titleInputRef.current?.focus();
    } catch (err) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('プロジェクトの作成に失敗しました');
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
    >
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-slate-900">Add project</h2>
        <p className="mt-1 text-sm text-slate-600">
          GTD分類が「project」のタスクとして作成します。
        </p>
      </div>

      <label className="grid gap-2">
        <span className="text-sm font-medium text-slate-700">Project name</span>
        <input
          ref={titleInputRef}
          type="text"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="例: 展示会準備"
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-slate-500"
          autoFocus
          maxLength={100}
        />
      </label>

      {error ? (
        <p className="mt-4 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </p>
      ) : null}

      <div className="mt-4 flex justify-end">
        <button
          type="submit"
          disabled={isSubmitting}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isSubmitting ? 'Saving...' : 'Add project'}
        </button>
      </div>
    </form>
  );
}