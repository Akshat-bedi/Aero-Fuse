import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import App from '@/App';
import { formatTimeZulu } from '@/lib/utils';
import { serviceConfig } from '@/services/config';

describe('App Shell & Navigation', () => {
  it('renders the AirOps DSS top bar and classification banner', () => {
    render(<App />);

    // Top bar brand
    expect(screen.getByText(/AirOps/i)).toBeInTheDocument();
    expect(screen.getAllByText(/DSS/i).length).toBeGreaterThan(0);

    // Simulated data classification banner
    expect(screen.getByText(/EXERCISE \/ SIMULATED DATA/i)).toBeInTheDocument();

    // Live clock indicators
    expect(screen.getByText('ZULU')).toBeInTheDocument();
    expect(screen.getByText('LOC')).toBeInTheDocument();

    // Navigation items
    expect(screen.getByRole('link', { name: /Common Picture/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Missions/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Resources/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Recommendations/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Scenarios/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Alerts/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Audit Log/i })).toBeInTheDocument();
  });

  it('can open and close the alerts drawer', () => {
    render(<App />);

    const alertToggleBtn = screen.getByRole('button', { name: /Toggle Alerts Drawer/i });
    expect(screen.queryByText(/Live Tactical Alerts/i)).not.toBeInTheDocument();

    // Click to open
    fireEvent.click(alertToggleBtn);
    expect(screen.getByText(/Live Tactical Alerts/i)).toBeInTheDocument();

    // Click to close
    const closeBtn = screen.getByRole('button', { name: /Close alerts drawer/i });
    fireEvent.click(closeBtn);
    expect(screen.queryByText(/Live Tactical Alerts/i)).not.toBeInTheDocument();
  });

  it('toggles night mode class on document element', () => {
    render(<App />);

    const nightModeBtn = screen.getByRole('button', { name: /Toggle Night Vision Mode/i });
    expect(document.documentElement.classList.contains('night-mode')).toBe(false);

    // Toggle on
    fireEvent.click(nightModeBtn);
    expect(document.documentElement.classList.contains('night-mode')).toBe(true);

    // Toggle off
    fireEvent.click(nightModeBtn);
    expect(document.documentElement.classList.contains('night-mode')).toBe(false);
  });

  it('validates domain utility functions and service configuration', () => {
    const zuluTime = formatTimeZulu(new Date('2026-10-17T12:30:00Z'));
    expect(zuluTime).toBe('1230Z');
    expect(serviceConfig.dataSource).toBe('mock');
    expect(serviceConfig.isMock).toBe(true);
  });

  it('renders developer debug links and mounts entities store', () => {
    render(<App />);

    expect(screen.getByRole('link', { name: /Data Engine & Stores/i })).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: /Component Gallery/i }).length).toBeGreaterThan(0);
  });
});
