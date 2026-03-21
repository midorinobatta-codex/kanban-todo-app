import type { TaskGtdCategory, TaskProgress } from '@/lib/types';

export type QuickCaptureParseOptions = {
  allowGtdCommands?: boolean;
  lockGtdCategory?: TaskGtdCategory;
  now?: Date;
};

export type QuickCaptureResult = {
  raw: string;
  title: string;
  status: TaskProgress;
  gtdCategory: TaskGtdCategory;
  dueDate: string | null;
  waitingResponseDate: string | null;
  appliedTags: string[];
};

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const GTD_COMMANDS: Record<string, TaskGtdCategory> = {
  '/next': 'next_action',
  '/project': 'project',
  '/someday': 'someday',
  'project': 'project',
};

function formatDateKey(value: Date) {
  const year = value.getFullYear();
  const month = `${value.getMonth() + 1}`.padStart(2, '0');
  const day = `${value.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function addDays(baseDate: Date, days: number) {
  const next = new Date(baseDate);
  next.setDate(next.getDate() + days);
  return next;
}

function isValidIsoDate(value: string) {
  if (!ISO_DATE_PATTERN.test(value)) return false;

  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return false;

  return formatDateKey(parsed) === value;
}

export function parseQuickCaptureInput(
  input: string,
  options: QuickCaptureParseOptions = {},
): QuickCaptureResult {
  const trimmed = input.trim();
  const now = options.now ?? new Date();
  const tokens = trimmed.split(/\s+/).filter(Boolean);

  let status: TaskProgress = 'todo';
  let gtdCategory: TaskGtdCategory = options.lockGtdCategory ?? 'next_action';
  let detectedDate: string | null = null;
  const titleTokens: string[] = [];
  const appliedTags: string[] = [];

  for (const token of tokens) {
    if (token === '/wait' || token.toLowerCase() === 'waiting') {
      status = 'waiting';
      appliedTags.push(token);
      continue;
    }

    if (options.allowGtdCommands && token in GTD_COMMANDS && !options.lockGtdCategory) {
      gtdCategory = GTD_COMMANDS[token];
      appliedTags.push(token);
      continue;
    }

    if (token === '今日') {
      detectedDate = formatDateKey(now);
      appliedTags.push('今日');
      continue;
    }

    if (token === '明日') {
      detectedDate = formatDateKey(addDays(now, 1));
      appliedTags.push('明日');
      continue;
    }

    if (isValidIsoDate(token)) {
      detectedDate = token;
      appliedTags.push(token);
      continue;
    }

    titleTokens.push(token);
  }

  const title = titleTokens.join(' ').trim();
  const waitingResponseDate = status === 'waiting' ? detectedDate : null;
  const dueDate = status === 'waiting' ? null : detectedDate;

  return {
    raw: trimmed,
    title,
    status,
    gtdCategory,
    dueDate,
    waitingResponseDate,
    appliedTags,
  };
}