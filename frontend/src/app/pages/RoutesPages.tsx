import React from 'react';
import { PlaceholderPage } from './PlaceholderPage';

export const CommonPicturePage: React.FC = () => (
  <PlaceholderPage
    title="Common Operational Picture"
    code="COP-01"
    category="SITUATIONAL AWARENESS"
    description="Unified tactical airspace picture fusing radar tracks, sovereign boundaries, airbase readiness, and active patrol orbits."
    stats={[
      { label: 'Airborne Assets', value: '8', unit: 'sorties', trend: '4 CAP / 2 Rec / 2 Tanker' },
      { label: 'Serviceable Fleet', value: '42', unit: 'airframes', trend: '87.5% operational readiness' },
      { label: 'Active Sectors', value: '3', unit: 'zones', trend: 'Sector North Buffer Contested' },
      { label: 'Fuel Available', value: '1.01M', unit: 'kg', trend: 'Nominal across 3 airbases' },
    ]}
    plannedFeatures={[
      'MapLibre GL JS offline GeoJSON tactical map',
      'Airspace corridor & restricted area vector overlays',
      'Live aircraft position telemetry (Simulated tracks)',
      'Airbase runway status & local weather badges',
    ]}
  />
);

export const MissionsPage: React.FC = () => (
  <PlaceholderPage
    title="Air Tasking Orders & Missions"
    code="ATO-02"
    category="MISSION PLANNING"
    description="Real-time Air Tasking Order (ATO) tracking, sortie packages, scheduled flight windows, and target assignments."
    stats={[
      { label: 'Active Sorties', value: '8', unit: 'airborne', trend: 'All on flight plan' },
      { label: 'Planned Next 12H', value: '14', unit: 'sorties', trend: 'Crew & payload assigned' },
      { label: 'Alert Ready (CAP)', value: '4', unit: 'airframes', trend: '5-minute response posture' },
      { label: 'Scrubbed / Delayed', value: '0', unit: 'sorties', trend: 'Zero delays recorded' },
    ]}
    plannedFeatures={[
      'Custom SVG/DOM Gantt timeline component',
      'Interactive Sortie Package builder',
      'Fuel endurance vs time-on-station charts',
      'ATO change notification feed',
    ]}
  />
);

export const ResourcesPage: React.FC = () => (
  <PlaceholderPage
    title="Resources & Fleet Readiness"
    code="RES-03"
    category="LOGISTICS & ASSET AVAILABILITY"
    description="Granular aircraft serviceability, weapons magazine stock levels, aviation fuel depots, and aircrew duty hours."
    stats={[
      { label: 'Fleet Availability', value: '87.5%', unit: 'ready', trend: '+2.1% from last shift' },
      { label: 'Munitions Magazine', value: '4,280', unit: 'units', trend: 'Generic AAM & Precision loads' },
      { label: 'Fuel Reserves', value: '1.01M', unit: 'kg', trend: 'All bases above 30-day reserve' },
      { label: 'Crew Rostered', value: '64', unit: 'pilots', trend: 'Zero duty-hour violations' },
    ]}
    plannedFeatures={[
      'Interactive Aircraft Status grid (Fighter-A to Recon-D)',
      'Hardpoint weapon configuration matrix',
      'Airbase fuel depot gauges (Apache ECharts)',
      'Crew fatigue & duty window monitoring',
    ]}
  />
);

export const RecommendationsPage: React.FC = () => (
  <PlaceholderPage
    title="AI Retasking & Decision Support"
    code="DSS-REC"
    category="DECISION SUPPORT / OPTIMISATION"
    description="Algorithmic constraint evaluation, trade-off analysis, and human-in-the-loop retasking proposals."
    stats={[
      { label: 'Pending Proposals', value: '1', unit: 'recommendation', trend: 'CAP North reinforcement' },
      { label: 'Commander Approvals', value: '94%', unit: 'rate', trend: '16 approved / 1 modified' },
      { label: 'Proposal Compute Time', value: '1.8', unit: 'sec', trend: 'Rapid constraint solver' },
      { label: 'Confidence Score', value: '96.2', unit: '/100', trend: 'High algorithmic confidence' },
    ]}
    plannedFeatures={[
      'Explainability panel ("Why this recommendation")',
      'Hard constraints checklist & trade-offs summary',
      'Commander directive buttons: Approve / Modify / Reject',
      'Alternative flight plans side-by-side comparison',
    ]}
  />
);

export const ScenariosPage: React.FC = () => (
  <PlaceholderPage
    title="What-If Scenario Simulation"
    code="SCN-SIM"
    category="CONTINGENCY ANALYSIS"
    description="Predictive sandboxing to simulate runway closures, sudden weather deteriorations, or surface threat pop-ups."
    stats={[
      { label: 'Active Baseline', value: 'Standard OP', unit: 'plan', trend: 'Sector Alpha FOB primary' },
      { label: 'Contingency Branches', value: '3', unit: 'modeled', trend: 'Crosswind diversion branch active' },
      { label: 'Simulation Latency', value: '420', unit: 'ms', trend: 'Instantaneous replanning' },
      { label: 'System Robustness', value: 'HIGH', unit: 'rating', trend: 'Resilient reserve margin' },
    ]}
    plannedFeatures={[
      'Interactive operational disruption sliders',
      'Airbase weather closure scenario generator',
      'Fleet reallocation impact simulations',
      'Branch plan save and promote to live order',
    ]}
  />
);

export const AlertsPage: React.FC = () => (
  <PlaceholderPage
    title="Operational Alerts & Watches"
    code="ALT-MON"
    category="ALERT MANAGEMENT"
    description="Centralized telemetry alerting console for safety-critical violations, airspace encroachments, and unserviceable flags."
    stats={[
      { label: 'Active Alerts', value: '4', unit: 'watches', trend: '1 Critical / 2 Caution / 1 Info' },
      { label: 'Threat Radar Hits', value: '1', unit: 'contact', trend: 'Sector North Buffer FL240' },
      { label: 'Weather Watches', value: '1', unit: 'advisory', trend: 'North Bastion crosswinds' },
      { label: 'Acknowledged', value: '1', unit: 'resolved', trend: 'Logged in shift records' },
    ]}
    plannedFeatures={[
      'Real-time WebSocket event ingestion',
      'Multi-parameter alert filtering (Severity, Base, Type)',
      'Escalation countdown timers for unacknowledged alerts',
      'Safety threshold configuration presets',
    ]}
  />
);

export const AuditLogPage: React.FC = () => (
  <PlaceholderPage
    title="Commander Decision Audit Log"
    code="AUD-LOG"
    category="ACCOUNTABILITY & COMPLIANCE"
    description="Tamper-evident operational audit trail capturing every recommendation, commander directive, and mission modification."
    stats={[
      { label: 'Logged Directives', value: '128', unit: 'entries', trend: '100% human-authorized' },
      { label: 'Retasking Orders', value: '12', unit: 'executed', trend: 'Zero unauthorized changes' },
      { label: 'Overrides', value: '2', unit: 'logged', trend: 'Manual flight path deviations' },
      { label: 'Audit Integrity', value: 'VERIFIED', unit: 'SHA-256', trend: 'Cryptographic hash valid' },
    ]}
    plannedFeatures={[
      'Filterable decision chronology with timestamps',
      'Commander authorization electronic signatures',
      'Before & After plan state diff visualizer',
      'Exportable CSV / PDF mission summary report',
    ]}
  />
);
