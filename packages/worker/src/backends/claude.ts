import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import type { CLIBackend, BuildArgsOptions } from "./types.js";

export class ClaudeBackend implements CLIBackend {
  readonly name = "claude" as const;
  readonly binaryName = "claude";

  private mcpConfigPath = "";
  private lastMCPKey = "";

  setupMCP(env: Record<string, string>, mcpServerPath: string): void {
    const cacheKey = JSON.stringify(env) + mcpServerPath;
    if (cacheKey === this.lastMCPKey) return;
    this.lastMCPKey = cacheKey;

    const config = {
      mcpServers: {
        agentfeed: { command: "node", args: [mcpServerPath], env },
      },
    };

    const configDir = path.join(os.homedir(), ".agentfeed");
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }

    this.mcpConfigPath = path.join(configDir, "mcp-config.json");
    fs.writeFileSync(this.mcpConfigPath, JSON.stringify(config, null, 2));
  }

  buildArgs(options: BuildArgsOptions): string[] {
    const { prompt, systemPrompt, sessionId, permissionMode, extraAllowedTools, model, chrome } = options;

    const args = [
      "-p", prompt,
      "--append-system-prompt", systemPrompt,
      "--mcp-config", this.mcpConfigPath,
    ];

    if (model) {
      args.push("--model", model);
    }

    if (chrome) {
      args.push("--chrome");
    }

    if (permissionMode === "yolo") {
      args.push("--dangerously-skip-permissions");
    } else {
      const allowedTools = ["mcp__agentfeed__*", ...(extraAllowedTools ?? [])];
      if (chrome) {
        allowedTools.push("mcp__claude-in-chrome__*");
      }
      for (const tool of allowedTools) {
        args.push("--allowedTools", tool);
      }
    }

    if (sessionId) {
      args.push("--resume", sessionId);
    } else {
      args.push("--output-format", "stream-json", "--verbose");
    }

    return args;
  }

  buildEnv(baseEnv: Record<string, string>): Record<string, string> {
    const env = { ...baseEnv };
    env.CLAUDE_AUTOCOMPACT_PCT_OVERRIDE = process.env.CLAUDE_AUTOCOMPACT_PCT_OVERRIDE ?? "50";

    const passthroughKeys = [
      "ANTHROPIC_API_KEY",
      "CLAUDE_CODE_USE_BEDROCK", "CLAUDE_CODE_USE_VERTEX",
      "AWS_REGION", "AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "AWS_SESSION_TOKEN",
      "GOOGLE_APPLICATION_CREDENTIALS", "CLOUD_ML_REGION",
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
      if (event.type === "result" && event.session_id) {
        return event.session_id;
      }
    } catch { /* not JSON */ }
    return undefined;
  }

  parseStreamText(line: string): string | undefined {
    try {
      const event = JSON.parse(line) as {
        type: string;
        message?: { content: Array<{ type: string; text: string }> };
      };
      if (event.type === "assistant" && event.message?.content) {
        const texts: string[] = [];
        for (const block of event.message.content) {
          if (block.type === "text") {
            texts.push(block.text);
          }
        }
        return texts.length > 0 ? texts.join("") : undefined;
      }
    } catch { /* not JSON */ }
    return undefined;
  }
}
