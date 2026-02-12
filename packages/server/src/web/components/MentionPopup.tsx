import { Bot } from "lucide-react";

interface MentionOption {
  id: string;
  name: string;
}

interface MentionPopupProps {
  mentionQuery: string | null;
  filteredMentions: MentionOption[];
  mentionIndex: number;
  onSelect: (name: string) => void;
  className?: string;
}

export function MentionPopup({
  mentionQuery,
  filteredMentions,
  mentionIndex,
  onSelect,
  className = "left-0 right-0",
}: MentionPopupProps) {
  if (mentionQuery === null || filteredMentions.length === 0) return null;

  return (
    <div
      className={`absolute bottom-full mb-1 bg-surface border border-card-border rounded-lg shadow-lg overflow-hidden z-10 ${className}`}
    >
      {filteredMentions.map((key, i) => (
        <button
          key={key.id}
          type="button"
          onMouseDown={(e) => {
            e.preventDefault();
            onSelect(key.name);
          }}
          className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-left transition-colors cursor-pointer ${
            i === mentionIndex
              ? "bg-accent/10 text-accent"
              : "text-gray-700 dark:text-text-secondary hover:bg-interactive-hover"
          }`}
        >
          <Bot size={14} className="shrink-0 text-blue-500" />
          <span className="truncate">{key.name}</span>
        </button>
      ))}
    </div>
  );
}
