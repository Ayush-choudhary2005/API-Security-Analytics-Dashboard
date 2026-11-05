import React from 'react';
import { MapContainer, TileLayer, CircleMarker, Popup } from 'react-leaflet';
import { MapPin, ShieldCheck, ShieldAlert } from 'lucide-react';
import 'leaflet/dist/leaflet.css';

// Safely parse metadata if formatted as JSON string
const parseMetadata = (raw) => {
  if (!raw) return {};
  if (typeof raw === 'object') return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
};

// Resolve authentic geolocation coordinates. Returns null if missing or invalid.
const getCoordinatesForIP = (ip, rawMetadata = {}) => {
  const meta = parseMetadata(rawMetadata);
  const lat = parseFloat(meta?.latitude);
  const lng = parseFloat(meta?.longitude);
  if (!isNaN(lat) && !isNaN(lng) && (lat !== 0 || lng !== 0)) {
    return [lat, lng];
  }
  return null;
};

export const ThreatMap = ({ threats = [] }) => {
  const center = [22.0, 77.0]; // Centered on South Asia / Global view

  // Partition threats into geocoded vs un-geocoded
  const items = threats.map((threat, idx) => {
    const meta = parseMetadata(threat.metadata);
    const coords = getCoordinatesForIP(threat.ip || threat.source_ip, meta);
    return {
      threat,
      meta,
      coords,
      key: threat.id || threat.event_id || idx,
    };
  });

  const geocoded = items.filter((item) => item.coords !== null);
  const unmappedCount = items.length - geocoded.length;

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

        {geocoded.map(({ threat, meta, coords, key }) => {
          const isCritical = threat.severity === 'critical' || threat.severity === 'high';
          const color = isCritical ? '#F07178' : threat.severity === 'medium' ? '#FFCB6B' : '#82AAFF';
          const locationLabel = [meta.city, meta.region, meta.country].filter(Boolean).join(', ');

          return (
            <CircleMarker
              key={key}
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
                    <p className="font-mono text-[10px] font-bold text-[#F07178] uppercase tracking-wider">
                      {String(threat.attack_type || 'ANOMALY VECTOR').replace(/_/g, ' ')}
                    </p>
                    <span className="font-mono text-[10px] px-1 rounded bg-[#1E2127] text-[#9BA1AC]">{threat.severity || 'flagged'}</span>
                  </div>
                  <p className="font-mono text-xs text-[#E6E8EB]">IP: {threat.ip || threat.source_ip || '127.0.0.1'}</p>
                  {locationLabel && (
                    <p className="text-[11px] text-[#C3E88D] font-mono flex items-center space-x-1">
                      <MapPin className="w-3 h-3 flex-shrink-0" />
                      <span>{locationLabel}</span>
                    </p>
                  )}
                  <p className="text-[11px] text-[#9BA1AC] truncate max-w-[180px]">Endpoint: {threat.endpoint || '/api'}</p>
                  <p className="font-mono text-[10px] text-[#C792EA]">Anomaly Score: {threat.anomaly_score?.toFixed ? threat.anomaly_score.toFixed(3) : threat.anomaly_score || '0.92'}</p>
                </div>
              </Popup>
            </CircleMarker>
          );
        })}
      </MapContainer>

      {/* Overlay: Zero Hostile Ingress Threats */}
      {threats.length === 0 && (
        <div className="absolute inset-0 z-[400] bg-[#0A0B0D]/75 backdrop-blur-[2px] flex flex-col items-center justify-center p-6 text-center">
          <div className="w-12 h-12 rounded-2xl bg-[#C3E88D]/10 border border-[#C3E88D]/30 flex items-center justify-center mb-3 text-[#C3E88D] shadow-lg shadow-[#C3E88D]/5">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <p className="text-sm font-semibold text-[#E6E8EB] font-mono">Zero Hostile Ingress Threats</p>
          <p className="text-xs text-[#9BA1AC] max-w-sm mt-1 font-mono">
            Ingress traffic is operating within baseline security parameters. Hostile origin coordinates will project here in real time when threats are flagged.
          </p>
        </div>
      )}

      {/* Overlay: Threats flagged but origin IPs are private/internal without GeoIP */}
      {threats.length > 0 && geocoded.length === 0 && (
        <div className="absolute inset-0 z-[400] bg-[#0A0B0D]/80 backdrop-blur-[2px] flex flex-col items-center justify-center p-6 text-center">
          <div className="w-12 h-12 rounded-2xl bg-[#82AAFF]/10 border border-[#82AAFF]/30 flex items-center justify-center mb-3 text-[#82AAFF] shadow-lg shadow-[#82AAFF]/5">
            <ShieldAlert className="w-6 h-6 text-[#F07178]" />
          </div>
          <p className="text-sm font-semibold text-[#E6E8EB] font-mono">
            {threats.length} Flagged Ingress Threat{threats.length > 1 ? 's' : ''}
          </p>
          <p className="text-xs text-[#9BA1AC] max-w-md mt-1 font-mono">
            Origin IPs are private/internal networks (e.g. localhost, VPC subnets) or pending GeoIP enrichment. Zero public geographic coordinates to plot on world projection.
          </p>
        </div>
      )}

      {/* Map Legend & Summary Footer */}
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
        {unmappedCount > 0 && geocoded.length > 0 && (
          <span className="text-[10px] font-mono text-[#7B818B] border-l border-[#2A2E37] pl-3">
            + {unmappedCount} INTERNAL / VPC
          </span>
        )}
      </div>
    </div>
  );
};

export default ThreatMap;
