import React, { useEffect, useState } from 'react';
import { MapContainer, TileLayer, CircleMarker, Popup, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { useAppContext } from '../state/AppContext';
import { useSimulationContext } from '../state/SimulationContext';
import { pilotLocations } from '../data/pilotLocations';

function probColor(p) {
  if (p >= 0.8) return '#dc2626';
  if (p >= 0.6) return '#ea580c';
  if (p >= 0.3) return '#d97706';
  return '#16a34a';
}

function safeNum(val, fallback = 0) {
  const n = Number(val);
  return Number.isFinite(n) ? n : fallback;
}

// Fly map to selected location
function FlyTo({ location }) {
  const map = useMap();
  useEffect(() => {
    if (location) {
      const lat = safeNum(location.lat ?? location.latitude, 27.5);
      const lng = safeNum(location.lng ?? location.lon ?? location.longitude, 88.6);
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        try {
          map.flyTo([lat, lng], 12, { duration: 1.2 });
        } catch (e) {
          console.warn('Map flyTo error:', e);
        }
      }
    }
  }, [location, map]);
  return null;
}

export default function MapView() {
  const { selectedLocation, setSelectedLocation, locations: ctxLocations } = useAppContext();
  const { lastPrediction } = useSimulationContext();
  const [locations, setLocations] = useState(ctxLocations || pilotLocations);
  const [layer, setLayer] = useState('osm');

  useEffect(() => {
    if (Array.isArray(ctxLocations) && ctxLocations.length > 0) {
      setLocations(ctxLocations);
    }
  }, [ctxLocations]);

  const tileUrl = layer === 'satellite'
    ? 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
    : 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';

  const defaultCenter = [27.45, 88.58];

  return (
    <div className="map-wrapper" style={{ height: '100%', width: '100%', position: 'relative' }}>
      {/* Layer toggle */}
      <div className="map-controls">
        <button className={`map-btn ${layer === 'osm' ? 'active' : ''}`} onClick={() => setLayer('osm')}>🗺 Map</button>
        <button className={`map-btn ${layer === 'satellite' ? 'active' : ''}`} onClick={() => setLayer('satellite')}>🛰 Satellite</button>
      </div>

      <MapContainer center={defaultCenter} zoom={10} style={{ height: '100%', width: '100%' }} zoomControl={true}>
        <TileLayer url={tileUrl} attribution="© OpenStreetMap / Esri" maxZoom={18} />
        <FlyTo location={selectedLocation} />

        {locations.map(loc => {
          const locId = loc.location_id || loc.id;
          const pred = lastPrediction?.[locId];
          const lsP = pred?.prediction?.hazards?.landslide?.probability || 0;
          const flP = pred?.prediction?.hazards?.flood?.probability || 0;
          const risk = Math.max(lsP, flP);
          const color = probColor(risk);
          const isSelected = (selectedLocation?.location_id || selectedLocation?.id) === locId;
          const lat = safeNum(loc.lat ?? loc.latitude, 27.5);
          const lng = safeNum(loc.lng ?? loc.lon ?? loc.longitude, 88.6);

          return (
            <CircleMarker
              key={locId}
              center={[lat, lng]}
              radius={isSelected ? 14 : 9}
              pathOptions={{
                color: isSelected ? '#ffffff' : color,
                fillColor: color,
                fillOpacity: 0.85,
                weight: isSelected ? 3 : 1.5,
              }}
              eventHandlers={{ click: () => setSelectedLocation(loc) }}
            >
              <Popup>
                <div style={{ minWidth: 200, background: '#ffffff', color: '#0f172a', borderRadius: 8, padding: '10px 12px', boxShadow: '0 4px 16px rgba(0,0,0,0.12)', border: '1px solid #e2e8f0' }}>
                  <div style={{ fontWeight: 800, fontSize: 13, color: '#0f172a', marginBottom: 4 }}>{loc.name || locId}</div>
                  <div style={{ display: 'inline-block', fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 4, marginBottom: 6, background: loc.hazard_typology === 'COMPOUND' ? '#f3e8ff' : loc.hazard_typology === 'LANDSLIDE_ONLY' ? '#fef3c7' : '#e0f2fe', color: loc.hazard_typology === 'COMPOUND' ? '#7e22ce' : loc.hazard_typology === 'LANDSLIDE_ONLY' ? '#b45309' : '#0369a1' }}>
                    {loc.hazard_typology === 'COMPOUND' ? '🔮 Compound Gorge' : loc.hazard_typology === 'LANDSLIDE_ONLY' ? '🏔️ High Alpine Ridge' : '🌊 River Basin Flat'}
                  </div>
                  <div style={{ fontSize: 12, lineHeight: 1.5 }}>
                    <div>🏔 Landslide: <b style={{ color: probColor(lsP) }}>{(lsP * 100).toFixed(1)}%</b></div>
                    <div>🌊 Flood: <b style={{ color: '#0284c7' }}>{(flP * 100).toFixed(1)}%</b></div>
                    {pred?.action?.action && (
                      <div style={{ marginTop: 4, fontWeight: 700, color: probColor(risk) }}>
                        ⚡ {pred.action.action}
                      </div>
                    )}
                    <div style={{ marginTop: 4, color: '#64748b', fontSize: 11 }}>
                      {lat.toFixed(3)}°N, {lng.toFixed(3)}°E · {loc.elevation_m || 500}m
                    </div>
                  </div>
                </div>
              </Popup>
            </CircleMarker>
          );
        })}
      </MapContainer>

      {/* Risk legend */}
      <div className="map-legend">
        {[['var(--hazard-safe)', '< 30%', 'Safe'], ['var(--hazard-watch)', '30–60%', 'Watch'], ['var(--hazard-warning)', '60–80%', 'Warning'], ['var(--hazard-critical)', '> 80%', 'Emergency']].map(([c, r, l]) => (
          <div key={l} className="legend-item">
            <span className="legend-dot" style={{ background: c }} />
            <span>{l} {r}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
