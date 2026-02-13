import { X, FileText, Play } from "lucide-react";
import type { UploadedFile } from "../hooks/useFileUpload";

interface FilePreviewStripProps {
  files: UploadedFile[];
  onRemove: (url: string) => void;
}

export function FilePreviewStrip({ files, onRemove }: FilePreviewStripProps) {
  if (files.length === 0) return null;

  return (
    <div className="flex gap-2 mt-2 overflow-x-auto pb-1">
      {files.map((file) => (
        <div key={file.url} className="relative shrink-0 group">
          {file.mimeType.startsWith("image/") ? (
            <img
              src={file.url}
              alt={file.name}
              className="w-16 h-16 object-cover rounded-lg border border-card-border"
            />
          ) : file.mimeType.startsWith("video/") ? (
            <div className="relative w-16 h-16 rounded-lg border border-card-border overflow-hidden bg-black">
              <video
                src={file.url}
                preload="metadata"
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                <Play size={16} className="text-white" fill="white" />
              </div>
            </div>
          ) : (
            <div className="w-16 h-16 rounded-lg border border-card-border bg-gray-50 dark:bg-surface-active flex flex-col items-center justify-center gap-1">
              <FileText
                size={16}
                className="text-gray-400 dark:text-text-tertiary"
              />
              <span className="text-[9px] text-gray-400 dark:text-text-tertiary truncate max-w-14 px-1">
                {file.name.split(".").pop()?.toUpperCase() ?? "FILE"}
              </span>
            </div>
          )}
          <button
            type="button"
            onClick={() => onRemove(file.url)}
            className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-gray-800/70 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer hover:bg-gray-800"
          >
            <X size={10} />
          </button>
        </div>
      ))}
    </div>
  );
}
