import React from 'react';
import { Base, WeatherState } from '@/types';
import { StatusBadge, ProgressBar } from '@/components/ui';
import { Fuel, Wind, Eye, AlertTriangle } from 'lucide-react';

interface BaseFuelGaugesProps {
  bases: Record<string, Base>;
  weather: Record<string, WeatherState>;
  className?: string;
}

export const BaseFuelGauges: React.FC<BaseFuelGaugesProps> = ({
  bases,
  weather,
  className = '',
}) => {
  const baseList = Object.values(bases);

  return (
    <div
      data-testid="base-fuel-gauges"
      className={`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 ${className}`}
    >
      {baseList.map((base) => {
        const baseWeather = weather[base.id] || base.weather;
        const runwayStatus = base.runwayStatus;

        // Estimated fuel in kg based on nominal 500k kg storage capacity
        const estKg = Math.round((base.fuelStockPct / 100) * 500000);
        const estDays = ((base.fuelStockPct / 100) * 16).toFixed(1);

        const isLowFuel = base.fuelStockPct < 40;
        const isCriticalFuel = base.fuelStockPct < 25;

        return (
          <div
            key={base.id}
            className={`p-3 rounded border font-mono text-xs flex flex-col justify-between transition-all bg-command-panel/95 backdrop-blur-md shadow-md ${
              isCriticalFuel
                ? 'border-red-500/80 shadow-red-950/20'
                : isLowFuel
                ? 'border-amber-500/80 shadow-amber-950/20'
                : 'border-command-border/80'
            }`}
          >
            {/* Header */}
            <div>
              <div className="flex items-center justify-between gap-1 pb-1 border-b border-command-border/50">
                <div>
                  <span className="font-bold text-command-heading">{base.id}</span>
                  <p className="text-[10px] text-command-muted truncate">{base.name}</p>
                </div>
                <StatusBadge
                  status={
                    runwayStatus === 'open'
                      ? 'nominal'
                      : runwayStatus === 'degraded'
                      ? 'warning'
                      : 'critical'
                  }
                  label={runwayStatus.toUpperCase()}
                  size="sm"
                />
              </div>

              {/* Fuel Gauge */}
              <div className="py-2.5 space-y-1.5">
                <div className="flex items-center justify-between text-[11px]">
                  <div className="flex items-center gap-1.5 text-command-muted">
                    <Fuel className="w-3.5 h-3.5 text-command-primary" />
                    <span>Aviation Fuel Reserve</span>
                  </div>
                  <span
                    className={`font-bold ${
                      isCriticalFuel
                        ? 'text-command-critical'
                        : isLowFuel
                        ? 'text-command-warning'
                        : 'text-command-nominal'
                    }`}
                  >
                    {base.fuelStockPct}%
                  </span>
                </div>

                <ProgressBar
                  value={base.fuelStockPct}
                  status={isCriticalFuel ? 'critical' : isLowFuel ? 'warning' : 'nominal'}
                  size="md"
                />

                <div className="flex items-center justify-between text-[10px] text-command-subdued pt-0.5">
                  <span>Stock: {estKg.toLocaleString()} kg</span>
                  <span>~{estDays} Days Ops</span>
                </div>

                {isLowFuel && (
                  <div className="flex items-center gap-1 text-[10px] text-amber-400 font-semibold pt-1">
                    <AlertTriangle className="w-3 h-3 text-amber-400" />
                    <span>Resupply convoy / airlift required</span>
                  </div>
                )}
              </div>
            </div>

            {/* Aerodrome Weather Mini Footer */}
            {baseWeather && (
              <div className="pt-2 border-t border-command-border/40 flex items-center justify-between text-[10px] text-command-muted">
                <div className="flex items-center gap-1">
                  <Wind className="w-3 h-3 text-command-subdued" />
                  <span>{baseWeather.windKts} kts</span>
                </div>
                <div className="flex items-center gap-1">
                  <Eye className="w-3 h-3 text-command-subdued" />
                  <span>{baseWeather.visibilityKm} km</span>
                </div>
                <span
                  className={`font-bold uppercase ${
                    baseWeather.severity === 'severe'
                      ? 'text-command-critical'
                      : baseWeather.severity === 'caution'
                      ? 'text-command-warning'
                      : 'text-command-nominal'
                  }`}
                >
                  {baseWeather.severity}
                </span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};
