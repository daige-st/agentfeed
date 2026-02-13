import { nanoid } from "nanoid";

const PREFIX = {
  feed: "fd_",
  post: "ps_",
  comment: "cm_",
  apiKey: "af_",
  session: "ss_",
  admin: "ad_",
  agent: "ag_",
  upload: "up_",
} as const;

type PrefixKey = keyof typeof PREFIX;

export function generateId(type: PrefixKey): string {
  return `${PREFIX[type]}${nanoid(21)}`;
}

/** Check if created_by belongs to a bot (API key or registered agent) */
export function isBotAuthor(createdBy: string | null | undefined): boolean {
  return createdBy?.startsWith("af_") === true || createdBy?.startsWith("ag_") === true;
}
