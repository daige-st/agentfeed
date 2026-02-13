import { useState, useCallback, useRef, useEffect } from "react";
import { api } from "../lib/api";

const IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
]);

const VIDEO_TYPES = new Set(["video/mp4", "video/webm"]);

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

export interface UploadedFile {
  url: string;
  name: string;
  mimeType: string;
}

interface UseFileUploadOptions {
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  value: string;
  onChange: (value: string) => void;
}

export function useFileUpload({
  textareaRef,
  value,
  onChange,
}: UseFileUploadOptions) {
  const [uploading, setUploading] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Clear tracked files when content is fully reset (form submit/cancel)
  useEffect(() => {
    if (value === "") {
      setUploadedFiles([]);
    }
  }, [value]);

  const insertAtCursor = useCallback(
    (markdown: string) => {
      const textarea = textareaRef.current;
      if (!textarea) {
        onChange(value + markdown);
        return;
      }

      const pos = textarea.selectionStart ?? value.length;
      const before = value.slice(0, pos);
      const after = value.slice(pos);
      const prefix =
        before.length > 0 && !before.endsWith("\n") ? "\n" : "";
      const newValue = before + prefix + markdown + "\n" + after;
      onChange(newValue);

      requestAnimationFrame(() => {
        const newPos = before.length + prefix.length + markdown.length + 1;
        textarea.focus();
        textarea.setSelectionRange(newPos, newPos);
      });
    },
    [textareaRef, value, onChange]
  );

  const uploadFile = useCallback(
    async (file: File) => {
      if (file.size > MAX_FILE_SIZE) {
        alert(`파일이 너무 큽니다. 최대 50MB까지 업로드할 수 있습니다.`);
        return;
      }

      setUploading(true);
      try {
        const result = await api.uploadFile(file);
        const name = file.name || "file";

        if (IMAGE_TYPES.has(file.type) || VIDEO_TYPES.has(file.type)) {
          insertAtCursor(`![${name}](${result.url})`);
        } else {
          insertAtCursor(`[${name}](${result.url})`);
        }

        setUploadedFiles((prev) => [
          ...prev,
          { url: result.url, name, mimeType: result.mime_type },
        ]);
      } catch (err) {
        console.error("Upload failed:", err);
        alert(err instanceof Error ? err.message : "Upload failed");
      } finally {
        setUploading(false);
      }
    },
    [insertAtCursor]
  );

  const removeFile = useCallback(
    (url: string) => {
      setUploadedFiles((prev) => prev.filter((f) => f.url !== url));
      // Remove markdown reference from content
      const escaped = url.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const pattern = new RegExp(`!?\\[[^\\]]*\\]\\(${escaped}\\)\\n?`, "g");
      onChange(value.replace(pattern, ""));
    },
    [value, onChange]
  );

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) uploadFile(file);
      e.target.value = "";
    },
    [uploadFile]
  );

  const handlePaste = useCallback(
    (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      for (const item of items) {
        if (item.kind === "file" && IMAGE_TYPES.has(item.type)) {
          e.preventDefault();
          const file = item.getAsFile();
          if (file) uploadFile(file);
          return;
        }
      }
    },
    [uploadFile]
  );

  const handleDragOver = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
    },
    []
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const file = e.dataTransfer?.files?.[0];
      if (file) uploadFile(file);
    },
    [uploadFile]
  );

  const openFilePicker = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  // Only show files whose URL is still referenced in content
  const visibleFiles = uploadedFiles.filter((f) => value.includes(f.url));

  return {
    uploading,
    uploadedFiles: visibleFiles,
    removeFile,
    fileInputRef,
    handleFileSelect,
    handlePaste,
    handleDragOver,
    handleDrop,
    openFilePicker,
  };
}
