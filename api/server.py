"""FastAPI server wrapping nano_crazer Python modules."""
import sys
import json
import asyncio
from pathlib import Path
from datetime import datetime
from contextlib import asynccontextmanager
from typing import AsyncGenerator

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel


def sse_response(generator: AsyncGenerator[str, None]) -> StreamingResponse:
    """Wrap an async generator with SSE formatting and explicit flush."""
    async def format_sse():
        async for data in generator:
            yield f"data: {data}\n\n"
            # Force event loop to send data immediately
            await asyncio.sleep(0)
    return StreamingResponse(format_sse(), media_type="text/event-stream")

# Add parent directory to path for imports (nano_crazer modules are in parent)
sys.path.insert(0, str(Path(__file__).parent.parent))

from models import (
    Provider, GenerationStatus, StoryMessage, StoryBrainstormRequest,
    FramePrompt, GenerateFramesRequest, GenerateFramesResponse,
    GenerateImageRequest, GenerationProgress, ImageMetadata,
    FaceSimilarityRequest, FaceSimilarityResponse,
    ProjectSummary, ProjectDetail, CreateProjectRequest, CreateProjectResponse,
    HealthResponse,
    AlbumSetupRequest, AlbumSetupResponse,
    AlbumGeneratePromptsRequest, AlbumStepPrompt, AlbumGeneratePromptsResponse,
    AlbumRunRequest, AlbumStatus
)

# Import nano_crazer modules
from project import Project, RESULTS_DIR
from image_generator import (
    generate_image_with_fallback, generate_image_with_face_validation,
    set_provider, get_provider, get_available_providers,
    set_fallback_provider, get_fallback_provider,
    enable_face_validation, set_face_threshold, set_face_max_retries,
    PROVIDER_POE, PROVIDER_GEMINI, PROVIDER_GEMINI_PRO, PROVIDER_GROK2,
    FACE_SIMILARITY_THRESHOLD, DEFAULT_PROVIDER, DEFAULT_FALLBACK
)
from face_similarity import calculate_similarity, FACE_RECOGNITION_AVAILABLE
from prompt_generator import generate_prompts as generate_album_prompts
from prompt_parser import parse_steps
from PIL import Image
import base64
import io

# Global state for tracking active generation
_active_generation: dict = {}


