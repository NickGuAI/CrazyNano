// Album transformation state management

import { create } from 'zustand';
import type { AlbumStepPrompt, AlbumRunSSEEvent, Provider } from '@/types';
import {
  setupAlbum,
  streamGeneratePrompts,
  getAlbumPrompts,
  updateAlbumPrompts,
  streamAlbumRun,
} from '@/services/album';

interface AlbumStep {
  stepNum: number;
  prompt: string;
  status: 'pending' | 'generating' | 'complete' | 'error';
  imageId?: string;
  similarity?: number | null;
  provider?: string;
  error?: string;
}

interface AlbumState {
  // Setup
  albumName: string;
  initialImage: string | null;
  targetImage: string | null;
  numSteps: number;

  // Prompts
  prompts: AlbumStepPrompt[];
  isGeneratingPrompts: boolean;
  promptsError: string | null;
  promptProgress: string;

  // Transformation
  steps: AlbumStep[];
  isRunning: boolean;
  currentStep: number;
  runError: string | null;

  // Settings
  provider: Provider;
  fallbackProvider: Provider;
  enableFaceValidation: boolean;
  faceThreshold: number;
  maxRetries: number;

  // Abort controller
  abortController: AbortController | null;

  // Actions
  setAlbumName: (name: string) => void;
  setInitialImage: (image: string | null) => void;
  setTargetImage: (image: string | null) => void;
  setNumSteps: (steps: number) => void;

  createAlbumProject: (name: string) => Promise<string>;
  generatePrompts: (projectId: string, metaPrompt?: string | null) => void;
  loadPrompts: (projectId: string) => Promise<void>;
  updatePrompt: (stepNum: number, prompt: string) => void;
  savePrompts: (projectId: string) => Promise<void>;

  runTransformation: (projectId: string, startOver?: boolean) => void;
  retryStep: (projectId: string, stepNum: number) => void;
  cancelRun: () => void;

  setProvider: (provider: Provider) => void;
  setFallbackProvider: (provider: Provider) => void;
  setFaceValidation: (enabled: boolean) => void;
  setFaceThreshold: (threshold: number) => void;
  setMaxRetries: (retries: number) => void;

  clearAlbum: () => void;
  initFromPrompts: (prompts: AlbumStepPrompt[]) => void;
}

