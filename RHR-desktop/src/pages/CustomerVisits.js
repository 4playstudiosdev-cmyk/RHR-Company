import React, { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Footprints, MapPin, MapPinOff, Users, UserCog, Download, Search, ExternalLink } from 'lucide-react';
import api, { getCurrentUser } from '../services/api';
import PageHeader from '../components/PageHeader';
import CityFilter from '../components/CityFilter';
import DateRangeFilter from '../components/DateRangeFilter';
import EmptyState from '../components/EmptyState';
import Modal from '../components/Modal';
import { SkeletonTable } from '../components/Skeleton';
import { useToast } from '../components/Toast';
import { exportTableToExcel } from './production/exportUtils';

const KARACHI_COMPANY_ID = '1e5962c6-33a7-460b-913e-9e08db46973a';

const localISO = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// Date and time down to the second, always in Pakistan time so every admin
// reads the same moment no matter which computer they're on.
const stamp = (iso) =>
  new Date(iso).toLocaleString('en-GB', {
    timeZone: 'Asia/Karachi', day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true,
  });

const mapsLink = (lat, lng) => `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;

const customerName = (u) => u?.shop_name || u?.full_name || 'Customer';

// Within this many metres of the shop's saved pin counts as "at the shop".
const AT_SHOP_METERS = 200;

function distanceLabel(m) {
  if (m == null) return null;
  return m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${m} m`;
}

// Small interactive map for the "View Location" popup — the visit's recorded
// spot (orange pin) and, when the customer has one saved, their shop (🏪).
// Leaflet + OpenStreetMap tiles, same as the Live GPS page; the old embedded
// openstreetmap.org page refused to load inside the popup.
function VisitMap({ lat, lng, shopLat, shopLng }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!ref.current) return undefined;
    const map = L.map(ref.current).setView([lat, lng], 16);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 19,
    }).addTo(map);

    const visit = L.circleMarker([lat, lng], { radius: 10, fillColor: '#E8841A', fillOpacity: 1, color: '#fff', weight: 3 })
      .addTo(map).bindPopup('Visit location');
    const points = [[lat, lng]];

    if (shopLat != null && shopLng != null) {
      const icon = L.divIcon({
        className: '',
        html: '<div style="width:28px;height:28px;background:#fff;border:2px solid #073c9f;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:16px;box-shadow:0 2px 5px rgba(0,0,0,.35);">🏪</div>',
        iconSize: [28, 28], iconAnchor: [14, 14], popupAnchor: [0, -14],
      });
      L.marker([shopLat, shopLng], { icon }).addTo(map).bindPopup("Customer's saved shop location");
      L.polyline([[lat, lng], [shopLat, shopLng]], { color: '#6b7280', weight: 2, dashArray: '6 6' }).addTo(map);
      points.push([shopLat, shopLng]);
    }
    if (points.length > 1) map.fitBounds(L.latLngBounds(points), { padding: [40, 40], maxZoom: 17 });
    visit.openPopup();

    // the popup animates open — make Leaflet re-measure once it has settled
    const t = setTimeout(() => map.invalidateSize(), 250);
    return () => { clearTimeout(t); map.remove(); };
  }, [lat, lng, shopLat, shopLng]);
  return <div ref={ref} className="w-full h-80 rounded-xl border border-gray-200 z-0" />;
}

