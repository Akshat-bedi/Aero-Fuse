import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { AuditLogPage } from './AuditLogPage';
import { useAuditStore } from '@/store/auditStore';
import { mockDataService } from '@/services/mockDataService';
import { AuditEntry } from '@/types';

describe('Stage 7: AuditLogPage (Immutable Operational Audit Trail)', () => {
  const sampleEntries: AuditEntry[] = [
    {
      id: 'AUD-0001',
      timestamp: '2026-03-14T06:30:00Z',
      action: 'EVENT_INJECTED',
      targetId: 'EV-0001',
      operator: 'INTEL_DESK_01',
      details: 'Contingency event THREAT_DETECTED injected: SAM contact detected at Sector B',
      prevHash: '0000000000000000000000000000000000000000000000000000000000000000',
      hash: 'a1b2c3d4e5f60718293a4b5c6d7e8f901234567890abcdef1234567890abcdef',
    },
    {
      id: 'AUD-0002',
      timestamp: '2026-03-14T06:31:15Z',
      action: 'DECISION_APPROVE',
      targetId: 'REC-0001',
      operator: 'COMMANDER_OPS',
      details: 'Commander confirmed and approved retask plan REC-0001: reroute M-04 via Route C',
      prevHash: 'a1b2c3d4e5f60718293a4b5c6d7e8f901234567890abcdef1234567890abcdef',
      hash: 'f0e1d2c3b4a5968778695a4b3c2d1e0f0918273645abcdef543210fedcba9876',
    },
    {
      id: 'AUD-0003',
      timestamp: '2026-03-14T06:35:40Z',
      action: 'DECISION_REJECT',
      targetId: 'REC-0002',
      operator: 'COMMANDER_OPS',
      details: 'Tactical priorities superseded; baseline retained without modification',
      prevHash: 'f0e1d2c3b4a5968778695a4b3c2d1e0f0918273645abcdef543210fedcba9876',
      hash: '99887766554433221100aabbccddeeff00112233445566778899aabbccddeeff',
    },
  ];

  beforeEach(() => {
    useAuditStore.getState().setAuditLog(sampleEntries);
  });

  it('renders page header with code AUD-SEC-07 and metrics summary tiles', () => {
    render(<AuditLogPage />);

    expect(screen.getByText('AUD-SEC-07')).toBeInTheDocument();
    expect(screen.getByText('Operational Audit Trail')).toBeInTheDocument();
    expect(screen.getByText('Total Ledger Blocks')).toBeInTheDocument();
    expect(screen.getByText('Commander Directives')).toBeInTheDocument();
    expect(screen.getByText('Contingencies Injected')).toBeInTheDocument();
  });

  it('renders table columns and audit entry details', () => {
    render(<AuditLogPage />);

    // Columns
    expect(screen.getByText('Zulu Time')).toBeInTheDocument();
    expect(screen.getByText('Log ID')).toBeInTheDocument();
    expect(screen.getByText('Action')).toBeInTheDocument();
    expect(screen.getByText('Target ID')).toBeInTheDocument();
    expect(screen.getByText('Operator')).toBeInTheDocument();
    expect(screen.getByText('Details & Operational Rationale')).toBeInTheDocument();
    expect(screen.getByText('Block Hash (SHA-256)')).toBeInTheDocument();

    // Data items inside the table
    const table = screen.getByRole('table');
    expect(within(table).getByText('AUD-0001')).toBeInTheDocument();
    expect(within(table).getByText('AUD-0002')).toBeInTheDocument();
    expect(within(table).getByText('AUD-0003')).toBeInTheDocument();
    expect(within(table).getByText('DECISION_APPROVE')).toBeInTheDocument();
    expect(within(table).getByText('DECISION_REJECT')).toBeInTheDocument();
    expect(within(table).getByText('REC-0001')).toBeInTheDocument();
    expect(within(table).getByText('INTEL_DESK_01')).toBeInTheDocument();
  });

  it('filters audit entries by action category (e.g. Decisions Only)', () => {
    render(<AuditLogPage />);

    const actionSelect = screen.getByLabelText(/Filter by action/i);
    fireEvent.change(actionSelect, { target: { value: 'DECISIONS_ONLY' } });

    const table = screen.getByRole('table');
    // Should show DECISION_APPROVE and DECISION_REJECT, but not EVENT_INJECTED in table
    expect(within(table).getByText('DECISION_APPROVE')).toBeInTheDocument();
    expect(within(table).getByText('DECISION_REJECT')).toBeInTheDocument();
    expect(within(table).queryByText('EVENT_INJECTED')).not.toBeInTheDocument();
  });

  it('filters audit entries by search query', () => {
    render(<AuditLogPage />);

    const searchInput = screen.getByPlaceholderText(/Filter by ID, target, operator, details.../i);
    fireEvent.change(searchInput, { target: { value: 'Route C' } });

    const table = screen.getByRole('table');
    expect(within(table).getByText('AUD-0002')).toBeInTheDocument();
    expect(within(table).queryByText('AUD-0001')).not.toBeInTheDocument();
    expect(within(table).queryByText('AUD-0003')).not.toBeInTheDocument();
  });

  it('runs cryptographic hash-chain verification when clicking verify button', async () => {
    const verifySpy = vi.spyOn(mockDataService, 'verifyAudit');
    render(<AuditLogPage />);

    const verifyBtn = screen.getByRole('button', { name: /Verify Cryptographic Chain/i });
    fireEvent.click(verifyBtn);

    await waitFor(() => {
      expect(verifySpy).toHaveBeenCalled();
      expect(screen.getByText(/SHA-256 INTEGRITY: VALIDATED 100%/i)).toBeInTheDocument();
    });
  });

  it('supports CSV export when clicking Export CSV button', () => {
    render(<AuditLogPage />);

    const originalCreateElement = document.createElement.bind(document);
    const clickSpy = vi.fn();

    vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
      const el = originalCreateElement(tagName);
      if (tagName.toLowerCase() === 'a') {
        el.click = clickSpy;
      }
      return el;
    });

    const exportBtn = screen.getByRole('button', { name: /Export CSV/i });
    fireEvent.click(exportBtn);

    expect(clickSpy).toHaveBeenCalled();
    vi.restoreAllMocks();
  });
});