export const useAlbumStore = create<AlbumState>((set, get) => ({
  albumName: '',
  initialImage: null,
  targetImage: null,
  numSteps: 5,

  prompts: [],
  isGeneratingPrompts: false,
  promptsError: null,
  promptProgress: '',

  steps: [],
  isRunning: false,
  currentStep: 0,
  runError: null,

  provider: 'poe',
  fallbackProvider: 'grok-2',
  enableFaceValidation: true,
  faceThreshold: 0.85,
  maxRetries: 3,

  abortController: null,

  setAlbumName: (name) => set({ albumName: name }),
  setInitialImage: (image) => set({ initialImage: image }),
  setTargetImage: (image) => set({ targetImage: image }),
  setNumSteps: (steps) => set({ numSteps: steps }),

  createAlbumProject: async (name: string) => {
    const { initialImage, targetImage, numSteps } = get();
    if (!initialImage || !targetImage) {
      throw new Error('Both initial and target images are required');
    }

    const response = await setupAlbum({
      project_name: name,
      initial_image: initialImage,
      target_image: targetImage,
      num_steps: numSteps,
    });

    return response.project_id;
  },

  generatePrompts: (projectId: string, metaPrompt?: string | null) => {
    const { abortController: existing } = get();
    existing?.abort();

    set({
      isGeneratingPrompts: true,
      promptsError: null,
      promptProgress: 'Starting...',
      prompts: [],
    });

    const prompts: AlbumStepPrompt[] = [];

    const controller = streamGeneratePrompts(
      projectId,
      metaPrompt || null,
      (event) => {
        if (event.type === 'progress') {
          set({ promptProgress: event.message || '' });
        } else if (event.type === 'prompt') {
          prompts.push({
            step_num: event.step_num!,
            prompt: event.prompt!,
          });
          set({ prompts: [...prompts] });
        } else if (event.type === 'done') {
          set({
            isGeneratingPrompts: false,
            promptProgress: '',
            abortController: null,
          });
        } else if (event.type === 'error') {
          set({
            promptsError: event.message || 'Unknown error',
            isGeneratingPrompts: false,
            promptProgress: '',
            abortController: null,
          });
        }
      },
      (error) => {
        set({
          promptsError: error.message,
          isGeneratingPrompts: false,
          promptProgress: '',
          abortController: null,
        });
      }
    );

    set({ abortController: controller });
  },

  loadPrompts: async (projectId: string) => {
    try {
      const prompts = await getAlbumPrompts(projectId);
      set({ prompts });
    } catch (error) {
      set({
        promptsError: error instanceof Error ? error.message : 'Failed to load prompts',
      });
    }
  },

  updatePrompt: (stepNum: number, prompt: string) => {
    set((state) => ({
      prompts: state.prompts.map((p) =>
        p.step_num === stepNum ? { ...p, prompt } : p
      ),
    }));
  },

  savePrompts: async (projectId: string) => {
    const { prompts } = get();
    await updateAlbumPrompts(projectId, prompts);
  },

  runTransformation: (projectId: string, startOver: boolean = false) => {
    console.log('[runTransformation] called with projectId:', projectId, 'startOver:', startOver);
    const { abortController: existing, prompts, steps: existingSteps, provider, fallbackProvider, enableFaceValidation, faceThreshold, maxRetries } = get();
    console.log('[runTransformation] state:', { promptsCount: prompts.length, stepsCount: existingSteps.length, provider, fallbackProvider, enableFaceValidation, faceThreshold, maxRetries });
    existing?.abort();

    // Check if we have existing steps with some completed (resume mode)
    const hasCompletedSteps = !startOver && existingSteps.length > 0 && existingSteps.some(s => s.status === 'complete');

    // Reinitialize all steps if startOver=true or no completed steps
    const steps: AlbumStep[] = hasCompletedSteps
      ? existingSteps
      : prompts.map((p) => ({
          stepNum: p.step_num,
          prompt: p.prompt,
          status: 'pending' as const,
        }));

    // Find first pending step to resume from (or step 1 if starting over)
    const firstPendingStep = steps.find(s => s.status === 'pending' || s.status === 'error');
    const startStep = startOver ? 1 : (firstPendingStep?.stepNum ?? 1);

    set({
      isRunning: true,
      runError: null,
      steps,
      currentStep: startStep,
    });

    console.log('[runTransformation] calling streamAlbumRun with options:', { provider, fallbackProvider, enableFaceValidation, faceThreshold, maxRetries, startStep, startOver });
    const controller = streamAlbumRun(
      projectId,
      { provider, fallbackProvider, enableFaceValidation, faceThreshold, faceMaxRetries: maxRetries, startStep, startOver },
      (event: AlbumRunSSEEvent) => {
        if (event.type === 'start') {
          set({ currentStep: 0 });
        } else if (event.type === 'step_start') {
          set((state) => ({
            currentStep: event.step || 0,
            steps: state.steps.map((s) =>
              s.stepNum === event.step ? { ...s, status: 'generating' } : s
            ),
          }));
        } else if (event.type === 'step_complete') {
          set((state) => ({
            steps: state.steps.map((s) =>
              s.stepNum === event.step
                ? {
                    ...s,
                    status: 'complete',
                    imageId: event.image_id,
                    provider: event.provider,
                    similarity: event.similarity,
                  }
                : s
            ),
          }));
        } else if (event.type === 'step_error') {
          set((state) => ({
            steps: state.steps.map((s) =>
              s.stepNum === event.step
                ? { ...s, status: 'error', error: event.message }
                : s
            ),
          }));
        } else if (event.type === 'complete') {
          set({
            isRunning: false,
            abortController: null,
          });
        } else if (event.type === 'error') {
          set({
            runError: event.message || 'Unknown error',
            isRunning: false,
            abortController: null,
          });
        }
      },
      (error) => {
        set({
          runError: error.message,
          isRunning: false,
          abortController: null,
        });
      }
    );

    set({ abortController: controller });
  },

  cancelRun: () => {
    const { abortController } = get();
    abortController?.abort();
    set({
      isRunning: false,
      abortController: null,
    });
  },

  retryStep: (projectId: string, stepNum: number) => {
    // Reset the failed step to pending
    set((state) => ({
      steps: state.steps.map((s) =>
        s.stepNum === stepNum
          ? { ...s, status: 'pending', imageId: undefined, similarity: undefined, provider: undefined, error: undefined }
          : s
      ),
      runError: null,
    }));

    // Start transformation (it will continue from first pending step)
    get().runTransformation(projectId);
  },

  setProvider: (provider) => set({ provider }),
  setFallbackProvider: (provider) => set({ fallbackProvider: provider }),
  setFaceValidation: (enabled) => set({ enableFaceValidation: enabled }),
  setFaceThreshold: (threshold) => set({ faceThreshold: threshold }),
  setMaxRetries: (retries) => set({ maxRetries: retries }),

  clearAlbum: () => {
    get().abortController?.abort();
    set({
      albumName: '',
      initialImage: null,
      targetImage: null,
      numSteps: 5,
      prompts: [],
      isGeneratingPrompts: false,
      promptsError: null,
      promptProgress: '',
      steps: [],
      isRunning: false,
      currentStep: 0,
      runError: null,
      abortController: null,
    });
  },

  initFromPrompts: (prompts: AlbumStepPrompt[]) => {
    const steps: AlbumStep[] = prompts.map((p) => ({
      stepNum: p.step_num,
      prompt: p.prompt,
      status: 'pending',
    }));
    set({ prompts, steps });
  },
}));
