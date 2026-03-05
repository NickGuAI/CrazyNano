// Story brainstorming state management

import { create } from 'zustand';
import type { StoryMessage, FramePrompt } from '@/types';
import { streamBrainstorm, generateFrames } from '@/services/story';

interface StoryState {
  // Chat
  messages: StoryMessage[];
  isStreaming: boolean;
  currentResponse: string;
  chatError: string | null;

  // Frames
  frames: FramePrompt[];
  framesLoading: boolean;
  framesError: string | null;

  // Abort controller for cancellation
  abortController: AbortController | null;

  // Actions
  sendMessage: (message: string, projectId?: string) => void;
  cancelStream: () => void;
  clearChat: () => void;
  generateFramesFromPlot: (plot: string, numFrames?: number, bookStyle?: string) => Promise<void>;
  updateFrame: (index: number, updates: Partial<FramePrompt>) => void;
  deleteFrame: (index: number) => void;
  addFrame: (frame: FramePrompt) => void;
  reorderFrames: () => void;
  clearFrames: () => void;
  setFrames: (frames: FramePrompt[]) => void;
}

export const useStoryStore = create<StoryState>((set, get) => ({
  messages: [],
  isStreaming: false,
  currentResponse: '',
  chatError: null,

  frames: [],
  framesLoading: false,
  framesError: null,

  abortController: null,

  sendMessage: (message: string, projectId?: string) => {
    const { messages, abortController: existingController } = get();

    // Cancel any existing stream
    existingController?.abort();

    // Add user message
    const userMessage: StoryMessage = {
      role: 'user',
      content: message,
      timestamp: new Date().toISOString(),
    };

    set({
      messages: [...messages, userMessage],
      isStreaming: true,
      currentResponse: '',
      chatError: null,
    });

    // Stream response
    const controller = streamBrainstorm(
      {
        message,
        history: messages,
        project_id: projectId,
      },
      // onChunk
      (text) => {
        set((state) => ({
          currentResponse: state.currentResponse + text,
        }));
      },
      // onDone
      () => {
        const response = get().currentResponse;
        const assistantMessage: StoryMessage = {
          role: 'assistant',
          content: response,
          timestamp: new Date().toISOString(),
        };
        set((state) => ({
          messages: [...state.messages, assistantMessage],
          isStreaming: false,
          currentResponse: '',
          abortController: null,
        }));
      },
      // onError
      (error) => {
        set({
          chatError: error.message,
          isStreaming: false,
          currentResponse: '',
          abortController: null,
        });
      }
    );

    set({ abortController: controller });
  },

  cancelStream: () => {
    const { abortController, currentResponse } = get();
    abortController?.abort();

    // If we have partial response, save it
    if (currentResponse) {
      const assistantMessage: StoryMessage = {
        role: 'assistant',
        content: currentResponse + ' [cancelled]',
        timestamp: new Date().toISOString(),
      };
      set((state) => ({
        messages: [...state.messages, assistantMessage],
      }));
    }

    set({
      isStreaming: false,
      currentResponse: '',
      abortController: null,
    });
  },

  clearChat: () => {
    get().abortController?.abort();
    set({
      messages: [],
      isStreaming: false,
      currentResponse: '',
      chatError: null,
      abortController: null,
    });
  },

  generateFramesFromPlot: async (plot: string, numFrames = 5, bookStyle?: string) => {
    set({ framesLoading: true, framesError: null });
    try {
      const frames = await generateFrames({
        plot,
        num_frames: numFrames,
        book_style: bookStyle,
      });
      set({ frames, framesLoading: false });
    } catch (error) {
      set({
        framesError: error instanceof Error ? error.message : 'Failed to generate frames',
        framesLoading: false,
      });
    }
  },

  updateFrame: (index: number, updates: Partial<FramePrompt>) => {
    set((state) => ({
      frames: state.frames.map((f) =>
        f.index === index ? { ...f, ...updates } : f
      ),
    }));
  },

  deleteFrame: (index: number) => {
    set((state) => ({
      frames: state.frames.filter((f) => f.index !== index),
    }));
    // Reorder remaining frames
    get().reorderFrames();
  },

  addFrame: (frame: FramePrompt) => {
    set((state) => ({
      frames: [...state.frames, frame],
    }));
  },

  reorderFrames: () => {
    set((state) => ({
      frames: state.frames.map((f, i) => ({ ...f, index: i })),
    }));
  },

  clearFrames: () => {
    set({ frames: [], framesError: null });
  },

  setFrames: (frames: FramePrompt[]) => {
    set({ frames });
  },
}));
