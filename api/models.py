"""Pydantic models for API request/response types."""
from pydantic import BaseModel, Field
from typing import Optional
from enum import Enum
from datetime import datetime


class Provider(str, Enum):
    """Image generation provider."""
    AUTO = "auto"
    POE = "poe"
    GEMINI = "gemini"
    GEMINI_PRO = "gemini-pro"
    GROK2 = "grok-2"


class StoryProvider(str, Enum):
    """Story/text generation provider."""
    GEMINI = "gemini"
    GROK = "grok"


class GenerationStatus(str, Enum):
    """Status of generation task."""
    PENDING = "pending"
    GENERATING = "generating"
    VALIDATING = "validating"
    COMPLETE = "complete"
    FAILED = "failed"


# Story/Chat Models
class StoryMessage(BaseModel):
    """A message in the story brainstorming chat."""
    role: str = Field(..., description="'user' or 'assistant'")
    content: str
    timestamp: Optional[datetime] = None


class StoryBrainstormRequest(BaseModel):
    """Request to brainstorm story plot with AI."""
    message: str = Field(..., description="User's message to the AI")
    history: list[StoryMessage] = Field(default_factory=list, description="Previous messages in conversation")
    project_id: Optional[str] = None


class FramePrompt(BaseModel):
    """A single frame prompt for image generation."""
    index: int = Field(..., description="Frame number (0-indexed)")
    title: str = Field(..., description="Short title for the frame")
    prompt: str = Field(..., description="Full image generation prompt")


class GenerateFramesRequest(BaseModel):
    """Request to convert plot into frame prompts."""
    plot: str = Field(..., description="The story plot to convert")
    num_frames: int = Field(default=5, ge=1, le=20, description="Number of frames to generate")
    style_hints: Optional[str] = Field(None, description="Optional style guidance")
    book_style: Optional[str] = Field(default="generic", description="Book style preset (coloring, paper-cutting, watercolor, sketch)")


class GenerateFramesResponse(BaseModel):
    """Response with generated frame prompts."""
    frames: list[FramePrompt]


# Image Generation Models
class GenerateImageRequest(BaseModel):
    """Request to generate an image."""
    prompt: str = Field(..., description="Image generation prompt")
    context_image_ids: list[str] = Field(
        default_factory=list,
        description="IDs of previous images to use as context (server loads from storage)"
    )
    provider: Provider = Field(default=Provider.AUTO, description="Provider to use")
    fallback_provider: Provider = Field(default=Provider.GROK2, description="Fallback provider when primary fails")
    project_id: str = Field(..., description="Project to save image to")
    enable_face_validation: bool = Field(default=False, description="Enable face similarity validation")
    face_threshold: float = Field(default=0.85, ge=0.0, le=1.0, description="Face similarity threshold")
    face_max_retries: int = Field(default=3, ge=1, le=10, description="Max retries for face validation")


class GenerationProgress(BaseModel):
    """Progress update during image generation (SSE event)."""
    type: str = Field(..., description="Event type: 'progress', 'provider', 'face_similarity', 'complete', 'error'")
    message: Optional[str] = None
    provider: Optional[str] = None
    similarity: Optional[float] = None
    image_id: Optional[str] = None
    status: GenerationStatus = GenerationStatus.GENERATING


class ImageMetadata(BaseModel):
    """Metadata for a generated image."""
    id: str = Field(..., description="Unique image ID (e.g., 'IMAGE_1')")
    index: int = Field(..., description="Image index in project")
    prompt: Optional[str] = None
    provider: Optional[str] = None
    face_similarity: Optional[float] = None
    created_at: datetime


# Face Similarity Models
class FaceSimilarityRequest(BaseModel):
    """Request to calculate face similarity between two images."""
    image1_id: str = Field(..., description="First image ID")
    image2_id: str = Field(..., description="Second image ID")
    project_id: str


class FaceSimilarityResponse(BaseModel):
    """Response with face similarity score."""
    similarity: Optional[float] = Field(None, description="Similarity score 0-1, null if no face detected")
    meets_threshold: bool = Field(..., description="Whether similarity meets default threshold")
    error: Optional[str] = None


