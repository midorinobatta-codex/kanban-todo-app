'use client';

const STORAGE_KEY = 'flowfocus-weekly-review-notes-v1';

function hasWindow() {
  return typeof window !== 'undefined';
}

function readMap() {
  if (!hasWindow()) return {} as Record<string, string>;

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {};
    }

    return Object.entries(parsed).reduce<Record<string, string>>((acc, [key, value]) => {
      if (typeof value === 'string') {
        acc[key] = value;
      }
      return acc;
    }, {});
  } catch {
    return {};
  }
}

function writeMap(value: Record<string, string>) {
  if (!hasWindow()) return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
}

export function getWeeklyReviewNote(weekStart: string) {
  const map = readMap();
  return map[weekStart] ?? '';
}

export function setWeeklyReviewNote(weekStart: string, note: string) {
  const map = readMap();
  const trimmed = note.trim();

  if (!trimmed) {
    delete map[weekStart];
  } else {
    map[weekStart] = note;
  }

  writeMap(map);
  return note;
}