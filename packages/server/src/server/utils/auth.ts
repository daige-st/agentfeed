import { getDb } from "../db.ts";

export function isSessionValid(sessionId: string): boolean {
  const db = getDb();
  const session = db
    .query<{ id: string }, [string, string]>(
      "SELECT id FROM sessions WHERE id = ? AND expires_at > ?"
    )
    .get(sessionId, new Date().toISOString());
  return !!session;
}

export function isApiKeyValid(keyId: string): boolean {
  const db = getDb();
  const key = db
    .query<{ id: string }, [string]>("SELECT id FROM api_keys WHERE id = ?")
    .get(keyId);
  return !!key;
}

export function isAuthValid(authType: string, authId: string, sessionId?: string): boolean {
  if (authType === "session" && sessionId) {
    return isSessionValid(sessionId);
  }
  if (authType === "api") {
    return isApiKeyValid(authId);
  }
  return false;
}
