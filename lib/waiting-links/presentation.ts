import { WAITING_RESPONSE_STATUS_LABELS, type WaitingLink, type WaitingResponseStatus } from '@/lib/types';

export function getWaitingLinkState(link: WaitingLink | null, hasAssignee: boolean, isWaitingOverdue: boolean) {
  if (!hasAssignee) return 'assignee_missing';
  if (!link) return 'link_missing';
  if (!link.is_active) return 'link_inactive';
  if (link.has_unread_response) return 'response_unread';
  if (isWaitingOverdue) return 'response_due_overdue';
  return 'waiting';
}

export function getWaitingResponseStatusLabel(status: WaitingResponseStatus | null | undefined) {
  if (!status) return '返信待ち';
  return WAITING_RESPONSE_STATUS_LABELS[status] ?? status;
}

export function truncateComment(value: string | null | undefined, limit = 48) {
  if (!value) return '';
  return value.length > limit ? `${value.slice(0, limit)}…` : value;
}