def resolve_project_path(project_id: str) -> Path:
    """Find project path in subdirectories."""
    for subdir in ["albums", "storybooks"]:
        path = RESULTS_DIR / subdir / project_id
        if path.exists():
            return path
    raise HTTPException(status_code=404, detail=f"Project not found: {project_id}")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup/shutdown events."""
    print(f"[API] Starting nano_crazer API server")
    print(f"[API] Results directory: {RESULTS_DIR}")
    print(f"[API] Face recognition: {'available' if FACE_RECOGNITION_AVAILABLE else 'not available'}")
    yield
    print("[API] Shutting down")


app = FastAPI(
    title="NanoCrazer API",
    description="API for story-to-image generation with face consistency",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS for frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3100", "http://localhost:3000", "http://127.0.0.1:3100"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ============ Health & Status ============

@app.get("/api/test-sse", tags=["status"])
async def test_sse():
    """Test SSE streaming (GET)."""
    async def stream():
        for i in range(3):
            yield json.dumps({"count": i})
            await asyncio.sleep(0.5)
    return sse_response(stream())


class TestPostRequest(BaseModel):
    message: str


@app.post("/api/test-sse-post", tags=["status"])
async def test_sse_post(request: TestPostRequest):
    """Test SSE streaming (POST)."""
    async def stream():
        yield json.dumps({"received": request.message})
        for i in range(3):
            yield json.dumps({"count": i})
            await asyncio.sleep(0.5)
    return sse_response(stream())


@app.get("/api/health", response_model=HealthResponse, tags=["status"])
async def health_check():
    """Check API health and available features."""
    providers = [p[0] for p in get_available_providers()]
    return HealthResponse(
        status="ok",
        version="1.0.0",
        face_recognition_available=FACE_RECOGNITION_AVAILABLE,
        providers=providers,
        current_provider=get_provider(),
        fallback_provider=get_fallback_provider()
    )


# ============ Projects ============

@app.get("/api/projects", response_model=list[ProjectSummary], tags=["projects"])
async def list_projects():
    """List all available projects."""
    projects = Project.list_projects()
    return [
        ProjectSummary(
            id=p["name"],
            name=p["name"],
            project_type=p.get("project_type", "story"),
            created=datetime.fromisoformat(p["created"]) if p.get("created") else None,
            image_count=p.get("image_count", 0),
            frame_count=len(p.get("prompts", [])),
            book_style=p.get("book_style", "generic")
        )
        for p in projects
    ]


@app.post("/api/projects", response_model=CreateProjectResponse, tags=["projects"])
async def create_project(request: CreateProjectRequest):
    """Create a new project."""
    project = Project(request.name, project_type=request.project_type.value)
    project.create()
    project.metadata["created"] = datetime.now().isoformat()
    project.metadata["book_style"] = request.book_style or "generic"
    project.save_metadata()
    return CreateProjectResponse(
        id=project.name,
        name=project.name,
        created=datetime.now()
    )


@app.get("/api/projects/{project_id}", response_model=ProjectDetail, tags=["projects"])
async def get_project(project_id: str):
    """Get full project details."""
    try:
        project = Project.load(project_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

    images = []
    providers_used = project.metadata.get("providers_used", [])
    face_similarities = project.metadata.get("face_similarities", [])
    created_at = datetime.fromisoformat(project.metadata.get("created", datetime.now().isoformat()))

    for i, img in enumerate(project.images):
        # IMAGE_0 is initial, IMAGE_1+ are generated from prompts
        prompt_idx = i - 1
        images.append(ImageMetadata(
            id=f"IMAGE_{i}",
            index=i,
            prompt=project.prompts[prompt_idx][1] if 0 <= prompt_idx < len(project.prompts) else None,
            provider=providers_used[i] if i < len(providers_used) else None,
            face_similarity=face_similarities[i] if i < len(face_similarities) else None,
            created_at=created_at
        ))

    # Check if target image exists
    has_target = (project.path / "TARGET.png").exists()

    return ProjectDetail(
        id=project.name,
        name=project.name,
        project_type=project.project_type,
        created=datetime.fromisoformat(project.metadata.get("created", datetime.now().isoformat())) if project.metadata.get("created") else None,
        prompts=project.prompts,
        images=images,
        face_validation_enabled=project.metadata.get("face_validation_enabled", False),
        providers_used=project.metadata.get("providers_used", []),
        num_steps=project.metadata.get("num_steps", 5),
        has_target_image=has_target,
        book_style=project.metadata.get("book_style", "generic"),
    )


@app.get("/api/projects/{project_id}/images/{image_id}", tags=["projects"])
async def get_project_image(project_id: str, image_id: str):
    """Get a specific image from a project."""
    project_path = resolve_project_path(project_id)
    image_path = project_path / f"{image_id}.png"
    if not image_path.exists():
        raise HTTPException(status_code=404, detail=f"Image not found: {image_id}")
    return FileResponse(image_path, media_type="image/png")


# ============ Story Brainstorming ============

async def stream_story_response(request: StoryBrainstormRequest) -> AsyncGenerator[str, None]:
    """Stream AI response for story brainstorming."""
    import openai
    from dotenv import load_dotenv
    import os

    # Load environment
    env_path = Path(__file__).parent.parent / ".env"
    load_dotenv(env_path)

    api_key = os.getenv("POE_KEY")
    if not api_key:
        yield json.dumps({"type": "error", "message": "POE_KEY not configured"})
        return

    client = openai.OpenAI(
        api_key=api_key,
        base_url="https://api.poe.com/v1",
    )

    # Build messages
    system_message = """You are a creative writing assistant helping develop story plots for image generation.
