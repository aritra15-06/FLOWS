import React, { useState, useEffect, Fragment } from "react";
import { MapContainer, TileLayer, CircleMarker, Marker, Polyline, Tooltip, Popup, useMapEvents } from "react-leaflet";
import L from "leaflet";
import { MOCK_POPULATION, ROAD_CORRIDORS, SIKKIM_SETTLEMENTS } from "../data/mockPopulation";
import "leaflet/dist/leaflet.css";

function MapClickHandler({ isPickingLocation, onMapClick }) {
  useMapEvents({
    click(e) {
      if (isPickingLocation && onMapClick) {
        onMapClick(e.latlng.lat, e.latlng.lng);
      }
    },
  });
  return null;
}

import SIKKIM_OSM_RIVERS from "../data/sikkim_osm_rivers.json";

// ═══ FULL OPENSTREETMAP TEESTA DRAINAGE SYSTEM (107 LIVE OSM REACHES) ═══
export const EXTENDED_TEESTA_SYSTEM = SIKKIM_OSM_RIVERS;

const createWeatherCloudIcon = (rain1h, rain24h, isHeavyStorm) => {
  const rate = Number(rain1h || 0).toFixed(1);
  const cloudFill = isHeavyStorm ? "#334155" : "#64748b";
  const cloudStroke = isHeavyStorm ? "#1e293b" : "#475569";

  return L.divIcon({
    className: "simulation-weather-cloud-icon",
    html: `
      <div class="weather-cloud-container ${isHeavyStorm ? "heavy-storm" : ""}">
        <div class="weather-rain-badge">🌧️ ${rate} mm/h</div>
        <div class="weather-cloud-wrapper">
          <svg class="weather-cloud-svg" viewBox="0 0 56 30" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M14 24h28a8 8 0 0 0 0-16 12 12 0 0 0-22.8 3.5A7.5 7.5 0 0 0 14 24z"
                  fill="${cloudFill}" stroke="${cloudStroke}" stroke-width="1.5" />
            ${
              isHeavyStorm
                ? '<path class="lightning-bolt" d="M28 12l-3 7h4l-2.5 7 7.5-9h-4.5l2.5-5z" fill="#facc15" stroke="#eab308" stroke-width="0.8" />'
                : ""
            }
          </svg>
          <div class="rain-streaks-container">
            <span class="rain-streak drop-1" style="left: 8px;"></span>
            <span class="rain-streak drop-2" style="left: 17px;"></span>
            <span class="rain-streak drop-3" style="left: 26px;"></span>
            <span class="rain-streak drop-4" style="left: 35px;"></span>
            <span class="rain-streak drop-5" style="left: 44px;"></span>
          </div>
        </div>
      </div>
    `,
    iconSize: [64, 56],
    iconAnchor: [32, 54],
  });
};

const createHumanIcon = (status) => {
  const isEvac = status.isDanger;
  return L.divIcon({
    className: "custom-human-leaflet-icon",
    html: `
      <div class="human-pin ${isEvac ? 'pulse-danger-pin' : ''}">
        <div class="human-pin-body" style="background: ${status.color};">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="#ffffff">
            <circle cx="12" cy="7" r="4" />
            <path d="M12 14c-4.42 0-8 2.24-8 5v1h16v-1c0-2.76-3.58-5-8-5z" />
          </svg>
        </div>
        <div class="human-pin-arrow" style="border-top-color: ${status.color};"></div>
      </div>
    `,
    iconSize: [26, 32],
    iconAnchor: [13, 32],
    popupAnchor: [0, -30],
  });
};

