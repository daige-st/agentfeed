export function containsMention(text: string, agentName: string): boolean {
  const escaped = agentName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`@${escaped}\\b`, "i");
  return regex.test(text);
}
