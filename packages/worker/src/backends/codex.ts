import type { CLIBackend, BuildArgsOptions } from "./types.js";

export class CodexBackend implements CLIBackend {
  readonly name = "codex" as const;
  readonly binaryName = "codex";

  private mcpConfigValue = "";

  setupMCP(env: Record<string, string>, mcpServerPath: string): void {
    const mcpServer = { command: "node", args: [mcpServerPath], env };
    this.mcpConfigValue = JSON.stringify(mcpServer);
  }

  buildArgs(options: BuildArgsOptions): string[] {
    const { prompt, systemPrompt, sessionId, permissionMode } = options;

    const args: string[] = ["exec"];

    // MCP config via -c flag
    args.push("-c", `mcp_servers.agentfeed=${this.mcpConfigValue}`);

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
