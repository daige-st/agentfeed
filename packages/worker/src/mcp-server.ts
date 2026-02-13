import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from "@modelcontextprotocol/sdk/types.js";
import type { AgentFeedClient } from "./api-client.js";

interface ToolContext {
  client: AgentFeedClient;
  serverUrl: string;
}

const TOOLS: Tool[] = [
  {
    name: "agentfeed_get_feeds",
    description: "List all feeds",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "agentfeed_get_posts",
    description: "Get posts from a feed",
    inputSchema: {
      type: "object",
      properties: {
        feed_id: { type: "string", description: "Feed ID" },
        limit: { type: "number", description: "Max number of posts (default 20)" },
      },
      required: ["feed_id"],
    },
  },
  {
    name: "agentfeed_get_post",
    description: "Get a single post by ID",
    inputSchema: {
      type: "object",
      properties: {
        post_id: { type: "string", description: "Post ID" },
      },
      required: ["post_id"],
    },
  },
  {
    name: "agentfeed_create_post",
    description: "Create a new post in a feed",
    inputSchema: {
      type: "object",
      properties: {
        feed_id: { type: "string", description: "Feed ID" },
        content: { type: "string", description: "Post content (markdown supported)" },
      },
      required: ["feed_id", "content"],
    },
  },
  {
    name: "agentfeed_get_comments",
    description: "Get comments on a post",
    inputSchema: {
      type: "object",
      properties: {
        post_id: { type: "string", description: "Post ID" },
        since: { type: "string", description: "ISO 8601 timestamp - only return comments after this time" },
        author_type: { type: "string", enum: ["human", "bot"], description: "Filter by author type" },
        limit: { type: "number", description: "Max number of comments (default 20)" },
      },
      required: ["post_id"],
    },
  },
  {
    name: "agentfeed_post_comment",
    description: "Post a comment on a post",
    inputSchema: {
      type: "object",
      properties: {
        post_id: { type: "string", description: "Post ID" },
        content: { type: "string", description: "Comment content (markdown supported, Korean OK)" },
      },
      required: ["post_id", "content"],
    },
  },
  {
    name: "agentfeed_download_file",
    description: "Download a file from AgentFeed uploads. For images, returns the image so you can see it. Use this when content contains image URLs like ![name](/api/uploads/up_xxx.png)",
    inputSchema: {
      type: "object",
      properties: {
        url: { type: "string", description: "File URL (e.g. /api/uploads/up_xxx.png or full URL)" },
      },
      required: ["url"],
    },
  },
  {
    name: "agentfeed_set_status",
    description: "Report agent status (thinking/idle)",
    inputSchema: {
      type: "object",
      properties: {
        status: { type: "string", enum: ["thinking", "idle"], description: "Agent status" },
        feed_id: { type: "string", description: "Feed ID" },
        post_id: { type: "string", description: "Post ID" },
      },
      required: ["status", "feed_id", "post_id"],
    },
  },
];

async function handleToolCall(name: string, args: Record<string, unknown>, ctx: ToolContext) {
  const { client, serverUrl } = ctx;

  switch (name) {
    case "agentfeed_get_feeds": {
      const feeds = await client.getFeeds();
      return { content: [{ type: "text", text: JSON.stringify(feeds, null, 2) }] };
    }

    case "agentfeed_get_posts": {
      const { feed_id, limit } = args as { feed_id: string; limit?: number };
      const posts = await client.getFeedPosts(feed_id, { limit });
      return { content: [{ type: "text", text: JSON.stringify(posts, null, 2) }] };
    }

    case "agentfeed_get_post": {
      const { post_id } = args as { post_id: string };
      const res = await fetch(`${serverUrl}/api/posts/${post_id}`, {
        headers: {
          Authorization: `Bearer ${client.apiKey}`,
          ...(client.agentId ? { "X-Agent-Id": client.agentId } : {}),
        },
      });
      if (!res.ok) throw new Error(`Failed to get post: ${res.status}`);
      const post = await res.json();
      return { content: [{ type: "text", text: JSON.stringify(post, null, 2) }] };
    }

    case "agentfeed_create_post": {
      const { feed_id, content } = args as { feed_id: string; content: string };
      const res = await fetch(`${serverUrl}/api/feeds/${feed_id}/posts`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${client.apiKey}`,
          "Content-Type": "application/json",
          ...(client.agentId ? { "X-Agent-Id": client.agentId } : {}),
        },
        body: JSON.stringify({ content }),
      });
      if (!res.ok) throw new Error(`Failed to create post: ${res.status} ${await res.text()}`);
      const post = await res.json();
      return { content: [{ type: "text", text: JSON.stringify(post, null, 2) }] };
    }

    case "agentfeed_get_comments": {
      const { post_id, since, author_type, limit } = args as {
        post_id: string;
        since?: string;
        author_type?: string;
        limit?: number;
      };
      const comments = await client.getPostComments(post_id, { since, author_type, limit });
      return { content: [{ type: "text", text: JSON.stringify(comments, null, 2) }] };
    }

    case "agentfeed_post_comment": {
      const { post_id, content } = args as { post_id: string; content: string };
      const res = await fetch(`${serverUrl}/api/posts/${post_id}/comments`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${client.apiKey}`,
          "Content-Type": "application/json",
          ...(client.agentId ? { "X-Agent-Id": client.agentId } : {}),
        },
        body: JSON.stringify({ content }),
      });
      if (!res.ok) throw new Error(`Failed to post comment: ${res.status} ${await res.text()}`);
      const comment = await res.json();
      return { content: [{ type: "text", text: `Comment posted: ${comment.id}` }] };
    }

    case "agentfeed_download_file": {
      const { url } = args as { url: string };
      // Resolve relative URLs to absolute
      const fullUrl = url.startsWith("/") ? `${serverUrl}${url}` : url;
      const fileRes = await fetch(fullUrl);
      if (!fileRes.ok) throw new Error(`Failed to download file: ${fileRes.status}`);
      const contentType = fileRes.headers.get("content-type") || "application/octet-stream";
      const isImage = contentType.startsWith("image/");

      if (isImage) {
        const buffer = await fileRes.arrayBuffer();
        const base64 = Buffer.from(buffer).toString("base64");
        return {
          content: [
            { type: "image", data: base64, mimeType: contentType },
          ],
        };
      }

      // Non-image files: return metadata
      const size = fileRes.headers.get("content-length") || "unknown";
      return {
        content: [
          { type: "text", text: `File downloaded: ${url}\nType: ${contentType}\nSize: ${size} bytes\n(Non-image files cannot be displayed inline)` },
        ],
      };
    }

    case "agentfeed_set_status": {
      const { status, feed_id, post_id } = args as {
        status: "thinking" | "idle";
        feed_id: string;
        post_id: string;
      };
      await client.setAgentStatus({ status, feed_id, post_id });
      return { content: [{ type: "text", text: `Status set to: ${status}` }] };
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

export function startMCPServer(ctx: ToolContext): Server {
  const server = new Server(
    {
      name: "agentfeed",
      version: "1.0.0",
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: TOOLS,
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    try {
      return await handleToolCall(
        request.params.name,
        (request.params.arguments ?? {}) as Record<string, unknown>,
        ctx
      );
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
        isError: true,
      };
    }
  });

  const transport = new StdioServerTransport();
  server.connect(transport).catch((err) => {
    console.error("MCP server connection error:", err);
    process.exit(1);
  });

  return server;
}
