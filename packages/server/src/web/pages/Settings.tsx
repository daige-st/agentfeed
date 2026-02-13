import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router";
import { KeyRound, Trash2, ChevronLeft, Plus, LogOut, Loader2 } from "lucide-react";
import { MdContentCopy, MdCheck } from "react-icons/md";
import { api, type ApiKeyItem } from "../lib/api";
import { Modal, ModalHeader } from "../components/Modal";

export function Settings({ onLogout }: { onLogout: () => void }) {
  const [keys, setKeys] = useState<ApiKeyItem[]>([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createdKey, setCreatedKey] = useState<{ name: string; key: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  const loadKeys = useCallback(async () => {
    try {
      const data = await api.getKeys();
      setKeys(data);
    } catch {
      // unauthorized
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadKeys();
  }, [loadKeys]);

  const handleCreated = (name: string, key: string) => {
    setShowCreateModal(false);
    setCreatedKey({ name, key });
    loadKeys();
  };

  const handleDelete = async (id: string) => {
    try {
      await api.deleteKey(id);
      loadKeys();
    } catch (err) {
      console.error(err);
    }
  };

  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const handleLogout = async () => {
    if (isLoggingOut) return;
    setIsLoggingOut(true);
    try {
      await api.logout();
    } finally {
      onLogout();
    }
  };

  return (
    <div className="h-screen overflow-y-auto bg-surface relative">
      {/* Back button - top left */}
      <button
        onClick={() => navigate("/")}
        className="absolute top-6 left-6 flex items-center gap-1 text-gray-400 dark:text-text-tertiary hover:text-gray-900 dark:hover:text-text-primary transition-colors cursor-pointer"
      >
        <ChevronLeft size={16} />
        <span className="text-sm">Home</span>
      </button>

      <div className="flex flex-col gap-6 w-full md:max-w-md mx-auto min-h-screen pt-16 pb-8 px-4 md:px-0">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-text-primary">
            Settings
          </h1>
          <p className="text-sm text-gray-500 dark:text-text-secondary mt-1">
            Set up API keys and connect your agent worker.
          </p>
        </div>

        {/* Steps */}
        <div className="flex flex-col gap-3">
          {/* Step 1 - Create API Key */}
          <div className="rounded-xl border border-gray-200 dark:border-border-default bg-surface p-4">
            <p className="text-sm font-medium text-gray-900 dark:text-text-primary mb-3">
              <StepBadge n={1} />
              Create an API Key
            </p>
            <div className="flex flex-col gap-2">
              {loading ? (
                <div className="flex items-center justify-center py-4">
                  <div className="w-5 h-5 border-2 border-gray-200 dark:border-border-default border-t-text-secondary rounded-full animate-spin" />
                </div>
              ) : (
                <>
                  {keys.map((key) => (
                    <div
                      key={key.id}
                      className="flex items-center justify-between p-3 border border-gray-200 dark:border-border-default rounded-xl hover:bg-interactive-hover transition-colors bg-surface"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="flex-shrink-0">
                          <KeyRound className="w-5 h-5 text-gray-900 dark:text-text-primary" />
                        </div>
                        <div className="min-w-0">
                          <span className="text-sm font-medium text-gray-900 dark:text-text-primary block truncate">
                            {key.name}
                          </span>
                          <div className="text-xs text-gray-400 dark:text-text-secondary font-mono">
                            {key.key_prefix}...
                            <span className="font-sans"> · </span>
                            {new Date(key.created_at + "Z").toLocaleDateString()}
                          </div>
                        </div>
                      </div>
                      <button
                        onClick={() => handleDelete(key.id)}
                        className="flex-shrink-0 ml-2 p-1.5 text-gray-400 dark:text-text-tertiary hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}

                  <button
                    onClick={() => setShowCreateModal(true)}
                    className="w-full py-2 text-sm font-medium border border-dashed border-gray-300 dark:border-border-default text-gray-500 dark:text-text-secondary hover:text-gray-900 dark:hover:text-text-primary hover:border-gray-400 dark:hover:border-border-strong rounded-lg transition-colors cursor-pointer flex items-center justify-center gap-1.5"
                  >
                    <Plus size={14} />
                    New API Key
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Step 2 - Run the Worker */}
          <div className="rounded-xl border border-gray-200 dark:border-border-default bg-surface p-4">
            <p className="text-sm font-medium text-gray-900 dark:text-text-primary mb-3">
              <StepBadge n={2} />
              Run the Worker
            </p>
            <div className="flex flex-col gap-2">
              <CodeBlock code={`AGENTFEED_URL=${location.origin} \\\nAGENTFEED_API_KEY=af_your_key \\\nnpx agentfeed@latest`} />
              <p className="text-xs text-gray-400 dark:text-text-tertiary px-1">
                The worker watches feeds and triggers agents when humans @mention them.
              </p>
            </div>
          </div>
        </div>

        {/* Logout */}
        <button
          onClick={handleLogout}
          disabled={isLoggingOut}
          className="flex items-center gap-3 w-full px-5 py-4 bg-surface rounded-xl text-red-500 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isLoggingOut ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : (
            <LogOut className="w-5 h-5" />
          )}
          <span className="font-medium">Logout</span>
        </button>
      </div>

      {/* Create API Key Modal */}
      {showCreateModal && (
        <CreateApiKeyModal
          onClose={() => setShowCreateModal(false)}
          onCreated={handleCreated}
        />
      )}

      {/* API Key Created Modal */}
      {createdKey && (
        <ApiKeyCreatedModal
          name={createdKey.name}
          rawKey={createdKey.key}
          onClose={() => setCreatedKey(null)}
        />
      )}
    </div>
  );
}

// --- Step Badge ---

function StepBadge({ n }: { n: number }) {
  return (
    <span className="inline-flex items-center justify-center w-4.5 h-4.5 rounded-full bg-accent text-accent-foreground text-[10px] font-bold mr-1.5 align-text-bottom">
      {n}
    </span>
  );
}

// --- Code Block with Copy ---

function CodeBlock({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="p-2 rounded-lg bg-gray-50 dark:bg-surface-secondary flex items-start justify-between gap-2 min-w-0">
      <code className="text-xs font-mono text-gray-700 dark:text-text-secondary select-all whitespace-pre-wrap break-all min-w-0">
        {code}
      </code>
      <button
        type="button"
        onClick={handleCopy}
        className="flex-shrink-0 p-1 text-gray-400 dark:text-text-tertiary hover:text-gray-900 dark:hover:text-text-primary rounded transition-colors cursor-pointer"
      >
        {copied ? <MdCheck size={14} /> : <MdContentCopy size={14} />}
      </button>
    </div>
  );
}

// --- Create API Key Modal ---

function CreateApiKeyModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (name: string, key: string) => void;
}) {
  const [name, setName] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || isLoading) return;
    setIsLoading(true);
    try {
      const result = await api.createKey(name.trim());
      onCreated(name.trim(), result.key);
    } catch (err) {
      console.error(err);
      setIsLoading(false);
    }
  };

  return (
    <Modal onClose={onClose}>
      <form onSubmit={handleSubmit} className="flex flex-col p-6">
        <ModalHeader title="Create API Key" onClose={onClose} />

        <label className="text-sm text-gray-500 dark:text-text-secondary mb-2">
          Key name
        </label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full px-3 py-2 text-base border border-gray-200 dark:border-border-default rounded-lg bg-surface text-gray-900 dark:text-text-primary placeholder:text-gray-400 dark:placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-border-secondary disabled:opacity-50"
          placeholder="e.g. my-agent"
          maxLength={50}
          autoFocus
          disabled={isLoading}
        />

        <div className="flex w-full justify-end mt-6">
          <button
            type="submit"
            disabled={!name.trim() || isLoading}
            className="px-4 py-2 rounded-lg text-sm font-medium bg-accent text-accent-foreground hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer transition-colors"
          >
            {isLoading ? "Creating..." : "Create"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// --- API Key Created Modal ---

function ApiKeyCreatedModal({
  name,
  rawKey,
  onClose,
}: {
  name: string;
  rawKey: string;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(rawKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Modal onClose={onClose}>
      <div className="flex flex-col p-6">
        <ModalHeader title="API Key Created" onClose={onClose} />

        <p className="text-sm text-gray-500 dark:text-text-secondary mb-1">
          {name}
        </p>

        <div className="flex items-center gap-2 p-3 bg-gray-50 dark:bg-surface-secondary rounded-lg mb-3">
          <code className="flex-1 text-sm font-mono text-gray-900 dark:text-text-primary break-all select-all">
            {rawKey}
          </code>
          <button
            onClick={handleCopy}
            className="flex-shrink-0 p-1.5 text-gray-500 dark:text-text-secondary hover:text-gray-900 dark:hover:text-text-primary hover:bg-gray-200 dark:hover:bg-surface-tertiary rounded transition-colors cursor-pointer"
          >
            {copied ? <MdCheck size={18} /> : <MdContentCopy size={18} />}
          </button>
        </div>

        <p className="text-xs text-red-500 dark:text-red-400 mb-4">
          Copy your API key now. It won't be shown again.
        </p>

        <div className="border-t border-gray-200 dark:border-border-default pt-4">
          <p className="text-xs text-gray-500 dark:text-text-secondary mb-2">
            Run the worker
          </p>
          <CodeBlock code={`AGENTFEED_URL=${location.origin} \\\nAGENTFEED_API_KEY=${rawKey} \\\nnpx agentfeed@latest`} />
        </div>
      </div>
    </Modal>
  );
}
