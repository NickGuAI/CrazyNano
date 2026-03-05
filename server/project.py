"""Project management for nano_crazer."""
import json
import shutil
from pathlib import Path
from datetime import datetime
from PIL import Image

RESULTS_DIR = Path(__file__).parent / ".results"
RESULTS_DIR.mkdir(exist_ok=True)
(RESULTS_DIR / "albums").mkdir(exist_ok=True)
(RESULTS_DIR / "storybooks").mkdir(exist_ok=True)


class Project:
    """Manages a generation project with prompts and images."""

    def __init__(self, name: str = None, project_type: str = "story"):
        if name is None:
            name = datetime.now().strftime("%Y%m%d_%H%M%S")
        self.name = name
        # Use subdirectory based on project type
        subdir = "albums" if project_type == "album" else "storybooks"
        self.path = RESULTS_DIR / subdir / name
        self.project_type = project_type  # "story" or "album"
        self.prompts = []  # List of (step_num, prompt_text)
        self.initial_image_path = None
        self.target_image_path = None  # For album projects
        self.images = []  # List of PIL Images
        self.metadata = {}
    
    def create(self):
        """Create project directory."""
        self.path.mkdir(exist_ok=True)
        return self
    
    def save_metadata(self):
        """Save project metadata to JSON."""
        data = {
            "name": self.name,
            "project_type": self.project_type,
            "created": self.metadata.get("created", datetime.now().isoformat()),
            "initial_image": self.initial_image_path,
            "target_image": self.target_image_path,
            "num_steps": self.metadata.get("num_steps", 5),
            "prompts": self.prompts,
            "image_count": len(self.images),
            "providers_used": self.metadata.get("providers_used", []),
            "face_similarities": self.metadata.get("face_similarities", []),
            "face_validation_enabled": self.metadata.get("face_validation_enabled", False),
            "book_style": self.metadata.get("book_style", "generic"),
        }
        with open(self.path / "project.json", "w") as f:
            json.dump(data, f, indent=2)
    
    def save_image(self, img: Image.Image, index: int):
        """Save an image to the project."""
        img_path = self.path / f"IMAGE_{index}.png"
        img.save(img_path)
        print(f"Saved: {img_path}")
        return img_path
    
    def save_initial_image(self, img: Image.Image, source_path: str = None):
        """Save the initial image."""
        self.initial_image_path = source_path
        self.save_image(img, 0)
        if len(self.images) == 0:
            self.images.append(img)
        else:
            self.images[0] = img
        self.save_metadata()

    def save_target_image(self, img: Image.Image, source_path: str = None):
        """Save the target image (for album projects)."""
        self.target_image_path = source_path
        target_path = self.path / "TARGET.png"
        img.save(target_path)
        print(f"Saved target: {target_path}")
        self.save_metadata()
        return target_path

    def get_target_image(self) -> Image.Image:
        """Load the target image."""
        target_path = self.path / "TARGET.png"
        if target_path.exists():
            img = Image.open(target_path)
            img.load()
            return img
        return None

    
    def save_prompts(self, prompts: list):
        """Save prompts to the project."""
        self.prompts = prompts
        # Save as text file for easy viewing
        with open(self.path / "prompts.txt", "w") as f:
            for step_num, prompt in prompts:
                f.write(f"Step {step_num}: {prompt}\n\n")
        self.save_metadata()
    
    def add_generated_image(self, img: Image.Image):
        """Add a generated image to the project."""
        index = len(self.images)
        self.save_image(img, index)
        self.images.append(img)
        self.save_metadata()
        return index
    
    @classmethod
    def load(cls, name: str) -> "Project":
        """Load an existing project."""
        # Search in subdirectories first
        path = None
        project_type = "story"
        for subdir in ["albums", "storybooks"]:
            candidate = RESULTS_DIR / subdir / name
            if candidate.exists() and (candidate / "project.json").exists():
                path = candidate
                break

        if path is None:
            raise ValueError(f"Project not found: {name}")

        print(f"[Project.load] Loading project: {name}")
        print(f"[Project.load] Path: {path}")

        # Load metadata to get project type first
        meta_path = path / "project.json"
        if meta_path.exists():
            print(f"[Project.load] Found project.json")
            with open(meta_path) as f:
                data = json.load(f)
            project_type = data.get("project_type", "story")
        else:
            data = {}

        project = cls(name, project_type=project_type)
        project.path = path  # Override with discovered path

        # Load metadata
        if data:
            project.prompts = data.get("prompts", [])
            project.initial_image_path = data.get("initial_image")
            project.target_image_path = data.get("target_image")
            project.project_type = data.get("project_type", "story")
            project.metadata = data
            print(f"[Project.load] Loaded {len(project.prompts)} prompts from metadata")
        
        # Load prompts from text file if no metadata
        if not project.prompts:
            prompts_path = path / "prompts.txt"
            if prompts_path.exists():
                print(f"[Project.load] Loading prompts from prompts.txt")
                from prompt_parser import parse_steps
                with open(prompts_path) as f:
                    project.prompts = parse_steps(f.read())
                print(f"[Project.load] Loaded {len(project.prompts)} prompts from text file")
        
        # Load images
        project.images = []
        i = 0
        while True:
            img_path = path / f"IMAGE_{i}.png"
            print(f"[Project.load] Checking: {img_path} - exists: {img_path.exists()}")
            if not img_path.exists():
                break
            try:
                img = Image.open(img_path)
                img.load()
                project.images.append(img)
                print(f"[Project.load] Loaded IMAGE_{i}.png")
            except Exception as e:
                print(f"[Project.load] Failed to load IMAGE_{i}.png: {e}")
                break
            i += 1
        
        print(f"[Project.load] Total images loaded: {len(project.images)}")
        return project
    
    @classmethod
    def list_projects(cls) -> list:
        """List all available projects."""
        projects = []
        for subdir in ["albums", "storybooks"]:
            subdir_path = RESULTS_DIR / subdir
            if not subdir_path.exists():
                continue
            for p in subdir_path.iterdir():
                if p.is_dir():
                    meta_path = p / "project.json"
                    if meta_path.exists():
                        with open(meta_path) as f:
                            data = json.load(f)
                        projects.append({
                            "name": p.name,
                            "created": data.get("created", ""),
                            "image_count": data.get("image_count", 0),
                            "project_type": data.get("project_type", "story"),
                        })
        return sorted(projects, key=lambda x: x["name"], reverse=True)