Your role is to:
1. Help brainstorm compelling story ideas with visual potential
2. Suggest interesting characters, settings, and plot points
3. Think about visual composition and how scenes would look as images
4. Keep responses conversational and collaborative
5. When the user seems ready, offer to generate frame prompts"""

    messages = [{"role": "system", "content": system_message}]
    for msg in request.history:
        messages.append({"role": msg.role, "content": msg.content})
    messages.append({"role": "user", "content": request.message})

    try:
        stream = client.chat.completions.create(
            model="grok-beta",  # Use grok-beta for chat
            messages=messages,
            stream=True,
        )

        for chunk in stream:
            if chunk.choices and chunk.choices[0].delta.content:
                yield json.dumps({
                    "type": "content",
                    "text": chunk.choices[0].delta.content
                })

        yield json.dumps({"type": "done"})

    except Exception as e:
        yield json.dumps({"type": "error", "message": str(e)})


@app.post("/api/story/brainstorm", tags=["story"])
async def brainstorm_story(request: StoryBrainstormRequest):
    """Chat with AI to brainstorm story plot (SSE stream)."""
    return sse_response(stream_story_response(request))


@app.post("/api/story/frames", response_model=GenerateFramesResponse, tags=["story"])
async def generate_frames(request: GenerateFramesRequest):
    """Convert a story plot into frame prompts."""
    import openai
    from dotenv import load_dotenv
    import os

    env_path = Path(__file__).parent.parent / ".env"
    load_dotenv(env_path)

    api_key = os.getenv("POE_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="POE_KEY not configured")

    client = openai.OpenAI(
        api_key=api_key,
        base_url="https://api.poe.com/v1",
    )

    BOOK_STYLE_PROMPTS = {
        "coloring": "Black and white line art, clean outlines, suitable for a coloring book. No color fills.",
        "paper-cutting": "Layered paper-cut silhouette aesthetic, flat graphic shapes, visible paper layers.",
        "watercolor": "Soft watercolor illustration, visible brush strokes, pastel palette.",
        "sketch": "Hand-drawn pencil sketch, loose line work, light hatching for shading.",
    }
    effective_style = request.style_hints or BOOK_STYLE_PROMPTS.get(request.book_style or "generic", "")

    prompt = f"""Convert this story plot into {request.num_frames} sequential image prompts.

STORY:
{request.plot}

{f"STYLE GUIDANCE: {effective_style}" if effective_style else ""}

For each frame, provide:
1. A short title (2-4 words)
2. A detailed image generation prompt that describes the visual scene

Format your response as JSON array:
[
  {{"title": "Opening Scene", "prompt": "Detailed visual description..."}},
  ...
]

