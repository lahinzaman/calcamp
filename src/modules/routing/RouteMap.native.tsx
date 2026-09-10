import { useEffect, useState } from 'react';
import { NativeModules, View } from 'react-native';
import { Text } from '../../theme/primitives';
import type { RouteMapProps } from './RouteMap';
export default function RouteMap({ start, route, token }: RouteMapProps) {
  const [mapbox, setMapbox] = useState<typeof import('@rnmapbox/maps') | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    if (!NativeModules.RNMBXModule) { setError('Mapbox requires a custom native build.'); return; }
    import('@rnmapbox/maps').then(async module => {
      await module.setAccessToken(token);
      if (active) setMapbox(module);
    }).catch(() => { if (active) setError('Mapbox could not be initialized.'); });
    return () => { active = false; };
  }, [token]);
  if (!mapbox || error) return <View className="h-64 items-center justify-center rounded-3xl bg-raised p-6"><Text>{error ?? 'Loading campus map…'}</Text></View>;
  const { MapView, Camera, ShapeSource, LineLayer } = mapbox;
  const coordinates = route?.geometry.coordinates ?? [start];
  const west = Math.min(...coordinates.map(p => p[0])), east = Math.max(...coordinates.map(p => p[0]));
  const south = Math.min(...coordinates.map(p => p[1])), north = Math.max(...coordinates.map(p => p[1]));
  return <View className="h-80 overflow-hidden rounded-3xl">
    <MapView style={{ flex: 1 }} onMapLoadingError={() => setError('The map could not load. Check your Mapbox token and connection.')}>
      <Camera centerCoordinate={start} zoomLevel={14} {...(route ? { bounds: { ne: [east, north], sw: [west, south], paddingTop: 30, paddingBottom: 30, paddingLeft: 30, paddingRight: 30 } } : {})} />
      {route && <ShapeSource id="walking-loop" shape={{ type: 'Feature', properties: {}, geometry: route.geometry }}>
        <LineLayer id="walking-line" style={{ lineColor: '#91ACFF', lineWidth: 5, lineCap: 'round', lineJoin: 'round' }} />
      </ShapeSource>}
    </MapView>
  </View>;
}
