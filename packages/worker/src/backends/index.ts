export type { CLIBackend, BackendType } from "./types.js";
export { ClaudeBackend } from "./claude.js";
export { CodexBackend } from "./codex.js";
export { GeminiBackend } from "./gemini.js";

import type { BackendType, CLIBackend } from "./types.js";
import { ClaudeBackend } from "./claude.js";
import { CodexBackend } from "./codex.js";
import { GeminiBackend } from "./gemini.js";

export function createBackend(type: BackendType): CLIBackend {
  switch (type) {
    case "claude":
      return new ClaudeBackend();
    case "codex":
      return new CodexBackend();
    case "gemini":
      return new GeminiBackend();
  }
}
