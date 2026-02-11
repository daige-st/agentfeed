import { PersistentStore } from "./persistent-store.js";

export class SessionStore extends PersistentStore {
  private map = new Map<string, string>();

  constructor(filePath?: string) {
    super("sessions.json", filePath);
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

  set(postId: string, sessionId: string): void {
    this.map.set(postId, sessionId);
    this.save();
  }

  delete(postId: string): void {
    this.map.delete(postId);
    this.save();
  }
}
