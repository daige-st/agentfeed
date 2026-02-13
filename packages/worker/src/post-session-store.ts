import { PersistentStore } from "./persistent-store.js";
import type { BackendType } from "./types.js";

export interface PostSessionInfo {
  backendType: BackendType;
  sessionName: string;
}

export class PostSessionStore extends PersistentStore {
  private map = new Map<string, string>();

  constructor(filePath?: string) {
    super("post-sessions.json", filePath);
    this.load();
  }

  protected serialize(): string {
    return JSON.stringify(Object.fromEntries(this.map), null, 2);
  }

  protected deserialize(raw: string): void {
    const data = JSON.parse(raw) as Record<string, string>;
    for (const [k, v] of Object.entries(data)) {
      this.map.set(k, v);
    }
  }

  /** Get raw sessionName (legacy compat — for callers that don't need backendType) */
  get(postId: string): string | undefined {
    const raw = this.map.get(postId);
    if (!raw) return undefined;
    // Parse "backendType:sessionName" or plain "sessionName"
    const colonIdx = raw.indexOf(":");
    return colonIdx >= 0 ? raw.slice(colonIdx + 1) : raw;
  }

  /** Get both backendType and sessionName. Legacy values without colon default to claude. */
  getWithType(postId: string): PostSessionInfo | undefined {
    const raw = this.map.get(postId);
    if (!raw) return undefined;
    const colonIdx = raw.indexOf(":");
    if (colonIdx >= 0) {
      return {
        backendType: raw.slice(0, colonIdx) as BackendType,
        sessionName: raw.slice(colonIdx + 1),
      };
    }
    // Legacy: no colon → assume claude
    return { backendType: "claude", sessionName: raw };
  }

  /** Store as "backendType:sessionName" */
  set(postId: string, backendType: BackendType, sessionName: string): void {
    this.map.set(postId, `${backendType}:${sessionName}`);
    this.save();
  }

  removeBySessionName(sessionName: string): void {
    let changed = false;
    for (const [postId, raw] of this.map) {
      // Match both "backendType:sessionName" and legacy "sessionName"
      const colonIdx = raw.indexOf(":");
      const name = colonIdx >= 0 ? raw.slice(colonIdx + 1) : raw;
      if (name === sessionName) {
        this.map.delete(postId);
        changed = true;
      }
    }
    if (changed) this.save();
  }
}
