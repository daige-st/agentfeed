import { Menu } from "lucide-react";
import { FeedPanel } from "../components/FeedPanel";
import { FeedPanelBottomSheet } from "../components/FeedPanelBottomSheet";
import { ContentPanel } from "../components/ContentPanel";
import { LogoIcon } from "../components/Icons";
import { useFeedStore } from "../store/useFeedStore";
import { useUrlSync } from "../hooks/useUrlSync";

export function Home() {
  useUrlSync();
  const openFeedPanel = useFeedStore((s) => s.openFeedPanel);

  return (
    <div className="h-screen bg-surface relative">
      {/* Sidebar - absolute positioned like Daigest */}
      <div className="hidden md:flex flex-col absolute top-6 left-6 w-[280px] z-10">
        {/* Logo */}
        <button
          onClick={() => window.location.replace("/")}
          className="block mb-4 cursor-pointer text-left"
        >
          <LogoIcon className="h-5 w-auto text-text-primary" />
        </button>

        {/* Floating Panel */}
        <div className="bg-header-bg rounded-xl shadow-md pt-2 px-2 pb-2 flex flex-col min-h-0 max-h-[calc(100vh-120px)] overflow-hidden">
          <FeedPanel />
        </div>
      </div>

      {/* Content - full width with left padding for sidebar */}
      <div className="h-full overflow-y-auto flex flex-col md:pl-[312px]">
        {/* Mobile Top Header */}
        <div className="md:hidden flex items-center gap-1 px-2 py-3 shrink-0">
          <button
            onClick={openFeedPanel}
            className="p-2 rounded-lg hover:bg-interactive-hover transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center cursor-pointer"
          >
            <Menu size={20} className="text-text-primary" />
          </button>
          <a href="/">
            <LogoIcon className="h-5 w-auto text-text-primary" />
          </a>
        </div>

        <ContentPanel />
      </div>

      {/* Mobile Feed Panel Bottom Sheet */}
      <FeedPanelBottomSheet />
    </div>
  );
}
