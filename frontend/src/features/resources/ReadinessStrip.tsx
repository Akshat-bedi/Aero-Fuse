import React, { useMemo } from 'react';
import { useEntitiesStore } from '@/store';
import {
  Plane,
  Users,
  ShieldCheck,
  CloudRain,
  AlertTriangle,
} from 'lucide-react';

interface ReadinessStripProps {
  className?: string;
  isCompact?: boolean;
}

export const ReadinessStrip: React.FC<ReadinessStripProps> = ({
  className = '',
  isCompact = false,
}) => {
  const aircraft = useEntitiesStore((s) => s.aircraft);
  const crew = useEntitiesStore((s) => s.crew);
  const weaponStocks = useEntitiesStore((s) => s.weaponStocks);
  const weather = useEntitiesStore((s) => s.weather);

  // Fleet Readiness Metrics
  const fleetMetrics = useMemo(() => {
    const list = Object.values(aircraft);
    const total = list.length;
    if (total === 0) return { pct: 100, ready: 0, total: 0, airborne: 0 };
    const ready = list.filter(
      (a) => a.status === 'serviceable' || a.status === 'airborne',
    ).length;
    const airborne = list.filter((a) => a.status === 'airborne').length;
    const pct = Math.round((ready / total) * 100);
    return { pct, ready, total, airborne };
  }, [aircraft]);

  // Crew Availability Metrics
  const crewMetrics = useMemo(() => {
    const list = Object.values(crew);
    const total = list.length;
    if (total === 0) return { pct: 100, avail: 0, total: 0, nearLimit: 0 };
    const avail = list.filter((c) => c.status === 'available').length;
    const nearLimit = list.filter(
      (c) => c.dutyHoursLast24h >= 10 || c.fatigueIndex >= 75,
    ).length;
    const pct = Math.round((avail / total) * 100);
    return { pct, avail, total, nearLimit };
  }, [crew]);

  // Weapons Logistics Metrics
  const weaponMetrics = useMemo(() => {
    const totalQty = weaponStocks.reduce((sum, w) => sum + w.quantity, 0);
    const lowStockCount = weaponStocks.filter((w) => w.quantity < 15).length;
    const isNominal = lowStockCount <= 2;
    return { totalQty, lowStockCount, isNominal };
  }, [weaponStocks]);

  // Weather Severity Metrics
  const weatherMetrics = useMemo(() => {
    const list = Object.values(weather);
    const severeCount = list.filter((w) => w.severity === 'severe').length;
    const cautionCount = list.filter((w) => w.severity === 'caution').length;
    const nominalCount = list.filter((w) => w.severity === 'nominal').length;
    const overallSeverity = severeCount > 0 ? 'critical' : cautionCount > 0 ? 'caution' : 'nominal';
    return { severeCount, cautionCount, nominalCount, overallSeverity };
  }, [weather]);

  return (
    <div
      data-testid="readiness-strip"
      className={`flex flex-wrap items-center gap-2 sm:gap-3 px-2.5 py-1 bg-command-panel rounded-[1px] border border-command-border font-mono text-xs tabular-nums ${className}`}
    >
      {/* 1. Fleet Serviceable Readiness */}
      <div className="flex items-center gap-1.5 pr-2 sm:border-r border-command-border">
        <Plane className="w-3.5 h-3.5 text-command-primary flex-shrink-0" />
        <span className="text-[10px] text-command-muted uppercase">FLEET:</span>
        <span
          className={`font-bold ${
            fleetMetrics.pct >= 80
              ? 'text-command-nominal'
              : fleetMetrics.pct >= 60
              ? 'text-command-warning'
              : 'text-command-critical'
          }`}
        >
          {fleetMetrics.pct}% READY
        </span>
        {!isCompact && (
          <span className="text-[10px] text-command-subdued hidden md:inline">
            ({fleetMetrics.ready}/{fleetMetrics.total})
          </span>
        )}
      </div>

      {/* 2. Crew Availability & Duty Limit Alerts */}
      <div className="flex items-center gap-1.5 pr-2 sm:border-r border-command-border">
        <Users className="w-3.5 h-3.5 text-command-primary flex-shrink-0" />
        <span className="text-[10px] text-command-muted uppercase">CREW:</span>
        <span
          className={`font-bold ${
            crewMetrics.nearLimit > 0
              ? 'text-command-warning'
              : 'text-command-nominal'
          }`}
        >
          {crewMetrics.pct}% AVAIL
        </span>
        {crewMetrics.nearLimit > 0 ? (
          <span className="flex items-center gap-0.5 text-[10px] text-command-warning font-semibold">
            <AlertTriangle className="w-3 h-3 text-command-warning" />
            <span>{crewMetrics.nearLimit} LIMIT</span>
          </span>
        ) : (
          !isCompact && (
            <span className="text-[10px] text-command-subdued hidden md:inline">
              ({crewMetrics.avail}/{crewMetrics.total})
            </span>
          )
        )}
      </div>

      {/* 3. Munitions Logistics & Stock */}
      <div className="flex items-center gap-1.5 pr-2 sm:border-r border-command-border">
        <ShieldCheck className="w-3.5 h-3.5 text-command-primary flex-shrink-0" />
        <span className="text-[10px] text-command-muted uppercase">MUNITIONS:</span>
        <span
          className={`font-bold ${
            weaponMetrics.lowStockCount > 3
              ? 'text-command-critical'
              : weaponMetrics.lowStockCount > 0
              ? 'text-command-warning'
              : 'text-command-nominal'
          }`}
        >
          {weaponMetrics.totalQty.toLocaleString()} U
        </span>
        {weaponMetrics.lowStockCount > 0 && !isCompact && (
          <span className="text-[10px] text-command-warning font-semibold hidden lg:inline">
            ({weaponMetrics.lowStockCount} Low)
          </span>
        )}
      </div>

      {/* 4. Weather Aerodrome Posture */}
      <div className="flex items-center gap-1.5">
        <CloudRain
          className={`w-3.5 h-3.5 flex-shrink-0 ${
            weatherMetrics.overallSeverity === 'critical'
              ? 'text-command-critical'
              : weatherMetrics.overallSeverity === 'caution'
              ? 'text-command-warning'
              : 'text-command-nominal'
          }`}
        />
        <span className="text-[10px] text-command-muted uppercase">METAR:</span>
        <span
          className={`font-bold uppercase ${
            weatherMetrics.overallSeverity === 'critical'
              ? 'text-command-critical'
              : weatherMetrics.overallSeverity === 'caution'
              ? 'text-command-warning'
              : 'text-command-nominal'
          }`}
        >
          {weatherMetrics.severeCount > 0
            ? `${weatherMetrics.severeCount} SVR`
            : weatherMetrics.cautionCount > 0
            ? `${weatherMetrics.cautionCount} CAUT`
            : 'ALL NOMINAL'}
        </span>
        {!isCompact && (
          <span className="text-[10px] text-command-subdued hidden xl:inline">
            ({weatherMetrics.nominalCount} Open / {weatherMetrics.cautionCount + weatherMetrics.severeCount} Restr)
          </span>
        )}
      </div>
    </div>
  );
};
