import React from 'react';
import { Mission, Threat, Airspace } from '@/types';
import { evaluateRouteRisk } from '@/lib/geo';
import { CheckCircle2, ShieldAlert, ArrowRight } from 'lucide-react';

interface RouteRiskIndicatorProps {
  mission?: Mission;
  threats: Record<string, Threat>;
  airspace: Record<string, Airspace>;
  onSelectRouteOption?: (routeId: string) => void;
}

export const RouteRiskIndicator: React.FC<RouteRiskIndicatorProps> = ({
  mission,
  threats,
  airspace,
  onSelectRouteOption,
}) => {
  if (!mission || !mission.route || mission.route.length < 2) return null;

  const activeThreatsList = Object.values(threats);
  const activeAirspacesList = Object.values(airspace);

  const riskAnalysis = evaluateRouteRisk(mission.route, activeThreatsList, activeAirspacesList);

  if (!riskAnalysis.isCompromised) {
    return (
      <div className="absolute top-14 left-1/2 -translate-x-1/2 z-10 pointer-events-none">
        <div className="bg-command-panel/90 backdrop-blur-md px-3.5 py-1.5 rounded border border-emerald-500/40 shadow-xl font-mono text-xs flex items-center gap-2 text-emerald-400">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          <span>
            FLIGHT PATH NOMINAL: {mission.name} clear of threat envelopes ({riskAnalysis.totalDistanceKm}km)
          </span>
        </div>
      </div>
    );
  }

  // Find alternative route (e.g. Route C) if available
  const hasRouteC = mission.routeOptions?.find((r) => r.id === 'Route C');

  return (
    <div className="absolute top-14 left-1/2 -translate-x-1/2 z-10 max-w-xl w-full px-4">
      <div className="bg-red-950/95 backdrop-blur-md px-4 py-2 rounded border border-red-500 shadow-2xl font-mono text-xs text-red-200 flex items-center justify-between gap-3 animate-pulse">
        <div className="flex items-center gap-2.5 min-w-0">
          <ShieldAlert className="w-5 h-5 text-red-400 flex-shrink-0" />
          <div className="truncate">
            <span className="font-bold text-red-100 uppercase tracking-wide">
              TACTICAL HAZARD DETECTED ({mission.id})
            </span>
            <p className="text-[11px] text-red-300 font-sans truncate">
              {riskAnalysis.warnings[0] || 'Active flight segment penetrates hostile SAM engagement envelope'}
            </p>
          </div>
        </div>

        {hasRouteC && onSelectRouteOption && (
          <button
            type="button"
            onClick={() => onSelectRouteOption('Route C')}
            className="flex-shrink-0 px-2.5 py-1 rounded bg-red-800/80 hover:bg-red-700 text-white font-bold text-[10px] flex items-center gap-1 transition-colors border border-red-400/50"
          >
            <span>Preview Route C Detour</span>
            <ArrowRight className="w-3 h-3" />
          </button>
        )}
      </div>
    </div>
  );
};
