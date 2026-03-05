"""Sequential Image Generation GUI App."""
import os
import sys
import threading
import queue
from pathlib import Path
from datetime import datetime
import tkinter as tk
from tkinter import ttk, filedialog, messagebox, scrolledtext, simpledialog
from PIL import Image, ImageTk

# Add current directory and repo root to path
sys.path.insert(0, str(Path(__file__).parent))
sys.path.insert(0, str(Path(__file__).parent.parent.parent))  # Repo root for shared imports

from prompt_parser import parse_steps, format_steps
from prompt_generator import generate_prompts, DEFAULT_META_PROMPT
from image_generator import (
    generate_image_streaming, 
    set_provider, 
    get_provider, 
    get_available_providers,
    PROVIDER_POE,
    PROVIDER_GEMINI,
    PROVIDER_GEMINI_PRO,
)
from gemini_generator import set_max_retries, get_max_retries
from project import Project, RESULTS_DIR


class StepPanel(tk.Frame):
    """Panel for a single generation step: [Image] [Buttons] [Response Text]"""
    
    def __init__(self, parent, index, prompt_text, on_retry=None):
        super().__init__(parent, relief=tk.GROOVE, borderwidth=2, bg="#2a2a2a")
        self.index = index
        self.prompt_text = prompt_text
        self.on_retry = on_retry
        self.image = None
        self.photo = None
        
        # Configure grid weights
        self.columnconfigure(0, weight=0)  # Image - fixed
        self.columnconfigure(1, weight=0)  # Buttons - fixed
        self.columnconfigure(2, weight=1)  # Response - expand
        
        # Header with step number and prompt preview
        header = tk.Frame(self, bg="#2a2a2a")
        header.grid(row=0, column=0, columnspan=3, sticky="ew", padx=5, pady=2)
        
        step_label = tk.Label(header, text=f"Step {index}", font=("Arial", 11, "bold"), 
                              bg="#2a2a2a", fg="#00ff00")
        step_label.pack(side=tk.LEFT)
        
        prompt_preview = prompt_text[:80] + "..." if len(prompt_text) > 80 else prompt_text
        prompt_label = tk.Label(header, text=prompt_preview, font=("Arial", 9), 
                                bg="#2a2a2a", fg="#aaaaaa", anchor="w")
        prompt_label.pack(side=tk.LEFT, padx=10, fill=tk.X, expand=True)
        
        # Left: Image display - full size, no viewport limit
        img_frame = tk.Frame(self, bg="#1a1a1a")
        img_frame.grid(row=1, column=0, padx=5, pady=5, sticky="nw")
        
        self.image_label = tk.Label(img_frame, text="Waiting...", bg="#1a1a1a", fg="#666666")
        self.image_label.pack()
        
        # Middle: Buttons
        btn_frame = tk.Frame(self, bg="#2a2a2a")
        btn_frame.grid(row=1, column=1, padx=5, pady=5, sticky="n")
        
        self.retry_btn = ttk.Button(btn_frame, text="Retry", command=self._on_retry, width=8)
        self.retry_btn.pack(pady=2)
        self.retry_btn.state(['disabled'])
        
        self.status_label = tk.Label(btn_frame, text="", bg="#2a2a2a", fg="#ffff00", 
                                     font=("Arial", 9))
        self.status_label.pack(pady=5)
        
        # Right: Response text (streaming)
        response_frame = tk.Frame(self, bg="#2a2a2a")
        response_frame.grid(row=1, column=2, padx=5, pady=5, sticky="nsew")
        
        tk.Label(response_frame, text="Model Response:", bg="#2a2a2a", fg="#888888",
                 font=("Arial", 9)).pack(anchor="w")
        
        self.response_text = scrolledtext.ScrolledText(response_frame, height=10, width=50,
                                                        bg="#1a1a1a", fg="#00ff00",
                                                        font=("Consolas", 9), wrap=tk.WORD)
        self.response_text.pack(fill=tk.BOTH, expand=True)

    
    def set_generating(self):
        """Show generating state."""
        self.image_label.configure(text="Generating...", fg="#ffff00")
        self.status_label.configure(text="⏳ Running")
        self.response_text.delete("1.0", tk.END)
        self.retry_btn.state(['disabled'])
    
    def append_response(self, text):
        """Append text to response area (for streaming)."""
        self.response_text.insert(tk.END, text)
        self.response_text.see(tk.END)
    
    def set_image(self, img: Image.Image):
        """Set the generated image - full size."""
        self.image = img
        self.photo = ImageTk.PhotoImage(img)
        self.image_label.configure(image=self.photo, text="")
        self.status_label.configure(text="✓ Done", fg="#00ff00")
        self.retry_btn.state(['!disabled'])
    
    def set_no_image(self):
        """Show that no image was generated."""
        self.image_label.configure(text="(text only)", fg="#888888")
        self.status_label.configure(text="✓ Text only", fg="#888888")
        self.retry_btn.state(['!disabled'])
    
    def set_pending(self):
        """Show that this step is pending."""
        self.image_label.configure(text="Pending...", fg="#666666")
        self.status_label.configure(text="⏸ Pending", fg="#666666")
        self.retry_btn.state(['disabled'])
    
    def set_error(self, msg):
        """Show error state."""
        self.image_label.configure(text="Error", fg="#ff0000")
        self.status_label.configure(text="✗ Failed", fg="#ff0000")
        self.append_response(f"\n\nERROR: {msg}")
        self.retry_btn.state(['!disabled'])
    
    def _on_retry(self):
        if self.on_retry:
            self.on_retry(self.index)


