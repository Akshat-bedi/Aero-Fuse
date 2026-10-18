import React, { useState, useMemo } from 'react';
import { useRecommendationsStore } from '@/store/recommendationsStore';
import { RecommendationCard } from './RecommendationCard';
import { Stat, EmptyState } from '@/components/ui';
import { formatTimeZulu } from '@/lib/utils';
import {
  Target,
  SlidersHorizontal,
  Clock,
  ArrowUpDown,
  Search,
} from 'lucide-react';

export const RecommendationsPage: React.FC = () => {
  const { recommendations, selectedRecId, selectRecommendation } = useRecommendationsStore();

  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'score' | 'time'>('score');

  const recList = useMemo(() => {
    return Object.values(recommendations)
      .filter((rec) => {
        if (statusFilter !== 'ALL' && rec.status !== statusFilter) return false;
        if (searchQuery) {
          const q = searchQuery.toLowerCase();
          const matchId = rec.id.toLowerCase().includes(q);
          const matchTrigger = rec.triggerEventId.toLowerCase().includes(q);
          const matchSummary = rec.summary.toLowerCase().includes(q);
          if (!matchId && !matchTrigger && !matchSummary) return false;
        }
        return true;
      })
      .sort((a, b) => {
        if (sortBy === 'score') return b.score - a.score;
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });
  }, [recommendations, statusFilter, searchQuery, sortBy]);

  // Active selected recommendation
  const activeRec = useMemo(() => {
    if (selectedRecId && recommendations[selectedRecId]) {
      return recommendations[selectedRecId];
    }
    return recList[0] || null;
  }, [selectedRecId, recommendations, recList]);

  // Overall Metrics
  const totalCount = Object.keys(recommendations).length;
  const pendingCount = Object.values(recommendations).filter((r) => r.status === 'pending').length;
  const approvedCount = Object.values(recommendations).filter(
    (r) => r.status === 'approved' || r.status === 'modified',
  ).length;
  const avgScore =
    totalCount > 0
      ? Math.round(
          Object.values(recommendations).reduce((sum, r) => sum + r.score, 0) / totalCount,
        )
      : 0;

  return (
    <div className="flex-1 min-h-0 flex flex-col overflow-y-auto bg-command-bg font-sans">
      {/* 1. Header Bar */}
      <div className="p-4 sm:p-5 pb-3 border-b border-command-border/80 bg-command-panel/50 space-y-3">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 font-mono text-[10px] text-command-muted uppercase">
              <span className="px-1.5 py-0.5 rounded-[1px] bg-command-bg border border-command-border text-command-primary font-bold">
                DSS-REC-07
              </span>
              <span>DECISION SUPPORT & REPLANNING</span>
              <span>•</span>
              <span className="text-command-nominal">ALGORITHMIC SOLVER</span>
            </div>
            <h1 className="text-xl sm:text-2xl font-bold text-command-heading tracking-wide mt-1">
              Dynamic Retasking & Recommendations
            </h1>
            <p className="text-xs text-command-muted font-sans mt-0.5 max-w-2xl">
              Constraint-satisfaction optimization engine generating ranked Air Tasking Order retask proposals with explainability, trade-offs, and human-in-the-loop commander execution.
            </p>
          </div>

          <div className="flex items-center gap-2 font-mono text-xs">
            <span className="px-2.5 py-1 rounded-[1px] bg-command-bg border border-command-border text-command-primary font-bold flex items-center gap-1.5">
              <Target className="w-3.5 h-3.5" />
              <span>{pendingCount} AWAITING COMMANDER DIRECTIVE</span>
            </span>
          </div>
        </div>

        {/* Metric Summary Tiles */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1">
          <Stat
            label="Total Proposals Evaluated"
            value={totalCount.toString()}
            unit="plans"
            trend="Monitored continuous loop"
          />
          <Stat
            label="Pending Action"
            value={pendingCount.toString()}
            unit="urgent"
            trend={pendingCount > 0 ? 'Requires commander directive' : 'All decisions resolved'}
          />
          <Stat
            label="Approved & Committed"
            value={approvedCount.toString()}
            unit="sorties"
            trend="Committed to master ATO"
          />
          <Stat
            label="Mean Feasibility Score"
            value={`${avgScore}%`}
            unit="accuracy"
            trend="Constraint satisfaction margin"
          />
        </div>
      </div>

      {/* 2. Main Stage: Two-Pane Split Layout */}
      <div className="p-4 sm:p-5 flex-1 flex flex-col md:flex-row gap-4 min-h-0">
        {/* Left Pane: Filterable Proposal List */}
        <div className="w-full md:w-80 lg:w-96 flex flex-col gap-2.5 shrink-0">
          {/* Filter & Sort Bar */}
          <div className="p-2.5 rounded-[1px] bg-command-panel border border-command-border flex flex-col gap-2 font-mono text-xs">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1 text-[10px] text-command-muted uppercase">
                <SlidersHorizontal className="w-3 h-3" />
                <span>Filter Status:</span>
              </div>
              <select
                aria-label="Filter status"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="bg-command-bg border border-command-border px-2 py-0.5 rounded-[1px] text-command-text text-xs focus:outline-none focus:border-command-primary"
              >
                <option value="ALL">All Statuses ({totalCount})</option>
                <option value="pending">Pending</option>
                <option value="approved">Approved</option>
                <option value="modified">Modified</option>
                <option value="rejected">Rejected</option>
                <option value="stale">Stale / Expired</option>
              </select>
            </div>

            {/* Search Box & Sort Toggle */}
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="w-3.5 h-3.5 absolute left-2 top-2 text-command-muted" />
                <input
                  type="text"
                  placeholder="Filter by ID, trigger..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-7 pr-2 py-1 bg-command-bg border border-command-border rounded-[1px] text-command-text placeholder-command-subdued text-xs focus:outline-none focus:border-command-primary"
                />
              </div>

              <button
                type="button"
                onClick={() => setSortBy(sortBy === 'score' ? 'time' : 'score')}
                className="px-2 py-1 bg-command-bg border border-command-border rounded-[1px] text-command-primary hover:bg-command-raised flex items-center gap-1 text-[10px] font-bold"
                title={`Sorted by ${sortBy === 'score' ? 'Score' : 'Recency'}`}
              >
                <ArrowUpDown className="w-3 h-3" />
                <span>{sortBy === 'score' ? 'Score' : 'Time'}</span>
              </button>
            </div>
          </div>

          {/* Proposal Cards List */}
          <div className="space-y-2 overflow-y-auto max-h-[calc(100vh-22rem)] pr-0.5">
            {recList.length === 0 ? (
              <div className="p-4 rounded-[1px] border border-command-border bg-command-panel text-center font-mono text-xs text-command-muted">
                No retasking recommendations found matching active filters.
              </div>
            ) : (
              recList.map((rec) => {
                const isSelected = activeRec?.id === rec.id;
                return (
                  <div
                    key={rec.id}
                    onClick={() => selectRecommendation(rec.id)}
                    className={`p-2.5 rounded-[1px] border font-mono text-xs cursor-pointer transition-none select-none ${
                      isSelected
                        ? 'border-command-primary bg-command-raised text-command-text'
                        : 'border-command-border bg-command-panel hover:bg-command-raised/60 text-command-muted'
                    }`}
                  >
                    <div className="flex items-center justify-between pb-1 border-b border-command-border/50">
                      <div className="flex items-center gap-1.5 font-bold">
                        <span className="text-command-primary">{rec.id}</span>
                        <span className="text-[10px] text-command-muted">({rec.triggerEventId})</span>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-bold text-command-heading tabular-nums">
                          {Math.round(rec.score)}%
                        </span>
                        <span
                          className={`px-1 py-0.2 rounded-[1px] text-[8px] uppercase font-bold border ${
                            rec.status === 'approved'
                              ? 'bg-command-nominal-bg text-command-nominal border-command-nominal-border'
                              : rec.status === 'rejected'
                              ? 'bg-command-critical-bg text-command-critical border-command-critical-border'
                              : rec.status === 'modified'
                              ? 'bg-command-raised text-command-primary border-command-primary'
                              : 'bg-command-bg text-command-primary border-command-border'
                          }`}
                        >
                          {rec.status}
                        </span>
                      </div>
                    </div>

                    <p className="text-[11px] text-command-heading line-clamp-2 mt-1 leading-snug">
                      {rec.summary}
                    </p>

                    <div className="flex items-center justify-between text-[10px] text-command-muted pt-2 mt-1 border-t border-command-border/30">
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        <span>{formatTimeZulu(rec.createdAt)}</span>
                      </span>
                      <span>{rec.changes.length} change(s)</span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right Pane: Detailed Recommendation Card Stage */}
        <div className="flex-1 min-w-0">
          {activeRec ? (
            <RecommendationCard
              recommendation={activeRec}
              onDecisionComplete={() => {
                // Keep selected
              }}
            />
          ) : (
            <div className="h-full flex items-center justify-center p-8 bg-command-panel border border-command-border rounded-[2px]">
              <EmptyState
                icon={<Target className="w-8 h-8 text-command-muted" />}
                title="No Recommendation Selected"
                description="Select a proposal from the left queue to inspect diffs, trade-offs, constraints, and execute commander directives."
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
