// Image generation state management

import { create } from 'zustand';
import type { Provider, GenerationStatus, GenerationProgress } from '@/types';
import { streamGeneration } from '@/services/generation';

interface QueueItem {
  id: string;
  prompt: string;
  title: string;
  status: GenerationStatus;
  provider?: string;
  similarity?: number;
  imageId?: string;
}

interface GenerationState {
  // Provider selection
  provider: Provider;
  fallbackProvider: Provider;
  enableFaceValidation: boolean;
  faceThreshold: number;
  maxRetries: number;

  // Generation queue
  queue: QueueItem[];
  currentIndex: number;
  isGenerating: boolean;
  generationError: string | null;

  // Current project context for auto-continuation
  currentProjectId: string | null;

  // Progress
  currentProgress: string | null;
  lastSimilarity: number | null;
  lastProvider: string | null;

  // Abort controller
  abortController: AbortController | null;

  // Actions
  setProvider: (provider: Provider) => void;
  setFallbackProvider: (provider: Provider) => void;
  setFaceValidation: (enabled: boolean) => void;
  setFaceThreshold: (threshold: number) => void;
  setMaxRetries: (retries: number) => void;

  // Queue management
  addToQueue: (items: { prompt: string; title: string }[]) => void;
  clearQueue: () => void;
  removeFromQueue: (id: string) => void;

  // Generation
  startGeneration: (projectId: string, contextImageIds: string[]) => void;
  startFromIndex: (projectId: string, contextImageIds: string[], index: number) => void;
  retryItem: (itemId: string, projectId: string, contextImageIds: string[]) => void;
  cancelGeneration: () => void;
  onGenerationProgress: (progress: GenerationProgress) => void;
}

let nextQueueId = 0;

