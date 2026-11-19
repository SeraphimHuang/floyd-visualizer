import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useEffect, useRef, useState } from 'react';
import { GraphCanvas, type Pt } from './GraphCanvas';

type CanvasProps = Omit<Parameters<typeof GraphCanvas>[0], 'pos' | 'r' | 'fontSize' | 'viewBox' | 'showLabels'>;

// OpenStreetMap's standard tiles: free, no API key, the familiar green / blue / white map.
// Please keep the attribution (required by the OSM tile usage policy).
const TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

/**
 * Leaflet map with the same SVG drawing as the graph view laid on top.
 * Node positions are re-projected whenever the map moves or zooms.
 */
export function MapView(props: CanvasProps) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const [, setTick] = useState(0);
  const nodes = props.graph.nodes;
  const nodeKey = nodes.map((n) => `${n.id}:${n.lat},${n.lng}`).join('|');

  useEffect(() => {
    const m = L.map(el.current!, { zoomAnimation: false, zoomSnap: 0.25 });
    L.tileLayer(TILE_URL, { attribution: ATTRIBUTION, maxZoom: 19 }).addTo(m);
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

  // Fit the map to the nodes whenever the node set changes.
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    const bounds = L.latLngBounds(nodes.map((n) => [n.lat!, n.lng!] as [number, number]));
    m.fitBounds(bounds, { padding: [40, 40] });
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

  // Scale nodes and text with the map's size, so they read well on a projector.
  const r = Math.round(Math.max(14, Math.min(28, Math.min(size.x, size.y) / 26)));
  const fontSize = Math.round(r * 0.78);

  return (
    <div className="map-view">
      <div ref={el} className="map" />
      {m && size.x > 0 && (
        <div className="map-overlay">
          <GraphCanvas {...props} pos={pos} r={r} fontSize={fontSize} viewBox={`0 0 ${size.x} ${size.y}`} showLabels={false} />
        </div>
      )}
    </div>
  );
}
