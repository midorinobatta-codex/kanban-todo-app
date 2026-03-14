import type { Task } from '@/lib/types';

function extractDateParts(value: string | null | undefined) {
  if (!value) return null;

  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;

  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
  };
}

export function parseDateOnly(value: string | null | undefined) {
  const parts = extractDateParts(value);
  if (parts) {
    return new Date(parts.year, parts.month - 1, parts.day);
  }

  if (!value) return null;

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;

  return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
}

export function formatDate(value: string | null | undefined, emptyLabel = '未設定') {
  if (!value) return emptyLabel;

  const parts = extractDateParts(value);
  if (parts) {
    return `${parts.year}-${parts.month}-${parts.day}`;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
}

export function toDateInputValue(value: string | null | undefined): string {
  if (!value) return '';

  const parts = extractDateParts(value);
  if (parts) {
    const month = String(parts.month).padStart(2, '0');
    const day = String(parts.day).padStart(2, '0');
    return `${parts.year}-${month}-${day}`;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function startOfToday() {
  const today = new Date();
  return new Date(today.getFullYear(), today.getMonth(), today.getDate());
}

export function isSameDay(left: Date, right: Date) {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
}

export function dayDiffFromToday(value: string | null | undefined) {
  const date = parseDateOnly(value);
  if (!date) return null;
  const diff = date.getTime() - startOfToday().getTime();
  return Math.round(diff / (1000 * 60 * 60 * 24));
}

export function isOverdue(dueDate: string | null | undefined) {
  const due = parseDateOnly(dueDate);
  if (!due) return false;
  return due < startOfToday();
}

export function isDueToday(dueDate: string | null | undefined) {
  const due = parseDateOnly(dueDate);
  if (!due) return false;
  return isSameDay(due, startOfToday());
}

export function isDueSoon(dueDate: string | null | undefined) {
  const diffDays = dayDiffFromToday(dueDate);
  if (diffDays === null) return false;
  return diffDays >= 1 && diffDays <= 3;
}

export function isWaitingResponseOverdue(task: Task) {
  if (task.status !== 'waiting') return false;
  const responseDate = parseDateOnly(task.waiting_response_date);
  if (!responseDate) return false;
  return responseDate < startOfToday();
}

export function isWaitingResponseToday(task: Task) {
  if (task.status !== 'waiting') return false;
  const responseDate = parseDateOnly(task.waiting_response_date);
  if (!responseDate) return false;
  return isSameDay(responseDate, startOfToday());
}

export function isWaitingWithoutResponseDate(task: Task) {
  return task.status === 'waiting' && !task.waiting_response_date;
}

export function normalizeDateValue(value: string | null | undefined) {
  const parsed = parseDateOnly(value);
  return parsed ? parsed.getTime() : Number.MAX_SAFE_INTEGER;
}

export function formatRelativeDueText(value: string | null | undefined, emptyLabel = '日付未設定') {
  const diffDays = dayDiffFromToday(value);
  if (diffDays === null) return emptyLabel;
  if (diffDays === 0) return '今日';
  if (diffDays === 1) return '明日';
  if (diffDays > 1) return `${diffDays}日後`;
  if (diffDays === -1) return '1日超過';
  return `${Math.abs(diffDays)}日超過`;
}

export function formatDurationDays(start: string | null | undefined, end: string | null | undefined) {
  const startDate = parseDateOnly(start);
  const endDate = parseDateOnly(end);
  if (!startDate || !endDate) return '未設定';
  const diff = endDate.getTime() - startDate.getTime();
  const days = Math.round(diff / (1000 * 60 * 60 * 24)) + 1;
  return `${Math.max(days, 1)}日`;
}

export function toDateOnlyString(date: Date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function getSuggestedWaitingResponseDate(businessDays = 1, baseDate = new Date()) {
  const cursor = new Date(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate());
  let remaining = Math.max(businessDays, 0);

  while (remaining > 0) {
    cursor.setDate(cursor.getDate() + 1);
    const day = cursor.getDay();
    if (day !== 0 && day !== 6) {
      remaining -= 1;
    }
  }

  if (businessDays === 0) {
    const day = cursor.getDay();
    if (day === 6) cursor.setDate(cursor.getDate() + 2);
    if (day === 0) cursor.setDate(cursor.getDate() + 1);
  }

  return toDateOnlyString(cursor);
}

export function formatProjectDisplayName(value: string | null | undefined, emptyLabel = '') {
  if (!value) return emptyLabel;
  if (value === 'アクションプロジェクト') return 'Actions of Projects';
  return value;
}