# Project Models
class ProjectSummary(BaseModel):
    """Summary of a project for listing."""
    id: str = Field(..., description="Project ID (directory name)")
    name: str
    project_type: str = Field(default="story", description="Type: 'story' or 'album'")
    created: Optional[datetime] = None
    image_count: int = 0
    frame_count: int = 0
    book_style: Optional[str] = Field(default="generic", description="Visual style for story books")


class ProjectDetail(BaseModel):
    """Full project details."""
    id: str
    name: str
    project_type: str = Field(default="story", description="Type: 'story' or 'album'")
    created: Optional[datetime] = None
    prompts: list[tuple[int, str]] = Field(default_factory=list)
    images: list[ImageMetadata] = Field(default_factory=list)
    face_validation_enabled: bool = False
    providers_used: list[str] = Field(default_factory=list)
    num_steps: int = Field(default=5, description="Number of transformation steps (album only)")
    has_target_image: bool = Field(default=False, description="Whether target image is set (album only)")
    book_style: Optional[str] = Field(default="generic", description="Visual style for story books")


class ProjectType(str, Enum):
    """Project type."""
    STORY = "story"
    ALBUM = "album"


class CreateProjectRequest(BaseModel):
    """Request to create a new project."""
    name: str = Field(..., min_length=1, max_length=100)
    project_type: ProjectType = Field(default=ProjectType.STORY, description="Type of project")
    book_style: Optional[str] = Field(default="generic", description="Visual style for story books (coloring, paper-cutting, watercolor, sketch)")


class CreateProjectResponse(BaseModel):
    """Response after creating a project."""
    id: str
    name: str
    created: datetime


# Health/Status Models
class HealthResponse(BaseModel):
    """API health check response."""
    status: str = "ok"
    version: str = "1.0.0"
    face_recognition_available: bool = False
    providers: list[str] = Field(default_factory=list)
    current_provider: str = "poe"
    fallback_provider: str = "grok-2"
    story_provider: str = "gemini"


class StoryProviderResponse(BaseModel):
    """Response for story provider settings."""
    provider: str
    available: list[str] = Field(default_factory=list)


class SetStoryProviderRequest(BaseModel):
    """Request to change the story provider."""
    provider: StoryProvider


# Album Models
class AlbumSetupRequest(BaseModel):
    """Request to setup album with initial and target images."""
    project_name: str = Field(..., min_length=1, max_length=100)
    initial_image: str = Field(..., description="Base64 encoded initial image")
    target_image: str = Field(..., description="Base64 encoded target image")
    num_steps: int = Field(default=5, ge=1, le=10, description="Number of transformation steps")


class AlbumSetupResponse(BaseModel):
    """Response after album setup."""
    project_id: str
    name: str
    created: datetime
    num_steps: int


class AlbumGeneratePromptsRequest(BaseModel):
    """Request to generate transformation prompts for album."""
    project_id: str
    meta_prompt: Optional[str] = Field(None, description="Custom meta prompt for Grok-4")


class AlbumStepPrompt(BaseModel):
    """A single step prompt for album transformation."""
    step_num: int
    prompt: str


class AlbumGeneratePromptsResponse(BaseModel):
    """Response with generated step prompts."""
    prompts: list[AlbumStepPrompt]


class AlbumRunRequest(BaseModel):
    """Request to run album transformation pipeline."""
    project_id: str
    provider: Provider = Field(default=Provider.AUTO, description="Provider to use")
    fallback_provider: Provider = Field(default=Provider.GROK2, description="Fallback provider when primary fails")
    enable_face_validation: bool = Field(default=True, description="Enable face similarity validation")
    face_threshold: float = Field(default=0.85, ge=0.0, le=1.0, description="Face similarity threshold")
    face_max_retries: int = Field(default=3, ge=1, le=10, description="Max retries for face validation")
    start_step: int = Field(default=1, ge=1, description="Step number to start from (skip earlier steps)")
    start_over: bool = Field(default=False, description="Reset all progress and start from beginning")


class AlbumStatus(BaseModel):
    """Current status of album transformation."""
    project_id: str
    current_step: int = 0
    total_steps: int = 0
    status: str = "pending"  # pending, running, complete, failed
    images_generated: int = 0
