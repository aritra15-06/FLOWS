import React, { createContext, useContext, useState, useEffect } from 'react';
import { apiClient } from '../api/client';
import { pilotLocations } from '../data/pilotLocations';

const AppContext = createContext();

export const AppProvider = ({ children }) => {
  const [selectedLocation, setSelectedLocation] = useState(pilotLocations[0]);
  const [locations, setLocations] = useState(pilotLocations);
  const [activeTab, setActiveTab] = useState('Dashboard');
  const [operatingMode, setOperatingMode] = useState('NOMINAL');
  const [sourceHealth, setSourceHealth] = useState([]);
  const [show3D, setShow3D] = useState(false);

  // Load locations from API on mount
  useEffect(() => {
    apiClient.getLocations().then(data => {
      if (Array.isArray(data) && data.length > 0) {
        const merged = data.map(l => {
          const lat = Number(l.lat ?? l.latitude ?? 27.5);
          const lng = Number(l.lng ?? l.lon ?? l.longitude ?? 88.6);
          return {
            ...l,
            id: l.location_id || l.id,
            location_id: l.location_id || l.id,
            lat: isNaN(lat) ? 27.5 : lat,
            lng: isNaN(lng) ? 88.6 : lng,
            lon: isNaN(lng) ? 88.6 : lng,
          };
        });
        setLocations(merged);
        setSelectedLocation(merged[0]);
      }
    }).catch(err => {
      console.warn('Failed to load locations from API, keeping default pilot locations:', err);
    });
  }, []);

  // Check system health
  useEffect(() => {
    const check = () => {
      fetch('/api/health')
        .then(r => r.json())
        .then(d => {
          setOperatingMode(d?.operating_mode || 'NOMINAL');
        })
        .catch(() => setOperatingMode('DEGRADED'));
    };
    check();
    const interval = setInterval(check, 30000);
    return () => clearInterval(interval);
  }, []);

  return (
    <AppContext.Provider value={{
      selectedLocation, setSelectedLocation,
      locations, setLocations,
      activeTab, setActiveTab,
      operatingMode, setOperatingMode,
      sourceHealth, setSourceHealth,
      show3D, setShow3D,
    }}>
      {children}
    </AppContext.Provider>
  );
};

export const useAppContext = () => useContext(AppContext);
