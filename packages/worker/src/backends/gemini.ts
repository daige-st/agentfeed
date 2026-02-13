import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import type { CLIBackend, BuildArgsOptions } from "./types.js";

export class GeminiBackend implements CLIBackend {
  readonly name = "gemini" as const;
  readonly binaryName = "gemini";

  private lastMCPKey = "";

  setupMCP(env: Record<string, string>, mcpServerPath: string): void {
    const cacheKey = JSON.stringify(env) + mcpServerPath;
    if (cacheKey === this.lastMCPKey) return;
    this.lastMCPKey = cacheKey;

    // Merge agentfeed MCP server into ~/.gemini/settings.json
    const settingsDir = path.join(os.homedir(), ".gemini");
    const settingsPath = path.join(settingsDir, "settings.json");

    let settings: Record<string, unknown> = {};
    if (fs.existsSync(settingsPath)) {
      try {
        settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8")) as Record<string, unknown>;
      } catch {
        // Corrupt file — preserve non-MCP content by starting fresh
      }
    }

    const existingMcp = (settings.mcpServers ?? {}) as Record<string, unknown>;
    settings.mcpServers = {
      ...existingMcp,
      agentfeed: { command: "node", args: [mcpServerPath], env },
    };

    if (!fs.existsSync(settingsDir)) {
      fs.mkdirSync(settingsDir, { recursive: true });
    }
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
  }

  buildArgs(options: BuildArgsOptions): string[] {
    const { prompt, systemPrompt, sessionId, permissionMode, extraAllowedTools } = options;

    // Gemini has no --append-system-prompt flag, embed in user prompt
    const fullPrompt = `[System Instructions]\n${systemPrompt}\n\n[Task]\n${prompt}`;

    const args: string[] = [fullPrompt];

    if (sessionId) {
      args.push("--resume", sessionId);
    }

    if (permissionMode === "yolo") {
      args.push("--yolo");
    } else {
      // Allow agentfeed MCP tools without confirmation in safe mode
      // Exclude set_status — worker manages thinking/idle externally.
      // Gemini tends to loop on set_status calls, wasting API quota.
      const allowedTools = [
        "agentfeed_get_feeds",
        "agentfeed_get_posts",
        "agentfeed_get_post",
        "agentfeed_create_post",
        "agentfeed_get_comments",
        "agentfeed_post_comment",
        "agentfeed_download_file",
        ...(extraAllowedTools ?? []),
      ];
      for (const tool of allowedTools) {
        args.push("--allowed-tools", tool);
      }
    }

    args.push("--output-format", "stream-json");

    return args;
  }

  buildEnv(baseEnv: Record<string, string>): Record<string, string> {
    const env = { ...baseEnv };

    const passthroughKeys = [
      "GEMINI_API_KEY", "GOOGLE_API_KEY",
      "GOOGLE_CLOUD_PROJECT", "GOOGLE_CLOUD_PROJECT_ID",
      "GOOGLE_CLOUD_LOCATION", "GOOGLE_APPLICATION_CREDENTIALS",
      "GOOGLE_GENAI_USE_VERTEXAI",
    ];
    for (const key of passthroughKeys) {
      if (process.env[key]) {
        env[key] = process.env[key]!;
      }
    }

    return env;
  }

  parseSessionId(line: string): string | undefined {
    try {
      const event = JSON.parse(line) as { type: string; session_id?: string };
      if (event.type === "init" && event.session_id) {
        return event.session_id;
      }
    } catch { /* not JSON */ }
    return undefined;
  }

  parseStreamText(line: string): string | undefined {
    try {
      const event = JSON.parse(line) as {
        type: string;
        role?: string;
        content?: string;
      };
      if (event.type === "message" && event.role === "assistant" && event.content) {
        return event.content;
      }
    } catch { /* not JSON */ }
    return undefined;
  }
}
