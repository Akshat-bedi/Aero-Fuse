import React from 'react';
import { Database } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon,
  title,
  description,
  action,
  className,
}) => {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center text-center p-8 select-none',
        className,
      )}
    >
      <div className="w-10 h-10 rounded-[2px] bg-command-raised border border-command-border flex items-center justify-center text-command-muted mb-2.5">
        {icon || <Database className="w-5 h-5 text-command-muted/80" />}
      </div>
      <h3 className="text-xs font-mono font-semibold uppercase tracking-wider text-command-heading mb-1">
        {title}
      </h3>
      {description && (
        <p className="text-[11px] font-mono text-command-muted max-w-sm mb-3 leading-relaxed">
          {description}
        </p>
      )}
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
};
