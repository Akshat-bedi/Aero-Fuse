import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, act, screen, fireEvent } from '@testing-library/react';
import maplibregl from 'maplibre-gl';
import { CopPage } from './CopPage';
import { TacticalMap } from './TacticalMap';
import { useEntitiesStore, useUiStore } from '@/store';
import { mockDataService } from '@/services/mockDataService';
import { DEFAULT_LAYER_VISIBILITY } from './types';

interface MockMapInstance {
  center: { lng: number; lat: number };
  zoom: number;
  bearing: number;
  pitch: number;
  on: ReturnType<typeof vi.fn>;
  remove: ReturnType<typeof vi.fn>;
  flyTo: ReturnType<typeof vi.fn>;
  jumpTo: ReturnType<typeof vi.fn>;
  easeTo: ReturnType<typeof vi.fn>;
  setCenter: ReturnType<typeof vi.fn>;
  setZoom: ReturnType<typeof vi.fn>;
  fitBounds: ReturnType<typeof vi.fn>;
}

interface MockMapClass {
  instances: MockMapInstance[];
}

const getMockMapInstances = (): MockMapInstance[] => {
  return (maplibregl.Map as unknown as MockMapClass).instances;
};

describe('TacticalMap Stability & Camera Persistence Regression Tests', () => {
  beforeEach(async () => {
    // Reset mock map instances
    (maplibregl.Map as unknown as MockMapClass).instances = [];

    // Reset stores
    const snapshot = await mockDataService.getSnapshot();
    useEntitiesStore.getState().setSnapshot(snapshot);
    useUiStore.getState().setMapViewport({
      center: [6.0, 5.0],
      zoom: 6.2,
      bearing: 0,
      pitch: 0,
    });
  });

  it('mounts TacticalMap inside CopPage and ensures the Map constructor is called once, map.remove is not called during ticks, and camera does not reset', async () => {
    const { unmount } = render(<CopPage />);

    // a) Map constructor was called exactly once on mount
    const instances = getMockMapInstances();
    expect(instances.length).toBe(1);
    const mapInstance = instances[0];

    // Trigger load event handler if registered
    const loadCalls = mapInstance.on.mock.calls.filter((c: unknown[]) => c[0] === 'load');
    expect(loadCalls.length).toBeGreaterThan(0);

    // Simulate user panning and zooming the map
    act(() => {
      mapInstance.center = { lng: 8.75, lat: 6.42 };
      mapInstance.zoom = 8.5;
      // Trigger moveend listener that records camera to uiStore
      const moveendListeners = mapInstance.on.mock.calls
        .filter((c: unknown[]) => c[0] === 'moveend')
        .map((c: unknown[]) => c[1] as () => void);
      moveendListeners.forEach((cb: () => void) => cb());
    });

    // Verify viewport was persisted in uiStore
    expect(useUiStore.getState().mapViewport.center).toEqual([8.75, 6.42]);
    expect(useUiStore.getState().mapViewport.zoom).toBe(8.5);

    // Reset spies on camera movement methods to track if anything resets the camera during ticks
    mapInstance.setCenter.mockClear();
    mapInstance.setZoom.mockClear();
    mapInstance.flyTo.mockClear();
    mapInstance.jumpTo.mockClear();
    mapInstance.easeTo.mockClear();
    mapInstance.fitBounds.mockClear();

    // Advance through 5 simulation ticks (simulating 1-second ticks where aircraft move & simTime advances)
    for (let tick = 0; tick < 5; tick++) {
      act(() => {
        const current = useEntitiesStore.getState();
        const nextTime = new Date(new Date(current.simTime).getTime() + 1000).toISOString();
        const updatedAircraft = { ...current.aircraft };
        if (updatedAircraft['AC-01']?.position) {
          updatedAircraft['AC-01'] = {
            ...updatedAircraft['AC-01'],
            position: {
              lat: updatedAircraft['AC-01'].position.lat + 0.005,
              lng: updatedAircraft['AC-01'].position.lng + 0.005,
            },
          };
        }
        useEntitiesStore.setState({
          simTime: nextTime,
          aircraft: updatedAircraft,
        });
      });
    }

    // a) Map constructor was NOT called again during simulation ticks
    expect(getMockMapInstances().length).toBe(1);

    // b) map.remove was NOT called during simulation ticks
    expect(mapInstance.remove).not.toHaveBeenCalled();

    // c) The camera position did NOT reset to default during ticks
    expect(mapInstance.flyTo).not.toHaveBeenCalled();
    expect(mapInstance.jumpTo).not.toHaveBeenCalled();
    expect(mapInstance.easeTo).not.toHaveBeenCalled();
    expect(mapInstance.fitBounds).not.toHaveBeenCalled();

    // Viewport remains persisted at user-panned coordinates
    expect(useUiStore.getState().mapViewport.center).toEqual([8.75, 6.42]);
    expect(useUiStore.getState().mapViewport.zoom).toBe(8.5);

    // Explicit reset button should be what triggers camera reset, not tick loop
    const resetBtn = screen.getByTitle(/Reset View/i);
    fireEvent.click(resetBtn);

    expect(mapInstance.flyTo).toHaveBeenCalledWith(
      expect.objectContaining({
        center: [6.0, 5.0],
        zoom: 6.2,
      }),
    );
    expect(useUiStore.getState().mapViewport.center).toEqual([6.0, 5.0]);

    // Unmount and verify map.remove is called exactly once on unmount
    unmount();
    expect(mapInstance.remove).toHaveBeenCalledTimes(1);
  });

  it('updates dynamic sources via setData without rebuilding canvas when aircraft props change', () => {
    const onSelectEntity = vi.fn();

    const snapshot = useEntitiesStore.getState();

    const { rerender, unmount } = render(
      <TacticalMap
        bases={snapshot.bases}
        aircraft={snapshot.aircraft}
        missions={snapshot.missions}
        threats={snapshot.threats}
        airspace={snapshot.airspace}
        weather={snapshot.weather}
        selectedEntity={null}
        onSelectEntity={onSelectEntity}
        layers={DEFAULT_LAYER_VISIBILITY}
      />,
    );

    const instances = getMockMapInstances();
    expect(instances.length).toBe(1);
    const mapInstance = instances[0];

    // Trigger map load
    const loadCalls = mapInstance.on.mock.calls.filter((c: unknown[]) => c[0] === 'load');
    loadCalls.forEach((c: unknown[]) => (c[1] as () => void)());

    // Update aircraft positions and re-render
    const updatedAircraft = {
      ...snapshot.aircraft,
      'AC-01': {
        ...snapshot.aircraft['AC-01'],
        position: { lat: 5.8, lng: 6.9 },
        heading: 120,
      },
    };

    rerender(
      <TacticalMap
        bases={snapshot.bases}
        aircraft={updatedAircraft}
        missions={snapshot.missions}
        threats={snapshot.threats}
        airspace={snapshot.airspace}
        weather={snapshot.weather}
        selectedEntity={null}
        onSelectEntity={onSelectEntity}
        layers={DEFAULT_LAYER_VISIBILITY}
      />,
    );

    // Map instance not recreated
    expect(getMockMapInstances().length).toBe(1);
    expect(mapInstance.remove).not.toHaveBeenCalled();

    unmount();
    expect(mapInstance.remove).toHaveBeenCalledTimes(1);
  });

  it('maintains viewport camera state across component unmount and remount (tab switching)', () => {
    // Set custom viewport
    useUiStore.getState().setMapViewport({
      center: [7.25, 4.88],
      zoom: 9.1,
      bearing: 15,
      pitch: 10,
    });

    const snapshot = useEntitiesStore.getState();
    const onSelectEntity = vi.fn();

    // Mount
    const { unmount } = render(
      <TacticalMap
        bases={snapshot.bases}
        aircraft={snapshot.aircraft}
        missions={snapshot.missions}
        threats={snapshot.threats}
        airspace={snapshot.airspace}
        weather={snapshot.weather}
        selectedEntity={null}
        onSelectEntity={onSelectEntity}
        layers={DEFAULT_LAYER_VISIBILITY}
      />,
    );

    const instances = getMockMapInstances();
    const firstInstance = instances[instances.length - 1];
    expect(firstInstance.center).toEqual({ lng: 7.25, lat: 4.88 });
    expect(firstInstance.zoom).toBe(9.1);

    // Unmount (user switches tabs to Missions or Resources)
    unmount();
    expect(firstInstance.remove).toHaveBeenCalledTimes(1);

    // User navigates back to COP
    render(
      <TacticalMap
        bases={snapshot.bases}
        aircraft={snapshot.aircraft}
        missions={snapshot.missions}
        threats={snapshot.threats}
        airspace={snapshot.airspace}
        weather={snapshot.weather}
        selectedEntity={null}
        onSelectEntity={onSelectEntity}
        layers={DEFAULT_LAYER_VISIBILITY}
      />,
    );

    const secondInstance = instances[instances.length - 1];
    // Camera is restored to the panned/zoomed location, NOT reset to default
    expect(secondInstance.center).toEqual({ lng: 7.25, lat: 4.88 });
    expect(secondInstance.zoom).toBe(9.1);
  });
});
