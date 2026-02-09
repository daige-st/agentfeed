import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router";
import { Home, Settings, Plus } from "lucide-react";
import {
  MdOutlineDescription,
  MdOutlineDelete,
  MdOutlineAutoAwesome,
} from "react-icons/md";
import {
  DndContext,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { api, type FeedItem } from "../lib/api";
import { useFeedStore } from "../store/useFeedStore";
import { ConfirmModal } from "./Modal";

const iconSize = 16;

const navItemBase =
  "w-full flex items-center text-left rounded-full transition-colors cursor-pointer gap-1.5 px-2.5 py-1.5";
const navItemActive =
  "bg-white dark:bg-surface-active text-gray-900 dark:text-text-primary font-medium";
const navItemInactive =
  "text-gray-500 dark:text-text-tertiary hover:bg-white dark:hover:bg-interactive-hover";
const iconWrapper = "shrink-0 w-4 h-4 flex items-center justify-center";

function SortableFeedItem({
  feed,
  isSelected,
  onSelect,
  onDelete,
}: {
  feed: FeedItem;
  isSelected: boolean;
  onSelect: () => void;
  onDelete: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: feed.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : undefined,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={onSelect}
      className={`group ${navItemBase} ${
        isSelected
          ? navItemActive
          : "text-gray-500 dark:text-text-tertiary hover:bg-gray-50 dark:hover:bg-interactive-hover"
      }`}
    >
      <span className={iconWrapper}>
        {feed.has_updates ? (
          <MdOutlineAutoAwesome size={iconSize} />
        ) : (
          <MdOutlineDescription size={iconSize} />
        )}
      </span>
      <span className="flex-1 truncate text-sm">{feed.name}</span>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
        className="visible md:invisible md:group-hover:visible text-gray-400 dark:text-text-tertiary hover:text-gray-600 dark:hover:text-text-primary hover:bg-gray-200 dark:hover:bg-interactive-hover rounded transition-colors shrink-0 cursor-pointer p-1"
      >
        <MdOutlineDelete size={iconSize} />
      </button>
    </div>
  );
}

export function FeedPanel() {
  const [feeds, setFeeds] = useState<FeedItem[]>([]);
  const [deletingFeed, setDeletingFeed] = useState<FeedItem | null>(null);
  const { selectedFeedId, selectFeed, feedListVersion } = useFeedStore();
  const navigate = useNavigate();

  const mouseSensor = useSensor(MouseSensor, {
    activationConstraint: { distance: 8 },
  });
  const touchSensor = useSensor(TouchSensor, {
    activationConstraint: { delay: 250, tolerance: 5 },
  });
  const sensors = useSensors(mouseSensor, touchSensor);

  const loadFeeds = async () => {
    try {
      const data = await api.getFeeds();
      setFeeds(data);
    } catch {
      // If unauthorized, feeds will be empty
    }
  };

  useEffect(() => {
    loadFeeds();
  }, [feedListVersion]);

  const handleCreateFeed = useCallback(async () => {
    try {
      const created = await api.createFeed("");
      await loadFeeds();
      selectFeed(created.id);
    } catch (err) {
      console.error("Failed to create feed:", err);
    }
  }, [selectFeed]);

  const handleSelectFeed = useCallback(
    (feedId: string) => {
      selectFeed(feedId);
    },
    [selectFeed]
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;

      setFeeds((prev) => {
        const oldIndex = prev.findIndex((f) => f.id === active.id);
        const newIndex = prev.findIndex((f) => f.id === over.id);
        if (oldIndex === -1 || newIndex === -1) return prev;

        const reordered = arrayMove(prev, oldIndex, newIndex);
        const order = reordered.map((f) => f.id);
        api.reorderFeeds(order).catch(() => {
          loadFeeds();
        });
        return reordered;
      });
    },
    []
  );

  const handleConfirmDelete = useCallback(async () => {
    if (!deletingFeed) return;
    try {
      await api.deleteFeed(deletingFeed.id);
      if (selectedFeedId === deletingFeed.id) {
        selectFeed(null);
      }
      await loadFeeds();
    } catch (err) {
      console.error("Failed to delete feed:", err);
    }
    setDeletingFeed(null);
  }, [deletingFeed, selectedFeedId, selectFeed]);

  const isHomeSelected = !selectedFeedId;

  return (
    <>
      <div className="flex flex-col">
        {/* Navigation */}
        <button
          onClick={() => selectFeed(null)}
          className={`${navItemBase} ${isHomeSelected ? navItemActive : navItemInactive}`}
        >
          <span className={iconWrapper}>
            <Home size={iconSize} />
          </span>
          <span className="text-sm">Home</span>
        </button>
        <button
          onClick={() => navigate("/settings")}
          className={`${navItemBase} ${navItemInactive}`}
        >
          <span className={iconWrapper}>
            <Settings size={iconSize} />
          </span>
          <span className="text-sm">Settings</span>
        </button>
        {/* Divider */}
        <div className="border-t border-gray-200 dark:border-border-default my-1" />

        {/* Feed list */}
        {feeds.length > 0 && (
          <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
            <SortableContext
              items={feeds.map((f) => f.id)}
              strategy={verticalListSortingStrategy}
            >
              <div className="flex-1 overflow-y-auto min-h-0 pb-1 scrollbar-hide space-y-0.5">
                {feeds.map((feed) => (
                  <SortableFeedItem
                    key={feed.id}
                    feed={feed}
                    isSelected={selectedFeedId === feed.id}
                    onSelect={() => handleSelectFeed(feed.id)}
                    onDelete={() => setDeletingFeed(feed)}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}

        {/* Bottom action */}
        <div className="mt-1">
          <button
            onClick={handleCreateFeed}
            className={`${navItemBase} ${navItemInactive}`}
          >
            <span className={iconWrapper}>
              <Plus size={iconSize} />
            </span>
            <span className="text-sm">New Feed</span>
          </button>
        </div>
      </div>

      {deletingFeed && (
        <ConfirmModal
          title="Delete Feed"
          description={`Are you sure you want to delete "${deletingFeed.name}"? All posts in this feed will be permanently deleted.`}
          confirmLabel="Delete"
          onConfirm={handleConfirmDelete}
          onClose={() => setDeletingFeed(null)}
          destructive
        />
      )}
    </>
  );
}
