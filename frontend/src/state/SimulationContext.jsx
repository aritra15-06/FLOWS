import React, { createContext, useContext, useState, useEffect } from 'react';
import { apiClient } from '../api/client';
import { pilotLocations } from '../data/pilotLocations';

const SimulationContext = createContext();

export const SimulationProvider = ({ children }) => {
  const [overrides, setOverrides] = useState({});
  const [lastPrediction, setLastPrediction] = useState({});
  const [simulationDay, setSimulationDay] = useState(1);

  // Pre-load predictions for all pilot locations on mount so Dashboard & SiteList
  // immediately show live simulated hazard probabilities rather than 0%
  useEffect(() => {
    let isMounted = true;
    async function preloadAll() {
      try {
        const locs = await apiClient.getLocations();
        const targets = (locs && locs.length > 0) ? locs : pilotLocations;
        const preds = {};
        await Promise.all(
          targets.map(async (loc) => {
            const sid = loc.location_id || loc.id;
            try {
              const res = await apiClient.simulate(sid, {});
              if (res) preds[sid] = res;
            } catch (err) {
              console.warn(`Failed to preload simulation for ${sid}:`, err);
            }
          })
        );
        if (isMounted && Object.keys(preds).length > 0) {
          setLastPrediction(prev => ({ ...preds, ...prev }));
        }
      } catch (err) {
        console.warn('Preload locations error:', err);
      }
    }
    preloadAll();
    return () => { isMounted = false; };
  }, []);

  return (
    <SimulationContext.Provider value={{
      overrides, setOverrides,
      lastPrediction, setLastPrediction,
      simulationDay, setSimulationDay
    }}>
      {children}
    </SimulationContext.Provider>
  );
};

export const useSimulationContext = () => useContext(SimulationContext);
