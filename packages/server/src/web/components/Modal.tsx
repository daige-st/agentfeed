import { useCallback, useEffect, type ReactNode } from "react";
import { X } from "lucide-react";

interface ModalProps {
  children: ReactNode;
  onClose: () => void;
  className?: string;
}

export function Modal({ children, onClose, className = "" }: ModalProps) {
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "auto";
    };
  }, []);

  const handleEscapeClose = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    },
    [onClose]
  );

  useEffect(() => {
    window.addEventListener("keydown", handleEscapeClose);
    return () => window.removeEventListener("keydown", handleEscapeClose);
  }, [handleEscapeClose]);

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) onClose();
  };

  return (
    <div
      className="fixed inset-0 z-[var(--z-index-modal)] flex items-end md:items-center md:justify-center bg-black/50"
      onClick={handleBackdropClick}
    >
      <div
        className={`relative bg-surface w-full rounded-t-3xl max-h-[85vh] animate-slide-up md:w-[400px] md:rounded-3xl md:max-h-[90vh] shadow-lg overflow-auto ${className}`}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}

export function ModalHeader({
  title,
  onClose,
}: {
  title: string;
  onClose: () => void;
}) {
  return (
    <div className="flex items-center justify-between mb-4">
      <h3 className="text-lg font-semibold text-gray-900 dark:text-text-primary">
        {title}
      </h3>
      <button
        onClick={onClose}
        className="p-1 text-gray-400 dark:text-text-tertiary hover:text-gray-600 dark:hover:text-text-secondary hover:bg-gray-100 dark:hover:bg-interactive-hover rounded transition-colors cursor-pointer"
      >
        <X size={20} />
      </button>
    </div>
  );
}

interface ConfirmModalProps {
  title: string;
  description: string;
  confirmLabel?: string;
  onConfirm: () => void;
  onClose: () => void;
  destructive?: boolean;
}

export function ConfirmModal({
  title,
  description,
  confirmLabel = "Delete",
  onConfirm,
  onClose,
  destructive = false,
}: ConfirmModalProps) {
  return (
    <Modal onClose={onClose}>
      <div className="p-6">
        <ModalHeader title={title} onClose={onClose} />
        <p className="text-sm text-text-secondary mb-6">{description}</p>
        <div className="flex justify-end">
          <button
            onClick={onConfirm}
            className={`px-4 py-2 text-sm rounded-lg transition-colors cursor-pointer font-medium ${
              destructive
                ? "text-white bg-danger hover:bg-danger-hover"
                : "text-accent-foreground bg-accent hover:bg-accent-hover"
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </Modal>
  );
}
