import React from 'react';
import { Flame, AlertTriangle, Clock, ArrowDown } from 'lucide-react';
import { PriorityLevel } from '@/types';
import { cn } from '@/lib/utils';

export interface PriorityTagProps {
  priority: PriorityLevel | string;
  showDescription?: boolean;
  size?: 'sm' | 'md';
  className?: string;
}

const PRIORITY_CONFIG: Record<
  string,
  {
    code: string;
    description: string;
    styles: string;
    icon: React.ComponentType<{ className?: string }>;
  }
> = {
  P1: {
    code: 'P1',
    description: 'CRITICAL',
    styles: 'bg-command-critical-bg text-command-critical border-command-critical-border',
    icon: Flame,
  },
  P2: {
    code: 'P2',
    description: 'HIGH',
    styles: 'bg-command-warning-bg text-command-warning border-command-warning-border',
    icon: AlertTriangle,
  },
  P3: {
    code: 'P3',
    description: 'ROUTINE',
    styles: 'bg-command-info-bg text-command-info border-command-info-border',
    icon: Clock,
  },
  P4: {
    code: 'P4',
    description: 'LOW',
    styles: 'bg-command-inactive-bg text-command-inactive border-command-inactive-border',
    icon: ArrowDown,
  },
};

export const PriorityTag: React.FC<PriorityTagProps> = ({
  priority,
  showDescription = true,
  size = 'md',
  className,
}) => {
  // Normalize priority string e.g. 1 -> "P1", "P1_CRITICAL" -> "P1"
  const raw = String(priority).toUpperCase();
  const normalized = raw.startsWith('P') ? raw.substring(0, 2) : `P${raw}`;

  const config = PRIORITY_CONFIG[normalized] || PRIORITY_CONFIG.P3;
  const Icon = config.icon;

  const sizeClasses =
    size === 'sm'
      ? 'text-[10px] px-1.5 py-0.2 gap-1 font-mono'
      : 'text-xs px-2 py-0.5 gap-1.5 font-mono';

  const iconSizes = size === 'sm' ? 'w-3 h-3' : 'w-3.5 h-3.5';

  return (
    <span
      className={cn(
        'inline-flex items-center font-bold font-mono rounded-[1px] border uppercase select-none tracking-wider',
        config.styles,
        sizeClasses,
        className,
      )}
      title={`Priority Level ${config.code}: ${config.description}`}
    >
      <Icon className={cn(iconSizes, 'flex-shrink-0')} aria-hidden="true" />
      <span>{config.code}</span>
      {showDescription && (
        <>
          <span className="opacity-40 font-mono">/</span>
          <span className="text-[10px] tracking-normal font-mono font-medium">
            {config.description}
          </span>
        </>
      )}
    </span>
  );
};
