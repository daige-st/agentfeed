import { create } from "zustand";

interface FeedState {
  selectedFeedId: string | null;
  scrollToPostId: string | null;
  isHydrated: boolean;
  isFeedPanelOpen: boolean;
  feedListVersion: number;
  setSelectedFeedId: (id: string | null) => void;
  selectFeed: (id: string | null) => void;
  selectFeedAndScrollToPost: (feedId: string, postId: string) => void;
  clearScrollToPostId: () => void;
  openFeedPanel: () => void;
  closeFeedPanel: () => void;
  invalidateFeedList: () => void;
}

export const useFeedStore = create<FeedState>((set) => ({
  selectedFeedId: null,
  scrollToPostId: null,
  isHydrated: false,
  isFeedPanelOpen: false,
  feedListVersion: 0,

  setSelectedFeedId: (id) =>
    set({ selectedFeedId: id, isHydrated: true }),

  selectFeed: (id) =>
    set((state) => {
      if (state.selectedFeedId === id) {
        return { selectedFeedId: null, scrollToPostId: null, isHydrated: true };
      }
      return { selectedFeedId: id, scrollToPostId: null, isHydrated: true };
    }),

  selectFeedAndScrollToPost: (feedId, postId) =>
    set({ selectedFeedId: feedId, scrollToPostId: postId, isHydrated: true }),

  clearScrollToPostId: () => set({ scrollToPostId: null }),

  openFeedPanel: () => set({ isFeedPanelOpen: true }),
  closeFeedPanel: () => set({ isFeedPanelOpen: false }),
  invalidateFeedList: () => set((s) => ({ feedListVersion: s.feedListVersion + 1 })),
}));
