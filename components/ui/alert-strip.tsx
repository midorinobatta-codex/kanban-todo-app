import type { ReactNode } from 'react';

export type AlertTone = 'neutral' | 'info' | 'warning' | 'danger' | 'success';

export type AlertStripItem = {
  id: string;
  label: string;
  description?: string;
  count?: string | number;
  tone?: AlertTone;
  href?: string;
};

const toneClassName: Record<AlertTone, string> = {
  neutral: 'bg-slate-50 text-slate-700 ring-1 ring-inset ring-slate-200/80',
  info: 'bg-blue-50 text-blue-700 ring-1 ring-inset ring-blue-200/90',
  warning: 'bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-200/90',
  danger: 'bg-rose-50 text-rose-700 ring-1 ring-inset ring-rose-200/90',
  success: 'bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200/90',
};

export function AlertStrip({
  items,
  title,
  action,
  compact = false,
  defaultCollapsed,
}: {
  items: AlertStripItem[];
  title?: string;
  action?: ReactNode;
  compact?: boolean;
  defaultCollapsed?: boolean;
}) {
  if (items.length === 0) return null;

  const collapsed = defaultCollapsed ?? compact;

  return (
    <details open={!collapsed} className={`group rounded-2xl bg-slate-50/70 shadow-sm ring-1 ring-slate-200/80 ${compact ? 'p-0' : 'p-0'}`}>
      <summary className={`flex cursor-pointer list-none flex-wrap items-center justify-between gap-2 marker:hidden [&::-webkit-details-marker]:hidden ${compact ? 'px-3 py-2.5' : 'px-4 py-3'}`}>
        <div className="flex flex-wrap items-center gap-2">
          {title ? <h3 className="text-sm font-semibold text-slate-900">⚠ {title}</h3> : <span className="text-sm font-semibold text-slate-900">⚠ 通知 / 警告</span>}
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-600">{items.length}件</span>
          <span className="text-[11px] text-slate-500">必要な時だけ見る</span>
        </div>
        <div className="flex items-center gap-2">
          {action}
          <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-600 transition group-open:bg-slate-100">
            <span className="group-open:hidden">開く</span>
            <span className="hidden group-open:inline">閉じる</span>
          </span>
        </div>
      </summary>
      <div className={`border-t border-slate-100 ${compact ? 'px-3 pb-3 pt-2' : 'px-4 pb-4 pt-2.5'}`}>
        <div className="flex flex-wrap gap-2">
          {items.map((item) => {
            const tone = item.tone ?? 'neutral';
            const inner = (
              <>
                <span className="font-medium">{item.label}</span>
                {item.count !== undefined ? <span className="font-semibold">{item.count}</span> : null}
                {item.description ? <span className="text-[11px] opacity-80">{item.description}</span> : null}
              </>
            );

            const className = `inline-flex flex-wrap items-center gap-2 rounded-full border px-3 py-1 text-[11px] ${toneClassName[tone]}`;

            if (item.href) {
              return (
                <a key={item.id} href={item.href} className={`${className} transition hover:opacity-90`}>
                  {inner}
                </a>
              );
            }

            return (
              <div key={item.id} className={className}>
                {inner}
              </div>
            );
          })}
        </div>
      </div>
    </details>
  );
}
