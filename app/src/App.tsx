import { useState, useEffect } from 'react';
import { Button } from '@/components/ui';
import { GridIcon, ChatIcon, FramesIcon, ImageIcon, AlbumIcon, TransformIcon } from '@/components/Icons';
import { GalleryView } from '@/pages/GalleryView';
import { StoryView } from '@/pages/StoryView';
import { FramesView } from '@/pages/FramesView';
import { GenerationView } from '@/pages/GenerationView';
import { AlbumSetupView } from '@/pages/AlbumSetupView';
import { AlbumPromptsView } from '@/pages/AlbumPromptsView';
import { AlbumProgressView } from '@/pages/AlbumProgressView';
import { AlbumView } from '@/pages/AlbumView';
import { SettingsView } from '@/pages/SettingsView';
import { useProjectStore } from '@/stores/projectStore';
import { useStoryStore } from '@/stores/storyStore';
import { useGenerationStore } from '@/stores/generationStore';
import { useAlbumStore } from '@/stores/albumStore';
import type { ProjectType } from '@/types';

type View = 'gallery' | 'story' | 'frames' | 'generation' | 'album-setup' | 'album-view' | 'album-prompts' | 'album-progress' | 'settings';

interface NavItem {
  id: View;
  icon: typeof GridIcon;
  title: string;
  projectTypes?: ProjectType[];
}

const NAV_ITEMS: NavItem[] = [
  { id: 'gallery', icon: GridIcon, title: 'Projects' },
  // Story workflow
  { id: 'story', icon: ChatIcon, title: 'Story', projectTypes: ['story'] },
  { id: 'frames', icon: FramesIcon, title: 'Frames', projectTypes: ['story'] },
  { id: 'generation', icon: ImageIcon, title: 'Generate', projectTypes: ['story'] },
  // Album workflow
  { id: 'album-view', icon: AlbumIcon, title: 'Album', projectTypes: ['album'] },
  { id: 'album-prompts', icon: TransformIcon, title: 'Prompts', projectTypes: ['album'] },
  { id: 'album-progress', icon: ImageIcon, title: 'Transform', projectTypes: ['album'] },
];

