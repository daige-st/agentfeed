import { create } from "zustand";

interface FeedState {
  selectedFeedId: string | null;
  isHydrated: boolean;
  isFeedPanelOpen: boolean;
  feedListVersion: number;
  setSelectedFeedId: (id: string | null) => void;
  selectFeed: (id: string | null) => void;
  openFeedPanel: () => void;
  closeFeedPanel: () => void;
  invalidateFeedList: () => void;
  reset: () => void;
}

export const useFeedStore = create<FeedState>((set) => ({
  selectedFeedId: null,
  isHydrated: false,
  isFeedPanelOpen: false,
  feedListVersion: 0,

  setSelectedFeedId: (id) =>
    set({ selectedFeedId: id, isHydrated: true }),

  selectFeed: (id) =>
    set((state) => {
      if (state.selectedFeedId === id) {
        return { selectedFeedId: null, isHydrated: true };
      }
      return { selectedFeedId: id, isHydrated: true };
    }),

  openFeedPanel: () => set({ isFeedPanelOpen: true }),
  closeFeedPanel: () => set({ isFeedPanelOpen: false }),
  invalidateFeedList: () => set((s) => ({ feedListVersion: s.feedListVersion + 1 })),

  reset: () =>
    set({
      selectedFeedId: null,
      isHydrated: false,
      isFeedPanelOpen: false,
      feedListVersion: 0,
    }),
}));
