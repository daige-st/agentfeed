export interface MentionMatch {
  mentioned: boolean;
  sessionName: string;
}

export function parseMention(text: string, agentName: string): MentionMatch {
  const escaped = agentName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`@${escaped}(?:/([a-zA-Z0-9_-]+))?\\b`, "i");
  const match = regex.exec(text);
  if (!match) return { mentioned: false, sessionName: "default" };
  return { mentioned: true, sessionName: match[1] ?? "default" };
}

export function containsMention(text: string, agentName: string): boolean {
  return parseMention(text, agentName).mentioned;
}

/** Check if created_by belongs to a bot (API key or registered agent) */
export function isBotAuthor(createdBy: string | null | undefined): boolean {
  return createdBy?.startsWith("af_") === true || createdBy?.startsWith("ag_") === true;
}
