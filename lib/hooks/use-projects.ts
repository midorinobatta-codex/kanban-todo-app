'use client';

import { useCallback, useEffect, useState } from 'react';
import type { CreateProjectInput, Project } from '@/lib/domain/project';
import {
  createProject as createProjectRecord,
  deleteProject as deleteProjectRecord,
  listProjects,
} from '@/lib/infra/supabase/project-repository';

type UseProjectsResult = {
  projects: Project[];
  isLoading: boolean;
  error: string | null;
  reload: () => Promise<void>;
  createProject: (input: CreateProjectInput) => Promise<void>;
  deleteProject: (projectId: string) => Promise<void>;
};

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  if (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof (error as { message?: unknown }).message === 'string'
  ) {
    return (error as { message: string }).message;
  }

  return fallback;
}

export function useProjects(): UseProjectsResult {
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const nextProjects = await listProjects();
      setProjects(nextProjects);
    } catch (err) {
      console.error(err);
      setError(getErrorMessage(err, 'プロジェクトの取得に失敗しました'));
    } finally {
      setIsLoading(false);
    }
  }, []);

  const createProject = useCallback(
    async (input: CreateProjectInput) => {
      setError(null);

      try {
        await createProjectRecord(input);
        await reload();
      } catch (err) {
        console.error(err);
        const message = getErrorMessage(err, 'プロジェクトの作成に失敗しました');
        setError(message);
        throw new Error(message);
      }
    },
    [reload],
  );

  const deleteProject = useCallback(
    async (projectId: string) => {
      setError(null);

      try {
        await deleteProjectRecord(projectId);
        setProjects((current) => current.filter((project) => project.id !== projectId));
      } catch (err) {
        console.error(err);
        const message = getErrorMessage(err, 'プロジェクトの削除に失敗しました');
        setError(message);
        throw new Error(message);
      }
    },
    [],
  );

  useEffect(() => {
    void reload();
  }, [reload]);

  return {
    projects,
    isLoading,
    error,
    reload,
    createProject,
    deleteProject,
  };
}