export default function CustomerVisits() {
  const toast = useToast();
  const user = getCurrentUser();
  const isSuper = user?.role === 'super_admin';

  // super_admin can look at one branch or all; a branch admin is fixed to theirs.
  const [selectedCity, setSelectedCity] = useState(isSuper ? KARACHI_COMPANY_ID : user?.companyId);
  const companyId = selectedCity === 'all' ? null : selectedCity;
  const [range, setRange] = useState({ from: localISO(), to: localISO() });
  const [salesmanId, setSalesmanId] = useState('');
  const [search, setSearch] = useState('');
  const [salesmen, setSalesmen] = useState([]);
  const [visits, setVisits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [mapVisit, setMapVisit] = useState(null);

  useEffect(() => {
    setSalesmanId('');
    const params = companyId ? { company_id: companyId } : {};
    // Primary list, with the lighter "directory" list as a fallback — the dropdown
    // must never come up empty.
    api.get('/salesmen', { params })
      .then((res) => setSalesmen(res.data.data || []))
      .catch(() => api.get('/salesmen/directory', { params })
        .then((res) => setSalesmen(res.data.data || []))
        .catch(() => setSalesmen([])));
  }, [companyId]);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError('');
    const params = {};
    if (companyId) params.company_id = companyId;
    if (salesmanId) params.salesman_id = salesmanId;
    if (range.from) params.from = range.from;
    if (range.to) params.to = range.to;
    api.get('/visits', { params })
      .then((res) => alive && setVisits(res.data.data || []))
      .catch((err) => alive && setError(err.response?.data?.message || 'Failed to load visits.'))
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [companyId, salesmanId, range.from, range.to]);

  // Every salesman: the salesmen list, plus anyone who appears on a visit in
  // the current results (so nobody with a visit is ever missing from the picker).
  const salesmanOptions = useMemo(() => {
    const byId = new Map(salesmen.map((s) => [s.id, s.full_name]));
    visits.forEach((v) => { if (v.salesman_id && !byId.has(v.salesman_id)) byId.set(v.salesman_id, v.salesmen?.full_name || 'Salesman'); });
    return [...byId.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => String(a.name).localeCompare(String(b.name)));
  }, [salesmen, visits]);

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return visits;
    return visits.filter((v) =>
      [v.users?.shop_name, v.users?.full_name, v.salesmen?.full_name, v.notes]
        .some((t) => (t || '').toLowerCase().includes(q)));
  }, [visits, search]);

  const stats = useMemo(() => ({
    total: shown.length,
    customers: new Set(shown.map((v) => v.customer_id)).size,
    salesmen: new Set(shown.map((v) => v.salesman_id)).size,
    withLocation: shown.filter((v) => v.has_location).length,
  }), [shown]);

  const handleExport = () => {
    if (shown.length === 0) { toast.error('No visits to export.'); return; }
    exportTableToExcel({
      sheetName: 'Customer Visits',
      head: ['Date & Time', 'Salesman', 'Customer', 'Contact Person', 'Notes', 'Follow-up', 'Latitude', 'Longitude', 'Distance From Shop (m)', 'Map Link'],
      rows: shown.map((v) => [
        stamp(v.visited_at),
        v.salesmen?.full_name || '',
        customerName(v.users),
        v.users?.shop_name ? v.users?.full_name || '' : '',
        v.notes || '',
        v.follow_up_date || '',
        v.has_location ? Number(v.latitude) : '',
        v.has_location ? Number(v.longitude) : '',
        v.distance_m ?? '',
        v.has_location ? mapsLink(v.latitude, v.longitude) : 'No location captured',
      ]),
      filename: `customer-visits-${range.from || 'all'}-to-${range.to || 'all'}`,
    });
  };

  return (
    <div className="p-6">
      <PageHeader
        title="Customer Visits"
        subtitle="Every visit a salesman marked — exact date and time, notes, and where they were"
        action={isSuper ? <CityFilter selectedCity={selectedCity} onChange={setSelectedCity} /> : null}
      />

      <div className="flex items-center gap-3 flex-wrap mb-5">
        <DateRangeFilter
          from={range.from}
          to={range.to}
          defaultPreset="Today"
          onApply={(from, to) => setRange({ from, to })}
        />
        <select
          value={salesmanId}
          onChange={(e) => setSalesmanId(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-navy-chip focus:border-navy"
        >
          <option value="">All salesmen ({salesmanOptions.length})</option>
          {salesmanOptions.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search customer, salesman or notes..."
            className="w-full border border-gray-300 rounded-lg pl-8 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-navy-chip focus:border-navy"
          />
        </div>
        <button
          onClick={handleExport}
          className="ml-auto flex items-center gap-1.5 border border-gray-200 bg-white text-navy hover:bg-gray-50 text-sm font-medium px-3.5 py-2 rounded-lg shadow-sm"
        >
          <Download size={15} /> Export Excel
        </button>
      </div>

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 mb-5">
        {[
          { label: 'Visits', value: stats.total, icon: Footprints, tone: 'bg-navy-chip text-navy' },
          { label: 'Customers visited', value: stats.customers, icon: Users, tone: 'bg-emerald-50 text-emerald-600' },
          { label: 'Salesmen', value: stats.salesmen, icon: UserCog, tone: 'bg-orange/10 text-orange' },
          { label: 'With location', value: `${stats.withLocation} / ${stats.total}`, icon: MapPin, tone: 'bg-navy-chip text-navy' },
        ].map((c) => (
          <div key={c.label} className="bg-white rounded-2xl shadow-card border border-gray-100 p-4 flex items-center gap-3">
            <span className={`w-10 h-10 rounded-xl flex items-center justify-center ${c.tone}`}><c.icon size={18} /></span>
            <div>
              <p className="text-xl font-bold text-navy leading-tight">{c.value}</p>
              <p className="text-xs text-gray-400">{c.label}</p>
            </div>
          </div>
        ))}
      </div>

      {error && <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">{error}</div>}

      <div className="bg-white rounded-2xl shadow-card border border-gray-100 overflow-hidden">
        {loading ? (
          <SkeletonTable rows={6} cols={7} />
        ) : shown.length === 0 ? (
          <EmptyState icon={Footprints} title="No visits in this period" subtitle="Visits show up here the moment a salesman marks one in the app" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 bg-gray-50 border-b border-gray-100">
                  <th className="pl-5 pr-2 py-3 font-semibold text-xs uppercase tracking-wide w-10">#</th>
                  <th className="px-5 py-3 font-semibold text-xs uppercase tracking-wide">Date & Time</th>
                  <th className="px-5 py-3 font-semibold text-xs uppercase tracking-wide">Salesman</th>
                  <th className="px-5 py-3 font-semibold text-xs uppercase tracking-wide">Customer</th>
                  <th className="px-5 py-3 font-semibold text-xs uppercase tracking-wide">Notes</th>
                  <th className="px-5 py-3 font-semibold text-xs uppercase tracking-wide">Location</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((v, i) => (
                  <tr key={v.id} className={`border-b border-gray-50 last:border-0 hover:bg-gray-50/80 ${i % 2 === 1 ? 'bg-gray-50/40' : ''}`}>
                    <td className="pl-5 pr-2 py-3 text-xs font-semibold text-gray-400">{i + 1}</td>
                    <td className="px-5 py-3 text-gray-700 whitespace-nowrap font-medium">{stamp(v.visited_at)}</td>
                    <td className="px-5 py-3 text-gray-700">{v.salesmen?.full_name || '—'}</td>
                    <td className="px-5 py-3">
                      <p className="font-semibold text-navy">{customerName(v.users)}</p>
                      {v.users?.shop_name && v.users?.full_name && <p className="text-xs text-gray-400">{v.users.full_name}</p>}
                    </td>
                    <td className="px-5 py-3 text-gray-600 max-w-[280px]">
                      <p className="line-clamp-2">{v.notes || '—'}</p>
                      {v.follow_up_date && <p className="text-[11px] text-gray-400 mt-0.5">Follow-up: {v.follow_up_date}</p>}
                    </td>
                    <td className="px-5 py-3 whitespace-nowrap">
                      {v.has_location ? (
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => setMapVisit(v)}
                            className="inline-flex items-center gap-1.5 text-xs font-semibold text-navy hover:underline"
                          >
                            <MapPin size={13} /> View Location
                          </button>
                          {v.distance_m != null && (
                            <span
                              title="Distance from the customer's saved shop location"
                              className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${v.distance_m <= AT_SHOP_METERS ? 'bg-emerald-50 text-emerald-700' : 'bg-orange/10 text-orange'}`}
                            >
                              {v.distance_m <= AT_SHOP_METERS ? 'At shop' : `${distanceLabel(v.distance_m)} from shop`}
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 text-xs text-gray-400">
                          <MapPinOff size={13} /> No location
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {mapVisit && (
        <Modal title="Visit Location" onClose={() => setMapVisit(null)} size="lg">
          <div className="text-sm space-y-0.5 mb-4">
            <p className="font-semibold text-navy">{customerName(mapVisit.users)}</p>
            <p className="text-gray-500">{mapVisit.salesmen?.full_name} · {stamp(mapVisit.visited_at)}</p>
            {mapVisit.distance_m != null && (
              <p className="text-gray-500">
                {distanceLabel(mapVisit.distance_m)} from the customer's saved shop location
                {mapVisit.location_accuracy_m != null && ` · GPS accuracy ±${mapVisit.location_accuracy_m} m`}
              </p>
            )}
          </div>
          {(() => {
            const lat = Number(mapVisit.latitude);
            const lng = Number(mapVisit.longitude);
            const shopLat = mapVisit.users?.shop_latitude != null ? Number(mapVisit.users.shop_latitude) : null;
            const shopLng = mapVisit.users?.shop_longitude != null ? Number(mapVisit.users.shop_longitude) : null;
            return (
              <>
                <VisitMap lat={lat} lng={lng} shopLat={shopLat} shopLng={shopLng} />
                <div className="flex items-center justify-between pt-3 text-xs text-gray-500">
                  <span>{lat.toFixed(6)}, {lng.toFixed(6)}</span>
                  <a href={mapsLink(lat, lng)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-semibold text-navy hover:underline">
                    Open in Google Maps <ExternalLink size={12} />
                  </a>
                </div>
              </>
            );
          })()}
        </Modal>
      )}
    </div>
  );
}
