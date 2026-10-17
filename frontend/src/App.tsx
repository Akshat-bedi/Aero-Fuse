import { useEffect } from 'react';
import { RouterProvider } from 'react-router-dom';
import { router } from '@/app/router';
import { initStoreSubscriptions } from '@/store';

export default function App() {
  useEffect(() => {
    const unsubscribe = initStoreSubscriptions();
    return () => {
      unsubscribe();
    };
  }, []);

  return <RouterProvider router={router} />;
}
