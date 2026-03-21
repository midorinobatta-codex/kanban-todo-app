export type ProjectRow = {
  id: string;
  title: string;
  description: string | null;
  created_at: string;
  started_at: string | null;
  due_date: string | null;
  status: 'todo' | 'doing' | 'waiting' | 'done';
};

export type Project = {
  id: string;
  title: string;
  description: string | null;
  createdAt: string;
  startedAt: string | null;
  dueDate: string | null;
  status: 'todo' | 'doing' | 'waiting' | 'done';
  linkedTaskCount: number;
  nextActionCount: number;
  doneCount: number;
  overdueCount: number;
  completionRate: number;
};

export type CreateProjectInput = {
  title: string;
};

export function mapProjectRow(row: ProjectRow): Project {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    createdAt: row.created_at,
    startedAt: row.started_at,
    dueDate: row.due_date,
    status: row.status,
    linkedTaskCount: 0,
    nextActionCount: 0,
    doneCount: 0,
    overdueCount: 0,
    completionRate: 0,
  };
}
