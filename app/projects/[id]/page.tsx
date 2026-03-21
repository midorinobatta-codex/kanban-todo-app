'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type KeyboardEvent,
  type PointerEvent,
} from 'react';
import { getSupabaseClient } from '@/lib/supabase/client';
import { TaskEditModal, type TaskEditValues } from '@/components/task-edit-modal';
import { updateTaskStatus } from '@/lib/infra/supabase/task-status';
import {
  IMPORTANCE_LABELS,
  TASK_GTD_LABELS,
  TASK_IMPORTANCE_VALUES,
  TASK_PROGRESS_LABELS,
  TASK_PROGRESS_ORDER,
  TASK_URGENCY_VALUES,
  URGENCY_LABELS,
  type Task,
  type TaskGtdCategory,
  type TaskImportance,
  type TaskProgress,
  type TaskUrgency,
} from '@/lib/types';
import { AlertStrip, type AlertStripItem } from '@/components/ui/alert-strip';
import { ExportActions } from '@/components/ui/export-actions';
import { HistoryPanel } from '@/components/ui/history-panel';
import {
  formatDate,
  formatProjectDisplayName,
  getSuggestedWaitingResponseDate,
  isDueSoon,
  isOverdue,
  isWaitingResponseOverdue,
  isWaitingWithoutResponseDate,
  toDateInputValue,
} from '@/lib/tasks/presentation';
import { parseQuickCaptureInput } from '@/lib/tasks/quick-capture';
import { compareTasksByDuePriority } from '@/lib/tasks/task-ordering';
import { buildHistoryRows, buildTaskExportRows, downloadCsv, downloadJson } from '@/lib/tasks/export';
import { useTaskHistory } from '@/lib/tasks/history';
import { buildStalledTaskList, buildTaskFocusDeck, buildTaskStalledBuckets, isDoingStale } from '@/lib/tasks/focus';
import {
  PROJECT_NO_ACTIVE_NEXT_ACTION_DETAIL,
  PROJECT_NO_ACTIVE_NEXT_ACTION_REASON,
  PROJECT_NO_NEXT_ACTION_DETAIL,
  PROJECT_NO_NEXT_ACTION_REASON,
  buildProjectRelationshipIssue,
  getNextCandidateTask,
  getProjectGoalSnippet,
  getProjectRelationshipSnapshot,
  getTaskMap,
  hasBrokenNextCandidate,
} from '@/lib/tasks/relationships';

const levelClassName = {
  low: 'bg-emerald-100 text-emerald-700',
  medium: 'bg-amber-100 text-amber-700',
  high: 'bg-rose-100 text-rose-700',
} as const;

const defaultNewActionState = {
  title: '',
  description: '',
  assignee: '自分',
  importance: 'medium' as TaskImportance,
  urgency: 'medium' as TaskUrgency,
  dueDate: '',
};

const BULK_GTD_OPTIONS: Array<Exclude<TaskGtdCategory, 'project'>> = [
  'next_action',
  'delegated',
  'someday',
];

