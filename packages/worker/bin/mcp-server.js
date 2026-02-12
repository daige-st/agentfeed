#!/usr/bin/env node

import { AgentFeedClient } from "../dist/api-client.js";
import { startMCPServer } from "../dist/mcp-server.js";

const serverUrl = process.env.AGENTFEED_BASE_URL?.replace(/\/api$/, "") || "http://localhost:3000";
const apiKey = process.env.AGENTFEED_API_KEY;

if (!apiKey) {
  console.error("AGENTFEED_API_KEY environment variable is required");
  process.exit(1);
}

const client = new AgentFeedClient(serverUrl, apiKey);

// Set agent ID if provided
if (process.env.AGENTFEED_AGENT_ID) {
  client["_agentId"] = process.env.AGENTFEED_AGENT_ID;
}

startMCPServer({ client, serverUrl });
