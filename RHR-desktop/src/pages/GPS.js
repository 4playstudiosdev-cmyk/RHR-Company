import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MapPin, Circle, Route, ShieldCheck, LocateFixed, WifiOff, Store, PauseCircle, Navigation } from 'lucide-react';
import api from '../services/api';
import AdminLocationService from '../services/adminLocationService';
import PageHeader from '../components/PageHeader';
import EmptyState from '../components/EmptyState';
import { useToast } from '../components/Toast';
import { loadGoogleMaps } from '../utils/googleMapsLoader';

const REFRESH_MS = 10000;
const KARACHI = { lat: 24.8608, lng: 67.0104 };

// Careem/Bykea-style minimal map — mutes default Google POI clutter
// (shops, restaurants, transit icons) so field-staff pins stay the
// visual focus instead of competing with a hundred tiny business icons.
const MAP_STYLE = [
  { featureType: 'poi', elementType: 'labels', stylers: [{ visibility: 'off' }] },
  { featureType: 'poi.business', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit', elementType: 'labels', stylers: [{ visibility: 'off' }] },
  { featureType: 'road', elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
];

// A ping older than this with nothing newer behind it counts as "offline"
// (signal lost) rather than just stale — matches the mobile app's own
// GPS ping interval, which is well under this.
const OFFLINE_AFTER_MS = 15 * 60 * 1000;

const STATUS_COLORS = {
  moving: '#059669',      // emerald — actively on the move
  idle: '#da3610',        // orange (theme accent) — stationary, needs a look
  at_customer: '#073c9f', // navy (theme primary) — informative, not alarming
  offline: '#9ca3af'      // gray — signal lost
};

const STATUS_META = {
  moving: { label: 'Moving', icon: Navigation },
  idle: { label: 'Idle', icon: PauseCircle },
  at_customer: { label: 'At Customer', icon: Store },
  offline: { label: 'Offline', icon: WifiOff }
};

// Branch color-coding for map markers — lets a super_admin viewing all
// cities at once tell branches apart at a glance. Role (salesman vs
// driver) is conveyed by marker shape instead (see buildMarkerIcon below),
// so both dimensions are visible without needing to open a popup.
const COMPANY_COLORS = {
  '1e5962c6-33a7-460b-913e-9e08db46973a': '#1B2E6B', // KHI blue
  '09a1fda3-7ac0-406a-8f42-75d973dc3b7e': '#C0392B', // HYD red
  '00f79d89-0d36-4704-8865-fc7bbd662267': '#1A7A4A', // SUK green
};

const getMarkerColor = (user) => COMPANY_COLORS[user.company_id] || '#888888';
const getMarkerLabel = (user) => (user.staffType === 'driver' ? '🚗' : '👤');

// Per-admin color-coding for the Admin view — branch color alone isn't
// enough there, since more than one admin can share a branch (Riaz
// Hussain the super_admin and KHI Admin are both Karachi) and their
// stale/overlapping pins would then be visually indistinguishable.
// Deterministic (hashed from the admin's own id) so the same admin
// always gets the same color across reloads, rather than a random one.
const ADMIN_COLOR_PALETTE = ['#1B2E6B', '#C0392B', '#1A7A4A', '#D97706', '#7C3AED', '#0891B2', '#BE185D', '#4D7C0F'];
function getAdminColor(admin) {
  let hash = 0;
  for (let i = 0; i < admin.id.length; i++) hash = (hash * 31 + admin.id.charCodeAt(i)) >>> 0;
  return ADMIN_COLOR_PALETTE[hash % ADMIN_COLOR_PALETTE.length];
}

// Drivers get a rotated-square (diamond) icon; salesmen/delivery keep the
// plain circle marker. Dimmed when offline so a stale pin still reads as
// stale even though color now encodes branch, not status.
function buildDriverIcon(maps, color, dimmed) {
  const opacity = dimmed ? 0.45 : 1;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><rect x="4" y="4" width="12" height="12" fill="${color}" fill-opacity="${opacity}" stroke="#FFFFFF" stroke-width="2" transform="rotate(45 10 10)"/></svg>`;
  return {
    url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
    scaledSize: new maps.Size(20, 20),
    anchor: new maps.Point(10, 10),
  };
}

function buildCircleIcon(maps, color, dimmed, radius = 9) {
  return {
    path: maps.SymbolPath.CIRCLE,
    scale: radius,
    fillColor: color,
    fillOpacity: dimmed ? 0.45 : 1,
    strokeColor: '#FFFFFF',
    strokeWeight: 2,
  };
}

function timeAgo(iso) {
  if (!iso) return '—';
  const diffSec = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diffSec < 60) return `${diffSec}s ago`;
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  return `${Math.floor(diffSec / 3600)}h ago`;
}

function getInitials(name) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  const initials = parts.length > 1 ? parts[0][0] + parts[1][0] : parts[0].slice(0, 2);
  return initials.toUpperCase();
}

// The backend only ever reports moving/idle/at_customer on a ping — it
// never writes "offline" itself. We infer that client-side from staleness
// (or a total absence of any location ever reported).
function effectiveStatus(s) {
  if (!s.location) return 'offline';
  const age = Date.now() - new Date(s.location.recorded_at).getTime();
  return age > OFFLINE_AFTER_MS ? 'offline' : s.location.status;
}

const todayStr = () => new Date().toISOString().split('T')[0];

export default function GPS({ user }) {
  const toast = useToast();
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const mapsRef = useRef(null); // the `google.maps` namespace, once loaded
  const markersRef = useRef({});
  const adminMarkersRef = useRef({});
  const routeLayerRef = useRef(null);

  const isSuperAdmin = user?.role === 'super_admin';

  const [view, setView] = useState('live'); // 'live' | 'route' | 'admin'
  const [salesmen, setSalesmen] = useState([]);
  const [adminLocations, setAdminLocations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [mapReady, setMapReady] = useState(false);
  const [branches, setBranches] = useState([]);
  const [cityFilter, setCityFilter] = useState(''); // '' = all cities (super_admin's "massive upper hand" default)

  const [selectedUser, setSelectedUser] = useState('');
  const [routeDate, setRouteDate] = useState(todayStr());
  const [routeStats, setRouteStats] = useState(null);
  const [routeLoading, setRouteLoading] = useState(false);
  const [pinging, setPinging] = useState(false);

  useEffect(() => {
    if (!isSuperAdmin) return;
    api.get('/companies').then((res) => setBranches(res.data.data || [])).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const visibleSalesmen = useMemo(
    () => (cityFilter ? salesmen.filter((s) => s.company?.city === cityFilter) : salesmen),
    [salesmen, cityFilter]
  );
  const visibleAdmins = useMemo(
    () => (cityFilter ? adminLocations.filter((a) => a.company?.city === cityFilter) : adminLocations),
    [adminLocations, cityFilter]
  );

  // ── Init map once ──
  useEffect(() => {
    let cancelled = false;
    loadGoogleMaps()
      .then((maps) => {
        if (cancelled || !mapContainerRef.current) return;
        mapsRef.current = maps;
        mapRef.current = new maps.Map(mapContainerRef.current, {
          center: KARACHI,
          zoom: 12,
          styles: MAP_STYLE,
          streetViewControl: false,
          mapTypeControl: false,
          fullscreenControl: false,
        });
        setMapReady(true);
      })
      .catch((err) => {
        console.error(err);
        setError('Failed to load Google Maps — check the API key / billing on the Google Cloud project.');
      });

    return () => {
      cancelled = true;
      mapRef.current = null;
    };
  }, []);

  const clearRouteLayer = useCallback(() => {
    if (routeLayerRef.current) {
      routeLayerRef.current.forEach((layer) => layer.setMap(null));
      routeLayerRef.current = null;
    }
  }, []);

  const clearMarkers = useCallback(() => {
    Object.values(markersRef.current).forEach((m) => m.setMap(null));
    markersRef.current = {};
  }, []);

  const clearAdminMarkers = useCallback(() => {
    Object.values(adminMarkersRef.current).forEach((m) => m.setMap(null));
    adminMarkersRef.current = {};
  }, []);

  const updateLiveMarkers = useCallback((data) => {
    setSalesmen(data);
  }, []);

  // Redraws from the city-filtered list whenever the fetched data or the
  // filter changes — clear+redraw each time rather than incremental
  // upsert/remove bookkeeping, which is simple and cheap enough at this
  // scale (staff counts are small, refresh is only every 10s anyway).
  useEffect(() => {
    if (view !== 'live' || !mapRef.current || !mapsRef.current) return;
    const maps = mapsRef.current;
    clearMarkers();
    visibleSalesmen.forEach((s) => {
      if (!s.location) return;
      const pos = { lat: s.location.latitude, lng: s.location.longitude };
      const status = effectiveStatus(s);
      const color = getMarkerColor(s);
      const dimmed = status === 'offline';
      const roleLabel = s.staffType === 'driver' ? `Driver${s.car_number ? ` — ${s.car_number}` : ''}` : s.staffType === 'delivery' ? 'Delivery' : 'Salesman';
      const branchLabel = s.company ? ` · ${s.company.city}` : '';
      const popupHtml = `<div style="font-size:12px"><strong>${getMarkerLabel(s)} ${s.full_name}</strong><br/>${roleLabel}${branchLabel}<br/>Status: ${STATUS_META[status]?.label || status}<br/>Last seen: ${new Date(
        s.location.recorded_at
      ).toLocaleTimeString()}</div>`;

      const marker = new maps.Marker({
        position: pos,
        map: mapRef.current,
        icon: s.staffType === 'driver' ? buildDriverIcon(maps, color, dimmed) : buildCircleIcon(maps, color, dimmed),
      });
      const infoWindow = new maps.InfoWindow({ content: popupHtml });
      marker.addListener('click', () => infoWindow.open({ map: mapRef.current, anchor: marker }));
      marker._infoWindow = infoWindow;
      markersRef.current[s.id] = marker;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleSalesmen, view, mapReady]);

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
  }, []);

  useEffect(() => {
    if (view !== 'admin' || !mapRef.current || !mapsRef.current) return;
    const maps = mapsRef.current;
    clearAdminMarkers();

    // Two problems admins hit when several accounts' pings land at
    // nearly the same spot (e.g. everyone testing from the same office):
    // 1) whichever draws last visually covers the others — sorting
    //    oldest-first so the most recently updated admin draws (and
    //    therefore sits) on top means the "live" one is never hidden
    //    under a stale test pin.
    // 2) even on top, an exact-overlap pin makes the one(s) underneath
    //    unclickable — nudging near-duplicate coordinates apart by a
    //    small deterministic offset keeps every admin's pin visible and
    //    selectable instead of silently merging into one dot.
    const sorted = [...visibleAdmins]
      .filter((a) => a.location)
      .sort((a, b) => new Date(a.location.recorded_at) - new Date(b.location.recorded_at));

    const placedKeys = new Map(); // rounded "lat,lng" -> how many already placed there
    sorted.forEach((a) => {
      const key = `${a.location.latitude.toFixed(3)},${a.location.longitude.toFixed(3)}`;
      const clashIndex = placedKeys.get(key) || 0;
      placedKeys.set(key, clashIndex + 1);

      // Fan out around the true point for the 2nd+ admin sharing it —
      // ~30m per step, in a different direction each time.
      const angle = clashIndex * (Math.PI / 3);
      const offsetDeg = clashIndex === 0 ? 0 : 0.00025 * clashIndex;
      const pos = {
        lat: a.location.latitude + offsetDeg * Math.sin(angle),
        lng: a.location.longitude + offsetDeg * Math.cos(angle),
      };

      const branchLabel = a.company ? ` · ${a.company.city}` : '';
      const popupHtml = `<div style="font-size:12px"><strong>${a.full_name}</strong><br/>${a.phone ? `${a.phone}<br/>` : ''}${a.role === 'super_admin' ? 'Super Admin' : 'Branch Admin'}${branchLabel}<br/>Last seen: ${new Date(
        a.location.recorded_at
      ).toLocaleTimeString()}</div>`;

      const marker = new maps.Marker({
        position: pos,
        map: mapRef.current,
        icon: buildCircleIcon(maps, getAdminColor(a), false, 10),
      });
      const infoWindow = new maps.InfoWindow({ content: popupHtml });
      marker.addListener('click', () => infoWindow.open({ map: mapRef.current, anchor: marker }));
      adminMarkersRef.current[a.id] = marker;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleAdmins, view, mapReady]);

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
    if (!selectedUser || !mapRef.current || !mapsRef.current) return;
    const maps = mapsRef.current;
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

      const path = points.map((p) => ({ lat: p.lat, lng: p.lng }));
      const polyline = new maps.Polyline({ path, map: mapRef.current, strokeColor: '#2E75B6', strokeWeight: 3, strokeOpacity: 0.8 });

      const startMarker = new maps.Marker({
        position: path[0],
        map: mapRef.current,
        icon: buildCircleIcon(maps, '#1A7A4A', false, 8),
      });
      const startInfo = new maps.InfoWindow({ content: 'Start' });
      startMarker.addListener('click', () => startInfo.open({ map: mapRef.current, anchor: startMarker }));

      const endMarker = new maps.Marker({
        position: path[path.length - 1],
        map: mapRef.current,
        icon: buildCircleIcon(maps, '#C0392B', false, 8),
      });
      const endInfo = new maps.InfoWindow({ content: 'End (most recent)' });
      endMarker.addListener('click', () => endInfo.open({ map: mapRef.current, anchor: endMarker }));

      routeLayerRef.current = [polyline, startMarker, endMarker];
      const bounds = new maps.LatLngBounds();
      path.forEach((p) => bounds.extend(p));
      mapRef.current.fitBounds(bounds, 40);

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
      // Explicitly names whose location this was — this button only ever
      // updates the currently logged-in browser's own account (browser
      // geolocation can't read another device's location), so it's worth
      // being unambiguous about that here rather than a generic message.
      toast.success(`Location updated for ${user?.fullName || 'your account'}.`);
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

  // Clicking a sidebar card pans the map to that person's marker.
  const focusOnSalesman = (s) => {
    if (!s.location || !mapRef.current) return;
    mapRef.current.panTo({ lat: s.location.latitude, lng: s.location.longitude });
    mapRef.current.setZoom(15);
    const marker = markersRef.current[s.id];
    marker?._infoWindow?.open({ map: mapRef.current, anchor: marker });
  };

  const statusCounts = useMemo(() => {
    const counts = { moving: 0, at_customer: 0, idle: 0, offline: 0 };
    visibleSalesmen.forEach((s) => { counts[effectiveStatus(s)] = (counts[effectiveStatus(s)] || 0) + 1; });
    return counts;
  }, [visibleSalesmen]);

  return (
    <div className="p-6 flex flex-col h-full">
      <PageHeader title="Live GPS Tracking" subtitle="Track salesman, driver and admin locations, and replay any day's route" />

      <div className="flex justify-between items-center flex-wrap gap-3 mb-4">
        <div className="flex gap-2">
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

        {isSuperAdmin && branches.length > 0 && (
          <select
            value={cityFilter}
            onChange={(e) => setCityFilter(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm font-medium text-navy focus:outline-none focus:ring-2 focus:ring-navy-chip focus:border-navy bg-white"
          >
            <option value="">All Cities</option>
            {branches.map((b) => (
              <option key={b.id} value={b.city}>{b.name} ({b.city})</option>
            ))}
          </select>
        )}

        {view === 'live' && visibleSalesmen.length > 0 && (
          <div className="flex gap-2">
            <span className="flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> Active ({statusCounts.moving})
            </span>
            <span className="flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full bg-navy-chip text-navy">
              <span className="w-1.5 h-1.5 rounded-full bg-navy" /> At Customer ({statusCounts.at_customer})
            </span>
            <span className="flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full bg-orange/10 text-orange">
              <span className="w-1.5 h-1.5 rounded-full bg-orange" /> Idle ({statusCounts.idle})
            </span>
            {statusCounts.offline > 0 && (
              <span className="flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full bg-gray-100 text-gray-500">
                <span className="w-1.5 h-1.5 rounded-full bg-gray-400" /> Offline ({statusCounts.offline})
              </span>
            )}
          </div>
        )}
      </div>

      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">{error}</div>
      )}

      <div className="flex gap-4 flex-1 min-h-[500px]">
        {/* Sidebar */}
        <div className="w-72 flex-shrink-0 flex flex-col gap-3 overflow-y-auto">
          {view === 'route' && (
            <div className="bg-white rounded-2xl shadow-card border border-gray-100 p-4 flex flex-col gap-3">
              <select
                value={selectedUser}
                onChange={(e) => setSelectedUser(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-navy focus:border-navy bg-white"
              >
                <option value="">— Select field staff —</option>
                {visibleSalesmen.map((s) => (
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
              <div className="bg-white rounded-2xl shadow-card border border-gray-100 p-6 text-sm text-gray-400">
                Loading...
              </div>
            ) : visibleAdmins.length === 0 ? (
              <div className="bg-white rounded-2xl shadow-card border border-gray-100">
                <EmptyState icon={ShieldCheck} title="No admins found" subtitle="Admin accounts will appear here" />
              </div>
            ) : (
              Object.entries(
                visibleAdmins.reduce((groups, a) => {
                  const key = a.company?.city || 'Other';
                  (groups[key] = groups[key] || []).push(a);
                  return groups;
                }, {})
              ).map(([city, admins]) => (
                <div key={city} className="flex flex-col gap-2">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-gray-400 px-1">{city} ({admins.length})</p>
                  {admins.map((a) => {
                    const color = getAdminColor(a);
                    return (
                      <div key={a.id} className="bg-white rounded-2xl shadow-card border border-gray-100 p-4 flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm flex-shrink-0 text-white" style={{ backgroundColor: color }}>
                          {getInitials(a.full_name)}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold text-sm text-navy truncate">{a.full_name}</p>
                          <p className="text-[11px] text-gray-400 font-medium uppercase tracking-wide">
                            {a.role === 'super_admin' ? 'Super Admin' : 'Branch Admin'}{a.company ? ` · ${a.company.city}` : ''}
                          </p>
                          <p className="text-xs text-gray-400 mt-0.5">
                            {a.location ? `Updated ${timeAgo(a.location.recorded_at)}` : 'No location reported yet'}
                          </p>
                        </div>
                        {a.location && (
                          <span className="text-[10px] font-bold uppercase px-2 py-1 rounded-full text-white flex-shrink-0" style={{ backgroundColor: color }}>
                            Online
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              ))
            )
          ) : loading && view === 'live' ? (
            <div className="bg-white rounded-2xl shadow-card border border-gray-100 p-6 text-sm text-gray-400">
              Loading...
            </div>
          ) : visibleSalesmen.length === 0 ? (
            <div className="bg-white rounded-2xl shadow-card border border-gray-100">
              <EmptyState icon={MapPin} title="No field staff found" subtitle="Salesman and driver accounts will appear here" />
            </div>
          ) : (
            visibleSalesmen.map((s) => {
              const status = effectiveStatus(s);
              const color = STATUS_COLORS[status];
              const meta = STATUS_META[status];
              const StatusIcon = meta.icon;
              const roleLabel = s.staffType === 'driver' ? 'Driver' : s.staffType === 'delivery' ? 'Delivery' : 'Salesman';
              return (
                <button
                  key={s.id}
                  onClick={() => focusOnSalesman(s)}
                  disabled={!s.location}
                  className={`text-left bg-white rounded-2xl shadow-card border border-gray-100 p-4 flex items-center gap-3 transition-shadow ${
                    s.location ? 'hover:shadow-md cursor-pointer' : 'cursor-default'
                  }`}
                >
                  <div
                    className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm flex-shrink-0"
                    style={{ backgroundColor: `${color}1a`, color }}
                  >
                    {getInitials(s.full_name)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-sm text-navy truncate">{s.full_name}</p>
                    <p className="text-[11px] text-gray-400 font-medium uppercase tracking-wide">
                      {roleLabel}{s.staffType === 'driver' && s.car_number ? ` · ${s.car_number}` : ''}{s.company ? ` · ${s.company.city}` : ''}
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {s.location ? `Updated ${timeAgo(s.location.recorded_at)}` : 'No location reported yet'}
                    </p>
                  </div>
                  <span
                    className="flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-full flex-shrink-0"
                    style={{ color, backgroundColor: `${color}1a` }}
                  >
                    <StatusIcon size={11} /> {meta.label}
                  </span>
                </button>
              );
            })
          )}
        </div>

        {/* Map — official Google Maps JavaScript API */}
        <div className="flex-1 relative rounded-2xl overflow-hidden border border-gray-100 shadow-card">
          <div ref={mapContainerRef} className="w-full h-full min-h-[500px]" />
          {view === 'live' && (
            <div className="absolute left-3 bottom-3 z-[1000] bg-white/95 backdrop-blur border border-gray-200 rounded-xl shadow-card px-3.5 py-2.5 text-xs text-gray-600 flex flex-col gap-1.5">
              <div className="flex items-center gap-3">
                <span className="flex items-center gap-1 font-medium">🔵 Karachi</span>
                <span className="flex items-center gap-1 font-medium">🔴 Hyderabad</span>
                <span className="flex items-center gap-1 font-medium">🟢 Sukkur</span>
              </div>
              <div className="flex items-center gap-3 border-t border-gray-100 pt-1.5">
                <span className="flex items-center gap-1 font-medium">👤 Salesman</span>
                <span className="flex items-center gap-1 font-medium">🚗 Driver</span>
              </div>
            </div>
          )}
          {view === 'admin' && visibleAdmins.length > 0 && (
            <div className="absolute left-3 bottom-3 z-[1000] bg-white/95 backdrop-blur border border-gray-200 rounded-xl shadow-card px-3.5 py-2.5 text-xs text-gray-600 flex flex-col gap-1">
              <p className="font-semibold text-gray-400 uppercase tracking-wide text-[10px] mb-0.5">Admin — each account is its own color</p>
              {visibleAdmins.map((a) => (
                <span key={a.id} className="flex items-center gap-1.5 font-medium">
                  <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: getAdminColor(a) }} />
                  {a.full_name}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
