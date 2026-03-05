// Project state management

import { create } from 'zustand';
import type { ProjectSummary, ProjectDetail, ImageMetadata } from '@/types';
import { listProjects, getProject, createProject as apiCreateProject } from '@/services/projects';

interface ProjectState {
  // Projects list
  projects: ProjectSummary[];
  projectsLoading: boolean;
  projectsError: string | null;

  // Current project
  currentProject: ProjectDetail | null;
  currentProjectLoading: boolean;
  currentProjectError: string | null;

  // Actions
  fetchProjects: () => Promise<void>;
  fetchProject: (id: string) => Promise<void>;
  createProject: (name: string, bookStyle?: string) => Promise<string>;
  clearCurrentProject: () => void;
  addImageToProject: (image: ImageMetadata) => void;
}

export const useProjectStore = create<ProjectState>((set, get) => ({
  projects: [],
  projectsLoading: false,
  projectsError: null,

  currentProject: null,
  currentProjectLoading: false,
  currentProjectError: null,

  fetchProjects: async () => {
    set({ projectsLoading: true, projectsError: null });
    try {
      const projects = await listProjects();
      set({ projects, projectsLoading: false });
    } catch (error) {
      set({
        projectsError: error instanceof Error ? error.message : 'Failed to load projects',
        projectsLoading: false,
      });
    }
  },

  fetchProject: async (id: string) => {
    set({ currentProjectLoading: true, currentProjectError: null });
    try {
      const project = await getProject(id);
      set({ currentProject: project, currentProjectLoading: false });
    } catch (error) {
      set({
        currentProjectError: error instanceof Error ? error.message : 'Failed to load project',
        currentProjectLoading: false,
      });
    }
  },

  createProject: async (name: string, bookStyle?: string) => {
    const response = await apiCreateProject(name, bookStyle);
    // Refresh projects list
    get().fetchProjects();
    return response.id;
  },

  clearCurrentProject: () => {
    set({ currentProject: null, currentProjectError: null });
  },

  addImageToProject: (image: ImageMetadata) => {
    const current = get().currentProject;
    if (current) {
      set({
        currentProject: {
          ...current,
          images: [...current.images, image],
        },
      });
    }
  },
}));
