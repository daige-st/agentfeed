import { useCallback, useEffect, useRef } from "react";
import { X } from "lucide-react";
import { useFeedStore } from "../store/useFeedStore";
import { FeedPanel } from "./FeedPanel";

export function FeedPanelBottomSheet() {
  const { isFeedPanelOpen, closeFeedPanel, selectedFeedId } = useFeedStore();
  const prevFeedIdRef = useRef(selectedFeedId);

  // Auto-close when feed is selected
  useEffect(() => {
    if (isFeedPanelOpen && selectedFeedId !== prevFeedIdRef.current) {
      closeFeedPanel();
    }
    prevFeedIdRef.current = selectedFeedId;
  }, [isFeedPanelOpen, selectedFeedId, closeFeedPanel]);

  // ESC key close
  const handleEscapeClose = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") closeFeedPanel();
    },
    [closeFeedPanel]
  );

  useEffect(() => {
    if (!isFeedPanelOpen) return;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleEscapeClose);
    return () => {
      document.body.style.overflow = "auto";
      window.removeEventListener("keydown", handleEscapeClose);
    };
  }, [isFeedPanelOpen, handleEscapeClose]);

  if (!isFeedPanelOpen) return null;

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) closeFeedPanel();
  };

  return (
    <div
      className="md:hidden fixed inset-0 z-[var(--z-index-modal)] flex items-end bg-black/50"
      onClick={handleBackdropClick}
    >
      <div
        className="w-full bg-header-bg rounded-t-2xl max-h-[85vh] animate-slide-up overflow-hidden flex flex-col"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drag handle + Close */}
        <div className="flex items-center justify-between px-4 pt-3 pb-2 shrink-0">
          <div className="flex-1 flex justify-center">
            <div className="w-10 h-1 bg-gray-300 dark:bg-border-default rounded-full" />
          </div>
          <button
            onClick={closeFeedPanel}
            className="absolute right-3 top-3 p-1 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-full hover:bg-interactive-hover transition-colors cursor-pointer"
          >
            <X size={20} className="text-text-secondary" />
          </button>
        </div>

        {/* Feed Panel Content */}
        <div className="px-2 pb-2 overflow-y-auto min-h-0">
          <FeedPanel />
        </div>
      </div>
    </div>
  );
}
