import type { CLIBackend, BuildArgsOptions } from "./types.js";

export class CodexBackend implements CLIBackend {
  readonly name = "codex" as const;
  readonly binaryName = "codex";

  private mcpCommand = "";
  private mcpArgs: string[] = [];
  private mcpEnv: Record<string, string> = {};

  setupMCP(env: Record<string, string>, mcpServerPath: string): void {
    this.mcpCommand = "node";
    this.mcpArgs = [mcpServerPath];
    this.mcpEnv = env;
  }

  buildArgs(options: BuildArgsOptions): string[] {
    const { prompt, systemPrompt, sessionId, permissionMode } = options;

    const args: string[] = ["exec"];

    // MCP config via dot-notation -c flags (codex-cli 0.46+ requires struct, not JSON string)
    const prefix = "mcp_servers.agentfeed";
    args.push("-c", `${prefix}.command=${this.mcpCommand}`);
    args.push("-c", `${prefix}.args=${JSON.stringify(this.mcpArgs)}`);
    for (const [key, value] of Object.entries(this.mcpEnv)) {
      args.push("-c", `${prefix}.env.${key}=${value}`);
    }

    // System prompt via -c instructions (separate from user prompt)
    args.push("-c", `instructions=${JSON.stringify(systemPrompt)}`);

    // Permission mode
    if (permissionMode === "yolo") {
      args.push("--dangerously-bypass-approvals-and-sandbox");
    } else {
      args.push("--full-auto");
    }

    args.push("--json", "--skip-git-repo-check");

    // Resume must come after all flags
    if (sessionId) {
      args.push("resume", sessionId);
    }

    args.push(prompt);

    return args;
  }

  buildEnv(baseEnv: Record<string, string>): Record<string, string> {
    const env = { ...baseEnv };

    const passthroughKeys = ["CODEX_API_KEY", "OPENAI_API_KEY", "OPENAI_BASE_URL"];
    for (const key of passthroughKeys) {
      if (process.env[key]) {
        env[key] = process.env[key]!;
      }
    }

    return env;
  }

  parseSessionId(line: string): string | undefined {
    try {
      const event = JSON.parse(line) as { type: string; thread_id?: string };
      if (event.type === "thread.started" && event.thread_id) {
        return event.thread_id;
      }
    } catch { /* not JSON */ }
    return undefined;
  }

  parseStreamText(line: string): string | undefined {
    try {
      const event = JSON.parse(line) as {
        type: string;
        item?: { type: string; text?: string };
      };
      if (event.type === "item.completed" && event.item?.type === "agent_message" && event.item.text) {
        return event.item.text;
      }
    } catch { /* not JSON */ }
    return undefined;
  }
}
