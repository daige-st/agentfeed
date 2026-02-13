import * as path from "node:path";
import * as readline from "node:readline";
import { execFileSync, spawn } from "node:child_process";
import { existsSync, copyFileSync } from "node:fs";
import { homedir } from "node:os";
import { createBackend } from "./backends/index.js";
import type { PermissionMode, BackendType } from "./types.js";

const ALL_BACKEND_TYPES: BackendType[] = ["claude", "codex", "gemini"];
const PROBE_TIMEOUT_MS = 10_000;

export function getRequiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`Required environment variable: ${name}`);
    process.exit(1);
  }
  return value;
}

export function parsePermissionMode(): PermissionMode {
  const idx = process.argv.indexOf("--permission");
  if (idx === -1) return "safe";

  const value = process.argv[idx + 1];
  if (value === "yolo") return "yolo";
  if (value === "safe") return "safe";

  console.error(`Unknown permission mode: "${value}". Use "safe" (default) or "yolo".`);
  process.exit(1);
}

export function parseAllowedTools(): string[] {
  const tools: string[] = [];
  for (let i = 0; i < process.argv.length; i++) {
    if (process.argv[i] === "--allowed-tools") {
      // Collect all following args until the next flag (starts with --)
      for (let j = i + 1; j < process.argv.length; j++) {
        if (process.argv[j]!.startsWith("--")) break;
        tools.push(process.argv[j]!);
      }
      break;
    }
  }
  return tools;
}

export function detectInstalledBackends(): BackendType[] {
  return ALL_BACKEND_TYPES.filter((type) => {
    const backend = createBackend(type);
    try {
      execFileSync("which", [backend.binaryName], { stdio: "ignore" });
      return true;
    } catch {
      return false;
    }
  });
}

export function probeBackend(type: BackendType): Promise<boolean> {
  const backend = createBackend(type);

  // Minimal args to trigger auth check without heavy work
  let args: string[];
  switch (type) {
    case "claude":
      args = ["-p", "say ok", "--output-format", "stream-json", "--max-turns", "1"];
      break;
    case "gemini":
      args = ["say ok", "--output-format", "stream-json"];
      break;
    case "codex":
      args = ["exec", "--json", "--skip-git-repo-check", "--full-auto", "say ok"];
      break;
  }

  const env = backend.buildEnv({
    PATH: process.env.PATH ?? "",
    HOME: process.env.HOME ?? "",
    USER: process.env.USER ?? "",
    SHELL: process.env.SHELL ?? "/bin/sh",
    LANG: process.env.LANG ?? "en_US.UTF-8",
    TERM: process.env.TERM ?? "xterm-256color",
  });

  return new Promise((resolve) => {
    try {
      const proc = spawn(backend.binaryName, args, { env, stdio: "pipe" });

      const timer = setTimeout(() => {
        // Still alive after timeout = authenticated (API call in progress)
        proc.kill("SIGTERM");
        resolve(true);
      }, PROBE_TIMEOUT_MS);

      proc.on("error", () => {
        clearTimeout(timer);
        resolve(false);
      });

      proc.on("close", (code) => {
        clearTimeout(timer);
        // Quick exit with 0 = completed ok, non-zero = auth/config failure
        resolve(code === 0);
      });
    } catch {
      resolve(false);
    }
  });
}

export function confirmYolo(): Promise<boolean> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    console.log("");
    console.log("  \x1b[33m⚠️  YOLO mode enabled. The agent can do literally anything.\x1b[0m");
    console.log("  \x1b[33m   No prompt sandboxing. No trust boundaries.\x1b[0m");
    console.log("  \x1b[33m   Prompt injection? Not your problem today.\x1b[0m");
    console.log("");
    rl.question("  Continue? (y/N): ", (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase() === "y");
    });
  });
}

export function migrateSessionFile(backendType: BackendType): void {
  const dir = path.join(homedir(), ".agentfeed");
  const legacyPath = path.join(dir, "sessions.json");
  const newPath = path.join(dir, `sessions-${backendType}.json`);
  if (!existsSync(newPath) && existsSync(legacyPath)) {
    try {
      copyFileSync(legacyPath, newPath);
      console.log(`Migrated sessions.json → sessions-${backendType}.json`);
    } catch (err) {
      console.warn(`Failed to migrate session file:`, err);
    }
  }
}
