import React from 'react';
import { cn } from '@/lib/utils';

export interface TabItem {
  id: string;
  label: React.ReactNode;
  icon?: React.ReactNode;
  badge?: React.ReactNode | number | string;
  disabled?: boolean;
}

export interface TabsProps {
  tabs: TabItem[];
  activeTab: string;
  onChange: (id: string) => void;
  variant?: 'underline' | 'pills' | 'segmented';
  size?: 'sm' | 'md';
  className?: string;
}

export const Tabs: React.FC<TabsProps> = ({
  tabs,
  activeTab,
  onChange,
  variant = 'underline',
  size = 'md',
  className,
}) => {
  const sizeClasses = {
    sm: 'text-xs py-1.5 px-3 gap-1.5',
    md: 'text-xs py-2 px-4 gap-2',
  };

  if (variant === 'segmented') {
    return (
      <div
        className={cn(
          'inline-flex p-0.5 bg-command-bg border border-command-border rounded-[2px] select-none',
          className,
        )}
        role="tablist"
      >
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              role="tab"
              aria-selected={isActive}
              disabled={tab.disabled}
              onClick={() => onChange(tab.id)}
              className={cn(
                'inline-flex items-center justify-center font-mono font-medium uppercase tracking-wider rounded-[1px] transition-none border',
                sizeClasses[size],
                isActive
                  ? 'bg-command-raised border-command-primary text-command-primary font-semibold'
                  : 'border-transparent text-command-muted hover:text-command-text hover:bg-command-panel/40',
                tab.disabled && 'opacity-40 cursor-not-allowed',
              )}
            >
              {tab.icon}
              <span>{tab.label}</span>
              {tab.badge !== undefined && (
                <span
                  className={cn(
                    'ml-1 text-[9px] px-1 py-0.2 rounded-[1px] font-mono border',
                    isActive
                      ? 'bg-command-primary/10 border-command-primary/30 text-command-primary'
                      : 'bg-command-panel border-command-border text-command-muted',
                  )}
                >
                  {tab.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div
      className={cn(
        'flex items-center border-b border-command-border select-none overflow-x-auto',
        className,
      )}
      role="tablist"
    >
      {tabs.map((tab) => {
        const isActive = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            role="tab"
            aria-selected={isActive}
            disabled={tab.disabled}
            onClick={() => onChange(tab.id)}
            className={cn(
              'inline-flex items-center justify-center font-mono font-semibold uppercase tracking-wider transition-none border-b-2 -mb-[2px] whitespace-nowrap focus-visible:outline-none focus-visible:text-command-primary',
              sizeClasses[size],
              isActive
                ? 'border-command-primary text-command-primary bg-command-raised/30'
                : 'border-transparent text-command-muted hover:text-command-text hover:border-command-border-strong',
              tab.disabled && 'opacity-40 cursor-not-allowed pointer-events-none',
            )}
          >
            {tab.icon}
            <span>{tab.label}</span>
            {tab.badge !== undefined && (
              <span
                className={cn(
                  'ml-1.5 text-[9px] px-1 py-0.2 rounded-[1px] font-mono border',
                  isActive
                    ? 'bg-command-primary/10 border-command-primary/30 text-command-primary'
                    : 'bg-command-raised border-command-border text-command-muted',
                )}
              >
                {tab.badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
};
