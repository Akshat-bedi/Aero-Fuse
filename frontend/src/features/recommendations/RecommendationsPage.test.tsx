import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { RecommendationsPage } from './RecommendationsPage';
import { useRecommendationsStore } from '@/store/recommendationsStore';
import { useEntitiesStore } from '@/store/entitiesStore';
import { mockDataService } from '@/services/mockDataService';
import { Recommendation } from '@/types';

describe('Stage 7: RecommendationsPage & RecommendationCard', () => {
  const sampleRec: Recommendation = {
    id: 'REC-0001',
    triggerEventId: 'EV-0015',
    summary: 'Reroute M-04 via Route C; swap AC-07 for AC-11 on M-07',
    score: 86.4,
    changes: [
      {
        missionId: 'M-07',
        kind: 'aircraft_swap',
        before: 'AC-07',
        after: 'AC-11',
        note: 'AC-07 fuel insufficient on new route',
      },
      {
        missionId: 'M-04',
        kind: 'reroute',
        before: 'Route B',
        after: 'Route C',
        note: 'Route B inside active SAM envelope',
      },
    ],
    impactedMissionIds: ['M-04', 'M-07'],
    tradeoffs: [
      { label: 'Total delay', delta: 20, unit: 'min', direction: 'bad' },
      { label: 'Threat exposure', delta: -92, unit: '%', direction: 'good' },
      { label: 'Fuel burn', delta: 8, unit: '%', direction: 'bad' },
    ],
    explanation: [
      'Route B intersects THR-02 (SAM, 85 km radius, confidence 0.90).',
      'AC-11 is the only serviceable Strike-B at BASE-B with 4x PGM-Mk2 and sufficient range.',
    ],
    constraintsSatisfied: [
      'Aircraft type match',
      'Crew qualifications',
      'Weapon availability',
      'No double-booking',
    ],
    constraintsRelaxed: [
      'M-09 launch delayed 20 min (within 30 min tolerance)',
    ],
    alternatives: [
      {
        id: 'REC-0001-ALT1',
        triggerEventId: 'EV-0015',
        summary: 'Option B: Hold at Egress Orbit until SEAD suppression clears corridor.',
        score: 72,
        changes: [
          {
            missionId: 'M-04',
            kind: 'delay',
            before: 'Route B',
            after: 'Hold Orbit Bravo',
            note: 'Orbit holding pattern 40 km north of threat envelope',
          },
        ],
        impactedMissionIds: ['M-04'],
        tradeoffs: [
          { label: 'Time-on-Station Reduction', delta: -25, unit: 'min', direction: 'bad' },
          { label: 'Threat Exposure Risk', delta: -70, unit: '%', direction: 'good' },
        ],
        explanation: ['Holding orbit keeps strike package out of SAM engagement envelope.'],
        constraintsSatisfied: ['Threat engagement buffer maintained'],
        constraintsRelaxed: ['Time on station relaxed by 25 min'],
        status: 'pending',
        createdAt: '2026-03-14T06:30:05Z',
        stateVersion: 412,
        confidence: 0.82,
        dataFreshnessSec: 8,
      },
    ],
    status: 'pending',
    createdAt: '2026-03-14T06:30:05Z',
    stateVersion: 412,
    confidence: 0.94,
    dataFreshnessSec: 8,
  };

  beforeEach(async () => {
    const snapshot = await mockDataService.getSnapshot();
    useEntitiesStore.getState().setSnapshot(snapshot);
    useRecommendationsStore.getState().setRecommendations({
      [sampleRec.id]: sampleRec,
    });
    useRecommendationsStore.getState().selectRecommendation(sampleRec.id);
  });

  it('renders page header with code DSS-REC-07 and summary metrics', () => {
    render(<RecommendationsPage />);

    expect(screen.getByText('DSS-REC-07')).toBeInTheDocument();
    expect(screen.getByText('Dynamic Retasking & Recommendations')).toBeInTheDocument();
    expect(screen.getByText('Total Proposals Evaluated')).toBeInTheDocument();
    expect(screen.getByText('Pending Action')).toBeInTheDocument();
    expect(screen.getByText('Mean Feasibility Score')).toBeInTheDocument();
  });

  it('displays the mandatory label "RECOMMENDATION ONLY - REQUIRES COMMANDER APPROVAL" on the card', () => {
    render(<RecommendationsPage />);

    expect(
      screen.getByText('RECOMMENDATION ONLY - REQUIRES COMMANDER APPROVAL'),
    ).toBeInTheDocument();
  });

  it('renders proposed changes diff with before and after states', () => {
    render(<RecommendationsPage />);

    expect(screen.getByText(/Proposed Master Sortie Changes/i)).toBeInTheDocument();
    expect(screen.getByText('AC-07')).toBeInTheDocument();
    expect(screen.getByText('AC-11')).toBeInTheDocument();
    expect(screen.getByText('Route B')).toBeInTheDocument();
    expect(screen.getByText('Route C')).toBeInTheDocument();
  });

  it('renders operational trade-offs with delta and direction', () => {
    render(<RecommendationsPage />);

    expect(screen.getByText('Total delay')).toBeInTheDocument();
    expect(screen.getByText('+20 min')).toBeInTheDocument();
    expect(screen.getByText('Threat exposure')).toBeInTheDocument();
    expect(screen.getByText('-92 %')).toBeInTheDocument();
  });

  it('renders "Why This Recommendation" section with constraints satisfied and relaxed', () => {
    render(<RecommendationsPage />);

    expect(screen.getByText(/Why This Recommendation/i)).toBeInTheDocument();
    expect(screen.getByText(/Route B intersects THR-02/i)).toBeInTheDocument();

    // Satisfied constraints (green)
    expect(screen.getByText('Aircraft type match')).toBeInTheDocument();
    expect(screen.getByText('Crew qualifications')).toBeInTheDocument();

    // Relaxed constraints (prominent amber warning)
    expect(screen.getByText('Constraints Relaxed (Warning)')).toBeInTheDocument();
    expect(
      screen.getByText('M-09 launch delayed 20 min (within 30 min tolerance)'),
    ).toBeInTheDocument();
  });

  it('switches to Alternatives tab and displays comparative criteria analysis', () => {
    render(<RecommendationsPage />);

    const altTabBtn = screen.getByRole('button', { name: /Compare Alternatives/i });
    fireEvent.click(altTabBtn);

    expect(screen.getByText('Tactical Criteria Comparative Analysis')).toBeInTheDocument();
    expect(screen.getByText('Overall Feasibility')).toBeInTheDocument();
    expect(screen.getByText('Threat Avoidance')).toBeInTheDocument();
  });

  it('opens confirmation modal on Approve and calls decideRecommendation with approved', async () => {
    const decideSpy = vi.spyOn(mockDataService, 'decideRecommendation');
    render(<RecommendationsPage />);

    const approveBtn = screen.getByRole('button', { name: /Approve Plan/i });
    fireEvent.click(approveBtn);

    expect(screen.getByText('COMMANDER DIRECTIVE: APPROVE RETASK PLAN')).toBeInTheDocument();

    const confirmBtn = screen.getByRole('button', { name: /CONFIRM & EXECUTE RETASK/i });
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(decideSpy).toHaveBeenCalledWith(
        'REC-0001',
        'approved',
        undefined,
        expect.any(String),
        'COMMANDER_OPS',
      );
    });
  });

  it('opens rejection modal with reason selector on Reject and calls decideRecommendation with rejected', async () => {
    const decideSpy = vi.spyOn(mockDataService, 'decideRecommendation');
    render(<RecommendationsPage />);

    const rejectBtn = screen.getByRole('button', { name: /Reject/i });
    fireEvent.click(rejectBtn);

    expect(screen.getByText('COMMANDER DIRECTIVE: REJECT RETASK PLAN')).toBeInTheDocument();
    expect(screen.getByLabelText(/Rejection Reason/i)).toBeInTheDocument();

    const confirmRejectBtn = screen.getByRole('button', { name: /CONFIRM REJECTION/i });
    fireEvent.click(confirmRejectBtn);

    await waitFor(() => {
      expect(decideSpy).toHaveBeenCalledWith(
        'REC-0001',
        'rejected',
        undefined,
        expect.stringContaining('Tactical priorities superseded'),
        'COMMANDER_OPS',
      );
    });
  });

  it('supports Modify mode with eligible resource selection and re-validation', async () => {
    render(<RecommendationsPage />);

    const modifyBtn = screen.getByRole('button', { name: /Modify/i });
    fireEvent.click(modifyBtn);

    await waitFor(() => {
      expect(screen.getByText(/Manual Assignment Swap & Instant Re-validation/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/Substitute Aircraft/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/Substitute Aircrew/i)).toBeInTheDocument();
    });
  });
});
