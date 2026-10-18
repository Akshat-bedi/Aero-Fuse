import React from 'react';
import { AlertTriangle, AlertOctagon, CheckCircle2 } from 'lucide-react';
import { Modal } from './Modal';
import { Button, ButtonVariant } from './Button';
import { cn } from '@/lib/utils';

export interface ConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  confirmVariant?: ButtonVariant;
  severity?: 'critical' | 'warning' | 'info';
  isLoading?: boolean;
  /**
   * Consequence note or safety alert to call out risks explicitly
   */
  riskWarning?: string;
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = 'CONFIRM ACTION',
  cancelLabel = 'CANCEL',
  confirmVariant = 'danger',
  severity = 'critical',
  isLoading = false,
  riskWarning,
}) => {
  const icons = {
    critical: <AlertOctagon className="w-6 h-6 text-command-critical flex-shrink-0" />,
    warning: <AlertTriangle className="w-6 h-6 text-command-warning flex-shrink-0" />,
    info: <CheckCircle2 className="w-6 h-6 text-command-primary flex-shrink-0" />,
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={
        <div className="flex items-center gap-2">
          {icons[severity]}
          <span>{title}</span>
        </div>
      }
      size="sm"
      footer={
        <>
          <Button
            variant="ghost"
            size="md"
            onClick={onClose}
            disabled={isLoading}
          >
            {cancelLabel}
          </Button>
          <Button
            variant={confirmVariant}
            size="md"
            onClick={() => {
              onConfirm();
            }}
            isLoading={isLoading}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <p className="text-sm text-command-text/90 leading-relaxed">
          {description}
        </p>

        {riskWarning && (
          <div
            className={cn(
              'p-2 rounded-[1px] border text-xs leading-normal flex items-start gap-2 font-mono',
              severity === 'critical' &&
                'bg-command-critical-bg text-red-200 border-command-critical-border',
              severity === 'warning' &&
                'bg-command-warning-bg text-amber-200 border-command-warning-border',
              severity === 'info' &&
                'bg-command-info-bg text-blue-200 border-command-info-border',
            )}
          >
            <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
            <span className="font-medium">{riskWarning}</span>
          </div>
        )}

        <div className="text-[10px] text-command-muted font-mono uppercase bg-command-bg px-2 py-1 rounded-[1px] border border-command-border">
          COMMANDER DIRECTIVE REQUIRED // LOGGED IN AUDIT TRAIL
        </div>
      </div>
    </Modal>
  );
};
