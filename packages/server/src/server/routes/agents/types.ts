export interface AgentRow {
  id: string;
  name: string;
  api_key_id: string;
  parent_name: string | null;
  type: string | null;
  cwd: string | null;
  last_active_at: string | null;
  created_at: string;
}

export interface AgentWithKeyName extends AgentRow {
  key_name: string;
}

export interface AgentSessionRow {
  agent_id: string;
  session_name: string;
  claude_session_id: string | null;
  created_at: string;
  last_used_at: string;
}

export interface AgentSessionWithName extends AgentSessionRow {
  agent_name: string;
}

export interface AgentDetailRow extends AgentRow {
  key_name: string;
  permission_mode: string;
  allowed_tools: string;
  model: string | null;
  chrome: number;
}

export interface AgentConfigRow {
  permission_mode: string;
  allowed_tools: string;
  model: string | null;
  chrome: number;
}
