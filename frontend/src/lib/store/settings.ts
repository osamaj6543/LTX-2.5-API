import { create } from "zustand";
import { persist } from "zustand/middleware";

interface SettingsState {
  baseUrl: string;
  apiKey: string;
  setConnection: (baseUrl: string, apiKey: string) => void;
  clearConnection: () => void;
}

/**
 * Client-side connection settings (API base URL + X-API-Key).
 * Persisted to localStorage — the key never touches our own server because
 * this app is fully client-side and talks straight to the LTX API.
 */
export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      baseUrl: "http://localhost:8000",
      apiKey: "",
      setConnection: (baseUrl, apiKey) => {
        set({ baseUrl: baseUrl.replace(/\/+$/, ""), apiKey: apiKey.trim() });
      },
      clearConnection: () => set({ apiKey: "" }),
    }),
    { name: "ltx-studio-settings" }
  )
);
