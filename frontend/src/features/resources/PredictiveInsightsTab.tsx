import React, { useState, useMemo } from 'react';
import { Prediction } from '@/types';
import { PredictionFilterState } from './types';
import { Stat, ProgressBar } from '@/components/ui';
import {
  Activity,
  Clock,
  Plane,
  Users,
  Building,
  CloudRain,
  ArrowRight,
  ShieldAlert,
  ArrowUpDown,
} from 'lucide-react';
import { formatTimeZulu } from '@/lib/utils';

interface PredictiveInsightsTabProps {
  predictions: Prediction[];
}

export const PredictiveInsightsTab: React.FC<PredictiveInsightsTabProps> = ({
  predictions,
}) => {
  const [filters, setFilters] = useState<PredictionFilterState>({
    urgency: 'all',
    entityType: 'all',
    search: '',
  });

  const [sortBy, setSortBy] = useState<'urgency' | 'confidence'>('urgency');

  // Classification & Proactive Recommendations Mapping
  const getProactiveAdvice = (pred: Prediction): string => {
    switch (pred.entityType) {
      case 'aircraft':
        return 'Initiate proactive diagnostic inspection. Alert maintenance crew at home base to stage replacement components before scheduled flight.';
      case 'crew':
        return 'Recommend mandatory 8-hour crew rest window. Stand down aircrew from subsequent tasking orders to prevent high-G fatigue violations.';
      case 'base':
        return 'Authorise priority fuel/munitions resupply airlift or activate emergency local reserves to sustain uninterrupted operations.';
      case 'weather':
        return 'Re-route inbound sorties to secondary divert aerodromes. Update ATO landing windows prior to frontal passage.';
      default:
        return 'Monitor telemetry continuously. Review contingency operational plans.';
    }
  };

  const getUrgencyLevel = (horizonMinutes: number): 'critical' | 'high' | 'medium' => {
    if (horizonMinutes <= 180) return 'critical'; // <= 3h
    if (horizonMinutes <= 360) return 'high';     // <= 6h
    return 'medium';                              // > 6h
  };

  // Filtered & Sorted Predictions
  const processedPredictions = useMemo(() => {
    return predictions
      .filter((p) => {
        const urgency = getUrgencyLevel(p.horizonMinutes);
        if (filters.urgency !== 'all' && urgency !== filters.urgency) return false;
        if (filters.entityType !== 'all' && p.entityType !== filters.entityType) return false;
        if (filters.search) {
          const q = filters.search.toLowerCase();
          const matchMsg = p.message.toLowerCase().includes(q);
          const matchId = p.entityId.toLowerCase().includes(q);
          const matchType = p.entityType.toLowerCase().includes(q);
          if (!matchMsg && !matchId && !matchType) return false;
        }
        return true;
      })
      .sort((a, b) => {
        if (sortBy === 'urgency') {
          return a.horizonMinutes - b.horizonMinutes; // soonest horizon first
        }
        return b.confidence - a.confidence; // highest confidence first
      });
  }, [predictions, filters, sortBy]);

  // Summary Metrics
  const summary = useMemo(() => {
    const total = predictions.length;
    const criticalCount = predictions.filter((p) => p.horizonMinutes <= 180).length;
    const highCount = predictions.filter((p) => p.horizonMinutes > 180 && p.horizonMinutes <= 360).length;
    const avgConfidence =
      total > 0
        ? Math.round((predictions.reduce((sum, p) => sum + p.confidence, 0) / total) * 100)
        : 0;

    return { total, criticalCount, highCount, avgConfidence };
  }, [predictions]);

  const getEntityIcon = (type: string) => {
    switch (type) {
      case 'aircraft':
        return <Plane className="w-3.5 h-3.5 text-command-secondary" />;
      case 'crew':
        return <Users className="w-3.5 h-3.5 text-command-primary" />;
      case 'base':
        return <Building className="w-3.5 h-3.5 text-command-warning" />;
      case 'weather':
        return <CloudRain className="w-3.5 h-3.5 text-command-secondary" />;
      default:
        return <Activity className="w-3.5 h-3.5 text-command-muted" />;
    }
  };

  return (
    <div className="space-y-4">
      {/* 1. Summary Metrics Tiles */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Stat
          label="Active Predictive Alerts"
          value={summary.total.toString()}
          unit="insights"
          trend="Algorithmic telemetry"
        />
        <Stat
          label="Immediate Urgency (≤3h)"
          value={summary.criticalCount.toString()}
          unit="critical"
          trend={summary.criticalCount > 0 ? 'Requires prompt commander action' : 'Zero immediate risks'}
        />
        <Stat
          label="Elevated Risk (3h - 6h)"
          value={summary.highCount.toString()}
          unit="high"
          trend="Pre-staging advised"
        />
        <Stat
          label="Mean Confidence Level"
          value={`${summary.avgConfidence}%`}
          unit="accuracy"
          trend="Bayesian predictive model"
        />
      </div>

      {/* 2. Filter & Sort Bar */}
      <div className="p-3 rounded-[1px] bg-command-panel/85 border border-command-border/70 flex flex-wrap items-center justify-between gap-3 text-xs font-mono">
        <div className="flex flex-wrap items-center gap-2">
          {/* Urgency Filter */}
          <div className="flex items-center gap-1.5 bg-command-bg px-2 py-1 rounded-[1px] border border-command-border">
            <span className="text-[10px] text-command-muted uppercase">Urgency:</span>
            <select
              aria-label="Filter by urgency"
              value={filters.urgency}
              onChange={(e) =>
                setFilters({ ...filters, urgency: e.target.value as PredictionFilterState['urgency'] })
              }
              className="bg-transparent text-command-text focus:outline-none cursor-pointer"
            >
              <option value="all">All Horizons</option>
              <option value="critical">Critical (≤ 3h)</option>
              <option value="high">High (3h - 6h)</option>
              <option value="medium">Medium (&gt; 6h)</option>
            </select>
          </div>

          {/* Entity Type Filter */}
          <div className="flex items-center gap-1.5 bg-command-bg px-2 py-1 rounded-[1px] border border-command-border">
            <span className="text-[10px] text-command-muted uppercase">Entity:</span>
            <select
              aria-label="Filter by entity type"
              value={filters.entityType}
              onChange={(e) =>
                setFilters({
                  ...filters,
                  entityType: e.target.value as PredictionFilterState['entityType'],
                })
              }
              className="bg-transparent text-command-text focus:outline-none cursor-pointer"
            >
              <option value="all">All Entities</option>
              <option value="aircraft">Aircraft Hulls</option>
              <option value="crew">Aircrew</option>
              <option value="base">Air Bases</option>
              <option value="weather">Weather Minima</option>
            </select>
          </div>

          {/* Sort By Toggle */}
          <div className="flex items-center gap-1.5 bg-command-bg px-2 py-1 rounded-[1px] border border-command-border">
            <span className="text-[10px] text-command-muted uppercase">Sort By:</span>
            <button
              type="button"
              onClick={() => setSortBy(sortBy === 'urgency' ? 'confidence' : 'urgency')}
              className="text-command-primary font-bold hover:underline flex items-center gap-1"
            >
              <span>{sortBy === 'urgency' ? 'Urgency (Time Horizon)' : 'Confidence (%)'}</span>
              <ArrowUpDown className="w-3 h-3" />
            </button>
          </div>
        </div>

        {/* Search */}
        <input
          type="text"
          placeholder="Filter predictions by keyword..."
          value={filters.search}
          onChange={(e) => setFilters({ ...filters, search: e.target.value })}
          className="w-full sm:w-60 px-2.5 py-1 bg-command-bg border border-command-border rounded-[1px] text-command-text placeholder-command-subdued focus:outline-none focus:border-command-primary text-xs"
        />
      </div>

      {/* 3. Predictive Insights Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
        {processedPredictions.map((pred, idx) => {
          const urgency = getUrgencyLevel(pred.horizonMinutes);
          const hours = (pred.horizonMinutes / 60).toFixed(1);
          const confidencePct = Math.round(pred.confidence * 100);

          return (
            <div
              key={`${pred.entityId}-${idx}`}
              className={`p-4 rounded-[1px] border flex flex-col justify-between font-mono text-xs transition-colors bg-command-panel ${
                urgency === 'critical'
                  ? 'border-command-critical-border bg-command-critical-bg/20'
                  : urgency === 'high'
                  ? 'border-command-warning-border bg-command-warning-bg/20'
                  : 'border-command-border'
              }`}
            >
              {/* Card Header */}
              <div>
                <div className="flex items-center justify-between pb-2 border-b border-command-border/50">
                  <div className="flex items-center gap-2">
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded-[1px] text-[10px] font-bold uppercase ${
                        urgency === 'critical'
                          ? 'bg-command-critical-bg text-command-critical border border-command-critical-border'
                          : urgency === 'high'
                          ? 'bg-command-warning-bg text-command-warning border border-command-warning-border'
                          : 'bg-command-bg text-command-primary border border-command-border'
                      }`}
                    >
                      {urgency === 'critical'
                        ? 'CRITICAL (≤3H)'
                        : urgency === 'high'
                        ? 'HIGH (3H-6H)'
                        : 'MEDIUM (>6H)'}
                    </span>

                    <div className="flex items-center gap-1.5 text-command-heading font-bold">
                      {getEntityIcon(pred.entityType)}
                      <span>
                        {pred.entityType.toUpperCase()} {pred.entityId}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-1 text-[10px] text-command-muted">
                    <Clock className="w-3 h-3" />
                    <span>Horizon: T+{hours}h</span>
                  </div>
                </div>

                {/* Primary Message */}
                <div className="py-3">
                  <h4 className="text-sm font-bold text-command-heading leading-snug">
                    {pred.message}
                  </h4>
                </div>

                {/* Confidence Bar & Time Horizon Readout */}
                <div className="space-y-1.5 p-2 rounded-[1px] bg-command-bg border border-command-border/60">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-command-muted">Model Confidence:</span>
                    <span
                      className={`font-bold ${
                        confidencePct >= 80
                          ? 'text-command-nominal'
                          : confidencePct >= 60
                          ? 'text-command-warning'
                          : 'text-command-critical'
                      }`}
                    >
                      {confidencePct}% Confidence
                    </span>
                  </div>
                  <ProgressBar
                    value={confidencePct}
                    status={
                      confidencePct >= 80 ? 'nominal' : confidencePct >= 60 ? 'warning' : 'critical'
                    }
                    size="sm"
                  />
                  <div className="flex justify-between text-[10px] text-command-subdued pt-0.5">
                    <span>Telemetry Metric: {pred.metric.replace(/_/g, ' ')}</span>
                    <span>Horizon: {pred.horizonMinutes} min</span>
                  </div>
                </div>

                {/* Proactive Recommendation (Decision Support Principle) */}
                <div className="mt-3 p-2.5 rounded-[1px] bg-command-raised/70 border border-command-border/60 text-[11px] font-sans space-y-1">
                  <div className="flex items-center gap-1.5 font-mono text-[10px] font-bold text-command-secondary uppercase">
                    <ShieldAlert className="w-3.5 h-3.5" />
                    <span>Recommended Proactive Commander Action:</span>
                  </div>
                  <p className="text-command-text text-[11px] leading-relaxed">
                    {getProactiveAdvice(pred)}
                  </p>
                </div>
              </div>

              {/* Card Footer */}
              <div className="pt-3 mt-3 border-t border-command-border/40 flex items-center justify-between text-[10px] text-command-muted">
                <span>Created: {formatTimeZulu(pred.createdAt)}</span>
                <span className="text-command-primary font-bold flex items-center gap-1 hover:underline cursor-pointer">
                  <span>Propose Retask</span>
                  <ArrowRight className="w-3 h-3" />
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
