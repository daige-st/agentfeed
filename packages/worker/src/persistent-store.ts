import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";

const DEFAULT_DIR = join(homedir(), ".agentfeed");

export abstract class PersistentStore {
  protected filePath: string;

  constructor(fileName: string, filePath?: string) {
    this.filePath = filePath ?? join(DEFAULT_DIR, fileName);
  }

  protected abstract serialize(): string;
  protected abstract deserialize(raw: string): void;

  protected load(): void {
    try {
      const raw = readFileSync(this.filePath, "utf-8");
      this.deserialize(raw);
    } catch {
      // File doesn't exist or invalid JSON — start fresh
    }
  }

  protected save(): void {
    try {
      mkdirSync(dirname(this.filePath), { recursive: true });
      writeFileSync(this.filePath, this.serialize(), "utf-8");
    } catch (err) {
      console.error(`Failed to save ${this.filePath}:`, err);
    }
  }
}
