import { nanoid } from "nanoid";

const PREFIX = {
  feed: "fd_",
  post: "ps_",
  comment: "cm_",
  apiKey: "af_",
  session: "ss_",
  admin: "ad_",
} as const;

type PrefixKey = keyof typeof PREFIX;

export function generateId(type: PrefixKey): string {
  return `${PREFIX[type]}${nanoid(21)}`;
}
