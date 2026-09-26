import React from 'react';
import { AppProvider, useAppContext } from './state/AppContext';
import { SimulationProvider } from './state/SimulationContext';
import TopBar from './components/TopBar';
import MapView from './components/MapView';
import SiteList from './components/SiteList';
import SitePanel from './components/SitePanel';
import Terrain3DView from './components/Terrain3DView';
import SimulationWorkspace from './components/SimulationWorkspace';
import SourceHealthGrid from './components/SourceHealthGrid';
import AlertPanel from './components/AlertPanel';
import ScorecardPanel from './components/ScorecardPanel';
import TrainingPanel from './components/TrainingPanel';
import ErrorBoundary from './components/ErrorBoundary';
import { useSimulationContext } from './state/SimulationContext';
import './styles.css';

const AppContent = () => {
  const { activeTab, show3D, setShow3D } = useAppContext();
  const { lastPrediction } = useSimulationContext();

  return (
    <div className="app-container">
      <ErrorBoundary fallbackMessage="Failed to load navigation bar.">
        <TopBar />
      </ErrorBoundary>
      <div className="main-content">
        {activeTab === 'Dashboard' && (
          <div className="dashboard-grid">
            <ErrorBoundary fallbackMessage="Failed to load monitoring sites list.">
              <SiteList />
            </ErrorBoundary>
            <div className="center-panel">
              {/* 3D/2D toggle */}
              <div className="view-toggle">
                <button className={`view-btn ${!show3D ? 'active' : ''}`} onClick={() => setShow3D(false)}>🗺 2D Map</button>
                <button className={`view-btn ${show3D ? 'active' : ''}`} onClick={() => setShow3D(true)}>🌐 3D Terrain</button>
              </div>
              <div className="map-or-3d">
                <ErrorBoundary fallbackMessage="Map view rendering encountered an issue.">
                  {show3D
                    ? <Terrain3DView predictions={lastPrediction} />
                    : <MapView />
                  }
                </ErrorBoundary>
              </div>
            </div>
            <ErrorBoundary fallbackMessage="Site details panel encountered an issue.">
              <SitePanel />
            </ErrorBoundary>
          </div>
        )}
        {activeTab === 'Simulation' && (
          <ErrorBoundary fallbackMessage="Simulation workspace encountered an issue.">
            <SimulationWorkspace />
          </ErrorBoundary>
        )}
        {activeTab === 'Sources' && (
          <ErrorBoundary fallbackMessage="Data source health monitor encountered an issue.">
            <SourceHealthGrid />
          </ErrorBoundary>
        )}
        {activeTab === 'Alerts' && (
          <ErrorBoundary fallbackMessage="Alert dispatch console encountered an issue.">
            <AlertPanel />
          </ErrorBoundary>
        )}
        {activeTab === 'Training' && (
          <ErrorBoundary fallbackMessage="Model training console encountered an issue.">
            <TrainingPanel />
          </ErrorBoundary>
        )}
        {activeTab === 'Scorecard' && (
          <ErrorBoundary fallbackMessage="Scorecard verification panel encountered an issue.">
            <ScorecardPanel />
          </ErrorBoundary>
        )}
      </div>
    </div>
  );
};

export default function App() {
  return (
    <ErrorBoundary fallbackMessage="The application encountered an initialization issue.">
      <AppProvider>
        <SimulationProvider>
          <AppContent />
        </SimulationProvider>
      </AppProvider>
    </ErrorBoundary>
  );
}
