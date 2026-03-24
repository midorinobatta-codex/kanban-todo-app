import type { Task, WaitingLink, WaitingResponse, WaitingResponseStatus } from '@/lib/types';
import { WAITING_RESPONSE_STATUS_LABELS } from '@/lib/types';
import { isWaitingResponseOverdue } from '@/lib/tasks/presentation';

export type WaitingResponseDigest = {
  taskId: string;
  waitingLinkId: string;
  createdAt: string;
  responderName: string | null;
  responseStatus: WaitingResponseStatus;
  responseDueDate: string | null;
  comment: string | null;
};

export type WaitingTaskSignal = {
  hasResponse: boolean;
  hasUnreadResponse: boolean;
  hasQuestion: boolean;
  hasCompletedResponse: boolean;
  hasLink: boolean;
  hasActiveLink: boolean;
  isLinkMissing: boolean;
  statusLabel: string;
  latestResponseAt: string | null;
  latestResponseSummary: string | null;
  latestResponseDueDate: string | null;
  latestResponseResponder: string | null;
};

export function buildLatestWaitingLinkByTaskId(links: WaitingLink[]) {
  const map = new Map<string, WaitingLink>();
  for (const link of links) {
    const prev = map.get(link.task_id);
    if (!prev || new Date(prev.created_at).getTime() < new Date(link.created_at).getTime()) {
      map.set(link.task_id, link);
    }
  }
  return map;
}

export function buildActiveWaitingLinkByTaskId(links: WaitingLink[]) {
  const map = new Map<string, WaitingLink>();
  for (const link of links) {
    if (!link.is_active) continue;
    const prev = map.get(link.task_id);
    if (!prev || new Date(prev.created_at).getTime() < new Date(link.created_at).getTime()) {
      map.set(link.task_id, link);
    }
  }
  return map;
}

export function buildLatestWaitingResponseByTaskId(responses: WaitingResponse[]) {
  const map = new Map<string, WaitingResponseDigest>();
  for (const response of responses) {
    const prev = map.get(response.task_id);
    if (!prev || new Date(prev.createdAt).getTime() < new Date(response.created_at).getTime()) {
      map.set(response.task_id, {
        taskId: response.task_id,
        waitingLinkId: response.waiting_link_id,
        createdAt: response.created_at,
        responderName: response.responder_name,
        responseStatus: response.response_status,
        responseDueDate: response.response_due_date,
        comment: response.comment,
      });
    }
  }
  return map;
}

export function buildWaitingTaskSignal(task: Task, link: WaitingLink | null | undefined, latestResponse?: WaitingResponseDigest | null): WaitingTaskSignal {
  const responseStatus = link?.latest_response_status ?? latestResponse?.responseStatus ?? null;
  const hasResponse = Boolean(link?.latest_response_at || latestResponse?.createdAt);
  const hasActiveLink = Boolean(link?.is_active);
  const hasLink = Boolean(link);
  const hasUnreadResponse = Boolean(link?.has_unread_response);
  const hasQuestion = responseStatus === 'has_question';
  const hasCompletedResponse = responseStatus === 'completed';
  const isLinkMissing = !hasActiveLink && Boolean(task.assignee?.trim());

  return {
    hasResponse,
    hasUnreadResponse,
    hasQuestion,
    hasCompletedResponse,
    hasLink,
    hasActiveLink,
    isLinkMissing,
    statusLabel: responseStatus ? WAITING_RESPONSE_STATUS_LABELS[responseStatus] : '未返信',
    latestResponseAt: link?.latest_response_at ?? latestResponse?.createdAt ?? null,
    latestResponseSummary: link?.latest_response_summary ?? latestResponse?.comment ?? null,
    latestResponseDueDate: link?.latest_response_due_date ?? latestResponse?.responseDueDate ?? null,
    latestResponseResponder: latestResponse?.responderName ?? null,
  };
}

export function getWaitingTaskPriorityScore(task: Task, signal: WaitingTaskSignal) {
  let score = 0;
  if (signal.hasUnreadResponse) score += 40;
  if (signal.hasQuestion) score += 25;
  if (signal.hasCompletedResponse) score += 16;
  if (isWaitingResponseOverdue(task)) score += 20;
  if (signal.isLinkMissing) score += 12;
  if (!task.assignee?.trim()) score += 8;
  if (task.status === 'waiting') score += 2;
  return score;
}
