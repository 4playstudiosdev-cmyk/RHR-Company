import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Factory } from 'lucide-react';
import api, { getCurrentUser } from '../../services/api';
import PageHeader from '../../components/PageHeader';
import Button from '../../components/Button';
import EmptyState from '../../components/EmptyState';
import { SkeletonTable } from '../../components/Skeleton';
import { useToast } from '../../components/Toast';
import CityFilter from '../../components/CityFilter';

// Admin enters how much of each finished product was made today; each
// recipe's ingredient lines (production_bom_items, via GET
// /production/bom-recipes) are used to live-preview raw material
// deductions and flag shortages before anything is submitted. Submitting
// calls the existing POST /production/produce once per product — no new
// deduction logic here, that's all in production.controller.js#runProduction.
export default function DailyProduction() {
  const toast = useToast();
  const user = getCurrentUser();
  const defaultCity = user?.role === 'super_admin' ? '1e5962c6-33a7-460b-913e-9e08db46973a' : user?.companyId;
  const [selectedCity, setSelectedCity] = useState(defaultCity);
  const [recipes, setRecipes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [qtyByRecipe, setQtyByRecipe] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);

  const isCombined = selectedCity === 'all';

  useEffect(() => {
    if (isCombined) { setRecipes([]); setLoading(false); return; }
    loadRecipes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCity]);

  const loadRecipes = async () => {
    setLoading(true);
    try {
      const res = await api.get('/production/bom-recipes', { params: { company_id: selectedCity } });
      setRecipes(res.data.data || []);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to load recipes.');
    } finally {
      setLoading(false);
    }
  };

  const setQty = (recipeId, value) => setQtyByRecipe((prev) => ({ ...prev, [recipeId]: value }));

  // Rows with a qty entered, each carrying a shortage preview computed
  // from the recipe's own ingredient lines (already embedded with live
  // raw_materials.stock by the bom-recipes endpoint).
  const previewRows = useMemo(() => {
    return recipes
      .map((recipe) => {
        const qty = Number(qtyByRecipe[recipe.id]) || 0;
        if (qty <= 0) return null;
        const lines = (recipe.production_bom_items || []).map((item) => {
          const needed = Number(item.qty_required) * qty;
          const available = Number(item.raw_materials?.stock || 0);
          const rate = Number(item.last_price || 0);
          return {
            name: item.raw_materials?.name || 'Unknown material',
            unit: item.unit,
            needed,
            available,
            shortage: Math.max(0, needed - available),
            cost: needed * rate,
            hasRate: item.last_price != null,
          };
        });
        const hasShortage = lines.some((l) => l.shortage > 0);
        const cost = lines.reduce((sum, l) => sum + l.cost, 0);
        const costIsPartial = lines.some((l) => !l.hasRate);
        return { recipe, qty, lines, hasShortage, cost, costIsPartial };
      })
      .filter(Boolean);
  }, [recipes, qtyByRecipe]);

  const anyShortage = previewRows.some((r) => r.hasShortage);
  const totalCost = previewRows.reduce((sum, r) => sum + r.cost, 0);
  const anyCostPartial = previewRows.some((r) => r.costIsPartial);

  const handleSubmit = async () => {
    if (!previewRows.length) {
      toast.error('Enter a quantity for at least one product.');
      return;
    }
    if (anyShortage) {
      toast.error('Fix raw material shortages before submitting.');
      return;
    }
    setSubmitting(true);
    try {
      for (const row of previewRows) {
        await api.post('/production/produce', {
          recipe_id: row.recipe.id,
          qty_produced: row.qty,
          date,
        });
      }
      toast.success(`Production logged for ${previewRows.length} product${previewRows.length > 1 ? 's' : ''}.`);
      setQtyByRecipe({});
      loadRecipes();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to log production.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="p-6">
      <PageHeader
        title="Daily Production Entry"
        subtitle="Enter today's finished quantities — raw materials are deducted automatically per recipe"
        action={<CityFilter selectedCity={selectedCity} onChange={setSelectedCity} />}
      />

      {isCombined ? (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100">
          <EmptyState icon={Factory} title="Select a specific city to enter production" />
        </div>
      ) : loading ? (
        <SkeletonTable rows={5} cols={4} />
      ) : (
        <>
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 mb-6 flex items-center gap-4">
            <label className="text-sm font-medium text-gray-700">Production Date</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-navy focus:border-navy"
            />
          </div>

          {recipes.length === 0 ? (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100">
              <EmptyState icon={Factory} title="No recipes configured" subtitle="Add recipes under Production → Recipes first" />
            </div>
          ) : (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden mb-6">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-gray-500 bg-gray-50 border-b border-gray-100">
                      <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide">Product</th>
                      <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide">Batch Unit</th>
                      <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide text-right">Qty Produced Today</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recipes.map((recipe, i) => (
                      <tr key={recipe.id} className={`border-b border-gray-50 last:border-0 ${i % 2 === 1 ? 'bg-gray-50/40' : ''}`}>
                        <td className="px-6 py-3.5 font-medium text-navy">
                          {recipe.product_name}
                          {!recipe.product && (
                            <span className="block text-xs text-red-500">No matching product in catalog</span>
                          )}
                        </td>
                        <td className="px-6 py-3.5 text-gray-600">{recipe.batch_unit}</td>
                        <td className="px-6 py-3.5 text-right">
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            placeholder="0"
                            value={qtyByRecipe[recipe.id] || ''}
                            onChange={(e) => setQty(recipe.id, e.target.value)}
                            className="w-28 border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm text-right focus:outline-none focus:ring-2 focus:ring-navy focus:border-navy"
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {previewRows.length > 0 && (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 mb-6">
              <h3 className="text-sm font-semibold text-navy mb-4">Raw Material Deduction & Cost Preview</h3>
              <div className="space-y-4">
                {previewRows.map((row) => (
                  <div key={row.recipe.id} className="bg-navy-chip/30 rounded-lg px-3.5 py-3">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-sm font-medium text-gray-700">
                        {row.recipe.product_name} — {row.qty} {row.recipe.batch_unit}
                      </p>
                      <span className="text-sm font-semibold text-orange">
                        Cost: PKR {row.cost.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                        {row.costIsPartial && <span className="text-gray-400 font-normal"> (partial)</span>}
                      </span>
                    </div>
                    <div className="space-y-1.5">
                      {row.lines.map((l, idx) => (
                        <div key={idx} className="flex items-center justify-between text-xs pl-3">
                          <span className="text-gray-500">{l.name}</span>
                          <span className={l.shortage > 0 ? 'text-red-600 font-semibold flex items-center gap-1' : 'text-gray-600'}>
                            {l.shortage > 0 ? (
                              <>
                                <AlertTriangle size={12} /> Need {l.needed.toFixed(2)} {l.unit}, have {l.available.toFixed(2)}
                              </>
                            ) : (
                              <>Need {l.needed.toFixed(2)} {l.unit} (have {l.available.toFixed(2)}){!l.hasRate && ' — no purchase price on record'}</>
                            )}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex items-center justify-between bg-navy rounded-lg px-4 py-3 mt-4">
                <span className="text-sm font-semibold text-white">Total Production Cost</span>
                <span className="text-base font-bold text-orange">
                  PKR {totalCost.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                  {anyCostPartial && <span className="text-blue-200/70 font-normal text-xs"> (based on last known purchase price per material)</span>}
                </span>
              </div>
            </div>
          )}

          <div className="flex items-center justify-between">
            {anyShortage ? (
              <p className="text-sm text-red-600 flex items-center gap-1.5"><AlertTriangle size={15} /> One or more materials are short — fix quantities before submitting.</p>
            ) : previewRows.length > 0 ? (
              <p className="text-sm text-green-600 flex items-center gap-1.5"><CheckCircle2 size={15} /> All materials available.</p>
            ) : <span />}
            <Button variant="accent" onClick={handleSubmit} disabled={submitting || !previewRows.length || anyShortage}>
              {submitting ? 'Logging...' : 'Log Production'}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
