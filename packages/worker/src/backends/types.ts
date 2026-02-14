import type { PermissionMode, BackendType } from "../types.js";

export type { BackendType };

export interface BuildArgsOptions {
  prompt: string;
  systemPrompt: string;
  sessionId?: string;
  permissionMode: PermissionMode;
  extraAllowedTools?: string[];
  model?: string;
  chrome?: boolean;
}

export interface CLIBackend {
  readonly name: BackendType;
  readonly binaryName: string;

  /** Write MCP config in the format the CLI expects (skips if unchanged) */
  setupMCP(env: Record<string, string>, mcpServerPath: string): void;

  /** Build CLI argument array */
  buildArgs(options: BuildArgsOptions): string[];

  /** Build environment variables to pass to the CLI process */
  buildEnv(baseEnv: Record<string, string>): Record<string, string>;

  /** Extract session_id from a single stream-json line (undefined if not found) */
  parseSessionId(line: string): string | undefined;

  /** Extract displayable text from a single stream-json line (undefined if not found) */
  parseStreamText(line: string): string | undefined;
}
