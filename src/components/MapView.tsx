import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useEffect, useRef, useState } from 'react';
import { GraphCanvas, type Pt } from './GraphCanvas';

type CanvasProps = Omit<Parameters<typeof GraphCanvas>[0], 'pos' | 'r' | 'fontSize' | 'viewBox' | 'showLabels'>;

// Free, keyless basemaps (Esri "Canvas" tiles). OpenStreetMap's standard tiles are a keyless fallback:
//   https://tile.openstreetmap.org/{z}/{x}/{y}.png
const TILES = {
  dark: 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}',
  light: 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}',
};
const ATTRIBUTION = 'Tiles &copy; Esri &mdash; Esri, HERE, Garmin, &copy; OpenStreetMap contributors';

/**
 * Leaflet map with the same SVG drawing as the graph view laid on top.
 * Node positions are re-projected whenever the map moves or zooms.
 */
export function MapView(props: CanvasProps & { theme: 'dark' | 'light' }) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const tiles = useRef<L.TileLayer | null>(null);
  const [, setTick] = useState(0);
  const nodes = props.graph.nodes;
  const nodeKey = nodes.map((n) => `${n.id}:${n.lat},${n.lng}`).join('|');

  useEffect(() => {
    const m = L.map(el.current!, { zoomAnimation: false, zoomSnap: 0.25 });
    tiles.current = L.tileLayer(TILES[props.theme], { attribution: ATTRIBUTION, maxZoom: 16 }).addTo(m);
    m.on('move zoom resize viewreset', () => setTick((t) => t + 1));
    map.current = m;
    const ro = new ResizeObserver(() => m.invalidateSize());
    ro.observe(el.current!);
    return () => {
      ro.disconnect();
      m.remove();
      map.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    tiles.current?.setUrl(TILES[props.theme]);
  }, [props.theme]);

  // Fit the map to the nodes whenever the node set changes.
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    const bounds = L.latLngBounds(nodes.map((n) => [n.lat!, n.lng!] as [number, number]));
    m.fitBounds(bounds, { padding: [70, 70] });
    setTick((t) => t + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodeKey]);

  const m = map.current;
  let pos: Pt[] = [];
  let size = { x: 0, y: 0 };
  if (m) {
    size = m.getSize();
    pos = nodes.map((n) => {
      const p = m.latLngToContainerPoint([n.lat!, n.lng!]);
      return { x: p.x, y: p.y };
    });
  }

  return (
    <div className="map-view">
      <div ref={el} className="map" />
      {m && size.x > 0 && (
        <div className="map-overlay">
          <GraphCanvas {...props} pos={pos} r={17} fontSize={13} viewBox={`0 0 ${size.x} ${size.y}`} showLabels />
        </div>
      )}
    </div>
  );
}
