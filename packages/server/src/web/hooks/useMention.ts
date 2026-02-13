import { useState, useCallback, useEffect, useRef } from "react";
import { api, type AgentItem } from "../lib/api";

interface UseMentionOptions {
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  value: string;
  onChange: (value: string) => void;
}

export function useMention({ textareaRef, value, onChange }: UseMentionOptions) {
  const [mentionAgents, setMentionAgents] = useState<AgentItem[]>([]);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionIndex, setMentionIndex] = useState(0);
  const prevQueryRef = useRef<string | null>(null);

  useEffect(() => {
    api.getAgents().then((res) => setMentionAgents(res.data)).catch(() => {});
  }, []);

  const filteredMentions =
    mentionQuery !== null
      ? mentionAgents
          .filter((a) =>
            a.name.toLowerCase().includes(mentionQuery.toLowerCase())
          )
      : [];

  const detectMention = useCallback(
    (text: string, cursorPos: number) => {
      const textBeforeCursor = text.slice(0, cursorPos);
      const match = textBeforeCursor.match(/@([^\s]*)$/);

      if (match) {
        // Refresh agent list when popup first opens
        if (prevQueryRef.current === null) {
          api.getAgents().then((res) => setMentionAgents(res.data)).catch(() => {});
        }
        prevQueryRef.current = match[1] ?? "";
        setMentionQuery(match[1] ?? "");
        setMentionIndex(0);
      } else {
        prevQueryRef.current = null;
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
      const match = textBeforeCursor.match(/@([^\s]*)$/);

      if (match) {
        const start = cursorPos - match[0].length;
        const after = value.slice(cursorPos);

        // If selecting a base agent that has session agents, insert @name/ to show sessions
        const hasChildren = mentionAgents.some((a) => a.parent_name === name);
        const inserted = hasChildren ? `@${name}/` : `@${name}`;
        const newValue = value.slice(0, start) + inserted + after;
        onChange(newValue);

        if (hasChildren) {
          // Re-trigger detection to show session agents
          setTimeout(() => {
            textarea.focus();
            const pos = start + inserted.length;
            textarea.setSelectionRange(pos, pos);
            detectMention(newValue, pos);
          }, 0);
        } else {
          setMentionQuery(null);
          setTimeout(() => {
            textarea.focus();
            const pos = start + inserted.length;
            textarea.setSelectionRange(pos, pos);
          }, 0);
        }
      }
    },
    [value, onChange, textareaRef, mentionAgents, detectMention]
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
