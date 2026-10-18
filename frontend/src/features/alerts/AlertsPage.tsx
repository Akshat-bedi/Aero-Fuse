import React, { useState, useMemo } from 'react';
import {
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
  Search,
  CheckCheck,
} from 'lucide-react';
import { useAlertsStore } from '@/store/alertsStore';
import { Stat, Button } from '@/components/ui';
import { cn, formatTimeZulu } from '@/lib/utils';
import { AlertSeverity, AlertType } from '@/types';

export const AlertsPage: React.FC = () => {
  const {
    alerts,
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

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'unack' | 'ack'>('all');

  const unackCount = useMemo(() => alerts.filter((a) => !a.acknowledged).length, [alerts]);
  const criticalCount = useMemo(
    () => alerts.filter((a) => a.severity === 'critical' && !a.acknowledged).length,
    [alerts],
  );
  const warningCount = useMemo(
    () => alerts.filter((a) => a.severity === 'warning' && !a.acknowledged).length,
    [alerts],
  );

  const filteredAlerts = useMemo(() => {
    return alerts.filter((alert) => {
      if (selectedSeverityFilter !== 'all' && alert.severity !== selectedSeverityFilter) return false;
      if (selectedTypeFilter !== 'all' && alert.type !== selectedTypeFilter) return false;
      if (statusFilter === 'unack' && alert.acknowledged) return false;
      if (statusFilter === 'ack' && !alert.acknowledged) return false;

      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const matchesId = alert.id.toLowerCase().includes(query);
        const matchesTitle = alert.title.toLowerCase().includes(query);
        const matchesMsg = (alert.message || alert.details || '').toLowerCase().includes(query);
        const matchesLoc = (alert.location || '').toLowerCase().includes(query);
        return matchesId || matchesTitle || matchesMsg || matchesLoc;
      }
      return true;
    });
  }, [alerts, selectedSeverityFilter, selectedTypeFilter, statusFilter, searchQuery]);

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

  return (
    <div className="flex-1 min-h-0 flex flex-col overflow-y-auto bg-command-bg font-sans">
      {/* 1. Header Bar */}
      <div className="p-4 sm:p-5 pb-3 border-b border-command-border/80 bg-command-panel/50 space-y-3">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 font-mono text-[10px] text-command-muted uppercase">
              <span className="px-1.5 py-0.5 rounded-[1px] bg-command-bg border border-command-border text-command-primary font-bold">
                ALT-SYS-09
              </span>
              <span>TACTICAL ANOMALY & INCIDENT FEED</span>
              <span>•</span>
              <span className="text-command-primary font-bold">OPERATIONAL MONITORING</span>
            </div>
            <h1 className="text-xl sm:text-2xl font-bold text-command-heading tracking-wide mt-1">
              Operational Alerts Console
            </h1>
            <p className="text-xs text-command-muted font-sans mt-0.5 max-w-2xl">
              Consolidated real-time operational alerts derived from threat radars, aircraft serviceability telemetry, meteorological updates, airspace conflicts, and prediction models.
            </p>
          </div>

          <div className="flex items-center gap-2 font-mono text-xs">
            <button
              type="button"
              onClick={toggleAudioMute}
              className={cn(
                'px-3 py-1.5 rounded-[1px] border flex items-center gap-1.5 transition-none',
                isAudioMuted
                  ? 'bg-command-bg border-command-border text-command-muted hover:text-command-text'
                  : 'bg-command-raised border-command-primary text-command-primary font-bold',
              )}
            >
              {isAudioMuted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
              <span>{isAudioMuted ? 'AUDIO MUTED' : 'AUDIO ACTIVE'}</span>
            </button>

            {unackCount > 0 && (
              <Button
                variant="primary"
                size="sm"
                onClick={acknowledgeAll}
                className="flex items-center gap-1.5 text-xs h-8"
              >
                <CheckCheck className="w-3.5 h-3.5" />
                <span>Acknowledge All ({unackCount})</span>
              </Button>
            )}
          </div>
        </div>

        {/* 2. Operational Metrics Tiles */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1">
          <Stat
            label="Total Logged Alerts"
            value={alerts.length.toString()}
            unit="records"
            trend={`${alerts.length} total active telemetry feeds`}
          />
          <Stat
            label="Unacknowledged"
            value={unackCount.toString()}
            unit="unack"
            trend={unackCount > 0 ? `${unackCount} requires commander review` : 'All clear'}
          />
          <Stat
            label="Critical Threats & Conflicts"
            value={criticalCount.toString()}
            unit="urgent"
            trend={criticalCount > 0 ? 'High priority operational breach' : 'Zero active critical'}
          />
          <Stat
            label="Warning / Readiness"
            value={warningCount.toString()}
            unit="advisory"
            trend="Monitored within safety margins"
          />
        </div>
      </div>

      {/* 3. Controls & Filter Bar */}
      <div className="p-4 sm:p-5 pb-3 bg-command-bg border-b border-command-border space-y-2.5 font-mono text-xs">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          {/* Search Box */}
          <div className="relative flex-1 max-w-md">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-command-muted" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Filter alerts by ID, title, keyword or location..."
              className="w-full pl-8 pr-3 py-1.5 bg-command-panel border border-command-border rounded-[1px] text-command-text placeholder-command-subdued text-xs focus:outline-none focus:border-command-primary transition-none"
            />
          </div>

          {/* Filter Dropdowns and Segments */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Severity Filter */}
            <div className="flex items-center gap-1">
              <span className="text-[10px] uppercase text-command-muted">SEV:</span>
              <div className="flex items-center border border-command-border rounded-[1px] bg-command-panel p-0.5">
                {(['all', 'critical', 'warning', 'info'] as const).map((sev) => (
                  <button
                    key={sev}
                    type="button"
                    onClick={() => setSeverityFilter(sev)}
                    className={cn(
                      'px-2 py-0.5 text-[10px] uppercase font-mono rounded-[1px] transition-none',
                      selectedSeverityFilter === sev
                        ? 'bg-command-bg border border-command-primary text-command-primary font-bold'
                        : 'text-command-muted hover:text-command-text',
                    )}
                  >
                    {sev}
                  </button>
                ))}
              </div>
            </div>

            {/* Type Filter */}
            <div className="flex items-center gap-1">
              <span className="text-[10px] uppercase text-command-muted">TYPE:</span>
              <select
                value={selectedTypeFilter}
                onChange={(e) => setTypeFilter(e.target.value as AlertType | 'all')}
                className="bg-command-panel border border-command-border px-2 py-1 rounded-[1px] text-[10px] text-command-text focus:outline-none focus:border-command-primary font-mono uppercase"
              >
                <option value="all">ALL TYPES</option>
                <option value="threat">THREAT</option>
                <option value="readiness">READINESS</option>
                <option value="weather">WEATHER</option>
                <option value="crew">CREW</option>
                <option value="conflict">CONFLICT</option>
                <option value="prediction">PREDICTION</option>
                <option value="data-quality">DATA QUALITY</option>
              </select>
            </div>

            {/* Status Filter */}
            <div className="flex items-center gap-1">
              <span className="text-[10px] uppercase text-command-muted">STATUS:</span>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as 'all' | 'unack' | 'ack')}
                className="bg-command-panel border border-command-border px-2 py-1 rounded-[1px] text-[10px] text-command-text focus:outline-none focus:border-command-primary font-mono uppercase"
              >
                <option value="all">ALL STATUSES</option>
                <option value="unack">UNACKNOWLEDGED ONLY</option>
                <option value="ack">ACKNOWLEDGED ONLY</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* 4. Alerts Feed List */}
      <div className="p-4 sm:p-5 flex-1 min-h-0 space-y-2 font-mono text-xs">
        {filteredAlerts.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-12 bg-command-panel border border-command-border rounded-[2px] text-center space-y-2">
            <CheckCircle className="w-8 h-8 text-command-nominal/70 mb-1" />
            <h3 className="text-sm font-bold uppercase tracking-wider text-command-heading">
              No Alerts Matching Criteria
            </h3>
            <p className="text-xs text-command-subdued max-w-sm font-sans">
              All tactical channels clear. No operational anomalies or safety breaches match active filters.
            </p>
          </div>
        ) : (
          filteredAlerts.map((alert) => (
            <div
              key={alert.id}
              className={cn(
                'p-3 rounded-[1px] border border-command-border border-l-4 flex flex-col md:flex-row md:items-center justify-between gap-3 transition-none',
                severityStyles[alert.severity],
                alert.acknowledged && 'opacity-65 bg-command-panel/40',
              )}
            >
              {/* Alert Left Details */}
              <div className="space-y-1 min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  {severityIcons[alert.severity]}
                  <span className="font-bold text-command-primary text-xs">{alert.id}</span>
                  <span className="flex items-center gap-1 px-1.5 py-0.5 rounded-[1px] bg-command-bg border border-command-border text-[10px] uppercase text-command-text font-bold">
                    {typeIcons[alert.type]}
                    <span>{alert.type}</span>
                  </span>
                  <span className="text-[10px] text-command-muted flex items-center gap-1">
                    <Clock className="w-3 h-3 text-command-subdued" />
                    <span>{formatTimeZulu(alert.timestamp)}</span>
                  </span>
                  {alert.location && (
                    <span className="text-[10px] text-command-muted flex items-center gap-1">
                      <MapPin className="w-3 h-3 text-command-primary" />
                      <span>{alert.location}</span>
                    </span>
                  )}
                </div>

                <h3 className="text-sm font-bold text-command-heading uppercase tracking-wide">
                  {alert.title}
                </h3>
                <p className="text-xs text-command-text/80 font-sans leading-relaxed">
                  {alert.message || alert.details}
                </p>
              </div>

              {/* Alert Right Actions */}
              <div className="flex items-center gap-2 shrink-0 md:border-l md:border-command-border/40 md:pl-4">
                {!alert.acknowledged ? (
                  <button
                    type="button"
                    onClick={() => acknowledgeAlert(alert.id)}
                    className="px-3 py-1.5 rounded-[1px] bg-command-bg border border-command-border text-command-primary hover:border-command-primary font-bold text-xs uppercase transition-none"
                  >
                    Acknowledge
                  </button>
                ) : (
                  <span className="px-2 py-1 rounded-[1px] bg-command-bg/50 border border-command-border/40 text-[10px] uppercase text-command-subdued">
                    ACKNOWLEDGED
                  </span>
                )}

                <button
                  type="button"
                  onClick={() => dismissAlert(alert.id)}
                  className="p-1.5 rounded-[1px] text-command-muted hover:text-command-critical hover:bg-command-panel transition-none"
                  title="Dismiss alert"
                  aria-label="Dismiss alert"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
