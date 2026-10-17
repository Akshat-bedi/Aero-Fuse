import React, { useState } from 'react';
import { NavLink } from 'react-router-dom';
import {
  Compass,
  PlaneTakeoff,
  Boxes,
  Sparkles,
  Sliders,
  AlertTriangle,
  ClipboardList,
  Component,
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
      icon: Sparkles,
      badge: 'AI',
      badgeVariant: 'primary',
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
        isExpanded ? 'w-56' : 'w-14',
      )}
      aria-label="Tactical Navigation Rail"
    >
      {/* Navigation Links */}
      <div className="flex flex-col py-2 px-1.5 gap-1">
        <div className="px-2 py-1 text-[10px] font-mono uppercase tracking-wider text-command-subdued">
          {isExpanded ? 'COMMAND NAVIGATION' : 'NAV'}
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
                  'flex items-center gap-2.5 px-2.5 py-2 rounded text-xs uppercase font-medium tracking-wide transition-all duration-150 relative group',
                  isActive
                    ? 'bg-command-raised text-command-primary font-semibold border-l-2 border-command-primary shadow-tactical'
                    : 'text-command-muted hover:text-command-text hover:bg-command-raised/50',
                )
              }
            >
              {({ isActive }) => (
                <>
                  <Icon
                    className={cn(
                      'w-4 h-4 flex-shrink-0 transition-colors',
                      isActive ? 'text-command-primary' : 'text-command-muted group-hover:text-command-text',
                    )}
                  />
                  {isExpanded && <span className="truncate">{item.label}</span>}

                  {item.badge !== undefined && (
                    <span
                      className={cn(
                        'ml-auto font-mono text-[10px] font-bold px-1.5 py-0.2 rounded',
                        !isExpanded && 'absolute top-1 right-1 px-1 py-0 text-[8px]',
                        item.badgeVariant === 'primary' &&
                          'bg-command-primary/20 text-command-primary border border-command-primary/40',
                        item.badgeVariant === 'warning' &&
                          'bg-command-warning/20 text-command-warning border border-command-warning/40',
                        item.badgeVariant === 'critical' &&
                          'bg-command-critical/20 text-command-critical border border-command-critical/40',
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
      <div className="p-1.5 border-t border-command-border/60 flex flex-col gap-1 bg-command-bg/40">
        <NavLink
          to="/dev/components"
          className={({ isActive }) =>
            cn(
              'flex items-center gap-2.5 px-2.5 py-2 rounded text-xs uppercase font-medium tracking-wide transition-all duration-150 group border border-dashed',
              isActive
                ? 'bg-command-raised border-command-primary text-command-primary font-semibold shadow-tactical'
                : 'border-command-border/80 text-command-muted hover:text-command-text hover:bg-command-raised/50',
            )
          }
        >
          {({ isActive }) => {
            const linkContent = (
              <>
                <Component
                  className={cn(
                    'w-4 h-4 flex-shrink-0',
                    isActive ? 'text-command-primary' : 'text-command-muted group-hover:text-command-text',
                  )}
                />
                {isExpanded && (
                  <div className="flex flex-col min-w-0 leading-tight">
                    <span className="truncate">Component Gallery</span>
                    <span className="text-[9px] font-mono text-command-subdued">/dev/components</span>
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

        {/* Expand / Collapse Button */}
        <button
          type="button"
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex items-center justify-center py-1.5 px-2 rounded text-[11px] font-mono text-command-muted hover:text-command-heading hover:bg-command-raised transition-colors uppercase gap-1.5"
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
