// Album transformation API services

import { request, streamSSE } from './api';
import type {
  AlbumSetupRequest,
  AlbumSetupResponse,
  AlbumStepPrompt,
  AlbumPromptSSEEvent,
  AlbumRunSSEEvent,
  AlbumStatus,
  Provider,
} from '@/types';

export async function setupAlbum(data: AlbumSetupRequest): Promise<AlbumSetupResponse> {
  return request<AlbumSetupResponse>('/album/setup', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export function streamGeneratePrompts(
  projectId: string,
  metaPrompt: string | null,
  onEvent: (event: AlbumPromptSSEEvent) => void,
  onError?: (error: Error) => void
): AbortController {
  return streamSSE<AlbumPromptSSEEvent>(
    '/album/generate-prompts',
    { project_id: projectId, meta_prompt: metaPrompt },
    onEvent,
    onError
  );
}

export async function getAlbumPrompts(projectId: string): Promise<AlbumStepPrompt[]> {
  const response = await request<{ prompts: AlbumStepPrompt[] }>(
    `/album/${projectId}/prompts`
  );
  return response.prompts;
}

export async function updateAlbumPrompts(
  projectId: string,
  prompts: AlbumStepPrompt[]
): Promise<void> {
  await request(`/album/${projectId}/prompts`, {
    method: 'PUT',
    body: JSON.stringify(prompts),
  });
}

export function streamAlbumRun(
  projectId: string,
  options: {
    provider?: Provider;
    fallbackProvider?: Provider;
    enableFaceValidation?: boolean;
    faceThreshold?: number;
    faceMaxRetries?: number;
    startStep?: number;
    startOver?: boolean;
  },
  onEvent: (event: AlbumRunSSEEvent) => void,
  onError?: (error: Error) => void
): AbortController {
  console.log('[streamAlbumRun] called with projectId:', projectId, 'options:', options);
  const requestBody = {
    project_id: projectId,
    provider: options.provider || 'auto',
    fallback_provider: options.fallbackProvider || 'grok-2',
    enable_face_validation: options.enableFaceValidation ?? true,
    face_threshold: options.faceThreshold ?? 0.85,
    face_max_retries: options.faceMaxRetries ?? 3,
    start_step: options.startStep ?? 1,
    start_over: options.startOver ?? false,
  };
  console.log('[streamAlbumRun] request body:', requestBody);
  return streamSSE<AlbumRunSSEEvent>(
    '/album/run',
    requestBody,
    onEvent,
    onError
  );
}

export async function getAlbumStatus(projectId: string): Promise<AlbumStatus> {
  return request<AlbumStatus>(`/album/${projectId}/status`);
}

export function getTargetImageUrl(projectId: string): string {
  return `/api/projects/${projectId}/target`;
}
