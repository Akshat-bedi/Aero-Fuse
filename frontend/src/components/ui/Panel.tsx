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
    raised: 'bg-command-raised border-command-border shadow-panel',
    ghost: 'bg-transparent border-command-border-subtle',
  };

  return (
    <section
      className={cn(
        'rounded-md border flex flex-col transition-all duration-150',
        variantStyles[variant],
        className,
      )}
    >
      {/* Panel Header */}
      <div
        className={cn(
          'flex items-center justify-between px-3.5 py-2.5 border-b border-command-border/60 select-none min-h-[42px]',
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
        <div className="flex items-center gap-2.5 min-w-0">
          {collapsible && (
            <span className="text-command-muted hover:text-command-primary transition-colors">
              {isCollapsed ? (
                <ChevronRight className="w-4 h-4" aria-hidden="true" />
              ) : (
                <ChevronDown className="w-4 h-4" aria-hidden="true" />
              )}
            </span>
          )}

          <div className="flex flex-col min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-command-heading truncate">
                {title}
              </h3>
              {badge}
            </div>
            {subtitle && (
              <span className="text-[10px] text-command-muted truncate">
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
            !noPadding && 'p-3.5',
          )}
        >
          {children}
        </div>
      )}
    </section>
  );
};
