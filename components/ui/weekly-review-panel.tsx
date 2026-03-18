'use client';

import { useEffect, useMemo, useState } from 'react';
import type { Task } from '@/lib/types';
import { ExportActions } from '@/components/ui/export-actions';
import {
  buildWeeklyReview,
  formatMinutesAsHours,
  type WeeklyReviewResult,
} from '@/lib/tasks/weekly-review';
import { getWeeklyReviewNote, setWeeklyReviewNote } from '@/lib/tasks/weekly-review-storage';
import {
  buildWeeklyReviewExportRows,
  buildWeeklyReviewJsonPayload,
  downloadCsv,
  downloadJson,
} from '@/lib/tasks/export';

type WeeklyReviewPanelProps = {
  tasks: Task[];
  sessions: unknown[];
  adjustments?: unknown[];
  projectTaskMap?: Record<string, Task>;
  referenceDate?: Date;
  title?: string;
  className?: string;
};

export function WeeklyReviewPanel({
  tasks,
  sessions,
  adjustments = [],
  projectTaskMap,
  referenceDate = new Date(),
  title = '週次レビュー',
  className = '',
}: WeeklyReviewPanelProps) {
  const review = useMemo(
    () =>
      buildWeeklyReview({
        tasks,
        sessions,
        adjustments,
        projectTaskMap,
        referenceDate,
      }),
    [tasks, sessions, adjustments, projectTaskMap, referenceDate],
  );

  const [note, setNote] = useState('');

  useEffect(() => {
    setNote(getWeeklyReviewNote(review.weekStart));
  }, [review.weekStart]);

  const handleNoteChange = (value: string) => {
    setNote(value);
    setWeeklyReviewNote(review.weekStart, value);
  };

  const handleExportCsv = () => {
    downloadCsv(
      `flowfocus-weekly-review-${review.weekStart}`,
      buildWeeklyReviewExportRows(review, note),
    );
  };

  const handleExportJson = () => {
    downloadJson(
      `flowfocus-weekly-review-${review.weekStart}`,
      buildWeeklyReviewJsonPayload(review, note),
    );
  };

  const hasAnyActivity =
    review.totalMinutes > 0 ||
    review.completedCount > 0 ||
    review.sessionCount > 0 ||
    review.adjustmentCount > 0;

  return (
    <section className={`rounded-2xl border border-slate-200 bg-white p-4 shadow-sm ${className}`}>
      <div className="flex flex-col gap-3 border-b border-slate-200 pb-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h3 className="text-base font-semibold text-slate-900">{title}</h3>
          <p className="mt-1 text-xs text-slate-500">
            {review.weekLabel}
            <span className="ml-2">見やすさ優先で自動集計</span>
          </p>
        </div>

        <ExportActions
          onExportCsv={handleExportCsv}
          onExportJson={handleExportJson}
          label="週次Export"
          compact
        />
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard label="週の合計作業時間" value={formatMinutesAsHours(review.totalMinutes)} emphasis />
        <SummaryCard label="週内の完了件数" value={`${review.completedCount}件`} />
        <SummaryCard label="作業セッション件数" value={`${review.sessionCount}件`} />
        <SummaryCard label="補正入力件数" value={`${review.adjustmentCount}件`} />
      </div>

      {!hasAnyActivity ? (
        <div className="mt-4 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-sm text-slate-500">
          今週の作業ログがまだありません。セッションや補正が入ると自動で週次レビューに反映されます。
        </div>
      ) : null}

      <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,0.9fr)]">
        <TopListCard
          title="タスク別の工数上位"
          emptyLabel="今週はタスク別の工数記録がありません"
          items={review.taskTopItems}
        />
        <TopListCard
          title="project別の工数上位"
          emptyLabel="今週はproject別の工数記録がありません"
          items={review.projectTopItems}
        />
        <TrendCard review={review} />
      </div>

      <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50/70 p-4">
        <div className="flex items-center justify-between gap-2">
          <label htmlFor={`weekly-review-note-${review.weekStart}`} className="text-sm font-semibold text-slate-900">
            来週に向けた振り返りメモ
          </label>
          <span className="text-[11px] text-slate-500">週ごとに端末ローカル保存</span>
        </div>
        <textarea
          id={`weekly-review-note-${review.weekStart}`}
          value={note}
          onChange={(event) => handleNoteChange(event.target.value)}
          placeholder="例: waiting の催促を前倒しする / project の次アクション定義を早める / 高工数タスクを分割する"
          className="mt-3 min-h-[104px] w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-amber-400 focus:ring-2 focus:ring-amber-200"
        />
        <p className="mt-2 text-[11px] text-slate-500">
          このメモは CSV / JSON エクスポートにも含まれます。
        </p>
      </div>
    </section>
  );
}

function SummaryCard({
  label,
  value,
  emphasis = false,
}: {
  label: string;
  value: string;
  emphasis?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border px-4 py-3 shadow-sm ${
        emphasis
          ? 'border-blue-200 bg-blue-50'
          : 'border-slate-200 bg-slate-50'
      }`}
    >
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className={`mt-1 text-lg font-semibold ${emphasis ? 'text-blue-700' : 'text-slate-900'}`}>{value}</p>
    </div>
  );
}

function TopListCard({
  title,
  items,
  emptyLabel,
}: {
  title: string;
  items: WeeklyReviewResult['taskTopItems'];
  emptyLabel: string;
}) {
  return (
    <section className="rounded-xl border border-slate-200 bg-slate-50 p-4">
      <h4 className="text-sm font-semibold text-slate-900">{title}</h4>

      {items.length === 0 ? (
        <p className="mt-3 text-sm text-slate-500">{emptyLabel}</p>
      ) : (
        <ol className="mt-3 space-y-2">
          {items.map((item, index) => (
            <li
              key={`${title}-${item.id}`}
              className="flex items-start justify-between gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2"
            >
              <div className="min-w-0">
                <p className="text-xs font-semibold text-slate-400">#{index + 1}</p>
                <p className="truncate text-sm font-medium text-slate-900">{item.title}</p>
                <p className="mt-0.5 text-[11px] text-slate-500">
                  セッション {item.sessionCount}件
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-sm font-semibold text-slate-900">{formatMinutesAsHours(item.minutes)}</p>
                <p className="text-[11px] text-slate-500">{item.minutes}分</p>
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function TrendCard({ review }: { review: WeeklyReviewResult }) {
  const nonZeroTrends = review.stallTrends.filter((item) => item.count > 0);

  return (
    <section className="rounded-xl border border-slate-200 bg-slate-50 p-4">
      <h4 className="text-sm font-semibold text-slate-900">止まり案件の発生傾向</h4>

      {nonZeroTrends.length === 0 ? (
        <p className="mt-3 text-sm text-slate-500">今週は目立つ停滞傾向はありません。</p>
      ) : (
        <div className="mt-3 space-y-2">
          {nonZeroTrends.map((item) => (
            <div
              key={item.key}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2"
            >
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-medium text-slate-900">{item.label}</p>
                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">
                  {item.count}件
                </span>
              </div>
              <p className="mt-1 text-[11px] text-slate-500">{item.detail}</p>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}