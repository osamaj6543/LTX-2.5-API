import { create } from "zustand";
import { persist } from "zustand/middleware";

interface ProjectsState {
  /** Currently active project (null = "All work" — unscoped view). */
  activeProjectId: string | null;
  setActiveProject: (projectId: string | null) => void;
}

/**
 * Client-side project UI state. Project *data* lives on the LTX API server
 * (SQLite); only the "which project am I working in" pointer is persisted here
 * so the app reopens in the same workspace.
 */
export const useProjectStore = create<ProjectsState>()(
  persist(
    (set) => ({
      activeProjectId: null,
      setActiveProject: (activeProjectId) => set({ activeProjectId }),
    }),
    { name: "ltx-studio-active-project" }
  )
);