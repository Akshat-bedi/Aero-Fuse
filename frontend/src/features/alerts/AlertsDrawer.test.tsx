import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AlertsDrawer } from '@/app/AlertsDrawer';
import { useAlertsStore } from '@/store/alertsStore';
import { OperationalAlert } from '@/types';

describe('Stage 9: AlertsDrawer & Alerts Store', () => {
  const sampleAlerts: OperationalAlert[] = [
    {
      id: 'ALT-1001',
      title: 'SAM Radar Acquisition Contact',
      message: 'Active radar emitter detected near Corridor Alpha.',
      details: 'Active radar emitter detected near Corridor Alpha.',
      severity: 'critical',
      type: 'threat',
      timestamp: '2026-03-14T06:30:00Z',
      acknowledged: false,
      location: 'Sector North Buffer',
    },
    {
      id: 'ALT-1002',
      title: 'Runway Degraded: Crosswind Warning',
      message: 'Crosswinds exceeding 28 knots at North Bastion.',
      details: 'Crosswinds exceeding 28 knots at North Bastion.',
      severity: 'warning',
      type: 'weather',
      timestamp: '2026-03-14T06:31:00Z',
      acknowledged: false,
      location: 'North Bastion (BASE-B)',
    },
    {
      id: 'ALT-1003',
      title: 'Crew Rest Cycle Complete',
      message: 'Lead pilot CR-01 cleared for flight operations.',
      details: 'Lead pilot CR-01 cleared for flight operations.',
      severity: 'info',
      type: 'crew',
      timestamp: '2026-03-14T06:32:00Z',
      acknowledged: true,
      location: 'Vanguard Alpha (BASE-A)',
    },
  ];

  beforeEach(() => {
    useAlertsStore.getState().setAlerts(sampleAlerts);
    useAlertsStore.getState().setDrawerOpen(true);
    useAlertsStore.getState().setSeverityFilter('all');
    useAlertsStore.getState().setTypeFilter('all');
    useAlertsStore.getState().setAudioMuted(true);
  });

  it('renders drawer header, unacknowledged badge, and initial alert list', () => {
    render(<AlertsDrawer />);

    expect(screen.getByText('Tactical Alerts')).toBeInTheDocument();
    // 2 unacknowledged alerts (ALT-1001, ALT-1002)
    expect(screen.getByText('2 UNACK')).toBeInTheDocument();

    expect(screen.getByText('SAM Radar Acquisition Contact')).toBeInTheDocument();
    expect(screen.getByText('Runway Degraded: Crosswind Warning')).toBeInTheDocument();
    expect(screen.getByText('Crew Rest Cycle Complete')).toBeInTheDocument();
  });

  it('filters alerts by severity (critical, warning, info)', () => {
    render(<AlertsDrawer />);

    // Click "CRITICAL" filter button
    const criticalBtn = screen.getByRole('button', { name: /^critical$/i });
    fireEvent.click(criticalBtn);

    expect(screen.getByText('SAM Radar Acquisition Contact')).toBeInTheDocument();
    expect(screen.queryByText('Runway Degraded: Crosswind Warning')).not.toBeInTheDocument();
    expect(screen.queryByText('Crew Rest Cycle Complete')).not.toBeInTheDocument();

    // Click "ALL" filter button
    const allBtn = screen.getByRole('button', { name: /^all$/i });
    fireEvent.click(allBtn);

    expect(screen.getByText('SAM Radar Acquisition Contact')).toBeInTheDocument();
    expect(screen.getByText('Runway Degraded: Crosswind Warning')).toBeInTheDocument();
  });

  it('filters alerts by operational type dropdown', () => {
    render(<AlertsDrawer />);

    const typeSelect = screen.getByLabelText(/filter alerts by type/i);
    fireEvent.change(typeSelect, { target: { value: 'weather' } });

    expect(screen.getByText('Runway Degraded: Crosswind Warning')).toBeInTheDocument();
    expect(screen.queryByText('SAM Radar Acquisition Contact')).not.toBeInTheDocument();
  });

  it('acknowledges an individual alert when clicking Acknowledge button', () => {
    render(<AlertsDrawer />);

    const ackButtons = screen.getAllByRole('button', { name: /^Acknowledge$/i });
    expect(ackButtons.length).toBe(2);

    // Click Acknowledge on first alert
    fireEvent.click(ackButtons[0]);

    // Check store updated
    const updatedAlerts = useAlertsStore.getState().alerts;
    expect(updatedAlerts.find((a) => a.id === 'ALT-1001')?.acknowledged).toBe(true);
  });

  it('acknowledges all alerts when clicking Ack All', () => {
    render(<AlertsDrawer />);

    const ackAllBtn = screen.getByRole('button', { name: /Ack All/i });
    fireEvent.click(ackAllBtn);

    const updatedAlerts = useAlertsStore.getState().alerts;
    expect(updatedAlerts.every((a) => a.acknowledged)).toBe(true);
  });

  it('toggles audio mute state when clicking mute button', () => {
    render(<AlertsDrawer />);

    expect(useAlertsStore.getState().isAudioMuted).toBe(true);

    const muteBtn = screen.getByLabelText(/unmute alert audio/i);
    fireEvent.click(muteBtn);

    expect(useAlertsStore.getState().isAudioMuted).toBe(false);

    const activeAudioBtn = screen.getByLabelText(/mute alert audio/i);
    fireEvent.click(activeAudioBtn);

    expect(useAlertsStore.getState().isAudioMuted).toBe(true);
  });
});
