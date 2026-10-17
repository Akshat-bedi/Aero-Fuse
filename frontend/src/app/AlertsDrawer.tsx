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
} from 'lucide-react';
import { useOpsStore } from '@/store';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/utils';

export const AlertsDrawer: React.FC = () => {
  const { isAlertsDrawerOpen, toggleAlertsDrawer, alerts, acknowledgeAlert, dismissAlert } =
    useOpsStore();

  if (!isAlertsDrawerOpen) return null;

  const severityIcons = {
    critical: <AlertOctagon className="w-4 h-4 text-command-critical flex-shrink-0" />,
    warning: <AlertTriangle className="w-4 h-4 text-command-warning flex-shrink-0" />,
    info: <Info className="w-4 h-4 text-command-primary flex-shrink-0" />,
  };

  const severityStyles = {
    critical: 'border-l-command-critical bg-red-950/20',
    warning: 'border-l-command-warning bg-amber-950/20',
    info: 'border-l-command-primary bg-cyan-950/20',
  };

  const handleAcknowledgeAll = () => {
    alerts.forEach((a) => {
      if (!a.acknowledged) acknowledgeAlert(a.id);
    });
  };

  return (
    <aside
      className="w-80 sm:w-96 bg-command-panel border-l border-command-border flex flex-col h-full z-20 flex-shrink-0 animate-in slide-in-from-right duration-200 select-none shadow-2xl"
      aria-label="Operational Alerts Drawer"
    >
      {/* Drawer Header */}
      <div className="p-3 border-b border-command-border/80 bg-command-raised flex items-center justify-between">
        <div className="flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-command-warning" />
          <h3 className="text-xs font-bold uppercase tracking-wider text-command-heading">
            Live Tactical Alerts
          </h3>
          <span className="text-[10px] font-mono font-bold px-1.5 py-0.2 rounded bg-command-border text-command-text">
            {alerts.length}
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          {alerts.some((a) => !a.acknowledged) && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleAcknowledgeAll}
              className="text-[10px] h-6 px-2"
            >
              Ack All
            </Button>
          )}
          <button
            type="button"
            onClick={() => toggleAlertsDrawer(false)}
            className="p-1 text-command-muted hover:text-command-heading rounded hover:bg-command-raised transition-colors"
            aria-label="Close alerts drawer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Alerts Feed */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
        {alerts.length === 0 ? (
          <div className="flex flex-col items-center justify-center text-center p-8 text-command-muted space-y-2">
            <CheckCircle className="w-8 h-8 text-command-nominal/70 mb-1" />
            <span className="text-xs font-semibold uppercase tracking-wider text-command-heading">
              All Clear
            </span>
            <p className="text-[11px] max-w-xs text-command-subdued">
              No active operational anomalies or threshold violations detected.
            </p>
          </div>
        ) : (
          alerts.map((alert) => (
            <div
              key={alert.id}
              className={cn(
                'p-3 rounded border border-command-border border-l-4 transition-all duration-150 flex flex-col gap-2',
                severityStyles[alert.severity],
                alert.acknowledged && 'opacity-65 bg-command-panel/50',
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  {severityIcons[alert.severity]}
                  <span className="text-[10px] font-mono font-bold uppercase px-1.5 py-0.2 bg-command-bg rounded border border-command-border text-command-text">
                    {alert.category}
                  </span>
                </div>
                <div className="flex items-center gap-1 text-[10px] font-mono text-command-muted">
                  <Clock className="w-3 h-3 text-command-subdued" />
                  <span>{alert.timestamp}</span>
                </div>
              </div>

              <div>
                <h4 className="text-xs font-semibold text-command-heading leading-tight uppercase">
                  {alert.title}
                </h4>
                <p className="text-[11px] text-command-text/80 mt-1 leading-snug font-sans">
                  {alert.details}
                </p>
              </div>

              {alert.location && (
                <div className="flex items-center gap-1 text-[10px] text-command-muted font-mono">
                  <MapPin className="w-3 h-3 text-command-primary flex-shrink-0" />
                  <span className="truncate">{alert.location}</span>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex items-center justify-between pt-1 border-t border-command-border/40 mt-1">
                <span className="text-[9px] font-mono uppercase text-command-subdued">
                  {alert.acknowledged ? 'STATUS: ACKNOWLEDGED' : 'ACTION REQUIRED'}
                </span>

                <div className="flex items-center gap-1.5">
                  {!alert.acknowledged ? (
                    <button
                      type="button"
                      onClick={() => acknowledgeAlert(alert.id)}
                      className="px-2 py-0.5 rounded text-[10px] font-mono uppercase font-semibold bg-command-raised text-command-primary hover:bg-command-raised-hover border border-command-border transition-colors"
                    >
                      Acknowledge
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => dismissAlert(alert.id)}
                      className="p-1 rounded text-command-muted hover:text-command-critical hover:bg-command-raised transition-colors"
                      title="Dismiss alert"
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
