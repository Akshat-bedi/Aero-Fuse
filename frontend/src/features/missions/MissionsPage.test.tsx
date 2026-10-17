import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, within, act } from '@testing-library/react';
import { MissionsPage } from './MissionsPage';
import { useEntitiesStore } from '@/store/entitiesStore';
import { useRecommendationsStore } from '@/store/recommendationsStore';
import { useUiStore } from '@/store/uiStore';
import { mockDataService } from '@/services/mockDataService';
import { detectMissionConflicts } from './conflictDetection';

describe('MissionsPage (Mission Board & Sortie Timeline)', () => {
  beforeEach(async () => {
    // Reset to clean baseline by default
    if (mockDataService.setMockConflictsEnabled) {
      mockDataService.setMockConflictsEnabled(false);
    }
    const snapshot = await mockDataService.getSnapshot();
    useEntitiesStore.getState().setSnapshot(snapshot);
    useRecommendationsStore.getState().setRecommendations(snapshot.recommendations || {});
    useUiStore.setState({
      selectedMissionId: null,
      selectedAircraftId: null,
      selectedAirbaseId: null,
      selectedThreatId: null,
    });
  });

  it('renders the ATO summary metrics header and clean nominal baseline (zero conflicts)', () => {
    render(<MissionsPage />);

    expect(screen.getByText('Total ATO Sorties')).toBeInTheDocument();
    expect(screen.getByText('Airborne / Active')).toBeInTheDocument();
    expect(screen.getByText('Planned / Approved')).toBeInTheDocument();
    expect(screen.getByText('At-Risk Sorties')).toBeInTheDocument();
    expect(screen.getByText('Active Conflicts')).toBeInTheDocument();

    // In default clean baseline, there are 0 active conflicts so no alert banner is rendered
    expect(screen.queryByTestId('conflict-alert-banner')).not.toBeInTheDocument();
  });

  it('renders all 5 Kanban board columns with status badges and baseline cards', () => {
    render(<MissionsPage />);

    expect(screen.getByTestId('kanban-column-planned')).toBeInTheDocument();
    expect(screen.getByTestId('kanban-column-approved')).toBeInTheDocument();
    expect(screen.getByTestId('kanban-column-in-progress')).toBeInTheDocument();
    expect(screen.getByTestId('kanban-column-at-risk')).toBeInTheDocument();
    expect(screen.getByTestId('kanban-column-completed')).toBeInTheDocument();

    // Check specific seeded baseline missions (M-01..M-10)
    expect(screen.getByText('Northern Sentinel (CAP)')).toBeInTheDocument();
    expect(screen.getByText('Central Precision Strike Sortie')).toBeInTheDocument();
    expect(screen.getByText('Quick Reaction Alert (QRA)')).toBeInTheDocument();
  });

  it('switches between Kanban Board, Sortie Timeline, and Data Table views', () => {
    render(<MissionsPage />);

    // Default is Board view
    expect(screen.getByTestId('mission-board-view')).toBeInTheDocument();

    // Toggle to Sortie Timeline
    const timelineToggle = screen.getByTestId('view-toggle-timeline');
    fireEvent.click(timelineToggle);
    expect(screen.getByTestId('sortie-timeline')).toBeInTheDocument();
    expect(screen.getByText('Sortie Schedule Timeline')).toBeInTheDocument();
    expect(screen.getByText(/SIM NOW:/i)).toBeInTheDocument();

    // Toggle to Data Table
    const tableToggle = screen.getByTestId('view-toggle-table');
    fireEvent.click(tableToggle);
    expect(screen.getByTestId('mission-table-view')).toBeInTheDocument();
    expect(screen.getByText('Sortie Window')).toBeInTheDocument();
    expect(screen.getByText('Assigned Aircraft')).toBeInTheDocument();

    // Return to Board
    const boardToggle = screen.getByTestId('view-toggle-board');
    fireEvent.click(boardToggle);
    expect(screen.getByTestId('mission-board-view')).toBeInTheDocument();
  });

  it('filters missions by search query, mission type, and priority', () => {
    render(<MissionsPage />);

    const searchInput = screen.getByPlaceholderText(/Search sorties/i);
    fireEvent.change(searchInput, { target: { value: 'Precision Strike' } });

    // Only Central Precision Strike Sortie should match
    expect(screen.getByText('Central Precision Strike Sortie')).toBeInTheDocument();
    expect(screen.queryByText('Northern Sentinel (CAP)')).not.toBeInTheDocument();

    // Clear search
    fireEvent.change(searchInput, { target: { value: '' } });
    expect(screen.getByText('Northern Sentinel (CAP)')).toBeInTheDocument();

    // Filter by CAP type
    const selects = screen.getAllByRole('combobox');
    const typeSelect = selects[1]; // Type is 2nd select
    fireEvent.change(typeSelect, { target: { value: 'CAP' } });

    expect(screen.getByText('Northern Sentinel (CAP)')).toBeInTheDocument();
    expect(screen.getByText('Quick Reaction Alert (QRA)')).toBeInTheDocument();
    expect(screen.queryByText('Central Precision Strike Sortie')).not.toBeInTheDocument();
  });

  it('detects scheduling conflicts and renders alert banner when conflict demo layer is enabled', async () => {
    // Enable conflict demo layer
    if (mockDataService.setMockConflictsEnabled) {
      mockDataService.setMockConflictsEnabled(true);
    }
    const snapshot = await mockDataService.getSnapshot();
    useEntitiesStore.getState().setSnapshot(snapshot);
    useRecommendationsStore.getState().setRecommendations(snapshot.recommendations || {});

    render(<MissionsPage />);

    // Conflict banner should now be visible
    expect(screen.getByTestId('conflict-alert-banner')).toBeInTheDocument();
    expect(screen.getByText(/Scheduling & Readiness Conflicts Detected/i)).toBeInTheDocument();

    const { missions, aircraft, crew } = useEntitiesStore.getState();
    const missionsList = Object.values(missions);

    const { allConflicts, conflictsByMission } = detectMissionConflicts(
      missionsList,
      aircraft,
      crew,
      45,
    );

    // 1. Double-booked aircraft check (AC-04 on M-06 and M-13)
    const doubleBooked = allConflicts.filter((c) => c.type === 'double_booked_aircraft');
    expect(doubleBooked.length).toBeGreaterThan(0);
    expect(doubleBooked.some((c) => c.entityId === 'AC-04')).toBe(true);
    expect(conflictsByMission.get('M-06')?.length).toBeGreaterThan(0);

    // 2. Insufficient turnaround window check (AC-09 between M-07 and M-14 is 15 min < 45 min)
    const turnaroundConflicts = allConflicts.filter((c) => c.type === 'insufficient_turnaround');
    expect(turnaroundConflicts.length).toBeGreaterThan(0);
    expect(turnaroundConflicts.some((c) => c.entityId === 'AC-09')).toBe(true);

    // 3. Crew duty limit breach (>12h) on CR-08 (dutyHours 11.2h + 4h sortie = 15.2h)
    const dutyConflicts = allConflicts.filter((c) => c.type === 'crew_duty_limit_breach');
    expect(dutyConflicts.length).toBeGreaterThan(0);
    expect(dutyConflicts.some((c) => c.entityId === 'CR-08')).toBe(true);

    // 4. Aircraft type mismatch on M-11 (requires Strike-B, but AC-23 Helicopter-E is assigned)
    const mismatches = allConflicts.filter((c) => c.type === 'resource_mismatch');
    expect(mismatches.length).toBeGreaterThan(0);
  });

  it('renders ghost bars on SortieTimeline when recommendations are loaded', async () => {
    // Enable conflict layer to load REC-0001
    if (mockDataService.setMockConflictsEnabled) {
      mockDataService.setMockConflictsEnabled(true);
    }
    const snapshot = await mockDataService.getSnapshot();
    useEntitiesStore.getState().setSnapshot(snapshot);
    useRecommendationsStore.getState().setRecommendations(snapshot.recommendations || {});

    render(<MissionsPage />);

    // Switch to Timeline view
    fireEvent.click(screen.getByTestId('view-toggle-timeline'));

    // Ghost bar for REC-0001 (proposed retask of AC-05)
    const ghostBar = screen.getByTestId('ghost-bar-REC-0001');
    expect(ghostBar).toBeInTheDocument();
    expect(within(ghostBar).getByText(/PROPOSED RETASK \(REC-0001\)/i)).toBeInTheDocument();
    expect(within(ghostBar).getByText(/SCORE 94/i)).toBeInTheDocument();
  });

  it('opens MissionDetailDrawer on mission selection and displays requirements vs assigned mismatches', async () => {
    // Enable conflict layer so M-11 is available
    if (mockDataService.setMockConflictsEnabled) {
      mockDataService.setMockConflictsEnabled(true);
    }
    const snapshot = await mockDataService.getSnapshot();
    useEntitiesStore.getState().setSnapshot(snapshot);

    render(<MissionsPage />);

    // Click on M-11 card (Northern Interdiction Strike which has mismatch)
    const m11Card = screen.getByText('Northern Interdiction Strike');
    fireEvent.click(m11Card);

    // Detail drawer should be mounted and open
    const drawer = screen.getByTestId('mission-detail-drawer');
    expect(drawer).toBeInTheDocument();
    expect(within(drawer).getByText('M-11')).toBeInTheDocument();

    // Verify Requirements vs. Assigned section highlights mismatches
    expect(within(drawer).getByText('Requirements vs. Assigned Resources')).toBeInTheDocument();
    expect(within(drawer).getByText('MISMATCH DETECTED')).toBeInTheDocument();
    expect(within(drawer).getByText(/Type disparity/i)).toBeInTheDocument();

    // Verify SVG vector mini-map is rendered with waypoints and threat circles
    const svgMap = drawer.querySelector('svg');
    expect(svgMap).toBeInTheDocument();
    expect(drawer.querySelector('polyline')).toBeInTheDocument();

    // Close drawer
    const closeBtn = screen.getByRole('button', { name: /Close drawer/i });
    fireEvent.click(closeBtn);
    expect(screen.queryByTestId('mission-detail-drawer')).not.toBeInTheDocument();
  });

  it('allows commander to approve planned sorties', () => {
    render(<MissionsPage />);

    // Select M-06 (planned QRA mission)
    const m06Card = screen.getByText('Quick Reaction Alert (QRA)');
    fireEvent.click(m06Card);

    const drawer = screen.getByTestId('mission-detail-drawer');
    const approveBtn = within(drawer).getByRole('button', { name: /Approve ATO Sortie/i });
    expect(approveBtn).toBeInTheDocument();

    fireEvent.click(approveBtn);

    // Verify mission status was updated in store
    const updatedM06 = useEntitiesStore.getState().missions['M-06'];
    expect(updatedM06.status).toBe('approved');
  });

  it('synchronizes selectedMissionId across components via useUiStore (4-way sync)', () => {
    render(<MissionsPage />);

    // Select mission via store directly
    act(() => {
      useUiStore.getState().selectMission('M-01');
    });

    // Drawer should automatically open for M-01
    const drawer = screen.getByTestId('mission-detail-drawer');
    expect(drawer).toBeInTheDocument();
    expect(within(drawer).getByText('Northern Sentinel (CAP)')).toBeInTheDocument();
  });
});
