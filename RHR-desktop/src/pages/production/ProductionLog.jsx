import React, { useEffect, useState } from 'react';
import { Factory, RotateCcw, CheckCircle2, XCircle } from 'lucide-react';
import { getRecipes, logProduction, revertProduction, getProductionHistory } from '../../services/api';
import Button from '../../components/Button';
import PageHeader from '../../components/PageHeader';
import EmptyState from '../../components/EmptyState';
import { SkeletonTable } from '../../components/Skeleton';
import { useToast } from '../../components/Toast';

const todayStr = () => new Date().toISOString().split('T')[0];

export default function ProductionLog() {
  const toast = useToast();

  const [recipes, setRecipes] = useState([]);
  const [history, setHistory] = useState([]);
  const [selectedRecipe, setSelectedRecipe] = useState(null);
  const [recipeId, setRecipeId] = useState('');
  const [qtyProduced, setQtyProduced] = useState('');
  const [date, setDate] = useState(todayStr());
  const [remarks, setRemarks] = useState('');
  const [preview, setPreview] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(true);

  useEffect(() => {
    loadRecipes();
    loadHistory();
  }, []);

  const loadRecipes = async () => {
    try {
      const r = await getRecipes();
      if (r.data.success) setRecipes(r.data.data || []);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to load recipes.');
    }
  };

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

  // When recipe OR qty changes — calculate preview
  useEffect(() => {
    if (!selectedRecipe || !qtyProduced) {
      setPreview([]);
      return;
    }
    const qty = Number(qtyProduced);
    const items = (selectedRecipe.recipe_ingredients || []).map((ing) => {
      const needed = Number(ing.quantity) * qty;
      const available = Number(ing.raw_materials?.stock || 0);
      return {
        name: ing.raw_materials?.name,
        unit: ing.unit,
        needed,
        available,
        canProduce: available >= needed,
        shortage: Math.max(0, needed - available),
      };
    });
    setPreview(items);
  }, [selectedRecipe, qtyProduced]);

  const handleRecipeChange = (e) => {
    const id = e.target.value;
    setRecipeId(id);
    const found = recipes.find((r) => r.id === id);
    setSelectedRecipe(found || null);
    setQtyProduced('');
    setPreview([]);
  };

  const canProduce = preview.length > 0 && preview.every((p) => p.canProduce);

  const handleSubmit = async () => {
    if (!recipeId) { toast.error('Select a recipe.'); return; }
    if (!qtyProduced || Number(qtyProduced) <= 0) { toast.error('Enter a valid quantity.'); return; }
    if (!canProduce) { toast.error('Insufficient raw materials.'); return; }

    if (!window.confirm(
      `Produce ${qtyProduced} ${selectedRecipe?.batch_unit || ''} of ${selectedRecipe?.recipe_name}?\nThis will deduct raw materials from stock.`
    )) return;

    setLoading(true);
    try {
      const r = await logProduction({
        recipe_id: recipeId,
        qty_produced: Number(qtyProduced),
        date,
        remarks,
      });
      if (r.data.success) {
        toast.success('Production logged — stock updated.');
        setRecipeId('');
        setSelectedRecipe(null);
        setQtyProduced('');
        setRemarks('');
        setPreview([]);
        loadHistory();
      } else {
        toast.error(r.data.message || 'Failed to log production.');
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to log production.');
    } finally {
      setLoading(false);
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
        title="Production Log"
        subtitle="Log a completed batch from a recipe — raw materials deduct and finished stock adds automatically"
      />

      <div className="flex flex-col lg:flex-row gap-6 items-start">
        {/* ── LEFT — Log New Batch ── */}
        <div className="w-full lg:w-[40%] flex-shrink-0 bg-white rounded-2xl shadow-card border border-gray-100 p-5">
          <h2 className="text-base font-bold text-navy mb-4">Log Production Batch</h2>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Date</label>
              <input
                type="date"
                value={date}
                max={todayStr()}
                onChange={(e) => setDate(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-navy focus:border-navy transition-shadow"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Select Recipe *</label>
              <select
                value={recipeId}
                onChange={handleRecipeChange}
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-navy focus:border-navy transition-shadow bg-white"
              >
                <option value="">— Select Recipe —</option>
                {recipes.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.recipe_name} → {r.products?.name}
                  </option>
                ))}
              </select>
            </div>

            {selectedRecipe && (
              <div className="bg-navy-chip/40 border border-navy-chip rounded-lg px-3.5 py-3 text-sm space-y-1">
                <p className="text-navy">Finished Product: <strong>{selectedRecipe.products?.name}</strong></p>
                <p className="text-navy">Batch Unit: <strong>{selectedRecipe.batch_unit}</strong></p>
                <p className="text-navy">Ingredients: <strong>{selectedRecipe.recipe_ingredients?.length || 0} materials</strong></p>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Quantity to Produce *</label>
              <input
                type="number"
                min="0"
                step="0.01"
                placeholder="0"
                value={qtyProduced}
                onChange={(e) => setQtyProduced(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-navy focus:border-navy transition-shadow"
              />
            </div>

            {preview.length > 0 && (
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wide text-gray-500 mb-2">Materials Required</h4>
                <div className="border border-gray-200 rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-gray-500 bg-gray-50 border-b border-gray-100">
                        <th className="px-3 py-2 font-semibold text-xs uppercase tracking-wide">Material</th>
                        <th className="px-3 py-2 font-semibold text-xs uppercase tracking-wide">Need</th>
                        <th className="px-3 py-2 font-semibold text-xs uppercase tracking-wide">Have</th>
                        <th className="px-3 py-2 font-semibold text-xs uppercase tracking-wide">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {preview.map((mat, i) => (
                        <tr key={i} className={`border-b border-gray-50 last:border-0 ${i % 2 === 1 ? 'bg-gray-50/60' : ''}`}>
                          <td className="px-3 py-2 font-medium text-navy">{mat.name}</td>
                          <td className="px-3 py-2 text-gray-600">{mat.needed} {mat.unit}</td>
                          <td className="px-3 py-2 text-gray-600">{mat.available} {mat.unit}</td>
                          <td className="px-3 py-2">
                            {mat.canProduce ? (
                              <span className="flex items-center gap-1 text-emerald-700 font-semibold text-xs">
                                <CheckCircle2 size={13} /> Available
                              </span>
                            ) : (
                              <span className="flex items-center gap-1 text-red-600 font-semibold text-xs">
                                <XCircle size={13} /> Short by {mat.shortage} {mat.unit}
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {!canProduce && (
                  <div className="mt-2 bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-lg text-xs font-medium">
                    Insufficient raw materials — cannot produce
                  </div>
                )}
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Remarks (optional)</label>
              <input
                type="text"
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
                placeholder="e.g. Morning batch"
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-navy focus:border-navy transition-shadow"
              />
            </div>

            <Button
              variant="primary"
              onClick={handleSubmit}
              disabled={!canProduce || loading}
              className="w-full flex items-center justify-center gap-2"
            >
              <Factory size={15} /> {loading ? 'Logging...' : 'Log Production'}
            </Button>
          </div>
        </div>

        {/* ── RIGHT — Production History ── */}
        <div className="w-full lg:w-[60%] min-w-0">
          <h2 className="text-base font-bold text-navy mb-1">Production History</h2>
          <p className="text-xs text-gray-400 mb-4">Revert a record to undo its stock changes.</p>

          <div className="bg-white rounded-2xl shadow-card border border-gray-100 overflow-hidden">
            {loadingHistory ? (
              <SkeletonTable rows={6} cols={6} />
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
      </div>
    </div>
  );
}
