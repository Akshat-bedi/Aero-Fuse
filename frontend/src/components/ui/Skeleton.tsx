import React from 'react';
import { cn } from '@/lib/utils';

export interface SkeletonProps {
  className?: string;
  variant?: 'text' | 'rectangular' | 'circular' | 'card';
  lines?: number;
}

export const Skeleton: React.FC<SkeletonProps> = ({
  className,
  variant = 'rectangular',
  lines = 1,
}) => {
  const baseClasses =
    'animate-pulse bg-command-raised border border-command-border/40';

  if (variant === 'text') {
    return (
      <div className="flex flex-col gap-2 w-full">
        {Array.from({ length: lines }).map((_, idx) => (
          <div
            key={idx}
            className={cn(
              baseClasses,
              'h-3.5 rounded-[1px]',
              idx === lines - 1 && lines > 1 ? 'w-3/4' : 'w-full',
              className,
            )}
          />
        ))}
      </div>
    );
  }

  if (variant === 'circular') {
    return (
      <div
        className={cn(baseClasses, 'w-8 h-8 rounded-[1px] flex-shrink-0', className)}
      />
    );
  }

  if (variant === 'card') {
    return (
      <div
        className={cn(
          baseClasses,
          'p-4 rounded-[1px] space-y-3 w-full',
          className,
        )}
      >
        <div className="h-4 bg-command-border/70 rounded-[1px] w-1/3" />
        <div className="h-3 bg-command-border/50 rounded-[1px] w-full" />
        <div className="h-3 bg-command-border/50 rounded-[1px] w-4/5" />
      </div>
    );
  }

  return (
    <div
      className={cn(baseClasses, 'h-9 w-full rounded-[1px]', className)}
    />
  );
};

export const TableSkeleton: React.FC<{ rows?: number; columns?: number }> = ({
  rows = 6,
  columns = 5,
}) => {
  return (
    <div className="w-full flex flex-col border border-command-border rounded-[2px] bg-command-panel overflow-hidden">
      <div className="h-9 bg-command-raised border-b border-command-border flex items-center px-3 gap-3">
        {Array.from({ length: columns }).map((_, i) => (
          <Skeleton key={i} className="h-4 flex-1" />
        ))}
      </div>
      <div className="divide-y divide-command-border/30">
        {Array.from({ length: rows }).map((_, rIdx) => (
          <div key={rIdx} className="h-10 flex items-center px-3 gap-3">
            {Array.from({ length: columns }).map((_, cIdx) => (
              <Skeleton key={cIdx} className="h-3.5 flex-1" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
};

export const CardSkeleton: React.FC<{ count?: number }> = ({ count = 3 }) => {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="p-3 bg-command-panel border border-command-border rounded-[2px] flex flex-col gap-2.5"
        >
          <div className="flex items-center justify-between">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-4 w-12" />
          </div>
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-3/4" />
          <div className="flex items-center gap-2 pt-2 border-t border-command-border/50">
            <Skeleton className="h-6 w-16" />
            <Skeleton className="h-6 w-16" />
          </div>
        </div>
      ))}
    </div>
  );
};

export const RouteLoadingFallback: React.FC<{ moduleName?: string }> = ({
  moduleName = 'MODULE',
}) => {
  return (
    <div className="h-full w-full flex items-center justify-center bg-command-bg font-mono select-none">
      <div className="p-4 bg-command-panel border border-command-primary rounded-[2px] flex items-center gap-3 shadow-none">
        <span className="w-2.5 h-2.5 rounded-[1px] bg-command-primary animate-pulse" />
        <div className="flex flex-col">
          <span className="text-xs font-bold uppercase text-command-heading tracking-wider">
            LOADING // {moduleName}
          </span>
          <span className="text-[10px] text-command-muted uppercase">
            SYNCHRONIZING TACTICAL DATASTORES...
          </span>
        </div>
      </div>
    </div>
  );
};
