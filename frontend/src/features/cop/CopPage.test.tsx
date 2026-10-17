import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CopPage } from './CopPage';
import { useEntitiesStore } from '@/store';
import { mockDataService } from '@/services/mockDataService';

describe('CopPage (Common Operating Picture Hero Screen)', () => {
  beforeEach(async () => {
    // Populate entities store from mock data service snapshot
    const snapshot = await mockDataService.getSnapshot();
    useEntitiesStore.getState().setSnapshot(snapshot);
  });

  it('renders tactical COP header with operational metrics and simulation controls', () => {
    render(<CopPage />);

    // Tactical HUD metrics
    expect(screen.getByText(/AIRBORNE:/i)).toBeInTheDocument();
    expect(screen.getByText(/ACTIVE SORTIES:/i)).toBeInTheDocument();
    expect(screen.getByText(/THREATS:/i)).toBeInTheDocument();

    // Simulation Time Controls
    expect(screen.getByText(/SIM ZULU:/i)).toBeInTheDocument();
    expect(screen.getByText('1x')).toBeInTheDocument();
    expect(screen.getByText('5x')).toBeInTheDocument();
    expect(screen.getByText('20x')).toBeInTheDocument();

    // Bottom vector HUD
    expect(screen.getByText(/LOCAL VECTOR ENGINE: 60 FPS NOMINAL/i)).toBeInTheDocument();
  });

  it('allows expanding and toggling layers in the LayerControlPanel', () => {
    render(<CopPage />);

    // Layer control toggle button
    const layerBtn = screen.getByRole('button', { name: /Tactical Layers & Legend/i });
    expect(layerBtn).toBeInTheDocument();

    // Expand layer control panel
    fireEvent.click(layerBtn);
    expect(screen.getByText(/ACTIVE OVERLAYS/i)).toBeInTheDocument();

    // Switch to tactical symbology legend tab
    const legendTab = screen.getByRole('button', { name: /Symbology Legend/i });
    fireEvent.click(legendTab);
    expect(screen.getByText(/Airbase Runway Status/i)).toBeInTheDocument();
    expect(screen.getByText(/Mission Routes & Priorities/i)).toBeInTheDocument();
    expect(screen.getByText(/Threat Envelopes/i)).toBeInTheDocument();
  });

  it('allows simulation speed and pause toggling via TimeControls', () => {
    render(<CopPage />);

    // Click 5x speed button
    const btn5x = screen.getByText('5x');
    fireEvent.click(btn5x);
    expect(btn5x).toHaveClass('bg-command-primary');

    // Click Pause / Play
    const playPauseBtn = screen.getByTitle(/Pause Simulation/i);
    fireEvent.click(playPauseBtn);
    expect(screen.getByTitle(/Resume Simulation/i)).toBeInTheDocument();
  });

  it('detects route hazards on M-04 and provides one-click Route C Detour preview', () => {
    render(<CopPage />);

    // Open quick jump menu and select M-04
    const jumpBtn = screen.getByRole('button', { name: /Tactical Jump/i });
    fireEvent.click(jumpBtn);

    const m4Option = screen.getByText(/M-04 Strike/i);
    fireEvent.click(m4Option);

    // Hazard indicator should now be visible for M-04 penetrating SAM envelope
    expect(screen.getByText(/TACTICAL HAZARD DETECTED \(M-04\)/i)).toBeInTheDocument();
    expect(screen.getByText(/Preview Route C Detour/i)).toBeInTheDocument();

    // Entity detail panel should also be open for M-04
    expect(screen.getByText(/Central Precision Strike Sortie/i)).toBeInTheDocument();

    // Click Route C detour preview
    const previewBtn = screen.getByText(/Preview Route C Detour/i);
    fireEvent.click(previewBtn);

    // Flight path becomes nominal
    expect(screen.getByText(/FLIGHT PATH NOMINAL/i)).toBeInTheDocument();
  });

  it('renders entity detail panel when selecting aircraft AC-01 and allows closing', () => {
    render(<CopPage />);

    // Open jump menu and select AC-01
    const jumpBtn = screen.getByRole('button', { name: /Tactical Jump/i });
    fireEvent.click(jumpBtn);

    const acOption = screen.getByText(/AC-01 \(Fighter-A CAP\)/i);
    fireEvent.click(acOption);

    // Detail panel for AC-01
    expect(screen.getByText('VR-F01')).toBeInTheDocument();
    expect(screen.getByText(/VAPOR-11/i)).toBeInTheDocument();
    expect(screen.getByText(/Fuel Reserves:/i)).toBeInTheDocument();
    expect(screen.getByText(/Designated Aircrew/i)).toBeInTheDocument();

    // Close button
    const closeBtn = screen.getByRole('button', { name: /Close panel/i });
    fireEvent.click(closeBtn);

    // Panel dismissed
    expect(screen.queryByText('VR-F01')).not.toBeInTheDocument();
  });

  it('renders base detail when selecting BASE-B', () => {
    render(<CopPage />);

    // Open jump menu and select BASE-B
    const jumpBtn = screen.getByRole('button', { name: /Tactical Jump/i });
    fireEvent.click(jumpBtn);

    const baseOption = screen.getByText(/BASE-B Bastion Strike/i);
    fireEvent.click(baseOption);

    // Detail panel for BASE-B
    expect(screen.getByText('North Bastion Strike Base')).toBeInTheDocument();
    expect(screen.getByText(/Aviation Fuel Stock/i)).toBeInTheDocument();
    expect(screen.getByText(/Shelter Capacity/i)).toBeInTheDocument();
    expect(screen.getByText(/Stationed Airframes/i)).toBeInTheDocument();
  });
});
