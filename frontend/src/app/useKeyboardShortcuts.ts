import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUiStore } from '@/store/uiStore';
import { useAlertsStore } from '@/store/alertsStore';
import { useRecommendationsStore } from '@/store/recommendationsStore';
import { useDemoStore } from '@/store/demoStore';
import { dataService } from '@/services';

export interface ShortcutGroup {
  category: string;
  items: { key: string; description: string }[];
}

export const SHORTCUT_GROUPS: ShortcutGroup[] = [
  {
    category: 'Global Navigation',
    items: [
      { key: 'g then c', description: 'Go to Common Operating Picture (COP)' },
      { key: 'g then m', description: 'Go to Missions Management' },
      { key: 'g then r', description: 'Go to Resources & Fleet Readiness' },
      { key: 'g then s', description: 'Go to What-If Scenario Simulator' },
      { key: 'g then a', description: 'Go to Cryptographic Audit Log' },
      { key: 'g then l', description: 'Go to Tactical Alerts Feed' },
      { key: '/', description: 'Focus tactical search input' },
    ],
  },
  {
    category: 'Operational Decision Support',
    items: [
      { key: 'A', description: 'Approve focused pending recommendation' },
      { key: 'R', description: 'Reject focused pending recommendation' },
      { key: 'd', description: 'Toggle Guided Demo Mode' },
    ],
  },
  {
    category: 'System Controls',
    items: [
      { key: 'N', description: 'Toggle Night Vision Mode' },
      { key: '?', description: 'Open Keyboard Shortcuts Reference' },
      { key: 'Esc', description: 'Close dialogs, drawer, or exit demo mode' },
    ],
  },
  {
    category: 'Guided Demo Walkthrough',
    items: [
      { key: '→ / ←', description: 'Next / Previous walkthrough step' },
      { key: 'Space', description: 'Pause / Resume walkthrough timer' },
      { key: 'Esc', description: 'Exit demo mode' },
    ],
  },
];

export const useKeyboardShortcuts = () => {
  const navigate = useNavigate();
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [pendingDecision, setPendingDecision] = useState<{
    id: string;
    action: 'approve' | 'reject';
    summary: string;
  } | null>(null);

  const pendingKeyRef = useRef<string | null>(null);
  const sequenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const toggleNightMode = useUiStore((s) => s.toggleNightMode);
  const toggleAlertsDrawer = useAlertsStore((s) => s.toggleDrawer);
  const isAlertsDrawerOpen = useAlertsStore((s) => s.isDrawerOpen);
  const { isActive: isDemoActive, startDemo, stopDemo } = useDemoStore();

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      // 1. Never trigger shortcuts if typing inside form inputs
      const target = e.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT' ||
        target.isContentEditable
      ) {
        if (e.key === 'Escape') {
          target.blur();
        }
        return;
      }

      // 2. Help overlay toggle on '?'
      if (e.key === '?' || (e.shiftKey && e.key === '/')) {
        e.preventDefault();
        setIsHelpOpen((prev) => !prev);
        return;
      }

      // 3. Escape key handling
      if (e.key === 'Escape') {
        if (isHelpOpen) {
          setIsHelpOpen(false);
          return;
        }
        if (pendingDecision) {
          setPendingDecision(null);
          return;
        }
        if (isAlertsDrawerOpen) {
          toggleAlertsDrawer(false);
          return;
        }
        if (isDemoActive) {
          stopDemo();
          return;
        }
      }

      // 4. Focus Search on '/'
      if (e.key === '/') {
        e.preventDefault();
        const searchInput = document.querySelector<HTMLInputElement>(
          'input[type="text"], input[type="search"], [data-search-input]',
        );
        if (searchInput) {
          searchInput.focus();
        }
        return;
      }

      // 5. Night Mode Toggle on 'N'
      if (e.key === 'n' || e.key === 'N') {
        e.preventDefault();
        toggleNightMode();
        return;
      }

      // 6. Demo toggle on 'd' or 'D' (when not in g-sequence)
      if ((e.key === 'd' || e.key === 'D') && !pendingKeyRef.current) {
        e.preventDefault();
        if (isDemoActive) {
          stopDemo();
        } else {
          startDemo(navigate);
        }
        return;
      }

      // 7. Decision shortcuts: 'A' and 'R' on pending recommendations
      if (e.key === 'A' || e.key === 'a') {
        const recs = useRecommendationsStore.getState().recommendations;
        const pending = Object.values(recs).find((r) => r.status === 'pending');
        if (pending) {
          e.preventDefault();
          setPendingDecision({ id: pending.id, action: 'approve', summary: pending.summary });
          return;
        }
      }

      if (e.key === 'R' || e.key === 'r') {
        const recs = useRecommendationsStore.getState().recommendations;
        const pending = Object.values(recs).find((r) => r.status === 'pending');
        if (pending) {
          e.preventDefault();
          setPendingDecision({ id: pending.id, action: 'reject', summary: pending.summary });
          return;
        }
      }

      // 8. Two-key sequence: 'g' then <key>
      if (e.key === 'g' || e.key === 'G') {
        pendingKeyRef.current = 'g';
        if (sequenceTimerRef.current) clearTimeout(sequenceTimerRef.current);
        sequenceTimerRef.current = setTimeout(() => {
          pendingKeyRef.current = null;
        }, 1200); // 1.2s sequence window
        return;
      }

      if (pendingKeyRef.current === 'g') {
        const key = e.key.toLowerCase();
        pendingKeyRef.current = null;
        if (sequenceTimerRef.current) clearTimeout(sequenceTimerRef.current);

        switch (key) {
          case 'c':
            e.preventDefault();
            navigate('/');
            break;
          case 'm':
            e.preventDefault();
            navigate('/missions');
            break;
          case 'r':
            e.preventDefault();
            navigate('/resources');
            break;
          case 's':
            e.preventDefault();
            navigate('/scenarios');
            break;
          case 'a':
            e.preventDefault();
            navigate('/audit-log');
            break;
          case 'l':
            e.preventDefault();
            navigate('/alerts');
            break;
          default:
            break;
        }
      }
    },
    [
      isHelpOpen,
      pendingDecision,
      isAlertsDrawerOpen,
      isDemoActive,
      toggleNightMode,
      toggleAlertsDrawer,
      startDemo,
      stopDemo,
      navigate,
    ],
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      if (sequenceTimerRef.current) clearTimeout(sequenceTimerRef.current);
    };
  }, [handleKeyDown]);

  const confirmDecision = async () => {
    if (!pendingDecision) return;
    try {
      await dataService.decideRecommendation(
        pendingDecision.id,
        pendingDecision.action,
        undefined,
        `Commander ${pendingDecision.action}d retask proposal via tactical keyboard shortcut.`,
        'COL. J. MERCER',
      );
      useUiStore.getState().addToast({
        title: `Recommendation ${pendingDecision.action === 'approve' ? 'Approved' : 'Rejected'}`,
        message: `${pendingDecision.id}: ${pendingDecision.summary}`,
        type: pendingDecision.action === 'approve' ? 'nominal' : 'warning',
        durationMs: 4000,
      });
    } catch {
      useUiStore.getState().addToast({
        title: 'Action Failed',
        message: `Could not ${pendingDecision.action} recommendation ${pendingDecision.id}.`,
        type: 'critical',
        durationMs: 4000,
      });
    } finally {
      setPendingDecision(null);
    }
  };

  return {
    isHelpOpen,
    setIsHelpOpen,
    pendingDecision,
    setPendingDecision,
    confirmDecision,
  };
};
