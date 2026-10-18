import React, { useState } from 'react';
import { NavLink } from 'react-router-dom';
import {
  Compass,
  PlaneTakeoff,
  Boxes,
  Target,
  Sliders,
  AlertTriangle,
  ClipboardList,
  Component,
  Database,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Tooltip } from '@/components/ui/Tooltip';
import { useOpsStore } from '@/store';

interface NavItem {
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: string | number;
  badgeVariant?: 'critical' | 'warning' | 'primary';
}

export const NavRail: React.FC = () => {
  const [isExpanded, setIsExpanded] = useState(true);
  const alerts = useOpsStore((state) => state.alerts);

  const unackAlerts = alerts.filter((a) => !a.acknowledged).length;

  const NAV_ITEMS: NavItem[] = [
    {
      to: '/',
      label: 'Common Picture',
      icon: Compass,
    },
    {
      to: '/missions',
      label: 'Missions',
      icon: PlaneTakeoff,
    },
    {
      to: '/resources',
      label: 'Resources',
      icon: Boxes,
    },
    {
      to: '/recommendations',
      label: 'Recommendations',
      icon: Target,
    },
    {
      to: '/scenarios',
      label: 'Scenarios',
      icon: Sliders,
    },
    {
      to: '/alerts',
      label: 'Alerts',
      icon: AlertTriangle,
      badge: unackAlerts > 0 ? unackAlerts : undefined,
      badgeVariant: 'warning',
    },
    {
      to: '/audit-log',
      label: 'Audit Log',
      icon: ClipboardList,
    },
  ];

  return (
    <nav
      className={cn(
        'bg-command-panel border-r border-command-border flex flex-col justify-between select-none z-20 flex-shrink-0 transition-all duration-200',
        isExpanded ? 'w-56' : 'w-12',
      )}
      aria-label="Tactical Navigation Rail"
    >
      {/* Navigation Links */}
      <div className="flex flex-col py-1.5 gap-0.5">
        <div className="px-3 py-1 text-[9px] font-mono uppercase tracking-[0.15em] text-command-subdued">
          {isExpanded ? 'MODULE NAVIGATION' : 'NAV'}
        </div>

        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;

          const content = (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-2.5 px-3 py-2 text-xs font-mono uppercase tracking-wider transition-colors relative group',
                  isActive
                    ? 'border-l-[3px] border-l-command-primary bg-command-raised text-command-heading font-semibold'
                    : 'border-l-[3px] border-l-transparent text-command-muted hover:text-command-heading hover:bg-command-raised/50',
                )
              }
            >
              {({ isActive }) => (
                <>
                  <Icon
                    className={cn(
                      'w-4 h-4 flex-shrink-0 transition-colors',
                      isActive ? 'text-command-primary' : 'text-command-muted group-hover:text-command-heading',
                    )}
                  />
                  {isExpanded && <span className="truncate">{item.label}</span>}

                  {item.badge !== undefined && (
                    <span
                      className={cn(
                        'ml-auto font-mono text-[9px] font-bold px-1.5 py-0.2 rounded-[1px] border',
                        !isExpanded && 'absolute top-1 right-1 px-1 py-0 text-[8px]',
                        item.badgeVariant === 'primary' &&
                          'bg-command-bg text-command-primary border-command-border',
                        item.badgeVariant === 'warning' &&
                          'bg-command-bg text-command-warning border-command-warning-border',
                        item.badgeVariant === 'critical' &&
                          'bg-command-bg text-command-critical border-command-critical-border',
                      )}
                    >
                      {item.badge}
                    </span>
                  )}
                </>
              )}
            </NavLink>
          );

          if (!isExpanded) {
            return (
              <Tooltip key={item.to} content={item.label} position="right">
                {content}
              </Tooltip>
            );
          }

          return content;
        })}
      </div>

      {/* Bottom Section: Component Gallery & Collapse Toggle */}
      <div className="p-1 border-t border-command-border flex flex-col gap-1 bg-command-bg">
        <NavLink
          to="/dev/components"
          className={({ isActive }) =>
            cn(
              'flex items-center gap-2 px-2 py-1 text-xs uppercase font-mono tracking-wider transition-none border',
              isActive
                ? 'bg-command-raised border-command-primary text-command-primary font-semibold'
                : 'border-command-border/60 text-command-muted hover:text-command-text hover:bg-command-raised/50',
            )
          }
        >
          {({ isActive }) => {
            const linkContent = (
              <>
                <Component
                  className={cn(
                    'w-3.5 h-3.5 flex-shrink-0',
                    isActive ? 'text-command-primary' : 'text-command-muted',
                  )}
                />
                {isExpanded && (
                  <div className="flex flex-col min-w-0 leading-tight">
                    <span className="truncate text-[10px]">Component Gallery</span>
                    <span className="text-[8px] font-mono text-command-subdued">/dev/components</span>
                  </div>
                )}
              </>
            );

            if (!isExpanded) {
              return (
                <Tooltip content="Component Gallery (/dev/components)" position="right">
                  <div className="flex items-center justify-center w-full">{linkContent}</div>
                </Tooltip>
              );
            }

            return linkContent;
          }}
        </NavLink>

        <NavLink
          to="/dev/data"
          className={({ isActive }) =>
            cn(
              'flex items-center gap-2 px-2 py-1 text-xs uppercase font-mono tracking-wider transition-none border',
              isActive
                ? 'bg-command-raised border-command-primary text-command-primary font-semibold'
                : 'border-command-border/60 text-command-muted hover:text-command-text hover:bg-command-raised/50',
            )
          }
        >
          {({ isActive }) => {
            const linkContent = (
              <>
                <Database
                  className={cn(
                    'w-3.5 h-3.5 flex-shrink-0',
                    isActive ? 'text-command-primary' : 'text-command-muted',
                  )}
                />
                {isExpanded && (
                  <div className="flex flex-col min-w-0 leading-tight">
                    <span className="truncate text-[10px]">Data Engine & Stores</span>
                    <span className="text-[8px] font-mono text-command-subdued">/dev/data</span>
                  </div>
                )}
              </>
            );

            if (!isExpanded) {
              return (
                <Tooltip content="Data Engine & Stores (/dev/data)" position="right">
                  <div className="flex items-center justify-center w-full">{linkContent}</div>
                </Tooltip>
              );
            }

            return linkContent;
          }}
        </NavLink>

        {/* Expand / Collapse Button */}
        <button
          type="button"
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex items-center justify-center py-1 px-2 border border-command-border/60 text-[10px] font-mono text-command-muted hover:text-command-heading hover:bg-command-raised transition-none uppercase gap-1.5"
          aria-label={isExpanded ? 'Collapse Navigation Rail' : 'Expand Navigation Rail'}
        >
          {isExpanded ? (
            <>
              <ChevronLeft className="w-3.5 h-3.5" />
              <span>Collapse Rail</span>
            </>
          ) : (
            <ChevronRight className="w-3.5 h-3.5" />
          )}
        </button>
      </div>
    </nav>
  );
};
