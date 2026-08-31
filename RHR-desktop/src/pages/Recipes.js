import React, { useEffect, useState } from 'react';
import { Plus, X, Save, Trash2, ClipboardList, FlaskConical } from 'lucide-react';
import {
  getRecipes, createRecipe, deleteRecipe, getFinishedProducts, getRecipeRawMaterials
} from '../services/api';
import Button from '../components/Button';
import PageHeader from '../components/PageHeader';
import EmptyState from '../components/EmptyState';
import { SkeletonCards } from '../components/Skeleton';
import { useToast } from '../components/Toast';

const EMPTY_INGREDIENT = { raw_material_id: '', qty_required: '', unit: '' };

export default function Recipes() {
  const toast = useToast();

  const [recipeName, setRecipeName] = useState('');
  const [finishedItemId, setFinishedItemId] = useState('');
  const [batchSize, setBatchSize] = useState(1);
  const [batchUnit, setBatchUnit] = useState('bag');
  const [notes, setNotes] = useState('');
  const [ingredients, setIngredients] = useState([{ ...EMPTY_INGREDIENT }]);

  const [recipes, setRecipes] = useState([]);
  const [finishedProducts, setFinishedProducts] = useState([]);
  const [rawMaterials, setRawMaterials] = useState([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadAll();
  }, []);

  const loadAll = async () => {
    setLoading(true);
    try {
      const [recipesRes, productsRes, materialsRes] = await Promise.all([
        getRecipes(),
        getFinishedProducts(),
        getRecipeRawMaterials()
      ]);
      setRecipes(recipesRes.data.data || []);
      setFinishedProducts(productsRes.data.data || []);
      setRawMaterials(materialsRes.data.data || []);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to load recipes.');
    } finally {
      setLoading(false);
    }
  };

  const loadRecipes = async () => {
    try {
      const res = await getRecipes();
      setRecipes(res.data.data || []);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to load recipes.');
    }
  };

  const addIngredientRow = () => {
    setIngredients([...ingredients, { ...EMPTY_INGREDIENT }]);
  };

  const removeIngredientRow = (index) => {
    if (ingredients.length === 1) return;
    setIngredients(ingredients.filter((_, i) => i !== index));
  };

  const updateIngredient = (index, field, value) => {
    const updated = [...ingredients];
    updated[index] = { ...updated[index], [field]: value };
    if (field === 'raw_material_id') {
      const mat = rawMaterials.find((m) => m.id === value);
      if (mat) updated[index].unit = mat.unit;
    }
    setIngredients(updated);
  };

  const handleClear = () => {
    setRecipeName('');
    setFinishedItemId('');
    setBatchSize(1);
    setBatchUnit('bag');
    setNotes('');
    setIngredients([{ ...EMPTY_INGREDIENT }]);
  };

  const handleSave = async () => {
    if (!recipeName) { toast.error('Recipe name is required.'); return; }
    if (!finishedItemId) { toast.error('Select a finished product.'); return; }
    if (ingredients.some((i) => !i.raw_material_id || !i.qty_required)) {
      toast.error('All ingredient rows must be complete.');
      return;
    }

    setSaving(true);
    try {
      await createRecipe({
        recipe_name: recipeName,
        finished_item_id: finishedItemId,
        batch_size: batchSize,
        batch_unit: batchUnit,
        notes,
        ingredients: ingredients.map((i) => ({
          raw_material_id: i.raw_material_id,
          qty_required: Number(i.qty_required),
          unit: i.unit
        }))
      });
      toast.success('Recipe saved successfully.');
      handleClear();
      loadRecipes();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to save recipe.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (recipe) => {
    if (!window.confirm(`Delete "${recipe.recipe_name}"? This cannot be undone.`)) return;
    try {
      await deleteRecipe(recipe.id);
      toast.success('Recipe deleted.');
      loadRecipes();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to delete recipe.');
    }
  };

  return (
    <div className="p-6">
      <PageHeader
        title="Recipes"
        subtitle="Define the raw-material bill of materials (BOM) behind each finished product"
      />

      <div className="flex flex-col lg:flex-row gap-6 items-start">
        {/* ── LEFT COLUMN — Create Recipe Form ── */}
        <div className="w-full lg:w-[40%] flex-shrink-0 bg-white rounded-2xl shadow-card border border-gray-100 p-5">
          <h2 className="text-base font-bold text-navy mb-4">Create New Recipe</h2>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Recipe Name *</label>
              <input
                type="text"
                value={recipeName}
                onChange={(e) => setRecipeName(e.target.value)}
                placeholder="e.g. ReadyMix Tile Bond 150%"
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-navy focus:border-navy transition-shadow"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Finished Product *</label>
              <select
                value={finishedItemId}
                onChange={(e) => setFinishedItemId(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-navy focus:border-navy transition-shadow bg-white"
              >
                <option value="">— Select finished product —</option>
                {finishedProducts.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} (Stock: {p.stock_quantity} {p.unit})
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Batch Size</label>
                <input
                  type="number"
                  min="0"
                  value={batchSize}
                  onChange={(e) => setBatchSize(e.target.value)}
                  placeholder="1"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-navy focus:border-navy transition-shadow"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Batch Unit</label>
                <input
                  type="text"
                  value={batchUnit}
                  onChange={(e) => setBatchUnit(e.target.value)}
                  placeholder="bag"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-navy focus:border-navy transition-shadow"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Notes</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Optional notes..."
                rows={2}
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-navy focus:border-navy transition-shadow"
              />
            </div>

            <div className="pt-2 border-t border-gray-100">
              <h3 className="text-sm font-bold text-navy mt-4 mb-3">Raw Materials / Ingredients</h3>

              <div className="space-y-2.5">
                {ingredients.map((ing, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <select
                      value={ing.raw_material_id}
                      onChange={(e) => updateIngredient(index, 'raw_material_id', e.target.value)}
                      className="flex-[2] min-w-0 border border-gray-300 rounded-lg px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-navy focus:border-navy transition-shadow bg-white"
                    >
                      <option value="">— Material —</option>
                      {rawMaterials.map((m) => (
                        <option key={m.id} value={m.id}>{m.name} ({m.unit})</option>
                      ))}
                    </select>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={ing.qty_required}
                      onChange={(e) => updateIngredient(index, 'qty_required', e.target.value)}
                      placeholder="Qty"
                      className="flex-1 min-w-0 border border-gray-300 rounded-lg px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-navy focus:border-navy transition-shadow"
                    />
                    <input
                      type="text"
                      value={ing.unit}
                      onChange={(e) => updateIngredient(index, 'unit', e.target.value)}
                      placeholder="Unit"
                      className="flex-1 min-w-0 border border-gray-300 rounded-lg px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-navy focus:border-navy transition-shadow"
                    />
                    <button
                      type="button"
                      onClick={() => removeIngredientRow(index)}
                      disabled={ingredients.length === 1}
                      className="p-2 rounded-lg text-red-600 hover:bg-red-50 transition-colors disabled:opacity-30 disabled:cursor-not-allowed flex-shrink-0"
                      title="Remove"
                    >
                      <X size={16} />
                    </button>
                  </div>
                ))}
              </div>

              <button
                type="button"
                onClick={addIngredientRow}
                className="mt-3 flex items-center gap-1.5 text-sm font-medium text-orange hover:underline"
              >
                <Plus size={15} /> Add Material
              </button>
            </div>

            <div className="flex gap-3 pt-2">
              <Button variant="primary" onClick={handleSave} disabled={saving} className="flex-1 flex items-center justify-center gap-2">
                <Save size={15} /> {saving ? 'Saving...' : 'Save Recipe'}
              </Button>
              <Button variant="secondary" onClick={handleClear} disabled={saving}>
                Clear Form
              </Button>
            </div>
          </div>
        </div>

        {/* ── RIGHT COLUMN — Saved Recipes ── */}
        <div className="w-full lg:w-[60%] min-w-0">
          <h2 className="text-base font-bold text-navy mb-4">Saved Recipes ({recipes.length})</h2>

          {loading ? (
            <SkeletonCards count={4} />
          ) : recipes.length === 0 ? (
            <div className="bg-white rounded-2xl shadow-card border border-gray-100">
              <EmptyState
                icon={ClipboardList}
                title="No recipes yet"
                subtitle="Create your first recipe using the form on the left"
              />
            </div>
          ) : (
            <div className="space-y-4">
              {recipes.map((recipe) => (
                <div key={recipe.id} className="bg-white rounded-2xl shadow-card border border-gray-100 overflow-hidden">
                  <div className="bg-navy px-5 py-4 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="font-bold text-white truncate">{recipe.recipe_name}</h3>
                      <p className="text-xs text-blue-200/80 mt-1">
                        Finished Product: {recipe.products?.name || '—'}
                      </p>
                      <p className="text-xs text-blue-200/80">
                        Batch Size: {recipe.batch_size} {recipe.batch_unit}
                      </p>
                    </div>
                    <button
                      onClick={() => handleDelete(recipe)}
                      className="flex items-center gap-1.5 text-xs font-semibold text-red-200 hover:text-white hover:bg-red-500/30 px-2.5 py-1.5 rounded-lg transition-colors flex-shrink-0"
                    >
                      <Trash2 size={13} /> Delete
                    </button>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-gray-500 bg-gray-50 border-b border-gray-100">
                          <th className="px-4 py-2.5 font-semibold text-xs uppercase tracking-wide w-12">S.No</th>
                          <th className="px-4 py-2.5 font-semibold text-xs uppercase tracking-wide">Raw Material</th>
                          <th className="px-4 py-2.5 font-semibold text-xs uppercase tracking-wide">Qty Required</th>
                          <th className="px-4 py-2.5 font-semibold text-xs uppercase tracking-wide">Unit</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(recipe.recipe_ingredients || []).map((ing, i) => (
                          <tr
                            key={ing.id}
                            className={`border-b border-gray-50 last:border-0 ${i % 2 === 1 ? 'bg-gray-50/60' : 'bg-white'}`}
                          >
                            <td className="px-4 py-2.5 text-gray-500">{i + 1}</td>
                            <td className="px-4 py-2.5 font-medium text-navy">{ing.raw_materials?.name || '—'}</td>
                            <td className="px-4 py-2.5 text-gray-600">{ing.qty_required}</td>
                            <td className="px-4 py-2.5 text-gray-600">{ing.unit}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {recipe.notes && (
                    <div className="px-5 py-3 border-t border-gray-100 bg-gray-50/50">
                      <p className="text-xs text-gray-500 flex items-start gap-1.5">
                        <FlaskConical size={13} className="mt-0.5 flex-shrink-0" />
                        <span>Notes: {recipe.notes}</span>
                      </p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
