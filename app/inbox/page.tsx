'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Session } from '@supabase/supabase-js';
import { getSupabaseClient } from '@/lib/supabase/client';
import { useTasks } from '@/lib/hooks/use-tasks';
import type { Task } from '@/lib/types';
import { buildClarifyQueue, getSuggestedDelegatedDate, type ClarifyDestination } from '@/lib/tasks/clarify';

export default function InboxPage() {
  const [session, setSession] = useState<Session | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [ownerInput, setOwnerInput] = useState('');
  const router = useRouter();
  const { tasks, isLoading, error, reload } = useTasks();

  useEffect(() => {
    const supabase = getSupabaseClient();
    void supabase.auth.getSession().then(({ data }) => {
      setSession(data.session ?? null);
      setAuthLoading(false);
    });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession ?? null);
      setAuthLoading(false);
    });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!authLoading && !session) {
      router.replace('/login');
    }
  }, [authLoading, router, session]);

  const clarifyQueue = useMemo(() => buildClarifyQueue(tasks), [tasks]);
  const currentTask = clarifyQueue[0] ?? null;

  const applyClarifyAction = async (task: Task, destination: ClarifyDestination) => {
    setSaving(true);
    setNotice(null);

    if (destination === 'trash') {
      const { error: deleteError } = await getSupabaseClient().from('tasks').delete().eq('id', task.id);
      if (deleteError) {
        setNotice(deleteError.message);
        setSaving(false);
        return;
      }
      setNotice(`「${task.title}」を削除しました。`);
      setOwnerInput('');
      await reload();
      setSaving(false);
      return;
    }

    let patch: Record<string, unknown> = {};
    if (destination === 'next_action') patch = { gtd_category: 'next_action', status: 'todo', waiting_response_date: null };
    if (destination === 'project') patch = { gtd_category: 'project', status: 'todo', project_task_id: null, waiting_response_date: null };
    if (destination === 'delegated') {
      patch = {
        gtd_category: 'delegated',
        status: 'waiting',
        assignee: ownerInput.trim() || task.assignee || null,
        waiting_response_date: getSuggestedDelegatedDate(task),
      };
    }
    if (destination === 'someday') patch = { gtd_category: 'someday', status: 'todo', waiting_response_date: null };
    if (destination === 'done') patch = { status: 'done', waiting_response_date: null };

    const { error: updateError } = await getSupabaseClient().from('tasks').update(patch).eq('id', task.id);
    if (updateError) {
      setNotice(updateError.message);
      setSaving(false);
      return;
    }

    setNotice(`「${task.title}」を ${destination} に整理しました。`);
    setOwnerInput('');
    await reload();
    setSaving(false);
  };

  useEffect(() => {
    if (!currentTask) return;

    const handleKeydown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      const isTyping = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target?.isContentEditable;
      if (isTyping) return;

      const key = event.key.toLowerCase();
      if (key === 'n') void applyClarifyAction(currentTask, 'next_action');
      if (key === 'p') void applyClarifyAction(currentTask, 'project');
      if (key === 'w') void applyClarifyAction(currentTask, 'delegated');
      if (key === 's') void applyClarifyAction(currentTask, 'someday');
      if (key === 'd') void applyClarifyAction(currentTask, 'done');
      if (event.key === 'Delete' || event.key === 'Backspace') void applyClarifyAction(currentTask, 'trash');
    };

    window.addEventListener('keydown', handleKeydown);
    return () => window.removeEventListener('keydown', handleKeydown);
  }, [currentTask, ownerInput, tasks]);

  if (authLoading || !session) {
    return <main className="flex min-h-screen items-center justify-center text-slate-500">認証状態を確認しています...</main>;
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-6 px-4 py-6 sm:px-6">
      <header className="rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-semibold text-slate-900">Clarify</h1>
              <span className="rounded-full bg-blue-50 px-2.5 py-1 text-[11px] font-semibold text-blue-700">Inbox 専用</span>
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-600">残り {clarifyQueue.length}件</span>
            </div>
            <p className="mt-1 text-sm text-slate-600">未整理タスクを 1 件ずつ軽く判断し、Board を重くせず前に進めます。</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link href="/meeting-import" className="rounded-lg border border-violet-300 bg-violet-50 px-3 py-2 text-sm font-medium text-violet-700 hover:bg-violet-100">会議メモ取込</Link>
            <Link href="/waiting" className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">Waiting</Link>
            <Link href="/" className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">Board</Link>
          </div>
        </div>
      </header>

      {notice ? <p className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-700">{notice}</p> : null}
      {error ? <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p> : null}

      {isLoading ? (
        <section className="rounded-2xl border border-slate-200 bg-white px-5 py-10 text-center text-slate-500 shadow-sm">Inbox を読み込み中です...</section>
      ) : currentTask ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-3">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">1 / {clarifyQueue.length}</div>
              <h2 className="text-2xl font-semibold text-slate-900">{currentTask.title}</h2>
              <p className="text-sm text-slate-500">タイトルだけで入ったタスクを、その場で次アクション / project / waiting / someday に振り分けます。</p>
            </div>
            <button type="button" onClick={() => router.push('/')} className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50">今は判断しない</button>
          </div>

          <div className="mt-6 grid gap-3 md:grid-cols-2">
            <ActionButton label="N 次アクション化" hint="Board にそのまま戻せる最小変換" onClick={() => void applyClarifyAction(currentTask, 'next_action')} disabled={saving} />
            <ActionButton label="P Project 化" hint="タイトルを引き継いで最小構成の project にする" onClick={() => void applyClarifyAction(currentTask, 'project')} disabled={saving} />
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
              <label className="mb-2 block text-xs font-semibold text-amber-900">W Waiting / Delegated</label>
              <input value={ownerInput} onChange={(event) => setOwnerInput(event.target.value)} placeholder="誰待ちか（任意）" className="w-full rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm" />
              <button type="button" onClick={() => void applyClarifyAction(currentTask, 'delegated')} disabled={saving} className="mt-2 w-full rounded-lg bg-amber-600 px-3 py-2 text-sm font-medium text-white hover:bg-amber-500 disabled:opacity-60">W Waiting にする</button>
              <p className="mt-1 text-xs text-amber-800">相手が空でも保存できます。回答予定日は自動で補います。</p>
            </div>
            <ActionButton label="S Someday / Later" hint="今はやらないが残しておく" onClick={() => void applyClarifyAction(currentTask, 'someday')} disabled={saving} />
            <ActionButton label="D 完了" hint="もう処理済みなら done にする" onClick={() => void applyClarifyAction(currentTask, 'done')} disabled={saving} />
            <ActionButton label="⌫ 削除" hint="不要なら捨てる" tone="danger" onClick={() => void applyClarifyAction(currentTask, 'trash')} disabled={saving} />
          </div>

          <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600">
            キーボードの雰囲気: N / P / W / S / D / Delete に相当する最小操作を優先。重いフォームは出しません。
          </div>
        </section>
      ) : (
        <section className="rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-10 text-center shadow-sm">
          <h2 className="text-xl font-semibold text-emerald-900">Inbox は空です</h2>
          <p className="mt-2 text-sm text-emerald-800">未整理タスクをひと通り判断できました。Board に戻って今日の実行に集中できます。</p>
          <div className="mt-4">
            <Link href="/" className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-600">Board へ戻る</Link>
          </div>
        </section>
      )}
    </main>
  );
}

function ActionButton({
  label,
  hint,
  tone = 'default',
  onClick,
  disabled,
}: {
  label: string;
  hint: string;
  tone?: 'default' | 'danger';
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`rounded-xl border px-4 py-3 text-left transition disabled:cursor-not-allowed disabled:opacity-60 ${
        tone === 'danger'
          ? 'border-rose-200 bg-rose-50 hover:bg-rose-100'
          : 'border-slate-200 bg-white hover:bg-slate-50'
      }`}
    >
      <div className="text-sm font-semibold text-slate-900">{label}</div>
      <div className="mt-1 text-xs text-slate-600">{hint}</div>
    </button>
  );
}
