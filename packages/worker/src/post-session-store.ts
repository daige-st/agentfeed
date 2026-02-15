import { PersistentStore } from "./persistent-store.js";
import type { BackendType } from "./types.js";

export interface PostSessionInfo {
  backendType: BackendType;
  sessionName: string;
}

export class PostSessionStore extends PersistentStore {
  private map = new Map<string, string[]>();

  constructor(filePath?: string) {
    super("post-sessions.json", filePath);
    this.load();
  }

  protected serialize(): string {
    return JSON.stringify(Object.fromEntries(this.map), null, 2);
  }

  protected deserialize(raw: string): void {
    const data = JSON.parse(raw) as Record<string, string | string[]>;
    for (const [k, v] of Object.entries(data)) {
      // Support both legacy single value and new array format
      this.map.set(k, Array.isArray(v) ? v : [v]);
    }
  }

  /** Get raw sessionName (legacy compat — for callers that don't need backendType) */
  get(postId: string): string | undefined {
    const raws = this.map.get(postId);
    if (!raws || raws.length === 0) return undefined;
    // Return first sessionName
    const first = raws[0];
    const colonIdx = first.indexOf(":");
    return colonIdx >= 0 ? first.slice(colonIdx + 1) : first;
  }

  /** Get both backendType and sessionName for first entry (legacy compat) */
  getWithType(postId: string): PostSessionInfo | undefined {
    const all = this.getAll(postId);
    return all.length > 0 ? all[0] : undefined;
  }

  /** Get all backend sessions for a post */
  getAll(postId: string): PostSessionInfo[] {
    const raws = this.map.get(postId);
    if (!raws) return [];
    return raws.map((raw) => {
      const colonIdx = raw.indexOf(":");
      if (colonIdx >= 0) {
        return {
          backendType: raw.slice(0, colonIdx) as BackendType,
          sessionName: raw.slice(colonIdx + 1),
        };
      }
      // Legacy: no colon → assume claude
      return { backendType: "claude", sessionName: raw };
    });
  }

  private static readonly MAX_SIZE = 1000;

  /** Add backend session (legacy compat: set = add) */
  set(postId: string, backendType: BackendType, sessionName: string): void {
    this.add(postId, backendType, sessionName);
  }

  /** Add backend session to post (prevents duplicates) */
  add(postId: string, backendType: BackendType, sessionName: string): void {
    const entry = `${backendType}:${sessionName}`;
    const existing = this.map.get(postId) ?? [];

    // Prevent duplicates
    if (!existing.includes(entry)) {
      existing.push(entry);
      this.map.set(postId, existing);
    }

    // Evict oldest entries if over limit
    if (this.map.size > PostSessionStore.MAX_SIZE) {
      const iter = this.map.keys();
      while (this.map.size > PostSessionStore.MAX_SIZE) {
        const oldest = iter.next().value;
        if (oldest !== undefined) this.map.delete(oldest);
        else break;
      }
    }
    this.save();
  }

  removeBySessionName(sessionName: string): void {
    let changed = false;
    for (const [postId, raws] of this.map) {
      const filtered = raws.filter((raw) => {
        const colonIdx = raw.indexOf(":");
        const name = colonIdx >= 0 ? raw.slice(colonIdx + 1) : raw;
        return name !== sessionName;
      });

      if (filtered.length !== raws.length) {
        if (filtered.length === 0) {
          this.map.delete(postId);
        } else {
          this.map.set(postId, filtered);
        }
        changed = true;
      }
    }
    if (changed) this.save();
  }
}
