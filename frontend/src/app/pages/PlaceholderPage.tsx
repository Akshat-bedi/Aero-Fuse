import React from 'react';
import { Panel } from '@/components/ui/Panel';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Button } from '@/components/ui/Button';
import { KeyValue, KeyValueList } from '@/components/ui/KeyValue';
import { Stat } from '@/components/ui/Stat';
import { Activity, ShieldCheck, Database, ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';

export interface PlaceholderPageProps {
  title: string;
  code: string;
  description: string;
  category: string;
  stats?: { label: string; value: string; unit?: string; trend?: string }[];
  plannedFeatures: string[];
}

export const PlaceholderPage: React.FC<PlaceholderPageProps> = ({
  title,
  code,
  description,
  category,
  stats,
  plannedFeatures,
}) => {
  return (
    <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-command-border/70 gap-2">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-bold uppercase tracking-wider text-command-heading">
              {title}
            </h1>
            <span className="px-2 py-0.5 rounded font-mono text-[10px] bg-command-raised border border-command-border text-command-primary font-bold">
              {code}
            </span>
            <StatusBadge status="info" label="MODULE READY (STAGE 0/1)" size="sm" />
          </div>
          <p className="text-xs text-command-muted font-sans mt-0.5 max-w-2xl">
            {description}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link to="/dev/components">
            <Button variant="secondary" size="sm" icon={<Activity className="w-3.5 h-3.5 text-command-primary" />}>
              Component Gallery
            </Button>
          </Link>
        </div>
      </div>

      {/* Metrics Row */}
      {stats && stats.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {stats.map((s, idx) => (
            <Stat
              key={idx}
              label={s.label}
              value={s.value}
              unit={s.unit}
              status="info"
              subtitle={s.trend || 'Simulated baseline telemetry'}
            />
          ))}
        </div>
      )}

      {/* Content Panels */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Panel
          title="Module Operational Status"
          subtitle="System architectural telemetry"
          variant="raised"
          className="lg:col-span-2"
        >
          <div className="space-y-4">
            <div className="p-3 bg-command-bg rounded border border-command-border flex items-start gap-3">
              <ShieldCheck className="w-5 h-5 text-command-nominal flex-shrink-0 mt-0.5" />
              <div>
                <h4 className="text-xs font-bold uppercase text-command-heading">
                  Architecture & Schema Verified
                </h4>
                <p className="text-xs text-command-muted mt-0.5 leading-relaxed">
                  Data contracts in <code className="text-command-primary">src/types</code>, service layer abstractions in <code className="text-command-primary">src/services</code>, and mock telemetry engine are connected and operational.
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-command-muted">
                Planned Stage Deliverables
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {plannedFeatures.map((feat, i) => (
                  <div
                    key={i}
                    className="p-2.5 rounded bg-command-bg/50 border border-command-border/60 flex items-center gap-2 text-xs text-command-text"
                  >
                    <ArrowRight className="w-3.5 h-3.5 text-command-primary flex-shrink-0" />
                    <span>{feat}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Panel>

        <Panel
          title="Operational Envelope"
          subtitle="Air Force DSS Domain Context"
          variant="panel"
        >
          <KeyValueList>
            <KeyValue label="Domain Category" value={category} />
            <KeyValue label="Data Mode" value="SIMULATED / MOCK" statusColor="warning" />
            <KeyValue label="Autonomy Constraint" value="COMMANDER-IN-THE-LOOP" statusColor="nominal" />
            <KeyValue label="Network Protocol" value="OFFLINE-FIRST (AIR-GAP)" statusColor="info" />
            <KeyValue label="Order of Battle" value="FICTIONAL ASSETS ONLY" statusColor="default" />
          </KeyValueList>

          <div className="mt-4 p-2.5 rounded bg-command-primary-dim border border-command-primary/30 text-[11px] text-cyan-200">
            <div className="flex items-center gap-1.5 font-bold uppercase mb-1">
              <Database className="w-3.5 h-3.5" />
              <span>Safety Rule Reminder</span>
            </div>
            This module provides decision support and trade-off evaluation. All asset retasking requires human commander confirmation before execution.
          </div>
        </Panel>
      </div>
    </div>
  );
};