class InitialImagePanel(tk.Frame):
    """Panel for the initial image (IMAGE_0)."""
    
    def __init__(self, parent):
        super().__init__(parent, relief=tk.GROOVE, borderwidth=2, bg="#2a2a2a")
        self.image = None
        self.photo = None
        
        # Header
        header = tk.Frame(self, bg="#2a2a2a")
        header.pack(fill=tk.X, padx=5, pady=2)
        
        tk.Label(header, text="IMAGE_0 (Initial)", font=("Arial", 11, "bold"),
                 bg="#2a2a2a", fg="#00aaff").pack(side=tk.LEFT)
        
        # Image display - full size
        img_frame = tk.Frame(self, bg="#1a1a1a")
        img_frame.pack(padx=5, pady=5)
        
        self.image_label = tk.Label(img_frame, text="No image loaded", bg="#1a1a1a", fg="#666666")
        self.image_label.pack()
    
    def set_image(self, img: Image.Image):
        """Set the initial image - full size."""
        self.image = img
        self.photo = ImageTk.PhotoImage(img)
        self.image_label.configure(image=self.photo, text="")


class App(tk.Tk):
    """Main application window."""
    
    def __init__(self):
        super().__init__()
        self.title("Nano Crazer - Sequential Image Generator")
        self.geometry("1400x900")
        self.configure(bg="#1e1e1e")
        
        self.project = None  # Current project
        self.images = []  # List of PIL Images
        self.prompts = []  # List of (step_num, prompt_text)
        self.initial_image_path = None
        self.target_image_path = None
        self.step_panels = []
        self.initial_panel = None
        self.response_queue = queue.Queue()
        
        self._create_ui()
        self._poll_queue()
    
    def _poll_queue(self):
        """Poll the queue for UI updates from background threads."""
        try:
            while True:
                action, *args = self.response_queue.get_nowait()
                if action == "append":
                    idx, text = args
                    if idx < len(self.step_panels):
                        self.step_panels[idx].append_response(text)
                elif action == "image":
                    idx, img = args
                    if idx < len(self.step_panels):
                        self.step_panels[idx].set_image(img)
                        if idx + 1 < len(self.images):
                            self.images[idx + 1] = img
                        else:
                            self.images.append(img)
                elif action == "no_image":
                    idx = args[0]
                    if idx < len(self.step_panels):
                        self.step_panels[idx].set_no_image()
                elif action == "metadata":
                    idx, metadata = args
                    provider = metadata.get("provider", "unknown")
                    similarity = metadata.get("similarity")

                    # Append metadata to step panel response text
                    meta_text = f"\n[Provider: {provider}"
                    if similarity is not None:
                        # Color code similarity
                        if similarity >= 0.85:
                            indicator = "✓"
                        elif similarity >= 0.70:
                            indicator = "⚠"
                        else:
                            indicator = "✗"
                        meta_text += f" | Face similarity: {similarity:.1%} {indicator}"
                    meta_text += "]\n"

                    if idx < len(self.step_panels):
                        self.step_panels[idx].append_response(meta_text)
                    
                    # Update Face Scores tab
                    self._update_face_score(idx, similarity)
                elif action == "face_score":
                    # Direct face score update (for async calculation)
                    idx, similarity = args
                    self._update_face_score(idx, similarity)
                elif action == "error":
                    idx, msg = args
                    if idx < len(self.step_panels):
                        self.step_panels[idx].set_error(msg)
                elif action == "status":
                    msg = args[0]
                    self.status_var.set(msg)
        except queue.Empty:
            pass
        self.after(50, self._poll_queue)
    
    def _create_ui(self):
        # Main horizontal split
        main = ttk.PanedWindow(self, orient=tk.HORIZONTAL)
        main.pack(fill=tk.BOTH, expand=True, padx=5, pady=5)
        
        # Left panel - Controls
        left = ttk.Frame(main, width=350)
        main.add(left, weight=0)
        
        # Project controls at top
        project_frame = ttk.LabelFrame(left, text="Project")
        project_frame.pack(fill=tk.X, padx=5, pady=5)
        
        self.project_name_var = tk.StringVar(value="(no project)")
        ttk.Label(project_frame, textvariable=self.project_name_var, font=("Arial", 10, "bold")).pack(
            side=tk.LEFT, padx=5, pady=5)
        
        ttk.Button(project_frame, text="New", command=self._new_project, width=6).pack(side=tk.LEFT, padx=2)
        ttk.Button(project_frame, text="Load", command=self._load_project, width=6).pack(side=tk.LEFT, padx=2)
        
        # Provider selector
        provider_frame = ttk.LabelFrame(left, text="Image Provider")
        provider_frame.pack(fill=tk.X, padx=5, pady=5)
        
        self.provider_var = tk.StringVar(value=get_provider())
        providers = get_available_providers()
        
        for provider_id, provider_name in providers:
            rb = ttk.Radiobutton(
                provider_frame, 
                text=provider_name, 
                value=provider_id, 
                variable=self.provider_var,
                command=self._on_provider_change
            )
            rb.pack(anchor=tk.W, padx=10, pady=2)
        
        # Retry settings (for Gemini)
        retry_frame = ttk.Frame(provider_frame)
        retry_frame.pack(fill=tk.X, padx=10, pady=5)
        
        ttk.Label(retry_frame, text="Max retries:").pack(side=tk.LEFT)
        self.retry_var = tk.IntVar(value=get_max_retries())
        retry_spinbox = ttk.Spinbox(
            retry_frame, 
            from_=1, 
            to=10, 
            width=4, 
            textvariable=self.retry_var,
            command=self._on_retry_change
        )
        retry_spinbox.pack(side=tk.LEFT, padx=5)
        retry_spinbox.bind('<Return>', lambda e: self._on_retry_change())

        # Face validation settings
        settings_frame = ttk.LabelFrame(left, text="Face Validation Settings", padding=10)
        settings_frame.pack(fill=tk.X, padx=5, pady=5)

        self.face_validation_var = tk.BooleanVar(value=False)
        face_validation_cb = ttk.Checkbutton(
            settings_frame,
            text="Enable Face Validation (ensures character consistency)",
            variable=self.face_validation_var,
            command=self._on_face_validation_toggle,
        )
        face_validation_cb.pack(anchor=tk.W, pady=2)

        # Threshold slider
        threshold_frame = ttk.Frame(settings_frame)
        threshold_frame.pack(fill=tk.X, pady=5)
        ttk.Label(threshold_frame, text="Similarity Threshold:").pack(side=tk.LEFT, padx=5)
        self.threshold_var = tk.DoubleVar(value=0.85)
        self.threshold_slider = ttk.Scale(
            threshold_frame,
            from_=0.70,
            to=0.95,
            variable=self.threshold_var,
            orient="horizontal",
            command=self._on_threshold_change,
        )
        self.threshold_slider.pack(side=tk.LEFT, fill=tk.X, expand=True, padx=5)
        self.threshold_label = ttk.Label(threshold_frame, text="85%")
        self.threshold_label.pack(side=tk.LEFT, padx=5)

        # Max retries for face validation
        retries_frame = ttk.Frame(settings_frame)
        retries_frame.pack(fill=tk.X, pady=5)
        ttk.Label(retries_frame, text="Max Face Retries:").pack(side=tk.LEFT, padx=5)
        self.face_retries_var = tk.IntVar(value=3)
        retries_spin = ttk.Spinbox(
            retries_frame,
            from_=1,
            to=5,
            textvariable=self.face_retries_var,
            width=5,
            command=self._on_face_retries_change,
        )
        retries_spin.pack(side=tk.LEFT, padx=5)
        retries_spin.bind('<Return>', lambda e: self._on_face_retries_change())

        # Info label
        info_label = ttk.Label(
            settings_frame,
            text="⚠ Face validation increases generation time (~5s per check)",
            foreground="gray",
        )
        info_label.pack(anchor=tk.W, pady=2)

        # Notebook for tabs
        self.notebook = ttk.Notebook(left)
        self.notebook.pack(fill=tk.BOTH, expand=True)
        
        self._create_manual_tab()
        self._create_auto_tab()
        self._create_face_scores_tab()
        
        # Right panel - Generation display
        right = ttk.Frame(main)
        main.add(right, weight=1)
        
        # Top bar with controls
        top_bar = tk.Frame(right, bg="#1e1e1e")
        top_bar.pack(fill=tk.X, pady=5)
        
        ttk.Button(top_bar, text="Retry All", command=self._retry_all).pack(side=tk.LEFT, padx=5)
        ttk.Button(top_bar, text="Resume", command=self._resume_pipeline).pack(side=tk.LEFT, padx=5)
        ttk.Button(top_bar, text="Save All", command=self._save_all).pack(side=tk.LEFT, padx=5)
        
        self.status_var = tk.StringVar(value="Ready")
        ttk.Label(top_bar, textvariable=self.status_var).pack(side=tk.RIGHT, padx=10)
        
        # Scrollable area for step panels
        canvas_frame = tk.Frame(right)
        canvas_frame.pack(fill=tk.BOTH, expand=True)
        
        self.steps_canvas = tk.Canvas(canvas_frame, bg="#1e1e1e", highlightthickness=0)
        scrollbar = ttk.Scrollbar(canvas_frame, orient=tk.VERTICAL, command=self.steps_canvas.yview)
        self.steps_frame = tk.Frame(self.steps_canvas, bg="#1e1e1e")
        
        self.steps_canvas.configure(yscrollcommand=scrollbar.set)
        scrollbar.pack(side=tk.RIGHT, fill=tk.Y)
        self.steps_canvas.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)
        
        self.canvas_window = self.steps_canvas.create_window((0, 0), window=self.steps_frame, anchor=tk.NW)
        self.steps_frame.bind("<Configure>", self._on_frame_configure)
        self.steps_canvas.bind("<Configure>", self._on_canvas_configure)
    
    def _on_frame_configure(self, event):
        self.steps_canvas.configure(scrollregion=self.steps_canvas.bbox("all"))
    
    def _on_canvas_configure(self, event):
        self.steps_canvas.itemconfig(self.canvas_window, width=event.width)

    
    def _create_manual_tab(self):
        tab = ttk.Frame(self.notebook)
        self.notebook.add(tab, text="Manual Mode")
        
        # Initial image
        img_frame = ttk.LabelFrame(tab, text="Initial Image (IMAGE_0)")
        img_frame.pack(fill=tk.X, padx=5, pady=5)
        
        self.initial_path_var = tk.StringVar()
        ttk.Entry(img_frame, textvariable=self.initial_path_var, state="readonly").pack(
            side=tk.LEFT, fill=tk.X, expand=True, padx=5, pady=5)
        ttk.Button(img_frame, text="Browse", command=self._browse_initial).pack(
            side=tk.RIGHT, padx=5, pady=5)
        
        # Prompt input
        prompt_frame = ttk.LabelFrame(tab, text="Multi-Step Prompt")
        prompt_frame.pack(fill=tk.BOTH, expand=True, padx=5, pady=5)
        
        self.prompt_text = scrolledtext.ScrolledText(prompt_frame, height=15)
        self.prompt_text.pack(fill=tk.BOTH, expand=True, padx=5, pady=5)
        
        ttk.Button(tab, text="Generate Sequence", command=self._generate_manual).pack(pady=10)
    
    def _create_auto_tab(self):
        tab = ttk.Frame(self.notebook)
        self.notebook.add(tab, text="Auto-Generate Mode")
        
        # Initial image
        init_frame = ttk.LabelFrame(tab, text="Initial Image")
        init_frame.pack(fill=tk.X, padx=5, pady=5)
        
        self.auto_initial_var = tk.StringVar()
        ttk.Entry(init_frame, textvariable=self.auto_initial_var, state="readonly").pack(
            side=tk.LEFT, fill=tk.X, expand=True, padx=5, pady=5)
        ttk.Button(init_frame, text="Browse", command=self._browse_auto_initial).pack(
            side=tk.RIGHT, padx=5, pady=5)
        
        # Target image
        target_frame = ttk.LabelFrame(tab, text="Target Image")
        target_frame.pack(fill=tk.X, padx=5, pady=5)
        
        self.target_path_var = tk.StringVar()
        ttk.Entry(target_frame, textvariable=self.target_path_var, state="readonly").pack(
            side=tk.LEFT, fill=tk.X, expand=True, padx=5, pady=5)
        ttk.Button(target_frame, text="Browse", command=self._browse_target).pack(
            side=tk.RIGHT, padx=5, pady=5)
        
        # Number of steps
        steps_frame = ttk.Frame(tab)
        steps_frame.pack(fill=tk.X, padx=5, pady=5)
        
        ttk.Label(steps_frame, text="Number of steps:").pack(side=tk.LEFT, padx=5)
        self.num_steps_var = tk.IntVar(value=5)
        steps_spinbox = ttk.Spinbox(steps_frame, from_=1, to=10, width=5, 
                                     textvariable=self.num_steps_var)
        steps_spinbox.pack(side=tk.LEFT, padx=5)
        
        # Meta prompt
        meta_frame = ttk.LabelFrame(tab, text="Meta Prompt (for Grok-4)")
        meta_frame.pack(fill=tk.BOTH, expand=True, padx=5, pady=5)
        
        self.meta_prompt_text = scrolledtext.ScrolledText(meta_frame, height=6)
        self.meta_prompt_text.pack(fill=tk.BOTH, expand=True, padx=5, pady=5)
        self.meta_prompt_text.insert("1.0", DEFAULT_META_PROMPT)
        
        ttk.Button(tab, text="Generate Prompts (Grok-4)", command=self._generate_prompts).pack(pady=5)
        
        # Generated prompts
        gen_frame = ttk.LabelFrame(tab, text="Generated Prompts (editable)")
        gen_frame.pack(fill=tk.BOTH, expand=True, padx=5, pady=5)
        
        self.generated_prompts_text = scrolledtext.ScrolledText(gen_frame, height=6)
        self.generated_prompts_text.pack(fill=tk.BOTH, expand=True, padx=5, pady=5)
        
        ttk.Button(tab, text="Run Sequence", command=self._run_auto_sequence).pack(pady=10)

    def _create_face_scores_tab(self):
        """Create the Face Scores tab for viewing similarity comparisons."""
        tab = ttk.Frame(self.notebook)
        self.notebook.add(tab, text="Face Scores")
        
        # Header with info
        info_frame = ttk.Frame(tab)
        info_frame.pack(fill=tk.X, padx=5, pady=5)
        
        ttk.Label(
            info_frame, 
            text="Face similarity scores between consecutive images",
            font=("Arial", 10)
        ).pack(side=tk.LEFT)
        
        ttk.Button(
            info_frame, 
            text="Recalculate All", 
            command=self._recalculate_face_scores
        ).pack(side=tk.RIGHT, padx=5)
        
        # Treeview for scores
        tree_frame = ttk.Frame(tab)
        tree_frame.pack(fill=tk.BOTH, expand=True, padx=5, pady=5)
        
        columns = ("comparison", "score", "status", "threshold")
        self.face_scores_tree = ttk.Treeview(tree_frame, columns=columns, show="headings", height=15)
        
        self.face_scores_tree.heading("comparison", text="Comparison")
        self.face_scores_tree.heading("score", text="Similarity")
        self.face_scores_tree.heading("status", text="Status")
        self.face_scores_tree.heading("threshold", text="Threshold")
        
        self.face_scores_tree.column("comparison", width=150)
        self.face_scores_tree.column("score", width=100, anchor="center")
        self.face_scores_tree.column("status", width=80, anchor="center")
        self.face_scores_tree.column("threshold", width=80, anchor="center")
        
        scrollbar = ttk.Scrollbar(tree_frame, orient=tk.VERTICAL, command=self.face_scores_tree.yview)
        self.face_scores_tree.configure(yscrollcommand=scrollbar.set)
        
        self.face_scores_tree.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)
        scrollbar.pack(side=tk.RIGHT, fill=tk.Y)
        
        # Summary frame
        summary_frame = ttk.LabelFrame(tab, text="Summary")
        summary_frame.pack(fill=tk.X, padx=5, pady=5)
        
        self.face_score_summary_var = tk.StringVar(value="No images generated yet")
        ttk.Label(summary_frame, textvariable=self.face_score_summary_var).pack(padx=10, pady=5)
    
    def _recalculate_face_scores(self):
        """Recalculate face similarity scores for all generated images."""
        if not self.images or len(self.images) < 2:
            messagebox.showinfo("Info", "Need at least 2 images to calculate face similarity")
            return
        
        # Import face similarity
        try:
            from face_similarity import calculate_similarity, FACE_RECOGNITION_AVAILABLE
            if not FACE_RECOGNITION_AVAILABLE:
                messagebox.showerror("Error", "face_recognition library not installed.\nInstall with: pip install face-recognition")
                return
        except ImportError:
            messagebox.showerror("Error", "face_similarity module not found")
            return
        
        # Clear existing scores
        for item in self.face_scores_tree.get_children():
            self.face_scores_tree.delete(item)
        
        threshold = self.threshold_var.get()
        scores = []
        passed = 0
        failed = 0
        no_face = 0
        
        self.status_var.set("Calculating face scores...")
        self.update()
        
        for i in range(len(self.images) - 1):
            img1 = self.images[i]
            img2 = self.images[i + 1]
            
            comparison = f"Step {i} → Step {i+1}"
            similarity = calculate_similarity(img1, img2)
            
            if similarity is None:
                score_str = "N/A"
                status = "No face"
                no_face += 1
            else:
                score_str = f"{similarity:.1%}"
                scores.append(similarity)
                if similarity >= threshold:
                    status = "✓ Pass"
                    passed += 1
                else:
                    status = "✗ Fail"
                    failed += 1
            
            self.face_scores_tree.insert("", tk.END, values=(
                comparison,
                score_str,
                status,
                f"{threshold:.0%}"
            ))
        
        # Update summary
        if scores:
            avg_score = sum(scores) / len(scores)
            min_score = min(scores)
            max_score = max(scores)
            summary = f"Avg: {avg_score:.1%} | Min: {min_score:.1%} | Max: {max_score:.1%} | Pass: {passed} | Fail: {failed}"
            if no_face > 0:
                summary += f" | No face: {no_face}"
        else:
            summary = f"No faces detected in {no_face} comparisons"
        
        self.face_score_summary_var.set(summary)
        self.status_var.set("Face scores calculated")
    
    def _update_face_score(self, step_idx: int, similarity: float):
        """Update a single face score in the tree (called during generation)."""
        if step_idx < 1:
            return  # No comparison for first image
        
        comparison = f"Step {step_idx-1} → Step {step_idx}"
        threshold = self.threshold_var.get()
        
        if similarity is None:
            score_str = "N/A"
            status = "No face"
        else:
            score_str = f"{similarity:.1%}"
            status = "✓ Pass" if similarity >= threshold else "✗ Fail"
        
        # Check if row exists, update or insert
        for item in self.face_scores_tree.get_children():
            if self.face_scores_tree.item(item)["values"][0] == comparison:
                self.face_scores_tree.item(item, values=(comparison, score_str, status, f"{threshold:.0%}"))
                return
        
        # Insert new row
        self.face_scores_tree.insert("", tk.END, values=(
            comparison,
            score_str,
            status,
            f"{threshold:.0%}"
        ))
    
    def _browse_initial(self):
        path = filedialog.askopenfilename(filetypes=[("Images", "*.png *.jpg *.jpeg *.gif *.webp")])
        if path:
            self.initial_path_var.set(path)
            self.initial_image_path = path
    
    def _browse_auto_initial(self):
        path = filedialog.askopenfilename(filetypes=[("Images", "*.png *.jpg *.jpeg *.gif *.webp")])
        if path:
            self.auto_initial_var.set(path)
            self.initial_image_path = path
    
    def _browse_target(self):
        path = filedialog.askopenfilename(filetypes=[("Images", "*.png *.jpg *.jpeg *.gif *.webp")])
        if path:
            self.target_path_var.set(path)
            self.target_image_path = path
    
    def _new_project(self):
        """Create a new project."""
        name = simpledialog.askstring("New Project", "Enter project name:", parent=self)
        if name:
            name = name.strip().replace(" ", "_")
            self.project = Project(name).create()
            self.project_name_var.set(name)
            self._clear_panels()
            self.status_var.set(f"Created project: {name}")
    
    def _load_project(self):
        """Load an existing project."""
        projects = Project.list_projects()
        if not projects:
            messagebox.showinfo("Info", "No projects found")
            return
        
        # Create selection dialog
        dialog = tk.Toplevel(self)
        dialog.title("Load Project")
        dialog.geometry("400x300")
        dialog.transient(self)
        dialog.grab_set()
        
        tk.Label(dialog, text="Select a project:", font=("Arial", 11)).pack(pady=10)
        
        listbox = tk.Listbox(dialog, font=("Consolas", 10))
        listbox.pack(fill=tk.BOTH, expand=True, padx=10, pady=5)
        
        for p in projects:
            listbox.insert(tk.END, f"{p['name']} ({p['image_count']} images)")
        
        def on_select():
            sel = listbox.curselection()
            if sel:
                name = projects[sel[0]]["name"]
                dialog.destroy()
                self._do_load_project(name)
        
        ttk.Button(dialog, text="Load", command=on_select).pack(pady=10)
    
    def _do_load_project(self, name):
        """Actually load the project."""
        try:
            self.project = Project.load(name)
            self.project_name_var.set(name)
            self.prompts = self.project.prompts
            self.initial_image_path = self.project.initial_image_path
            
            # Clear panels first (this also clears self.images)
            self._clear_panels()
            
            # Now set images from loaded project
            self.images = self.project.images
            
            print(f"[App] Loaded project with {len(self.images)} images and {len(self.prompts)} prompts")
            
            # Show initial image
            if self.images:
                print(f"[App] Creating initial panel with IMAGE_0")
                self.initial_panel = InitialImagePanel(self.steps_frame)
                self.initial_panel.pack(fill=tk.X, padx=5, pady=5)
                self.initial_panel.set_image(self.images[0])
            else:
                print(f"[App] No images to show!")
            
            # Show step panels with loaded images
            completed_steps = len(self.images) - 1  # Subtract initial image
            print(f"[App] Completed steps: {completed_steps}")
            
            for i, (step_num, prompt) in enumerate(self.prompts):
                panel = StepPanel(self.steps_frame, step_num, prompt, on_retry=self._retry_step)
                panel.pack(fill=tk.X, padx=5, pady=5)
                self.step_panels.append(panel)
                
                # Set image if available, otherwise show pending
                img_idx = i + 1
                print(f"[App] Step {i}: checking img_idx={img_idx}, have {len(self.images)} images")
                if img_idx < len(self.images):
                    print(f"[App] Setting image for step {i}")
                    panel.set_image(self.images[img_idx])
                else:
                    print(f"[App] Step {i} is pending")
                    panel.set_pending()
            
            # Update prompt text
            if self.prompts:
                from prompt_parser import format_steps
                self.prompt_text.delete("1.0", tk.END)
                self.prompt_text.insert("1.0", format_steps(self.prompts))
            
            pending = len(self.prompts) - completed_steps
            status = f"Loaded project: {name} ({len(self.images)} images"
            if pending > 0:
                status += f", {pending} steps pending - click Resume)"
            else:
                status += ")"
            self.status_var.set(status)
        except Exception as e:
            import traceback
            traceback.print_exc()
            messagebox.showerror("Error", f"Failed to load project: {e}")

    def _on_provider_change(self):
        """Handle provider selection change."""
        provider = self.provider_var.get()
        set_provider(provider)
        self.status_var.set(f"Provider changed to: {provider}")
    
    def _on_face_validation_toggle(self):
        """Handle face validation toggle."""
        from image_generator import enable_face_validation
        enabled = self.face_validation_var.get()
        enable_face_validation(enabled)

    def _on_threshold_change(self, value):
        """Handle threshold slider change."""
        from image_generator import set_face_threshold
        threshold = float(value)
        set_face_threshold(threshold)
        self.threshold_label.config(text=f"{int(threshold*100)}%")

    def _on_face_retries_change(self):
        """Handle face retries change."""
        from image_generator import set_face_max_retries
        retries = self.face_retries_var.get()
        set_face_max_retries(retries)

    def _on_retry_change(self):
        """Handle retry count change."""
        retries = self.retry_var.get()
        set_max_retries(retries)
        self.status_var.set(f"Max retries set to: {retries}")

    
    def _generate_manual(self):
        """Generate sequence from manual prompt input."""
        if not self.initial_image_path:
            messagebox.showerror("Error", "Please select an initial image")
            return
        
        prompt = self.prompt_text.get("1.0", tk.END).strip()
        if not prompt:
            messagebox.showerror("Error", "Please enter a multi-step prompt")
            return
        
        self.prompts = parse_steps(prompt)
        if not self.prompts:
            messagebox.showerror("Error", "No steps found. Use format: Step 1: ..., Step 2: ...")
            return
        
        self._run_generation()
    
    def _generate_prompts(self):
        """Generate prompts using Grok-4."""
        if not self.initial_image_path:
            messagebox.showerror("Error", "Please select an initial image")
            return
        if not self.target_image_path:
            messagebox.showerror("Error", "Please select a target image")
            return
        
        num_steps = self.num_steps_var.get()
        self.status_var.set(f"Generating {num_steps} prompts with Grok-4...")
        
        def do_generate():
            try:
                meta = self.meta_prompt_text.get("1.0", tk.END).strip()
                result = generate_prompts(
                    self.initial_image_path,
                    self.target_image_path,
                    meta_prompt=meta if meta else None,
                    num_steps=num_steps
                )
                self.after(0, lambda r=result: self._on_prompts_generated(r))
            except Exception as e:
                err_msg = str(e)
                self.after(0, lambda msg=err_msg: self._on_error(msg))
        
        threading.Thread(target=do_generate, daemon=True).start()
    
    def _on_prompts_generated(self, result):
        self.generated_prompts_text.delete("1.0", tk.END)
        self.generated_prompts_text.insert("1.0", result)
        self.status_var.set("Prompts generated. Edit if needed, then click 'Run Sequence'")
    
    def _run_auto_sequence(self):
        """Run sequence from auto-generated prompts."""
        if not self.initial_image_path:
            path = self.auto_initial_var.get()
            if path:
                self.initial_image_path = path
            else:
                messagebox.showerror("Error", "Please select an initial image")
                return
        
        prompt = self.generated_prompts_text.get("1.0", tk.END).strip()
        if not prompt:
            messagebox.showerror("Error", "No prompts generated. Click 'Generate Prompts' first")
            return
        
        self.prompts = parse_steps(prompt)
        if not self.prompts:
            messagebox.showerror("Error", "No steps found in generated prompts")
            return
        
        self._run_generation()
    
    def _clear_panels(self):
        """Clear all step panels."""
        for panel in self.step_panels:
            panel.destroy()
        self.step_panels = []
        if self.initial_panel:
            self.initial_panel.destroy()
            self.initial_panel = None
        self.images = []

    
    def _run_generation(self):
        """Run the image generation sequence."""
        # Create project if none exists
        if not self.project:
            name = datetime.now().strftime("%Y%m%d_%H%M%S")
            self.project = Project(name).create()
            self.project_name_var.set(name)
        
        self._clear_panels()
        
        # Load and display initial image
        initial_img = Image.open(self.initial_image_path)
        initial_img.load()  # Force load
        self.images = [initial_img]
        
        # Save to project
        self.project.save_initial_image(initial_img, self.initial_image_path)
        self.project.save_prompts(self.prompts)
        
        self.initial_panel = InitialImagePanel(self.steps_frame)
        self.initial_panel.pack(fill=tk.X, padx=5, pady=5)
        self.initial_panel.set_image(initial_img)
        
        # Create step panels
        for i, (step_num, prompt) in enumerate(self.prompts):
            panel = StepPanel(self.steps_frame, step_num, prompt, on_retry=self._retry_step)
            panel.pack(fill=tk.X, padx=5, pady=5)
            self.step_panels.append(panel)
        
        self.status_var.set(f"Generating {len(self.prompts)} images...")
        
        # Start generation in background
        threading.Thread(target=self._do_generation, daemon=True).start()
    
    def _do_generation(self):
        """Background thread for generation."""
        # Import face validation status
        from image_generator import is_face_validation_enabled, generate_image_with_fallback, generate_image_with_face_validation

        for i, (step_num, prompt) in enumerate(self.prompts):
            # Set generating state
            self.after(0, lambda idx=i: self.step_panels[idx].set_generating())

            # Get all previous images as context
            context_images = self.images.copy() if self.images else []

            # Get previous image for face comparison (if exists)
            previous_image = self.images[-1] if self.images else None

            try:
                # Generate with streaming callback
                def on_chunk(text, idx=i):
                    self.response_queue.put(("append", idx, text))

                # Choose generation method based on face validation setting
                if is_face_validation_enabled() and previous_image is not None:
                    # Use face validation
                    result_img, provider_used, similarity_score = generate_image_with_face_validation(
                        prompt=prompt,
                        previous_image=previous_image,
                        context_images=context_images,
                        on_chunk=on_chunk,
                    )
                else:
                    # Regular generation with fallback
                    result_img, provider_used = generate_image_with_fallback(
                        prompt=prompt,
                        context_images=context_images,
                        on_chunk=on_chunk,
                    )
                    # Calculate face similarity for display (even without retry logic)
                    similarity_score = None
                    if previous_image is not None and result_img is not None:
                        try:
                            from face_similarity import calculate_similarity, FACE_RECOGNITION_AVAILABLE
                            if FACE_RECOGNITION_AVAILABLE:
                                similarity_score = calculate_similarity(previous_image, result_img)
                        except ImportError:
                            pass

                if result_img:
                    # Save to project
                    if self.project:
                        self.project.add_generated_image(result_img)

                        # Track metadata
                        if not hasattr(self.project.metadata, 'providers_used'):
                            self.project.metadata['providers_used'] = []
                        if not hasattr(self.project.metadata, 'face_similarities'):
                            self.project.metadata['face_similarities'] = []

                        self.project.metadata['providers_used'].append(provider_used)
                        self.project.metadata['face_similarities'].append(similarity_score)
                        self.project.metadata['face_validation_enabled'] = is_face_validation_enabled()

                    # Send metadata
                    self.response_queue.put(("metadata", i, {
                        "provider": provider_used,
                        "similarity": similarity_score,
                    }))

                    self.response_queue.put(("image", i, result_img))
                    self.images.append(result_img)
                else:
                    self.response_queue.put(("no_image", i))
                    # Keep using previous image for next step

            except Exception as e:
                self.response_queue.put(("error", i, str(e)))
                self.response_queue.put(("status", f"Pipeline stopped at step {i+1} due to error"))
                return  # Stop pipeline on error

            self.response_queue.put(("status", f"Completed step {i+1}/{len(self.prompts)}"))

        self.response_queue.put(("status", "Generation complete!"))
    
    def _retry_step(self, step_num):
        """Retry a specific step."""
        # Find the panel index
        idx = None
        for i, (sn, _) in enumerate(self.prompts):
            if sn == step_num:
                idx = i
                break

        if idx is None:
            return

        prompt = self.prompts[idx][1]
        # Get all images up to this step as context
        context_images = self.images[:idx+1] if self.images else []
        # Get previous image for face comparison (image from step before current)
        # FIXED: Use idx-1 to get previous step's image, not idx (which would be current step)
        previous_image = self.images[idx-1] if idx > 0 and idx-1 < len(self.images) else None

        self.step_panels[idx].set_generating()

        def do_retry():
            from image_generator import is_face_validation_enabled, generate_image_with_fallback, generate_image_with_face_validation

            try:
                def on_chunk(text):
                    self.response_queue.put(("append", idx, text))

                # Use face validation if enabled
                if is_face_validation_enabled() and previous_image is not None:
                    result_img, provider_used, similarity_score = generate_image_with_face_validation(
                        prompt=prompt,
                        previous_image=previous_image,
                        context_images=context_images,
                        on_chunk=on_chunk,
                    )
                else:
                    result_img, provider_used = generate_image_with_fallback(
                        prompt=prompt,
                        context_images=context_images,
                        on_chunk=on_chunk,
                    )
                    # Calculate face similarity for display (even without retry logic)
                    similarity_score = None
                    if previous_image is not None and result_img is not None:
                        try:
                            from face_similarity import calculate_similarity, FACE_RECOGNITION_AVAILABLE
                            if FACE_RECOGNITION_AVAILABLE:
                                similarity_score = calculate_similarity(previous_image, result_img)
                        except ImportError:
                            pass

                if result_img:
                    # Save to project
                    img_idx = idx + 1  # +1 because IMAGE_0 is initial
                    if self.project:
                        self.project.save_image(result_img, img_idx)

                    # Update images list
                    if img_idx < len(self.images):
                        self.images[img_idx] = result_img
                    else:
                        self.images.append(result_img)

                    # Send metadata
                    self.response_queue.put(("metadata", idx, {
                        "provider": provider_used,
                        "similarity": similarity_score,
                    }))

                    self.response_queue.put(("image", idx, result_img))
                else:
                    self.response_queue.put(("no_image", idx))

            except Exception as e:
                self.response_queue.put(("error", idx, str(e)))

        threading.Thread(target=do_retry, daemon=True).start()

    
    def _retry_all(self):
        """Retry the entire sequence."""
        if not self.prompts or not self.initial_image_path:
            messagebox.showinfo("Info", "No sequence to retry")
            return
        self._run_generation()
    
    def _resume_pipeline(self):
        """Resume pipeline from where it stopped."""
        if not self.prompts:
            messagebox.showinfo("Info", "No prompts to resume")
            return
        
        if not self.images:
            messagebox.showinfo("Info", "No images loaded. Load a project first.")
            return
        
        # Find first incomplete step (step index = image count - 1, since IMAGE_0 is initial)
        completed_steps = len(self.images) - 1  # Subtract initial image
        total_steps = len(self.prompts)
        
        if completed_steps >= total_steps:
            messagebox.showinfo("Info", "All steps already completed!")
            return
        
        self.status_var.set(f"Resuming from step {completed_steps + 1}...")
        
        # Start generation from the incomplete step
        threading.Thread(target=self._do_resume_generation, args=(completed_steps,), daemon=True).start()
    
    def _do_resume_generation(self, start_from: int):
        """Background thread for resumed generation."""
        for i in range(start_from, len(self.prompts)):
            step_num, prompt = self.prompts[i]
            
            # Set generating state
            self.after(0, lambda idx=i: self.step_panels[idx].set_generating())
            
            # Get all previous images as context
            context_images = self.images.copy() if self.images else []
            
            try:
                # Generate with streaming callback
                def on_chunk(text, idx=i):
                    self.response_queue.put(("append", idx, text))
                
                result_img = generate_image_streaming(
                    prompt=prompt,
                    context_images=context_images,
                    on_chunk=on_chunk
                )
                
                if result_img:
                    # Save to project
                    if self.project:
                        self.project.add_generated_image(result_img)
                    
                    self.response_queue.put(("image", i, result_img))
                    self.images.append(result_img)
                else:
                    self.response_queue.put(("no_image", i))
                    
            except Exception as e:
                self.response_queue.put(("error", i, str(e)))
                self.response_queue.put(("status", f"Pipeline stopped at step {i+1} due to error"))
                return  # Stop pipeline on error
            
            self.response_queue.put(("status", f"Completed step {i+1}/{len(self.prompts)}"))
        
        self.response_queue.put(("status", "Generation complete!"))
    
    def _save_all(self):
        """Save all images (creates project if needed)."""
        if not self.images:
            messagebox.showinfo("Info", "No images to save")
            return
        
        if not self.project:
            name = simpledialog.askstring("Save Project", "Enter project name:", parent=self)
            if not name:
                return
            name = name.strip().replace(" ", "_")
            self.project = Project(name).create()
            self.project_name_var.set(name)
        
        # Save all images
        for i, img in enumerate(self.images):
            self.project.save_image(img, i)
        
        if self.prompts:
            self.project.save_prompts(self.prompts)
        
        self.status_var.set(f"Saved to project: {self.project.name}")
        messagebox.showinfo("Saved", f"Project saved to:\n{self.project.path}")
    
    def _on_error(self, msg):
        self.status_var.set(f"Error: {msg}")
        messagebox.showerror("Error", msg)


def main():
    app = App()
    app.mainloop()


if __name__ == "__main__":
    main()
