import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { ResourcesPage } from './ResourcesPage';
import { useEntitiesStore } from '@/store';
import { mockDataService } from '@/services/mockDataService';

describe('ResourcesPage (Resource Readiness Views & Logistics)', () => {
  beforeEach(async () => {
    // Populate entities store from deterministic mock snapshot
    const snapshot = await mockDataService.getSnapshot();
    useEntitiesStore.getState().setSnapshot(snapshot);
  });

  /* -------------------------------------------------------------------------
     1. READINESS STRIP & TOP BAR POSTURE
     ------------------------------------------------------------------------- */
  it('renders page header and reusable ReadinessStrip with theatre metrics', () => {
    render(<ResourcesPage />);

    // Header & code badge
    expect(screen.getByText('ATO-RES-04')).toBeInTheDocument();
    expect(screen.getByText('Resources & Fleet Readiness')).toBeInTheDocument();

    // Reusable ReadinessStrip badges
    const strip = screen.getByTestId('readiness-strip');
    expect(within(strip).getByText(/FLEET:/i)).toBeInTheDocument();
    expect(within(strip).getByText(/READY/i)).toBeInTheDocument();
    expect(within(strip).getByText(/CREW:/i)).toBeInTheDocument();
    expect(within(strip).getByText(/AVAIL/i)).toBeInTheDocument();
    expect(within(strip).getByText(/MUNITIONS:/i)).toBeInTheDocument();
    expect(within(strip).getByText(/METAR:/i)).toBeInTheDocument();

    // 4 Main navigation tabs
    expect(screen.getByRole('tab', { name: /Aircraft Readiness/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Aircrew Status/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Weapons & Logistics/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Predictive Insights/i })).toBeInTheDocument();
  });

  /* -------------------------------------------------------------------------
     2. AIRCRAFT READINESS TAB
     ------------------------------------------------------------------------- */
  it('renders aircraft fleet summary tiles, ECharts containers, and sortable table', () => {
    render(<ResourcesPage />);

    // Summary tiles
    expect(screen.getByText('Total Fleet Hulls')).toBeInTheDocument();
    expect(screen.getByText('Fleet Readiness')).toBeInTheDocument();
    expect(screen.getByText('Airborne Sorties')).toBeInTheDocument();
    expect(screen.getByText('Scheduled Maintenance')).toBeInTheDocument();
    expect(screen.getByText('Unserviceable (AOG)')).toBeInTheDocument();

    // ECharts visualization containers
    const chartContainers = screen.getAllByTestId('echarts-for-react');
    expect(chartContainers.length).toBeGreaterThanOrEqual(2);

    // Aircraft table columns
    expect(screen.getByText('Tail Number')).toBeInTheDocument();
    expect(screen.getByText('Callsign')).toBeInTheDocument();
    expect(screen.getByText('Airframe Type')).toBeInTheDocument();
    expect(screen.getByText('Home Base')).toBeInTheDocument();
    expect(screen.getByText('Status')).toBeInTheDocument();
    expect(screen.getByText('Fuel State')).toBeInTheDocument();
    expect(screen.getByText('Hours to Maint')).toBeInTheDocument();
    expect(screen.getByText('Weapon Loadout')).toBeInTheDocument();
    expect(screen.getByText('Assigned Sortie')).toBeInTheDocument();

    // Verify presence of seed aircraft
    expect(screen.getByText(/VR-F01/i)).toBeInTheDocument();
    expect(screen.getByText(/VR-F02/i)).toBeInTheDocument();
  });

  it('filters aircraft by search query and base selector', () => {
    render(<ResourcesPage />);

    // Search for a specific aircraft
    const searchInput = screen.getByPlaceholderText(/Search tail, callsign, ID.../i);
    fireEvent.change(searchInput, { target: { value: 'VR-F01' } });

    // VR-F01 should be visible, VR-F02 filtered out
    expect(screen.getByText(/VR-F01/i)).toBeInTheDocument();
    expect(screen.queryByText(/VR-F02/i)).not.toBeInTheDocument();

    // Clear search
    fireEvent.change(searchInput, { target: { value: '' } });
    expect(screen.getByText(/VR-F01/i)).toBeInTheDocument();
    expect(screen.getByText(/VR-F02/i)).toBeInTheDocument();

    // Filter by base
    const baseSelect = screen.getByRole('combobox', { name: /Filter by base/i });
    fireEvent.change(baseSelect, { target: { value: 'BASE-D' } });

    // Verify only BASE-D aircraft show in table body
    const tbody = screen.getByRole('table').querySelector('tbody')!;
    expect(within(tbody).getAllByText(/BASE-D/).length).toBeGreaterThan(0);
    expect(within(tbody).queryByText(/BASE-A/)).not.toBeInTheDocument();
  });

  it('opens aircraft detail drawer on row click and shows maintenance forecast', () => {
    render(<ResourcesPage />);

    // Click on row for VR-F01 (AC-01)
    const ac01Cell = screen.getByText(/VR-F01/i);
    const ac01Row = ac01Cell.closest('tr');
    expect(ac01Row).toBeInTheDocument();
    if (ac01Row) {
      fireEvent.click(ac01Row);
    }

    // Detail drawer is opened
    expect(screen.getByTestId('aircraft-detail-drawer')).toBeInTheDocument();
    expect(screen.getByText(/MAINTENANCE FORECAST & SCHEDULE/i)).toBeInTheDocument();
    expect(screen.getByText(/Turbofan Engine Core/i)).toBeInTheDocument();
    expect(screen.getByText(/Avionics Radar & Datalink/i)).toBeInTheDocument();

    // Close the drawer
    const closeBtn = screen.getByRole('button', { name: /Close drawer/i });
    fireEvent.click(closeBtn);
    expect(screen.queryByTestId('aircraft-detail-drawer')).not.toBeInTheDocument();
  });

  /* -------------------------------------------------------------------------
     3. AIRCREW STATUS TAB
     ------------------------------------------------------------------------- */
  it('switches to aircrew tab, displays fatigue gauge and duty-limit threshold alerts', () => {
    render(<ResourcesPage />);

    // Switch to crew tab
    const crewTabBtn = screen.getByRole('tab', { name: /Aircrew Status/i });
    fireEvent.click(crewTabBtn);

    // Summary tiles
    expect(screen.getByText('Total Flight Crew')).toBeInTheDocument();
    expect(screen.getByText('Available For Sorties')).toBeInTheDocument();
    expect(screen.getByText('Tasked On-Mission')).toBeInTheDocument();
    expect(screen.getByText('Nearing Duty Limits')).toBeInTheDocument();

    // Table headers
    expect(screen.getByText('Callsign & ID')).toBeInTheDocument();
    expect(screen.getByText('Operational Role')).toBeInTheDocument();
    expect(screen.getByText('Home Base')).toBeInTheDocument();
    expect(screen.getByText('Qualifications')).toBeInTheDocument();
    expect(screen.getByText('Duty (24h)')).toBeInTheDocument();
    expect(screen.getByText('Fatigue Gauge')).toBeInTheDocument();

    // Duty limit threshold warning badge on CR-08 (Viper-1, 11.2h / 12h)
    expect(screen.getAllByText(/NEAR LIMIT: 11.2h \/ 12h MAX/i).length).toBeGreaterThan(0);

    // Filter "Nearing Limits Only"
    const limitFilterBtn = screen.getByRole('button', { name: /Nearing Limits Only/i });
    fireEvent.click(limitFilterBtn);

    // CR-08 must remain visible
    expect(screen.getAllByText(/NEAR LIMIT: 11.2h \/ 12h MAX/i).length).toBeGreaterThan(0);
  });

  /* -------------------------------------------------------------------------
     4. WEAPONS & LOGISTICS TAB
     ------------------------------------------------------------------------- */
  it('switches to weapons tab and displays base fuel gauges and inventory matrix', () => {
    render(<ResourcesPage />);

    // Switch to weapons tab
    const weaponsTabBtn = screen.getByRole('tab', { name: /Weapons & Logistics/i });
    fireEvent.click(weaponsTabBtn);

    // Base fuel depot cards
    expect(screen.getByText('Sector Alpha Fighter Base')).toBeInTheDocument();
    expect(screen.getByText('North Bastion Strike Base')).toBeInTheDocument();
    expect(screen.getByText('Charlie Logistics & Transport Hub')).toBeInTheDocument();
    expect(screen.getByText('Delta Eastern Forward Strip')).toBeInTheDocument();

    // Weapons matrix section
    expect(screen.getByText(/Theatre Weapons Magazine Matrix/i)).toBeInTheDocument();
    expect(screen.getByText(/AAM-S \(Short-Range Infrared\)/i)).toBeInTheDocument();
    expect(screen.getByText(/AAM-M \(Medium Radar Guided\)/i)).toBeInTheDocument();
    expect(screen.getByText(/PGM-Mk2 \(Precision Penetrator\)/i)).toBeInTheDocument();

    // Low stock indicator
    const lowStockBadges = screen.getAllByText(/CRITICAL|LOW STOCK/i);
    expect(lowStockBadges.length).toBeGreaterThan(0);
  });

  /* -------------------------------------------------------------------------
     5. PREDICTIVE INSIGHTS TAB
     ------------------------------------------------------------------------- */
  it('switches to predictions tab, shows confidence bars and allows urgency sorting', () => {
    render(<ResourcesPage />);

    // Switch to predictions tab
    const predictionsTabBtn = screen.getByRole('tab', { name: /Predictive Insights/i });
    fireEvent.click(predictionsTabBtn);

    // Predictive insights header & stat badges
    expect(screen.getByText('Active Predictive Alerts')).toBeInTheDocument();
    expect(screen.getByText('Immediate Urgency (≤3h)')).toBeInTheDocument();

    // Seed prediction cards
    expect(screen.getByText(/Aircraft AC-14 likely unserviceable within 6h/i)).toBeInTheDocument();
    expect(screen.getByText(/Crew CR-09 fatigue critical after next sortie/i)).toBeInTheDocument();
    expect(screen.getByText(/Base BASE-C fuel below threshold in 9h/i)).toBeInTheDocument();

    // Confidence ratings
    expect(screen.getByText(/72% Confidence/i)).toBeInTheDocument();
    expect(screen.getByText(/90% Confidence/i)).toBeInTheDocument();

    // Filter by entity type: Aircraft only
    const entitySelect = screen.getByRole('combobox', { name: /Filter by entity type/i });
    fireEvent.change(entitySelect, { target: { value: 'aircraft' } });

    expect(screen.getByText(/Aircraft AC-14 likely unserviceable within 6h/i)).toBeInTheDocument();
    expect(screen.queryByText(/Crew CR-09 fatigue critical/i)).not.toBeInTheDocument();

    // Return to All
    fireEvent.change(entitySelect, { target: { value: 'all' } });
    expect(screen.getByText(/Crew CR-09 fatigue critical/i)).toBeInTheDocument();

    // Toggle Sort by
    const sortBtn = screen.getByRole('button', { name: /Urgency \(Time Horizon\)/i });
    fireEvent.click(sortBtn);
    expect(screen.getByRole('button', { name: /Confidence \(%\)/i })).toBeInTheDocument();
  });
});
