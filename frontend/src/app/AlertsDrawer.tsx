import React from 'react';
import {
  X,
  AlertTriangle,
  AlertOctagon,
  Info,
  CheckCircle,
  MapPin,
  Clock,
  Trash2,
  Volume2,
  VolumeX,
  ShieldAlert,
  Flame,
  CloudRain,
  UserX,
  Zap,
  Activity,
  Database,
} from 'lucide-react';
import { useAlertsStore } from '@/store/alertsStore';
import { Button } from '@/components/ui/Button';
import { Tooltip } from '@/components/ui/Tooltip';
import { cn, formatTimeZulu } from '@/lib/utils';
import { AlertSeverity, AlertType } from '@/types';

export const AlertsDrawer: React.FC = () => {
  const {
    alerts,
    isDrawerOpen,
    toggleDrawer,
    selectedSeverityFilter,
    selectedTypeFilter,
    setSeverityFilter,
    setTypeFilter,
    acknowledgeAlert,
    acknowledgeAll,
    dismissAlert,
    isAudioMuted,
    toggleAudioMute,
  } = useAlertsStore();

  if (!isDrawerOpen) return null;

  const severityIcons: Record<AlertSeverity, React.ReactNode> = {
    critical: <AlertOctagon className="w-4 h-4 text-command-critical shrink-0" />,
    warning: <AlertTriangle className="w-4 h-4 text-command-warning shrink-0" />,
    info: <Info className="w-4 h-4 text-command-primary shrink-0" />,
  };

  const severityStyles: Record<AlertSeverity, string> = {
    critical: 'border-l-command-critical bg-command-critical-bg/20',
    warning: 'border-l-command-warning bg-command-warning-bg/20',
    info: 'border-l-command-primary bg-command-raised/40',
  };

  const typeIcons: Record<AlertType, React.ReactNode> = {
    threat: <ShieldAlert className="w-3.5 h-3.5 text-command-critical" />,
    readiness: <Flame className="w-3.5 h-3.5 text-command-warning" />,
    weather: <CloudRain className="w-3.5 h-3.5 text-command-text" />,
    crew: <UserX className="w-3.5 h-3.5 text-command-warning" />,
    conflict: <Zap className="w-3.5 h-3.5 text-command-critical" />,
    prediction: <Activity className="w-3.5 h-3.5 text-command-primary" />,
    'data-quality': <Database className="w-3.5 h-3.5 text-command-warning" />,
  };

  // Filter alerts by selected severity and type
  const filteredAlerts = alerts.filter((a) => {
    if (selectedSeverityFilter !== 'all' && a.severity !== selectedSeverityFilter) return false;
    if (selectedTypeFilter !== 'all' && a.type !== selectedTypeFilter) return false;
    return true;
  });

  const unackCount = alerts.filter((a) => !a.acknowledged).length;

  return (
    <aside
      className="w-80 sm:w-96 bg-command-panel border-l border-command-border flex flex-col h-full z-30 shrink-0 select-none font-mono text-xs"
      aria-label="Operational Alerts Drawer"
    >
      {/* 1. Drawer Header */}
      <div className="p-3 border-b border-command-border bg-command-raised flex items-center justify-between">
        <div className="flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-command-warning" />
          <h3 className="text-xs font-bold uppercase tracking-wider text-command-heading">
            Tactical Alerts
          </h3>
          <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded-[1px] bg-command-bg border border-command-border text-command-text">
            {unackCount > 0 ? `${unackCount} UNACK` : `${alerts.length} TOTAL`}
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          {/* Audio Chime Mute Toggle */}
          <Tooltip content={isAudioMuted ? 'Alert Chime Muted (Click to Unmute)' : 'Alert Chime Active (Click to Mute)'}>
            <button
              type="button"
              onClick={toggleAudioMute}
              className={cn(
                'p-1 rounded-[1px] border transition-none',
                isAudioMuted
                  ? 'bg-command-bg border-command-border text-command-muted hover:text-command-heading'
                  : 'bg-command-bg border-command-primary text-command-primary',
              )}
              aria-label={isAudioMuted ? 'Unmute alert audio' : 'Mute alert audio'}
            >
              {isAudioMuted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
            </button>
          </Tooltip>

          {unackCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={acknowledgeAll}
              className="text-[10px] h-6 px-2 border border-command-border hover:border-command-primary"
            >
              Ack All
            </Button>
          )}

          <button
            type="button"
            onClick={() => toggleDrawer(false)}
            className="p-1 text-command-muted hover:text-command-heading rounded-[1px] hover:bg-command-raised transition-colors"
            aria-label="Close alerts drawer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* 2. Tactical Filter Controls */}
      <div className="p-2.5 bg-command-bg border-b border-command-border space-y-2">
        {/* Severity Filter Tabs */}
        <div className="flex items-center gap-1">
          <span className="text-[9px] uppercase font-bold text-command-subdued w-12 shrink-0">
            SEV:
          </span>
          <div className="flex items-center gap-1 flex-1">
            {(['all', 'critical', 'warning', 'info'] as const).map((sev) => (
              <button
                key={sev}
                type="button"
                onClick={() => setSeverityFilter(sev)}
                className={cn(
                  'flex-1 py-0.5 px-1 text-[10px] uppercase font-mono rounded-[1px] border text-center transition-none',
                  selectedSeverityFilter === sev
                    ? 'border-command-primary bg-command-raised text-command-primary font-bold'
                    : 'border-command-border bg-command-panel text-command-muted hover:text-command-text',
                )}
              >
                {sev}
              </button>
            ))}
          </div>
        </div>

        {/* Type Filter Dropdown */}
        <div className="flex items-center gap-1">
          <span className="text-[9px] uppercase font-bold text-command-subdued w-12 shrink-0">
            TYPE:
          </span>
          <select
            value={selectedTypeFilter}
            onChange={(e) => setTypeFilter(e.target.value as AlertType | 'all')}
            className="flex-1 bg-command-panel border border-command-border px-1.5 py-0.5 rounded-[1px] text-[10px] text-command-text focus:outline-none focus:border-command-primary font-mono uppercase"
            aria-label="Filter alerts by type"
          >
            <option value="all">ALL TYPES ({alerts.length})</option>
            <option value="threat">THREAT</option>
            <option value="readiness">READINESS</option>
            <option value="weather">WEATHER</option>
            <option value="crew">CREW</option>
            <option value="conflict">CONFLICT</option>
            <option value="prediction">PREDICTION</option>
            <option value="data-quality">DATA QUALITY</option>
          </select>
        </div>
      </div>

      {/* 3. Alerts Feed */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {filteredAlerts.length === 0 ? (
          <div className="flex flex-col items-center justify-center text-center p-8 text-command-muted space-y-2">
            <CheckCircle className="w-8 h-8 text-command-nominal/70 mb-1" />
            <span className="text-xs font-semibold uppercase tracking-wider text-command-heading">
              No Matching Alerts
            </span>
            <p className="text-[11px] max-w-xs text-command-subdued font-sans">
              No operational anomalies or threshold violations match active filter criteria.
            </p>
          </div>
        ) : (
          filteredAlerts.map((alert) => (
            <div
              key={alert.id}
              className={cn(
                'p-2.5 rounded-[1px] border border-command-border border-l-[3px] flex flex-col gap-1.5 transition-none',
                severityStyles[alert.severity],
                alert.acknowledged && 'opacity-60 bg-command-panel/40',
              )}
            >
              {/* Card Meta Row */}
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  {severityIcons[alert.severity]}
                  <span className="flex items-center gap-1 text-[9px] font-bold uppercase px-1 py-0.2 bg-command-bg rounded-[1px] border border-command-border text-command-text">
                    {typeIcons[alert.type]}
                    <span>{alert.type}</span>
                  </span>
                  <span className="font-bold text-[10px] text-command-primary">{alert.id}</span>
                </div>
                <div className="flex items-center gap-1 text-[9px] text-command-muted">
                  <Clock className="w-2.5 h-2.5 text-command-subdued" />
                  <span>{formatTimeZulu(alert.timestamp)}</span>
                </div>
              </div>

              {/* Title & Description */}
              <div>
                <h4 className="text-xs font-semibold text-command-heading leading-tight uppercase">
                  {alert.title}
                </h4>
                <p className="text-[11px] text-command-text/80 mt-1 leading-snug font-sans">
                  {alert.message || alert.details}
                </p>
              </div>

              {alert.location && (
                <div className="flex items-center gap-1 text-[10px] text-command-muted">
                  <MapPin className="w-3 h-3 text-command-primary shrink-0" />
                  <span className="truncate">{alert.location}</span>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex items-center justify-between pt-1 border-t border-command-border/40 mt-0.5">
                <span className="text-[9px] uppercase text-command-subdued">
                  {alert.acknowledged ? 'STATUS: ACKNOWLEDGED' : 'ACTION REQUIRED'}
                </span>

                <div className="flex items-center gap-1.5">
                  {!alert.acknowledged ? (
                    <button
                      type="button"
                      onClick={() => acknowledgeAlert(alert.id)}
                      className="px-2 py-0.5 rounded-[1px] text-[10px] uppercase font-semibold bg-command-bg text-command-primary hover:border-command-primary border border-command-border transition-none"
                    >
                      Acknowledge
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => dismissAlert(alert.id)}
                      className="p-1 rounded-[1px] text-command-muted hover:text-command-critical hover:bg-command-raised transition-none"
                      title="Dismiss alert"
                      aria-label="Dismiss alert"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </aside>
  );
};
