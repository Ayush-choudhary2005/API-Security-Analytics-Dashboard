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
    <div className="w-full h-80 rounded-md overflow-hidden border border-[#1E2127] bg-[#0A0B0D] relative">
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
          const color = isCritical ? '#F07178' : threat.severity === 'medium' ? '#FFCB6B' : '#82AAFF';

          return (
            <CircleMarker
              key={threat.id || idx}
              center={coords}
              radius={isCritical ? 7 : 4.5}
              pathOptions={{
                color: color,
                fillColor: color,
                fillOpacity: isCritical ? 0.9 : 0.6,
                weight: isCritical ? 2 : 1,
              }}
            >
              <Popup>
                <div className="text-xs space-y-1.5 p-1 font-sans">
                  <div className="flex items-center justify-between gap-2 border-b border-[#2A2E37] pb-1">
                    <p className="font-mono text-[10px] font-bold text-[#F07178] uppercase tracking-wider">{threat.attack_type || 'ANOMALY_VECTOR'}</p>
                    <span className="font-mono text-[10px] px-1 rounded bg-[#1E2127] text-[#9BA1AC]">{threat.severity || 'flagged'}</span>
                  </div>
                  <p className="font-mono text-xs text-[#E6E8EB]">IP: {threat.ip || threat.source_ip || '127.0.0.1'}</p>
                  <p className="text-[11px] text-[#9BA1AC] truncate max-w-[180px]">Endpoint: {threat.endpoint || '/api'}</p>
                  <p className="font-mono text-[10px] text-[#C792EA]">Anomaly Score: {threat.anomaly_score?.toFixed ? threat.anomaly_score.toFixed(3) : threat.anomaly_score || '0.92'}</p>
                </div>
              </Popup>
            </CircleMarker>
          );
        })}
      </MapContainer>
      <div className="absolute bottom-2 left-2 z-[400] bg-[#101216]/95 border border-[#1E2127] rounded px-3 py-1.5 text-[10px] font-mono text-[#9BA1AC] flex items-center space-x-3.5 shadow-2xl backdrop-blur-xs">
        <span className="flex items-center space-x-1.5">
          <span className="w-2 h-2 rounded-full bg-[#F07178] shadow-[0_0_6px_rgba(240,113,120,0.6)]"></span>
          <span className="text-[#E6E8EB]">CRITICAL/HIGH</span>
        </span>
        <span className="flex items-center space-x-1.5">
          <span className="w-2 h-2 rounded-full bg-[#FFCB6B]"></span>
          <span>SUSPICIOUS</span>
        </span>
        <span className="flex items-center space-x-1.5">
          <span className="w-2 h-2 rounded-full bg-[#82AAFF]"></span>
          <span>ANOMALY</span>
        </span>
      </div>
    </div>
  );
};

export default ThreatMap;
