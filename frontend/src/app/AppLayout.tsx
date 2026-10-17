import React from 'react';
import { Outlet } from 'react-router-dom';
import { TopBar } from './TopBar';
import { NavRail } from './NavRail';
import { AlertsDrawer } from './AlertsDrawer';
import { ToastContainer } from '@/components/ui/Toast';

export const AppLayout: React.FC = () => {
  return (
    <div className="h-screen w-screen overflow-hidden flex flex-col bg-command-bg text-command-text font-sans antialiased">
      {/* Tactical Top Bar */}
      <TopBar />

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

      {/* Global Toast Notification Container */}
      <ToastContainer />
    </div>
  );
};
