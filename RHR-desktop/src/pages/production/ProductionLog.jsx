import React, { useEffect, useState } from 'react';
import { Factory, RotateCcw } from 'lucide-react';
import { revertProduction, getProductionHistory } from '../../services/api';
import PageHeader from '../../components/PageHeader';
import EmptyState from '../../components/EmptyState';
import { SkeletonTable } from '../../components/Skeleton';
import { useToast } from '../../components/Toast';

export default function ProductionLog() {
  const toast = useToast();

  const [history, setHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(true);

  useEffect(() => {
    loadHistory();
  }, []);

  const loadHistory = async () => {
    setLoadingHistory(true);
    try {
      const r = await getProductionHistory();
      if (r.data.success) setHistory(r.data.data || []);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to load production history.');
    } finally {
      setLoadingHistory(false);
    }
  };

  const handleRevert = async (id, productName, qty) => {
    if (!window.confirm(
      `Revert production of ${qty} ${productName}?\n\nThis will:\n` +
      `• Remove ${qty} from finished product stock\n` +
      `• Restore all raw material quantities\n\nThis cannot be undone.`
    )) return;

    try {
      const r = await revertProduction(id);
      if (r.data.success) {
        toast.success('Production reverted — stock restored.');
        loadHistory();
      } else {
        toast.error(r.data.message || 'Failed to revert production.');
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to revert production.');
    }
  };

  return (
    <div className="p-6">
      <PageHeader
        title="Production History"
        subtitle="Revert a record to undo its stock changes"
      />

      <div className="bg-white rounded-2xl shadow-card border border-gray-100 overflow-hidden">
        {loadingHistory ? (
          <SkeletonTable rows={6} cols={7} />
        ) : history.length === 0 ? (
          <EmptyState icon={Factory} title="No production records found" subtitle="Logged batches will show up here" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 bg-gray-50 border-b border-gray-100">
                  <th className="px-4 py-3 font-semibold text-xs uppercase tracking-wide">Date</th>
                  <th className="px-4 py-3 font-semibold text-xs uppercase tracking-wide">Recipe</th>
                  <th className="px-4 py-3 font-semibold text-xs uppercase tracking-wide">Finished Product</th>
                  <th className="px-4 py-3 font-semibold text-xs uppercase tracking-wide">Qty Produced</th>
                  <th className="px-4 py-3 font-semibold text-xs uppercase tracking-wide text-right">Total Cost</th>
                  <th className="px-4 py-3 font-semibold text-xs uppercase tracking-wide">Remarks</th>
                  <th className="px-4 py-3 font-semibold text-xs uppercase tracking-wide">Action</th>
                </tr>
              </thead>
              <tbody>
                {history.map((h, i) => (
                  <tr key={h.id} className={`border-b border-gray-50 last:border-0 hover:bg-gray-50/80 transition-colors ${i % 2 === 1 ? 'bg-gray-50/40' : ''}`}>
                    <td className="px-4 py-3 text-gray-500">{h.date}</td>
                    <td className="px-4 py-3 text-gray-600">{h.production_recipes?.recipe_name || '—'}</td>
                    <td className="px-4 py-3 font-medium text-navy">{h.products?.name || '—'}</td>
                    <td className="px-4 py-3 text-gray-600">{h.qty_produced} {h.products?.unit}</td>
                    <td className="px-4 py-3 text-gray-700 font-medium text-right">
                      PKR {Number(h.total_cost || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                    </td>
                    <td className="px-4 py-3 text-gray-500">{h.remarks || '—'}</td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => handleRevert(h.id, h.products?.name, h.qty_produced)}
                        className="flex items-center gap-1 text-xs font-semibold text-red-600 hover:bg-red-50 px-2.5 py-1.5 rounded-lg transition-colors"
                      >
                        <RotateCcw size={13} /> Revert
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
