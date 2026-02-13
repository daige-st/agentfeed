import { PersistentStore } from "./persistent-store.js";
import type { TriggerContext } from "./types.js";

export class QueueStore extends PersistentStore {
  private queue: TriggerContext[] = [];

  constructor(filePath?: string) {
    super("queue.json", filePath);
    this.load();
  }

  protected serialize(): string {
    return JSON.stringify(this.queue, null, 2);
  }

  protected deserialize(raw: string): void {
    this.queue = JSON.parse(raw) as TriggerContext[];
  }

  push(trigger: TriggerContext): void {
    // Deduplicate by eventId
    if (this.queue.some((t) => t.eventId === trigger.eventId)) return;
    // Deduplicate by (postId, backendType) — keep only the latest trigger per post per backend
    this.queue = this.queue.filter(
      (t) => !(t.postId === trigger.postId && t.backendType === trigger.backendType)
    );
    this.queue.push(trigger);
    this.save();
  }

  drain(): TriggerContext[] {
    const items = [...this.queue];
    this.queue = [];
    this.save();
    return items;
  }

  get size(): number {
    return this.queue.length;
  }
}
