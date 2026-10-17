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
    styles: 'bg-red-950/80 text-red-300 border-red-600/70 shadow-[0_0_8px_rgba(239,68,68,0.3)]',
    icon: Flame,
  },
  P2: {
    code: 'P2',
    description: 'HIGH',
    styles: 'bg-amber-950/80 text-amber-300 border-amber-600/70',
    icon: AlertTriangle,
  },
  P3: {
    code: 'P3',
    description: 'ROUTINE',
    styles: 'bg-blue-950/80 text-blue-300 border-blue-600/70',
    icon: Clock,
  },
  P4: {
    code: 'P4',
    description: 'LOW',
    styles: 'bg-slate-900/80 text-slate-300 border-slate-700/70',
    icon: ArrowDown,
  },
};

export const PriorityTag: React.FC<PriorityTagProps> = ({
  priority,
  showDescription = true,
  size = 'md',
  className,
}) => {
  // Normalize priority string e.g. "P1_CRITICAL" -> "P1"
  const normalized = priority.toUpperCase().startsWith('P')
    ? priority.substring(0, 2)
    : 'P3';

  const config = PRIORITY_CONFIG[normalized] || PRIORITY_CONFIG.P3;
  const Icon = config.icon;

  const sizeClasses =
    size === 'sm'
      ? 'text-[10px] px-1.5 py-0.5 gap-1 font-mono'
      : 'text-xs px-2.5 py-1 gap-1.5 font-mono';

  const iconSizes = size === 'sm' ? 'w-3 h-3' : 'w-3.5 h-3.5';

  return (
    <span
      className={cn(
        'inline-flex items-center font-bold rounded border uppercase select-none tracking-wider',
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
          <span className="opacity-40">|</span>
          <span className="text-[10px] tracking-normal font-sans font-medium">
            {config.description}
          </span>
        </>
      )}
    </span>
  );
};
