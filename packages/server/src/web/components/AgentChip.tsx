import { Terminal } from "lucide-react";
import { ClaudeIcon, OpenAIIcon, GeminiIcon } from "./Icons";
import type { FeedParticipant, ActiveAgent } from "../lib/api";

interface AgentChipProps {
  name: string;
  type?: string | null;
  isTyping: boolean;
  isOnline: boolean;
  onClick?: () => void;
}

export function AgentIcon({ type, isActive }: { type?: string | null; isActive: boolean }) {
  const dimClass = isActive ? "" : "opacity-50";
  switch (type) {
    case "claude":
      return <ClaudeIcon className={`text-[#D97757] ${dimClass}`} />;
    case "codex":
      return <OpenAIIcon className={dimClass} />;
    case "gemini":
      return <GeminiIcon className={`text-[#4285F4] ${dimClass}`} />;
    default:
      return <Terminal size={16} className={isActive ? "text-green-600 dark:text-green-400" : "text-gray-400 dark:text-text-tertiary"} />;
  }
}

export function AgentChip({ name, type, isTyping, isOnline, onClick }: AgentChipProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`group flex items-center gap-2 px-3 py-2 rounded-xl border transition-all cursor-pointer hover:shadow-sm ${
        isTyping
          ? "border-green-300 dark:border-green-700 bg-green-50 dark:bg-green-950/30 text-gray-900 dark:text-text-primary"
          : isOnline
            ? "border-card-border bg-white dark:bg-surface-active text-gray-900 dark:text-text-primary hover:border-gray-300 dark:hover:border-border-strong"
            : "border-gray-200 dark:border-border-default bg-white dark:bg-surface-active text-gray-400 dark:text-text-tertiary opacity-50 hover:opacity-75"
      }`}
    >
      <div className="relative">
        <AgentIcon type={type} isActive={isTyping || isOnline} />
        {(isTyping || isOnline) && (
          <span className="absolute -top-0.5 -right-0.5 flex h-2 w-2">
            {isTyping && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />}
            <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
          </span>
        )}
      </div>
      <span className="text-sm font-medium">{name}</span>
      {isTyping && (
        <span className="text-[10px] font-medium text-green-600 dark:text-green-400 bg-green-100 dark:bg-green-900/50 px-1.5 py-0.5 rounded-full">
          Active
        </span>
      )}
    </button>
  );
}

// --- Grouped agent list ---

interface AgentGroupListProps {
  participants: FeedParticipant[];
  feedId?: string;
  onlineAgents: Map<string, unknown>;
  agentsByFeed: Map<string, Map<string, ActiveAgent>>;
  onNavigate: (postId: string) => void;
  onOpenDetail?: (agent: FeedParticipant) => void;
}

export function findActiveAgent(
  agentId: string,
  feedId: string | undefined,
  agentsByFeed: Map<string, Map<string, ActiveAgent>>
): ActiveAgent | undefined {
  if (feedId) {
    return agentsByFeed.get(feedId)?.get(agentId);
  }
  for (const feedAgents of agentsByFeed.values()) {
    const agent = feedAgents.get(agentId);
    if (agent) return agent;
  }
  return undefined;
}

interface AgentGroup {
  baseName: string;
  agents: FeedParticipant[];
}

function deriveBaseName(agent: FeedParticipant): string {
  // "worker/claude" → "worker", "worker/claude/alpha" → "worker"
  const name = agent.agent_name;
  const slashIdx = name.indexOf("/");
  return slashIdx >= 0 ? name.slice(0, slashIdx) : name;
}

function deriveDisplayName(agent: FeedParticipant, isGrouped: boolean): string {
  if (!isGrouped) return agent.agent_name;

  const name = agent.agent_name;
  const baseName = deriveBaseName(agent);

  // Strip baseName/ prefix: "worker/claude" → "claude", "worker/claude/alpha" → "claude/alpha"
  const prefix = `${baseName}/`;
  if (name.startsWith(prefix)) {
    return name.slice(prefix.length);
  }
  return name;
}

function groupParticipants(participants: FeedParticipant[]): AgentGroup[] {
  const groups = new Map<string, FeedParticipant[]>();

  for (const agent of participants) {
    const base = deriveBaseName(agent);
    if (!groups.has(base)) groups.set(base, []);
    groups.get(base)!.push(agent);
  }

  return Array.from(groups.entries()).map(([baseName, agents]) => ({
    baseName,
    agents,
  }));
}

export function AgentGroupList({
  participants,
  feedId,
  onlineAgents,
  agentsByFeed,
  onNavigate,
  onOpenDetail,
}: AgentGroupListProps) {
  const groups = groupParticipants(participants);

  return (
    <div className="flex items-start gap-2 -mt-2 mb-2 flex-wrap">
      {groups.map((group) => {
        const isGrouped = group.agents.length > 1;

        if (!isGrouped) {
          const agent = group.agents[0]!;
          const isOnline = onlineAgents.has(agent.agent_id);
          const activeAgent = findActiveAgent(agent.agent_id, feedId, agentsByFeed);
          const isTyping = !!activeAgent;

          return (
            <AgentChip
              key={agent.agent_id}
              name={agent.agent_name}
              type={agent.agent_type}
              isTyping={isTyping}
              isOnline={isOnline}
              onClick={onOpenDetail ? () => onOpenDetail(agent) : undefined}
            />
          );
        }

        return (
          <div
            key={group.baseName}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-gray-200 dark:border-border-default bg-white dark:bg-surface-active"
          >
            <span className="text-xs font-medium text-gray-400 dark:text-text-tertiary mr-0.5">
              {group.baseName}
            </span>
            {group.agents.map((agent) => {
              const isOnline = onlineAgents.has(agent.agent_id);
              const activeAgent = findActiveAgent(agent.agent_id, feedId, agentsByFeed);
              const isTyping = !!activeAgent;
              const displayName = deriveDisplayName(agent, true);

              return (
                <button
                  key={agent.agent_id}
                  type="button"
                  onClick={onOpenDetail ? () => onOpenDetail(agent) : undefined}
                  className={`group/item flex items-center gap-1.5 px-2 py-1 rounded-lg transition-all cursor-pointer hover:bg-gray-100 dark:hover:bg-interactive-hover ${
                    isTyping
                      ? "bg-green-50 dark:bg-green-950/30"
                      : isOnline
                        ? ""
                        : "opacity-50 hover:opacity-75"
                  }`}
                >
                  <div className="relative">
                    <AgentIcon type={agent.agent_type} isActive={isTyping || isOnline} />
                    {(isTyping || isOnline) && (
                      <span className="absolute -top-0.5 -right-0.5 flex h-2 w-2">
                        {isTyping && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />}
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
                      </span>
                    )}
                  </div>
                  <span className="text-xs font-medium text-gray-700 dark:text-text-secondary">
                    {displayName}
                  </span>
                  {isTyping && (
                    <span className="text-[9px] font-medium text-green-600 dark:text-green-400 bg-green-100 dark:bg-green-900/50 px-1 py-0.5 rounded-full">
                      Active
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