export const useGenerationStore = create<GenerationState>((set, get) => ({
  provider: 'poe',
  fallbackProvider: 'grok-2',
  enableFaceValidation: false,
  faceThreshold: 0.85,
  maxRetries: 3,

  queue: [],
  currentIndex: 0,
  isGenerating: false,
  generationError: null,

  currentProjectId: null,

  currentProgress: null,
  lastSimilarity: null,
  lastProvider: null,

  abortController: null,

  setProvider: (provider) => set({ provider }),
  setFallbackProvider: (provider) => set({ fallbackProvider: provider }),
  setFaceValidation: (enabled) => set({ enableFaceValidation: enabled }),
  setFaceThreshold: (threshold) => set({ faceThreshold: threshold }),
  setMaxRetries: (retries) => set({ maxRetries: retries }),

  addToQueue: (items) => {
    const newItems: QueueItem[] = items.map((item) => ({
      id: `queue-${nextQueueId++}`,
      prompt: item.prompt,
      title: item.title,
      status: 'pending' as const,
    }));
    set((state) => ({
      queue: [...state.queue, ...newItems],
    }));
  },

  clearQueue: () => {
    get().abortController?.abort();
    set({
      queue: [],
      currentIndex: 0,
      isGenerating: false,
      generationError: null,
      currentProjectId: null,
      abortController: null,
    });
  },

  removeFromQueue: (id) => {
    set((state) => ({
      queue: state.queue.filter((item) => item.id !== id),
    }));
  },

  startGeneration: (projectId, contextImageIds) => {
    const { queue, currentIndex, provider, fallbackProvider, enableFaceValidation, faceThreshold, maxRetries } = get();

    if (currentIndex >= queue.length) {
      set({ isGenerating: false, currentProjectId: null });
      return;
    }

    const currentItem = queue[currentIndex];

    // Update status to generating and store projectId for auto-continuation
    set((state) => ({
      isGenerating: true,
      generationError: null,
      currentProgress: 'Starting generation...',
      currentProjectId: projectId,
      queue: state.queue.map((item, i) =>
        i === currentIndex ? { ...item, status: 'generating' as const } : item
      ),
    }));

    // Start SSE stream
    const controller = streamGeneration(
      {
        prompt: currentItem.prompt,
        context_image_ids: contextImageIds,
        provider,
        fallback_provider: fallbackProvider,
        project_id: projectId,
        enable_face_validation: enableFaceValidation,
        face_threshold: faceThreshold,
        face_max_retries: maxRetries,
      },
      get().onGenerationProgress,
      (error) => {
        set((state) => ({
          generationError: error.message,
          isGenerating: false,
          queue: state.queue.map((item, i) =>
            i === state.currentIndex ? { ...item, status: 'failed' as const } : item
          ),
        }));
      }
    );

    set({ abortController: controller });
  },

  startFromIndex: (projectId, contextImageIds, index) => {
    set({ currentIndex: index });
    get().startGeneration(projectId, contextImageIds);
  },

  retryItem: (itemId, projectId, contextImageIds) => {
    const { queue } = get();
    const itemIndex = queue.findIndex((item) => item.id === itemId);
    if (itemIndex === -1) return;

    // Reset item status to pending
    set((state) => ({
      queue: state.queue.map((item) =>
        item.id === itemId ? { ...item, status: 'pending' as const, provider: undefined, similarity: undefined, imageId: undefined } : item
      ),
      generationError: null,
    }));

    // Start generation from this item's index
    get().startFromIndex(projectId, contextImageIds, itemIndex);
  },

  cancelGeneration: () => {
    const { abortController } = get();
    abortController?.abort();
    set((state) => ({
      isGenerating: false,
      abortController: null,
      queue: state.queue.map((item, i) =>
        i === state.currentIndex && item.status === 'generating'
          ? { ...item, status: 'pending' as const }
          : item
      ),
    }));
  },

  onGenerationProgress: (progress) => {
    const { queue, currentIndex } = get();

    switch (progress.type) {
      case 'progress':
        set({ currentProgress: progress.message || null });
        if (progress.status) {
          set((state) => ({
            queue: state.queue.map((item, i) =>
              i === currentIndex ? { ...item, status: progress.status! } : item
            ),
          }));
        }
        break;

      case 'provider':
        set({
          lastProvider: progress.provider || null,
          currentProgress: progress.message || null,
        });
        set((state) => ({
          queue: state.queue.map((item, i) =>
            i === currentIndex ? { ...item, provider: progress.provider } : item
          ),
        }));
        break;

      case 'face_similarity':
        set({
          lastSimilarity: progress.similarity ?? null,
          currentProgress: progress.message || null,
        });
        set((state) => ({
          queue: state.queue.map((item, i) =>
            i === currentIndex ? { ...item, similarity: progress.similarity } : item
          ),
        }));
        break;

      case 'complete': {
        set((state) => ({
          queue: state.queue.map((item, i) =>
            i === currentIndex
              ? {
                  ...item,
                  status: 'complete' as const,
                  imageId: progress.image_id,
                  provider: progress.provider || item.provider,
                  similarity: progress.similarity ?? item.similarity,
                }
              : item
          ),
          currentIndex: state.currentIndex + 1,
          currentProgress: null,
          abortController: null,
        }));

        // Auto-continue to next item
        const nextIndex = get().currentIndex;
        if (nextIndex < queue.length) {
          // Small delay before next
          setTimeout(() => {
            const state = get();
            if (state.isGenerating && state.currentIndex < state.queue.length && state.currentProjectId) {
              // Get all completed image IDs as context
              const contextIds = state.queue
                .filter((item) => item.status === 'complete' && item.imageId)
                .map((item) => item.imageId!);
              state.startGeneration(state.currentProjectId, contextIds);
            }
          }, 500);
        } else {
          set({ isGenerating: false, currentProjectId: null });
        }
        break;
      }

      case 'error':
        set((state) => ({
          generationError: progress.message || 'Unknown error',
          isGenerating: false,
          queue: state.queue.map((item, i) =>
            i === currentIndex ? { ...item, status: 'failed' as const } : item
          ),
        }));
        break;
    }
  },
}));
