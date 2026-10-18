import React, { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: React.ReactNode;
  subtitle?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full';
  children: React.ReactNode;
  footer?: React.ReactNode;
  showCloseButton?: boolean;
  className?: string;
}

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  subtitle,
  size = 'md',
  children,
  footer,
  showCloseButton = true,
  className,
}) => {
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };

    if (isOpen) {
      document.body.style.overflow = 'hidden';
      window.addEventListener('keydown', handleKeyDown);
    }

    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const sizeClasses = {
    sm: 'max-w-md',
    md: 'max-w-lg',
    lg: 'max-w-2xl',
    xl: 'max-w-4xl',
    full: 'max-w-[95vw] h-[90vh]',
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 select-none"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
      role="dialog"
      aria-modal="true"
    >
      <div
        ref={modalRef}
        className={cn(
          'w-full bg-command-panel border border-command-border rounded-[2px] flex flex-col max-h-[90vh] overflow-hidden',
          sizeClasses[size],
          className,
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-3 py-2 border-b border-command-border bg-command-raised select-none">
          <div className="flex flex-col">
            <h2 className="text-xs font-mono font-semibold uppercase tracking-wider text-command-heading">
              {title}
            </h2>
            {subtitle && (
              <p className="text-[10px] text-command-muted font-mono mt-0.5">
                {subtitle}
              </p>
            )}
          </div>
          {showCloseButton && (
            <button
              type="button"
              onClick={onClose}
              className="text-command-muted hover:text-command-text p-1 rounded-[1px] hover:bg-command-raised/80 transition-none focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-command-primary"
              aria-label="Close dialog"
            >
              <X className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          )}
        </div>

        {/* Content Body */}
        <div className="p-3.5 overflow-y-auto text-xs text-command-text flex-1 font-mono">
          {children}
        </div>

        {/* Footer */}
        {footer && (
          <div className="flex items-center justify-end gap-2 px-3 py-2 border-t border-command-border bg-command-raised/50">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
};
