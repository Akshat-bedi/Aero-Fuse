import React from 'react';
import { cn } from '@/lib/utils';

export interface KeyValueProps {
  label: string;
  value: React.ReactNode;
  isMono?: boolean;
  statusColor?: 'nominal' | 'warning' | 'critical' | 'info' | 'default';
  icon?: React.ReactNode;
  className?: string;
  copyable?: boolean;
}

export const KeyValue: React.FC<KeyValueProps> = ({
  label,
  value,
  isMono = true,
  statusColor = 'default',
  icon,
  className,
  copyable = false,
}) => {
  const colorClasses = {
    default: 'text-command-heading',
    nominal: 'text-command-nominal font-bold',
    warning: 'text-command-warning font-bold',
    critical: 'text-command-critical font-bold',
    info: 'text-command-primary font-bold',
  };

  const handleCopy = () => {
    if (copyable && typeof value === 'string') {
      navigator.clipboard.writeText(value);
    }
  };

  return (
    <div
      className={cn(
        'flex items-center justify-between py-1 px-2 border-b border-command-border text-xs hover:bg-command-raised/50 font-mono',
        copyable && 'cursor-pointer',
        className,
      )}
      onClick={handleCopy}
      title={copyable ? 'Click to copy' : undefined}
    >
      <div className="flex items-center gap-1.5 text-command-muted uppercase text-[10px] tracking-wider">
        {icon}
        <span>{label}</span>
      </div>
      <div
        className={cn(
          'text-right font-medium text-xs tabular-nums',
          isMono && 'font-mono',
          colorClasses[statusColor],
        )}
      >
        {value}
      </div>
    </div>
  );
};

export const KeyValueList: React.FC<{
  children: React.ReactNode;
  className?: string;
}> = ({ children, className }) => {
  return (
    <div
      className={cn(
        'divide-y divide-command-border border border-command-border rounded-[1px] bg-command-bg',
        className,
      )}
    >
      {children}
    </div>
  );
};
