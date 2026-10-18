import { useEffect } from 'react';
import { RouterProvider } from 'react-router-dom';
import { router } from '@/app/router';
import { initStoreSubscriptions } from '@/store';
import { GlobalErrorBoundary } from '@/components/ui';

export default function App() {
  useEffect(() => {
    const unsubscribe = initStoreSubscriptions();
    return () => {
      unsubscribe();
    };
  }, []);

  return (
    <GlobalErrorBoundary>
      <RouterProvider router={router} />
    </GlobalErrorBoundary>
  );
}
