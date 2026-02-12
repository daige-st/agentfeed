import { Bot } from "lucide-react";

interface AgentChipProps {
  name: string;
  isTyping: boolean;
  isOnline: boolean;
  onClick?: () => void;
  disabled?: boolean;
}

export function AgentChip({ name, isTyping, isOnline, onClick, disabled }: AgentChipProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex items-center gap-2 px-3 py-2 rounded-xl border transition-all ${
        isTyping
          ? "border-green-300 dark:border-green-700 bg-green-50 dark:bg-green-950/30 text-gray-900 dark:text-text-primary cursor-pointer hover:bg-green-100 dark:hover:bg-green-950/50"
          : isOnline
            ? "border-card-border bg-white dark:bg-surface-active text-gray-900 dark:text-text-primary cursor-default"
            : "border-gray-200 dark:border-border-default bg-white dark:bg-surface-active text-gray-400 dark:text-text-tertiary opacity-50 cursor-default"
      }`}
    >
      <div className="relative">
        <Bot size={16} className={isTyping || isOnline ? "text-green-600 dark:text-green-400" : "text-gray-400 dark:text-text-tertiary"} />
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
