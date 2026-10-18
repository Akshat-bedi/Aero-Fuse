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
      <div className="absolute top-12 left-1/2 -translate-x-1/2 z-10 pointer-events-none">
        <div className="bg-command-panel px-3 py-1 rounded-[1px] border border-command-nominal font-mono text-xs flex items-center gap-2 text-command-nominal">
          <CheckCircle2 className="w-3.5 h-3.5 text-command-nominal" />
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
    <div className="absolute top-12 left-1/2 -translate-x-1/2 z-10 max-w-xl w-full px-4">
      <div className="bg-command-critical-bg px-3.5 py-1.5 rounded-[1px] border border-command-critical-border font-mono text-xs text-command-critical flex items-center justify-between gap-3 animate-slow-blink">
        <div className="flex items-center gap-2 min-w-0">
          <ShieldAlert className="w-4 h-4 text-command-critical flex-shrink-0" />
          <div className="truncate">
            <span className="font-bold text-command-heading uppercase tracking-wider">
              TACTICAL HAZARD DETECTED ({mission.id})
            </span>
            <p className="text-[10px] text-command-muted font-mono truncate">
              {riskAnalysis.warnings[0] || 'Active flight segment penetrates hostile SAM engagement envelope'}
            </p>
          </div>
        </div>

        {hasRouteC && onSelectRouteOption && (
          <button
            type="button"
            onClick={() => onSelectRouteOption('Route C')}
            className="flex-shrink-0 px-2 py-0.5 rounded-[1px] bg-command-raised hover:bg-command-raised-hover text-command-heading font-bold text-[10px] flex items-center gap-1 transition-none border border-command-border"
          >
            <span>Preview Route C Detour</span>
            <ArrowRight className="w-3 h-3" />
          </button>
        )}
      </div>
    </div>
  );
};
