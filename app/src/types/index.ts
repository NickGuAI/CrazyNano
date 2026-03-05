// Types matching the FastAPI models

export type Provider = 'auto' | 'poe' | 'gemini' | 'gemini-pro' | 'grok-2';

export type GenerationStatus = 'pending' | 'generating' | 'validating' | 'complete' | 'failed';

export type ProjectType = 'story' | 'album';
export type BookStyle = 'generic' | 'coloring' | 'paper-cutting' | 'watercolor' | 'sketch';

// Story/Chat
export interface StoryMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp?: string;
}

export interface FramePrompt {
  index: number;
  title: string;
  prompt: string;
}

// Image Generation
export interface GenerateImageRequest {
  prompt: string;
  context_image_ids: string[];
  provider: Provider;
  project_id: string;
  enable_face_validation: boolean;
  face_threshold: number;
  face_max_retries: number;
}

export interface GenerationProgress {
  type: 'progress' | 'provider' | 'face_similarity' | 'complete' | 'error';
  message?: string;
  provider?: string;
  similarity?: number;
  image_id?: string;
  status?: GenerationStatus;
}

export interface ImageMetadata {
  id: string;
  index: number;
  prompt?: string;
  provider?: string;
  face_similarity?: number;
  created_at: string;
}

// Projects
export interface ProjectSummary {
  id: string;
  name: string;
  project_type: ProjectType;
  created?: string;
  image_count: number;
  frame_count: number;
  book_style?: BookStyle;
}

export interface ProjectDetail {
  id: string;
  name: string;
  project_type: ProjectType;
  created?: string;
  prompts: [number, string][];
  images: ImageMetadata[];
  face_validation_enabled: boolean;
  providers_used: string[];
  num_steps: number;
  has_target_image: boolean;
  book_style?: BookStyle;
}

// Face Similarity
export interface FaceSimilarityResponse {
  similarity: number | null;
  meets_threshold: boolean;
  error?: string;
}

// Health
export interface HealthResponse {
  status: string;
  version: string;
  face_recognition_available: boolean;
  providers: string[];
}

// SSE Event types
export interface SSEEvent {
  type: string;
  [key: string]: unknown;
}

export interface StorySSEEvent {
  type: 'content' | 'done' | 'error';
  text?: string;
  message?: string;
}

// Album types
export interface AlbumSetupRequest {
  project_name: string;
  initial_image: string;
  target_image: string;
  num_steps: number;
}

export interface AlbumSetupResponse {
  project_id: string;
  name: string;
  created: string;
  num_steps: number;
}

export interface AlbumStepPrompt {
  step_num: number;
  prompt: string;
}

export interface AlbumPromptSSEEvent {
  type: 'progress' | 'prompt' | 'done' | 'error';
  message?: string;
  step_num?: number;
  prompt?: string;
  total_prompts?: number;
}

export interface AlbumRunSSEEvent {
  type: 'start' | 'step_start' | 'step_complete' | 'step_error' | 'complete' | 'error';
  message?: string;
  step?: number;
  prompt?: string;
  image_id?: string;
  provider?: string;
  similarity?: number | null;
  total_steps?: number;
  total_images?: number;
}

export interface AlbumStatus {
  project_id: string;
  current_step: number;
  total_steps: number;
  status: 'pending' | 'running' | 'partial' | 'complete' | 'failed';
  images_generated: number;
}
