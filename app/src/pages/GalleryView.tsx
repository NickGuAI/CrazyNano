import { useEffect, useRef, useState } from 'react';
import anime from 'animejs';
import { Card, Modal, Input, Button, Toast } from '@/components/ui';
import { PlusIcon, ImageIcon, AlbumIcon } from '@/components/Icons';
import { useProjectStore } from '@/stores/projectStore';
import { getImageUrl } from '@/services/projects';
import type { ProjectType, BookStyle } from '@/types';

interface GalleryViewProps {
  onSelectProject: (projectId: string, projectType: ProjectType) => void;
  onCreateAlbum: (name: string) => void;
}

export function GalleryView({ onSelectProject, onCreateAlbum }: GalleryViewProps) {
  const gridRef = useRef<HTMLDivElement>(null);
  const [isModalOpen, setModalOpen] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [newProjectType, setNewProjectType] = useState<ProjectType>('story');
  const [newBookStyle, setNewBookStyle] = useState<BookStyle>('generic');
  const [toast, setToast] = useState<string | null>(null);

  const { projects, projectsLoading, fetchProjects, createProject } = useProjectStore();

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  // Animate cards on mount
  useEffect(() => {
    if (gridRef.current && projects.length > 0) {
      const cards = gridRef.current.querySelectorAll('.project-card');
      anime({
        targets: cards,
        opacity: [0, 1],
        scale: [0.95, 1],
        delay: anime.stagger(100),
        duration: 400,
        easing: 'easeOutCubic',
      });
    }
  }, [projects]);

  const handleCreateProject = async () => {
    // Both types require a name
    if (!newProjectName.trim()) return;

    // For album, go to setup view instead of creating project directly
    if (newProjectType === 'album') {
      const albumName = newProjectName.trim();
      setModalOpen(false);
      setToast('Setting up album...');
      // Small delay for toast visibility before navigation
      setTimeout(() => {
        setNewProjectName('');
        setNewProjectType('story');
        setNewBookStyle('generic');
        onCreateAlbum(albumName);
      }, 200);
      return;
    }

    try {
      const projectId = await createProject(newProjectName.trim(), newBookStyle);
      setModalOpen(false);
      setNewProjectName('');
      setNewProjectType('story');
      setNewBookStyle('generic');
      setToast(`"${newProjectName}" created`);
      // Navigate to story view for new project
      setTimeout(() => onSelectProject(projectId, 'story'), 300);
    } catch {
      setToast('Failed to create project');
    }
  };

  if (projectsLoading && projects.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <span className="text-text-secondary">Loading projects...</span>
      </div>
    );
  }

  return (
    <div className="flex-1 p-6 overflow-y-auto">
      <div ref={gridRef} className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-4">
        {/* New project card */}
        <Card
          variant="dashed"
          className="project-card min-h-[200px] flex flex-col items-center justify-center cursor-pointer hover:border-text-secondary"
          onClick={() => setModalOpen(true)}
        >
          <PlusIcon className="text-text-secondary mb-3" size={32} />
          <span className="text-text-secondary text-base">Create new project</span>
        </Card>

        {/* Existing projects */}
        {projects.map((project) => (
          <Card
            key={project.id}
            variant="interactive"
            className="project-card overflow-hidden"
            onClick={() => onSelectProject(project.id, project.project_type)}
          >
            <div className="aspect-[16/10] bg-accent-dim flex items-center justify-center relative">
              {project.image_count > 0 ? (
                <img
                  src={getImageUrl(project.id, 'IMAGE_0')}
                  alt={project.name}
                  className="w-full h-full object-cover"
                />
              ) : project.project_type === 'album' ? (
                <AlbumIcon className="text-text-secondary" size={40} />
              ) : (
                <ImageIcon className="text-text-secondary" size={40} />
              )}
              {/* Project type badge */}
              <div className="absolute top-2 right-2">
                <span className={`text-xs px-2 py-0.5 rounded ${
                  project.project_type === 'album'
                    ? 'bg-yellow-500/20 text-yellow-400'
                    : 'bg-accent-dim text-text-primary'
                }`}>
                  {project.project_type}
                </span>
              </div>
            </div>
            <div className="p-4">
              <div className="text-lg font-medium mb-1">{project.name}</div>
              <div className="text-sm text-text-secondary">
                {project.image_count} images
                {project.created && ` · ${formatDate(project.created)}`}
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* New project modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setModalOpen(false)}
        title="Create New Project"
      >
        {/* Project type selector */}
        <div className="mb-4">
          <label className="block text-sm font-medium mb-2">Project Type</label>
          <div className="flex gap-2">
            <Button
              variant={newProjectType === 'story' ? 'primary' : 'ghost'}
              className="flex-1"
              onClick={() => setNewProjectType('story')}
            >
              Story
            </Button>
            <Button
              variant={newProjectType === 'album' ? 'primary' : 'ghost'}
              className="flex-1"
              onClick={() => setNewProjectType('album')}
            >
              Album
            </Button>
          </div>
        </div>

        {/* Description based on type */}
        <p className="text-sm text-text-secondary mb-4">
          {newProjectType === 'story'
            ? 'Brainstorm a story plot, generate frames, and create images from scratch.'
            : 'Upload initial and target images to generate a step-by-step transformation.'}
        </p>

        {newProjectType === 'story' && (
          <div className="mb-4">
            <label className="block text-sm font-medium mb-2">Book Style</label>
            <select
              className="w-full bg-bg-card border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-text-secondary"
              value={newBookStyle}
              onChange={(e) => setNewBookStyle(e.target.value as BookStyle)}
            >
              <option value="generic">Generic (no style)</option>
              <option value="coloring">Coloring Book</option>
              <option value="paper-cutting">Paper Cutting</option>
              <option value="watercolor">Watercolor</option>
              <option value="sketch">Sketch</option>
            </select>
          </div>
        )}

        {/* Name input for both story and album */}
        <Input
          placeholder={newProjectType === 'album' ? 'Album name...' : 'Project name...'}
          value={newProjectName}
          onChange={(e) => setNewProjectName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleCreateProject()}
          autoFocus
        />

        <div className="flex gap-3 justify-end mt-5">
          <Button variant="secondary" onClick={() => setModalOpen(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleCreateProject}
            disabled={!newProjectName.trim()}
          >
            {newProjectType === 'album' ? 'Continue to Setup' : 'Create'}
          </Button>
        </div>
      </Modal>

      {/* Toast */}
      <Toast
        message={toast || ''}
        isVisible={!!toast}
        onHide={() => setToast(null)}
      />
    </div>
  );
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffHours < 1) return 'Just now';
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}
