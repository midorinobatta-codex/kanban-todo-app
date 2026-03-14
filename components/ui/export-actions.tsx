import type { ReactNode } from 'react';

export function ExportActions({
  onExportCsv,
  onExportJson,
  label = 'Export',
  compact = true,
  extraAction,
}: {
  onExportCsv: () => void;
  onExportJson: () => void;
  label?: string;
  compact?: boolean;
  extraAction?: ReactNode;
}) {
  const wrapperClassName = compact
    ? 'inline-flex flex-wrap items-center gap-2 rounded-xl border border-blue-200 bg-blue-50/90 px-2.5 py-1.5 shadow-sm'
    : 'inline-flex flex-wrap items-center gap-2 rounded-xl border border-blue-200 bg-blue-50/90 px-3 py-2 shadow-sm';

  const csvClassName = compact
    ? 'rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-blue-700 sm:text-sm'
    : 'rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700';

  const jsonClassName = compact
    ? 'rounded-lg border border-blue-200 bg-white px-3 py-2 text-xs font-semibold text-blue-700 transition hover:bg-blue-100 sm:text-sm'
    : 'rounded-lg border border-blue-200 bg-white px-4 py-2 text-sm font-semibold text-blue-700 transition hover:bg-blue-100';

  return (
    <div className={wrapperClassName}>
      <span className="text-xs font-semibold tracking-wide text-blue-700">{label}</span>
      <button type="button" onClick={onExportCsv} className={csvClassName}>
        CSV
      </button>
      <button type="button" onClick={onExportJson} className={jsonClassName}>
        JSON
      </button>
      {extraAction}
    </div>
  );
}
