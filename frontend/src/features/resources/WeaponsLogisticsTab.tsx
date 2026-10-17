import React, { useMemo } from 'react';
import { Base, WeatherState, WeaponStock } from '@/types';
import { BaseFuelGauges } from './BaseFuelGauges';
import { Stat, StatusBadge } from '@/components/ui';
import {
  Shield,
  Fuel,
  Package,
} from 'lucide-react';

interface WeaponsLogisticsTabProps {
  bases: Record<string, Base>;
  weather: Record<string, WeatherState>;
  weaponStocks: WeaponStock[];
}

interface WeaponMatrixRow {
  weaponType: string;
  name: string;
  role: string;
  compatibleAircraft: string[];
  stockByBase: Record<string, number>;
  totalQty: number;
  lowStockBases: string[];
}

// Static weapon definitions metadata
const WEAPON_METADATA: Record<
  string,
  { name: string; role: string; compatible: string[] }
> = {
  'GENERIC-AAM-M': {
    name: 'AAM-M (Medium Radar Guided)',
    role: 'BVR Air-to-Air Intercept',
    compatible: ['Fighter-A', 'Strike-B'],
  },
  'GENERIC-AAM-S': {
    name: 'AAM-S (Short-Range Infrared)',
    role: 'Within-Visual-Range Dogfight',
    compatible: ['Fighter-A', 'Strike-B'],
  },
  'PGM-Mk2': {
    name: 'PGM-Mk2 (Precision Penetrator)',
    role: 'Hardened Bunker & Facility Strike',
    compatible: ['Strike-B'],
  },
  'GENERIC-ANTIRADAR': {
    name: 'HARM-SEAD (Anti-Radiation)',
    role: 'SAM & Early Warning Radar Suppression',
    compatible: ['Strike-B'],
  },
  'GENERIC-CARGO-PALLET': {
    name: 'Logistics Air Mobility Pallet',
    role: 'Inter-Base Munitions & Parts Resupply',
    compatible: ['Transport-C'],
  },
  'GENERIC-RECON-POD': {
    name: 'Multispectral Sensor Pod',
    role: 'High-Altitude Optical & SAR Recon',
    compatible: ['Recon-D'],
  },
};

