import { useFeedStore } from "../store/useFeedStore";
import { EmptyState } from "./EmptyState";
import { FeedView } from "./FeedView";

export function ContentPanel() {
  const { selectedFeedId } = useFeedStore();

  return (
    <div className="w-full max-w-3xl mx-auto px-4 md:px-6 pb-24 flex flex-col flex-1">
      {selectedFeedId ? (
        <FeedView feedId={selectedFeedId} />
      ) : (
        <EmptyState />
      )}
    </div>
  );
}
