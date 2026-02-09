import { useEffect } from "react";
import { useFeedStore } from "../store/useFeedStore";

export function useUrlSync() {
  const { selectedFeedId, isHydrated, setSelectedFeedId } = useFeedStore();

  // URL → Store (on mount)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const feed = params.get("feed");

    if (feed) {
      setSelectedFeedId(feed);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Store → URL
  useEffect(() => {
    if (!isHydrated) return;

    const params = new URLSearchParams();
    if (selectedFeedId) {
      params.set("feed", selectedFeedId);
    }

    const search = params.toString();
    const newUrl = search ? `/?${search}` : "/";

    if (window.location.pathname === "/" || window.location.pathname === "") {
      history.replaceState(null, "", newUrl);
    }
  }, [selectedFeedId, isHydrated]);
}