export default function ProjectDetailPage() {
  const params = useParams();
  const projectId = Array.isArray(params.id) ? params.id[0] : params.id;

  const [project, setProject] = useState<Task | null>(null);
  const [linkedTasks, setLinkedTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [isEditing, setIsEditing] = useState(false);
  const [savingProject, setSavingProject] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editDueDate, setEditDueDate] = useState('');
  const [editError, setEditError] = useState<string | null>(null);
  const [editMessage, setEditMessage] = useState<string | null>(null);

  const [newAction, setNewAction] = useState(defaultNewActionState);
  const [quickActionInput, setQuickActionInput] = useState('');
  const [savingQuickAction, setSavingQuickAction] = useState(false);
  const [savingAction, setSavingAction] = useState(false);
  const [newActionError, setNewActionError] = useState<string | null>(null);
  const [newActionMessage, setNewActionMessage] = useState<string | null>(null);

  const [updatingTaskId, setUpdatingTaskId] = useState<string | null>(null);
  const [editingLinkedTask, setEditingLinkedTask] = useState<Task | null>(null);
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);
  const [dragOverStatus, setDragOverStatus] = useState<TaskProgress | null>(null);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedTaskIds, setSelectedTaskIds] = useState<string[]>([]);
  const [bulkUpdating, setBulkUpdating] = useState(false);
  const [bulkWaitingResponseDate, setBulkWaitingResponseDate] = useState('');
  const [expandedTaskSectionKeys, setExpandedTaskSectionKeys] = useState<Record<string, boolean>>({});
  const [pageNotice, setPageNotice] = useState<string | null>(null);
  const newActionTitleInputRef = useRef<HTMLInputElement | null>(null);
  const { entries: historyEntries, append: appendHistoryEntry, clear: clearHistoryEntries } = useTaskHistory();

  const fetchProjectDetail = useCallback(async () => {
    if (!projectId) {
      setError('プロジェクトIDを取得できませんでした');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    const supabase = getSupabaseClient();

    const [projectResult, linkedTasksResult] = await Promise.all([
      supabase
        .from('tasks')
        .select('*')
        .eq('id', projectId)
        .eq('gtd_category', 'project')
        .single(),
      supabase
        .from('tasks')
        .select('*')
        .eq('project_task_id', projectId)
        .eq('gtd_category', 'next_action')
        .order('created_at', { ascending: false }),
    ]);

    if (projectResult.error) {
      setError(projectResult.error.message);
      setProject(null);
      setLinkedTasks([]);
      setLoading(false);
      return;
    }

    if (linkedTasksResult.error) {
      setError(linkedTasksResult.error.message);
      setProject(projectResult.data as Task);
      setLinkedTasks([]);
      setLoading(false);
      return;
    }

    const nextProject = projectResult.data as Task;
    setProject(nextProject);
    setLinkedTasks((linkedTasksResult.data as Task[]) ?? []);
    setEditTitle(nextProject.title);
    setEditDescription(nextProject.description ?? '');
    setEditDueDate(toDateInputValue(nextProject.due_date));
    setLoading(false);
  }, [projectId]);

  useEffect(() => {
    void fetchProjectDetail();
  }, [fetchProjectDetail]);

  const sortedLinkedTasks = useMemo(
    () => [...linkedTasks].sort(compareTasksByDuePriority),
    [linkedTasks],
  );
  const detailTaskMap = useMemo(
    () => getTaskMap(project ? [project, ...linkedTasks] : linkedTasks),
    [linkedTasks, project],
  );
  const relationshipSnapshot = useMemo(() => getProjectRelationshipSnapshot({ id: projectId ?? '' }, linkedTasks, detailTaskMap), [detailTaskMap, linkedTasks, projectId]);
  const missingNextCandidateTasks = relationshipSnapshot.missingNextCandidateTasks;
  const brokenNextCandidateTasks = relationshipSnapshot.brokenCandidateTasks;

  const groupedLinkedTasks = useMemo(() => {
    return TASK_PROGRESS_ORDER.reduce(
      (acc, status) => {
        acc[status] = sortedLinkedTasks.filter((task) => task.status === status);
        return acc;
      },
      {
        todo: [] as Task[],
        doing: [] as Task[],
        waiting: [] as Task[],
        done: [] as Task[],
      },
    );
  }, [sortedLinkedTasks]);

  const overdueCount = useMemo(() => {
    return linkedTasks.filter((task) => isOverdue(task.due_date) && task.status !== 'done').length;
  }, [linkedTasks]);

  const doneCount = groupedLinkedTasks.done.length;

  const completionRate = useMemo(() => {
    if (linkedTasks.length === 0) return 0;
    return Math.round((doneCount / linkedTasks.length) * 100);
  }, [doneCount, linkedTasks.length]);


  const waitingOverdueCount = useMemo(() => {
    return linkedTasks.filter((task) => isWaitingResponseOverdue(task)).length;
  }, [linkedTasks]);

  const waitingNoDateCount = useMemo(() => {
    return linkedTasks.filter((task) => isWaitingWithoutResponseDate(task)).length;
  }, [linkedTasks]);

  const dueSoonCount = useMemo(() => {
    return linkedTasks.filter((task) => task.status !== 'done' && isDueSoon(task.due_date)).length;
  }, [linkedTasks]);

  const projectAlertItems = useMemo(() => {
    const items: AlertStripItem[] = [];

    if (!project) return items;

    if (!project.started_at) {
      items.push({ id: 'missing-start', label: '開始日未記録', tone: 'warning', href: '/projects/viewer#missing-start-projects' });
    }

    if (!project.due_date) {
      items.push({ id: 'missing-due', label: '期限未設定', tone: 'warning', href: '/projects/viewer#missing-due-projects' });
    }

    if (linkedTasks.length === 0) {
      items.push({ id: 'no-actions', label: PROJECT_NO_NEXT_ACTION_REASON, description: PROJECT_NO_NEXT_ACTION_DETAIL, tone: 'warning' });
    }

    const relationIssue = buildProjectRelationshipIssue(
      {
        id: project.id,
        title: project.title,
        description: project.description,
        createdAt: project.created_at,
        startedAt: project.started_at,
        dueDate: project.due_date,
        status: project.status,
        linkedTaskCount: linkedTasks.length,
        nextActionCount: linkedTasks.filter((task) => task.status !== 'done').length,
        doneCount: linkedTasks.filter((task) => task.status === 'done').length,
        overdueCount: linkedTasks.filter((task) => task.status !== 'done' && isOverdue(task.due_date)).length,
        completionRate: linkedTasks.length === 0 ? 0 : Math.round((linkedTasks.filter((task) => task.status === 'done').length / linkedTasks.length) * 100),
      },
      linkedTasks,
      detailTaskMap,
    );
    if (relationIssue) {
      items.push({
        id: `relation-${relationIssue.reason}`,
        label: relationIssue.reason,
        description: relationIssue.detail,
        count: relationIssue.reason === '次候補なし task あり' ? `${relationIssue.missingNextCandidateTaskIds.length}task` : undefined,
        tone: relationIssue.tone,
      });
    }

    if (waitingOverdueCount > 0) {
      items.push({ id: 'waiting-overdue', label: '回答予定日超過', count: `${waitingOverdueCount}件`, tone: 'danger' });
    }

    if (waitingNoDateCount > 0) {
      items.push({ id: 'waiting-no-date', label: '待ち日付未設定', count: `${waitingNoDateCount}件`, tone: 'warning' });
    }

    if (dueSoonCount > 0) {
      items.push({ id: 'due-soon', label: '期限接近', count: `${dueSoonCount}件`, tone: 'warning' });
    }

    const doingStaleCount = linkedTasks.filter((task) => isDoingStale(task)).length;
    if (doingStaleCount > 0) {
      items.push({ id: 'doing-stale', label: '進行停滞', count: `${doingStaleCount}件`, tone: 'warning' });
    }

    return items;
  }, [detailTaskMap, dueSoonCount, linkedTasks, project, waitingNoDateCount, waitingOverdueCount]);

  const focusedLinkedTasks = useMemo(() => buildTaskFocusDeck(sortedLinkedTasks, 3), [sortedLinkedTasks]);

  const stalledLinkedTaskBuckets = useMemo(() => buildTaskStalledBuckets(sortedLinkedTasks, detailTaskMap), [detailTaskMap, sortedLinkedTasks]);
  const stalledLinkedTasks = useMemo(() => buildStalledTaskList(sortedLinkedTasks, 4, detailTaskMap), [detailTaskMap, sortedLinkedTasks]);

  const toggleTaskSectionExpanded = useCallback((key: string) => {
    setExpandedTaskSectionKeys((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const getLimitedLinkedTasks = useCallback(
    (key: string, items: Task[], limit = 10) => (expandedTaskSectionKeys[key] ? items : items.slice(0, limit)),
    [expandedTaskSectionKeys],
  );

  const projectHistoryEntries = useMemo(() => {
    return historyEntries.filter((entry) => entry.scope === 'project_detail' && entry.contextId === projectId);
  }, [historyEntries, projectId]);

  const handleExportLinkedTasksCsv = useCallback(() => {
    downloadCsv(`project-${projectId}-linked-tasks`, buildTaskExportRows(linkedTasks));
    appendHistoryEntry({
      scope: 'project_detail',
      action: 'export_csv',
      summary: `関連タスクをCSV出力: ${project?.title ?? projectId}`,
      detail: `関連タスク ${linkedTasks.length}件を出力`,
      tone: 'info',
      contextId: projectId,
    });
  }, [appendHistoryEntry, linkedTasks, project?.title, projectId]);

  const handleExportLinkedTasksJson = useCallback(() => {
    downloadJson(`project-${projectId}-detail`, {
      project,
      linkedTasks: buildTaskExportRows(linkedTasks),
    });
    appendHistoryEntry({
      scope: 'project_detail',
      action: 'export_json',
      summary: `関連タスクをJSON出力: ${project?.title ?? projectId}`,
      detail: `関連タスク ${linkedTasks.length}件を出力`,
      tone: 'info',
      contextId: projectId,
    });
  }, [appendHistoryEntry, linkedTasks, project, project?.title, projectId]);

  const handleExportDetailHistoryCsv = useCallback(() => {
    downloadCsv(`project-${projectId}-history`, buildHistoryRows(projectHistoryEntries));
  }, [projectHistoryEntries, projectId]);

  const handleExportDetailHistoryJson = useCallback(() => {
    downloadJson(`project-${projectId}-history`, buildHistoryRows(projectHistoryEntries));
  }, [projectHistoryEntries, projectId]);

  const selectedLinkedTasks = useMemo(() => {
    const selectedSet = new Set(selectedTaskIds);
    return linkedTasks.filter((task) => selectedSet.has(task.id));
  }, [linkedTasks, selectedTaskIds]);

  const allLinkedTasksSelected = useMemo(
    () => linkedTasks.length > 0 && linkedTasks.every((task) => selectedTaskIds.includes(task.id)),
    [linkedTasks, selectedTaskIds],
  );


  const selectedWaitingWithDateCount = useMemo(
    () =>
      selectedLinkedTasks.filter((task) => task.status === 'waiting' && Boolean(task.waiting_response_date)).length,
    [selectedLinkedTasks],
  );

  const selectedNonWaitingTaskCount = useMemo(
    () => selectedLinkedTasks.filter((task) => task.status !== 'waiting').length,
    [selectedLinkedTasks],
  );

  const linkedTaskQuickSelections = useMemo(
    () => [
      { key: 'todo', label: '未着手', taskIds: groupedLinkedTasks.todo.map((task) => task.id) },
      { key: 'doing', label: '進行中', taskIds: groupedLinkedTasks.doing.map((task) => task.id) },
      { key: 'waiting', label: '待ち', taskIds: groupedLinkedTasks.waiting.map((task) => task.id) },
      {
        key: 'waitingOverdue',
        label: '回答超過',
        taskIds: linkedTasks.filter((task) => isWaitingResponseOverdue(task)).map((task) => task.id),
      },
      {
        key: 'waitingNoDate',
        label: '待ち日付未設定',
        taskIds: linkedTasks.filter((task) => isWaitingWithoutResponseDate(task)).map((task) => task.id),
      },
    ],
    [groupedLinkedTasks, linkedTasks],
  );

  useEffect(() => {
    const visibleTaskIds = new Set(linkedTasks.map((task) => task.id));
    setSelectedTaskIds((prev) => prev.filter((taskId) => visibleTaskIds.has(taskId)));
  }, [linkedTasks]);

  async function handleSaveProject() {
    if (!project) return;

    const trimmedTitle = editTitle.trim();
    const normalizedDescription = editDescription.trim();
    const normalizedDueDate = editDueDate || null;

    if (!trimmedTitle) {
      setEditError('タイトルを入力してください');
      setEditMessage(null);
      return;
    }

    setSavingProject(true);
    setEditError(null);
    setEditMessage(null);

    const { data, error: updateError } = await getSupabaseClient()
      .from('tasks')
      .update({
        title: trimmedTitle,
        description: normalizedDescription || null,
        due_date: normalizedDueDate,
      })
      .eq('id', project.id)
      .eq('gtd_category', 'project')
      .select('*')
      .single();

    if (updateError) {
      setEditError(updateError.message);
      setSavingProject(false);
      return;
    }

    const updatedProject = data as Task;
    setProject(updatedProject);
    setEditTitle(updatedProject.title);
    setEditDescription(updatedProject.description ?? '');
    setEditDueDate(toDateInputValue(updatedProject.due_date));
    setIsEditing(false);
    setEditMessage('プロジェクト情報を更新しました');
    appendHistoryEntry({
      scope: 'project_detail',
      action: 'update_project',
      summary: `プロジェクト更新: ${updatedProject.title}`,
      detail: `期限 ${formatDate(updatedProject.due_date)}`,
      tone: 'success',
      contextId: updatedProject.id,
    });
    setSavingProject(false);
  }

  function handleCancelEdit() {
    if (!project) return;

    setEditTitle(project.title);
    setEditDescription(project.description ?? '');
    setEditDueDate(toDateInputValue(project.due_date));
    setEditError(null);
    setEditMessage(null);
    setIsEditing(false);
  }

  async function handleAddNextAction(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!project) return;

    const trimmedTitle = newAction.title.trim();
    const trimmedDescription = newAction.description.trim();
    const trimmedAssignee = newAction.assignee.trim();

    if (!trimmedTitle) {
      setNewActionError('次アクション名を入力してください');
      setNewActionMessage(null);
      return;
    }

    setSavingAction(true);
    setNewActionError(null);
    setNewActionMessage(null);

    const supabase = getSupabaseClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      setNewActionError(userError?.message ?? 'ログイン情報を確認できませんでした');
      setSavingAction(false);
      return;
    }

    const { data, error: insertError } = await supabase
      .from('tasks')
      .insert({
        user_id: user.id,
        title: trimmedTitle,
        description: trimmedDescription || null,
        assignee: trimmedAssignee || null,
        priority: 'medium',
        importance: newAction.importance,
        urgency: newAction.urgency,
        due_date: newAction.dueDate || null,
        status: 'todo',
        gtd_category: 'next_action',
        project_task_id: project.id,
      })
      .select('*')
      .single();

    if (insertError) {
      setNewActionError(insertError.message);
      setSavingAction(false);
      return;
    }

    setLinkedTasks((prev) => [data as Task, ...prev]);
    setNewAction(defaultNewActionState);
    setNewActionMessage('次アクションを追加しました');
    newActionTitleInputRef.current?.focus();
    appendHistoryEntry({
      scope: 'project_detail',
      action: 'add_next_action',
      summary: `次アクション追加: ${trimmedTitle}`,
      detail: `プロジェクト ${formatProjectDisplayName(project.title)}`,
      tone: 'success',
      contextId: project.id,
    });
    setSavingAction(false);
  }

  const handleQuickActionCapture = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!project) return;

      const parsed = parseQuickCaptureInput(quickActionInput, {
        allowGtdCommands: false,
        lockGtdCategory: 'next_action',
      });

      if (!parsed.title) {
        setNewActionError('タイトルを入力してください');
        setNewActionMessage(null);
        return;
      }

      setSavingQuickAction(true);
      setNewActionError(null);
      setNewActionMessage(null);

      const { data, error: insertError } = await getSupabaseClient()
        .from('tasks')
        .insert({
          user_id: project.user_id,
          title: parsed.title,
          description: null,
          assignee: null,
          priority: 'medium',
          importance: 'medium',
          urgency: 'medium',
          due_date: parsed.dueDate,
          status: parsed.status,
          gtd_category: 'next_action',
          project_task_id: project.id,
          waiting_response_date: parsed.waitingResponseDate,
        })
        .select('*')
        .single();

      if (insertError) {
        setNewActionError(insertError.message);
        setSavingQuickAction(false);
        return;
      }

      setLinkedTasks((prev) => [data as Task, ...prev]);
      setQuickActionInput('');
      setNewActionMessage(`クイック追加: 「${parsed.title}」を保存しました`);
      appendHistoryEntry({
        scope: 'project_detail',
        action: 'quick_capture',
        summary: `クイック追加: ${parsed.title}`,
        detail: parsed.appliedTags.length > 0 ? parsed.appliedTags.join(' / ') : 'タイトルのみ',
        tone: 'success',
        contextId: project.id,
      });
      setSavingQuickAction(false);
    },
    [appendHistoryEntry, project, quickActionInput],
  );

  async function handleUpdateLinkedTaskStatus(task: Task, nextStatus: TaskProgress) {
    if (task.status === nextStatus) return;

    setUpdatingTaskId(task.id);
    setError(null);

    try {
      const updatedTask = await updateTaskStatus(task, nextStatus);

      setLinkedTasks((prev) => prev.map((item) => (item.id === task.id ? updatedTask : item)));
      appendHistoryEntry({
        scope: 'project_detail',
        action: 'update_status',
        summary: `進捗更新: ${task.title}`,
        detail: `${TASK_PROGRESS_LABELS[task.status]} → ${TASK_PROGRESS_LABELS[nextStatus]}`,
        tone: 'info',
        contextId: projectId,
      });
    } catch (updateError) {
      const message = updateError instanceof Error ? updateError.message : '進捗更新に失敗しました';
      setError(message);
      setUpdatingTaskId(null);
      return;
    }

    setUpdatingTaskId(null);
  }


  const applySuggestedWaiting = useCallback(async (task: Task) => {
    const suggestedDate = task.waiting_response_date || getSuggestedWaitingResponseDate();

    setUpdatingTaskId(task.id);
    setError(null);
    setPageNotice(null);

    const { data, error: updateError } = await getSupabaseClient()
      .from('tasks')
      .update({ status: 'waiting', waiting_response_date: suggestedDate })
      .eq('id', task.id)
      .select('*')
      .single();

    if (updateError) {
      setError(updateError.message);
      setUpdatingTaskId(null);
      return;
    }

    setLinkedTasks((prev) => prev.map((item) => (item.id === task.id ? (data as Task) : item)));
    setPageNotice(`「${task.title}」を待ちにして回答予定日 ${formatDate(suggestedDate)} を設定しました。`);
    appendHistoryEntry({
      scope: 'project_detail',
      action: 'suggest_waiting',
      summary: `待ち＋回答予定日: ${task.title}`,
      detail: `回答予定日 ${formatDate(suggestedDate)}`,
      tone: 'warning',
      contextId: projectId,
    });
    setUpdatingTaskId(null);
  }, [appendHistoryEntry, projectId]);

  async function handleSaveLinkedTaskEdits(values: TaskEditValues) {
    if (!editingLinkedTask) return;

    setUpdatingTaskId(editingLinkedTask.id);
    setError(null);

    const nextProjectTaskId = values.gtdCategory === 'next_action' ? values.projectTaskId || null : null;
    const nextCandidateTaskId =
      values.nextCandidateTaskId &&
      values.nextCandidateTaskId !== editingLinkedTask.id &&
      detailTaskMap[values.nextCandidateTaskId]
        ? values.nextCandidateTaskId
        : null;

    const { data, error: updateError } = await getSupabaseClient()
      .from('tasks')
      .update({
        title: values.title.trim(),
        description: values.description.trim() || null,
        assignee: values.assignee.trim() || null,
        importance: values.importance,
        urgency: values.urgency,
        status: values.status,
        due_date: values.dueDate || null,
        waiting_response_date:
          values.status === 'waiting' ? values.waitingResponseDate || null : null,
        gtd_category: values.gtdCategory,
        project_task_id: nextProjectTaskId,
        next_candidate_task_id: nextCandidateTaskId,
      })
      .eq('id', editingLinkedTask.id)
      .select('*')
      .single();

    if (updateError) {
      setError(updateError.message);
      setUpdatingTaskId(null);
      return;
    }

    setLinkedTasks((prev) => prev.map((item) => (item.id === editingLinkedTask.id ? (data as Task) : item)));
    appendHistoryEntry({
      scope: 'project_detail',
      action: 'edit_task',
      summary: `関連タスク更新: ${values.title}`,
      detail: `進捗 ${TASK_PROGRESS_LABELS[values.status]} / GTD ${TASK_GTD_LABELS[values.gtdCategory]}`,
      tone: 'success',
      contextId: projectId,
    });
    setEditingLinkedTask(null);
    setUpdatingTaskId(null);
  }

  const handleTaskDragStart = (taskId: string) => {
    setDraggedTaskId(taskId);
  };

  const handleTaskDragEnd = () => {
    setDraggedTaskId(null);
    setDragOverStatus(null);
  };

  const handleColumnDragOver = (event: DragEvent<HTMLDivElement>, status: TaskProgress) => {
    if (!draggedTaskId) return;
    event.preventDefault();
    if (dragOverStatus !== status) {
      setDragOverStatus(status);
    }
  };

  const handleColumnDrop = async (event: DragEvent<HTMLDivElement>, status: TaskProgress) => {
    event.preventDefault();

    const droppedTaskId = draggedTaskId;
    setDraggedTaskId(null);
    setDragOverStatus(null);

    if (!droppedTaskId) return;

    const droppedTask = linkedTasks.find((task) => task.id === droppedTaskId);
    if (!droppedTask) return;

    await handleUpdateLinkedTaskStatus(droppedTask, status);
  };

  async function handleDeleteLinkedTask(taskId: string) {
    setUpdatingTaskId(taskId);
    setError(null);
    setPageNotice(null);

    const { error: deleteError } = await getSupabaseClient().from('tasks').delete().eq('id', taskId);

    if (deleteError) {
      setError(deleteError.message);
      setUpdatingTaskId(null);
      return;
    }

    setLinkedTasks((prev) => prev.filter((task) => task.id !== taskId));
    setPageNotice('関連タスクを削除しました。');
    appendHistoryEntry({
      scope: 'project_detail',
      action: 'delete_task',
      summary: '関連タスクを削除',
      detail: `対象ID ${taskId}`,
      tone: 'danger',
      contextId: projectId,
    });
    setUpdatingTaskId(null);
  }

  const toggleTaskSelection = useCallback((taskId: string) => {
    setSelectedTaskIds((prev) =>
      prev.includes(taskId) ? prev.filter((id) => id !== taskId) : [...prev, taskId],
    );
  }, []);

  const clearTaskSelection = useCallback(() => {
    setSelectedTaskIds([]);
  }, []);

  const handleToggleSelectAll = useCallback(() => {
    setSelectedTaskIds((prev) => {
      if (linkedTasks.length > 0 && linkedTasks.every((task) => prev.includes(task.id))) {
        return [];
      }

      return linkedTasks.map((task) => task.id);
    });
  }, [linkedTasks]);

  const applyBulkStatusChange = useCallback(
    async (nextStatus: TaskProgress) => {
      const targetTasks = selectedLinkedTasks.filter((task) => task.status !== nextStatus);
      if (targetTasks.length === 0) return;

      setBulkUpdating(true);
      setError(null);
      setPageNotice(null);

      try {
        const updatedTasks = await Promise.all(
          targetTasks.map((task) => updateTaskStatus(task, nextStatus)),
        );
        const updatedTaskMap = new Map(updatedTasks.map((task) => [task.id, task]));

        setLinkedTasks((prev) => prev.map((task) => updatedTaskMap.get(task.id) ?? task));
        setSelectedTaskIds([]);
        setPageNotice(`選択中 ${updatedTasks.length}件の進捗を「${TASK_PROGRESS_LABELS[nextStatus]}」に更新しました。`);
        appendHistoryEntry({
          scope: 'project_detail',
          action: 'bulk_status',
          summary: `一括進捗更新 ${updatedTasks.length}件`,
          detail: `進捗を ${TASK_PROGRESS_LABELS[nextStatus]} に更新`,
          tone: 'info',
          contextId: projectId,
        });
      } catch (bulkError) {
        const message =
          bulkError instanceof Error ? bulkError.message : '関連タスクの一括更新に失敗しました';
        setError(message);
      }

      setBulkUpdating(false);
    },
    [selectedLinkedTasks],
  );

  const applyBulkFieldChange = useCallback(
    async (updates: Record<string, unknown>, successMessage: string) => {
      if (selectedTaskIds.length === 0) return;

      setBulkUpdating(true);
      setError(null);
      setPageNotice(null);

      const { data, error: bulkError } = await getSupabaseClient()
        .from('tasks')
        .update(updates)
        .in('id', selectedTaskIds)
        .select('*');

      if (bulkError) {
        setError(bulkError.message);
        setBulkUpdating(false);
        return;
      }

      const updatedTaskMap = new Map(((data as Task[]) ?? []).map((task) => [task.id, task]));
      setLinkedTasks((prev) =>
        prev
          .map((task) => updatedTaskMap.get(task.id) ?? task)
          .filter((task) => task.gtd_category === 'next_action' && task.project_task_id === projectId),
      );
      setSelectedTaskIds([]);
      setPageNotice(successMessage);
      appendHistoryEntry({
        scope: 'project_detail',
        action: 'bulk_field',
        summary: `一括更新 ${selectedTaskIds.length}件`,
        detail: successMessage,
        tone: 'info',
        contextId: projectId,
      });
      setBulkUpdating(false);
    },
    [projectId, selectedTaskIds],
  );


  const applyLinkedTaskSelectionPreset = useCallback((taskIds: string[]) => {
    const uniqueIds = Array.from(new Set(taskIds));
    if (uniqueIds.length === 0) return;

    setSelectionMode(true);
    setSelectedTaskIds(uniqueIds);
  }, []);

  const applyBulkWaitingResponseDate = useCallback(async () => {
    if (selectedTaskIds.length === 0) return;

    const nextWaitingResponseDate = bulkWaitingResponseDate || getSuggestedWaitingResponseDate();

    setBulkUpdating(true);
    setError(null);
    setPageNotice(null);

    const shouldSwitchToWaiting = selectedLinkedTasks.some((task) => task.status !== 'waiting');

    const { data, error: bulkError } = await getSupabaseClient()
      .from('tasks')
      .update(
        shouldSwitchToWaiting
          ? { status: 'waiting', waiting_response_date: nextWaitingResponseDate }
          : { waiting_response_date: nextWaitingResponseDate },
      )
      .in('id', selectedTaskIds)
      .select('*');

    if (bulkError) {
      setError(bulkError.message);
      setBulkUpdating(false);
      return;
    }

    const updatedTaskMap = new Map(((data as Task[]) ?? []).map((task) => [task.id, task]));
    setLinkedTasks((prev) =>
      prev
        .map((task) => updatedTaskMap.get(task.id) ?? task)
        .filter((task) => task.gtd_category === 'next_action' && task.project_task_id === projectId),
    );
    setSelectedTaskIds([]);
    setBulkWaitingResponseDate('');
    setPageNotice(
      shouldSwitchToWaiting
        ? `選択中 ${selectedTaskIds.length}件を待ちにして回答予定日 ${formatDate(nextWaitingResponseDate)} を設定しました。`
        : `選択中 ${selectedTaskIds.length}件の回答予定日を ${formatDate(nextWaitingResponseDate)} に更新しました。`,
    );
    appendHistoryEntry({
      scope: 'project_detail',
      action: 'bulk_waiting_date',
      summary: `回答予定日を一括設定 ${selectedTaskIds.length}件`,
      detail: shouldSwitchToWaiting ? `待ちへ変更して回答予定日 ${formatDate(nextWaitingResponseDate)} を設定` : `回答予定日を ${formatDate(nextWaitingResponseDate)} に更新`,
      tone: 'warning',
      contextId: projectId,
    });
    setBulkUpdating(false);
  }, [bulkWaitingResponseDate, projectId, selectedLinkedTasks, selectedTaskIds]);

  const clearBulkWaitingResponseDate = useCallback(async () => {
    const waitingTaskIds = selectedLinkedTasks
      .filter((task) => task.status === 'waiting' && task.waiting_response_date)
      .map((task) => task.id);

    if (waitingTaskIds.length === 0) return;

    setBulkUpdating(true);
    setError(null);
    setPageNotice(null);

    const { data, error: bulkError } = await getSupabaseClient()
      .from('tasks')
      .update({ waiting_response_date: null })
      .in('id', waitingTaskIds)
      .select('*');

    if (bulkError) {
      setError(bulkError.message);
      setBulkUpdating(false);
      return;
    }

    const updatedTaskMap = new Map(((data as Task[]) ?? []).map((task) => [task.id, task]));
    setLinkedTasks((prev) =>
      prev
        .map((task) => updatedTaskMap.get(task.id) ?? task)
        .filter((task) => task.gtd_category === 'next_action' && task.project_task_id === projectId),
    );
    setSelectedTaskIds([]);
    setPageNotice(`選択中 ${waitingTaskIds.length}件の回答予定日を外しました。`);
    appendHistoryEntry({
      scope: 'project_detail',
      action: 'bulk_clear_waiting_date',
      summary: `回答予定日を一括解除 ${waitingTaskIds.length}件`,
      tone: 'warning',
      contextId: projectId,
    });
    setBulkUpdating(false);
  }, [projectId, selectedLinkedTasks]);

  const handleBulkDelete = useCallback(async () => {
    if (selectedTaskIds.length === 0) return;

    const confirmed = window.confirm(`選択中 ${selectedTaskIds.length}件を削除します。よろしいですか？`);
    if (!confirmed) return;

    setBulkUpdating(true);
    setError(null);
    setPageNotice(null);

    const { error: bulkError } = await getSupabaseClient().from('tasks').delete().in('id', selectedTaskIds);

    if (bulkError) {
      setError(bulkError.message);
      setBulkUpdating(false);
      return;
    }

    const selectedSet = new Set(selectedTaskIds);
    setLinkedTasks((prev) => prev.filter((task) => !selectedSet.has(task.id)));
    setSelectedTaskIds([]);
    setPageNotice(`選択中 ${selectedTaskIds.length}件を削除しました。`);
    appendHistoryEntry({
      scope: 'project_detail',
      action: 'bulk_delete',
      summary: `一括削除 ${selectedTaskIds.length}件`,
      tone: 'danger',
      contextId: projectId,
    });
    setBulkUpdating(false);
  }, [selectedTaskIds]);

  if (loading) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-[106rem] flex-col gap-6 px-4 py-6 sm:px-6">
        <p className="text-sm text-slate-500">読み込み中...</p>
      </main>
    );
  }

  if (error || !project) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-[106rem] flex-col gap-6 px-4 py-6 sm:px-6">
        <header className="sticky top-0 z-40 -mx-4 px-4 py-1 backdrop-blur sm:-mx-6 sm:px-6">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white/95 p-6 shadow-sm ring-1 ring-slate-900/5">
            <div>
              <h1 className="text-2xl font-bold">Project Detail</h1>
              <p className="mt-1 text-sm text-slate-600">プロジェクト詳細</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Link
                href="/projects"
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
              >
                Projects
              </Link>
              <Link
                href="/"
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
              >
                Board
              </Link>
            </div>
          </div>
        </header>

        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error ?? 'プロジェクトが見つかりませんでした'}
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-[106rem] flex-col gap-6 px-4 py-6 sm:px-6">
      <header className="sticky top-0 z-40 -mx-4 px-4 py-1 backdrop-blur sm:-mx-6 sm:px-6">
        <div className="rounded-2xl border border-slate-200 bg-white/95 px-4 py-3 shadow-sm ring-1 ring-slate-900/5 sm:px-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <h1 className="text-2xl font-semibold text-slate-900">{formatProjectDisplayName(project.title)}</h1>
              <span className="rounded-full bg-blue-50 px-2.5 py-1 text-[11px] font-semibold text-blue-700">Actions of Projects</span>
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-600">完了率 {completionRate}%</span>
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-600">進める一手 {linkedTasks.filter((task) => task.status !== 'done').length}件 / 関連タスク {linkedTasks.length}件</span>
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-600">期限 {formatDate(project.due_date)}</span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Link
                href="/projects/viewer"
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
              >
                Viewer
              </Link>
              <Link
                href="/projects"
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
              >
                Projects
              </Link>
              <Link
                href="/"
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
              >
                Board
              </Link>
              <ExportActions
                label="Export"
                onExportCsv={handleExportLinkedTasksCsv}
                onExportJson={handleExportLinkedTasksJson}
              />
            </div>
          </div>
        </div>
      </header>

      {error ? (
        <p className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </p>
      ) : null}

      {pageNotice ? (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {pageNotice}
        </p>
      ) : null}

      <AlertStrip items={projectAlertItems} title="通知 / 警告" compact defaultCollapsed />

      {linkedTasks.length === 0 && project.status !== 'done' ? (
        <section className="rounded-2xl border border-amber-300 bg-amber-50 px-4 py-4 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-amber-900">{PROJECT_NO_NEXT_ACTION_REASON}</h2>
              <p className="mt-1 text-sm text-amber-800">{PROJECT_NO_NEXT_ACTION_DETAIL}</p>
              <p className="mt-1 text-xs text-amber-700">保存はそのまま通ります。まずは 1 件だけ次に進めるタスクを足せば、止まり状態を解消できます。</p>
            </div>
            <a
              href="#next-action-form-panel"
              className="rounded-lg border border-amber-300 bg-white px-3 py-2 text-xs font-medium text-amber-800 transition hover:bg-amber-100"
            >
              下のクイック追加を見る
            </a>
          </div>
        </section>
      ) : linkedTasks.length > 0 && linkedTasks.every((task) => task.status === 'done') && project.status !== 'done' ? (
        <section className="rounded-2xl border border-sky-300 bg-sky-50 px-4 py-4 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-sky-900">{PROJECT_NO_ACTIVE_NEXT_ACTION_REASON}</h2>
              <p className="mt-1 text-sm text-sky-800">{PROJECT_NO_ACTIVE_NEXT_ACTION_DETAIL}</p>
              <p className="mt-1 text-xs text-sky-700">完了済みタスクだけでは project は前に進まないため、新しい次アクションを 1 件追加すると一覧や Review と判定が揃います。</p>
            </div>
            <a
              href="#next-action-form-panel"
              className="rounded-lg border border-sky-300 bg-white px-3 py-2 text-xs font-medium text-sky-800 transition hover:bg-sky-100"
            >
              下のクイック追加を見る
            </a>
          </div>
        </section>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[340px_minmax(0,1fr)]">
        <aside className="space-y-6 xl:sticky xl:top-32 xl:self-start">
          <section id="project-info-panel" className="rounded-2xl border border-slate-200 bg-slate-50/80 p-5 shadow-sm">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold text-slate-900">プロジェクト情報</h2>

              {!isEditing ? (
                <button
                  type="button"
                  onClick={() => {
                    setEditTitle(project.title);
                    setEditDescription(project.description ?? '');
                    setEditDueDate(toDateInputValue(project.due_date));
                    setEditError(null);
                    setEditMessage(null);
                    setIsEditing(true);
                  }}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                >
                  編集
                </button>
              ) : null}
            </div>

            {!isEditing ? (
              <div className="space-y-5">
                <InfoRow label="タイトル" value={formatProjectDisplayName(project.title)} />
                <InfoRow label="説明" value={project.description ?? '説明は未設定です。'} />
                <InfoRow label="GTD分類" value={TASK_GTD_LABELS[project.gtd_category]} badge />
                <InfoRow label="期限" value={formatDate(project.due_date)} />
                <InfoRow label="開始日" value={formatDate(project.started_at, '未記録')} />
                <InfoRow label="ステータス" value={TASK_PROGRESS_LABELS[project.status]} />
              </div>
            ) : (
              <div className="space-y-4">
                {editError ? (
                  <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                    {editError}
                  </p>
                ) : null}

                {editMessage ? (
                  <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                    {editMessage}
                  </p>
                ) : null}

                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">タイトル</label>
                  <input
                    value={editTitle}
                    onChange={(event) => setEditTitle(event.target.value)}
                    placeholder="プロジェクト名"
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">説明</label>
                  <textarea
                    value={editDescription}
                    onChange={(event) => setEditDescription(event.target.value)}
                    rows={4}
                    placeholder="説明"
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">期限</label>
                  <input
                    type="date"
                    value={editDueDate}
                    onChange={(event) => setEditDueDate(event.target.value)}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                  />
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => void handleSaveProject()}
                    disabled={savingProject}
                    className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {savingProject ? '保存中...' : '保存'}
                  </button>
                  <button
                    type="button"
                    onClick={handleCancelEdit}
                    disabled={savingProject}
                    className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    キャンセル
                  </button>
                </div>
              </div>
            )}
          </section>

          <section id="next-action-form-panel" className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">次アクション追加</h2>
            <p className="mt-1 text-sm text-slate-500">
              このプロジェクトに紐づく次アクションを直接追加します。
            </p>

            <form className="mt-4 space-y-3" onSubmit={handleQuickActionCapture}>
              <input
                value={quickActionInput}
                onChange={(event) => setQuickActionInput(event.target.value)}
                placeholder="1行で追加。 /wait と YYYY-MM-DD / 明日 に対応"
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
              />
              <div className="flex items-center justify-between gap-3 text-xs text-slate-500">
                <span>GTDはこのProjectの次アクション固定です。解析できなくてもタイトルだけで保存します。</span>
                <button
                  type="submit"
                  disabled={savingQuickAction}
                  className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {savingQuickAction ? '保存中...' : 'Enterで追加'}
                </button>
              </div>
            </form>

            <div className="mt-4 border-t border-slate-200 pt-4">
              <p className="text-sm font-medium text-slate-700">詳細入力で追加</p>
            </div>

            {newActionError ? (
              <p className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                {newActionError}
              </p>
            ) : null}

            {newActionMessage ? (
              <p className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                {newActionMessage}
              </p>
            ) : null}

            <form className="mt-4 space-y-4" onSubmit={handleAddNextAction}>
              <input
                ref={newActionTitleInputRef}
                value={newAction.title}
                onChange={(event) =>
                  setNewAction((prev) => ({
                    ...prev,
                    title: event.target.value,
                  }))
                }
                placeholder="次アクション名"
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
              />

              <input
                value={newAction.assignee}
                onChange={(event) =>
                  setNewAction((prev) => ({
                    ...prev,
                    assignee: event.target.value,
                  }))
                }
                placeholder="担当者"
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
              />

              <textarea
                value={newAction.description}
                onChange={(event) =>
                  setNewAction((prev) => ({
                    ...prev,
                    description: event.target.value,
                  }))
                }
                rows={4}
                placeholder="説明"
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
              />

              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-1">
                <select
                  value={newAction.importance}
                  onChange={(event) =>
                    setNewAction((prev) => ({
                      ...prev,
                      importance: event.target.value as TaskImportance,
                    }))
                  }
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                >
                  {TASK_IMPORTANCE_VALUES.map((importance) => (
                    <option key={importance} value={importance}>
                      重要度: {IMPORTANCE_LABELS[importance]}
                    </option>
                  ))}
                </select>

                <select
                  value={newAction.urgency}
                  onChange={(event) =>
                    setNewAction((prev) => ({
                      ...prev,
                      urgency: event.target.value as TaskUrgency,
                    }))
                  }
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                >
                  {TASK_URGENCY_VALUES.map((urgency) => (
                    <option key={urgency} value={urgency}>
                      緊急度: {URGENCY_LABELS[urgency]}
                    </option>
                  ))}
                </select>
              </div>

              <input
                type="date"
                value={newAction.dueDate}
                onChange={(event) =>
                  setNewAction((prev) => ({
                    ...prev,
                    dueDate: event.target.value,
                  }))
                }
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
              />

              <button
                type="submit"
                disabled={savingAction}
                className="w-full rounded-lg bg-slate-900 px-4 py-3 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {savingAction ? '追加中...' : '次アクションを追加'}
              </button>
            </form>
          </section>

          <HistoryPanel
            defaultCollapsed
            title="履歴"
            entries={projectHistoryEntries}
            onClear={clearHistoryEntries}
            onExportCsv={handleExportDetailHistoryCsv}
            onExportJson={handleExportDetailHistoryJson}
            emptyLabel="このプロジェクトの操作履歴はまだありません。"
          />
        </aside>

        <section className="space-y-6">
          <div className="sticky top-28 z-30">
            <section className="rounded-2xl border border-slate-200 bg-white/95 p-2.5 shadow-sm backdrop-blur">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-sm font-semibold text-slate-900 sm:text-base">Actions of Projects の現在地</h2>
                  <div className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-700">
                    Project: {formatProjectDisplayName(project.title)}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectionMode((prev) => !prev);
                      if (selectionMode) {
                        setSelectedTaskIds([]);
                      }
                    }}
                    className={`rounded-lg border px-3 py-2 text-xs font-medium transition sm:text-sm ${
                      selectionMode
                        ? 'border-blue-600 bg-blue-600 text-white hover:bg-blue-700'
                        : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    {selectionMode ? '複数選択を終了' : '複数選択'}
                  </button>

                  {selectionMode ? (
                    <button
                      type="button"
                      onClick={handleToggleSelectAll}
                      disabled={linkedTasks.length === 0}
                      className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 sm:text-sm"
                    >
                      {allLinkedTasksSelected ? '表示中を解除' : '表示中を全選択'}
                    </button>
                  ) : null}
                </div>
              </div>

              <div className="mt-1.5 grid gap-1.5 md:grid-cols-2 xl:grid-cols-4">
                <CompactContextStat label="関連タスク" value={`${linkedTasks.length}件`} />
                <CompactContextStat label="進行中" value={`${groupedLinkedTasks.doing.length}件`} />
                <CompactContextStat label="待ち" value={`${groupedLinkedTasks.waiting.length}件`} danger={groupedLinkedTasks.waiting.length > 0} />
                <CompactContextStat label="期限超過" value={`${overdueCount}件`} danger={overdueCount > 0} />
              </div>

              <div className="mt-2 grid gap-2 xl:grid-cols-[minmax(0,1.6fr)_minmax(20rem,1fr)]">
                <section className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-sm font-semibold text-slate-900">今やる1件 / 次にやる2件</h3>
                    <span className="text-[11px] text-slate-500">Project内の着手順</span>
                  </div>
                  {focusedLinkedTasks.length === 0 ? (
                    <p className="mt-2 text-xs text-slate-500">関連タスクがありません。</p>
                  ) : (
                    <div className="mt-2 grid gap-2 xl:grid-cols-[minmax(0,1.35fr)_minmax(18rem,1fr)]">
                      <FeaturedLinkedTaskCard
                        task={focusedLinkedTasks[0].task}
                        projectGoal={getProjectGoalSnippet(project?.description)}
                        nextCandidate={getNextCandidateTask(focusedLinkedTasks[0].task, detailTaskMap)}
                        brokenNextCandidate={hasBrokenNextCandidate(focusedLinkedTasks[0].task, detailTaskMap)}
                        missingNextCandidate={!focusedLinkedTasks[0].task.next_candidate_task_id && focusedLinkedTasks[0].task.status !== 'done'}
                        title={focusedLinkedTasks[0].task.title}
                        reason={focusedLinkedTasks[0].reason}
                        detail={focusedLinkedTasks[0].detail}
                        tone={focusedLinkedTasks[0].tone}
                        onOpen={() => setEditingLinkedTask(focusedLinkedTasks[0].task)}
                        onDone={() => void handleUpdateLinkedTaskStatus(focusedLinkedTasks[0].task, 'done')}
                        onWaiting={() => void applySuggestedWaiting(focusedLinkedTasks[0].task)}
                      />
                      <div className="grid gap-2">
                        {focusedLinkedTasks.slice(1).map((item) => (
                          <LinkedTaskMiniCard
                            key={item.task.id}
                            task={item.task}
                            projectGoal={getProjectGoalSnippet(project?.description)}
                            nextCandidate={getNextCandidateTask(item.task, detailTaskMap)}
                            brokenNextCandidate={hasBrokenNextCandidate(item.task, detailTaskMap)}
                            missingNextCandidate={!item.task.next_candidate_task_id && item.task.status !== 'done'}
                            title={item.task.title}
                            reason={item.reason}
                            detail={item.detail}
                            tone={item.tone}
                            onOpen={() => setEditingLinkedTask(item.task)}
                            onDone={() => void handleUpdateLinkedTaskStatus(item.task, 'done')}
                            onWaiting={() => void applySuggestedWaiting(item.task)}
                          />
                        ))}
                        {focusedLinkedTasks.length === 1 ? (
                          <div className="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-6 text-xs text-slate-400">次点候補はありません。</div>
                        ) : null}
                      </div>
                    </div>
                  )}
                </section>

                <section className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-sm font-semibold text-slate-900">止まり候補</h3>
                    <span className="text-[11px] text-slate-500">入力を増やさず自動抽出</span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <RiskChip label="回答超過" count={stalledLinkedTaskBuckets.waitingOverdue.length} danger />
                    <RiskChip label="待ち日付未設定" count={stalledLinkedTaskBuckets.waitingNoDate.length} />
                    <RiskChip label="候補リンク切れ" count={stalledLinkedTaskBuckets.brokenNextCandidate.length} />
                    <RiskChip label="進行停滞" count={stalledLinkedTaskBuckets.doingStale.length} />
                    <RiskChip label="期限超過" count={stalledLinkedTaskBuckets.overdueTodo.length} />
                  </div>
                  <div className="mt-2 space-y-2">
                    {stalledLinkedTasks.length === 0 ? (
                      <p className="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-5 text-xs text-slate-500">止まり候補はありません。</p>
                    ) : (
                      stalledLinkedTasks.map((item) => (
                        <LinkedTaskMiniCard
                          key={item.task.id}
                          task={item.task}
                          projectGoal={getProjectGoalSnippet(project?.description)}
                          nextCandidate={getNextCandidateTask(item.task, detailTaskMap)}
                          brokenNextCandidate={hasBrokenNextCandidate(item.task, detailTaskMap)}
                          missingNextCandidate={!item.task.next_candidate_task_id && item.task.status !== 'done'}
                          title={item.task.title}
                          reason={item.reason}
                          detail={item.detail}
                          tone={item.tone}
                          onOpen={() => setEditingLinkedTask(item.task)}
                          onDone={() => void handleUpdateLinkedTaskStatus(item.task, 'done')}
                          onWaiting={() => void applySuggestedWaiting(item.task)}
                        />
                      ))
                    )}
                  </div>
                </section>
              </div>

              <div className="mt-1.5 flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                <span className="text-xs font-medium text-slate-600">クイック選択</span>
                {linkedTaskQuickSelections.map((preset) => (
                  <QuickSelectButton
                    key={preset.key}
                    label={preset.label}
                    count={preset.taskIds.length}
                    disabled={preset.taskIds.length === 0}
                    onClick={() => applyLinkedTaskSelectionPreset(preset.taskIds)}
                  />
                ))}
                {selectionMode ? <FilterChip label={`選択中 ${selectedTaskIds.length}件`} subtle /> : null}
              </div>

              {selectionMode ? (
                <div className="mt-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    {(['doing', 'waiting', 'done', 'todo'] as TaskProgress[]).map((status) => (
                      <QuickActionButton
                        key={status}
                        label={TASK_PROGRESS_LABELS[status]}
                        disabled={selectedTaskIds.length === 0 || bulkUpdating}
                        onClick={() => void applyBulkStatusChange(status)}
                      />
                    ))}

                    <InlineBulkSelect
                      placeholder="重要度を一括変更"
                      disabled={selectedTaskIds.length === 0 || bulkUpdating}
                      options={TASK_IMPORTANCE_VALUES.map((importance) => ({
                        value: importance,
                        label: `重要度: ${IMPORTANCE_LABELS[importance]}`,
                      }))}
                      onSelect={(value) =>
                        void applyBulkFieldChange(
                          { importance: value },
                          `選択中 ${selectedTaskIds.length}件の重要度を更新しました。`,
                        )
                      }
                    />

                    <InlineBulkSelect
                      placeholder="緊急度を一括変更"
                      disabled={selectedTaskIds.length === 0 || bulkUpdating}
                      options={TASK_URGENCY_VALUES.map((urgency) => ({
                        value: urgency,
                        label: `緊急度: ${URGENCY_LABELS[urgency]}`,
                      }))}
                      onSelect={(value) =>
                        void applyBulkFieldChange(
                          { urgency: value },
                          `選択中 ${selectedTaskIds.length}件の緊急度を更新しました。`,
                        )
                      }
                    />

                    <InlineBulkSelect
                      placeholder="GTDを一括変更"
                      disabled={selectedTaskIds.length === 0 || bulkUpdating}
                      options={BULK_GTD_OPTIONS.map((category) => ({
                        value: category,
                        label: `GTD: ${TASK_GTD_LABELS[category]}`,
                      }))}
                      onSelect={(value) =>
                        void applyBulkFieldChange(
                          value === 'next_action'
                            ? { gtd_category: value, project_task_id: project.id }
                            : { gtd_category: value, project_task_id: null },
                          `選択中 ${selectedTaskIds.length}件のGTD分類を更新しました。`,
                        )
                      }
                    />
                  </div>

                  <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-slate-200 pt-2">
                    <input
                      type="date"
                      value={bulkWaitingResponseDate}
                      onChange={(event) => setBulkWaitingResponseDate(event.target.value)}
                      disabled={selectedTaskIds.length === 0 || bulkUpdating}
                      className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-700 disabled:cursor-not-allowed disabled:opacity-50 sm:text-sm"
                    />
                    <QuickDatePresetButton
                      label="次営業日"
                      disabled={selectedTaskIds.length === 0 || bulkUpdating}
                      onClick={() => setBulkWaitingResponseDate(getSuggestedWaitingResponseDate(1))}
                    />
                    <QuickDatePresetButton
                      label="3営業日"
                      disabled={selectedTaskIds.length === 0 || bulkUpdating}
                      onClick={() => setBulkWaitingResponseDate(getSuggestedWaitingResponseDate(3))}
                    />
                    <button
                      type="button"
                      onClick={() => void applyBulkWaitingResponseDate()}
                      disabled={selectedTaskIds.length === 0 || bulkUpdating}
                      className="rounded-lg border border-violet-300 bg-white px-3 py-2 text-xs font-medium text-violet-700 transition hover:bg-violet-50 disabled:cursor-not-allowed disabled:opacity-50 sm:text-sm"
                    >
                      {selectedNonWaitingTaskCount > 0 ? '待ち＋回答日自動設定' : '回答日を更新'}
                    </button>
                    <button
                      type="button"
                      onClick={() => void clearBulkWaitingResponseDate()}
                      disabled={selectedWaitingWithDateCount === 0 || bulkUpdating}
                      className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 sm:text-sm"
                    >
                      回答日を外す
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        clearTaskSelection();
                        setSelectionMode(false);
                        setBulkWaitingResponseDate('');
                      }}
                      disabled={!selectionMode}
                      className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 sm:text-sm"
                    >
                      選択解除
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleBulkDelete()}
                      disabled={selectedTaskIds.length === 0 || bulkUpdating}
                      className="rounded-lg border border-rose-300 bg-white px-3 py-2 text-xs font-medium text-rose-700 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50 sm:text-sm"
                    >
                      一括削除
                    </button>
                  </div>
                </div>
              ) : null}
            </section>
          </div>

          <section className="rounded-2xl border border-cyan-200 bg-cyan-50/40 p-5 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-semibold text-slate-900">この後候補の確認</h2>
                <p className="mt-1 text-sm text-slate-600">project 警告の根拠になる task をここで追えます。done task は除外しています。</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <span className="rounded-full bg-cyan-100 px-3 py-1 text-xs font-medium text-cyan-700">未設定 task {missingNextCandidateTasks.length}件</span>
                <span className="rounded-full bg-rose-100 px-3 py-1 text-xs font-medium text-rose-700">リンク切れ task {brokenNextCandidateTasks.length}件</span>
              </div>
            </div>

            <div className="mt-4 grid gap-4 xl:grid-cols-2">
              <div className="rounded-xl border border-cyan-200 bg-white p-4">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold text-slate-900">候補未設定の active task</h3>
                  <span className="text-xs text-cyan-700">{missingNextCandidateTasks.length}件</span>
                </div>
                {missingNextCandidateTasks.length === 0 ? (
                  <p className="mt-3 text-sm text-slate-500">未設定の active task はありません。</p>
                ) : (
                  <div className="mt-3 space-y-2">
                    {missingNextCandidateTasks.map((task) => (
                      <button
                        key={task.id}
                        type="button"
                        onClick={() => setEditingLinkedTask(task)}
                        className="w-full rounded-xl border border-cyan-200 bg-cyan-50/70 px-4 py-3 text-left text-sm transition hover:bg-cyan-100/70"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="font-medium text-slate-900">{task.title}</div>
                            <div className="mt-1 text-xs text-cyan-700">要確認: 次候補なし</div>
                          </div>
                          <span className="rounded-full bg-cyan-100 px-2 py-1 text-[11px] font-medium text-cyan-700">{TASK_PROGRESS_LABELS[task.status]}</span>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="rounded-xl border border-rose-200 bg-white p-4">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold text-slate-900">候補リンク切れ task</h3>
                  <span className="text-xs text-rose-700">{brokenNextCandidateTasks.length}件</span>
                </div>
                {brokenNextCandidateTasks.length === 0 ? (
                  <p className="mt-3 text-sm text-slate-500">リンク切れの task はありません。</p>
                ) : (
                  <div className="mt-3 space-y-2">
                    {brokenNextCandidateTasks.map((task) => (
                      <button
                        key={task.id}
                        type="button"
                        onClick={() => setEditingLinkedTask(task)}
                        className="w-full rounded-xl border border-rose-200 bg-rose-50/70 px-4 py-3 text-left text-sm transition hover:bg-rose-100/70"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="font-medium text-slate-900">{task.title}</div>
                            <div className="mt-1 text-xs text-rose-700">要確認: 設定済み候補の参照先が不正です</div>
                          </div>
                          <span className="rounded-full bg-rose-100 px-2 py-1 text-[11px] font-medium text-rose-700">{TASK_PROGRESS_LABELS[task.status]}</span>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </section>

          <section id="linked-task-board" className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-semibold text-slate-900">関連タスク</h2>
                <p className="mt-1 text-sm text-slate-500">
                  このプロジェクトに紐づく次アクション一覧です。
                </p>
              </div>
            </div>

            {linkedTasks.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-sm text-slate-500">
                まだ次アクションはありません。
              </div>
            ) : (
              <div className="grid gap-4 xl:grid-cols-2">
                {TASK_PROGRESS_ORDER.map((status) => (
                  <div
                    key={status}
                    className={`rounded-2xl border p-4 transition ${
                      dragOverStatus === status
                        ? 'border-sky-400 bg-blue-50 ring-2 ring-sky-200'
                        : 'border-slate-200 bg-slate-50'
                    }`}
                    onDragOver={(event) => handleColumnDragOver(event, status)}
                    onDragLeave={() => setDragOverStatus((prev) => (prev === status ? null : prev))}
                    onDrop={(event) => void handleColumnDrop(event, status)}
                  >
                    <div className="mb-3 flex items-center justify-between gap-2">
                      <h3 className="text-base font-semibold text-slate-900">
                        {TASK_PROGRESS_LABELS[status]}
                      </h3>
                      <span className="text-xs text-slate-500">
                        {groupedLinkedTasks[status].length}件
                      </span>
                    </div>

                    {groupedLinkedTasks[status].length === 0 ? (
                      <div className="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-6 text-sm text-slate-400">
                        なし
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {getLimitedLinkedTasks(`detail-${status}`, groupedLinkedTasks[status]).map((task) => (
                          <LinkedTaskCard
                            key={task.id}
                            task={task}
                            projectGoal={getProjectGoalSnippet(project?.description)}
                            nextCandidate={getNextCandidateTask(task, detailTaskMap)}
                            brokenNextCandidate={hasBrokenNextCandidate(task, detailTaskMap)}
                            missingNextCandidate={!task.next_candidate_task_id && task.status !== 'done'}
                            disabled={updatingTaskId === task.id}
                            dragging={draggedTaskId === task.id}
                            draggable={!selectionMode && updatingTaskId !== task.id}
                            selectionMode={selectionMode}
                            selected={selectedTaskIds.includes(task.id)}
                            onToggleSelect={toggleTaskSelection}
                            onDragStart={handleTaskDragStart}
                            onDragEnd={handleTaskDragEnd}
                            onEdit={setEditingLinkedTask}
                          />
                        ))}

                        <SectionExpandButton
                          hiddenCount={groupedLinkedTasks[status].length - getLimitedLinkedTasks(`detail-${status}`, groupedLinkedTasks[status]).length}
                          expanded={Boolean(expandedTaskSectionKeys[`detail-${status}`])}
                          onToggle={() => toggleTaskSectionExpanded(`detail-${status}`)}
                        />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>
        </section>
      </div>

      <TaskEditModal
        open={editingLinkedTask !== null}
        task={editingLinkedTask}
        projectTasks={project ? [project] : []}
        candidateTasks={project ? [project, ...linkedTasks] : linkedTasks}
        saving={updatingTaskId === editingLinkedTask?.id}
        onClose={() => {
          if (updatingTaskId) return;
          setEditingLinkedTask(null);
        }}
        onSave={handleSaveLinkedTaskEdits}
        onDelete={
          editingLinkedTask
            ? async () => {
                const targetId = editingLinkedTask.id;
                await handleDeleteLinkedTask(targetId);
                setEditingLinkedTask(null);
              }
            : undefined
        }
      />
    </main>
  );
}

function FeaturedLinkedTaskCard({
  task,
  projectGoal,
  nextCandidate,
  brokenNextCandidate,
  missingNextCandidate,
  title,
  reason,
  detail,
  tone,
  onOpen,
  onDone,
  onWaiting,
}: {
  task: Task;
  projectGoal: string | null;
  nextCandidate: Task | null;
  brokenNextCandidate: boolean;
  missingNextCandidate: boolean;
  title: string;
  reason: string;
  detail: string;
  tone: 'danger' | 'warning' | 'info';
  onOpen: () => void;
  onDone: () => void;
  onWaiting: () => void;
}) {
  const toneClassName =
    tone === 'danger'
      ? 'border-rose-200 bg-rose-50 text-rose-700'
      : tone === 'warning'
        ? 'border-amber-200 bg-amber-50 text-amber-700'
        : 'border-blue-200 bg-blue-50 text-blue-700';

  return (
    <article className="rounded-2xl border-2 border-slate-900 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-slate-900 px-2.5 py-1 text-[11px] font-semibold text-white">今やる1件</span>
        <div className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold ${toneClassName}`}>{reason}</div>
      </div>
      <h4 className="mt-3 text-xl font-semibold text-slate-900">{title}</h4>
      <p className="mt-2 text-sm leading-6 text-slate-600">{detail}</p>
      <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
        {projectGoal ? <span className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-600">目的メモ: {projectGoal}</span> : null}
        {task.next_candidate_task_id ? (
          <span className={`rounded-full px-2.5 py-1 ${brokenNextCandidate ? 'bg-amber-100 text-amber-700' : 'bg-blue-50 text-blue-700'}`}>
            次候補: {nextCandidate?.title ?? 'リンク切れ'}
          </span>
        ) : null}
        {missingNextCandidate ? <span className="rounded-full bg-cyan-100 px-2.5 py-1 text-cyan-700">要確認: 次候補なし</span> : null}
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" onClick={onDone} className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-medium text-white transition hover:bg-slate-800">完了</button>
        <button type="button" onClick={onWaiting} className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-medium text-blue-700 transition hover:bg-blue-100">待ち＋日付</button>
        <button type="button" onClick={onOpen} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 transition hover:bg-slate-50">開く</button>
      </div>
    </article>
  );
}

