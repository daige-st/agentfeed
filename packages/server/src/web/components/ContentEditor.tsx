import { useCallback, useRef, useImperativeHandle, forwardRef } from "react";
import { autoResize } from "../lib/utils";
import { useMention } from "../hooks/useMention";
import { useFileUpload } from "../hooks/useFileUpload";
import { MentionPopup } from "./MentionPopup";
import { FilePreviewStrip } from "./FilePreview";

export interface ContentEditorHandle {
  focus: () => void;
}

interface ContentEditorProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onCancel?: () => void;
  placeholder?: string;
  rows?: number;
  autoFocus?: boolean;
  textareaClassName?: string;
  mentionPopupClassName?: string;
  className?: string;
  children?: (ctx: {
    uploading: boolean;
    openFilePicker: () => void;
  }) => React.ReactNode;
}

export const ContentEditor = forwardRef<ContentEditorHandle, ContentEditorProps>(
  function ContentEditor(
    {
      value,
      onChange,
      onSubmit,
      onCancel,
      placeholder,
      rows = 3,
      autoFocus,
      textareaClassName = "w-full text-base border-none outline-none bg-transparent text-gray-900 dark:text-text-primary placeholder:text-gray-400 dark:placeholder:text-text-tertiary resize-none overflow-hidden",
      mentionPopupClassName,
      className,
      children,
    },
    ref
  ) {
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    useImperativeHandle(ref, () => ({
      focus: () => textareaRef.current?.focus(),
    }));

    const {
      mentionQuery,
      mentionIndex,
      filteredMentions,
      detectMention,
      handleMentionSelect,
      handleMentionKeyDown,
    } = useMention({
      textareaRef,
      value,
      onChange,
    });

    const {
      uploading,
      uploadedFiles,
      removeFile,
      fileInputRef,
      handleFileSelect,
      handlePaste,
      handleDragOver,
      handleDrop,
      openFilePicker,
    } = useFileUpload({
      textareaRef,
      value,
      onChange,
    });

    const handleChange = useCallback(
      (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        onChange(e.target.value);
        autoResize(e.target);
        detectMention(e.target.value, e.target.selectionStart ?? e.target.value.length);
      },
      [onChange, detectMention]
    );

    const handleKeyDown = useCallback(
      (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
          e.preventDefault();
          onSubmit();
          return;
        }
        if (e.key === "Escape" && onCancel) {
          e.preventDefault();
          onCancel();
          return;
        }
        handleMentionKeyDown(e);
      },
      [onSubmit, onCancel, handleMentionKeyDown]
    );

    return (
      <div className={`relative ${className ?? ""}`} onDragOver={handleDragOver} onDrop={handleDrop}>
        <MentionPopup
          mentionQuery={mentionQuery}
          filteredMentions={filteredMentions}
          mentionIndex={mentionIndex}
          onSelect={handleMentionSelect}
          className={mentionPopupClassName}
        />
        <textarea
          ref={textareaRef}
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          placeholder={placeholder}
          rows={rows}
          autoFocus={autoFocus}
          className={textareaClassName}
        />
        <FilePreviewStrip files={uploadedFiles} onRemove={removeFile} />
        <input
          ref={fileInputRef}
          type="file"
          onChange={handleFileSelect}
          className="hidden"
        />
        {children?.({ uploading, openFilePicker })}
      </div>
    );
  }
);
