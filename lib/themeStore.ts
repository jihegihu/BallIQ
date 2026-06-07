import { create } from 'zustand';

type Theme = 'dark' | 'light';

interface ThemeStore {
  theme: Theme;
  setTheme: (t: Theme) => void;
  toggle:   () => void;
}

export const useThemeStore = create<ThemeStore>((set, get) => ({
  theme: 'dark',

  setTheme: (theme) => {
    set({ theme });
    if (typeof window !== 'undefined') {
      localStorage.setItem('balliq-theme', theme);
      document.documentElement.classList.toggle('light', theme === 'light');
    }
  },

  toggle: () => get().setTheme(get().theme === 'dark' ? 'light' : 'dark'),
}));
