'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

export type HistoryScope = 'board' | 'projects' | 'project_detail' | 'viewer';
export type HistoryTone = 'neutral' | 'info' | 'warning' | 'danger' | 'success';

export type TaskHistoryEntry = {
  id: string;
  createdAt: string;
  scope: HistoryScope;
  action: string;
  summary: string;
  detail?: string;
  tone?: HistoryTone;
  contextId?: string;
};

const STORAGE_KEY = 'kanban-todo-history-v1';
const MAX_ENTRIES = 300;

function createId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return `history-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function hasWindow() {
  return typeof window !== 'undefined';
}

function normalizeEntries(value: unknown): TaskHistoryEntry[] {
  if (!Array.isArray(value)) return [];

  return value
    .filter((item): item is TaskHistoryEntry => Boolean(item && typeof item === 'object'))
    .map((item) => ({
      id: typeof item.id === 'string' ? item.id : createId(),
      createdAt: typeof item.createdAt === 'string' ? item.createdAt : new Date().toISOString(),
      scope: isScope(item.scope) ? item.scope : 'board',
      action: typeof item.action === 'string' ? item.action : 'unknown',
      summary: typeof item.summary === 'string' ? item.summary : '',
      detail: typeof item.detail === 'string' ? item.detail : undefined,
      tone: isTone(item.tone) ? item.tone : 'neutral',
      contextId: typeof item.contextId === 'string' ? item.contextId : undefined,
    }))
    .filter((item) => item.summary);
}

function isScope(value: unknown): value is HistoryScope {
  return value === 'board' || value === 'projects' || value === 'project_detail' || value === 'viewer';
}

function isTone(value: unknown): value is HistoryTone {
  return value === 'neutral' || value === 'info' || value === 'warning' || value === 'danger' || value === 'success';
}

export function readTaskHistory(): TaskHistoryEntry[] {
  if (!hasWindow()) return [];

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return normalizeEntries(JSON.parse(raw));
  } catch {
    return [];
  }
}

function writeTaskHistory(entries: TaskHistoryEntry[]) {
  if (!hasWindow()) return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries.slice(0, MAX_ENTRIES)));
}

export function appendTaskHistoryEntry(entry: Omit<TaskHistoryEntry, 'id' | 'createdAt'>): TaskHistoryEntry[] {
  const nextEntry: TaskHistoryEntry = {
    id: createId(),
    createdAt: new Date().toISOString(),
    tone: 'neutral',
    ...entry,
  };

  const nextEntries = [nextEntry, ...readTaskHistory()].slice(0, MAX_ENTRIES);
  writeTaskHistory(nextEntries);
  return nextEntries;
}

export function clearTaskHistory() {
  if (!hasWindow()) return;
  window.localStorage.removeItem(STORAGE_KEY);
}

export function formatHistoryTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  const hour = `${date.getHours()}`.padStart(2, '0');
  const minute = `${date.getMinutes()}`.padStart(2, '0');
  return `${month}/${day} ${hour}:${minute}`;
}

export function scopeLabel(scope: HistoryScope) {
  switch (scope) {
    case 'board':
      return 'Board';
    case 'projects':
      return 'Projects';
    case 'project_detail':
      return 'Project Detail';
    case 'viewer':
      return 'Viewer';
    default:
      return scope;
  }
}

export function buildHistoryExportRows(entries: TaskHistoryEntry[]) {
  return entries.map((entry) => ({
    timestamp: entry.createdAt,
    scope: scopeLabel(entry.scope),
    action: entry.action,
    summary: entry.summary,
    detail: entry.detail ?? '',
    contextId: entry.contextId ?? '',
  }));
}

export function useTaskHistory() {
  const [entries, setEntries] = useState<TaskHistoryEntry[]>([]);

  useEffect(() => {
    setEntries(readTaskHistory());
  }, []);

  const append = useCallback((entry: Omit<TaskHistoryEntry, 'id' | 'createdAt'>) => {
    const nextEntries = appendTaskHistoryEntry(entry);
    setEntries(nextEntries);
    return nextEntries;
  }, []);

  const clear = useCallback(() => {
    clearTaskHistory();
    setEntries([]);
  }, []);

  const refresh = useCallback(() => {
    setEntries(readTaskHistory());
  }, []);

  const latestEntries = useMemo(() => entries, [entries]);

  return {
    entries: latestEntries,
    append,
    clear,
    refresh,
  };
}
