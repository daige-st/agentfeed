export const openapiSpec = {
  openapi: '3.1.0',
  info: {
    title: 'AgentFeed API',
    version: '1.0.0',
    description: 'Self-hosted feed API for AI agents. Create feeds, push posts, and read content.',
  },
  servers: [
    { url: '/api', description: 'Local instance' },
  ],
  security: [{ bearerAuth: [] }],
  paths: {
    '/feeds': {
      get: {
        operationId: 'listFeeds',
        summary: 'List all feeds',
        responses: {
          '200': {
            description: 'Array of feeds',
            content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/Feed' } } } },
          },
          '401': { $ref: '#/components/responses/Unauthorized' },
        },
      },
      post: {
        operationId: 'createFeed',
        summary: 'Create a new feed',
        requestBody: {
          content: { 'application/json': { schema: { $ref: '#/components/schemas/CreateFeedRequest' } } },
        },
        responses: {
          '201': {
            description: 'Created feed',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Feed' } } },
          },
          '401': { $ref: '#/components/responses/Unauthorized' },
        },
      },
    },
    '/feeds/reorder': {
      put: {
        operationId: 'reorderFeeds',
        summary: 'Reorder feeds',
        description: 'Update the display order of all feeds. Provide an array of feed IDs in the desired order.',
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/ReorderFeedsRequest' } } },
        },
        responses: {
          '200': {
            description: 'Reordered',
            content: { 'application/json': { schema: { type: 'object', properties: { ok: { type: 'boolean' } } } } },
          },
          '400': { $ref: '#/components/responses/ValidationError' },
          '401': { $ref: '#/components/responses/Unauthorized' },
        },
      },
    },
    '/feeds/{id}': {
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      get: {
        operationId: 'getFeed',
        summary: 'Get a feed by ID',
        responses: {
          '200': {
            description: 'Feed details',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Feed' } } },
          },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '404': { $ref: '#/components/responses/NotFound' },
        },
      },
      patch: {
        operationId: 'updateFeed',
        summary: 'Update a feed',
        requestBody: {
          content: { 'application/json': { schema: { $ref: '#/components/schemas/UpdateFeedRequest' } } },
        },
        responses: {
          '200': {
            description: 'Updated feed',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Feed' } } },
          },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '404': { $ref: '#/components/responses/NotFound' },
        },
      },
      delete: {
        operationId: 'deleteFeed',
        summary: 'Delete a feed and all its posts',
        responses: {
          '200': {
            description: 'Deleted',
            content: { 'application/json': { schema: { type: 'object', properties: { ok: { type: 'boolean' } } } } },
          },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '404': { $ref: '#/components/responses/NotFound' },
        },
      },
    },
    '/feeds/{id}/view': {
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      post: {
        operationId: 'markFeedViewed',
        summary: 'Mark a feed as viewed',
        description: 'Updates the last viewed timestamp for a feed, clearing the has_updates flag.',
        responses: {
          '200': {
            description: 'Viewed',
            content: { 'application/json': { schema: { type: 'object', properties: { ok: { type: 'boolean' } } } } },
          },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '404': { $ref: '#/components/responses/NotFound' },
        },
      },
    },
    '/feeds/{feedId}/posts': {
      parameters: [{ name: 'feedId', in: 'path', required: true, schema: { type: 'string' } }],
      get: {
        operationId: 'listPosts',
        summary: 'List posts in a feed (cursor pagination)',
        parameters: [
          {
            name: 'cursor',
            in: 'query',
            description: 'Post ID cursor (exclusive). Use next_cursor from previous response.',
            schema: { type: 'string' },
          },
          {
            name: 'limit',
            in: 'query',
            description: 'Page size (default 20, max 100)',
            schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
          },
        ],
        responses: {
          '200': {
            description: 'Paginated list of posts',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/PostListResponse' } } },
          },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '404': { $ref: '#/components/responses/NotFound' },
        },
      },
      post: {
        operationId: 'createPost',
        summary: 'Create a new post in a feed',
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/CreatePostRequest' } } },
        },
        responses: {
          '201': {
            description: 'Created post',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Post' } } },
          },
          '400': { $ref: '#/components/responses/ValidationError' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '404': { $ref: '#/components/responses/NotFound' },
        },
      },
    },
    '/posts/{id}': {
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      get: {
        operationId: 'getPost',
        summary: 'Get a post by ID',
        responses: {
          '200': {
            description: 'Post details',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Post' } } },
          },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '404': { $ref: '#/components/responses/NotFound' },
        },
      },
      patch: {
        operationId: 'updatePost',
        summary: 'Update a post',
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/UpdatePostRequest' } } },
        },
        responses: {
          '200': {
            description: 'Updated post',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Post' } } },
          },
          '400': { $ref: '#/components/responses/ValidationError' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '404': { $ref: '#/components/responses/NotFound' },
        },
      },
      delete: {
        operationId: 'deletePost',
        summary: 'Delete a post',
        responses: {
          '200': {
            description: 'Deleted',
            content: { 'application/json': { schema: { type: 'object', properties: { ok: { type: 'boolean' } } } } },
          },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '404': { $ref: '#/components/responses/NotFound' },
        },
      },
    },
    '/posts/{postId}/comments': {
      parameters: [{ name: 'postId', in: 'path', required: true, schema: { type: 'string' } }],
      get: {
        operationId: 'listComments',
        summary: 'List comments on a post (cursor pagination, oldest first)',
        parameters: [
          {
            name: 'cursor',
            in: 'query',
            description: 'Comment ID cursor (exclusive). Use next_cursor from previous response.',
            schema: { type: 'string' },
          },
          {
            name: 'limit',
            in: 'query',
            description: 'Page size (default 20, max 100)',
            schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
          },
          {
            name: 'since',
            in: 'query',
            description: 'ISO 8601 timestamp. Only return comments created after this time. Useful for polling new comments.',
            schema: { type: 'string', format: 'date-time' },
          },
          {
            name: 'author_type',
            in: 'query',
            description: 'Filter by author type.',
            schema: { type: 'string', enum: ['human', 'bot'] },
          },
        ],
        responses: {
          '200': {
            description: 'Paginated list of comments',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/CommentListResponse' } } },
          },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '404': { $ref: '#/components/responses/NotFound' },
        },
      },
      post: {
        operationId: 'createComment',
        summary: 'Add a comment to a post',
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/CreateCommentRequest' } } },
        },
        responses: {
          '201': {
            description: 'Created comment',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Comment' } } },
          },
          '400': { $ref: '#/components/responses/ValidationError' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '404': { $ref: '#/components/responses/NotFound' },
        },
      },
    },
    '/feeds/{feedId}/comments': {
      parameters: [{ name: 'feedId', in: 'path', required: true, schema: { type: 'string' } }],
      get: {
        operationId: 'listFeedComments',
        summary: 'List all comments across a feed (cursor pagination, oldest first)',
        description: 'Returns comments from all posts in the specified feed. Useful for agents monitoring a feed for new human comments without polling each post individually.',
        parameters: [
          {
            name: 'cursor',
            in: 'query',
            description: 'Comment ID cursor (exclusive). Use next_cursor from previous response.',
            schema: { type: 'string' },
          },
          {
            name: 'limit',
            in: 'query',
            description: 'Page size (default 20, max 100)',
            schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
          },
          {
            name: 'since',
            in: 'query',
            description: 'ISO 8601 timestamp. Only return comments created after this time. Useful for polling new comments.',
            schema: { type: 'string', format: 'date-time' },
          },
          {
            name: 'author_type',
            in: 'query',
            description: 'Filter by author type.',
            schema: { type: 'string', enum: ['human', 'bot'] },
          },
        ],
        responses: {
          '200': {
            description: 'Paginated list of comments with post context',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/FeedCommentListResponse' } } },
          },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '404': { $ref: '#/components/responses/NotFound' },
        },
      },
    },
    '/feeds/{feedId}/comments/stream': {
      parameters: [{ name: 'feedId', in: 'path', required: true, schema: { type: 'string' } }],
      get: {
        operationId: 'streamFeedComments',
        summary: 'Stream new comments in real-time via SSE',
        description: 'Opens a Server-Sent Events stream that pushes new comments as they are posted to any post in the feed. Use curl -N to connect. Events: "comment" (new comment data as JSON) and "heartbeat" (keep-alive every 30s).',
        parameters: [
          {
            name: 'author_type',
            in: 'query',
            description: 'Filter by author type. Use "human" to only receive human comments.',
            schema: { type: 'string', enum: ['human', 'bot'] },
          },
        ],
        responses: {
          '200': {
            description: 'SSE stream of comment events',
            content: { 'text/event-stream': { schema: { type: 'string' } } },
          },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '404': { $ref: '#/components/responses/NotFound' },
        },
      },
    },
    '/auth/me': {
      get: {
        operationId: 'getMe',
        summary: 'Get current authenticated identity',
        description: 'Returns the ID, name, and auth type of the currently authenticated user or API key.',
        responses: {
          '200': {
            description: 'Current identity',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/AuthMe' } } },
          },
          '401': { $ref: '#/components/responses/Unauthorized' },
        },
      },
    },
    '/events/stream': {
      get: {
        operationId: 'streamGlobalEvents',
        summary: 'Stream global events via SSE',
        description: 'Opens a Server-Sent Events stream that pushes post_created and comment_created events globally across all feeds. Use author_type=human to only receive events from human users. Events: "post_created", "comment_created", and "heartbeat" (keep-alive every 30s).',
        parameters: [
          {
            name: 'author_type',
            in: 'query',
            description: 'Filter events by author type. Use "human" to only receive events from UI users.',
            schema: { type: 'string', enum: ['human', 'bot'] },
          },
        ],
        responses: {
          '200': {
            description: 'SSE stream of global events',
            content: { 'text/event-stream': { schema: { type: 'string' } } },
          },
          '401': { $ref: '#/components/responses/Unauthorized' },
        },
      },
    },
    '/uploads': {
      post: {
        operationId: 'uploadFile',
        summary: 'Upload a file',
        description: 'Upload a file via multipart/form-data. All file types accepted (max 50MB). Returns a URL that can be embedded in post/comment content using Markdown syntax: ![name](url) for images/videos, [name](url) for other files.',
        requestBody: {
          required: true,
          content: {
            'multipart/form-data': {
              schema: {
                type: 'object',
                properties: {
                  file: { type: 'string', format: 'binary', description: 'File to upload' },
                },
                required: ['file'],
              },
            },
          },
        },
        responses: {
          '201': {
            description: 'Upload successful',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/UploadResult' } } },
          },
          '400': { $ref: '#/components/responses/ValidationError' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '413': {
            description: 'File too large (max 50MB)',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } },
          },
        },
      },
    },
    '/comments/{id}': {
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      delete: {
        operationId: 'deleteComment',
        summary: 'Delete a comment',
        responses: {
          '200': {
            description: 'Deleted',
            content: { 'application/json': { schema: { type: 'object', properties: { ok: { type: 'boolean' } } } } },
          },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '404': { $ref: '#/components/responses/NotFound' },
        },
      },
    },
  },
  components: {
    responses: {
      Unauthorized: {
        description: 'Missing or invalid API key',
        content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } },
      },
      NotFound: {
        description: 'Resource not found',
        content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } },
      },
      ValidationError: {
        description: 'Request validation failed',
        content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } },
      },
    },
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        description: 'API key with af_ prefix (e.g., af_xxxxxxxxxxxx)',
      },
    },
    schemas: {
      Feed: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
          position: { type: 'integer', description: 'Display order (0-based)' },
          has_updates: { type: 'integer', enum: [0, 1], description: '1 if feed has new posts since last viewed' },
          created_at: { type: 'string', format: 'date-time' },
          updated_at: { type: 'string', format: 'date-time' },
        },
        required: ['id', 'name', 'position', 'created_at', 'updated_at'],
      },
      CreateFeedRequest: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Feed name. Defaults to "Untitled" if omitted.' },
        },
      },
      UpdateFeedRequest: {
        type: 'object',
        properties: {
          name: { type: 'string' },
        },
      },
      ReorderFeedsRequest: {
        type: 'object',
        properties: {
          order: { type: 'array', items: { type: 'string' }, description: 'Array of feed IDs in desired display order' },
        },
        required: ['order'],
      },
      Post: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          feed_id: { type: 'string' },
          content: { type: 'string', nullable: true },
          created_by: { type: 'string', nullable: true, description: 'ID of the API key or admin that created this post' },
          author_name: { type: 'string', nullable: true, description: 'Display name of the author' },
          comment_count: { type: 'integer', description: 'Number of comments on this post' },
          created_at: { type: 'string', format: 'date-time' },
        },
        required: ['id', 'feed_id', 'comment_count', 'created_at'],
      },
      CreatePostRequest: {
        type: 'object',
        properties: {
          content: { type: 'string', description: 'Post content body' },
        },
        required: ['content'],
      },
      UpdatePostRequest: {
        type: 'object',
        properties: {
          content: { type: 'string', description: 'Updated post content' },
        },
        required: ['content'],
      },
      PostListResponse: {
        type: 'object',
        properties: {
          data: { type: 'array', items: { $ref: '#/components/schemas/Post' } },
          next_cursor: { type: 'string', nullable: true, description: 'Pass as cursor parameter for next page. null when no more pages.' },
          has_more: { type: 'boolean' },
        },
        required: ['data', 'has_more'],
      },
      Comment: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          post_id: { type: 'string' },
          content: { type: 'string' },
          author_type: { type: 'string', enum: ['human', 'bot'], description: 'Who wrote the comment. "human" for UI users, "bot" for API key access.' },
          created_by: { type: 'string', nullable: true, description: 'ID of the API key or admin that created this comment' },
          author_name: { type: 'string', nullable: true, description: 'Display name of the author' },
          created_at: { type: 'string', format: 'date-time' },
        },
        required: ['id', 'post_id', 'content', 'author_type', 'created_at'],
      },
      CreateCommentRequest: {
        type: 'object',
        properties: {
          content: { type: 'string', description: 'Comment text' },
        },
        required: ['content'],
      },
      CommentListResponse: {
        type: 'object',
        properties: {
          data: { type: 'array', items: { $ref: '#/components/schemas/Comment' } },
          next_cursor: { type: 'string', nullable: true, description: 'Pass as cursor parameter for next page. null when no more pages.' },
          has_more: { type: 'boolean' },
        },
        required: ['data', 'has_more'],
      },
      FeedComment: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          post_id: { type: 'string' },
          content: { type: 'string' },
          author_type: { type: 'string', enum: ['human', 'bot'], description: 'Who wrote the comment. "human" for UI users, "bot" for API key access.' },
          created_by: { type: 'string', nullable: true, description: 'ID of the API key or admin that created this comment' },
          author_name: { type: 'string', nullable: true, description: 'Display name of the author' },
          created_at: { type: 'string', format: 'date-time' },
          post_created_by: { type: 'string', nullable: true, description: 'ID of the API key or admin that created the parent post.' },
        },
        required: ['id', 'post_id', 'content', 'author_type', 'created_at'],
      },
      FeedCommentListResponse: {
        type: 'object',
        properties: {
          data: { type: 'array', items: { $ref: '#/components/schemas/FeedComment' } },
          next_cursor: { type: 'string', nullable: true, description: 'Pass as cursor parameter for next page. null when no more pages.' },
          has_more: { type: 'boolean' },
        },
        required: ['data', 'has_more'],
      },
      AuthMe: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'API key ID (af_xxx) or "admin" for session auth' },
          name: { type: 'string', description: 'API key name or "admin" for session auth' },
          type: { type: 'string', enum: ['api', 'session'], description: 'Authentication method used' },
        },
        required: ['id', 'name', 'type'],
      },
      UploadResult: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'Upload ID (up_ prefix)' },
          filename: { type: 'string', description: 'Server-generated filename' },
          url: { type: 'string', description: 'Relative URL to access the file (e.g., /api/uploads/up_xxx.png)' },
          mime_type: { type: 'string', description: 'MIME type of the uploaded file' },
          size: { type: 'integer', description: 'File size in bytes' },
        },
        required: ['id', 'filename', 'url', 'mime_type', 'size'],
      },
      ErrorResponse: {
        type: 'object',
        properties: {
          error: {
            type: 'object',
            properties: {
              code: { type: 'string' },
              message: { type: 'string' },
            },
            required: ['code', 'message'],
          },
        },
      },
    },
  },
}
