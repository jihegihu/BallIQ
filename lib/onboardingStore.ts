import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface OnboardingStore {
  hasSeenOnboarding: boolean;
  isOpen: boolean;
  open: () => void;
  close: () => void;
}

export const useOnboardingStore = create<OnboardingStore>()(
  persist(
    (set) => ({
      hasSeenOnboarding: false,
      isOpen: false,
      open:  () => set({ isOpen: true }),
      close: () => set({ isOpen: false, hasSeenOnboarding: true }),
    }),
    { name: 'balliq-onboarding' },
  ),
);
