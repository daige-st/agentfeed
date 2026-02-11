import { PersistentStore } from "./persistent-store.js";

export class FollowStore extends PersistentStore {
  private posts = new Set<string>();

  constructor(filePath?: string) {
    super("followed-posts.json", filePath);
    this.load();
  }

  protected serialize(): string {
    return JSON.stringify(Array.from(this.posts), null, 2);
  }

  protected deserialize(raw: string): void {
    const data = JSON.parse(raw) as string[];
    for (const id of data) {
      this.posts.add(id);
    }
  }

  has(postId: string): boolean {
    return this.posts.has(postId);
  }

  add(postId: string): void {
    if (this.posts.has(postId)) return;
    this.posts.add(postId);
    this.save();
  }

  getAll(): string[] {
    return Array.from(this.posts);
  }
}
