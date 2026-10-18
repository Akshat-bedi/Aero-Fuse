import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Radio,
  Moon,
  Sun,
  Bell,
  User,
  Clock,
  AlertTriangle,
  RotateCcw,
  Tv,
  HelpCircle,
  X,
} from 'lucide-react';
import { useUiStore } from '@/store/uiStore';
import { useAlertsStore } from '@/store/alertsStore';
import { useDemoStore } from '@/store/demoStore';
import { serviceConfig } from '@/services/config';
import { Tooltip } from '@/components/ui/Tooltip';
import { cn } from '@/lib/utils';

export interface TopBarProps {
  onOpenShortcutsHelp?: () => void;
}

export const TopBar: React.FC<TopBarProps> = ({ onOpenShortcutsHelp }) => {
  const navigate = useNavigate();
  const isNightMode = useUiStore((state) => state.isNightMode);
  const toggleNightMode = useUiStore((state) => state.toggleNightMode);
  const connectionStatus = useUiStore((state) => state.connectionStatus);
  const staleAgeSec = useUiStore((state) => state.staleAgeSec);

  const alerts = useAlertsStore((state) => state.alerts);
  const isAlertsDrawerOpen = useAlertsStore((state) => state.isDrawerOpen);
  const toggleAlertsDrawer = useAlertsStore((state) => state.toggleDrawer);

  const {
    isActive: isDemoActive,
    startDemo,
    stopDemo,
    resetToInitialState,
  } = useDemoStore();

  const [showLiveResetConfirm, setShowLiveResetConfirm] = useState(false);

  const handleDemoToggle = () => {
    if (isDemoActive) {
      stopDemo();
    } else {
      startDemo(navigate);
    }
  };

  const handleResetClick = () => {
    if (!serviceConfig.isMock) {
      setShowLiveResetConfirm(true);
    } else {
      resetToInitialState(navigate);
    }
  };

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

  const normStatus = (connectionStatus || 'OFFLINE').toUpperCase();
  const isLive = normStatus === 'LIVE';
  const isMock = normStatus === 'MOCK';
  const isReconnecting = normStatus === 'RECONNECTING';
  const isStale = normStatus === 'STALE';
  const isOffline = normStatus === 'OFFLINE' || normStatus === 'DISCONNECTED';

  return (
    <div className="flex flex-col flex-shrink-0 z-30 select-none">
      {/* 1. Full-width tactical classification strip */}
      <div className="w-full bg-[#241f11] border-b border-[#473b18] text-[#d9a521] py-0.5 px-3 flex items-center justify-center font-mono text-[10px] font-bold tracking-[0.2em] uppercase">
        <span>EXERCISE // SIMULATED DATA // NOT REAL OPERATIONS</span>
      </div>

      {/* 2. Persistent Stale Telemetry Warning Banner (Never present as live!) */}
      {isStale && (
        <div className="w-full bg-command-warning-bg/40 border-b border-amber-600/70 text-command-warning py-1 px-3 flex items-center justify-between font-mono text-[10px] font-bold tracking-wider">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-3.5 h-3.5 text-command-warning shrink-0" />
            <span>
              TELEMETRY STALE // NO TELEMETRY RECEIVED FOR {staleAgeSec}s // DISPLAYING LAST KNOWN SNAPSHOT (AGE: {staleAgeSec}s) — NEVER PRESENT AS LIVE
            </span>
          </div>
          <span className="px-1.5 py-0.2 rounded-[1px] bg-command-bg border border-amber-600/60 uppercase">
            STALE ({staleAgeSec}s)
          </span>
        </div>
      )}

      {/* 3. Main Header Bar */}
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

          {/* Connection Status Flat Cell: reflects LIVE, MOCK, RECONNECTING, STALE, OFFLINE */}
          <Tooltip
            content={
              isLive
                ? 'Connected to Live Ops Backend Telemetry'
                : isMock
                ? 'Running on Internal Mock Operations Engine'
                : isReconnecting
                ? 'Attempting reconnection to backend with backoff'
                : isStale
                ? `Telemetry feed silent for ${staleAgeSec}s. Displaying last known snapshot.`
                : 'Disconnected from telemetry feeds'
            }
          >
            <div
              className={cn(
                'flex items-center gap-1.5 px-2 py-0.5 rounded-[2px] border text-[10px] font-bold uppercase cursor-default',
                isLive && 'bg-command-bg text-command-nominal border-command-nominal-border',
                isMock && 'bg-command-bg text-command-primary border-command-border',
                isReconnecting && 'bg-command-bg text-command-warning border-command-warning-border',
                isStale && 'bg-command-warning-bg/40 text-command-warning border-amber-600',
                isOffline && 'bg-command-bg text-command-critical border-command-critical-border',
              )}
            >
              <span
                className={cn(
                  'w-1.5 h-1.5 rounded-[1px]',
                  isLive && 'bg-command-nominal',
                  isMock && 'bg-command-primary',
                  isReconnecting && 'bg-command-warning animate-pulse',
                  isStale && 'bg-amber-500',
                  isOffline && 'bg-command-critical',
                )}
              />
              <span className="hidden sm:inline">
                {isLive
                  ? 'LIVE'
                  : isMock
                  ? 'MOCK'
                  : isReconnecting
                  ? 'RECONNECTING'
                  : isStale
                  ? `STALE (${staleAgeSec}s)`
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

          {/* Reset Baseline Action */}
          <Tooltip content="Reset All State to Nominal Clean Baseline (Zero Conflicts)">
            <button
              type="button"
              onClick={handleResetClick}
              className="p-1 rounded-[2px] border border-command-border bg-command-bg text-command-muted hover:text-command-warning hover:border-command-warning hover:bg-command-raised transition-none flex items-center justify-center"
              aria-label="Reset to initial state"
            >
              <RotateCcw className="w-3.5 h-3.5 text-command-warning" />
            </button>
          </Tooltip>

          {/* Demo Mode Toggle */}
          <Tooltip content={isDemoActive ? 'Exit Guided Demo Walkthrough' : 'Start Guided Demo Walkthrough (3-Min Scripted Story)'}>
            <button
              type="button"
              onClick={handleDemoToggle}
              className={cn(
                'px-2 py-0.5 rounded-[2px] border font-bold text-[10px] tracking-wider transition-none flex items-center gap-1.5',
                isDemoActive
                  ? 'bg-command-primary/20 border-command-primary text-command-primary animate-pulse'
                  : 'bg-command-bg border-command-border text-command-muted hover:text-command-heading hover:bg-command-raised',
              )}
              aria-label="Toggle Guided Demo Mode"
            >
              <Tv className="w-3.5 h-3.5" />
              <span>{isDemoActive ? 'DEMO ACTIVE' : 'DEMO'}</span>
            </button>
          </Tooltip>

          {/* Keyboard Shortcuts Reference */}
          {onOpenShortcutsHelp && (
            <Tooltip content="Tactical Keyboard Shortcuts Reference (?)">
              <button
                type="button"
                onClick={onOpenShortcutsHelp}
                className="p-1 rounded-[2px] border border-command-border bg-command-bg text-command-muted hover:text-command-primary hover:border-command-primary hover:bg-command-raised transition-none flex items-center justify-center"
                aria-label="Open Keyboard Shortcuts Reference (?)"
              >
                <HelpCircle className="w-3.5 h-3.5" />
              </button>
            </Tooltip>
          )}

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
                'relative p-1 rounded-[2px] border transition-none flex items-center gap-1.5',
                isAlertsDrawerOpen
                  ? 'bg-command-raised border-command-primary text-command-primary'
                  : hasCriticalAlerts
                  ? 'bg-command-bg border-command-critical text-command-critical'
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

      {/* Live Reset Confirmation Dialog */}
      {showLiveResetConfirm && (
        <div
          className="fixed inset-0 z-[60] bg-black/80 flex items-center justify-center p-4 font-mono select-none"
          role="dialog"
          aria-modal="true"
          aria-labelledby="topbar-live-reset-title"
        >
          <div className="w-full max-w-md bg-command-panel border border-command-warning p-4 rounded-[2px] flex flex-col gap-3">
            <div className="flex items-center justify-between border-b border-command-border pb-2">
              <h3 id="topbar-live-reset-title" className="text-xs font-bold uppercase text-command-warning tracking-wider flex items-center gap-2">
                <RotateCcw className="w-4 h-4 text-command-warning" />
                Confirm Live System Reset
              </h3>
              <button
                type="button"
                onClick={() => setShowLiveResetConfirm(false)}
                className="text-command-muted hover:text-command-heading"
                aria-label="Cancel Reset"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-command-text leading-relaxed">
              WARNING: The system is currently operating against a <strong>LIVE</strong> telemetry backend.
              Executing reset will dispatch <code>POST /sim/control</code> with action <code>'reset'</code>,
              restoring the server state to the baseline and terminating active contingency scripts.
            </p>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-command-border">
              <button
                type="button"
                onClick={() => setShowLiveResetConfirm(false)}
                className="px-3 py-1 text-xs border border-command-border text-command-text hover:bg-command-raised rounded-[2px]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={async () => {
                  setShowLiveResetConfirm(false);
                  await resetToInitialState(navigate);
                }}
                className="px-3 py-1 text-xs bg-command-critical border border-command-critical text-white font-bold hover:bg-red-700 rounded-[2px]"
              >
                Confirm Live Reset
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
