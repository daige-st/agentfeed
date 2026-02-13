import { useState, useEffect, useRef } from "react";
import { Loader2, Trash2, RotateCcw, X, Plus, Shield, ShieldOff } from "lucide-react";
import { Modal, ModalHeader, ConfirmModal } from "./Modal";
import { AgentIcon } from "./AgentChip";
import { api } from "../lib/api";
import { formatTimeAgo } from "../lib/utils";
import type { AgentDetail, AgentPermissions } from "../lib/api";

interface AgentDetailModalProps {
  agentId: string;
  agentName: string;
  agentType: string | null;
  isOnline: boolean;
  isTyping: boolean;
  onClose: () => void;
  onDeleted: (agentId: string) => void;
}

type PermissionMode = "safe" | "yolo";

const TOOLS_BY_BACKEND: Record<string, readonly string[]> = {
  claude: ["Bash", "Read", "Write", "Edit", "Glob", "Grep", "WebFetch", "WebSearch", "Task"],
  gemini: ["run_shell_command", "read_file", "write_file", "edit", "read_many_files", "google_web_search", "web_fetch", "save_memory"],
};

export function AgentDetailModal({
  agentId,
  agentName,
  agentType,
  isOnline,
  isTyping,
  onClose,
  onDeleted,
}: AgentDetailModalProps) {
  const [agent, setAgent] = useState<AgentDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [confirmingClear, setConfirmingClear] = useState(false);

  // Settings form state
  const [permissionMode, setPermissionMode] = useState<PermissionMode>("safe");
  const [tools, setTools] = useState<string[]>([]);
  const [toolInput, setToolInput] = useState("");
  const [showCustomInput, setShowCustomInput] = useState(false);
  const toolInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    api
      .getAgent(agentId)
      .then((agentData) => {
        setAgent(agentData);

        // Initialize form
        setPermissionMode(agentData.permission_mode as PermissionMode);
        const toolsList = agentData.allowed_tools;
        setTools(Array.isArray(toolsList) ? toolsList : []);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [agentId]);

  const handleSave = async () => {
    if (saving) return;
    setSaving(true);

    try {
      const permissions: AgentPermissions = {
        permission_mode: permissionMode,
        allowed_tools: JSON.stringify(tools),
      };

      await api.updateAgentPermissions(agentId, permissions);

      if (agent) {
        setAgent({ ...agent, permission_mode: permissionMode, allowed_tools: tools });
      }
    } catch (err) {
      console.error("Failed to save settings:", err);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    try {
      await api.deleteAgent(agentId);
      onDeleted(agentId);
    } catch (err) {
      console.error("Failed to delete agent:", err);
    }
    setConfirmingDelete(false);
  };

  const handleClearContext = async () => {
    try {
      await api.clearAgentSessions(agentId);
    } catch (err) {
      console.error("Failed to clear context:", err);
    }
    setConfirmingClear(false);
  };

  const addTool = (name: string) => {
    const trimmed = name.trim();
    if (trimmed && !tools.includes(trimmed)) {
      setTools((prev) => [...prev, trimmed]);
    }
    setToolInput("");
  };

  const removeTool = (name: string) => {
    setTools((prev) => prev.filter((t) => t !== name));
  };

  const handleToolKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addTool(toolInput);
    }
    if (e.key === "Backspace" && !toolInput && tools.length > 0) {
      removeTool(tools[tools.length - 1]!);
    }
  };

  const isActive = isTyping || isOnline;
  const defaultTools = TOOLS_BY_BACKEND[agentType ?? ""] ?? [];
  const hasToolSupport = defaultTools.length > 0;
  const allSelected = hasToolSupport && defaultTools.every((t) => tools.includes(t));
  const customTools = tools.filter((t) => !defaultTools.includes(t));
  // Base agents have parent_name (e.g. "worker/claude"), named session agents don't match
  const isBaseAgent = agent?.parent_name != null && agentName === `${agent.parent_name}/${agentType}`;

  return (
    <>
      <Modal onClose={onClose} className="md:w-[480px]">
        <div className="p-6">
          <ModalHeader title="Agent Detail" onClose={onClose} />

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-text-tertiary" />
            </div>
          ) : (
            <div className="flex flex-col gap-6">
              {/* Agent Info Section */}
              <div className="flex flex-col gap-3">
                <div className="flex items-center gap-3">
                  <div className="relative">
                    <div className="w-10 h-10 rounded-full bg-gray-100 dark:bg-surface-secondary flex items-center justify-center">
                      <AgentIcon type={agentType} isActive={isActive} />
                    </div>
                    {isActive && (
                      <span className="absolute -bottom-0.5 -right-0.5 flex h-3 w-3">
                        {isTyping && (
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                        )}
                        <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500 border-2 border-white dark:border-surface" />
                      </span>
                    )}
                  </div>
                  <div>
                    <p className="text-base font-semibold text-gray-900 dark:text-text-primary">
                      {agentName}
                    </p>
                    <p className="text-xs text-gray-400 dark:text-text-tertiary">
                      {agentType
                        ? agentType.charAt(0).toUpperCase() + agentType.slice(1)
                        : "Bot"}
                      {" · "}
                      {isTyping
                        ? "Active"
                        : isOnline
                          ? "Online"
                          : "Offline"}
                    </p>
                  </div>
                </div>

                {agent && (
                  <div className="flex flex-col gap-2 text-xs text-gray-500 dark:text-text-secondary bg-gray-50 dark:bg-surface-secondary rounded-lg p-3">
                    <div className="flex items-center gap-3">
                      <span className="text-gray-400 dark:text-text-tertiary">Key</span>
                      <span className="font-medium text-gray-700 dark:text-text-primary truncate">{agent.key_name}</span>
                      <span className="text-gray-300 dark:text-border-default">·</span>
                      <span className="text-gray-400 dark:text-text-tertiary">Created</span>
                      <span className="font-medium text-gray-700 dark:text-text-primary">{new Date(agent.created_at + "Z").toLocaleDateString()}</span>
                      <span className="text-gray-300 dark:text-border-default">·</span>
                      <span className="text-gray-400 dark:text-text-tertiary">Last worked</span>
                      <span className="font-medium text-gray-700 dark:text-text-primary">{agent.last_active_at ? formatTimeAgo(agent.last_active_at) : "Never"}</span>
                    </div>
                    {agent.cwd && (
                      <div className="flex items-center gap-2">
                        <span className="text-gray-400 dark:text-text-tertiary shrink-0">Directory</span>
                        <span className="font-medium text-gray-700 dark:text-text-primary font-mono text-[11px] truncate" title={agent.cwd}>{agent.cwd}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* CLI Settings Section */}
              <div className="flex flex-col gap-4">
                <h4 className="text-sm font-semibold text-gray-900 dark:text-text-primary">
                  Settings
                </h4>

                {/* Permission Mode */}
                <div className="flex flex-col gap-2">
                  <label className="text-xs font-medium text-gray-500 dark:text-text-secondary">
                    Permission Mode
                  </label>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setPermissionMode("safe")}
                      className={`flex-1 flex flex-col items-center gap-1 px-3 py-2 rounded-lg border text-sm font-medium transition-colors cursor-pointer ${
                        permissionMode === "safe"
                          ? "border-green-300 bg-green-50 text-green-700 dark:border-green-700 dark:bg-green-950/30 dark:text-green-400"
                          : "border-gray-200 bg-surface text-gray-500 hover:border-gray-300 dark:border-border-default dark:text-text-tertiary dark:hover:border-border-strong"
                      }`}
                    >
                      <span className="flex items-center gap-1.5">
                        <Shield size={14} />
                        Safe
                      </span>
                      <span className={`text-[11px] font-normal ${
                        permissionMode === "safe"
                          ? "text-green-600/70 dark:text-green-400/70"
                          : "text-gray-400 dark:text-text-tertiary"
                      }`}>
                        MCP tools only
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setPermissionMode("yolo")}
                      className={`flex-1 flex flex-col items-center gap-1 px-3 py-2 rounded-lg border text-sm font-medium transition-colors cursor-pointer ${
                        permissionMode === "yolo"
                          ? "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-400"
                          : "border-gray-200 bg-surface text-gray-500 hover:border-gray-300 dark:border-border-default dark:text-text-tertiary dark:hover:border-border-strong"
                      }`}
                    >
                      <span className="flex items-center gap-1.5">
                        <ShieldOff size={14} />
                        Yolo
                      </span>
                      <span className={`text-[11px] font-normal ${
                        permissionMode === "yolo"
                          ? "text-amber-600/70 dark:text-amber-400/70"
                          : "text-gray-400 dark:text-text-tertiary"
                      }`}>
                        All tools, no sandbox
                      </span>
                    </button>
                  </div>
                </div>

                {/* Allowed Tools */}
                {!hasToolSupport ? (
                  <div className="flex flex-col gap-2">
                    <label className="text-xs font-medium text-gray-500 dark:text-text-secondary">
                      Allowed Tools
                    </label>
                    <p className="text-xs text-gray-400 dark:text-text-tertiary">
                      Per-tool allowlisting is not supported for this backend.
                    </p>
                  </div>
                ) : (
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-medium text-gray-500 dark:text-text-secondary">
                        Allowed Tools
                      </label>
                      <button
                        type="button"
                        onClick={() => {
                          if (allSelected) {
                            setTools((prev) => prev.filter((t) => !defaultTools.includes(t)));
                          } else {
                            setTools((prev) => [...new Set([...prev, ...defaultTools])]);
                          }
                        }}
                        className="text-[11px] text-gray-400 hover:text-accent dark:text-text-tertiary dark:hover:text-accent transition-colors cursor-pointer"
                      >
                        {allSelected ? "Clear all" : "Allow all"}
                      </button>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {defaultTools.map((tool) => {
                        const selected = tools.includes(tool);
                        return (
                          <button
                            key={tool}
                            type="button"
                            onClick={() =>
                              selected ? removeTool(tool) : addTool(tool)
                            }
                            className={`px-2.5 py-1 text-xs font-medium rounded-full border transition-colors cursor-pointer ${
                              selected
                                ? "bg-accent/10 text-accent border-accent/30 dark:bg-accent/20 dark:border-accent/40"
                                : "bg-transparent text-gray-300 border-gray-200 hover:text-gray-400 hover:border-gray-300 dark:text-text-tertiary/40 dark:border-border-default/50 dark:hover:text-text-tertiary dark:hover:border-border-default"
                            }`}
                          >
                            {tool}
                          </button>
                        );
                      })}
                      {/* Custom tools */}
                      {customTools.map((tool) => (
                        <span
                          key={tool}
                          className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-full bg-accent/10 text-accent border border-accent/30 dark:bg-accent/20 dark:border-accent/40"
                        >
                          {tool}
                          <button
                            type="button"
                            onClick={() => removeTool(tool)}
                            className="text-accent/60 hover:text-accent cursor-pointer"
                          >
                            <X size={10} />
                          </button>
                        </span>
                      ))}
                      {/* Add custom tool button / input */}
                      {showCustomInput ? (
                        <input
                          ref={toolInputRef}
                          type="text"
                          value={toolInput}
                          onChange={(e) => setToolInput(e.target.value)}
                          onKeyDown={(e) => {
                            handleToolKeyDown(e);
                            if (e.key === "Escape") {
                              setToolInput("");
                              setShowCustomInput(false);
                            }
                          }}
                          onBlur={() => {
                            if (toolInput.trim()) addTool(toolInput);
                            setShowCustomInput(false);
                          }}
                          placeholder="Tool name"
                          autoFocus
                          className="w-24 px-2.5 py-1 text-xs rounded-full border border-accent/30 bg-transparent text-gray-900 dark:text-text-primary placeholder:text-gray-400 dark:placeholder:text-text-tertiary outline-none"
                        />
                      ) : (
                        <button
                          type="button"
                          onClick={() => setShowCustomInput(true)}
                          className="flex items-center gap-0.5 px-2 py-1 text-xs text-gray-300 hover:text-gray-400 rounded-full border border-dashed border-gray-200 hover:border-gray-300 dark:text-text-tertiary/40 dark:border-border-default/50 dark:hover:text-text-tertiary dark:hover:border-border-default transition-colors cursor-pointer"
                        >
                          <Plus size={12} />
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {/* Save Button */}
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="w-full py-2 text-sm font-medium rounded-lg bg-accent text-accent-foreground hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer transition-colors"
                >
                  {saving ? "Saving..." : "Save Changes"}
                </button>
              </div>

              {/* Danger Zone */}
              <div className="border-t border-gray-200 dark:border-border-default pt-4 flex gap-2">
                <button
                  onClick={() => setConfirmingClear(true)}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-900/50 rounded-lg hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-colors cursor-pointer"
                >
                  <RotateCcw size={14} />
                  Clear Context
                </button>
                {!isBaseAgent && (
                  <button
                    onClick={() => setConfirmingDelete(true)}
                    className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-red-600 dark:text-red-400 border border-red-200 dark:border-red-900/50 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors cursor-pointer"
                  >
                    <Trash2 size={14} />
                    Remove
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </Modal>

      {confirmingClear && (
        <ConfirmModal
          title="Clear Context"
          description={`Clear all session context for "${agentName}"? The agent will start fresh conversations on next trigger.`}
          confirmLabel="Clear"
          destructive
          onConfirm={handleClearContext}
          onClose={() => setConfirmingClear(false)}
        />
      )}
      {confirmingDelete && (
        <ConfirmModal
          title="Remove Agent"
          description={`Are you sure you want to remove "${agentName}"? This will delete the agent and all its session data.`}
          confirmLabel="Remove"
          destructive
          onConfirm={handleDelete}
          onClose={() => setConfirmingDelete(false)}
        />
      )}
    </>
  );
}
