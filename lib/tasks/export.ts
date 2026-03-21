'use client';

import type { Project } from '@/lib/domain/project';
import type { Task } from '@/lib/types';
import { formatDate, formatProjectDisplayName } from '@/lib/tasks/presentation';
import type { TaskHistoryEntry } from '@/lib/tasks/history';
import { formatMinutesAsHours, type WeeklyReviewResult } from '@/lib/tasks/weekly-review';

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
    relatedProject: task.project_task_id
      ? formatProjectDisplayName(projectTaskMap?.[task.project_task_id]?.title ?? task.project_task_id)
      : '',
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
    linkedTaskCount: project.linkedTaskCount,
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

export function buildWeeklyReviewExportRows(review: WeeklyReviewResult, memo: string) {
  const normalizedMemo = memo.trim();

  return [
    {
      section: 'summary',
      rank: '',
      label: '週の合計作業時間',
      value: formatMinutesAsHours(review.totalMinutes),
      minutes: review.totalMinutes,
      count: '',
      relatedId: '',
      weekStart: review.weekStart,
      weekEnd: review.weekEnd,
      memo: normalizedMemo,
    },
    {
      section: 'summary',
      rank: '',
      label: '週内の完了件数',
      value: `${review.completedCount}件`,
      minutes: '',
      count: review.completedCount,
      relatedId: '',
      weekStart: review.weekStart,
      weekEnd: review.weekEnd,
      memo: normalizedMemo,
    },
    {
      section: 'summary',
      rank: '',
      label: '作業セッション件数',
      value: `${review.sessionCount}件`,
      minutes: '',
      count: review.sessionCount,
      relatedId: '',
      weekStart: review.weekStart,
      weekEnd: review.weekEnd,
      memo: normalizedMemo,
    },
    {
      section: 'summary',
      rank: '',
      label: '補正入力件数',
      value: `${review.adjustmentCount}件`,
      minutes: '',
      count: review.adjustmentCount,
      relatedId: '',
      weekStart: review.weekStart,
      weekEnd: review.weekEnd,
      memo: normalizedMemo,
    },
    ...review.taskTopItems.map((item, index) => ({
      section: 'task_top',
      rank: index + 1,
      label: item.title,
      value: formatMinutesAsHours(item.minutes),
      minutes: item.minutes,
      count: item.sessionCount,
      relatedId: item.id,
      weekStart: review.weekStart,
      weekEnd: review.weekEnd,
      memo: normalizedMemo,
    })),
    ...review.projectTopItems.map((item, index) => ({
      section: 'project_top',
      rank: index + 1,
      label: item.title,
      value: formatMinutesAsHours(item.minutes),
      minutes: item.minutes,
      count: item.sessionCount,
      relatedId: item.id,
      weekStart: review.weekStart,
      weekEnd: review.weekEnd,
      memo: normalizedMemo,
    })),
    ...review.stallTrends.map((item) => ({
      section: 'stall_trend',
      rank: '',
      label: item.label,
      value: item.detail,
      minutes: '',
      count: item.count,
      relatedId: item.key,
      weekStart: review.weekStart,
      weekEnd: review.weekEnd,
      memo: normalizedMemo,
    })),
  ];
}

export function buildWeeklyReviewJsonPayload(review: WeeklyReviewResult, memo: string) {
  return {
    weekStart: review.weekStart,
    weekEnd: review.weekEnd,
    weekLabel: review.weekLabel,
    summary: {
      totalMinutes: review.totalMinutes,
      totalTimeText: formatMinutesAsHours(review.totalMinutes),
      completedCount: review.completedCount,
      sessionCount: review.sessionCount,
      adjustmentCount: review.adjustmentCount,
    },
    taskTopItems: review.taskTopItems,
    projectTopItems: review.projectTopItems,
    stallTrends: review.stallTrends,
    memo,
  };
}
