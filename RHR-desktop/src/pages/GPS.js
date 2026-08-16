import React, { useCallback, useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { MapPin, Circle, Route, ShieldCheck, LocateFixed } from 'lucide-react';
import api from '../services/api';
import AdminLocationService from '../services/adminLocationService';
import PageHeader from '../components/PageHeader';
import EmptyState from '../components/EmptyState';
import { useToast } from '../components/Toast';

const REFRESH_MS = 10000;
const KARACHI = [24.8608, 67.0104];

const STATUS_COLORS = {
  moving: '#2E75B6',
  idle: '#E8841A',
  at_customer: '#1A7A4A'
};

function timeAgo(iso) {
  if (!iso) return '—';
  const diffSec = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diffSec < 60) return `${diffSec}s ago`;
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  return `${Math.floor(diffSec / 3600)}h ago`;
}

const todayStr = () => new Date().toISOString().split('T')[0];

export default function GPS() {
  const toast = useToast();
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef({});
  const adminMarkersRef = useRef({});
  const routeLayerRef = useRef(null);

  const [view, setView] = useState('live'); // 'live' | 'route' | 'admin'
  const [salesmen, setSalesmen] = useState([]);
  const [adminLocations, setAdminLocations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [selectedUser, setSelectedUser] = useState('');
  const [routeDate, setRouteDate] = useState(todayStr());
  const [routeStats, setRouteStats] = useState(null);
  const [routeLoading, setRouteLoading] = useState(false);
  const [pinging, setPinging] = useState(false);

  // ── Init map once ──
  useEffect(() => {
    mapRef.current = L.map(mapContainerRef.current).setView(KARACHI, 12);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 19
    }).addTo(mapRef.current);

    return () => {
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  const clearRouteLayer = useCallback(() => {
    if (routeLayerRef.current) {
      routeLayerRef.current.forEach((layer) => layer.remove());
      routeLayerRef.current = null;
    }
  }, []);

  const clearMarkers = useCallback(() => {
    Object.values(markersRef.current).forEach((m) => m.remove());
    markersRef.current = {};
  }, []);

  const clearAdminMarkers = useCallback(() => {
    Object.values(adminMarkersRef.current).forEach((m) => m.remove());
    adminMarkersRef.current = {};
  }, []);

  const updateLiveMarkers = useCallback((data) => {
    setSalesmen(data);
    if (!mapRef.current) return;
    data.forEach((s) => {
      if (!s.location) return;
      const pos = [s.location.latitude, s.location.longitude];
      const color = STATUS_COLORS[s.location.status] || '#888888';
      const popupHtml = `<div style="font-size:12px"><strong>${s.full_name}</strong><br/>Status: ${s.location.status}<br/>Last seen: ${new Date(
        s.location.recorded_at
      ).toLocaleTimeString()}</div>`;

      if (markersRef.current[s.id]) {
        markersRef.current[s.id].setLatLng(pos);
        markersRef.current[s.id].setStyle({ fillColor: color });
        markersRef.current[s.id].setPopupContent(popupHtml);
      } else {
        markersRef.current[s.id] = L.circleMarker(pos, {
          radius: 9,
          fillColor: color,
          fillOpacity: 1,
          color: '#FFFFFF',
          weight: 2
        })
          .addTo(mapRef.current)
          .bindPopup(popupHtml);
      }
    });
  }, []);

  const loadLive = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      setError('');
      try {
        const res = await api.get('/gps/live');
        updateLiveMarkers(res.data.data || []);
      } catch (err) {
        if (!silent) setError(err.response?.data?.message || 'Failed to load live locations.');
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [updateLiveMarkers]
  );

  useEffect(() => {
    if (view !== 'live') return;
    clearRouteLayer();
    clearAdminMarkers();
    loadLive();
    const interval = setInterval(() => loadLive(true), REFRESH_MS);
    return () => clearInterval(interval);
  }, [view, loadLive, clearRouteLayer, clearAdminMarkers]);

  const updateAdminMarkers = useCallback((data) => {
    setAdminLocations(data);
    if (!mapRef.current) return;
    data.forEach((a) => {
      if (!a.location) return;
      const pos = [a.location.latitude, a.location.longitude];
      const popupHtml = `<div style="font-size:12px"><strong>${a.full_name}</strong><br/>Admin<br/>Last seen: ${new Date(
        a.location.recorded_at
      ).toLocaleTimeString()}</div>`;

      if (adminMarkersRef.current[a.id]) {
        adminMarkersRef.current[a.id].setLatLng(pos);
        adminMarkersRef.current[a.id].setPopupContent(popupHtml);
      } else {
        adminMarkersRef.current[a.id] = L.circleMarker(pos, {
          radius: 10,
          fillColor: '#8E44AD',
          fillOpacity: 1,
          color: '#FFFFFF',
          weight: 2
        })
          .addTo(mapRef.current)
          .bindPopup(popupHtml);
      }
    });
  }, []);

  const loadAdminLive = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      setError('');
      try {
        const res = await api.get('/admin-location/live');
        updateAdminMarkers(res.data.data || []);
      } catch (err) {
        if (!silent) setError(err.response?.data?.message || 'Failed to load admin locations.');
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [updateAdminMarkers]
  );

  useEffect(() => {
    if (view !== 'admin') return;
    clearRouteLayer();
    clearMarkers();
    loadAdminLive();
    const interval = setInterval(() => loadAdminLive(true), REFRESH_MS);
    return () => clearInterval(interval);
  }, [view, loadAdminLive, clearRouteLayer, clearMarkers]);

  const loadRoute = async () => {
    if (!selectedUser || !mapRef.current) return;
    setRouteLoading(true);
    clearRouteLayer();
    clearMarkers();
    try {
      const res = await api.get(`/gps/route/${selectedUser}`, { params: { date: routeDate } });
      const { route, totalPoints, totalKM } = res.data.data;
      const points = (route || []).map((p) => ({
        lat: Number(p.latitude),
        lng: Number(p.longitude),
        status: p.status,
        recorded_at: p.recorded_at
      }));

      if (points.length === 0) {
        toast.error('No GPS pings recorded for this salesman on this date.');
        setRouteStats(null);
        return;
      }

      const path = points.map((p) => [p.lat, p.lng]);
      const polyline = L.polyline(path, { color: '#2E75B6', weight: 3, opacity: 0.8 }).addTo(mapRef.current);
      const startMarker = L.circleMarker(path[0], {
        radius: 8,
        fillColor: '#1A7A4A',
        fillOpacity: 1,
        color: '#fff',
        weight: 2
      })
        .addTo(mapRef.current)
        .bindPopup('Start');
      const endMarker = L.circleMarker(path[path.length - 1], {
        radius: 8,
        fillColor: '#C0392B',
        fillOpacity: 1,
        color: '#fff',
        weight: 2
      })
        .addTo(mapRef.current)
        .bindPopup('End (most recent)');

      routeLayerRef.current = [polyline, startMarker, endMarker];
      mapRef.current.fitBounds(polyline.getBounds(), { padding: [40, 40] });

      setRouteStats({ totalPoints, totalKM });
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to load route.');
    } finally {
      setRouteLoading(false);
    }
  };

  const handlePingNow = async () => {
    setPinging(true);
    try {
      await AdminLocationService.pingNow();
      toast.success('Location updated.');
      if (view === 'admin') loadAdminLive(true);
    } catch (err) {
      toast.error(err.response?.data?.message || err.message || 'Failed to update location.');
    } finally {
      setPinging(false);
    }
  };

  const switchView = (v) => {
    setView(v);
    if (v === 'live') {
      clearRouteLayer();
      clearAdminMarkers();
      setRouteStats(null);
    } else if (v === 'route') {
      clearMarkers();
      clearAdminMarkers();
    } else {
      clearMarkers();
      clearRouteLayer();
      setRouteStats(null);
    }
  };

  return (
    <div className="p-6 flex flex-col h-full">
      <PageHeader title="Live GPS" subtitle="Track salesman and admin locations, and replay any day's route" />

      <div className="flex gap-2 mb-4">
        <button
          onClick={() => switchView('live')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
            view === 'live' ? 'bg-navy text-white' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
          }`}
        >
          <Circle size={10} className={view === 'live' ? 'fill-white text-white' : 'fill-red-500 text-red-500'} />
          Live — refreshes every 10s
        </button>
        <button
          onClick={() => switchView('route')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
            view === 'route' ? 'bg-navy text-white' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
          }`}
        >
          <Route size={14} /> Route Playback
        </button>
        <button
          onClick={() => switchView('admin')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
            view === 'admin' ? 'bg-navy text-white' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
          }`}
        >
          <ShieldCheck size={14} /> Admin
        </button>
      </div>

      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">{error}</div>
      )}

      <div className="flex gap-4 flex-1 min-h-[500px]">
        {/* Sidebar */}
        <div className="w-72 flex-shrink-0 flex flex-col gap-3 overflow-y-auto">
          {view === 'route' && (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 flex flex-col gap-3">
              <select
                value={selectedUser}
                onChange={(e) => setSelectedUser(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-navy focus:border-navy bg-white"
              >
                <option value="">— Select salesman —</option>
                {salesmen.map((s) => (
                  <option key={s.id} value={s.id}>{s.full_name}</option>
                ))}
              </select>
              <input
                type="date"
                value={routeDate}
                max={todayStr()}
                onChange={(e) => setRouteDate(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-navy focus:border-navy"
              />
              <button
                onClick={loadRoute}
                disabled={routeLoading || !selectedUser}
                className="bg-navy hover:bg-navy/90 disabled:opacity-50 text-white rounded-lg py-2 text-sm font-semibold transition-colors"
              >
                {routeLoading ? 'Loading...' : 'Show Route'}
              </button>
              {routeStats && (
                <div className="bg-gray-50 rounded-lg p-3 text-sm">
                  <div className="flex justify-between text-gray-600">
                    <span>Points</span>
                    <span className="font-semibold text-navy">{routeStats.totalPoints}</span>
                  </div>
                  <div className="flex justify-between text-gray-600 mt-1">
                    <span>Distance</span>
                    <span className="font-semibold text-orange">{routeStats.totalKM} KM</span>
                  </div>
                </div>
              )}
            </div>
          )}

          {view === 'admin' && (
            <button
              onClick={handlePingNow}
              disabled={pinging}
              className="flex items-center justify-center gap-2 bg-navy hover:bg-navy/90 disabled:opacity-50 text-white rounded-lg py-2.5 text-sm font-semibold transition-colors"
            >
              <LocateFixed size={15} /> {pinging ? 'Updating...' : 'Update My Location Now'}
            </button>
          )}

          {view === 'admin' ? (
            loading ? (
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 text-sm text-gray-400">
                Loading...
              </div>
            ) : adminLocations.length === 0 ? (
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100">
                <EmptyState icon={ShieldCheck} title="No admins found" subtitle="Admin accounts will appear here" />
              </div>
            ) : (
              adminLocations.map((a) => (
                <div key={a.id} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
                  <div className="flex items-start justify-between">
                    <p className="font-semibold text-sm text-navy">{a.full_name}</p>
                    {a.location && (
                      <span className="text-xs font-medium px-2 py-0.5 rounded-full text-white" style={{ backgroundColor: '#8E44AD' }}>
                        online
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-400 mt-1">
                    {a.location ? `Last seen ${timeAgo(a.location.recorded_at)}` : 'No location reported yet'}
                  </p>
                </div>
              ))
            )
          ) : loading && view === 'live' ? (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 text-sm text-gray-400">
              Loading...
            </div>
          ) : salesmen.length === 0 ? (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100">
              <EmptyState icon={MapPin} title="No field staff found" subtitle="Salesman accounts will appear here" />
            </div>
          ) : (
            salesmen.map((s) => (
              <div key={s.id} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
                <div className="flex items-start justify-between">
                  <p className="font-semibold text-sm text-navy">{s.full_name}</p>
                  {s.location && (
                    <span
                      className="text-xs font-medium px-2 py-0.5 rounded-full"
                      style={{
                        color: STATUS_COLORS[s.location.status] || '#888',
                        backgroundColor: `${STATUS_COLORS[s.location.status] || '#888'}1a`
                      }}
                    >
                      {s.location.status}
                    </span>
                  )}
                </div>
                <p className="text-xs text-gray-400 mt-1">
                  {s.location ? `Last seen ${timeAgo(s.location.recorded_at)}` : 'No location reported yet'}
                </p>
              </div>
            ))
          )}
        </div>

        {/* Map */}
        <div className="flex-1 rounded-2xl overflow-hidden border border-gray-200 shadow-sm">
          <div ref={mapContainerRef} className="w-full h-full min-h-[500px]" />
        </div>
      </div>
    </div>
  );
}
