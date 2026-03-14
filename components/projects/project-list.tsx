import { ProjectCard } from '@/components/projects/project-card';
import type { Project } from '@/lib/domain/project';

type ProjectListProps = {
  projects: Project[];
  isLoading: boolean;
  error: string | null;
  onDelete: (projectId: string) => Promise<void>;
};

export function ProjectList({
  projects,
  isLoading,
  error,
  onDelete,
}: ProjectListProps) {
  if (isLoading) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600 shadow-sm">
        プロジェクトを読み込んでいます...
      </div>
    );
  }

  if (error && projects.length === 0) {
    return (
      <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-sm text-rose-700">
        {error}
      </div>
    );
  }

  if (projects.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-600">
        まだプロジェクトはありません。
      </div>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {projects.map((project) => (
        <ProjectCard
          key={project.id}
          project={project}
          onDelete={onDelete}
        />
      ))}
    </div>
  );
}