export default function SimulationMapView({
  sites = {},
  selectedSite,
  onSelectSite,
  showPeople = true,
  showInfrastructure = true,
  hazardMode = "compound", // "landslide" | "flood" | "compound"
  setHazardMode,
  isPickingLocation = false,
  setIsPickingLocation,
  onMapClick,
  customSites = [],
  onClearCustomSites,
  viewDimension,
  setViewDimension,
}) {
  const [mapLayer, setMapLayer] = useState("streets");
  const [internalHazardMode, setInternalHazardMode] = useState(hazardMode);
  const activeHazardMode = setHazardMode ? hazardMode : internalHazardMode;
  const handleModeChange = setHazardMode || setInternalHazardMode;

  // Dynamic Live Waterways State (OpenStreetMap Overpass Engine)
  const [waterways, setWaterways] = useState(SIKKIM_OSM_RIVERS);
  const [waterwaySource, setWaterwaySource] = useState("OpenStreetMap Live Drainage Engine");
  const [isLoadingWaterways, setIsLoadingWaterways] = useState(false);

  // Fetch live OpenStreetMap waterways from backend
  useEffect(() => {
    let isMounted = true;
    async function loadLiveWaterways() {
      try {
        setIsLoadingWaterways(true);
        const res = await fetch("/api/waterways/live");
        if (res.ok) {
          const data = await res.json();
          if (isMounted && data.waterways && data.waterways.length > 10) {
            setWaterways(data.waterways);
            setWaterwaySource(data.source || "OSM Live Engine");
          }
        }
      } catch (err) {
        console.warn("Notice: Live waterways API using calibrated OSM network.", err);
      } finally {
        if (isMounted) setIsLoadingWaterways(false);
      }
    }
    loadLiveWaterways();
    return () => { isMounted = false; };
  }, []);

  async function handleRefreshWaterways() {
    try {
      setIsLoadingWaterways(true);
      const res = await fetch("/api/waterways/live?force_refresh=true");
      if (res.ok) {
        const data = await res.json();
        if (data.waterways && data.waterways.length > 10) {
          setWaterways(data.waterways);
          setWaterwaySource(data.source || "OSM Live Engine");
        }
      }
    } catch (e) {
      console.warn("Waterways refresh error:", e);
    } finally {
      setIsLoadingWaterways(false);
    }
  }

  const entries = Object.entries(sites);
  const center = [27.48, 88.58];

  // ═══ UNIFIED SEVERITY COLOR SYSTEM FOR ALL REGIONS (SAME PALETTE FOR ALL) ═══
  function getSiteDisplayColor(data) {
    if (!data) return "#16a34a";

    const sevBand = data.severity_band || "MINOR";
    const stability = data.stability_state || "STABLE";
    const riverStage = data.river_stage_state || "NORMAL";
    const fos = data.factor_of_safety;
    const isCompound = data.compound_active;
    const prob = data.probability_percent || 0;
    const flProb = data.flood_probability_percent || 0;

    // Red: Critical Failure / Catastrophic Flood / Active Compound Crisis
    if (
      isCompound ||
      sevBand === "CATASTROPHIC_POTENTIAL" ||
      stability === "UNSTABLE" ||
      riverStage === "CATASTROPHIC_SURGE" ||
      (fos != null && fos < 1.0) ||
      prob >= 75 ||
      flProb >= 75
    ) {
      return "#dc2626";
    }

    // Orange: Major Warning / Overbank Flooding
    if (
      sevBand === "MAJOR" ||
      stability === "MARGINAL" ||
      riverStage === "OVERBANK_FLOODING" ||
      (fos != null && fos < 1.3) ||
      prob >= 50 ||
      flProb >= 50
    ) {
      return "#ea580c";
    }

    // Amber: Moderate Advisory / Bankfull Warning
    if (
      sevBand === "MODERATE" ||
      riverStage === "BANKFULL_WARNING" ||
      (fos != null && fos < 1.5) ||
      prob >= 25 ||
      flProb >= 25
    ) {
      return "#d97706";
    }

    // Green: Nominal Stability / Safe
    return "#16a34a";
  }

  function getCitizenStatus(citizen) {
    const nearSite = sites[citizen.nearLocationId];
    const isUnstable = nearSite?.stability_state === "UNSTABLE" || (nearSite?.factor_of_safety != null && nearSite.factor_of_safety < 1.0);
    const isFlooding = nearSite?.river_stage_state === "OVERBANK_FLOODING" || nearSite?.river_stage_state === "CATASTROPHIC_SURGE";
    const prob = Math.round(nearSite?.probability_percent || 70);
    const floodQ = nearSite?.peak_discharge_m3s || 45;

    if (isUnstable || isFlooding) {
      return {
        badge: isFlooding ? "🌊 FLASH FLOOD EVACUATION" : "🚨 LANDSLIDE EVACUATION",
        color: "#dc2626",
        alertText: isFlooding
          ? `Overbank river surge (Q = ${floodQ} m³/s). Evacuate valley floor immediately to designated high-ground shelters.`
          : `High landslide hazard (${prob}% risk). Strictly avoid road travel and evacuate cut-slope dwellings.`,
        isDanger: true,
      };
    } else if (nearSite?.stability_state === "MARGINAL" || nearSite?.river_stage_state === "BANKFULL_WARNING") {
      return {
        badge: "🟡 PREPARE & MONITOR",
        color: "#d97706",
        alertText: `Elevated pore pressure & bankfull river stage. Prepare emergency go-bags and avoid low-lying riverbanks.`,
        isDanger: false,
      };
    }
    return {
      badge: "🟢 SAFE PASSAGE",
      color: "#16a34a",
      alertText: `Normal equilibrium in this sector. Channel flow within banks.`,
      isDanger: false,
    };
  }

  // Count active flood surges
  let activeSurgeCount = 0;
  entries.forEach(([_, d]) => {
    if (d?.river_stage_state === "OVERBANK_FLOODING" || d?.river_stage_state === "CATASTROPHIC_SURGE") {
      activeSurgeCount++;
    }
  });

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      {/* ═══ FLOATING CONTROLS: LAYER SWITCHER, CUSTOM POINT & HAZARD MODE ═══ */}
      <div className="sim-map-mode-bar">


        {/* Custom Point Adding Mode Toggle Button */}
        <button
          className={`sim-mode-btn ${isPickingLocation ? "picking-active" : ""}`}
          onClick={() => setIsPickingLocation && setIsPickingLocation(!isPickingLocation)}
          title="Click anywhere on the map to add a custom monitoring point with auto-connected village, highway & river links"
          style={isPickingLocation ? { background: "#0284c7", color: "#ffffff", borderColor: "#0284c7" } : {}}
        >
          {isPickingLocation ? "🎯 Click Map to Place Pin" : "📍 + Add Custom Point"}
        </button>

        {customSites.length > 0 && (
          <button
            className="sim-mode-btn"
            onClick={onClearCustomSites}
            title="Clear all custom dropped pins"
            style={{ color: "#dc2626", fontWeight: 700 }}
          >
            🗑️ Clear ({customSites.length})
          </button>
        )}

        {/* Live Waterways Indicator & Refresh */}
        <button
          className="sim-mode-btn"
          onClick={handleRefreshWaterways}
          title={`Waterways: ${waterwaySource}. Click to re-query OpenStreetMap.`}
        >
          🌊 OSM Rivers {isLoadingWaterways ? "⏳" : "🟢"} ({waterways.length})
        </button>

        {setViewDimension && (
          <button
            className="sim-mode-btn"
            onClick={() => setViewDimension("3d")}
            style={{ fontWeight: 700, color: "#0284c7", borderColor: "#0284c7", background: "#f0f9ff" }}
            title="Switch to 3D Satellite Terrain Model with live DEM & rain/flood animations"
          >
            🏔️ 3D Terrain View
          </button>
        )}

        <div className="map-layer-switcher" style={{ position: "static" }}>
          <button
            className={`map-layer-btn ${mapLayer === "streets" ? "active" : ""}`}
            onClick={() => setMapLayer("streets")}
          >
            🗺️ Clean Map
          </button>
          <button
            className={`map-layer-btn ${mapLayer === "satellite" ? "active" : ""}`}
            onClick={() => setMapLayer("satellite")}
          >
            🛰️ Satellite
          </button>
        </div>
      </div>

      {/* Floating Prompt when Location Picking Mode is Active */}
      {isPickingLocation && (
        <div className="sim-pick-location-banner">
          <span>🎯 <strong>LOCATION PICKING MODE:</strong> Click anywhere on the Sikkim map to drop a custom monitoring site.</span>
          <button className="sim-pick-cancel-btn" onClick={() => setIsPickingLocation && setIsPickingLocation(false)}>
            ✕ Cancel
          </button>
        </div>
      )}

      {/* Active River Surge Warning Banner */}
      {activeSurgeCount > 0 && (
        <div className="sim-river-surge-banner">
          <span className="pulse-danger-dot" />
          <span>🌊 <strong>RIVER OVERBANK FLOODING:</strong> {activeSurgeCount} Teesta basin reaches exceeding channel conveyance capacity</span>
        </div>
      )}

      {/* Map Severity Legend (Unified 4-Color Scale for ALL Hazards) */}
      <div className="map-floating-legend">
        <div className="legend-title">Unified Hazard Threat Scale</div>
        <div className="legend-item"><span className="legend-dot critical" /> Critical Failure / Catastrophic Flood</div>
        <div className="legend-item"><span className="legend-dot major" /> Major Warning / Overbank Flooding</div>
        <div className="legend-item"><span className="legend-dot moderate" /> Moderate Advisory / Bankfull Warning</div>
        <div className="legend-item"><span className="legend-dot stable" /> Safe / Nominal Baseflow</div>

        <div className="legend-item" style={{ marginTop: 6, paddingTop: 6, borderTop: "1px solid #e2e8f0" }}>
          <span style={{ display: "inline-block", width: 14, height: 3, background: "#0284c7", marginRight: 6, verticalAlign: "middle" }} />
          Teesta River System (OSM Live)
        </div>

        {customSites.length > 0 && (
          <div style={{ marginTop: 6, paddingTop: 6, borderTop: "1px solid #e2e8f0", fontSize: "0.68rem", color: "#334155" }}>
            <strong style={{ display: "block", marginBottom: 3 }}>Real Map River Drainage:</strong>
            <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
              <span><b style={{ color: "#0284c7" }}>- - -</b> Hillside Runoff Feeder</span>
              <span><b style={{ color: "#06b6d4" }}>━━━━</b> Downstream River Flow (OSM)</span>
            </div>
          </div>
        )}
      </div>

      <MapContainer
        center={center}
        zoom={9}
        style={{ height: "100%", width: "100%", cursor: isPickingLocation ? "crosshair" : "grab" }}
      >
        <MapClickHandler isPickingLocation={isPickingLocation} onMapClick={onMapClick} />
        {mapLayer === "streets" ? (
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
        ) : (
          <TileLayer
            attribution='Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community'
            url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
            maxZoom={19}
          />
        )}

        {/* ═══ LIVE OSM TEESTA DRAINAGE SYSTEM (PERMANENT NATURAL RIVER BLUE) ═══ */}
        {waterways.map((river) => {
          const nearSite = sites[river.nearLocationId];
          const distKm = river.minDistanceKm ?? 999;
          const isImmediateCatchment = distKm <= 1.8;

          // Localized flood evaluation: only immediately adjacent reaches surge
          const siteSurging = (nearSite?.river_stage_state === "OVERBANK_FLOODING" || nearSite?.river_stage_state === "CATASTROPHIC_SURGE") && isImmediateCatchment;
          const siteWarning = nearSite?.river_stage_state === "BANKFULL_WARNING" && isImmediateCatchment;

          // Localized flood surge coloring: river reaches in flood surge turn red, bankfull warning turns orange, nominal stays blue
          const riverColor = siteSurging ? "#dc2626" : siteWarning ? "#ea580c" : "#0284c7";
          const riverWeight = siteSurging ? 5.2 : siteWarning ? 3.8 : 2.4;
          const riverOpacity = siteSurging ? 1.0 : siteWarning ? 0.92 : 0.82;
          const riverDash = siteSurging ? "8 4" : undefined;

          return (
            <Polyline
              key={river.id}
              positions={river.points}
              pathOptions={{
                color: riverColor,
                weight: riverWeight,
                opacity: riverOpacity,
                dashArray: riverDash,
              }}
            >
              <Popup>
                <div style={{ fontSize: 13, lineHeight: 1.45 }}>
                  <strong>🌊 {river.name}</strong><br />
                  <span style={{ color: siteSurging ? "#dc2626" : siteWarning ? "#ea580c" : "#0284c7", fontWeight: 700 }}>
                    {siteSurging ? "🚨 LOCALIZED FLASH FLOOD SURGE" : siteWarning ? "⚠️ HIGH CHANNEL STAGE WARNING" : "🟢 NOMINAL BASEFLOW DISCHARGE"}
                  </span>
                  <div style={{ marginTop: 4, fontSize: 11.5, color: "#475569" }}>
                    Q_peak: <strong>{siteSurging ? (nearSite?.peak_discharge_m3s || 48) : 18} m³/s</strong> · Inundation Depth: <strong>+{siteSurging ? (nearSite?.inundation_depth_m || 1.2) : 0.2}m</strong>
                  </div>
                  <div style={{ fontSize: 10.5, color: "#64748b", marginTop: 3 }}>
                    {isImmediateCatchment ? `Direct Reach (${distKm}km from ${nearSite?.name || "Station"})` : `Tributary Basin (${distKm}km from ${nearSite?.name || "Station"})`}
                  </div>
                </div>
              </Popup>
            </Polyline>
          );
        })}

        {/* ═══ HIGHWAY CORRIDORS (NH-10 & SH-1/2) ═══ */}
        {showInfrastructure &&
          ROAD_CORRIDORS.map((road) => {
            const nearSite = sites[road.nearLocationId];
            const isBlocked = nearSite?.roadBlocked || (nearSite?.factor_of_safety != null && nearSite.factor_of_safety < 1.0);
            const isMarginal = nearSite?.stability_state === "MARGINAL";

            const roadColor = isBlocked ? "#dc2626" : isMarginal ? "#ea580c" : "#475569";
            const roadWeight = isBlocked ? 6 : isMarginal ? 4 : 3;

            return (
              <Polyline
                key={road.id}
                positions={road.points}
                pathOptions={{
                  color: roadColor,
                  weight: roadWeight,
                  dashArray: isBlocked ? "8 6" : undefined,
                  opacity: 0.85,
                }}
              >
                <Popup>
                  <div style={{ fontSize: 13 }}>
                    <strong>🛣️ {road.name}</strong><br />
                    <span style={{ color: isBlocked ? "#dc2626" : "#475569", fontWeight: 700 }}>
                      {isBlocked ? "🚨 CORRIDOR SEVERED / DEBRIS FLOW" : "🟢 OPEN CORRIDOR"}
                    </span>
                  </div>
                </Popup>
              </Polyline>
            );
          })}

        {/* ═══ SIKKIM SETTLEMENT TOWNS & VILLAGES ═══ */}
        {showInfrastructure &&
          SIKKIM_SETTLEMENTS.map((town) => (
            <CircleMarker
              key={town.id}
              center={[town.latitude, town.longitude]}
              radius={6}
              pathOptions={{
                color: "#92400e",
                fillColor: "#fbbf24",
                fillOpacity: 0.95,
                weight: 2,
              }}
            >
              <Tooltip direction="top" offset={[0, -5]} opacity={0.9}>
                <span>🏘️ <strong>{town.name}</strong> ({town.population.toLocaleString()} pop)</span>
              </Tooltip>
            </CircleMarker>
          ))}

        {/* ═══ CUSTOM SITES REAL OSM RIVER DRAINAGE & DOWNSTREAM PATHWAY ═══ */}
        {customSites.map((cs) => {
          const isSel = selectedSite === cs.id;
          if (!cs.connections || !cs.connections.isConnectedToRiver) return null;
          const { feederVector, downstreamRiverPath, closestPoint } = cs.connections;

          return (
            <Fragment key={`conn-${cs.id}`}>
              {/* 1. Hillside Drainage Feeder: Short runoff line from custom point to riverbank */}
              {feederVector && (
                <Polyline
                  positions={feederVector}
                  pathOptions={{
                    color: "#0284c7",
                    weight: isSel ? 3.5 : 2.5,
                    dashArray: "4 4",
                    opacity: 0.95,
                  }}
                >
                  <Tooltip direction="center" opacity={0.95}>
                    <span>⛰️ Hillside Runoff: {cs.nearestRiver?.distanceM}m into {cs.nearestRiver?.name}</span>
                  </Tooltip>
                </Polyline>
              )}

              {/* 2. Confluence Node on Riverbank */}
              {closestPoint && (
                <CircleMarker
                  center={closestPoint}
                  radius={isSel ? 6 : 4}
                  pathOptions={{
                    color: "#0284c7",
                    fillColor: "#38bdf8",
                    fillOpacity: 1,
                    weight: 2,
                  }}
                >
                  <Tooltip direction="top" opacity={0.95}>
                    <span>🌊 <strong>{cs.nearestRiver?.name}</strong> (Drainage Inflow Point)</span>
                  </Tooltip>
                </CircleMarker>
              )}

              {/* 3. Downstream River Corridor Following Real OSM River Geometry to Other Regions */}
              {downstreamRiverPath && downstreamRiverPath.length > 1 && (
                <Polyline
                  positions={downstreamRiverPath}
                  pathOptions={{
                    color: isSel ? "#06b6d4" : "#0284c7",
                    weight: isSel ? 6 : 4,
                    opacity: 0.88,
                    dashArray: isSel ? "10 6" : undefined,
                  }}
                >
                  <Tooltip direction="top" opacity={0.95}>
                    <span>
                      🌊 <strong>Connected River Pathway:</strong> {cs.nearestRiver?.name} → flows downstream through{" "}
                      {cs.downstreamVillages && cs.downstreamVillages.length > 0
                        ? cs.downstreamVillages.slice(0, 4).join(" → ")
                        : "Sikkim Valley Basin"}
                    </span>
                  </Tooltip>
                  <Popup>
                    <div style={{ fontSize: 13, lineHeight: 1.45 }}>
                      <strong>🌊 Connected River Drainage Pathway</strong><br />
                      <span style={{ color: "#0284c7", fontWeight: 700 }}>
                        River: {cs.nearestRiver?.name}
                      </span>
                      <div style={{ marginTop: 4, fontSize: 12, color: "#334155" }}>
                        Traced from actual OpenStreetMap river geometry.<br />
                        Water &amp; runoff from this custom point flows through:
                        <div style={{ marginTop: 4, fontWeight: 700, color: "#0f172a" }}>
                          {cs.downstreamVillages && cs.downstreamVillages.length > 0
                            ? cs.downstreamVillages.join(" ➔ ")
                            : "Downstream Teesta Valley"}
                        </div>
                      </div>
                    </div>
                  </Popup>
                </Polyline>
              )}
            </Fragment>
          );
        })}

        {/* ═══ CUSTOM SITE PINS WITH PULSING TARGET ICON ═══ */}
        {customSites.map((cs) => {
          const isSel = selectedSite === cs.id;
          const color = getSiteDisplayColor(cs);
          return (
            <CircleMarker
              key={cs.id}
              center={[cs.latitude, cs.longitude]}
              radius={isSel ? 16 : 12}
              pathOptions={{
                color: "#ffffff",
                fillColor: color,
                fillOpacity: 0.95,
                weight: 4,
              }}
              eventHandlers={{ click: () => onSelectSite && onSelectSite(cs.id) }}
            >
              <Tooltip direction="top" offset={[0, -10]} opacity={0.95} permanent={isSel}>
                <span>📍 <strong>{cs.name}</strong></span>
              </Tooltip>
              <Popup>
                <div style={{ fontSize: 13, lineHeight: 1.45, minWidth: 260 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <strong style={{ fontSize: 14 }}>📍 {cs.name}</strong>
                    <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 6px", borderRadius: 4, background: color + "22", color: color }}>
                      {cs.hazard_typology === "COMPOUND" ? "🔮 Compound Gorge" : cs.hazard_typology === "FLOOD_ONLY" ? "🌊 Flood Basin" : "🏔️ Mountain Ridge"}
                    </span>
                  </div>
                  <div style={{ color: "#64748b", fontSize: 11.5, marginTop: 2 }}>
                    Elev: {cs.elevation_m}m · Slope: {cs.slope_deg}° · FoS: <strong>{cs.factor_of_safety}</strong>
                  </div>
                  <div style={{ marginTop: 8, paddingTop: 6, borderTop: "1px solid #e2e8f0", fontSize: 11.5, display: "flex", flexDirection: "column", gap: 3 }}>
                    {cs.isConnectedToRiver ? (
                      <>
                        <div>🌊 <strong>Adjacent River Channel:</strong> {cs.nearestRiver?.name} ({cs.nearestRiver?.distanceM}m)</div>
                        {cs.downstreamVillages && cs.downstreamVillages.length > 0 && (
                          <div>⬇️ <strong>Downstream River Path:</strong> {cs.downstreamVillages.slice(0, 4).join(" ➔ ")}</div>
                        )}
                      </>
                    ) : (
                      <div>🏔️ <strong>Nearest River Channel:</strong> {cs.nearestRiver?.name || "Teesta River System"} ({cs.nearestRiver?.distanceKm} km away - Isolated ridge)</div>
                    )}
                    <div>🏘️ <strong>Nearest Settlement:</strong> {cs.nearestVillage?.name} ({cs.nearestVillage?.distanceKm} km)</div>
                  </div>
                </div>
              </Popup>
            </CircleMarker>
          );
        })}

        {/* ═══ SIMULATED MONITORING REGIONS (PILOT STATIONS) ═══ */}
        {entries.map(([locationId, data]) => {
          const params = data?.current_params || data;
          const lat = Number(params?.latitude ?? params?.lat);
          const lng = Number(params?.longitude ?? params?.lon ?? params?.lng);
          if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

          const color = getSiteDisplayColor(data);
          const isSelected = selectedSite === locationId;

          const rain1h = data?.rainfall_1h_mm ?? params?.rainfall_1h_mm ?? 0;
          const rain24h = data?.rainfall_24h_mm ?? params?.rainfall_24h_mm ?? 0;
          const isRaining = rain1h >= 5.0 || rain24h >= 40.0;
          const isHeavyStorm = rain1h >= 16.0 || rain24h >= 100.0;

          const isOverbank = data?.river_stage_state === "OVERBANK_FLOODING" || data?.river_stage_state === "CATASTROPHIC_SURGE";

          return (
            <Fragment key={locationId}>
              {/* Flood Inundation Buffer Circle during River Surges */}
              {isOverbank && (
                <CircleMarker
                  center={[lat, lng]}
                  radius={28}
                  pathOptions={{
                    color: "#0284c7",
                    fillColor: "#0284c7",
                    fillOpacity: 0.22,
                    weight: 2,
                    dashArray: "4 4",
                  }}
                />
              )}

              {/* Station Marker */}
              <CircleMarker
                center={[lat, lng]}
                radius={isSelected ? 14 : 10}
                pathOptions={{
                  color: "#FFFFFF",
                  fillColor: color,
                  fillOpacity: 0.95,
                  weight: 3,
                }}
                eventHandlers={{ click: () => onSelectSite && onSelectSite(locationId) }}
              >
                <Popup>
                  <div style={{ fontSize: 13, lineHeight: 1.45, minWidth: 260 }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6, marginBottom: 2 }}>
                      <strong style={{ fontSize: 14 }}>📍 {params.name || locationId}</strong>
                      <span style={{
                        fontSize: 10,
                        fontWeight: 700,
                        padding: "1px 6px",
                        borderRadius: 3,
                        background: color + "1a",
                        color: color,
                        border: `1px solid ${color}44`,
                      }}>
                        {data.typology_label || data.hazard_typology}
                      </span>
                    </div>
                    <span style={{ color: "#64748b", fontSize: 11.5 }}>
                      Elevation {params.elevation_m}m · Slope {params.slope_deg || 38}°
                    </span><br />
                    {data.geomorphic_setting && (
                      <div style={{ fontSize: 11, color: "#475569", marginTop: 3, marginBottom: 4, fontStyle: "italic", background: "#f8fafc", padding: "4px 6px", borderRadius: 4, border: "1px solid #e2e8f0" }}>
                        🌍 {data.geomorphic_setting}
                      </div>
                    )}

                    {/* Dual Hazard Readout */}
                    <div style={{ marginTop: 6, padding: "8px", background: "#f8fafc", borderRadius: 6, border: "1px solid #e2e8f0" }}>
                      {data.hazard_typology === "FLOOD_ONLY" ? (
                        <div style={{ fontSize: 11.5, color: "#166534", marginBottom: 4, fontWeight: 600 }}>
                          🏔️ Landslide: 🟢 Stable Plain (Slope {data.slope_deg}° · FoS {data.factor_of_safety || 3.6})
                        </div>
                      ) : (
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                          <span>🏔️ Landslide: <strong>{data.probability_percent || 15}% (FoS {data.factor_of_safety || 1.45})</strong></span>
                          <span style={{ color: data.stability_state === "UNSTABLE" ? "#dc2626" : "#16a34a", fontWeight: 700 }}>
                            {data.stability_state || "STABLE"}
                          </span>
                        </div>
                      )}

                      {data.hazard_typology === "LANDSLIDE_ONLY" ? (
                        <div style={{ fontSize: 11.5, color: "#0369a1", marginBottom: 4, fontWeight: 600 }}>
                          🌊 River Flood: 🟢 No River Nearby (Alpine Ridge)
                        </div>
                      ) : (
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                          <span>🌊 Flood Surge: <strong>{data.flood_probability_percent || 10}%</strong></span>
                          <span style={{ color: isOverbank ? "#dc2626" : "#0284c7", fontWeight: 700 }}>
                            {data.river_stage_state || "NORMAL"}
                          </span>
                        </div>
                      )}

                      {data.hazard_typology !== "LANDSLIDE_ONLY" && (
                        <div style={{ fontSize: 11.5, color: "#475569", borderTop: "1px solid #e2e8f0", paddingTop: 4, marginTop: 4 }}>
                          Peak Q: <strong>{data.peak_discharge_m3s || 14} m³/s</strong> · Inundation: <strong>+{data.inundation_depth_m || 0.2}m</strong>
                          {data.compound_active && (
                            <div style={{ color: "#7c3aed", fontWeight: 700, marginTop: 2 }}>
                              ⚡ Active Cascade: {data.compound_pathway}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </Popup>
              </CircleMarker>

              {/* Rain Cloud Animation */}
              {isRaining && (
                <Marker
                  position={[lat, lng]}
                  icon={createWeatherCloudIcon(rain1h, rain24h, isHeavyStorm)}
                  interactive={false}
                />
              )}
            </Fragment>
          );
        })}

        {/* Population & Observers */}
        {showPeople &&
          MOCK_POPULATION.map((person) => {
            const status = getCitizenStatus(person);
            return (
              <Marker
                key={person.id}
                position={[person.lat, person.lon]}
                icon={createHumanIcon(status)}
              >
                <Popup>
                  <div style={{ fontSize: 13, lineHeight: 1.45, minWidth: 220 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                      <strong style={{ fontSize: 13.5 }}>👤 {person.name}</strong>
                      <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 6px", borderRadius: 4, color: "#fff", background: status.color }}>
                        {status.badge}
                      </span>
                    </div>
                    <div style={{ color: "#64748b", fontSize: 11.5, marginBottom: 4 }}>
                      {person.role} · 📍 {person.town}
                    </div>
                    <div style={{ padding: "6px 8px", borderRadius: 6, background: status.isDanger ? "#fef2f2" : "#f8fafc", border: `1px solid ${status.isDanger ? "#fca5a5" : "#e2e8f0"}`, fontSize: 11.5, color: status.isDanger ? "#991b1b" : "#334155" }}>
                      💬 {status.alertText}
                    </div>
                  </div>
                </Popup>
              </Marker>
            );
          })}
      </MapContainer>
    </div>
  );
}
