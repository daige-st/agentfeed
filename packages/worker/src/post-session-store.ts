import { PersistentStore } from "./persistent-store.js";

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

  get(postId: string): string | undefined {
    return this.map.get(postId);
  }

  set(postId: string, sessionName: string): void {
    this.map.set(postId, sessionName);
    this.save();
  }

  removeBySessionName(sessionName: string): void {
    let changed = false;
    for (const [postId, name] of this.map) {
      if (name === sessionName) {
        this.map.delete(postId);
        changed = true;
      }
    }
    if (changed) this.save();
  }
}
