'use client';

import type { Project } from '@/lib/domain/project';
import type { Task } from '@/lib/types';
import { formatDate, formatProjectDisplayName } from '@/lib/tasks/presentation';
import type { TaskHistoryEntry } from '@/lib/tasks/history';

function escapeCsvValue(value: unknown) {
  const text = value == null ? '' : String(value);
  if (/[",\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function sanitizeFileName(name: string) {
  return name
    .trim()
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/\s+/g, '-')
    .toLowerCase();
}

function downloadBlob(filename: string, content: string, mimeType: string) {
  if (typeof window === 'undefined') return;

  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function downloadJson(filename: string, value: unknown) {
  const normalized = sanitizeFileName(filename);
  downloadBlob(`${normalized}.json`, JSON.stringify(value, null, 2), 'application/json;charset=utf-8');
}

export function downloadCsv(filename: string, rows: Array<Record<string, unknown>>) {
  const normalized = sanitizeFileName(filename);
  if (rows.length === 0) {
    downloadBlob(`${normalized}.csv`, '\uFEFF', 'text/csv;charset=utf-8');
    return;
  }

  const headers = Object.keys(rows[0]);
  const csv = [headers.join(',')]
    .concat(rows.map((row) => headers.map((header) => escapeCsvValue(row[header])).join(',')))
    .join('\r\n');

  downloadBlob(`${normalized}.csv`, `\uFEFF${csv}`, 'text/csv;charset=utf-8');
}

export function buildTaskExportRows(tasks: Task[], projectTaskMap?: Record<string, Task>) {
  return tasks.map((task) => ({
    id: task.id,
    title: task.title,
    description: task.description ?? '',
    assignee: task.assignee ?? '',
    status: task.status,
    gtd: task.gtd_category,
    importance: task.importance,
    urgency: task.urgency,
    dueDate: formatDate(task.due_date, ''),
    startedAt: formatDate(task.started_at, ''),
    waitingResponseDate: formatDate(task.waiting_response_date, ''),
    relatedProject: task.project_task_id ? formatProjectDisplayName(projectTaskMap?.[task.project_task_id]?.title ?? task.project_task_id) : '',
    createdAt: task.created_at,
    updatedAt: task.updated_at,
  }));
}

export function buildProjectExportRows(projects: Project[]) {
  return projects.map((project) => ({
    id: project.id,
    title: formatProjectDisplayName(project.title),
    description: project.description ?? '',
    status: project.status,
    startedAt: formatDate(project.startedAt, ''),
    dueDate: formatDate(project.dueDate, ''),
    nextActionCount: project.nextActionCount,
    doneCount: project.doneCount,
    overdueCount: project.overdueCount,
    completionRate: project.completionRate,
    createdAt: project.createdAt,
    updatedAt: project.createdAt,
  }));
}

export function buildHistoryRows(entries: TaskHistoryEntry[]) {
  return entries.map((entry) => ({
    timestamp: entry.createdAt,
    scope: entry.scope,
    action: entry.action,
    summary: entry.summary,
    detail: entry.detail ?? '',
    contextId: entry.contextId ?? '',
  }));
}
