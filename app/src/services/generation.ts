// Image generation API service

import { request, streamSSE } from './api';
import type { Provider, GenerationProgress, FaceSimilarityResponse, HealthResponse } from '@/types';

export interface GenerateRequest {
  prompt: string;
  context_image_ids: string[];
  provider: Provider;
  fallback_provider: Provider;
  project_id: string;
  enable_face_validation: boolean;
  face_threshold: number;
  face_max_retries: number;
}

export function streamGeneration(
  req: GenerateRequest,
  onProgress: (progress: GenerationProgress) => void,
  onError: (error: Error) => void
): AbortController {
  return streamSSE<GenerationProgress>(
    '/generate',
    req,
    onProgress,
    onError
  );
}

export async function getGenerationStatus(projectId: string): Promise<{ active: boolean }> {
  return request<{ active: boolean }>(`/generate/status/${encodeURIComponent(projectId)}`);
}

export async function checkFaceSimilarity(
  projectId: string,
  image1Id: string,
  image2Id: string
): Promise<FaceSimilarityResponse> {
  return request<FaceSimilarityResponse>('/face/similarity', {
    method: 'POST',
    body: JSON.stringify({
      project_id: projectId,
      image1_id: image1Id,
      image2_id: image2Id,
    }),
  });
}

export async function getHealth(): Promise<HealthResponse> {
  return request<HealthResponse>('/health');
}
