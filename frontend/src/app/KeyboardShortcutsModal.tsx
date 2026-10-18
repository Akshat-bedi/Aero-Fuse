import React, { useEffect, useRef } from 'react';
import { Keyboard, X, Check, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { SHORTCUT_GROUPS } from './useKeyboardShortcuts';


export const KeyboardShortcutsModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
}> = ({ isOpen, onClose }) => {
  const dialogRef = useRef<HTMLDivElement>(null);

  // Focus trap inside modal
  useEffect(() => {
    if (isOpen) {
      dialogRef.current?.focus();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[70] bg-black/80 flex items-center justify-center p-4 font-mono select-none"
      role="dialog"
      aria-modal="true"
      aria-labelledby="shortcuts-title"
      tabIndex={-1}
      ref={dialogRef}
      onKeyDown={(e) => {
        if (e.key === 'Escape') onClose();
      }}
    >
      <div className="w-full max-w-xl bg-command-panel border border-command-primary p-4 rounded-[2px] shadow-none flex flex-col gap-4 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-command-border pb-2.5">
          <div className="flex items-center gap-2">
            <Keyboard className="w-4 h-4 text-command-primary" />
            <h3
              id="shortcuts-title"
              className="text-xs font-bold uppercase tracking-wider text-command-heading"
            >
              Tactical Keyboard Shortcuts Reference
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-command-muted hover:text-command-heading rounded-[1px]"
            aria-label="Close shortcuts modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Shortcuts Group Grid */}
        <div className="flex flex-col gap-4 text-xs">
          {SHORTCUT_GROUPS.map((group) => (
            <div key={group.category} className="flex flex-col gap-1.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-command-primary border-b border-command-border/40 pb-0.5">
                {group.category}
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                {group.items.map((item) => (
                  <div
                    key={item.key}
                    className="flex items-center justify-between p-1.5 bg-command-bg border border-command-border/70 rounded-[1px]"
                  >
                    <span className="text-command-text text-[11px]">{item.description}</span>
                    <kbd className="px-1.5 py-0.5 bg-command-raised border border-command-border font-bold text-command-primary rounded-[1px] text-[10px] whitespace-nowrap ml-2">
                      {item.key}
                    </kbd>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Footer Note */}
        <div className="pt-2 border-t border-command-border flex items-center justify-between text-[10px] text-command-subdued">
          <span>Shortcuts disabled while typing inside inputs.</span>
          <Button variant="secondary" size="sm" onClick={onClose} className="h-6 px-3 text-[10px]">
            Close [Esc]
          </Button>
        </div>
      </div>
    </div>
  );
};

export const DecisionConfirmModal: React.FC<{
  decision: { id: string; action: 'approve' | 'reject'; summary: string } | null;
  onConfirm: () => void;
  onCancel: () => void;
}> = ({ decision, onConfirm, onCancel }) => {
  if (!decision) return null;

  const isApprove = decision.action === 'approve';

  return (
    <div
      className="fixed inset-0 z-[70] bg-black/80 flex items-center justify-center p-4 font-mono select-none"
      role="dialog"
      aria-modal="true"
      aria-labelledby="decision-confirm-title"
    >
      <div
        className={`w-full max-w-md bg-command-panel border p-4 rounded-[2px] shadow-none flex flex-col gap-3 ${
          isApprove ? 'border-command-nominal-border' : 'border-command-critical-border'
        }`}
      >
        <div className="flex items-center justify-between border-b border-command-border pb-2">
          <h3
            id="decision-confirm-title"
            className={`text-xs font-bold uppercase tracking-wider flex items-center gap-2 ${
              isApprove ? 'text-command-nominal' : 'text-command-critical'
            }`}
          >
            {isApprove ? <Check className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
            Confirm Commander {isApprove ? 'Approval' : 'Rejection'}
          </h3>
          <button
            type="button"
            onClick={onCancel}
            className="text-command-muted hover:text-command-heading"
            aria-label="Cancel"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="text-xs text-command-text flex flex-col gap-1.5">
          <p>
            You are about to <strong>{isApprove ? 'APPROVE' : 'REJECT'}</strong> recommendation{' '}
            <span className="font-bold text-command-primary">{decision.id}</span> via keyboard shortcut:
          </p>
          <div className="p-2 bg-command-bg border border-command-border/80 text-[11px] italic">
            "{decision.summary}"
          </div>
          <p className="text-[10px] text-command-subdued">
            This action will be appended to the immutable SHA-256 audit ledger with operator attribution.
          </p>
        </div>

        <div className="flex items-center justify-end gap-2 pt-2 border-t border-command-border">
          <Button variant="ghost" size="sm" onClick={onCancel} className="text-xs">
            Cancel [Esc]
          </Button>
          <Button
            variant={isApprove ? 'primary' : 'danger'}
            size="sm"
            onClick={onConfirm}
            className="text-xs"
          >
            Confirm {isApprove ? 'Approve' : 'Reject'}
          </Button>
        </div>
      </div>
    </div>
  );
};
