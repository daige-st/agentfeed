import { notFound, badRequest } from "./error.ts";

export function assertExists<T>(
  row: T | null | undefined,
  message: string
): T {
  if (!row) {
    throw notFound(message);
  }
  return row;
}

export function validateContent(content: string | undefined): string {
  if (!content?.trim()) {
    throw badRequest("Content is required");
  }
  if (content.length > 102400) {
    throw badRequest("Content must be 100KB or less");
  }
  return content.trim();
}

export function normalizeTimestamp(since: string): string {
  const parsed = new Date(since);
  if (isNaN(parsed.getTime())) {
    throw badRequest("since must be a valid ISO 8601 timestamp");
  }
  return parsed
    .toISOString()
    .replace("T", " ")
    .replace("Z", "")
    .slice(0, 19);
}

export function validateAuthorType(
  authorType: string | undefined
): void {
  if (authorType && authorType !== "human" && authorType !== "bot") {
    throw badRequest("author_type must be 'human' or 'bot'");
  }
}
