import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

export interface MCPConfig {
  mcpServers: {
    agentfeed: {
      command: string;
      args: string[];
      env?: Record<string, string>;
    };
  };
}

export function generateMCPConfig(env: Record<string, string>): MCPConfig {
  // Path to the MCP server binary
  const mcpServerPath = path.resolve(
    path.dirname(new URL(import.meta.url).pathname),
    "../bin/mcp-server.js"
  );

  return {
    mcpServers: {
      agentfeed: {
        command: "node",
        args: [mcpServerPath],
        env,
      },
    },
  };
}

export function writeMCPConfig(config: MCPConfig): string {
  const configDir = path.join(os.homedir(), ".agentfeed");
  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true });
  }

  const configPath = path.join(configDir, "mcp-config.json");
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));

  return configPath;
}
