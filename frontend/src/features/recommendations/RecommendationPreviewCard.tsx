import React, { useState } from 'react';
import { useRecommendationsStore } from '@/store/recommendationsStore';
import { RecommendationCard } from './RecommendationCard';
import { ChevronDown, ChevronUp, ChevronLeft, ChevronRight, Target } from 'lucide-react';

export const RecommendationPreviewCard: React.FC = () => {
  const recommendations = useRecommendationsStore((s) => s.recommendations);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);

  // Filter pending recommendations, sorted by score & recency
  const pendingRecs = Object.values(recommendations)
    .filter((r) => r.status === 'pending')
    .sort((a, b) => {
      // Sort by score descending then recency
      if (b.score !== a.score) return b.score - a.score;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

  if (pendingRecs.length === 0) {
    return null;
  }

  // Ensure current index is within bounds
  const safeIndex = Math.min(currentIndex, pendingRecs.length - 1);
  const currentRec = pendingRecs[safeIndex];

  return (
    <div className="absolute bottom-4 right-4 z-30 w-[420px] max-w-[calc(100vw-2rem)] pointer-events-auto font-mono text-xs select-none">
      {/* Docked Control Bar */}
      <div className="bg-command-panel border border-command-border rounded-[2px] overflow-hidden shadow-none">
        <div className="flex items-center justify-between px-3 py-1.5 bg-command-raised border-b border-command-border">
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded-[1px] bg-command-bg border border-command-border flex items-center justify-center text-command-primary">
              <Target className="w-3.5 h-3.5" />
            </div>
            <div className="flex items-center gap-1.5 font-bold">
              <span className="text-command-primary">DYNAMIC RETASKING</span>
              <span className="text-[10px] px-1 py-0.2 rounded-[1px] bg-command-bg text-command-primary border border-command-border">
                {pendingRecs.length} PENDING
              </span>
            </div>
          </div>

          <div className="flex items-center gap-1">
            {/* Multi-Recommendation Navigation */}
            {pendingRecs.length > 1 && (
              <div className="flex items-center gap-1 mr-1 text-[10px] text-command-muted">
                <button
                  type="button"
                  onClick={() => setCurrentIndex((prev) => (prev > 0 ? prev - 1 : pendingRecs.length - 1))}
                  className="p-0.5 rounded-[1px] hover:bg-command-bg hover:text-command-text"
                  aria-label="Previous recommendation"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>
                <span>
                  {safeIndex + 1}/{pendingRecs.length}
                </span>
                <button
                  type="button"
                  onClick={() => setCurrentIndex((prev) => (prev < pendingRecs.length - 1 ? prev + 1 : 0))}
                  className="p-0.5 rounded-[1px] hover:bg-command-bg hover:text-command-text"
                  aria-label="Next recommendation"
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {/* Minimize / Expand Toggle */}
            <button
              type="button"
              onClick={() => setIsCollapsed(!isCollapsed)}
              className="p-0.5 text-command-muted hover:text-command-text rounded-[1px] hover:bg-command-bg"
              aria-label={isCollapsed ? 'Expand panel' : 'Collapse panel'}
            >
              {isCollapsed ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Collapsible Recommendation Body */}
        {!isCollapsed && currentRec && (
          <div className="max-h-[75vh] overflow-y-auto">
            <RecommendationCard
              recommendation={currentRec}
              compact
              onDecisionComplete={() => {
                // If this rec was decided, reset index
                setCurrentIndex(0);
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
};
