import React, { createContext, useContext, useState } from 'react';

const SimulationContext = createContext();

export const SimulationProvider = ({ children }) => {
  const [overrides, setOverrides] = useState({});
  const [lastPrediction, setLastPrediction] = useState({});
  const [simulationDay, setSimulationDay] = useState(1);

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
