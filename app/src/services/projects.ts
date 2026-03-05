// Project API service

import { request } from './api';
import type { ProjectSummary, ProjectDetail } from '@/types';

export async function listProjects(): Promise<ProjectSummary[]> {
  return request<ProjectSummary[]>('/projects');
}

export async function createProject(name: string, bookStyle?: string): Promise<{ id: string; name: string; created: string }> {
  return request('/projects', {
    method: 'POST',
    body: JSON.stringify({ name, book_style: bookStyle ?? 'generic' }),
  });
}

export async function getProject(projectId: string): Promise<ProjectDetail> {
  return request<ProjectDetail>(`/projects/${encodeURIComponent(projectId)}`);
}

export function getImageUrl(projectId: string, imageId: string): string {
  return `/api/projects/${encodeURIComponent(projectId)}/images/${encodeURIComponent(imageId)}`;
}