function LinkedTaskMiniCard({
  task,
  projectGoal,
  nextCandidate,
  brokenNextCandidate,
  missingNextCandidate,
  title,
  reason,
  detail,
  tone,
  onOpen,
  onDone,
  onWaiting,
}: {
  task: Task;
  projectGoal: string | null;
  nextCandidate: Task | null;
  brokenNextCandidate: boolean;
  missingNextCandidate: boolean;
  title: string;
  reason: string;
  detail: string;
  tone: 'danger' | 'warning' | 'info';
  onOpen: () => void;
  onDone: () => void;
  onWaiting: () => void;
}) {
  const toneClassName =
    tone === 'danger'
      ? 'border-rose-200 bg-rose-50 text-rose-700'
      : tone === 'warning'
        ? 'border-amber-200 bg-amber-50 text-amber-700'
        : 'border-blue-200 bg-blue-50 text-blue-700';

  return (
    <article className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-slate-100 px-2 py-1 text-[11px] font-medium text-slate-600">次にやる</span>
            <div className={`inline-flex rounded-full border px-2 py-1 text-[11px] font-semibold ${toneClassName}`}>{reason}</div>
          </div>
          <div className="mt-2 text-sm font-semibold text-slate-900">{title}</div>
          <div className="mt-1 text-xs text-slate-600">{detail}</div>
          {projectGoal ? <div className="mt-1 text-[11px] text-slate-500">目的メモ: {projectGoal}</div> : null}
          {task.next_candidate_task_id ? (
            <div className={`mt-1 text-[11px] ${brokenNextCandidate ? 'text-amber-700' : 'text-blue-700'}`}>
              次候補: {nextCandidate?.title ?? 'リンク切れ'}
            </div>
          ) : null}
          {missingNextCandidate ? <div className="mt-1 text-[11px] text-cyan-700">要確認: 次候補なし</div> : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={onOpen} className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-[11px] font-medium text-slate-700 transition hover:bg-slate-50">開く</button>
          <button type="button" onClick={onWaiting} className="rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1.5 text-[11px] font-medium text-blue-700 transition hover:bg-blue-100">待ち＋日付</button>
          <button type="button" onClick={onDone} className="rounded-lg bg-slate-900 px-2.5 py-1.5 text-[11px] font-medium text-white transition hover:bg-slate-800">完了</button>
        </div>
      </div>
    </article>
  );
}

function LinkedTaskCard({
  task,
  projectGoal,
  nextCandidate,
  brokenNextCandidate,
  missingNextCandidate,
  disabled,
  dragging,
  draggable,
  selectionMode,
  selected,
  onToggleSelect,
  onDragStart,
  onDragEnd,
  onEdit,
}: {
  task: Task;
  projectGoal: string | null;
  nextCandidate: Task | null;
  brokenNextCandidate: boolean;
  missingNextCandidate: boolean;
  disabled: boolean;
  dragging: boolean;
  draggable: boolean;
  selectionMode: boolean;
  selected: boolean;
  onToggleSelect: (taskId: string) => void;
  onDragStart: (taskId: string) => void;
  onDragEnd: () => void;
  onEdit: (task: Task) => void;
}) {
  const pointerStartRef = useRef<{ x: number; y: number } | null>(null);
  const movedRef = useRef(false);

  const handlePointerDown = (event: PointerEvent<HTMLElement>) => {
    if (event.button !== 0) return;
    if ((event.target as HTMLElement).closest('[data-no-card-click="true"]')) return;
    pointerStartRef.current = { x: event.clientX, y: event.clientY };
    movedRef.current = false;
  };

  const handlePointerMove = (event: PointerEvent<HTMLElement>) => {
    if (!pointerStartRef.current) return;

    const deltaX = Math.abs(event.clientX - pointerStartRef.current.x);
    const deltaY = Math.abs(event.clientY - pointerStartRef.current.y);

    if (deltaX > 6 || deltaY > 6) {
      movedRef.current = true;
    }
  };

  const handlePointerUp = (event: PointerEvent<HTMLElement>) => {
    const clickedInteractive = (event.target as HTMLElement).closest('[data-no-card-click="true"]');

    if (!clickedInteractive && !movedRef.current && !disabled) {
      onEdit(task);
    }

    pointerStartRef.current = null;
    movedRef.current = false;
  };

  const handlePointerCancel = () => {
    pointerStartRef.current = null;
    movedRef.current = false;
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    if (!disabled) {
      onEdit(task);
    }
  };

  const doingStale = isDoingStale(task);

  return (
    <article
      role="button"
      tabIndex={disabled ? -1 : 0}
      draggable={draggable}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
      onKeyDown={handleKeyDown}
      onDragStart={() => {
        movedRef.current = true;
        onDragStart(task.id);
      }}
      onDragEnd={() => {
        handlePointerCancel();
        onDragEnd();
      }}
      className={`rounded-xl border bg-white p-4 shadow-sm transition focus:outline-none focus:ring-2 focus:ring-slate-300 ${
        selected ? 'border-slate-900 ring-1 ring-slate-200' : 'border-slate-200'
      } ${draggable ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'} ${dragging ? 'opacity-50' : ''}`}
    >
      <div className="flex items-start gap-3">
        {selectionMode ? (
          <label
            data-no-card-click="true"
            className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center"
            onClick={(event) => event.stopPropagation()}
          >
            <input
              type="checkbox"
              checked={selected}
              onChange={() => onToggleSelect(task.id)}
              className="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-400"
            />
          </label>
        ) : null}
        <h4 className="text-base font-semibold text-slate-900">{task.title}</h4>
      </div>

      {task.description ? <p className="mt-1 text-sm text-slate-600">{task.description}</p> : null}

      <div className="mt-3 flex flex-wrap gap-2 text-xs">
        {task.assignee ? <Tag label={`担当: ${task.assignee}`} /> : null}

        <Tag
          label={`重要度: ${IMPORTANCE_LABELS[task.importance]}`}
          className={levelClassName[task.importance]}
        />

        <Tag
          label={`緊急度: ${URGENCY_LABELS[task.urgency]}`}
          className={levelClassName[task.urgency]}
        />

        {doingStale ? (
          <span className="rounded-md bg-amber-100 px-2 py-1 text-amber-700">
            進行停滞
          </span>
        ) : null}

        {task.due_date ? (
          <Tag
            label={`期限: ${formatDate(task.due_date)}`}
            className={
              isOverdue(task.due_date) && task.status !== 'done'
                ? 'bg-rose-100 text-rose-700'
                : isDueSoon(task.due_date) && task.status !== 'done'
                  ? 'bg-amber-100 text-amber-700'
                  : undefined
            }
          />
        ) : null}

        {task.status === 'waiting' ? (
          <Tag
            label={`回答予定: ${isWaitingWithoutResponseDate(task) ? '未設定' : formatDate(task.waiting_response_date)}`}
            className={
              isWaitingResponseOverdue(task)
                ? 'bg-rose-100 text-rose-700'
                : isWaitingWithoutResponseDate(task)
                  ? 'bg-amber-100 text-amber-700'
                  : 'bg-violet-100 text-violet-700'
            }
          />
        ) : null}

        {task.next_candidate_task_id ? (
          <Tag
            label={`次候補: ${nextCandidate?.title ?? 'リンク切れ'}`}
            className={brokenNextCandidate ? 'bg-amber-100 text-amber-700' : 'bg-blue-50 text-blue-700'}
          />
        ) : null}

        {missingNextCandidate ? (
          <Tag
            label="要確認: 次候補なし"
            className="bg-cyan-100 text-cyan-700"
          />
        ) : null}
      </div>

      {projectGoal ? <p className="mt-3 text-[11px] text-slate-500">目的メモ: {projectGoal}</p> : null}
    </article>
  );
}

function QuickSelectButton({
  label,
  count,
  disabled,
  onClick,
}: {
  label: string;
  count: number;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="rounded-full border border-slate-300 bg-white px-3 py-1 text-xs font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {label} {count}件
    </button>
  );
}

function QuickActionButton({
  label,
  disabled,
  onClick,
}: {
  label: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 sm:text-sm"
    >
      {label}にする
    </button>
  );
}

function FilterChip({ label, subtle = false }: { label: string; subtle?: boolean }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ${
        subtle ? 'bg-white text-slate-500 border border-slate-200' : 'bg-slate-100 text-slate-700'
      }`}
    >
      {label}
    </span>
  );
}

function QuickDatePresetButton({
  label,
  disabled,
  onClick,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-[11px] font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 sm:text-xs"
    >
      {label}
    </button>
  );
}

function CompactContextStat({
  label,
  value,
  danger = false,
}: {
  label: string;
  value: string;
  danger?: boolean;
}) {
  const match = value.match(/^(\d+)(.*)$/);
  const leading = match?.[1] ?? value;
  const trailing = match?.[2] ?? '';

  return (
    <article className={`rounded-xl px-3 py-1.5 shadow-sm ring-1 ${danger ? 'bg-rose-50 ring-rose-200/90' : 'bg-slate-50 ring-slate-200/80'}`}>
      <div className="flex items-center justify-between gap-3">
        <p className="text-[11px] text-slate-600">{label}</p>
        <p className={`flex items-baseline gap-0.5 tabular-nums ${danger ? 'text-rose-700' : 'text-slate-900'}`}>
          <span className="text-lg font-semibold tracking-tight">{leading}</span>
          <span className="text-[11px] font-medium text-slate-500">{trailing}</span>
        </p>
      </div>
    </article>
  );
}

function InlineBulkSelect({
  placeholder,
  disabled,
  options,
  onSelect,
}: {
  placeholder: string;
  disabled: boolean;
  options: Array<{ value: string; label: string }>;
  onSelect: (value: string) => void;
}) {
  return (
    <select
      defaultValue=""
      disabled={disabled}
      onChange={(event) => {
        const value = event.target.value;
        if (!value) return;
        onSelect(value);
        event.target.value = '';
      }}
      className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 sm:text-sm"
    >
      <option value="">{placeholder}</option>
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

function RiskChip({ label, count, danger = false }: { label: string; count: number; danger?: boolean }) {
  return (
    <span
      className={`inline-flex items-baseline gap-1 rounded-full px-3 py-1 text-xs font-medium shadow-sm ring-1 ${
        danger
          ? 'bg-rose-50 text-rose-700 ring-rose-200/90'
          : count > 0
            ? 'bg-amber-50 text-amber-700 ring-amber-200/90'
            : 'bg-white text-slate-500 ring-slate-200/80'
      }`}
    >
      <span>{label}</span>
      <span className="text-sm font-semibold tabular-nums">{count}</span>
      <span className="text-[11px]">件</span>
    </span>
  );
}

function SectionExpandButton({
  hiddenCount,
  expanded,
  onToggle,
}: {
  hiddenCount: number;
  expanded: boolean;
  onToggle: () => void;
}) {
  if (hiddenCount <= 0 && !expanded) return null;

  return (
    <div className="flex justify-end">
      <button
        type="button"
        onClick={onToggle}
        className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 transition hover:bg-slate-50"
      >
        {expanded ? '折りたたむ' : `さらに ${hiddenCount} 件`}
      </button>
    </div>
  );
}

function InfoRow({
  label,
  value,
  badge = false,
}: {
  label: string;
  value: string;
  badge?: boolean;
}) {
  return (
    <div>
      <p className="text-sm text-slate-500">{label}</p>
      {badge ? (
        <span className="mt-1 inline-flex rounded-md bg-indigo-100 px-2 py-1 text-sm font-medium text-indigo-700">
          {value}
        </span>
      ) : (
        <p className="mt-1 text-base font-medium text-slate-900">{value}</p>
      )}
    </div>
  );
}

function Tag({
  label,
  className,
}: {
  label: string;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex rounded-md px-2 py-1 text-xs font-medium ${
        className ?? 'bg-slate-100 text-slate-700'
      }`}
    >
      {label}
    </span>
  );
}
