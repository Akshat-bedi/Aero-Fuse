import React, { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface PanelProps {
  title: React.ReactNode;
  subtitle?: string;
  badge?: React.ReactNode;
  actions?: React.ReactNode;
  collapsible?: boolean;
  defaultCollapsed?: boolean;
  isCollapsed?: boolean;
  onToggleCollapse?: (collapsed: boolean) => void;
  variant?: 'panel' | 'raised' | 'ghost';
  noPadding?: boolean;
  className?: string;
  headerClassName?: string;
  children: React.ReactNode;
}

export const Panel: React.FC<PanelProps> = ({
  title,
  subtitle,
  badge,
  actions,
  collapsible = false,
  defaultCollapsed = false,
  isCollapsed: controlledCollapsed,
  onToggleCollapse,
  variant = 'panel',
  noPadding = false,
  className,
  headerClassName,
  children,
}) => {
  const [internalCollapsed, setInternalCollapsed] = useState(defaultCollapsed);

  const isCollapsed =
    controlledCollapsed !== undefined ? controlledCollapsed : internalCollapsed;

  const handleToggle = () => {
    if (!collapsible) return;
    const next = !isCollapsed;
    setInternalCollapsed(next);
    onToggleCollapse?.(next);
  };

  const variantStyles = {
    panel: 'bg-command-panel border-command-border',
    raised: 'bg-command-raised border-command-border',
    ghost: 'bg-transparent border-command-border-subtle',
  };

  return (
    <section
      className={cn(
        'rounded-[2px] border flex flex-col',
        variantStyles[variant],
        className,
      )}
    >
      {/* Panel Header */}
      <div
        className={cn(
          'flex items-center justify-between px-2.5 py-1.5 border-b border-command-border select-none min-h-[32px] bg-command-panel/80',
          collapsible && 'cursor-pointer hover:bg-command-raised-hover/40',
          headerClassName,
        )}
        onClick={collapsible ? handleToggle : undefined}
        role={collapsible ? 'button' : undefined}
        tabIndex={collapsible ? 0 : undefined}
        onKeyDown={(e) => {
          if (collapsible && (e.key === 'Enter' || e.key === ' ')) {
            e.preventDefault();
            handleToggle();
          }
        }}
        aria-expanded={collapsible ? !isCollapsed : undefined}
      >
        <div className="flex items-center gap-2 min-w-0">
          {collapsible && (
            <span className="text-command-muted hover:text-command-primary">
              {isCollapsed ? (
                <ChevronRight className="w-3.5 h-3.5" aria-hidden="true" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5" aria-hidden="true" />
              )}
            </span>
          )}

          <div className="flex flex-col min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="text-xs font-mono font-semibold uppercase tracking-wider text-command-heading truncate">
                {title}
              </h3>
              {badge}
            </div>
            {subtitle && (
              <span className="text-[9px] font-mono text-command-muted truncate tracking-tight">
                {subtitle}
              </span>
            )}
          </div>
        </div>

        {actions && (
          <div
            className="flex items-center gap-1.5 ml-2"
            onClick={(e) => e.stopPropagation()}
          >
            {actions}
          </div>
        )}
      </div>

      {/* Panel Body */}
      {!isCollapsed && (
        <div
          className={cn(
            'flex-1 min-h-0 overflow-auto',
            !noPadding && 'p-2.5',
          )}
        >
          {children}
        </div>
      )}
    </section>
  );
};
