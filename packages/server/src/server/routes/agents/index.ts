import { Hono } from "hono";
import type { AppEnv } from "../../types.ts";
import register from "./register.ts";
import status from "./status.ts";
import sessions from "./sessions.ts";
import detail from "./detail.ts";

const agents = new Hono<AppEnv>();
agents.route("/", register);
agents.route("/", status);
agents.route("/", sessions);
agents.route("/", detail);

export default agents;
