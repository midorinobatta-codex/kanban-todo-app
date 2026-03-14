import { formatHistoryTime, scopeLabel, type TaskHistoryEntry } from '@/lib/tasks/history';

const toneClassName = {
  neutral: 'border-slate-200 bg-slate-50 text-slate-700',
  info: 'border-blue-200 bg-blue-50 text-blue-700',
  warning: 'border-amber-200 bg-amber-50 text-amber-700',
  danger: 'border-rose-200 bg-rose-50 text-rose-700',
  success: 'border-emerald-200 bg-emerald-50 text-emerald-700',
} as const;

export function HistoryPanel({
  title = '履歴',
  entries,
  onClear,
  onExportCsv,
  onExportJson,
  emptyLabel = 'まだ履歴はありません。',
  maxItems = 8,
  defaultCollapsed = true,
}: {
  title?: string;
  entries: TaskHistoryEntry[];
  onClear: () => void;
  onExportCsv: () => void;
  onExportJson: () => void;
  emptyLabel?: string;
  maxItems?: number;
  defaultCollapsed?: boolean;
}) {
  const visibleEntries = entries.slice(0, maxItems);

  return (
    <details open={!defaultCollapsed} className="group rounded-2xl bg-slate-50/70 shadow-sm ring-1 ring-slate-200/80">
      <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-3 px-4 py-3 marker:hidden [&::-webkit-details-marker]:hidden">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-600">
              {entries.length}件
            </span>
            <span className="text-[11px] text-slate-500">必要な時だけ見る</span>
          </div>
        </div>
        <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-600 transition group-open:bg-slate-100">
          <span className="group-open:hidden">開く</span>
          <span className="hidden group-open:inline">閉じる</span>
        </span>
      </summary>

      <div className="border-t border-slate-100 px-4 pb-4 pt-3">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onExportCsv}
            className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-blue-700 sm:text-sm"
          >
            CSV
          </button>
          <button
            type="button"
            onClick={onExportJson}
            className="rounded-lg border border-blue-200 bg-white px-3 py-2 text-xs font-semibold text-blue-700 transition hover:bg-blue-100 sm:text-sm"
          >
            JSON
          </button>
          <button
            type="button"
            onClick={onClear}
            disabled={entries.length === 0}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 sm:text-sm"
          >
            履歴をクリア
          </button>
        </div>

        {visibleEntries.length === 0 ? (
          <div className="mt-4 rounded-2xl bg-white px-4 py-5 text-sm text-slate-500 ring-1 ring-dashed ring-slate-300">
            <><div className="text-base">🗂</div><div className="mt-1">{emptyLabel}</div></>
          </div>
        ) : (
          <div className="mt-4 space-y-2">
            {visibleEntries.map((entry) => (
              <article key={entry.id} className="rounded-xl bg-white p-3 shadow-sm ring-1 ring-slate-200/80">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`rounded-full border px-2.5 py-1 text-[11px] font-medium ${toneClassName[entry.tone ?? 'neutral']}`}>
                    {entry.summary}
                  </span>
                  <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-medium text-slate-600">
                    {scopeLabel(entry.scope)}
                  </span>
                  <span className="text-[11px] text-slate-500">{formatHistoryTime(entry.createdAt)}</span>
                </div>
                {entry.detail ? <p className="mt-2 text-xs text-slate-600">{entry.detail}</p> : null}
              </article>
            ))}
          </div>
        )}
      </div>
    </details>
  );
}