export default function App() {
  const [currentView, setCurrentView] = useState<View>('gallery');
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);

  const { currentProject, fetchProject, clearCurrentProject } = useProjectStore();
  const { clearChat, clearFrames } = useStoryStore();
  const { clearQueue } = useGenerationStore();
  const { clearAlbum, setAlbumName } = useAlbumStore();

  // Load project when selected
  useEffect(() => {
    if (currentProjectId) {
      fetchProject(currentProjectId);
    }
  }, [currentProjectId, fetchProject]);

  const handleSelectProject = (projectId: string, projectType: ProjectType = 'story') => {
    setCurrentProjectId(projectId);
    // Navigate to appropriate first view based on project type
    if (projectType === 'album') {
      setCurrentView('album-view');
      clearAlbum();
    } else {
      setCurrentView('story');
      clearChat();
      clearFrames();
      clearQueue();
    }
  };

  const handleCreateAlbum = (name: string) => {
    clearAlbum();
    setAlbumName(name);
    setCurrentView('album-setup');
  };

  const handleAlbumSetupComplete = (projectId: string) => {
    setCurrentProjectId(projectId);
    fetchProject(projectId);
    setCurrentView('album-prompts');
  };

  const handleBackToGallery = () => {
    setCurrentView('gallery');
    setCurrentProjectId(null);
    clearCurrentProject();
    clearChat();
    clearFrames();
    clearQueue();
    clearAlbum();
  };

  const handleGoToFrames = () => {
    setCurrentView('frames');
  };

  const handleGoToGeneration = () => {
    setCurrentView('generation');
  };

  const handleBackToChat = () => {
    setCurrentView('story');
  };

  const handleGoToAlbumProgress = () => {
    setCurrentView('album-progress');
  };

  const handleBackToAlbumView = () => {
    setCurrentView('album-view');
  };

  const handleGoToAlbumPrompts = () => {
    setCurrentView('album-prompts');
  };

  const getHeaderTitle = () => {
    if (currentProjectId && currentProject) {
      return currentProject.name;
    }
    return 'NanoCrazer';
  };

  // Filter nav items based on current project type
  const visibleNavItems = NAV_ITEMS.filter((item) => {
    if (!item.projectTypes) return true; // Gallery is always visible
    if (!currentProject) return false;
    return item.projectTypes.includes(currentProject.project_type);
  });

  return (
    <div className="flex min-h-screen bg-bg text-text-primary">
      {/* Sidebar Navigation */}
      <nav className="w-16 bg-bg border-r border-border flex flex-col items-center py-5 gap-2">
        {visibleNavItems.map((item) => {
          const Icon = item.icon;
          const isActive = currentView === item.id;
          const isDisabled = item.id !== 'gallery' && !currentProjectId;

          return (
            <button
              key={item.id}
              className={`w-11 h-11 flex items-center justify-center rounded-lg transition-all ${
                isActive
                  ? 'bg-bg-card opacity-100'
                  : isDisabled
                  ? 'opacity-30 cursor-not-allowed'
                  : 'opacity-50 hover:bg-bg-card hover:opacity-100'
              }`}
              onClick={() => !isDisabled && setCurrentView(item.id)}
              title={item.title}
              disabled={isDisabled}
            >
              <Icon className="text-text-primary" />
            </button>
          );
        })}
      </nav>

      {/* Main Content */}
      <main className="flex-1 flex flex-col">
        {/* Header */}
        <header className="h-[60px] border-b border-border flex items-center justify-between px-6">
          <h1 className="text-xl font-medium tracking-tight">{getHeaderTitle()}</h1>
          <div className="flex items-center gap-3">
            {currentProjectId && (
              <Button variant="ghost" onClick={handleBackToGallery}>
                Close Project
              </Button>
            )}
            <a href="https://www.buymeacoffee.com/nickguy" target="_blank" rel="noopener noreferrer" className="text-sm text-text-secondary hover:text-text-primary transition-colors px-3 py-1.5 rounded border border-border hover:border-text-secondary">☕ Buy me a coffee</a>
            <Button variant="ghost" onClick={() => setCurrentView('settings')}>
              Settings
            </Button>
          </div>
        </header>

        {/* View Content */}
        {currentView === 'gallery' && (
          <GalleryView
            onSelectProject={handleSelectProject}
            onCreateAlbum={handleCreateAlbum}
          />
        )}
        {currentView === 'story' && currentProjectId && (
          <StoryView projectId={currentProjectId} onGenerateFrames={handleGoToFrames} />
        )}
        {currentView === 'frames' && currentProjectId && (
          <FramesView onBack={handleBackToChat} onGenerate={handleGoToGeneration} />
        )}
        {currentView === 'generation' && currentProjectId && (
          <GenerationView projectId={currentProjectId} />
        )}
        {currentView === 'album-setup' && (
          <AlbumSetupView
            onComplete={handleAlbumSetupComplete}
            onBack={handleBackToGallery}
          />
        )}
        {currentView === 'album-view' && currentProjectId && (
          <AlbumView
            projectId={currentProjectId}
            onBack={handleBackToGallery}
            onEditPrompts={handleGoToAlbumPrompts}
            onTransform={handleGoToAlbumProgress}
          />
        )}
        {currentView === 'album-prompts' && currentProjectId && (
          <AlbumPromptsView
            projectId={currentProjectId}
            onRun={handleGoToAlbumProgress}
            onBack={handleBackToAlbumView}
          />
        )}
        {currentView === 'album-progress' && currentProjectId && (
          <AlbumProgressView
            projectId={currentProjectId}
            onBack={handleBackToAlbumView}
          />
        )}
        {currentView === 'settings' && (
          <SettingsView onBack={handleBackToGallery} />
        )}
      </main>
    </div>
  );
}
