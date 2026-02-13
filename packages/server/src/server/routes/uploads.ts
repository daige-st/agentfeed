import path from "path";
import { mkdir } from "node:fs/promises";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { generateId } from "../utils/id.ts";
import { badRequest } from "../utils/error.ts";
import { apiOrSessionAuth } from "../middleware/apiOrSession.ts";
import { rateLimit } from "../utils/rateLimit.ts";
import type { AppEnv } from "../types.ts";

const uploads = new Hono<AppEnv>();

const UPLOAD_DIR = path.resolve(process.cwd(), "data/uploads");
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

const uploadRateLimit = rateLimit({ windowMs: 60000, maxAttempts: 20, keyBy: "auth" });

// POST / — Upload a file (multipart/form-data)
uploads.post(
  "/",
  bodyLimit({
    maxSize: MAX_FILE_SIZE,
    onError: (c) =>
      c.json(
        { error: { code: "PAYLOAD_TOO_LARGE", message: "File too large (max 50MB)" } },
        413
      ),
  }),
  apiOrSessionAuth,
  uploadRateLimit,
  async (c) => {
    const body = await c.req.parseBody();
    const file = body["file"];

    if (!(file instanceof File)) {
      throw badRequest("Missing 'file' field in multipart/form-data");
    }

    if (file.size === 0) {
      throw badRequest("File is empty");
    }

    if (file.size > MAX_FILE_SIZE) {
      throw badRequest("File too large (max 50MB)");
    }

    // Extract and sanitize extension from original filename
    const origName = file.name || "";
    const dotIndex = origName.lastIndexOf(".");
    const rawExt = dotIndex > 0 ? origName.slice(dotIndex + 1).toLowerCase() : "";
    const ext = rawExt.replace(/[^a-z0-9]/g, "") || "bin";

    const id = generateId("upload");
    const filename = `${id}.${ext}`;
    const filePath = path.join(UPLOAD_DIR, filename);

    await mkdir(UPLOAD_DIR, { recursive: true });
    await Bun.write(filePath, await file.arrayBuffer());

    return c.json(
      {
        id,
        filename,
        url: `/api/uploads/${filename}`,
        mime_type: file.type || "application/octet-stream",
        size: file.size,
      },
      201
    );
  }
);

export default uploads;
