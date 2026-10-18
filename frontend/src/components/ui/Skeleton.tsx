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
