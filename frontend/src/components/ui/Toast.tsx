import React from 'react';
import {
  CheckCircle2,
  AlertTriangle,
  AlertOctagon,
  Info,
  X,
} from 'lucide-react';
import { ToastItem } from '@/types';
import { useOpsStore } from '@/store';
import { cn } from '@/lib/utils';

export interface ToastProps {
  toast: ToastItem;
}

export const Toast: React.FC<ToastProps> = ({ toast }) => {
  const removeToast = useOpsStore((state) => state.removeToast);

  const icons = {
    nominal: <CheckCircle2 className="w-4 h-4 text-command-nominal flex-shrink-0" />,
    warning: <AlertTriangle className="w-4 h-4 text-command-warning flex-shrink-0" />,
    critical: <AlertOctagon className="w-4 h-4 text-command-critical flex-shrink-0" />,
    info: <Info className="w-4 h-4 text-command-primary flex-shrink-0" />,
  };

  const borders = {
    nominal: 'border-l-command-nominal bg-command-raised text-command-text',
    warning: 'border-l-command-warning bg-command-raised text-command-text',
    critical: 'border-l-command-critical bg-command-raised text-command-text',
    info: 'border-l-command-primary bg-command-raised text-command-text',
  };

  return (
    <div
      className={cn(
        'w-80 border border-command-border border-l-[3px] rounded-[1px] p-2.5 select-none flex items-start gap-2 pointer-events-auto',
        borders[toast.type],
      )}
      role="alert"
    >
      <div className="mt-0.5">{icons[toast.type]}</div>
      <div className="flex-1 min-w-0">
        <h4 className="text-xs font-mono font-semibold uppercase tracking-wider text-command-heading truncate">
          {toast.title}
        </h4>
        {toast.message && (
          <p className="text-[10px] text-command-muted mt-0.5 leading-snug font-mono">
            {toast.message}
          </p>
        )}
      </div>
      <button
        type="button"
        onClick={() => removeToast(toast.id)}
        className="text-command-muted hover:text-command-text p-0.5 rounded-[1px] transition-none"
        aria-label="Dismiss notification"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
};

export const ToastContainer: React.FC = () => {
  const toasts = useOpsStore((state) => state.toasts);

  if (toasts.length === 0) return null;

  return (
    <div
      className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 pointer-events-none"
      aria-live="polite"
    >
      {toasts.map((toast) => (
        <Toast key={toast.id} toast={toast} />
      ))}
    </div>
  );
};
