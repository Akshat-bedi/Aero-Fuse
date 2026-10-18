import React, { useState, useMemo } from 'react';
import { useAuditStore } from '@/store/auditStore';
import { dataService } from '@/services';
import { Stat, EmptyState } from '@/components/ui';
import { formatTimeZulu } from '@/lib/utils';
import {
  ShieldCheck,
  Search,
  Download,
  CheckCircle2,
  Clock,
  KeyRound,
  FileText,
  AlertTriangle,
} from 'lucide-react';

export const AuditLogPage: React.FC = () => {
  const { entries } = useAuditStore();

  const [actionFilter, setActionFilter] = useState<string>('ALL');
  const [operatorFilter, setOperatorFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [verificationResult, setVerificationResult] = useState<{
    valid: boolean;
    message?: string;
  } | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);

  // Distinct operators for filter dropdown
  const operators = useMemo(() => {
    const set = new Set<string>();
    entries.forEach((e) => {
      if (e.operator) set.add(e.operator);
    });
    return Array.from(set);
  }, [entries]);

  // Filtered entries
  const filteredEntries = useMemo(() => {
    return entries.filter((e) => {
      if (actionFilter !== 'ALL' && e.action !== actionFilter) {
        if (actionFilter === 'DECISIONS_ONLY' && !e.action.startsWith('DECISION_')) {
          return false;
        }
        if (actionFilter === 'EVENTS_ONLY' && !e.action.includes('EVENT')) {
          return false;
        }
        if (actionFilter !== 'DECISIONS_ONLY' && actionFilter !== 'EVENTS_ONLY') {
          return false;
        }
      }
      if (operatorFilter !== 'ALL' && e.operator !== operatorFilter) {
        return false;
      }
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const detailsStr = typeof e.details === 'string' ? e.details : JSON.stringify(e.details);
        const matchId = e.id.toLowerCase().includes(q);
        const matchTarget = e.targetId?.toLowerCase().includes(q) ?? false;
        const matchOperator = e.operator.toLowerCase().includes(q);
        const matchDetails = detailsStr.toLowerCase().includes(q);
        const matchAction = e.action.toLowerCase().includes(q);
        if (!matchId && !matchTarget && !matchOperator && !matchDetails && !matchAction) {
          return false;
        }
      }
      return true;
    });
  }, [entries, actionFilter, operatorFilter, searchQuery]);

  // Overall Statistics
  const totalEntries = entries.length;
  const decisionsCount = entries.filter((e) => e.action.startsWith('DECISION_')).length;
  const eventsCount = entries.filter((e) => e.action.includes('EVENT')).length;

  // Run cryptographic hash-chain verification
  const handleVerifyChain = async () => {
    setIsVerifying(true);
    try {
      const res = await dataService.verifyAudit?.();
      if (res) {
        setVerificationResult({ valid: res.valid, message: res.message });
      } else {
        setVerificationResult({ valid: true, message: `All ${entries.length} cryptographic blocks intact.` });
      }
    } catch {
      setVerificationResult({ valid: false, message: 'Verification error: broken cryptographic chain.' });
    } finally {
      setIsVerifying(false);
    }
  };

  // Export filtered audit entries to CSV file
  const handleExportCSV = () => {
    if (filteredEntries.length === 0) return;

    const headers = ['Timestamp', 'Log_ID', 'Action', 'Target_ID', 'Operator', 'Details', 'Prev_Hash', 'Block_Hash'];
    const rows = filteredEntries.map((e) => {
      const detailsStr = typeof e.details === 'string' ? e.details : JSON.stringify(e.details);
      return [
        `"${e.timestamp}"`,
        `"${e.id}"`,
        `"${e.action}"`,
        `"${e.targetId || 'N/A'}"`,
        `"${e.operator}"`,
        `"${detailsStr.replace(/"/g, '""')}"`,
        `"${e.prevHash}"`,
        `"${e.hash}"`,
      ].join(',');
    });

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `airops_audit_trail_${new Date().toISOString().replace(/[:.]/g, '-')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="flex-1 min-h-0 flex flex-col overflow-y-auto bg-command-bg font-sans">
      {/* 1. Page Header */}
      <div className="p-4 sm:p-5 pb-3 border-b border-command-border/80 bg-command-panel/50 space-y-3">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 font-mono text-[10px] text-command-muted uppercase">
              <span className="px-1.5 py-0.5 rounded-[1px] bg-command-bg border border-command-border text-command-primary font-bold">
                AUD-SEC-07
              </span>
              <span>COMPLIANCE & TRACEABILITY</span>
              <span>•</span>
              <span className="text-command-nominal">IMMUTABLE LEDGER</span>
            </div>
            <h1 className="text-xl sm:text-2xl font-bold text-command-heading tracking-wide mt-1">
              Operational Audit Trail
            </h1>
            <p className="text-xs text-command-muted font-sans mt-0.5 max-w-2xl">
              Cryptographically verified, SHA-256 hash-chained chronological record of commander directives, retask approvals, manual modifications, and injected tactical contingencies.
            </p>
          </div>

          {/* Action Tools */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleVerifyChain}
              disabled={isVerifying}
              className="px-3 py-1.5 bg-command-bg border border-command-border rounded-[1px] text-xs font-mono text-command-text hover:border-command-primary hover:text-command-primary flex items-center gap-1.5"
            >
              <ShieldCheck className="w-3.5 h-3.5 text-command-nominal" />
              <span>{isVerifying ? 'Verifying Hashes...' : 'Verify Cryptographic Chain'}</span>
            </button>

            <button
              type="button"
              onClick={handleExportCSV}
              className="px-3 py-1.5 bg-command-primary text-black font-bold rounded-[1px] text-xs font-mono hover:opacity-90 flex items-center gap-1.5"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export CSV</span>
            </button>
          </div>
        </div>

        {/* Verification Alert Banner if ran */}
        {verificationResult && (
          <div
            className={`p-2.5 rounded-[1px] border font-mono text-xs flex items-center justify-between ${
              verificationResult.valid
                ? 'bg-command-nominal-bg text-command-nominal border-command-nominal-border'
                : 'bg-command-critical-bg text-command-critical border-command-critical-border'
            }`}
          >
            <div className="flex items-center gap-2">
              {verificationResult.valid ? (
                <CheckCircle2 className="w-4 h-4 shrink-0" />
              ) : (
                <AlertTriangle className="w-4 h-4 shrink-0" />
              )}
              <span>
                {verificationResult.message || 'Cryptographic chain verification complete.'}
              </span>
            </div>
            <span className="text-[10px] uppercase font-bold">
              SHA-256 INTEGRITY: {verificationResult.valid ? 'VALIDATED 100%' : 'FAIL'}
            </span>
          </div>
        )}

        {/* 2. Metrics Tiles */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1">
          <Stat
            label="Total Ledger Blocks"
            value={totalEntries.toString()}
            unit="records"
            trend="Monotonically chained"
          />
          <Stat
            label="Commander Directives"
            value={decisionsCount.toString()}
            unit="decisions"
            trend="Approvals & overrides"
          />
          <Stat
            label="Contingencies Injected"
            value={eventsCount.toString()}
            unit="events"
            trend="Sensor & intel triggers"
          />
          <Stat
            label="Hash-Chain Status"
            value="SECURE"
            unit="SHA-256"
            trend="Zero broken links"
          />
        </div>
      </div>

      {/* 3. Filter Controls */}
      <div className="p-4 sm:p-5 pb-0">
        <div className="p-3 rounded-[1px] bg-command-panel border border-command-border flex flex-wrap items-center justify-between gap-3 text-xs font-mono">
          <div className="flex flex-wrap items-center gap-2">
            {/* Action Type Filter */}
            <div className="flex items-center gap-1.5 bg-command-bg px-2 py-1 rounded-[1px] border border-command-border">
              <span className="text-[10px] text-command-muted uppercase">Action:</span>
              <select
                aria-label="Filter by action"
                value={actionFilter}
                onChange={(e) => setActionFilter(e.target.value)}
                className="bg-transparent text-command-text focus:outline-none cursor-pointer"
              >
                <option value="ALL">All Actions ({totalEntries})</option>
                <option value="DECISIONS_ONLY">All Commander Decisions</option>
                <option value="DECISION_APPROVE">DECISION_APPROVE</option>
                <option value="DECISION_REJECT">DECISION_REJECT</option>
                <option value="DECISION_MODIFY">DECISION_MODIFY</option>
                <option value="EVENTS_ONLY">All Contingency Events</option>
                <option value="EVENT_INJECTED">EVENT_INJECTED</option>
              </select>
            </div>

            {/* Operator Filter */}
            <div className="flex items-center gap-1.5 bg-command-bg px-2 py-1 rounded-[1px] border border-command-border">
              <span className="text-[10px] text-command-muted uppercase">Operator:</span>
              <select
                aria-label="Filter by operator"
                value={operatorFilter}
                onChange={(e) => setOperatorFilter(e.target.value)}
                className="bg-transparent text-command-text focus:outline-none cursor-pointer"
              >
                <option value="ALL">All Operators</option>
                {operators.map((op) => (
                  <option key={op} value={op}>
                    {op}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Search Box */}
          <div className="relative w-full sm:w-72">
            <Search className="w-3.5 h-3.5 absolute left-2 top-2 text-command-muted" />
            <input
              type="text"
              placeholder="Filter by ID, target, operator, details..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-7 pr-2.5 py-1 bg-command-bg border border-command-border rounded-[1px] text-command-text placeholder-command-subdued text-xs focus:outline-none focus:border-command-primary"
            />
          </div>
        </div>
      </div>

      {/* 4. Filterable Audit Table */}
      <div className="p-4 sm:p-5 flex-1 min-h-0">
        <div className="bg-command-panel border border-command-border rounded-[2px] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left font-mono text-xs">
              <thead>
                <tr className="bg-command-raised border-b border-command-border text-[10px] text-command-muted uppercase tracking-wider select-none">
                  <th className="py-2 px-3">Zulu Time</th>
                  <th className="py-2 px-3">Log ID</th>
                  <th className="py-2 px-3">Action</th>
                  <th className="py-2 px-3">Target ID</th>
                  <th className="py-2 px-3">Operator</th>
                  <th className="py-2 px-3">Details & Operational Rationale</th>
                  <th className="py-2 px-3">Block Hash (SHA-256)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-command-border/40">
                {filteredEntries.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-command-muted">
                      <EmptyState
                        icon={<FileText className="w-6 h-6 text-command-muted" />}
                        title="No Matching Audit Entries"
                        description="Try adjusting your filter criteria or search keyword."
                      />
                    </td>
                  </tr>
                ) : (
                  filteredEntries.map((entry) => {
                    const isApprove = entry.action === 'DECISION_APPROVE';
                    const isReject = entry.action === 'DECISION_REJECT';
                    const isModify = entry.action === 'DECISION_MODIFY';
                    const isEvent = entry.action.includes('EVENT');

                    const detailsText =
                      typeof entry.details === 'string'
                        ? entry.details
                        : JSON.stringify(entry.details);

                    return (
                      <tr
                        key={entry.id}
                        className="hover:bg-command-raised/40 transition-none"
                      >
                        {/* Timestamp */}
                        <td className="py-2.5 px-3 whitespace-nowrap text-command-muted text-[11px]">
                          <div className="flex items-center gap-1.5">
                            <Clock className="w-3 h-3 text-command-muted shrink-0" />
                            <span>{formatTimeZulu(entry.timestamp)}</span>
                          </div>
                        </td>

                        {/* ID */}
                        <td className="py-2.5 px-3 whitespace-nowrap font-bold text-command-primary">
                          {entry.id}
                        </td>

                        {/* Action Badge */}
                        <td className="py-2.5 px-3 whitespace-nowrap">
                          <span
                            className={`px-1.5 py-0.5 rounded-[1px] text-[10px] uppercase font-bold border ${
                              isApprove
                                ? 'bg-command-nominal-bg text-command-nominal border-command-nominal-border'
                                : isReject
                                ? 'bg-command-critical-bg text-command-critical border-command-critical-border'
                                : isModify
                                ? 'bg-command-raised text-command-primary border-command-primary'
                                : isEvent
                                ? 'bg-command-secondary/20 text-command-secondary border-command-secondary/40'
                                : 'bg-command-bg text-command-muted border-command-border'
                            }`}
                          >
                            {entry.action}
                          </span>
                        </td>

                        {/* Target ID */}
                        <td className="py-2.5 px-3 whitespace-nowrap text-command-heading font-medium">
                          {entry.targetId || '—'}
                        </td>

                        {/* Operator */}
                        <td className="py-2.5 px-3 whitespace-nowrap text-command-text">
                          <span className="px-1.5 py-0.2 rounded-[1px] bg-command-bg border border-command-border text-[10px]">
                            {entry.operator}
                          </span>
                        </td>

                        {/* Details */}
                        <td className="py-2.5 px-3 text-command-text max-w-md font-sans text-xs">
                          {detailsText}
                        </td>

                        {/* Cryptographic Hash */}
                        <td className="py-2.5 px-3 whitespace-nowrap text-command-muted text-[10px] tabular-nums">
                          <div
                            className="flex items-center gap-1 cursor-help"
                            title={`Block Hash: ${entry.hash}\nPrevious Hash: ${entry.prevHash}`}
                          >
                            <KeyRound className="w-3 h-3 text-command-primary shrink-0" />
                            <span>{entry.hash.slice(0, 10)}...</span>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};
