import React from 'react';
import { ArrowUpRight, ArrowDownRight, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { OperationalStatus } from '@/types';

export interface StatProps {
  label: string;
  value: React.ReactNode;
  unit?: string;
  trend?: {
    direction: 'up' | 'down' | 'neutral';
    value: string;
    isPositive?: boolean; // depending on whether 'up' is good or bad
  };
  status?: OperationalStatus;
  icon?: React.ReactNode;
  subtitle?: string;
  className?: string;
}

export const Stat: React.FC<StatProps> = ({
  label,
  value,
  unit,
  trend,
  status,
  icon,
  subtitle,
  className,
}) => {
  const statusBorder = {
    nominal: 'border-l-command-nominal',
    warning: 'border-l-command-warning',
    critical: 'border-l-command-critical',
    info: 'border-l-command-primary',
    inactive: 'border-l-command-inactive',
    unknown: 'border-l-command-border',
  };

  return (
    <div
      className={cn(
        'p-3.5 bg-command-panel border border-command-border rounded-md shadow-sm select-none flex flex-col justify-between transition-colors',
        status && cn('border-l-4', statusBorder[status]),
        className,
      )}
    >
      <div className="flex items-center justify-between text-command-muted text-[11px] font-semibold uppercase tracking-wider mb-2">
        <span>{label}</span>
        {icon && <span className="text-command-subdued">{icon}</span>}
      </div>

      <div className="flex items-baseline gap-1.5 my-0.5">
        <span className="text-2xl font-bold font-mono text-command-heading tracking-tight">
          {value}
        </span>
        {unit && (
          <span className="text-xs font-mono text-command-muted font-normal">
            {unit}
          </span>
        )}
      </div>

      {(trend || subtitle) && (
        <div className="flex items-center justify-between text-[11px] mt-2 pt-1.5 border-t border-command-border/40 font-mono">
          {trend ? (
            <div
              className={cn(
                'inline-flex items-center gap-1 font-medium',
                trend.direction === 'neutral'
                  ? 'text-command-muted'
                  : trend.isPositive ?? trend.direction === 'up'
                  ? 'text-command-nominal'
                  : 'text-command-critical',
              )}
            >
              {trend.direction === 'up' && (
                <ArrowUpRight className="w-3.5 h-3.5 flex-shrink-0" />
              )}
              {trend.direction === 'down' && (
                <ArrowDownRight className="w-3.5 h-3.5 flex-shrink-0" />
              )}
              {trend.direction === 'neutral' && (
                <Minus className="w-3.5 h-3.5 flex-shrink-0" />
              )}
              <span>{trend.value}</span>
            </div>
          ) : (
            <span />
          )}

          {subtitle && (
            <span className="text-command-muted text-[10px] font-sans truncate">
              {subtitle}
            </span>
          )}
        </div>
      )}
    </div>
  );
};
