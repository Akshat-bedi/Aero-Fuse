import { createBrowserRouter, Navigate } from 'react-router-dom';
import { AppLayout } from './AppLayout';
import { CopPage } from '@/features/cop';
import { ResourcesPage } from '@/features/resources';
import { MissionsPage } from '@/features/missions';
import {
  ScenariosPage,
  AlertsPage,
} from './pages/RoutesPages';
import { RecommendationsPage } from '@/features/recommendations';
import { AuditLogPage } from '@/features/audit';
import { ComponentGalleryPage } from './pages/ComponentGalleryPage';
import { DebugDataPage } from './pages/DebugDataPage';

export const router = createBrowserRouter([
  {
    path: '/',
    element: <AppLayout />,
    children: [
      {
        index: true,
        element: <CopPage />,
      },
      {
        path: 'missions',
        element: <MissionsPage />,
      },
      {
        path: 'resources',
        element: <ResourcesPage />,
      },
      {
        path: 'recommendations',
        element: <RecommendationsPage />,
      },
      {
        path: 'scenarios',
        element: <ScenariosPage />,
      },
      {
        path: 'alerts',
        element: <AlertsPage />,
      },
      {
        path: 'audit-log',
        element: <AuditLogPage />,
      },
      {
        path: 'audit',
        element: <Navigate to="/audit-log" replace />,
      },
      {
        path: 'dev/components',
        element: <ComponentGalleryPage />,
      },
      {
        path: 'dev/data',
        element: <DebugDataPage />,
      },
      {
        path: '*',
        element: <Navigate to="/" replace />,
      },
    ],
  },
]);
