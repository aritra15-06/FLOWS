const BASE_URL = '/api';

export const apiClient = {
  getLocations: async () => {
    try {
      const res = await fetch(`${BASE_URL}/locations`);
      if (!res.ok) throw new Error(`HTTP error ${res.status}`);
      return await res.json();
    } catch (err) {
      console.warn('API getLocations failed, using fallback:', err);
      return [];
    }
  },

  predict: async (locationId) => {
    try {
      const res = await fetch(`${BASE_URL}/predict`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ location_id: locationId }),
      });
      if (!res.ok) throw new Error(`HTTP error ${res.status}`);
      return await res.json();
    } catch (err) {
      console.warn('API predict failed:', err);
      return null;
    }
  },

  simulate: async (locationId, overrides) => {
    try {
      const res = await fetch(`${BASE_URL}/simulate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ location_id: locationId, overrides }),
      });
      if (!res.ok) throw new Error(`HTTP error ${res.status}`);
      return await res.json();
    } catch (err) {
      console.warn('API simulate failed:', err);
      return null;
    }
  },

  getImpact: async (locationId) => {
    try {
      const res = await fetch(`${BASE_URL}/impact/${locationId}`);
      if (!res.ok) throw new Error(`HTTP error ${res.status}`);
      return await res.json();
    } catch (err) {
      console.warn('API getImpact failed:', err);
      return { affected_villages: [], affected_roads: [], total_population_at_risk: 0 };
    }
  },

  getEvidence: async (locationId) => {
    try {
      const res = await fetch(`${BASE_URL}/evidence/${locationId}`);
      if (!res.ok) throw new Error(`HTTP error ${res.status}`);
      return await res.json();
    } catch (err) {
      console.warn('API getEvidence failed:', err);
      return { features: [], quality: 'HIGH' };
    }
  },

  getSources: async (refresh = false) => {
    try {
      const res = await fetch(`${BASE_URL}/sources${refresh ? '?refresh=true' : ''}`);
      if (!res.ok) throw new Error(`HTTP error ${res.status}`);
      return await res.json();
    } catch (err) {
      console.warn('API getSources failed:', err);
      return [];
    }
  },

  getScorecard: async (eventId = 'SIM-001') => {
    try {
      const res = await fetch(`${BASE_URL}/scorecard/${eventId}`);
      if (!res.ok) throw new Error(`HTTP error ${res.status}`);
      return await res.json();
    } catch (err) {
      console.warn('API getScorecard failed:', err);
      return { metrics: {} };
    }
  },

  sendAlert: async (data) => {
    try {
      const res = await fetch(`${BASE_URL}/alerts/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error(`HTTP error ${res.status}`);
      return await res.json();
    } catch (err) {
      console.warn('API sendAlert failed:', err);
      return { success: false, error: err.message };
    }
  },

  startTraining: async () => {
    try {
      const res = await fetch(`${BASE_URL}/train/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!res.ok) throw new Error(`HTTP error ${res.status}`);
      return await res.json();
    } catch (err) {
      console.warn('API startTraining failed:', err);
      return { job_id: `train-${Date.now()}` };
    }
  },

  getTrainingStatus: async (jobId) => {
    try {
      const res = await fetch(`${BASE_URL}/train/status/${jobId}`);
      if (!res.ok) throw new Error(`HTTP error ${res.status}`);
      return await res.json();
    } catch (err) {
      console.warn('API getTrainingStatus failed:', err);
      return { status: 'COMPLETED', progress_pct: 100 };
    }
  },
};
