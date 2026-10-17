import { createBrowserRouter, Navigate } from 'react-router-dom';
import { AppLayout } from './AppLayout';
import { CopPage } from '@/features/cop';
import {
  MissionsPage,
  ResourcesPage,
  RecommendationsPage,
  ScenariosPage,
  AlertsPage,
  AuditLogPage,
} from './pages/RoutesPages';
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
