import React from 'react';
import { Outlet } from 'react-router-dom';
import { TopBar } from './TopBar';
import { NavRail } from './NavRail';
import { AlertsDrawer } from './AlertsDrawer';
import { DemoGuideOverlay } from './DemoGuideOverlay';
import { useKeyboardShortcuts } from './useKeyboardShortcuts';
import {
  KeyboardShortcutsModal,
  DecisionConfirmModal,
} from './KeyboardShortcutsModal';
import { ToastContainer } from '@/components/ui/Toast';

export const AppLayout: React.FC = () => {
  const {
    isHelpOpen,
    setIsHelpOpen,
    pendingDecision,
    setPendingDecision,
    confirmDecision,
  } = useKeyboardShortcuts();

  return (
    <div className="h-screen w-screen overflow-hidden flex flex-col bg-command-bg text-command-text font-sans antialiased">
      {/* Tactical Top Bar */}
      <TopBar onOpenShortcutsHelp={() => setIsHelpOpen(true)} />

      {/* Main Workspace Frame */}
      <div className="flex-1 min-h-0 flex flex-row overflow-hidden relative">
        {/* Left Navigation Rail */}
        <NavRail />

        {/* Dynamic Main Stage (No page scroll, viewport filled) */}
        <main
          className="flex-1 min-h-0 min-w-0 overflow-hidden flex flex-col bg-command-bg/95"
          role="main"
        >
          <Outlet />
        </main>

        {/* Collapsible Operational Alerts Drawer */}
        <AlertsDrawer />
      </div>

      {/* Global Guided Demo Mode Overlay */}
      <DemoGuideOverlay />

      {/* Keyboard Shortcuts Help Reference Modal (Press ?) */}
      <KeyboardShortcutsModal
        isOpen={isHelpOpen}
        onClose={() => setIsHelpOpen(false)}
      />

      {/* Keyboard Decision Confirmation Modal (A / R shortcuts) */}
      <DecisionConfirmModal
        decision={pendingDecision}
        onConfirm={confirmDecision}
        onCancel={() => setPendingDecision(null)}
      />

      {/* Global Toast Notification Container */}
      <ToastContainer />
    </div>
  );
};
