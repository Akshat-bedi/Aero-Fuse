import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ChevronLeft,
  ChevronRight,
  Pause,
  Play,
  X,
  RotateCcw,
  Minimize2,
  Maximize2,
  Tv,
} from 'lucide-react';
import { useDemoStore } from '@/store/demoStore';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/utils';
import { serviceConfig } from '@/services/config';

export const DemoGuideOverlay: React.FC = () => {
  const navigate = useNavigate();
  const {
    isActive,
    isPaused,
    currentStepIndex,
    timeRemainingSec,
    steps,
    nextStep,
    prevStep,
    stopDemo,
    togglePause,
    tickTimer,
    resetToInitialState,
  } = useDemoStore();

  const [isMinimized, setIsMinimized] = useState(false);
  const [showLiveResetModal, setShowLiveResetModal] = useState(false);

  // Timer tick effect
  useEffect(() => {
    if (!isActive) return;
    const interval = setInterval(() => {
      tickTimer(navigate);
    }, 1000);
    return () => clearInterval(interval);
  }, [isActive, isPaused, tickTimer, navigate]);

  // Keyboard navigation for demo overlay
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!isActive) return;

      // Ignore when typing inside input elements
      const target = e.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT' ||
        target.isContentEditable
      ) {
        return;
      }

      if (e.key === 'ArrowRight') {
        e.preventDefault();
        nextStep(navigate);
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        prevStep(navigate);
      } else if (e.key === ' ' || e.code === 'Space') {
        e.preventDefault();
        togglePause();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        stopDemo();
      }
    },
    [isActive, nextStep, prevStep, togglePause, stopDemo, navigate],
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  if (!isActive) return null;

  const currentStep = steps[currentStepIndex] || steps[0];
  const totalSteps = steps.length;
  const progressPct = ((currentStepIndex + 1) / totalSteps) * 100;

  const handleResetClick = () => {
    if (!serviceConfig.isMock) {
      setShowLiveResetModal(true);
    } else {
      resetToInitialState(navigate);
    }
  };

  const confirmLiveReset = async () => {
    setShowLiveResetModal(false);
    await resetToInitialState(navigate);
  };

  return (
    <>
      {/* 1. Main Floating HUD Docked at Bottom-Center */}
      <div
        className={cn(
          'fixed z-50 transition-all duration-200 select-none font-mono pointer-events-auto',
          isMinimized
            ? 'bottom-3 right-3 w-80'
            : 'bottom-4 left-1/2 -translate-x-1/2 w-[92vw] max-w-2xl',
        )}
        role="region"
        aria-label="Guided Demo Mode Overlay"
      >
        <div className="bg-command-panel/95 backdrop-blur-none border border-command-primary shadow-none rounded-[2px] overflow-hidden">
          {/* Header Bar */}
          <div className="h-7 bg-command-raised px-2.5 flex items-center justify-between border-b border-command-border text-xs">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-[1px] bg-command-primary animate-pulse" />
              <div className="flex items-center gap-1.5 font-bold uppercase text-[10px] tracking-wider text-command-heading">
                <Tv className="w-3.5 h-3.5 text-command-primary" />
                <span>GUIDED DEMO MODE</span>
                <span className="text-command-primary">
                  [{currentStepIndex + 1}/{totalSteps}]
                </span>
              </div>
            </div>

            <div className="flex items-center gap-1">
              <span className="text-[10px] tabular-nums text-command-muted px-1">
                {isPaused ? 'PAUSED' : `${timeRemainingSec}s`}
              </span>

              {/* Minimize / Expand Toggle */}
              <button
                type="button"
                onClick={() => setIsMinimized(!isMinimized)}
                className="p-1 text-command-muted hover:text-command-heading hover:bg-command-bg rounded-[1px]"
                aria-label={isMinimized ? 'Expand Demo Panel' : 'Minimize Demo Panel'}
              >
                {isMinimized ? <Maximize2 className="w-3 h-3" /> : <Minimize2 className="w-3 h-3" />}
              </button>

              {/* Exit Demo Button */}
              <button
                type="button"
                onClick={stopDemo}
                className="p-1 text-command-muted hover:text-command-critical hover:bg-command-bg rounded-[1px]"
                aria-label="Exit Demo Mode (Esc)"
                title="Exit Demo Mode (Esc)"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Progress hairline */}
          <div className="w-full h-0.5 bg-command-bg">
            <div
              className="h-full bg-command-primary transition-all duration-300"
              style={{ width: `${progressPct}%` }}
            />
          </div>

          {/* Expanded Content Panel */}
          {!isMinimized && (
            <div className="p-3 bg-command-panel flex flex-col gap-2">
              {/* Step Title & Subtitle */}
              <div className="flex flex-col gap-0.5">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold uppercase text-command-heading tracking-wide">
                    {currentStep.title}
                  </h4>
                  <span className="text-[9px] uppercase tracking-widest text-command-primary font-bold px-1 bg-command-primary/10 border border-command-primary/30">
                    STEP {currentStep.stepNumber} OF {totalSteps}
                  </span>
                </div>
                <div className="text-[10px] uppercase tracking-wider text-command-subdued">
                  {currentStep.subtitle}
                </div>
              </div>

              {/* Narration Paragraphs */}
              <div className="text-[11px] leading-relaxed text-command-text/90 flex flex-col gap-1 border-l-2 border-command-primary/60 pl-2.5 py-0.5 bg-command-bg/40">
                {currentStep.narration.map((line, idx) => (
                  <p key={idx}>{line}</p>
                ))}
              </div>

              {/* Controls Toolbar */}
              <div className="flex items-center justify-between pt-1 border-t border-command-border/60 text-[10px]">
                {/* Left: Reset and Keyboard Hint */}
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleResetClick}
                    className="h-6 px-2 text-[10px] text-command-muted hover:text-command-heading border border-command-border hover:border-command-warning"
                    title="Reset to clean nominal baseline"
                  >
                    <RotateCcw className="w-3 h-3 mr-1 text-command-warning" />
                    Reset Initial State
                  </Button>
                  <span className="hidden sm:inline text-command-subdued text-[9px]">
                    [←/→] Step • [Space] Pause • [Esc] Exit
                  </span>
                </div>

                {/* Right: Step Navigation Controls */}
                <div className="flex items-center gap-1.5">
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={currentStepIndex === 0}
                    onClick={() => prevStep(navigate)}
                    className="h-6 px-2 text-[10px]"
                    aria-label="Previous step"
                  >
                    <ChevronLeft className="w-3.5 h-3.5 mr-0.5" />
                    Prev
                  </Button>

                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={togglePause}
                    className="h-6 px-2 text-[10px]"
                    aria-label={isPaused ? 'Resume walkthrough' : 'Pause walkthrough'}
                  >
                    {isPaused ? (
                      <>
                        <Play className="w-3 h-3 mr-1 text-command-nominal" /> Play
                      </>
                    ) : (
                      <>
                        <Pause className="w-3 h-3 mr-1 text-command-warning" /> Pause
                      </>
                    )}
                  </Button>

                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => nextStep(navigate)}
                    className="h-6 px-2.5 text-[10px]"
                    aria-label={currentStepIndex === totalSteps - 1 ? 'Finish demo' : 'Next step'}
                  >
                    {currentStepIndex === totalSteps - 1 ? (
                      'Finish'
                    ) : (
                      <>
                        Next <ChevronRight className="w-3.5 h-3.5 ml-0.5" />
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* Minimized Compact View */}
          {isMinimized && (
            <div className="p-2 flex items-center justify-between text-[10px]">
              <div className="flex flex-col min-w-0 pr-2">
                <span className="font-bold text-command-heading truncate">{currentStep.title}</span>
                <span className="text-[9px] text-command-muted">Step {currentStepIndex + 1} of {totalSteps}</span>
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={togglePause}
                  className="p-1 text-command-muted hover:text-command-heading border border-command-border rounded-[1px]"
                >
                  {isPaused ? <Play className="w-3 h-3 text-command-nominal" /> : <Pause className="w-3 h-3 text-command-warning" />}
                </button>
                <button
                  type="button"
                  onClick={() => nextStep(navigate)}
                  className="px-1.5 py-0.5 bg-command-primary text-black font-bold rounded-[1px]"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 2. Live Reset Confirmation Dialog */}
      {showLiveResetModal && (
        <div
          className="fixed inset-0 z-[60] bg-black/80 flex items-center justify-center p-4 font-mono select-none"
          role="dialog"
          aria-modal="true"
          aria-labelledby="live-reset-title"
        >
          <div className="w-full max-w-md bg-command-panel border border-command-warning p-4 rounded-[2px] flex flex-col gap-3">
            <div className="flex items-center justify-between border-b border-command-border pb-2">
              <h3 id="live-reset-title" className="text-xs font-bold uppercase text-command-warning tracking-wider flex items-center gap-2">
                <RotateCcw className="w-4 h-4 text-command-warning" />
                Confirm Live System Reset
              </h3>
              <button
                type="button"
                onClick={() => setShowLiveResetModal(false)}
                className="text-command-muted hover:text-command-heading"
                aria-label="Cancel Reset"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-command-text leading-relaxed">
              WARNING: The system is currently operating against a <strong>LIVE</strong> telemetry backend.
              Executing reset will dispatch <code>POST /sim/control</code> with action <code>'reset'</code>,
              restoring the server state to the baseline and terminating active contingency scripts.
            </p>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-command-border">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowLiveResetModal(false)}
                className="text-xs"
              >
                Cancel
              </Button>
              <Button
                variant="danger"
                size="sm"
                onClick={confirmLiveReset}
                className="text-xs"
              >
                Confirm Live Reset
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