Make each frame build on the previous one, creating a visual narrative.
Focus on composition, lighting, mood, and visual storytelling."""

    try:
        response = client.chat.completions.create(
            model="grok-4.1-fast-reasoning",
            messages=[{"role": "user", "content": prompt}],
        )

        content = response.choices[0].message.content

        # Extract JSON from response
        import re
        json_match = re.search(r'\[[\s\S]*\]', content)
        if not json_match:
            raise HTTPException(status_code=500, detail="Failed to parse frame prompts from AI response")

        frames_data = json.loads(json_match.group())
        frames = [
            FramePrompt(index=i, title=f["title"], prompt=f["prompt"])
            for i, f in enumerate(frames_data)
        ]

        return GenerateFramesResponse(frames=frames)

    except json.JSONDecodeError as e:
        raise HTTPException(status_code=500, detail=f"Failed to parse AI response as JSON: {e}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ============ Image Generation ============

async def stream_generation(request: GenerateImageRequest) -> AsyncGenerator[str, None]:
    """Stream image generation progress."""
    project_id = request.project_id

    # Check for active generation
    if _active_generation.get(project_id):
        yield json.dumps({
            "type": "error",
            "message": "Generation already in progress for this project"
        })
        return

    _active_generation[project_id] = True

    try:
        # Load project
        try:
            project = Project.load(project_id)
        except ValueError:
            yield json.dumps({"type": "error", "message": f"Project not found: {project_id}"})
            return

        # Load context images from IDs
        context_images = []
        project_path = resolve_project_path(project_id)
        for img_id in request.context_image_ids:
            img_path = project_path / f"{img_id}.png"
            if img_path.exists():
                img = Image.open(img_path)
                img.load()
                context_images.append(img)
                yield json.dumps({
                    "type": "progress",
                    "message": f"Loaded context image: {img_id}"
                })

        # Determine provider and set fallback
        provider = None if request.provider == Provider.AUTO else request.provider.value
        fallback = request.fallback_provider.value
        set_fallback_provider(fallback)

        # Progress callback
        def on_chunk(text: str):
            # Will be called synchronously, buffer for async
            pass

        yield json.dumps({
            "type": "progress",
            "status": "generating",
            "message": f"Starting generation with {'auto-fallback' if provider is None else provider}..."
        })

        # Get previous image for face validation
        previous_image = project.images[-1] if project.images and request.enable_face_validation else None

        # Generate image
        if request.enable_face_validation and previous_image:
            yield json.dumps({
                "type": "progress",
                "status": "generating",
                "message": "Face validation enabled"
            })

            set_face_threshold(request.face_threshold)
            set_face_max_retries(request.face_max_retries)
            img, provider_used, similarity = generate_image_with_face_validation(
                prompt=request.prompt,
                previous_image=previous_image,
                context_images=context_images if context_images else None,
                provider=provider,
            )

            if similarity is not None:
                yield json.dumps({
                    "type": "face_similarity",
                    "similarity": similarity,
                    "message": f"Face similarity: {similarity:.1%}"
                })
        else:
            img, provider_used = generate_image_with_fallback(
                prompt=request.prompt,
                context_images=context_images if context_images else None,
                provider=provider,
            )
            similarity = None

        if img is None:
            yield json.dumps({
                "type": "error",
                "message": "No image generated - model returned text only"
            })
            return

        yield json.dumps({
            "type": "provider",
            "provider": provider_used,
            "message": f"Generated with {provider_used}"
        })

        # Save image to project
        index = project.add_generated_image(img)
        image_id = f"IMAGE_{index}"

        # Update metadata
        if "providers_used" not in project.metadata:
            project.metadata["providers_used"] = []
        project.metadata["providers_used"].append(provider_used)

        if "face_similarities" not in project.metadata:
            project.metadata["face_similarities"] = []
        project.metadata["face_similarities"].append(similarity)

        project.metadata["face_validation_enabled"] = request.enable_face_validation
        project.save_metadata()

        yield json.dumps({
            "type": "complete",
            "status": "complete",
            "image_id": image_id,
            "provider": provider_used,
            "similarity": similarity,
            "message": f"Image saved as {image_id}"
        })

    except Exception as e:
        yield json.dumps({
            "type": "error",
            "status": "failed",
            "message": str(e)
        })
    finally:
        _active_generation[project_id] = False


@app.post("/api/generate", tags=["generation"])
async def generate_image(request: GenerateImageRequest):
    """Generate an image with streaming progress (SSE)."""
    return sse_response(stream_generation(request))


@app.get("/api/generate/status/{project_id}", tags=["generation"])
async def get_generation_status(project_id: str):
    """Check if generation is in progress for a project."""
    return {"active": _active_generation.get(project_id, False)}


# ============ Face Similarity ============

@app.post("/api/face/similarity", response_model=FaceSimilarityResponse, tags=["face"])
async def check_face_similarity(request: FaceSimilarityRequest):
    """Calculate face similarity between two images."""
    if not FACE_RECOGNITION_AVAILABLE:
        return FaceSimilarityResponse(
            similarity=None,
            meets_threshold=True,
            error="face_recognition not installed"
        )

    # Load images
    project_path = resolve_project_path(request.project_id)
    img1_path = project_path / f"{request.image1_id}.png"
    img2_path = project_path / f"{request.image2_id}.png"

    if not img1_path.exists():
        raise HTTPException(status_code=404, detail=f"Image not found: {request.image1_id}")
    if not img2_path.exists():
        raise HTTPException(status_code=404, detail=f"Image not found: {request.image2_id}")

    img1 = Image.open(img1_path)
    img2 = Image.open(img2_path)

    similarity = calculate_similarity(img1, img2)

    return FaceSimilarityResponse(
        similarity=similarity,
        meets_threshold=similarity >= FACE_SIMILARITY_THRESHOLD if similarity is not None else True,
        error=None if similarity is not None else "No face detected in one or both images"
    )


# ============ Album ============

def decode_base64_image(data: str) -> Image.Image:
    """Decode base64 string to PIL Image."""
    # Handle data URL format (data:image/png;base64,...)
    if "," in data:
        data = data.split(",")[1]
    img_bytes = base64.b64decode(data)
    return Image.open(io.BytesIO(img_bytes))


@app.post("/api/album/setup", response_model=AlbumSetupResponse, tags=["album"])
async def setup_album(request: AlbumSetupRequest):
    """Setup album project with initial and target images."""
    # Create project
    project = Project(request.project_name, project_type="album")
    project.create()
    project.metadata["created"] = datetime.now().isoformat()
    project.metadata["num_steps"] = request.num_steps

    # Decode and save initial image
    initial_img = decode_base64_image(request.initial_image)
    project.save_initial_image(initial_img)

    # Decode and save target image
    target_img = decode_base64_image(request.target_image)
    project.save_target_image(target_img)

    # Persist metadata
    project.save_metadata()

    return AlbumSetupResponse(
        project_id=project.name,
        name=project.name,
        created=datetime.now(),
        num_steps=request.num_steps
    )


async def stream_album_prompts(request: AlbumGeneratePromptsRequest) -> AsyncGenerator[str, None]:
    """Stream prompt generation for album."""
    try:
        project = Project.load(request.project_id)
    except ValueError as e:
        yield json.dumps({"type": "error", "message": str(e)})
        return

    # Get image paths
    initial_path = project.path / "IMAGE_0.png"
    target_path = project.path / "TARGET.png"

    if not initial_path.exists():
        yield json.dumps({"type": "error", "message": "Initial image not found"})
        return
    if not target_path.exists():
        yield json.dumps({"type": "error", "message": "Target image not found"})
        return

    yield json.dumps({"type": "progress", "message": "Analyzing images with Grok-4..."})

    try:
        num_steps = project.metadata.get("num_steps", 5)
        raw_response = generate_album_prompts(
            initial_image_path=str(initial_path),
            target_image_path=str(target_path),
            meta_prompt=request.meta_prompt,
            num_steps=num_steps
        )

        yield json.dumps({"type": "progress", "message": "Parsing prompts..."})

        # Parse the response
        prompts = parse_steps(raw_response)

        # Save prompts to project
        project.save_prompts(prompts)

        # Send prompts
        for step_num, prompt in prompts:
            yield json.dumps({
                "type": "prompt",
                "step_num": step_num,
                "prompt": prompt
            })

        yield json.dumps({"type": "done", "total_prompts": len(prompts)})

    except Exception as e:
        yield json.dumps({"type": "error", "message": str(e)})


@app.post("/api/album/generate-prompts", tags=["album"])
async def generate_prompts_for_album(request: AlbumGeneratePromptsRequest):
    """Generate transformation prompts using Grok-4 (SSE stream)."""
    return sse_response(stream_album_prompts(request))


@app.get("/api/album/{project_id}/prompts", response_model=AlbumGeneratePromptsResponse, tags=["album"])
async def get_album_prompts(project_id: str):
    """Get saved prompts for album project."""
    try:
        project = Project.load(project_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

    return AlbumGeneratePromptsResponse(
        prompts=[
            AlbumStepPrompt(step_num=step_num, prompt=prompt)
            for step_num, prompt in project.prompts
        ]
    )


@app.put("/api/album/{project_id}/prompts", tags=["album"])
async def update_album_prompts(project_id: str, prompts: list[AlbumStepPrompt]):
    """Update prompts for album project."""
    try:
        project = Project.load(project_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

    # Convert to project format and save
    project.save_prompts([(p.step_num, p.prompt) for p in prompts])
    return {"status": "ok", "updated": len(prompts)}


async def stream_album_run(request: AlbumRunRequest) -> AsyncGenerator[str, None]:
    """Stream album transformation pipeline execution."""
    print(f"[stream_album_run] Starting with request: {request}", flush=True)

    # Immediate yield to flush headers
    yield json.dumps({"type": "init", "message": "Initializing transformation..."})
    print(f"[stream_album_run] Init event yielded", flush=True)

    project_id = request.project_id

    print(f"[stream_album_run] Checking active generation for {project_id}: {_active_generation.get(project_id)}", flush=True)
    if _active_generation.get(project_id):
        yield json.dumps({"type": "error", "message": "Generation already in progress"})
        return

    _active_generation[project_id] = True

    try:
        # Run blocking Project.load in thread pool
        project = await asyncio.to_thread(Project.load, project_id)
    except ValueError as e:
        yield json.dumps({"type": "error", "message": str(e)})
        _active_generation[project_id] = False
        return

    if not project.prompts:
        yield json.dumps({"type": "error", "message": "No prompts found. Generate prompts first."})
        _active_generation[project_id] = False
        return

    total_steps = len(project.prompts)
    print(f"[stream_album_run] Yielding start event for {total_steps} steps")
    yield json.dumps({
        "type": "start",
        "total_steps": total_steps,
        "message": f"Starting {total_steps}-step transformation..."
    })
    print(f"[stream_album_run] Start event yielded")

    provider = None if request.provider == Provider.AUTO else request.provider.value

    # Set fallback provider for automatic failover
    fallback = request.fallback_provider.value
    set_fallback_provider(fallback)
    print(f"[stream_album_run] Provider: {provider or 'auto'}, Fallback: {fallback}")

    # Reset metadata if starting over
    if request.start_over:
        print(f"[stream_album_run] Starting over - resetting metadata and images")
        project.metadata["providers_used"] = []
        project.metadata["face_similarities"] = []
        # Clear generated images (keep only IMAGE_0 which is the initial image)
        project.images = project.images[:1] if project.images else []
        project.save_metadata()

    try:
        for step_num, prompt in project.prompts:
            # Skip steps before start_step (for resume functionality)
            if step_num < request.start_step:
                continue

            yield json.dumps({
                "type": "step_start",
                "step": step_num,
                "prompt": prompt[:100] + "..." if len(prompt) > 100 else prompt
            })

            # Get previous image (for face validation and context)
            previous_image = project.images[-1] if project.images else None
            context_images = project.images[-5:] if project.images else None

            # Generate image in thread pool (blocking I/O)
            if request.enable_face_validation and previous_image:
                set_face_threshold(request.face_threshold)
                set_face_max_retries(request.face_max_retries)
                result = await asyncio.to_thread(
                    generate_image_with_face_validation,
                    prompt=prompt,
                    previous_image=previous_image,
                    context_images=context_images,
                    provider=provider,
                )
                img, provider_used, similarity = result
            else:
                result = await asyncio.to_thread(
                    generate_image_with_fallback,
                    prompt=prompt,
                    context_images=context_images,
                    provider=provider,
                )
                img, provider_used = result
                similarity = None

            if img is None:
                yield json.dumps({
                    "type": "step_error",
                    "step": step_num,
                    "message": "No image generated"
                })
                continue

            # Save image in thread pool
            index = await asyncio.to_thread(project.add_generated_image, img)
            image_id = f"IMAGE_{index}"

            # Log face similarity for this step
            similarity_str = f"{similarity:.1%}" if similarity is not None else "N/A"
            print(f"[Album Step {step_num}] {image_id} | Provider: {provider_used} | Face Similarity: {similarity_str}")

            # Update metadata
            if "providers_used" not in project.metadata:
                project.metadata["providers_used"] = []
            project.metadata["providers_used"].append(provider_used)

            if "face_similarities" not in project.metadata:
                project.metadata["face_similarities"] = []
            project.metadata["face_similarities"].append(similarity)

            project.metadata["face_validation_enabled"] = request.enable_face_validation
            await asyncio.to_thread(project.save_metadata)

            yield json.dumps({
                "type": "step_complete",
                "step": step_num,
                "image_id": image_id,
                "provider": provider_used,
                "similarity": similarity
            })

        yield json.dumps({
            "type": "complete",
            "total_images": len(project.images),
            "message": "Transformation complete!"
        })

    except Exception as e:
        yield json.dumps({"type": "error", "message": str(e)})
    finally:
        _active_generation[project_id] = False


@app.post("/api/album/run", tags=["album"])
async def run_album_transformation(request: AlbumRunRequest):
    """Run album transformation pipeline (SSE stream)."""
    print(f"[run_album_transformation] Received request: {request}")
    return sse_response(stream_album_run(request))


@app.get("/api/album/{project_id}/status", response_model=AlbumStatus, tags=["album"])
async def get_album_status(project_id: str):
    """Get current status of album transformation."""
    try:
        project = Project.load(project_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

    total_steps = len(project.prompts)
    images_generated = max(0, len(project.images) - 1)  # Subtract initial image

    if _active_generation.get(project_id):
        status = "running"
    elif images_generated >= total_steps:
        status = "complete"
    elif images_generated > 0:
        status = "partial"
    else:
        status = "pending"

    return AlbumStatus(
        project_id=project_id,
        current_step=images_generated,
        total_steps=total_steps,
        status=status,
        images_generated=images_generated
    )


@app.get("/api/projects/{project_id}/target", tags=["projects"])
async def get_target_image(project_id: str):
    """Get the target image for an album project."""
    project_path = resolve_project_path(project_id)
    target_path = project_path / "TARGET.png"
    if not target_path.exists():
        raise HTTPException(status_code=404, detail="Target image not found")
    return FileResponse(target_path, media_type="image/png")


# ============ Static Files (Production) ============

# Serve frontend build in production
frontend_dist = Path(__file__).parent.parent / "app" / "dist"
if frontend_dist.exists():
    app.mount("/", StaticFiles(directory=str(frontend_dist), html=True), name="frontend")


def find_available_port(start_port: int = 5000, max_attempts: int = 100) -> int:
    """Find an available port starting from start_port."""
    import socket
    for port in range(start_port, start_port + max_attempts):
        try:
            with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
                s.bind(("0.0.0.0", port))
                return port
        except OSError:
            continue
    raise RuntimeError(f"No available port found in range {start_port}-{start_port + max_attempts}")


if __name__ == "__main__":
    import uvicorn
    port = find_available_port(start_port=5000)
    # Write port to file for frontend to read
    port_file = Path(__file__).parent.parent / ".api_port"
    port_file.write_text(str(port))
    print(f"[API] Running on port {port}")
    uvicorn.run(app, host="0.0.0.0", port=port)
