import React, { useEffect, useState } from 'react';
import { Plus, Store, UserX } from 'lucide-react';
import api, { getCurrentUser } from '../services/api';
import Modal from '../components/Modal';
import Button from '../components/Button';
import EmptyState from '../components/EmptyState';
import { SkeletonTable } from '../components/Skeleton';
import { useToast } from '../components/Toast';
import CityFilter from '../components/CityFilter';
import { fetchAllCities } from '../utils/multiCityFetch';

const KARACHI_COMPANY_ID = '1e5962c6-33a7-460b-913e-9e08db46973a';

export default function Suppliers() {
  const toast = useToast();
  const user = getCurrentUser();
  const defaultCity = user?.role === 'super_admin' ? KARACHI_COMPANY_ID : user?.companyId;
  const [selectedCity, setSelectedCity] = useState(defaultCity);
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState(null);

  useEffect(() => {
    loadSuppliers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCity]);

  const loadSuppliers = async () => {
    setLoading(true);
    setError('');
    try {
      const companyFilter = selectedCity === 'all' ? null : selectedCity;
      const data = companyFilter
        ? (await api.get('/suppliers', { params: { company_id: companyFilter } })).data.data || []
        : await fetchAllCities('/suppliers');
      setSuppliers(data);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load suppliers.');
    } finally {
      setLoading(false);
    }
  };

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!name.trim()) { toast.error('Enter a supplier name.'); return; }
    setSaving(true);
    try {
      const targetCompanyId = selectedCity === 'all' ? KARACHI_COMPANY_ID : selectedCity;
      await api.post('/suppliers', { name: name.trim(), company_id: targetCompanyId });
      toast.success('Supplier added.');
      setShowAddModal(false);
      setName('');
      loadSuppliers();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to add supplier.');
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async (supplier) => {
    if (!window.confirm(`Remove "${supplier.name}" from the suppliers list?`)) return;
    setBusyId(supplier.id);
    try {
      await api.delete(`/suppliers/${supplier.id}`);
      toast.success('Supplier removed.');
      loadSuppliers();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to remove supplier.');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="p-6">
      <div className="flex justify-between items-start flex-wrap gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-navy">Suppliers</h1>
          <p className="text-sm text-gray-500 mt-1">Suppliers available in the Raw Materials purchase flow.</p>
        </div>
        <div className="flex items-center gap-3">
          <CityFilter selectedCity={selectedCity} onChange={setSelectedCity} />
          <Button variant="accent" onClick={() => { setName(''); setShowAddModal(true); }} className="flex items-center gap-2">
            <Plus size={16} /> Add Supplier
          </Button>
        </div>
      </div>

      {error && (
        <div className="mb-6 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">{error}</div>
      )}

      <div className="bg-white rounded-2xl shadow-card border border-gray-100 overflow-hidden">
        {loading ? (
          <SkeletonTable rows={6} cols={2} />
        ) : suppliers.length === 0 ? (
          <EmptyState icon={Store} title="No suppliers yet" subtitle="Add one here, or it'll be added automatically the first time you type a new name on a purchase" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 bg-gray-50 border-b border-gray-100">
                  <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide">Name</th>
                  <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide">Actions</th>
                </tr>
              </thead>
              <tbody>
                {suppliers.map((s, i) => (
                  <tr key={s.id} className={`border-b border-gray-50 last:border-0 hover:bg-gray-50/80 transition-colors ${i % 2 === 1 ? 'bg-gray-50/40' : ''}`}>
                    <td className="px-6 py-3.5 font-medium text-navy">{s.name}</td>
                    <td className="px-6 py-3.5">
                      <button
                        onClick={() => handleRemove(s)}
                        disabled={busyId === s.id}
                        className="p-2 rounded-lg text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50"
                        title="Remove"
                      >
                        <UserX size={15} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showAddModal && (
        <Modal title="Add Supplier" onClose={() => setShowAddModal(false)}>
          <form onSubmit={handleAdd} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Supplier Name *</label>
              <input
                type="text"
                required
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Lucky Cement OPC"
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-navy focus:border-navy transition-shadow"
              />
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <Button type="button" variant="secondary" onClick={() => setShowAddModal(false)}>Cancel</Button>
              <Button type="submit" variant="accent" disabled={saving}>{saving ? 'Saving...' : 'Save'}</Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
