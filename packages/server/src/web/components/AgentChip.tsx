import { Bot, X } from "lucide-react";
import { ClaudeIcon, OpenAIIcon, GeminiIcon } from "./Icons";
import type { FeedParticipant, ActiveAgent } from "../lib/api";

interface AgentChipProps {
  name: string;
  type?: string | null;
  isTyping: boolean;
  isOnline: boolean;
  onClick?: () => void;
  onDelete?: () => void;
  disabled?: boolean;
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
      return <Bot size={16} className={isActive ? "text-green-600 dark:text-green-400" : "text-gray-400 dark:text-text-tertiary"} />;
  }
}

export function AgentChip({ name, type, isTyping, isOnline, onClick, onDelete, disabled }: AgentChipProps) {
  return (
    <div
      className={`group flex items-center gap-2 px-3 py-2 rounded-xl border transition-all ${
        isTyping
          ? "border-green-300 dark:border-green-700 bg-green-50 dark:bg-green-950/30 text-gray-900 dark:text-text-primary"
          : isOnline
            ? "border-card-border bg-white dark:bg-surface-active text-gray-900 dark:text-text-primary"
            : "border-gray-200 dark:border-border-default bg-white dark:bg-surface-active text-gray-400 dark:text-text-tertiary opacity-50"
      }`}
    >
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        className={`flex items-center gap-2 ${
          isTyping ? "cursor-pointer" : "cursor-default"
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
      {onDelete && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className="hidden group-hover:flex items-center justify-center w-4 h-4 -mr-1 rounded-full text-gray-400 dark:text-text-tertiary hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors cursor-pointer"
        >
          <X size={12} />
        </button>
      )}
    </div>
  );
}

// --- Grouped agent list ---

interface AgentGroupListProps {
  participants: FeedParticipant[];
  feedId?: string;
  onlineAgents: Map<string, unknown>;
  agentsByFeed: Map<string, Map<string, ActiveAgent>>;
  onNavigate: (postId: string) => void;
  onDelete?: (agentId: string) => void;
}

function findActiveAgent(
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
  onDelete,
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
          const canNavigate = isTyping && !!activeAgent.post_id;

          return (
            <AgentChip
              key={agent.agent_id}
              name={agent.agent_name}
              type={agent.agent_type}
              isTyping={isTyping}
              isOnline={isOnline}
              disabled={!canNavigate}
              onClick={canNavigate ? () => onNavigate(activeAgent.post_id) : undefined}
              onDelete={onDelete ? () => onDelete(agent.agent_id) : undefined}
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
              const canNavigate = isTyping && !!activeAgent.post_id;
              const displayName = deriveDisplayName(agent, true);

              return (
                <button
                  key={agent.agent_id}
                  type="button"
                  onClick={canNavigate ? () => onNavigate(activeAgent.post_id) : undefined}
                  disabled={!canNavigate}
                  className={`group/item flex items-center gap-1.5 px-2 py-1 rounded-lg transition-all ${
                    isTyping
                      ? "bg-green-50 dark:bg-green-950/30 cursor-pointer hover:bg-green-100 dark:hover:bg-green-950/50"
                      : isOnline
                        ? ""
                        : "opacity-50"
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
                  {onDelete && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDelete(agent.agent_id);
                      }}
                      className="hidden group-hover/item:flex items-center justify-center w-3.5 h-3.5 rounded-full text-gray-400 dark:text-text-tertiary hover:text-red-500 dark:hover:text-red-400 transition-colors cursor-pointer"
                    >
                      <X size={10} />
                    </button>
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
