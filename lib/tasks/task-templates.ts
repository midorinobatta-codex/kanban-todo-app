import type { TaskTemplate, TaskTemplateRecurrence } from '@/lib/types';

function formatDateKey(value: Date) {
  const year = value.getFullYear();
  const month = `${value.getMonth() + 1}`.padStart(2, '0');
  const day = `${value.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getWeekStartDate(value: Date) {
  const base = new Date(value.getFullYear(), value.getMonth(), value.getDate());
  const diffFromMonday = (base.getDay() + 6) % 7;
  base.setDate(base.getDate() - diffFromMonday);
  return base;
}

export function getTaskTemplatePeriodKey(recurrenceType: TaskTemplateRecurrence, now: Date = new Date()) {
  const year = now.getFullYear();
  const month = `${now.getMonth() + 1}`.padStart(2, '0');

  switch (recurrenceType) {
    case 'daily':
      return formatDateKey(now);
    case 'monthly':
      return `${year}-${month}`;
    case 'weekly':
    default:
      return formatDateKey(getWeekStartDate(now));
  }
}

export function shouldGenerateTaskTemplateForDate(template: TaskTemplate, now: Date = new Date()) {
  if (!template.is_active) return false;
  if (!template.start_date) return true;
  return template.start_date <= formatDateKey(now);
}
