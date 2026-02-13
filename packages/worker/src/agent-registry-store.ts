import { PersistentStore } from "./persistent-store.js";

export class AgentRegistryStore extends PersistentStore {
  private map = new Map<string, string>();

  constructor(filePath?: string) {
    super("agent-registry.json", filePath);
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

  get(name: string): string | undefined {
    return this.map.get(name);
  }

  set(name: string, id: string): void {
    this.map.set(name, id);
    this.save();
  }

  delete(name: string): void {
    this.map.delete(name);
    this.save();
  }

  getAllIds(): Set<string> {
    return new Set(this.map.values());
  }
}