export const WeaponsLogisticsTab: React.FC<WeaponsLogisticsTabProps> = ({
  bases,
  weather,
  weaponStocks,
}) => {
  const baseIds = Object.keys(bases);

  // Build matrix data
  const matrixData = useMemo(() => {
    const rows: WeaponMatrixRow[] = [];
    const weaponTypes = Object.keys(WEAPON_METADATA);

    weaponTypes.forEach((wType) => {
      const meta = WEAPON_METADATA[wType] || {
        name: wType,
        role: 'Ordnance',
        compatible: [],
      };

      const stockByBase: Record<string, number> = {};
      let totalQty = 0;
      const lowStockBases: string[] = [];

      baseIds.forEach((bId) => {
        const item = weaponStocks.find((w) => w.baseId === bId && w.weaponType === wType);
        const qty = item ? item.quantity : 0;
        stockByBase[bId] = qty;
        totalQty += qty;
        if (qty < 15) {
          lowStockBases.push(bId);
        }
      });

      rows.push({
        weaponType: wType,
        name: meta.name,
        role: meta.role,
        compatibleAircraft: meta.compatible,
        stockByBase,
        totalQty,
        lowStockBases,
      });
    });

    return rows;
  }, [weaponStocks, baseIds]);

  // Overall totals
  const totalStockCount = useMemo(
    () => weaponStocks.reduce((sum, w) => sum + w.quantity, 0),
    [weaponStocks],
  );

  const lowStockCount = useMemo(
    () => weaponStocks.filter((w) => w.quantity < 15).length,
    [weaponStocks],
  );

  return (
    <div className="space-y-4">
      {/* 1. Summary Metrics Tiles */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Stat
          label="Total Munitions Stock"
          value={totalStockCount.toLocaleString()}
          unit="units"
          trend="Across 4 base magazines"
        />
        <Stat
          label="Low Stock Alerts"
          value={lowStockCount.toString()}
          unit="depots"
          trend={lowStockCount > 0 ? 'Resupply airlifts advised' : 'All magazines nominal'}
        />
        <Stat
          label="Operational Airbases"
          value={baseIds.length.toString()}
          unit="bases"
          trend="4 depots operational"
        />
        <Stat
          label="Strategic Fuel Reserves"
          value="1.84M"
          unit="kg"
          trend="81% average reserve"
        />
      </div>

      {/* 2. Airbase Aviation Fuel Depots (Fuel Stock Gauges) */}
      <div className="space-y-2">
        <div className="flex items-center justify-between pb-1">
          <div className="flex items-center gap-2">
            <Fuel className="w-4 h-4 text-command-primary" />
            <h3 className="font-mono font-bold text-xs text-command-heading uppercase tracking-wider">
              Airbase Aviation Fuel Depots & Runway Readiness
            </h3>
          </div>
          <span className="text-[10px] font-mono text-command-subdued hidden sm:inline">
            30-Day Sustained Combat Ops Thresholds
          </span>
        </div>
        <BaseFuelGauges bases={bases} weather={weather} />
      </div>

      {/* 3. Weapons Inventory Matrix Table */}
      <div className="p-3.5 rounded bg-command-panel/90 border border-command-border/80 shadow-md space-y-3">
        <div className="flex items-center justify-between pb-2 border-b border-command-border/50">
          <div className="flex items-center gap-2">
            <Package className="w-4 h-4 text-command-secondary" />
            <h3 className="font-mono font-bold text-xs text-command-heading uppercase tracking-wider">
              Theatre Weapons Magazine Matrix (Stock by Base)
            </h3>
          </div>
          <div className="flex items-center gap-2 text-[10px] font-mono">
            <span className="flex items-center gap-1 text-command-critical font-bold">
              <span className="w-2 h-2 rounded-full bg-red-500" />
              <span>Out of Stock (0)</span>
            </span>
            <span className="flex items-center gap-1 text-command-warning font-bold">
              <span className="w-2 h-2 rounded-full bg-amber-500" />
              <span>Low (&lt;15)</span>
            </span>
            <span className="flex items-center gap-1 text-command-nominal font-bold">
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              <span>Nominal (≥15)</span>
            </span>
          </div>
        </div>

        {/* Matrix Table */}
        <div className="overflow-x-auto rounded border border-command-border/60">
          <table className="w-full text-left font-mono text-xs">
            <thead className="bg-command-raised text-command-muted uppercase text-[10px] tracking-wider border-b border-command-border">
              <tr>
                <th className="p-2.5">Weapon System</th>
                <th className="p-2.5">Role / Employment</th>
                <th className="p-2.5">Platforms</th>
                {baseIds.map((bId) => (
                  <th key={bId} className="p-2.5 text-center">
                    {bId}
                    <span className="text-[9px] text-command-subdued block">
                      {bases[bId]?.name?.split(' ')[0]}
                    </span>
                  </th>
                ))}
                <th className="p-2.5 text-right">Theatre Total</th>
                <th className="p-2.5 text-center">Posture</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-command-border/40 bg-command-bg/80">
              {matrixData.map((row) => {
                const hasZero = Object.values(row.stockByBase).some((q) => q === 0);
                const hasLow = row.lowStockBases.length > 0;

                return (
                  <tr
                    key={row.weaponType}
                    className="hover:bg-command-panel/60 transition-colors"
                  >
                    {/* Weapon System */}
                    <td className="p-2.5 font-bold text-command-heading">
                      <div className="flex items-center gap-1.5">
                        <Shield className="w-3.5 h-3.5 text-command-primary flex-shrink-0" />
                        <span>{row.name}</span>
                      </div>
                      <span className="text-[10px] text-command-muted font-normal block pl-5">
                        {row.weaponType}
                      </span>
                    </td>

                    {/* Role */}
                    <td className="p-2.5 text-[11px] text-command-text font-sans">
                      {row.role}
                    </td>

                    {/* Platforms */}
                    <td className="p-2.5">
                      <div className="flex flex-wrap gap-1">
                        {row.compatibleAircraft.map((p) => (
                          <span
                            key={p}
                            className="px-1.5 py-0.5 rounded bg-command-panel text-[9px] font-semibold text-command-muted border border-command-border/50"
                          >
                            {p}
                          </span>
                        ))}
                      </div>
                    </td>

                    {/* Bases Quantities */}
                    {baseIds.map((bId) => {
                      const qty = row.stockByBase[bId] ?? 0;
                      const isZero = qty === 0;
                      const isLow = qty > 0 && qty < 15;

                      return (
                        <td key={bId} className="p-2.5 text-center">
                          <span
                            className={`inline-flex items-center justify-center min-w-[36px] px-2 py-0.5 rounded text-[11px] font-bold ${
                              isZero
                                ? 'bg-red-950/80 text-red-300 border border-red-500/80'
                                : isLow
                                ? 'bg-amber-950/70 text-amber-300 border border-amber-500/70'
                                : 'bg-command-panel text-command-text border border-command-border/60'
                            }`}
                          >
                            {isZero ? '0' : qty}
                          </span>
                        </td>
                      );
                    })}

                    {/* Total Theatre Quantity */}
                    <td className="p-2.5 text-right font-bold text-command-primary">
                      {row.totalQty.toLocaleString()}
                    </td>

                    {/* Posture Badge */}
                    <td className="p-2.5 text-center">
                      <StatusBadge
                        status={hasZero ? 'critical' : hasLow ? 'warning' : 'nominal'}
                        label={hasZero ? 'DEPLETED' : hasLow ? 'LOW STOCK' : 'NOMINAL'}
                        size="sm"
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
