import React, { lazy, Suspense } from 'react';
import { createBrowserRouter, Navigate } from 'react-router-dom';
import { AppLayout } from './AppLayout';
import { FeatureErrorBoundary, RouteLoadingFallback } from '@/components/ui';

// Code-split routes with React.lazy
const CopPage = lazy(() =>
  import('@/features/cop').then((m) => ({ default: m.CopPage })),
);
const MissionsPage = lazy(() =>
  import('@/features/missions').then((m) => ({ default: m.MissionsPage })),
);
const ResourcesPage = lazy(() =>
  import('@/features/resources').then((m) => ({ default: m.ResourcesPage })),
);
const RecommendationsPage = lazy(() =>
  import('@/features/recommendations').then((m) => ({ default: m.RecommendationsPage })),
);
const ScenariosPage = lazy(() =>
  import('@/features/scenarios').then((m) => ({ default: m.ScenariosPage })),
);
const AlertsPage = lazy(() =>
  import('@/features/alerts').then((m) => ({ default: m.AlertsPage })),
);
const AuditLogPage = lazy(() =>
  import('@/features/audit').then((m) => ({ default: m.AuditLogPage })),
);
const ComponentGalleryPage = lazy(() =>
  import('./pages/ComponentGalleryPage').then((m) => ({ default: m.ComponentGalleryPage })),
);
const DebugDataPage = lazy(() =>
  import('./pages/DebugDataPage').then((m) => ({ default: m.DebugDataPage })),
);

function withSuspenseAndBoundary(
  Component: React.ComponentType,
  featureName: string,
) {
  return (
    <FeatureErrorBoundary featureName={featureName}>
      <Suspense fallback={<RouteLoadingFallback moduleName={featureName} />}>
        <Component />
      </Suspense>
    </FeatureErrorBoundary>
  );
}

export const router = createBrowserRouter([
  {
    path: '/',
    element: <AppLayout />,
    children: [
      {
        index: true,
        element: withSuspenseAndBoundary(CopPage, 'Common Operating Picture'),
      },
      {
        path: 'missions',
        element: withSuspenseAndBoundary(MissionsPage, 'Missions Management'),
      },
      {
        path: 'resources',
        element: withSuspenseAndBoundary(ResourcesPage, 'Fleet Readiness & Logistics'),
      },
      {
        path: 'recommendations',
        element: withSuspenseAndBoundary(RecommendationsPage, 'Decision Support Recommendations'),
      },
      {
        path: 'scenarios',
        element: withSuspenseAndBoundary(ScenariosPage, 'What-If Scenario Simulator'),
      },
      {
        path: 'alerts',
        element: withSuspenseAndBoundary(AlertsPage, 'Tactical Alerts Feed'),
      },
      {
        path: 'audit-log',
        element: withSuspenseAndBoundary(AuditLogPage, 'Cryptographic Audit Log'),
      },
      {
        path: 'audit',
        element: <Navigate to="/audit-log" replace />,
      },
      {
        path: 'dev/components',
        element: withSuspenseAndBoundary(ComponentGalleryPage, 'Component Gallery'),
      },
      {
        path: 'dev/data',
        element: withSuspenseAndBoundary(DebugDataPage, 'Debug Data Store'),
      },
      {
        path: '*',
        element: <Navigate to="/" replace />,
      },
    ],
  },
]);
