import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

function isSafeUrl(href: string | undefined): boolean {
  if (!href) return false;
  if (href.startsWith("/")) return true;
  try {
    const url = new URL(href, "https://placeholder.invalid");
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function isVideoUrl(src: string): boolean {
  const ext = src.split("?")[0]?.split(".").pop()?.toLowerCase();
  return ext === "mp4" || ext === "webm";
}

interface MarkdownProps {
  content: string;
}

export function Markdown({ content }: MarkdownProps) {
  return (
    <div className="prose-agentfeed overflow-hidden break-words">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => (
            <h1 className="text-xl font-bold text-gray-900 dark:text-text-primary mb-4 mt-6">
              {children}
            </h1>
          ),
          h2: ({ children }) => (
            <h2 className="text-lg font-bold text-gray-900 dark:text-text-primary mb-3 mt-5">
              {children}
            </h2>
          ),
          h3: ({ children }) => (
            <h3 className="text-base font-semibold text-gray-900 dark:text-text-primary mb-2 mt-4">
              {children}
            </h3>
          ),
          p: ({ children }) => (
            <p className="text-[15px] text-gray-500 dark:text-text-secondary leading-relaxed mb-3">
              {children}
            </p>
          ),
          a: ({ href, children }) =>
            isSafeUrl(href) ? (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-accent underline underline-offset-2 decoration-border-secondary hover:decoration-accent"
              >
                {children}
              </a>
            ) : (
              <span>{children}</span>
            ),
          ul: ({ children }) => (
            <ul className="list-disc pl-5 mb-3 space-y-1">{children}</ul>
          ),
          ol: ({ children }) => (
            <ol className="list-decimal pl-5 mb-3 space-y-1">{children}</ol>
          ),
          li: ({ children }) => (
            <li className="text-[15px] text-gray-500 dark:text-text-secondary leading-relaxed">
              {children}
            </li>
          ),
          code: ({ children }) => (
            <code className="bg-[#f3f4f6] dark:bg-[#374151] px-1.5 py-0.5 rounded text-[0.875em]">
              {children}
            </code>
          ),
          pre: ({ children }) => (
            <pre className="bg-[#1f2937] text-[#f9fafb] rounded-lg p-4 text-sm overflow-x-auto mb-3 whitespace-pre [&_code]:bg-transparent [&_code]:p-0 [&_code]:rounded-none [&_code]:text-[1em]">
              {children}
            </pre>
          ),
          blockquote: ({ children }) => (
            <blockquote className="border-l-[3px] border-[#d1d5db] pl-4 py-1 mb-3 text-[#6b7280] italic">
              {children}
            </blockquote>
          ),
          table: ({ children }) => (
            <div className="overflow-x-auto my-3 -mx-1">
              <table className="w-full border-collapse text-sm">{children}</table>
            </div>
          ),
          thead: ({ children }) => <thead>{children}</thead>,
          tbody: ({ children }) => <tbody>{children}</tbody>,
          tr: ({ children }) => (
            <tr className="border-b border-card-border">{children}</tr>
          ),
          th: ({ children }) => (
            <th className="border border-card-border bg-surface-secondary px-3 py-2 text-left font-semibold text-gray-900 dark:text-text-primary">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="border border-card-border px-3 py-2 text-gray-500 dark:text-text-secondary">
              {children}
            </td>
          ),
          img: ({ src, alt }) => {
            if (!src || !isSafeUrl(src)) return <span>{alt}</span>;
            if (isVideoUrl(src)) {
              return (
                <video
                  src={src}
                  controls
                  preload="metadata"
                  className="max-w-full rounded-lg my-2"
                />
              );
            }
            return (
              <a href={src} target="_blank" rel="noopener noreferrer">
                <img
                  src={src}
                  alt={alt ?? ""}
                  loading="lazy"
                  className="max-w-full rounded-lg my-2 cursor-pointer hover:opacity-90 transition-opacity"
                />
              </a>
            );
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

export function MarkdownCompact({ content }: MarkdownProps) {
  return (
    <div className="prose-compact overflow-hidden break-words">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => (
            <p className="text-sm font-semibold text-gray-700 dark:text-text-secondary">{children}</p>
          ),
          h2: ({ children }) => (
            <p className="text-sm font-semibold text-gray-700 dark:text-text-secondary">{children}</p>
          ),
          h3: ({ children }) => (
            <p className="text-sm font-semibold text-gray-700 dark:text-text-secondary">{children}</p>
          ),
          p: ({ children }) => (
            <p className="text-sm text-gray-700 dark:text-text-secondary leading-relaxed">{children}</p>
          ),
          a: ({ href, children }) =>
            isSafeUrl(href) ? (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-accent underline underline-offset-2 decoration-border-secondary hover:decoration-accent"
              >
                {children}
              </a>
            ) : (
              <span>{children}</span>
            ),
          ul: ({ children }) => (
            <ul className="list-disc pl-4 space-y-0.5">{children}</ul>
          ),
          ol: ({ children }) => (
            <ol className="list-decimal pl-4 space-y-0.5">{children}</ol>
          ),
          li: ({ children }) => (
            <li className="text-sm text-gray-700 dark:text-text-secondary">{children}</li>
          ),
          code: ({ children }) => (
            <code className="bg-[#f3f4f6] dark:bg-[#374151] px-1 py-0.5 rounded text-[0.875em]">
              {children}
            </code>
          ),
          pre: ({ children }) => (
            <pre className="bg-[#1f2937] text-[#f9fafb] rounded p-2 text-xs overflow-x-auto my-1 whitespace-pre [&_code]:bg-transparent [&_code]:p-0 [&_code]:rounded-none [&_code]:text-[1em]">
              {children}
            </pre>
          ),
          blockquote: ({ children }) => (
            <blockquote className="border-l-2 border-[#d1d5db] pl-3 text-[#6b7280] italic">
              {children}
            </blockquote>
          ),
          table: ({ children }) => (
            <div className="overflow-x-auto my-1">
              <table className="w-full border-collapse text-xs">{children}</table>
            </div>
          ),
          thead: ({ children }) => <thead>{children}</thead>,
          tbody: ({ children }) => <tbody>{children}</tbody>,
          tr: ({ children }) => (
            <tr className="border-b border-card-border">{children}</tr>
          ),
          th: ({ children }) => (
            <th className="border border-card-border bg-surface-secondary px-2 py-1 text-left font-semibold text-gray-900 dark:text-text-primary">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="border border-card-border px-2 py-1 text-gray-500 dark:text-text-secondary">
              {children}
            </td>
          ),
          img: ({ src, alt }) => {
            if (!src || !isSafeUrl(src)) return <span>{alt}</span>;
            if (isVideoUrl(src)) {
              return (
                <video
                  src={src}
                  controls
                  preload="metadata"
                  className="max-w-[200px] rounded my-1"
                />
              );
            }
            return (
              <a href={src} target="_blank" rel="noopener noreferrer">
                <img
                  src={src}
                  alt={alt ?? ""}
                  loading="lazy"
                  className="max-w-[200px] rounded my-1 cursor-pointer hover:opacity-90 transition-opacity"
                />
              </a>
            );
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
