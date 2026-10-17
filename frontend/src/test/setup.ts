import '@testing-library/jest-dom';
import React from 'react';
import { vi } from 'vitest';

// Mock maplibre-gl for headless jsdom test environment
vi.mock('maplibre-gl', () => {
  class MockMap {
    on = vi.fn((event: string, callback: (...args: unknown[]) => void) => {
      if (event === 'load') {
        setTimeout(callback, 0);
      }
      return this;
    });
    off = vi.fn().mockReturnThis();
    remove = vi.fn().mockReturnThis();
    addControl = vi.fn().mockReturnThis();
    addSource = vi.fn().mockReturnThis();
    getSource = vi.fn(() => ({ setData: vi.fn() }));
    addLayer = vi.fn().mockReturnThis();
    setLayoutProperty = vi.fn().mockReturnThis();
    setPaintProperty = vi.fn().mockReturnThis();
    setFilter = vi.fn().mockReturnThis();
    flyTo = vi.fn().mockReturnThis();
    fitBounds = vi.fn().mockReturnThis();
    project = vi.fn(() => ({ x: 100, y: 100 }));
    unproject = vi.fn(() => ({ lng: 6.0, lat: 5.0 }));
    getCanvas = vi.fn(() => ({ style: {} }));
  }

  class MockNavigationControl {}
  class MockScaleControl {}
  class MockPopup {
    setLngLat = vi.fn().mockReturnThis();
    setHTML = vi.fn().mockReturnThis();
    setDOMContent = vi.fn().mockReturnThis();
    addTo = vi.fn().mockReturnThis();
    remove = vi.fn().mockReturnThis();
  }

  return {
    default: {
      Map: MockMap,
      NavigationControl: MockNavigationControl,
      ScaleControl: MockScaleControl,
      Popup: MockPopup,
      supported: vi.fn(() => true),
    },
    Map: MockMap,
    NavigationControl: MockNavigationControl,
    ScaleControl: MockScaleControl,
    Popup: MockPopup,
    supported: vi.fn(() => true),
  };
});

// Mock echarts-for-react for headless test environment
vi.mock('echarts-for-react', () => {
  return {
    default: ({ option, style, className }: { option?: { title?: { text?: string } }; style?: React.CSSProperties; className?: string }) =>
      React.createElement(
        'div',
        { 'data-testid': 'echarts-for-react', className, style },
        option?.title?.text || 'ECharts Component',
      ),
  };
});
