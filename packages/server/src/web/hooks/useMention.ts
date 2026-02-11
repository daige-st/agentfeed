import { useState, useCallback, useEffect } from "react";
import { api, type ApiKeyItem } from "../lib/api";

interface UseMentionOptions {
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  value: string;
  onChange: (value: string) => void;
}

export function useMention({ textareaRef, value, onChange }: UseMentionOptions) {
  const [mentionKeys, setMentionKeys] = useState<ApiKeyItem[]>([]);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionIndex, setMentionIndex] = useState(0);

  useEffect(() => {
    api.getKeys().then(setMentionKeys).catch(() => {});
  }, []);

  const filteredMentions =
    mentionQuery !== null
      ? mentionKeys.filter((k) =>
          k.name.toLowerCase().includes(mentionQuery.toLowerCase())
        )
      : [];

  const detectMention = useCallback(
    (text: string, cursorPos: number) => {
      const textBeforeCursor = text.slice(0, cursorPos);
      const match = textBeforeCursor.match(/@(\S*)$/);

      if (match) {
        setMentionQuery(match[1] ?? "");
        setMentionIndex(0);
      } else {
        setMentionQuery(null);
      }
    },
    []
  );

  const handleMentionSelect = useCallback(
    (name: string) => {
      const textarea = textareaRef.current;
      if (!textarea) return;

      const cursorPos = textarea.selectionStart ?? value.length;
      const textBeforeCursor = value.slice(0, cursorPos);
      const match = textBeforeCursor.match(/@(\S*)$/);

      if (match) {
        const start = cursorPos - match[0].length;
        const after = value.slice(cursorPos);
        const inserted = `@${name} `;
        onChange(value.slice(0, start) + inserted + after);
        setMentionQuery(null);

        setTimeout(() => {
          textarea.focus();
          const pos = start + inserted.length;
          textarea.setSelectionRange(pos, pos);
        }, 0);
      }
    },
    [value, onChange, textareaRef]
  );

  const handleMentionKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>): boolean => {
      if (mentionQuery !== null && filteredMentions.length > 0) {
        if (e.key === "ArrowDown") {
          e.preventDefault();
          setMentionIndex((i) =>
            Math.min(i + 1, filteredMentions.length - 1)
          );
          return true;
        }
        if (e.key === "ArrowUp") {
          e.preventDefault();
          setMentionIndex((i) => Math.max(i - 1, 0));
          return true;
        }
        if (e.key === "Enter" || e.key === "Tab") {
          e.preventDefault();
          handleMentionSelect(filteredMentions[mentionIndex]!.name);
          return true;
        }
        if (e.key === "Escape") {
          e.preventDefault();
          setMentionQuery(null);
          return true;
        }
      }
      return false;
    },
    [mentionQuery, filteredMentions, mentionIndex, handleMentionSelect]
  );

  return {
    mentionQuery,
    mentionIndex,
    filteredMentions,
    detectMention,
    handleMentionSelect,
    handleMentionKeyDown,
  };
}
