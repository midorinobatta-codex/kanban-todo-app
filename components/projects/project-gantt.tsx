'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import type { Project } from '@/lib/domain/project';
import { TASK_PROGRESS_LABELS } from '@/lib/types';

const DAY_MS = 24 * 60 * 60 * 1000;
const TRACK_CLASS_NAME =
  'relative h-4 overflow-hidden rounded-full bg-slate-100 ring-1 ring-inset ring-slate-200';

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function parseDateOnly(value: string): Date {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function parseTimestampToDay(value: string): Date {
  return startOfDay(new Date(value));
}

function diffInDays(from: Date, to: Date): number {
  return Math.round((startOfDay(to).getTime() - startOfDay(from).getTime()) / DAY_MS);
}

function addDays(base: Date, days: number): Date {
  const next = new Date(base);
  next.setDate(next.getDate() + days);
  return startOfDay(next);
}

function formatDate(date: Date): string {
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

function formatDateOnlyLabel(value: string | null): string {
  if (!value) return '未設定';
  return value;
}

function formatStartedAtLabel(value: string | null): string {
  if (!value) return '未記録';

  const date = new Date(value);
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function isDueDateOverdue(project: Project): boolean {
  if (!project.dueDate || project.status === 'done') {
    return false;
  }

  return parseDateOnly(project.dueDate) < startOfDay(new Date());
}

function getBarClassName(project: Project): string {
  if (isDueDateOverdue(project)) {
    return 'bg-rose-500';
  }

  switch (project.status) {
    case 'done':
      return 'bg-emerald-500';
    case 'doing':
      return 'bg-indigo-500';
    case 'waiting':
      return 'bg-amber-500';
    case 'todo':
    default:
      return 'bg-slate-500';
  }
}

type ProjectGanttProps = {
  projects: Project[];
};

export function ProjectGantt({ projects }: ProjectGanttProps) {
  const ganttProjects = useMemo(
    () =>
      [...projects]
        .filter((project) => project.startedAt && project.dueDate)
        .sort((a, b) => {
          const dueDiff = (a.dueDate ?? '').localeCompare(b.dueDate ?? '');
          if (dueDiff !== 0) {
            return dueDiff;
          }
          return (a.startedAt ?? '').localeCompare(b.startedAt ?? '');
        }),
    [projects],
  );

  const dueWithoutStartProjects = useMemo(
    () =>
      [...projects]
        .filter((project) => !project.startedAt && project.dueDate)
        .sort((a, b) => (a.dueDate ?? '').localeCompare(b.dueDate ?? '')),
    [projects],
  );

  const noDueDateProjects = useMemo(
    () => [...projects].filter((project) => !project.dueDate).sort((a, b) => a.title.localeCompare(b.title, 'ja')),
    [projects],
  );

  const range = useMemo(() => {
    if (ganttProjects.length === 0) {
      return null;
    }

    const starts = ganttProjects.map((project) => parseTimestampToDay(project.startedAt as string));
    const ends = ganttProjects.map((project) => parseDateOnly(project.dueDate as string));

    const minStart = starts.reduce((min, current) => (current < min ? current : min), starts[0]);
    const maxEnd = ends.reduce((max, current) => (current > max ? current : max), ends[0]);
    const totalDays = Math.max(diffInDays(minStart, maxEnd) + 1, 1);
    const today = startOfDay(new Date());
    const todayOffset = diffInDays(minStart, today);
    const todayInRange = todayOffset >= 0 && todayOffset < totalDays;

    const tickDates: Date[] = [];
    for (let offset = 0; offset < totalDays; offset += 7) {
      tickDates.push(addDays(minStart, offset));
    }

    const lastTick = tickDates[tickDates.length - 1];
    if (!lastTick || diffInDays(lastTick, maxEnd) > 0) {
      tickDates.push(maxEnd);
    }

    return {
      start: minStart,
      end: maxEnd,
      totalDays,
      tickDates,
      todayOffset,
      todayInRange,
    };
  }, [ganttProjects]);

  if (projects.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
        表示できるプロジェクトはまだありません。
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-slate-900">ガント表示</h3>
            <p className="mt-1 text-sm text-slate-500">
              開始日は、プロジェクトが初めて「進行中」になった日を使います。
            </p>
          </div>

          {range ? (
            <div className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-600">
              {formatDate(range.start)} - {formatDate(range.end)}
            </div>
          ) : null}
        </div>

        {range && ganttProjects.length > 0 ? (
          <div className="mt-4 overflow-x-auto">
            <div className="min-w-[880px]">
              <div className="grid grid-cols-[240px_minmax(0,1fr)_120px] gap-3 border-b border-slate-200 pb-3 text-xs text-slate-500">
                <div>プロジェクト</div>
                <div className="relative h-9">
                  {range.tickDates.map((tickDate) => {
                    const offset = diffInDays(range.start, tickDate);
                    const left = (offset / range.totalDays) * 100;
                    return (
                      <div
                        key={tickDate.toISOString()}
                        className="absolute top-0 -translate-x-1/2"
                        style={{ left: `${left}%` }}
                      >
                        <div className="h-4 border-l border-slate-200" />
                        <span>{formatDate(tickDate)}</span>
                      </div>
                    );
                  })}

                  {range.todayInRange ? (
                    <div
                      className="absolute inset-y-0 z-10 border-l-2 border-rose-400"
                      style={{ left: `${(range.todayOffset / range.totalDays) * 100}%` }}
                    >
                      <span className="absolute left-1 top-0 rounded bg-rose-50 px-1.5 py-0.5 text-[10px] font-medium text-rose-600">
                        今日
                      </span>
                    </div>
                  ) : null}
                </div>
                <div className="text-right">期限</div>
              </div>

              <div className="mt-4 space-y-4">
                {ganttProjects.map((project) => {
                  const start = parseTimestampToDay(project.startedAt as string);
                  const due = parseDateOnly(project.dueDate as string);
                  const offsetDays = diffInDays(range.start, start);
                  const durationDays = Math.max(diffInDays(start, due) + 1, 1);
                  const left = (offsetDays / range.totalDays) * 100;
                  const width = Math.max((durationDays / range.totalDays) * 100, 2);
                  const dueOverdue = isDueDateOverdue(project);

                  return (
                    <div
                      key={project.id}
                      className="grid grid-cols-[240px_minmax(0,1fr)_120px] items-center gap-3"
                    >
                      <div className="min-w-0">
                        <Link
                          href={`/projects/${project.id}`}
                          className="truncate text-sm font-medium text-slate-900 hover:text-slate-700"
                        >
                          {project.title}
                        </Link>
                        <div className="mt-1 flex flex-wrap gap-2 text-[11px] text-slate-500">
                          <span className="rounded-full bg-slate-100 px-2 py-0.5">
                            {TASK_PROGRESS_LABELS[project.status]}
                          </span>
                          <span>開始: {formatStartedAtLabel(project.startedAt)}</span>
                          <span>完了率: {project.completionRate}%</span>
                        </div>
                      </div>

                      <div className="relative h-10">
                        <div className={`${TRACK_CLASS_NAME} absolute inset-x-0 top-3`} />
                        {range.todayInRange ? (
                          <div
                            className="absolute inset-y-0 z-10 border-l-2 border-rose-400/80"
                            style={{ left: `${(range.todayOffset / range.totalDays) * 100}%` }}
                          />
                        ) : null}
                        <div
                          className={`absolute top-3 h-4 rounded-full ${getBarClassName(project)}`}
                          style={{
                            left: `${left}%`,
                            width: `${Math.min(width, 100 - left)}%`,
                          }}
                        />
                      </div>

                      <div className="text-right text-sm">
                        <p className={dueOverdue ? 'font-medium text-rose-600' : 'text-slate-700'}>
                          {formatDateOnlyLabel(project.dueDate)}
                        </p>
                        <p className="text-[11px] text-slate-500">進める一手 {project.nextActionCount}件</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        ) : (
          <div className="mt-4 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-sm text-slate-500">
            開始日と期限がそろったプロジェクトがまだないため、ガント表示はありません。
          </div>
        )}
      </section>

      {dueWithoutStartProjects.length > 0 ? (
        <section className="rounded-2xl border border-amber-200 bg-amber-50/60 p-4 shadow-sm">
          <h3 className="text-sm font-semibold text-amber-900">開始日未記録</h3>
          <p className="mt-1 text-sm text-amber-800">
            期限はありますが、まだ「進行中」へ移行していないか、開始日導入前のデータです。
          </p>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            {dueWithoutStartProjects.map((project) => (
              <div key={project.id} className="rounded-xl border border-amber-200 bg-white px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                  <Link href={`/projects/${project.id}`} className="text-sm font-medium text-slate-900 hover:text-slate-700">
                    {project.title}
                  </Link>
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] text-amber-800">
                    {TASK_PROGRESS_LABELS[project.status]}
                  </span>
                </div>
                <div className="mt-2 text-xs text-slate-600">
                  <p>期限: {formatDateOnlyLabel(project.dueDate)}</p>
                  <p>開始日: 未記録</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {noDueDateProjects.length > 0 ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-900">期限未設定</h3>
          <p className="mt-1 text-sm text-slate-500">
            期限を設定すると、ガント表示に載せられます。
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {noDueDateProjects.map((project) => (
              <Link
                key={project.id}
                href={`/projects/${project.id}`}
                className="rounded-full border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
              >
                {project.title}
              </Link>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
