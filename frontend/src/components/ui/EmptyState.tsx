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
      <div className="w-12 h-12 rounded-full bg-command-raised border border-command-border flex items-center justify-center text-command-muted mb-3.5 shadow-sm">
        {icon || <Database className="w-6 h-6 text-command-muted/80" />}
      </div>
      <h3 className="text-xs font-semibold uppercase tracking-wider text-command-heading mb-1">
        {title}
      </h3>
      {description && (
        <p className="text-xs text-command-muted max-w-sm mb-4 leading-relaxed font-sans">
          {description}
        </p>
      )}
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
};
