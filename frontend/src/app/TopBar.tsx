import React, { useState, useEffect } from 'react';
import {
  ShieldAlert,
  Radio,
  WifiOff,
  Database,
  Moon,
  Sun,
  Bell,
  User,
  Clock,
} from 'lucide-react';
import { useOpsStore } from '@/store';
import { Tooltip } from '@/components/ui/Tooltip';
import { cn } from '@/lib/utils';

export const TopBar: React.FC = () => {
  const {
    isNightMode,
    toggleNightMode,
    isAlertsDrawerOpen,
    toggleAlertsDrawer,
    connectionStatus,
    alerts,
  } = useOpsStore();

  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // Format Local Time HH:MM:SS
  const localTimeStr = currentTime.toLocaleTimeString('en-GB', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  // Format Zulu Time HH:MM:SSZ
  const zuluHours = currentTime.getUTCHours().toString().padStart(2, '0');
  const zuluMins = currentTime.getUTCMinutes().toString().padStart(2, '0');
  const zuluSecs = currentTime.getUTCSeconds().toString().padStart(2, '0');
  const zuluTimeStr = `${zuluHours}:${zuluMins}:${zuluSecs}Z`;

  const unacknowledgedCount = alerts.filter((a) => !a.acknowledged).length;
  const hasCriticalAlerts = alerts.some((a) => a.severity === 'critical' && !a.acknowledged);

  return (
    <header className="h-12 bg-command-panel border-b border-command-border px-3.5 flex items-center justify-between select-none z-30 flex-shrink-0">
      {/* Left: Brand & Insignia */}
      <div className="flex items-center gap-3 min-w-0">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded bg-command-raised border border-command-border-strong flex items-center justify-center text-command-primary shadow-tactical">
            <Radio className="w-4 h-4 animate-pulse" />
          </div>
          <div className="flex flex-col">
            <div className="flex items-center gap-2">
              <span className="font-bold text-sm tracking-wider uppercase text-command-heading">
                AirOps <span className="text-command-primary font-extrabold">DSS</span>
              </span>
              <span className="text-[10px] px-1.5 py-0.2 rounded font-mono font-medium bg-command-raised border border-command-border text-command-muted hidden sm:inline-block">
                v0.1.0
              </span>
            </div>
            <span className="text-[9px] uppercase tracking-widest text-command-subdued hidden md:inline-block font-mono">
              Dynamic Air Operations & Resource Optimisation
            </span>
          </div>
        </div>
      </div>

      {/* Centre: Classification / Exercise Banner */}
      <div className="flex items-center justify-center px-2 min-w-0">
        <div className="px-3 py-1 rounded bg-amber-500/15 border border-amber-500/50 text-amber-300 font-mono text-[11px] font-bold tracking-widest uppercase flex items-center gap-2 shadow-[0_0_12px_rgba(245,158,11,0.2)] animate-pulse">
          <ShieldAlert className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
          <span className="truncate">EXERCISE / SIMULATED DATA</span>
        </div>
      </div>

      {/* Right: Operational Telemetry & Controls */}
      <div className="flex items-center gap-2.5 sm:gap-3.5">
        {/* Dual Live Clocks (Local + Zulu) */}
        <div className="hidden lg:flex items-center gap-2.5 px-2.5 py-1 rounded bg-command-bg border border-command-border font-mono text-xs">
          <Clock className="w-3.5 h-3.5 text-command-primary flex-shrink-0" />
          <div className="flex items-center gap-2">
            <div className="flex items-baseline gap-1">
              <span className="text-[10px] text-command-muted">LOC</span>
              <span className="text-command-heading font-medium">{localTimeStr}</span>
            </div>
            <span className="text-command-border">|</span>
            <div className="flex items-baseline gap-1">
              <span className="text-[10px] text-command-primary font-bold">ZULU</span>
              <span className="text-command-primary font-bold">{zuluTimeStr}</span>
            </div>
          </div>
        </div>

        {/* Connection Status Indicator */}
        <Tooltip
          content={
            connectionStatus === 'live'
              ? 'Connected to Live Ops Backend'
              : connectionStatus === 'mock'
              ? 'Running on Internal Mock Operations Engine'
              : 'Disconnected from telemetry feeds'
          }
        >
          <div
            className={cn(
              'flex items-center gap-1.5 px-2 py-1 rounded border font-mono text-[11px] font-semibold uppercase cursor-default',
              connectionStatus === 'live' &&
                'bg-emerald-950/60 text-emerald-300 border-emerald-600/60',
              connectionStatus === 'mock' &&
                'bg-cyan-950/60 text-cyan-300 border-cyan-600/60',
              connectionStatus === 'disconnected' &&
                'bg-red-950/60 text-red-300 border-red-600/60',
            )}
          >
            {connectionStatus === 'live' && (
              <>
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                <span className="hidden sm:inline">LIVE FEED</span>
              </>
            )}
            {connectionStatus === 'mock' && (
              <>
                <Database className="w-3 h-3 text-cyan-400" />
                <span className="hidden sm:inline">MOCK DATA</span>
              </>
            )}
            {connectionStatus === 'disconnected' && (
              <>
                <WifiOff className="w-3 h-3 text-red-400" />
                <span className="hidden sm:inline">OFFLINE</span>
              </>
            )}
          </div>
        </Tooltip>

        {/* Operator Profile */}
        <div className="hidden xl:flex items-center gap-2 px-2 py-1 rounded bg-command-raised border border-command-border">
          <div className="w-5 h-5 rounded-full bg-command-panel border border-command-border flex items-center justify-center text-command-muted">
            <User className="w-3 h-3" />
          </div>
          <div className="flex flex-col leading-none">
            <span className="text-[11px] font-semibold text-command-heading uppercase">
              COL. J. MERCER
            </span>
            <span className="text-[9px] text-command-muted uppercase font-mono">
              OPS CONTROLLER
            </span>
          </div>
        </div>

        {/* Night Mode Toggle */}
        <Tooltip content={isNightMode ? 'Disable Night Vision Mode' : 'Enable Ops Room Night Vision Mode'}>
          <button
            type="button"
            onClick={toggleNightMode}
            className={cn(
              'p-1.5 rounded border transition-colors',
              isNightMode
                ? 'bg-red-950/80 border-red-500 text-red-300 hover:bg-red-900'
                : 'bg-command-raised border-command-border text-command-muted hover:text-command-heading hover:bg-command-raised-hover',
            )}
            aria-label="Toggle Night Vision Mode"
          >
            {isNightMode ? (
              <Sun className="w-4 h-4 text-red-400 animate-spin" style={{ animationDuration: '10s' }} />
            ) : (
              <Moon className="w-4 h-4 text-command-muted" />
            )}
          </button>
        </Tooltip>

        {/* Alerts Drawer Trigger */}
        <Tooltip content="Toggle Live Operational Alerts Drawer">
          <button
            type="button"
            onClick={() => toggleAlertsDrawer()}
            className={cn(
              'relative p-1.5 rounded border transition-colors flex items-center gap-1.5',
              isAlertsDrawerOpen
                ? 'bg-command-primary/20 border-command-primary text-command-primary'
                : 'bg-command-raised border-command-border text-command-muted hover:text-command-heading hover:bg-command-raised-hover',
            )}
            aria-label="Toggle Alerts Drawer"
            aria-expanded={isAlertsDrawerOpen}
          >
            <Bell className={cn('w-4 h-4', hasCriticalAlerts && 'animate-bounce text-command-critical')} />
            {unacknowledgedCount > 0 && (
              <span
                className={cn(
                  'px-1.5 py-0.2 rounded-full font-mono text-[10px] font-bold leading-none',
                  hasCriticalAlerts
                    ? 'bg-command-critical text-white'
                    : 'bg-command-warning text-black',
                )}
              >
                {unacknowledgedCount}
              </span>
            )}
          </button>
        </Tooltip>
      </div>
    </header>
  );
};
