import React, { useState, useEffect } from 'react';
import {
  Radio,
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
    <div className="flex flex-col flex-shrink-0 z-30 select-none">
      {/* Full-width tactical classification strip */}
      <div className="w-full bg-[#241f11] border-b border-[#473b18] text-[#d9a521] py-0.5 px-3 flex items-center justify-center font-mono text-[10px] font-bold tracking-[0.2em] uppercase">
        <span>EXERCISE // SIMULATED DATA // NOT REAL OPERATIONS</span>
      </div>

      <header className="h-10 bg-command-panel border-b border-command-border px-3 flex items-center justify-between">
        {/* Left: Brand & Station Callout */}
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-6 h-6 rounded-[2px] bg-command-bg border border-command-border flex items-center justify-center text-command-primary">
            <Radio className="w-3.5 h-3.5" />
          </div>
          <div className="flex items-center gap-2">
            <span className="font-mono font-bold text-xs tracking-wider uppercase text-command-heading">
              AIROPS <span className="text-command-primary">DSS</span>
            </span>
            <span className="text-[9px] px-1 py-0.2 rounded-[1px] font-mono bg-command-bg border border-command-border text-command-muted hidden sm:inline-block">
              v0.1.0
            </span>
            <span className="text-command-border hidden md:inline">|</span>
            <span className="text-[10px] font-mono uppercase tracking-wider text-command-subdued hidden md:inline-block">
              NATIONAL AIR OPS CENTRE · TACTICAL C2
            </span>
          </div>
        </div>

        {/* Right: Flattened Telemetry Cells & Controls */}
        <div className="flex items-center gap-2 font-mono text-xs">
          {/* Dual Live Clocks (Local + Zulu) in flat bordered cell */}
          <div className="hidden lg:flex items-center gap-2 px-2 py-0.5 rounded-[2px] bg-command-bg border border-command-border text-[11px]">
            <Clock className="w-3 h-3 text-command-muted flex-shrink-0" />
            <div className="flex items-center gap-2 tabular-nums">
              <div className="flex items-baseline gap-1">
                <span className="text-[9px] text-command-muted">LOC</span>
                <span className="text-command-text">{localTimeStr}</span>
              </div>
              <span className="text-command-border">|</span>
              <div className="flex items-baseline gap-1">
                <span className="text-[9px] text-command-primary font-bold">ZULU</span>
                <span className="text-command-primary font-bold">{zuluTimeStr}</span>
              </div>
            </div>
          </div>

          {/* Connection Status Flat Cell */}
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
                'flex items-center gap-1.5 px-2 py-0.5 rounded-[2px] border text-[10px] font-bold uppercase cursor-default',
                connectionStatus === 'live' &&
                  'bg-command-bg text-command-nominal border-command-nominal-border',
                connectionStatus === 'mock' &&
                  'bg-command-bg text-command-primary border-command-border',
                connectionStatus === 'disconnected' &&
                  'bg-command-bg text-command-critical border-command-critical-border',
              )}
            >
              <span
                className={cn(
                  'w-1.5 h-1.5 rounded-[1px]',
                  connectionStatus === 'live' && 'bg-command-nominal',
                  connectionStatus === 'mock' && 'bg-command-primary',
                  connectionStatus === 'disconnected' && 'bg-command-critical',
                )}
              />
              <span className="hidden sm:inline">
                {connectionStatus === 'live'
                  ? 'LIVE FEED'
                  : connectionStatus === 'mock'
                  ? 'MOCK DATA'
                  : 'OFFLINE'}
              </span>
            </div>
          </Tooltip>

          {/* Operator Identifier Flat Cell */}
          <div className="hidden xl:flex items-center gap-1.5 px-2 py-0.5 rounded-[2px] bg-command-bg border border-command-border text-[10px]">
            <User className="w-3 h-3 text-command-muted" />
            <span className="font-semibold text-command-heading uppercase">COL. J. MERCER</span>
            <span className="text-command-border">/</span>
            <span className="text-command-muted uppercase">OPS CONTROLLER</span>
          </div>

          {/* Night Mode Toggle */}
          <Tooltip content={isNightMode ? 'Disable Night Vision Mode' : 'Enable Ops Room Night Vision Mode'}>
            <button
              type="button"
              onClick={toggleNightMode}
              className={cn(
                'p-1 rounded-[2px] border transition-colors flex items-center justify-center',
                isNightMode
                  ? 'bg-red-950/60 border-red-600 text-red-300'
                  : 'bg-command-bg border-command-border text-command-muted hover:text-command-heading hover:bg-command-raised',
              )}
              aria-label="Toggle Night Vision Mode"
            >
              {isNightMode ? (
                <Sun className="w-3.5 h-3.5 text-red-400" />
              ) : (
                <Moon className="w-3.5 h-3.5 text-command-muted" />
              )}
            </button>
          </Tooltip>

          {/* Alerts Drawer Trigger */}
          <Tooltip content="Toggle Live Operational Alerts Drawer">
            <button
              type="button"
              onClick={() => toggleAlertsDrawer()}
              className={cn(
                'relative p-1 rounded-[2px] border transition-colors flex items-center gap-1.5',
                isAlertsDrawerOpen
                  ? 'bg-command-raised border-command-primary text-command-primary'
                  : hasCriticalAlerts
                  ? 'bg-command-bg border-command-critical text-command-critical animate-[pulse_3s_ease-in-out_infinite] motion-reduce:animate-none'
                  : 'bg-command-bg border-command-border text-command-muted hover:text-command-heading hover:bg-command-raised',
              )}
              aria-label="Toggle Alerts Drawer"
              aria-expanded={isAlertsDrawerOpen}
            >
              <Bell className="w-3.5 h-3.5" />
              {unacknowledgedCount > 0 && (
                <span
                  className={cn(
                    'px-1 py-0 rounded-[1px] font-mono text-[9px] font-bold leading-none',
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
    </div>
  );
};
