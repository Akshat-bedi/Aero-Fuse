import React, { useState } from 'react';
import { useEntitiesStore } from '@/store';
import { ResourceTabKey } from './types';
import { ReadinessStrip } from './ReadinessStrip';
import { AircraftReadinessTab } from './AircraftReadinessTab';
import { CrewStatusTab } from './CrewStatusTab';
import { WeaponsLogisticsTab } from './WeaponsLogisticsTab';
import { PredictiveInsightsTab } from './PredictiveInsightsTab';
import { Tabs, TabItem } from '@/components/ui';
import {
  Plane,
  Users,
  Package,
  Activity,
} from 'lucide-react';

export const ResourcesPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<ResourceTabKey>('aircraft');

  const {
    aircraft,
    crew,
    bases,
    missions,
    weaponStocks,
    weather,
    predictions,
  } = useEntitiesStore();

  const totalAircraft = Object.keys(aircraft).length;
  const totalCrew = Object.keys(crew).length;
  const crewNearLimits = Object.values(crew).filter(
    (c) => c.dutyHoursLast24h >= 10 || c.fatigueIndex >= 75,
  ).length;
  const criticalPredictions = predictions.filter((p) => p.horizonMinutes <= 180).length;

  const tabs: TabItem[] = [
    {
      id: 'aircraft',
      label: 'Aircraft Readiness',
      icon: <Plane className="w-4 h-4" />,
      badge: totalAircraft,
    },
    {
      id: 'crew',
      label: 'Aircrew Status',
      icon: <Users className="w-4 h-4" />,
      badge: crewNearLimits > 0 ? `${crewNearLimits} Alert` : totalCrew,
    },
    {
      id: 'weapons',
      label: 'Weapons & Logistics',
      icon: <Package className="w-4 h-4" />,
      badge: Object.keys(bases).length + ' Depots',
    },
    {
      id: 'predictions',
      label: 'Predictive Insights',
      icon: <Activity className="w-4 h-4 text-command-primary" />,
      badge: criticalPredictions > 0 ? `${criticalPredictions} Urgent` : predictions.length,
    },
  ];

  return (
    <div className="flex-1 min-h-0 flex flex-col overflow-y-auto bg-command-bg font-sans">
      {/* Page Header */}
      <div className="p-4 sm:p-5 pb-3 border-b border-command-border/80 bg-command-panel/50 space-y-3">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 font-mono text-[10px] text-command-muted uppercase">
              <span className="px-1.5 py-0.5 rounded-[1px] bg-command-bg border border-command-border text-command-primary font-bold">
                ATO-RES-04
              </span>
              <span>LOGISTICS & ASSET READINESS</span>
              <span>•</span>
              <span className="text-command-nominal">LIVE INVENTORY</span>
            </div>
            <h1 className="text-xl sm:text-2xl font-bold text-command-heading tracking-wide mt-1">
              Resources & Fleet Readiness
            </h1>
            <p className="text-xs text-command-muted font-sans mt-0.5 max-w-2xl">
              Real-time airframe maintenance tracking, weapons magazine stock levels, aircrew duty-window monitoring, and proactive predictive telemetry.
            </p>
          </div>

          {/* Reusable Readiness Strip in Top Bar */}
          <ReadinessStrip className="self-start md:self-auto" />
        </div>

        {/* Navigation Tabs */}
        <div className="pt-2">
          <Tabs
            tabs={tabs}
            activeTab={activeTab}
            onChange={(id) => setActiveTab(id as ResourceTabKey)}
            variant="segmented"
          />
        </div>
      </div>

      {/* Main Tab Stage */}
      <div className="p-4 sm:p-5 flex-1">
        {activeTab === 'aircraft' && (
          <AircraftReadinessTab
            aircraft={aircraft}
            bases={bases}
            missions={missions}
            crew={crew}
          />
        )}

        {activeTab === 'crew' && (
          <CrewStatusTab crew={crew} bases={bases} />
        )}

        {activeTab === 'weapons' && (
          <WeaponsLogisticsTab
            bases={bases}
            weather={weather}
            weaponStocks={weaponStocks}
          />
        )}

        {activeTab === 'predictions' && (
          <PredictiveInsightsTab predictions={predictions} />
        )}
      </div>
    </div>
  );
};
