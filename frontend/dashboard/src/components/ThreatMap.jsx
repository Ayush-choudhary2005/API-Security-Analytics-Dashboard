import React from 'react';
import { MapContainer, TileLayer, CircleMarker, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

// Fallback lat/lng mapping for demo / simulation IPs
const getCoordinatesForIP = (ip, metadata = {}) => {
  if (metadata.latitude && metadata.longitude) {
    return [metadata.latitude, metadata.longitude];
  }
  // Deterministic coordinate pseudo-hash based on IP octets for visual plotting
  const parts = String(ip || '127.0.0.1').split('.').map(p => parseInt(p, 10) || 0);
  const lat = ((parts[0] * 3 + parts[1]) % 120) - 50; // -50 to +70
  const lng = ((parts[2] * 4 + parts[3]) % 300) - 150; // -150 to +150
  return [lat, lng];
};

export const ThreatMap = ({ threats = [] }) => {
  const center = [25.0, 10.0];

  return (
    <div className="w-full h-80 rounded-xl overflow-hidden border border-slate-800 bg-slate-950 relative">
      <MapContainer
        center={center}
        zoom={2}
        minZoom={1.5}
        maxZoom={7}
        scrollWheelZoom={false}
        className="w-full h-full"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {threats.map((threat, idx) => {
          const coords = getCoordinatesForIP(threat.ip || threat.source_ip, threat.metadata);
          const isCritical = threat.severity === 'critical' || threat.severity === 'high';
          const color = isCritical ? '#f43f5e' : '#06b6d4';

          return (
            <CircleMarker
              key={threat.id || idx}
              center={coords}
              radius={isCritical ? 8 : 5}
              pathOptions={{
                color: color,
                fillColor: color,
                fillOpacity: 0.7,
                weight: 2,
              }}
            >
              <Popup>
                <div className="text-xs space-y-1">
                  <p className="font-bold text-white uppercase tracking-wider">{threat.attack_type || 'Threat Anomaly'}</p>
                  <p className="font-mono text-cyan-400">IP: {threat.ip || threat.source_ip || 'Unknown'}</p>
                  <p className="text-slate-300">Endpoint: {threat.endpoint || '/api'}</p>
                  <p className="text-slate-400">Score: {threat.anomaly_score?.toFixed ? threat.anomaly_score.toFixed(2) : threat.anomaly_score}</p>
                </div>
              </Popup>
            </CircleMarker>
          );
        })}
      </MapContainer>
      <div className="absolute bottom-2 left-2 z-[400] bg-slate-900/90 border border-slate-700/80 rounded px-2.5 py-1 text-[10px] font-mono text-slate-300 flex items-center space-x-3">
        <span className="flex items-center space-x-1">
          <span className="w-2 h-2 rounded-full bg-rose-500"></span>
          <span>High / Critical</span>
        </span>
        <span className="flex items-center space-x-1">
          <span className="w-2 h-2 rounded-full bg-cyan-400"></span>
          <span>Anomaly</span>
        </span>
      </div>
    </div>
  );
};
