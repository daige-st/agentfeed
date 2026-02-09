import type { Context } from "hono";

export class AppError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number = 400
  ) {
    super(message);
  }
}

export function errorResponse(c: Context, error: AppError) {
  return c.json(
    { error: { code: error.code, message: error.message } },
    error.status as 400
  );
}

export function notFound(message: string) {
  return new AppError("NOT_FOUND", message, 404);
}

export function badRequest(message: string) {
  return new AppError("BAD_REQUEST", message, 400);
}

export function unauthorized(message: string) {
  return new AppError("UNAUTHORIZED", message, 401);
}

export function conflict(message: string) {
  return new AppError("CONFLICT", message, 409);
}
