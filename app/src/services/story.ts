// Story brainstorming API service

import { request, streamSSE } from './api';
import type { StoryMessage, FramePrompt, StorySSEEvent } from '@/types';

export interface BrainstormRequest {
  message: string;
  history: StoryMessage[];
  project_id?: string;
}

export function streamBrainstorm(
  req: BrainstormRequest,
  onChunk: (text: string) => void,
  onDone: () => void,
  onError: (error: Error) => void
): AbortController {
  return streamSSE<StorySSEEvent>(
    '/story/brainstorm',
    req,
    (event) => {
      if (event.type === 'content' && event.text) {
        onChunk(event.text);
      } else if (event.type === 'done') {
        onDone();
      } else if (event.type === 'error') {
        onError(new Error(event.message || 'Unknown error'));
      }
    },
    onError
  );
}

export interface GenerateFramesRequest {
  plot: string;
  num_frames?: number;
  style_hints?: string;
  book_style?: string;
}

export async function generateFrames(req: GenerateFramesRequest): Promise<FramePrompt[]> {
  const response = await request<{ frames: FramePrompt[] }>('/story/frames', {
    method: 'POST',
    body: JSON.stringify({
      plot: req.plot,
      num_frames: req.num_frames ?? 5,
      style_hints: req.style_hints,
      book_style: req.book_style,
    }),
  });
  return response.frames;
}
