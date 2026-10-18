import React from 'react';
import { cn } from '@/lib/utils';
import { OperationalStatus } from '@/types';

export interface ProgressBarProps {
  value: number; // 0 to 100
  max?: number;
  label?: string;
  sublabel?: string;
  showValue?: boolean;
  unit?: string;
  status?: OperationalStatus;
  autoStatusThresholds?: boolean; // if true, <=20 is critical, <=40 is warning, else nominal
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export const ProgressBar: React.FC<ProgressBarProps> = ({
  value,
  max = 100,
  label,
  sublabel,
  showValue = true,
  unit = '%',
  status,
  autoStatusThresholds = true,
  size = 'md',
  className,
}) => {
  const percentage = Math.min(100, Math.max(0, (value / max) * 100));

  let derivedStatus: OperationalStatus = status || 'nominal';
  if (!status && autoStatusThresholds) {
    if (percentage <= 20) derivedStatus = 'critical';
    else if (percentage <= 45) derivedStatus = 'warning';
    else derivedStatus = 'nominal';
  }

  const fillStyles: Record<OperationalStatus, string> = {
    nominal: 'bg-command-nominal',
    warning: 'bg-command-warning',
    critical: 'bg-command-critical',
    info: 'bg-command-primary',
    inactive: 'bg-command-subdued',
    unknown: 'bg-slate-500',
  };

  const textStyles: Record<OperationalStatus, string> = {
    nominal: 'text-command-nominal',
    warning: 'text-command-warning',
    critical: 'text-command-critical',
    info: 'text-command-primary',
    inactive: 'text-command-muted',
    unknown: 'text-slate-400',
  };

  const heightStyles = {
    sm: 'h-1.5',
    md: 'h-2.5',
    lg: 'h-4',
  };

  return (
    <div className={cn('w-full flex flex-col gap-1', className)}>
      {(label || showValue) && (
        <div className="flex items-center justify-between text-xs font-mono select-none">
          <div className="flex items-center gap-1.5">
            {label && (
              <span className="text-command-text uppercase font-semibold text-[11px] tracking-wider">
                {label}
              </span>
            )}
            {sublabel && (
              <span className="text-command-subdued text-[10px]">
                ({sublabel})
              </span>
            )}
          </div>
          {showValue && (
            <span className={cn('font-bold', textStyles[derivedStatus])}>
              {Math.round(percentage)}
              {unit}
            </span>
          )}
        </div>
      )}

      {/* Bar container */}
      <div
        className={cn(
          'w-full bg-command-bg border border-command-border rounded-[1px] overflow-hidden p-[1px]',
          heightStyles[size],
        )}
      >
        <div
          className={cn(
            'h-full rounded-[1px] transition-none',
            fillStyles[derivedStatus],
          )}
          style={{ width: `${percentage}%` }}
          role="progressbar"
          aria-valuenow={value}
          aria-valuemin={0}
          aria-valuemax={max}
        />
      </div>
    </div>
  );
};
