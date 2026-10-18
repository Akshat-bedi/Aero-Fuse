import React, { useState } from 'react';
import { ScenarioParams, AircraftType, WeatherSeverity } from '@/types';
import {
  Play,
  RotateCcw,
  Plane,
  Building,
  Users,
  CloudRain,
  ShieldAlert,
  Flame,
  Bookmark,
} from 'lucide-react';

interface ScenarioBuilderProps {
  onRunScenario: (params: ScenarioParams) => void;
  isRunning?: boolean;
}

export const ScenarioBuilder: React.FC<ScenarioBuilderProps> = ({
  onRunScenario,
  isRunning = false,
}) => {
  const [name, setName] = useState('');
  const [aircraftType, setAircraftType] = useState<AircraftType>('Strike-B');
  const [aircraftBase, setAircraftBase] = useState('BASE-B');
  const [aircraftCount, setAircraftCount] = useState(0);

  const [outageBase, setOutageBase] = useState('BASE-B');
  const [outageHours, setOutageHours] = useState(0);

  const [crewReductionPct, setCrewReductionPct] = useState(0);
  const [weatherSeverity, setWeatherSeverity] = useState<WeatherSeverity>('nominal');
  const [surgeMissions, setSurgeMissions] = useState(0);
  const [threatLevel, setThreatLevel] = useState<'low' | 'medium' | 'high' | 'critical'>('low');
  const [horizonHours, setHorizonHours] = useState(24);

  const handleRun = () => {
    const params: ScenarioParams = {
      name: name.trim() || undefined,
      aircraftLoss: aircraftCount > 0 ? [{ type: aircraftType, baseId: aircraftBase, count: aircraftCount }] : [],
      baseOutage: outageHours > 0 ? { baseId: outageBase, hours: outageHours } : undefined,
      crewAvailabilityReductionPct: crewReductionPct > 0 ? crewReductionPct : undefined,
      weatherSeverity,
      surgeMissions: surgeMissions > 0 ? surgeMissions : undefined,
      threatLevel,
      horizonHours,
    };
    onRunScenario(params);
  };

  const handleReset = () => {
    setName('');
    setAircraftCount(0);
    setOutageHours(0);
    setCrewReductionPct(0);
    setWeatherSeverity('nominal');
    setSurgeMissions(0);
    setThreatLevel('low');
    setHorizonHours(24);
  };

  // Preset Configurations
  const applyPreset = (presetName: string) => {
    if (presetName === 'runway-closure') {
      setName('BASE-B Runway Closure (6 Hours) + 1 Hull AOG');
      setAircraftType('Strike-B');
      setAircraftBase('BASE-B');
      setAircraftCount(1);
      setOutageBase('BASE-B');
      setOutageHours(6);
      setCrewReductionPct(0);
      setWeatherSeverity('nominal');
      setSurgeMissions(0);
      setThreatLevel('low');
    } else if (presetName === 'threat-surge') {
      setName('Northern Threat Escalation + High SAM Density');
      setAircraftCount(0);
      setOutageHours(0);
      setCrewReductionPct(0);
      setWeatherSeverity('caution');
      setSurgeMissions(1);
      setThreatLevel('high');
    } else if (presetName === 'weather-crew') {
      setName('Severe Frontal Weather + 25% Crew Fatigue Exhaustion');
      setAircraftCount(0);
      setOutageHours(0);
      setCrewReductionPct(25);
      setWeatherSeverity('severe');
      setSurgeMissions(0);
      setThreatLevel('medium');
    } else if (presetName === 'nominal') {
      handleReset();
      setName('Pristine Master ATO Baseline (Zero Perturbations)');
    }
  };

  return (
    <div className="bg-command-panel border border-command-border rounded-[2px] p-3 text-command-text font-mono text-xs space-y-3.5">
      {/* Header */}
      <div className="flex items-center justify-between pb-2 border-b border-command-border/80">
        <div>
          <h2 className="text-xs font-bold text-command-primary uppercase tracking-wider">
            What-If Scenario Builder
          </h2>
          <p className="text-[10px] text-command-muted font-sans mt-0.5">
            Configure operational stress parameters to model impact without altering live execution.
          </p>
        </div>
        <button
          type="button"
          onClick={handleReset}
          className="text-command-muted hover:text-command-text text-[10px] flex items-center gap-1 hover:underline"
          title="Reset all parameters to baseline"
        >
          <RotateCcw className="w-3 h-3" />
          <span>Reset</span>
        </button>
      </div>

      {/* Preset Quick Actions */}
      <div className="space-y-1">
        <span className="text-[9px] uppercase tracking-wider text-command-muted flex items-center gap-1">
          <Bookmark className="w-2.5 h-2.5" />
          <span>Quick Scenario Presets:</span>
        </span>
        <div className="flex flex-wrap gap-1">
          <button
            type="button"
            onClick={() => applyPreset('runway-closure')}
            className="px-2 py-0.5 rounded-[1px] bg-command-bg border border-command-border text-[10px] hover:border-command-primary hover:text-command-primary transition-none"
          >
            BASE-B Closure + AOG
          </button>
          <button
            type="button"
            onClick={() => applyPreset('threat-surge')}
            className="px-2 py-0.5 rounded-[1px] bg-command-bg border border-command-border text-[10px] hover:border-command-primary hover:text-command-primary transition-none"
          >
            High SAM Threat
          </button>
          <button
            type="button"
            onClick={() => applyPreset('weather-crew')}
            className="px-2 py-0.5 rounded-[1px] bg-command-bg border border-command-border text-[10px] hover:border-command-primary hover:text-command-primary transition-none"
          >
            Severe Front + Fatigue
          </button>
          <button
            type="button"
            onClick={() => applyPreset('nominal')}
            className="px-2 py-0.5 rounded-[1px] bg-command-bg border border-command-border text-[10px] hover:border-command-primary hover:text-command-primary transition-none"
          >
            Pristine Baseline
          </button>
        </div>
      </div>

      {/* Scenario Name */}
      <div className="space-y-1">
        <label className="text-[10px] text-command-muted uppercase">Scenario Label (Optional):</label>
        <input
          type="text"
          placeholder="e.g. Surge Option Charlie (Stress Test)..."
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full px-2 py-1 bg-command-bg border border-command-border rounded-[1px] text-command-text placeholder-command-subdued text-xs focus:outline-none focus:border-command-primary"
        />
      </div>

      {/* Parameter Inputs Grid */}
      <div className="space-y-2.5">
        {/* 1. Aircraft Loss / Attrition */}
        <div className="p-2 rounded-[1px] bg-command-bg border border-command-border/70 space-y-1.5">
          <div className="flex items-center justify-between text-[11px]">
            <span className="flex items-center gap-1.5 text-command-heading font-medium">
              <Plane className="w-3.5 h-3.5 text-command-primary" />
              <span>Airframe Loss / Maintenance AOG:</span>
            </span>
            <span className="text-command-primary font-bold">{aircraftCount} hull(s)</span>
          </div>

          <div className="grid grid-cols-3 gap-1.5 text-[11px]">
            <select
              aria-label="Aircraft Type"
              value={aircraftType}
              onChange={(e) => setAircraftType(e.target.value as AircraftType)}
              className="bg-command-panel border border-command-border px-1.5 py-1 rounded-[1px] text-command-text focus:outline-none text-[10px]"
            >
              <option value="Strike-B">Strike-B</option>
              <option value="Fighter-A">Fighter-A</option>
              <option value="Transport-C">Transport-C</option>
              <option value="Recon-D">Recon-D</option>
              <option value="Helicopter-E">Helicopter-E</option>
            </select>

            <select
              aria-label="Aircraft Base"
              value={aircraftBase}
              onChange={(e) => setAircraftBase(e.target.value)}
              className="bg-command-panel border border-command-border px-1.5 py-1 rounded-[1px] text-command-text focus:outline-none text-[10px]"
            >
              <option value="BASE-A">BASE-A (West)</option>
              <option value="BASE-B">BASE-B (North)</option>
              <option value="BASE-C">BASE-C (Central)</option>
              <option value="BASE-D">BASE-D (East)</option>
            </select>

            <input
              aria-label="Aircraft Loss Count"
              type="number"
              min={0}
              max={6}
              value={aircraftCount}
              onChange={(e) => setAircraftCount(Math.max(0, parseInt(e.target.value, 10) || 0))}
              className="bg-command-panel border border-command-border px-2 py-1 rounded-[1px] text-command-text text-center focus:outline-none text-[11px]"
            />
          </div>
        </div>

        {/* 2. Base Outage / Runway Closure */}
        <div className="p-2 rounded-[1px] bg-command-bg border border-command-border/70 space-y-1.5">
          <div className="flex items-center justify-between text-[11px]">
            <span className="flex items-center gap-1.5 text-command-heading font-medium">
              <Building className="w-3.5 h-3.5 text-command-warning" />
              <span>Base Runway Closure Duration:</span>
            </span>
            <span className="text-command-warning font-bold">{outageHours} hour(s)</span>
          </div>

          <div className="grid grid-cols-2 gap-1.5 text-[11px]">
            <select
              aria-label="Outage Base"
              value={outageBase}
              onChange={(e) => setOutageBase(e.target.value)}
              className="bg-command-panel border border-command-border px-1.5 py-1 rounded-[1px] text-command-text focus:outline-none text-[10px]"
            >
              <option value="BASE-B">BASE-B (North Bastion)</option>
              <option value="BASE-A">BASE-A (Vanguard Main)</option>
              <option value="BASE-C">BASE-C (Central Depot)</option>
              <option value="BASE-D">BASE-D (Eastern FOB)</option>
            </select>

            <select
              aria-label="Outage Duration"
              value={outageHours}
              onChange={(e) => setOutageHours(parseInt(e.target.value, 10))}
              className="bg-command-panel border border-command-border px-1.5 py-1 rounded-[1px] text-command-text focus:outline-none text-[10px]"
            >
              <option value={0}>0h (Open & Nominal)</option>
              <option value={2}>2 Hours Outage</option>
              <option value={4}>4 Hours Outage</option>
              <option value={6}>6 Hours Outage</option>
              <option value={8}>8 Hours Outage</option>
              <option value={12}>12 Hours Outage</option>
              <option value={24}>24 Hours Outage</option>
            </select>
          </div>
        </div>

        {/* 3. Crew Availability Reduction */}
        <div className="p-2 rounded-[1px] bg-command-bg border border-command-border/70 space-y-1">
          <div className="flex items-center justify-between text-[11px]">
            <span className="flex items-center gap-1.5 text-command-heading font-medium">
              <Users className="w-3.5 h-3.5 text-command-secondary" />
              <span>Aircrew Roster Drawdown:</span>
            </span>
            <span className="text-command-secondary font-bold">{crewReductionPct}% reduction</span>
          </div>
          <input
            aria-label="Crew Availability Reduction Slider"
            type="range"
            min={0}
            max={50}
            step={5}
            value={crewReductionPct}
            onChange={(e) => setCrewReductionPct(parseInt(e.target.value, 10))}
            className="w-full h-1.5 bg-command-panel rounded-[1px] appearance-none cursor-pointer accent-command-primary"
          />
          <div className="flex justify-between text-[9px] text-command-muted">
            <span>0% Nominal</span>
            <span>25% Moderate</span>
            <span>50% Severe</span>
          </div>
        </div>

        {/* 4. Weather Severity */}
        <div className="p-2 rounded-[1px] bg-command-bg border border-command-border/70 space-y-1">
          <div className="flex items-center justify-between text-[11px]">
            <span className="flex items-center gap-1.5 text-command-heading font-medium">
              <CloudRain className="w-3.5 h-3.5 text-command-primary" />
              <span>Weather Severity Minima:</span>
            </span>
            <span className="text-command-primary font-bold uppercase">{weatherSeverity}</span>
          </div>
          <div className="grid grid-cols-3 gap-1">
            {(['nominal', 'caution', 'severe'] as WeatherSeverity[]).map((sev) => (
              <button
                key={sev}
                type="button"
                onClick={() => setWeatherSeverity(sev)}
                className={`py-1 rounded-[1px] text-[10px] uppercase font-bold border transition-none ${
                  weatherSeverity === sev
                    ? 'border-command-primary bg-command-raised text-command-primary'
                    : 'border-command-border bg-command-panel text-command-muted hover:text-command-text'
                }`}
              >
                {sev}
              </button>
            ))}
          </div>
        </div>

        {/* 5. Surge Missions & Threat Level */}
        <div className="grid grid-cols-2 gap-2">
          {/* Surge Missions */}
          <div className="p-2 rounded-[1px] bg-command-bg border border-command-border/70 space-y-1">
            <span className="flex items-center gap-1 text-[10px] text-command-heading font-medium">
              <Flame className="w-3 h-3 text-command-warning" />
              <span>Surge Missions:</span>
            </span>
            <input
              aria-label="Surge Missions Count"
              type="number"
              min={0}
              max={8}
              value={surgeMissions}
              onChange={(e) => setSurgeMissions(Math.max(0, parseInt(e.target.value, 10) || 0))}
              className="w-full bg-command-panel border border-command-border px-2 py-1 rounded-[1px] text-command-text text-center focus:outline-none text-[11px]"
            />
          </div>

          {/* Threat Level */}
          <div className="p-2 rounded-[1px] bg-command-bg border border-command-border/70 space-y-1">
            <span className="flex items-center gap-1 text-[10px] text-command-heading font-medium">
              <ShieldAlert className="w-3 h-3 text-command-critical" />
              <span>Threat Posture:</span>
            </span>
            <select
              aria-label="Threat Level"
              value={threatLevel}
              onChange={(e) => setThreatLevel(e.target.value as 'low' | 'medium' | 'high' | 'critical')}
              className="w-full bg-command-panel border border-command-border px-1.5 py-1 rounded-[1px] text-command-text focus:outline-none text-[10px]"
            >
              <option value="low">Low (1)</option>
              <option value="medium">Medium (2)</option>
              <option value="high">High (3)</option>
              <option value="critical">Critical (4)</option>
            </select>
          </div>
        </div>

        {/* Simulation Horizon */}
        <div className="flex items-center justify-between px-2 py-1.5 rounded-[1px] bg-command-bg border border-command-border/70 text-[11px]">
          <span className="text-command-muted">Simulation Horizon:</span>
          <div className="flex items-center gap-1">
            {[12, 24, 48].map((h) => (
              <button
                key={h}
                type="button"
                onClick={() => setHorizonHours(h)}
                className={`px-2 py-0.5 rounded-[1px] text-[10px] border transition-none ${
                  horizonHours === h
                    ? 'border-command-primary bg-command-raised text-command-primary font-bold'
                    : 'border-command-border bg-command-panel text-command-muted hover:text-command-text'
                }`}
              >
                {h}h
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Run Action Button */}
      <button
        type="button"
        disabled={isRunning}
        onClick={handleRun}
        className="w-full py-2 bg-command-primary text-black font-bold rounded-[1px] text-xs hover:opacity-90 flex items-center justify-center gap-1.5 shadow-none disabled:opacity-50 tracking-wider"
      >
        <Play className="w-3.5 h-3.5 fill-black" />
        <span>{isRunning ? 'CALCULATING PROJECTIONS...' : 'RUN SCENARIO SIMULATION'}</span>
      </button>
    </div>
  );
};
