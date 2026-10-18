import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AppLayout } from './AppLayout';
import { useUiStore } from '@/store/uiStore';
import { useRecommendationsStore } from '@/store/recommendationsStore';

describe('Stage 9, Part C: Tactical Keyboard Shortcuts & Help Modal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useUiStore.setState({ isNightMode: false });
    useRecommendationsStore.getState().setRecommendations({});
  });

  it('opens and closes keyboard shortcuts reference modal on ? keypress', () => {
    render(
      <MemoryRouter>
        <AppLayout />
      </MemoryRouter>,
    );

    expect(screen.queryByText(/Tactical Keyboard Shortcuts Reference/i)).not.toBeInTheDocument();

    // Press '?'
    fireEvent.keyDown(window, { key: '?' });
    expect(screen.getByText(/Tactical Keyboard Shortcuts Reference/i)).toBeInTheDocument();
    expect(screen.getByText(/Go to Common Operating Picture/i)).toBeInTheDocument();

    // Press 'Escape' to close
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByText(/Tactical Keyboard Shortcuts Reference/i)).not.toBeInTheDocument();
  });

  it('toggles night mode with N keypress', () => {
    render(
      <MemoryRouter>
        <AppLayout />
      </MemoryRouter>,
    );

    expect(useUiStore.getState().isNightMode).toBe(false);

    // Press 'N'
    fireEvent.keyDown(window, { key: 'n' });
    expect(useUiStore.getState().isNightMode).toBe(true);

    // Press 'N' again
    fireEvent.keyDown(window, { key: 'N' });
    expect(useUiStore.getState().isNightMode).toBe(false);
  });

  it('ignores shortcuts when user is typing inside an input element', () => {
    render(
      <MemoryRouter>
        <AppLayout />
      </MemoryRouter>,
    );

    // Create a mock input in the document
    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();

    // Press '?' while focused in input
    fireEvent.keyDown(input, { key: '?' });
    expect(screen.queryByText(/Tactical Keyboard Shortcuts Reference/i)).not.toBeInTheDocument();

    // Press 'N' while focused in input
    fireEvent.keyDown(input, { key: 'n' });
    expect(useUiStore.getState().isNightMode).toBe(false);

    document.body.removeChild(input);
  });

  it('triggers confirmation dialog on A and R shortcuts when pending recommendation exists', () => {
    useRecommendationsStore.getState().setRecommendations({
      'REC-0001': {
        id: 'REC-0001',
        triggerEventId: 'EV-0001',
        summary: 'Reroute M-04 via Route C',
        score: 88,
        changes: [],
        impactedMissionIds: ['M-04'],
        tradeoffs: [],
        explanation: [],
        constraintsSatisfied: [],
        constraintsRelaxed: [],
        status: 'pending',
        createdAt: new Date().toISOString(),
        stateVersion: 10,
        confidence: 0.85,
        dataFreshnessSec: 2,
      },
    });

    render(
      <MemoryRouter>
        <AppLayout />
      </MemoryRouter>,
    );

    expect(screen.queryByText(/Confirm Commander Approval/i)).not.toBeInTheDocument();

    // Press 'A'
    fireEvent.keyDown(window, { key: 'A' });
    expect(screen.getByText(/Confirm Commander Approval/i)).toBeInTheDocument();
    expect(screen.getByText(/Reroute M-04 via Route C/i)).toBeInTheDocument();

    // Press 'Escape'
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByText(/Confirm Commander Approval/i)).not.toBeInTheDocument();

    // Press 'R'
    fireEvent.keyDown(window, { key: 'R' });
    expect(screen.getByText(/Confirm Commander Rejection/i)).toBeInTheDocument();
  });
});
