# NanoCrazer

Web-based story-to-image generator with face consistency validation.

## Architecture

```
┌─────────────────┐     ┌─────────────────┐
│   React + Vite  │────▶│    FastAPI      │
│   (Frontend)    │     │   (Backend)     │
│   Port 5173     │     │   Port 5000     │
└─────────────────┘     └─────────────────┘
        │                       │
        │                       ▼
        │               ┌─────────────────┐
        │               │  Python modules │
        │               │  - image_gen    │
        │               │  - face_sim     │
        └──────────────▶│  - projects     │
                        └─────────────────┘
```

## Development Setup

### Prerequisites

- Python 3.11+
- Node.js 20+
- API keys in `.env`:
  - `POE_KEY` - POE API key
  - `GEMINI_API_KEY` - Google Gemini API key
  - `XAI_API_KEY` - xAI API key (for Grok-2)

### Running Locally

**Quick Start (recommended):**

```bash
cd app
make install  # Install all dependencies
make run      # Start both API and frontend
```

**Or manually:**

```bash
# Terminal 1: Start API server
cd api && pip install -r requirements.txt && python server.py

# Terminal 2: Start frontend
cd app && npm install && npm run dev
```

Open http://localhost:5173

### Docker Deployment

```bash
docker-compose up --build
```

Access at http://localhost:3000

## Project Structure

```
nano_crazer/
├── api/                    # FastAPI backend
│   ├── server.py          # Main server
│   ├── models.py          # Pydantic models
│   └── requirements.txt
├── app/                    # React frontend
│   ├── src/
│   │   ├── components/    # UI components
│   │   │   └── ui/        # Base components (Button, Card, etc.)
│   │   ├── pages/         # View components
│   │   ├── services/      # API clients
│   │   ├── stores/        # Zustand state
│   │   └── types/         # TypeScript types
│   ├── package.json
│   └── vite.config.ts
├── *.py                    # Python service modules
├── docker-compose.yml
├── Dockerfile.python
├── Dockerfile.web
└── nginx.conf
```

## API Endpoints

### Projects
- `GET /api/projects` - List projects
- `POST /api/projects` - Create project
- `GET /api/projects/:id` - Get project details
- `GET /api/projects/:id/images/:imageId` - Get image file

### Story
- `POST /api/story/brainstorm` - Chat with AI (SSE stream)
- `POST /api/story/frames` - Convert plot to frame prompts

### Generation
- `POST /api/generate` - Generate image (SSE stream)
- `GET /api/generate/status/:projectId` - Check if generation active

### Face Similarity
- `POST /api/face/similarity` - Calculate similarity between images

### Health
- `GET /api/health` - API health check

## Features

- **Story Brainstorming**: Chat with Grok to develop story plots
- **Frame Generation**: Convert plot into sequential image prompts
- **Multi-Provider**: POE, Gemini, Grok-2 with automatic fallback
- **Face Validation**: Maintain character consistency across images
- **Context Images**: Include previous images for coherent sequences
- **Project Management**: Save/load projects with images and prompts

## Feature Parity (vs Desktop App)

All features from the desktop Python app (`app.py`) have been ported to the web version:

| Feature | Desktop | Web |
|---------|---------|-----|
| Per-step Retry | Individual retry buttons | ✅ Retry button on failed items |
| Resume Pipeline | Resume from incomplete step | ✅ Continue button for partial runs |
| Provider Selection UI | Radio buttons in sidebar | ✅ Provider buttons in controls |
| Face Scores Tab | Dedicated tab showing all similarity scores | ✅ Collapsible Face Scores panel |
| Retry Settings | Max retries spinbox | ✅ Dropdown in face validation settings |
| Face Validation UI | Threshold slider, max retries | ✅ Threshold slider + max retries |
| Manual Mode | Direct prompt entry tab | ✅ Add Frame button in FramesView |
| Editable Prompts | Edit generated prompts before running | ✅ Edit icons on each frame/prompt |

## Makefile Commands

From `app/` directory:

```bash
make run      # Start both API server and frontend
make install  # Install all dependencies (pip + npm)
make api      # Start API server only
make dev      # Start frontend only (requires API running)
make build    # Build frontend for production
make clean    # Remove build artifacts
```
