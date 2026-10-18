import '@testing-library/jest-dom';
import React from 'react';
import { vi } from 'vitest';

// Mock maplibre-gl for headless jsdom test environment
vi.mock('maplibre-gl', () => {
  class MockMap {
    static instances: MockMap[] = [];

    center = { lng: 6.0, lat: 5.0 };
    zoom = 6.2;
    bearing = 0;
    pitch = 0;

    constructor(options?: {
      center?: [number, number];
      zoom?: number;
      bearing?: number;
      pitch?: number;
    }) {
      if (options?.center) {
        this.center = { lng: options.center[0], lat: options.center[1] };
      }
      if (options?.zoom !== undefined) this.zoom = options.zoom;
      if (options?.bearing !== undefined) this.bearing = options.bearing;
      if (options?.pitch !== undefined) this.pitch = options.pitch;
      MockMap.instances.push(this);
    }

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
    getLayer = vi.fn(() => ({ id: 'mock-layer' }));
    setLayoutProperty = vi.fn().mockReturnThis();
    setPaintProperty = vi.fn().mockReturnThis();
    setFilter = vi.fn().mockReturnThis();
    getCenter = vi.fn(() => this.center);
    getZoom = vi.fn(() => this.zoom);
    getBearing = vi.fn(() => this.bearing);
    getPitch = vi.fn(() => this.pitch);
    setCenter = vi.fn((c: [number, number] | { lng: number; lat: number }) => {
      if (Array.isArray(c)) this.center = { lng: c[0], lat: c[1] };
      else this.center = c;
      return this;
    });
    setZoom = vi.fn((z: number) => {
      this.zoom = z;
      return this;
    });
    jumpTo = vi.fn().mockReturnThis();
    easeTo = vi.fn().mockReturnThis();
    flyTo = vi.fn((opts?: { center?: [number, number]; zoom?: number; bearing?: number; pitch?: number }) => {
      if (opts?.center) this.center = { lng: opts.center[0], lat: opts.center[1] };
      if (opts?.zoom !== undefined) this.zoom = opts.zoom;
      if (opts?.bearing !== undefined) this.bearing = opts.bearing;
      if (opts?.pitch !== undefined) this.pitch = opts.pitch;
      return this;
    });
    fitBounds = vi.fn().mockReturnThis();
    project = vi.fn(() => ({ x: 100, y: 100 }));
    unproject = vi.fn(() => ({ lng: 6.0, lat: 5.0 }));
    getCanvas = vi.fn(() => ({ style: {} }));
    queryRenderedFeatures = vi.fn(() => []);
    zoomIn = vi.fn(() => {
      this.zoom += 1;
      return this;
    });
    zoomOut = vi.fn(() => {
      this.zoom -= 1;
      return this;
    });
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
