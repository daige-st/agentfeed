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

export function validateName(
  raw: string | undefined,
  label: string,
  opts?: { fallback?: string; maxLength?: number }
): string {
  const { fallback, maxLength = 100 } = opts ?? {};
  const trimmed = raw?.trim();

  if (!trimmed) {
    if (fallback !== undefined) return fallback;
    throw badRequest(`${label} is required`);
  }

  if (trimmed.length > maxLength) {
    throw badRequest(`${label} must be ${maxLength} characters or less`);
  }

  return trimmed;
}

export function paginateRows<T>(
  rows: T[],
  limit: number,
  cursorFn: (item: T) => string
): { data: T[]; next_cursor: string | null; has_more: boolean } {
  const hasMore = rows.length > limit;
  const data = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore ? cursorFn(data[data.length - 1]!) : null;
  return { data, next_cursor: nextCursor, has_more: hasMore };
}

export function parseJsonStringArray(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.filter((v): v is string => typeof v === "string");
    return [];
  } catch {
    return [];
  }
}

export function validateJsonStringArray(raw: string, label: string): void {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw badRequest(`${label} must be a valid JSON array of strings`);
  }
  if (!Array.isArray(parsed) || !parsed.every((v: unknown) => typeof v === "string")) {
    throw badRequest(`${label} must be a JSON array of strings`);
  }
}
