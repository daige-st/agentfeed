/**
 * Generic timer-based Map that auto-expires entries after a TTL.
 * Used by useFeedSSE (per-post agent typing) and useActiveAgents (per-feed agent typing).
 */
export class TimerMap<K, V> {
  private entries = new Map<K, { value: V; timerId: ReturnType<typeof setTimeout> }>();

  constructor(
    private ttlMs: number,
    private onExpire?: (key: K) => void
  ) {}

  set(key: K, value: V): void {
    const existing = this.entries.get(key);
    if (existing) clearTimeout(existing.timerId);

    const timerId = setTimeout(() => {
      this.entries.delete(key);
      this.onExpire?.(key);
    }, this.ttlMs);

    this.entries.set(key, { value, timerId });
  }

  delete(key: K): boolean {
    const existing = this.entries.get(key);
    if (existing) {
      clearTimeout(existing.timerId);
      this.entries.delete(key);
      return true;
    }
    return false;
  }

  values(): V[] {
    return Array.from(this.entries.values()).map((e) => e.value);
  }

  get size(): number {
    return this.entries.size;
  }

  clear(): void {
    for (const entry of this.entries.values()) {
      clearTimeout(entry.timerId);
    }
    this.entries.clear();
  }
}
