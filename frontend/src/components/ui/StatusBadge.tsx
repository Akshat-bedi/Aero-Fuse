import React from 'react';
import {
  CheckCircle2,
  AlertTriangle,
  AlertOctagon,
  Clock,
  CircleSlash,
  HelpCircle,
} from 'lucide-react';
import { OperationalStatus } from '@/types';
import { cn } from '@/lib/utils';

export interface StatusBadgeProps {
  status: OperationalStatus;
  label?: string;
  size?: 'sm' | 'md';
  pulse?: boolean;
  className?: string;
  showIcon?: boolean;
}

const STATUS_CONFIG: Record<
  OperationalStatus,
  {
    defaultLabel: string;
    icon: React.ComponentType<{ className?: string }>;
    styles: string;
    iconColor: string;
  }
> = {
  nominal: {
    defaultLabel: 'NOMINAL / SERVICEABLE',
    icon: CheckCircle2,
    styles:
      'bg-command-nominal-bg text-command-nominal border-command-nominal-border',
    iconColor: 'text-command-nominal',
  },
  warning: {
    defaultLabel: 'CAUTION / DEGRADED',
    icon: AlertTriangle,
    styles:
      'bg-command-warning-bg text-command-warning border-command-warning-border',
    iconColor: 'text-command-warning',
  },
  critical: {
    defaultLabel: 'CRITICAL / ALERT',
    icon: AlertOctagon,
    styles:
      'bg-command-critical-bg text-command-critical border-command-critical-border',
    iconColor: 'text-command-critical',
  },
  info: {
    defaultLabel: 'PENDING / INFO',
    icon: Clock,
    styles: 'bg-command-info-bg text-command-info border-command-info-border',
    iconColor: 'text-command-info',
  },
  inactive: {
    defaultLabel: 'INACTIVE',
    icon: CircleSlash,
    styles:
      'bg-command-inactive-bg text-command-inactive border-command-inactive-border',
    iconColor: 'text-command-inactive',
  },
  unknown: {
    defaultLabel: 'UNKNOWN / UNVERIFIED',
    icon: HelpCircle,
    styles: 'bg-slate-800/60 text-slate-400 border-slate-700',
    iconColor: 'text-slate-400',
  },
};

export const StatusBadge: React.FC<StatusBadgeProps> = ({
  status,
  label,
  size = 'md',
  pulse = false,
  className,
  showIcon = true,
}) => {
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.unknown;
  const Icon = config.icon;
  const displayText = label || config.defaultLabel;

  const sizeClasses =
    size === 'sm'
      ? 'text-[10px] px-1.5 py-0.5 gap-1 font-mono tracking-tight'
      : 'text-xs px-2.5 py-1 gap-1.5 font-mono tracking-wide';

  const iconSizes = size === 'sm' ? 'w-3 h-3' : 'w-3.5 h-3.5';

  return (
    <span
      className={cn(
        'inline-flex items-center font-medium rounded border uppercase select-none transition-colors',
        config.styles,
        sizeClasses,
        pulse && 'animate-pulse',
        className,
      )}
      role="status"
    >
      {showIcon && (
        <Icon className={cn(iconSizes, config.iconColor, 'flex-shrink-0')} aria-hidden="true" />
      )}
      <span className="truncate">{displayText}</span>
    </span>
  );
};
