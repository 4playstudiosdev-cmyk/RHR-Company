import { useState, useEffect } from 'react';
import { Plus, ListPlus, PencilLine, Trash2, Save, X, FlaskConical, ClipboardList } from 'lucide-react';
import api from '../../services/api';
import PageHeader from '../../components/PageHeader';
import Button from '../../components/Button';
import EmptyState from '../../components/EmptyState';
import { useToast } from '../../components/Toast';

const EMPTY_ROW = () => ({ raw_material_id: '', material_name: '', quantity: '', unit: '', isNew: false });

export default function RecipesPage() {
  const toast = useToast();

  const [products, setProducts]         = useState([]);
  const [rawMaterials, setRawMaterials] = useState([]);
  const [recipes, setRecipes]           = useState([]);
  const [selectedProductId, setSelectedProductId] = useState('');
  const [editingRecipeId, setEditingRecipeId]     = useState(null);
  const [ingredients, setIngredients]   = useState([EMPTY_ROW()]);
  const [saving, setSaving]             = useState(false);
  const [savingRow, setSavingRow]       = useState(null);
  const [loading, setLoading]           = useState(true);

  useEffect(() => {
    loadProducts();
    loadRawMaterials();
    loadRecipes();
  }, []);

  const loadProducts = async () => {
    try {
      const r = await api.get('/products', { params: { limit: 500 } });
      setProducts(r.data.data?.products || []);
    } catch (e) {
      toast.error('Failed to load products.');
    }
  };

  const loadRawMaterials = async () => {
    try {
      const r = await api.get('/production/materials');
      if (r.data.success) setRawMaterials(r.data.data || []);
    } catch (e) {
      toast.error('Failed to load raw materials.');
    }
  };

  const loadRecipes = async () => {
    try {
      setLoading(true);
      const r = await api.get('/production/recipes');
      if (r.data.success) setRecipes(r.data.data || []);
    } catch (e) {
      toast.error('Failed to load recipes.');
    } finally {
      setLoading(false);
    }
  };

  // production_bom links to a product by name (no product_id FK — see
  // production.routes.js), so an "existing recipe" is found by matching
  // the chosen product's name against saved recipes' product_name.
  const findRecipeForProduct = (productName) =>
    recipes.find((r) => r.product_name?.trim().toLowerCase() === productName?.trim().toLowerCase());

  const rowsFromRecipe = (recipe) =>
    (recipe.recipe_ingredients || []).map((ing) => ({
      raw_material_id: ing.raw_materials?.id || '',
      material_name:   ing.raw_materials?.name || '',
      quantity:         ing.qty_required,
      unit:             ing.unit,
      isNew:            false,
    }));

  const handleProductSelect = (e) => {
    const productId = e.target.value;
    setSelectedProductId(productId);
    if (!productId) {
      setEditingRecipeId(null);
      setIngredients([EMPTY_ROW()]);
      return;
    }
    const product = products.find((p) => p.id === productId);
    const existing = product ? findRecipeForProduct(product.name) : null;
    if (existing) {
      setEditingRecipeId(existing.id);
      setIngredients(rowsFromRecipe(existing));
    } else {
      setEditingRecipeId(null);
      setIngredients([EMPTY_ROW()]);
    }
  };

  const addIngredientRow = (type) => {
    setIngredients((prev) => [...prev, { ...EMPTY_ROW(), isNew: type === 'input' }]);
  };

  const removeRow = (index) => {
    if (ingredients.length === 1) return;
    setIngredients((prev) => prev.filter((_, i) => i !== index));
  };

  const updateRow = (index, field, value) => {
    setIngredients((prev) => prev.map((ing, i) => {
      if (i !== index) return ing;
      const updated = { ...ing, [field]: value };
      if (field === 'raw_material_id') {
        const mat = rawMaterials.find((m) => m.id === value);
        if (mat) updated.unit = mat.unit || '';
      }
      return updated;
    }));
  };

  // Types a brand-new material's name/unit inline, then persists it to
  // raw_materials on demand — the row is only usable in a saved recipe
  // once it's backed by a real raw_material_id.
  const saveNewMaterial = async (index) => {
    const ing = ingredients[index];
    if (!ing.material_name.trim() || !ing.unit.trim()) {
      toast.error('Material name and unit are required before saving.');
      return;
    }
    setSavingRow(index);
    try {
      const r = await api.post('/production/materials', {
        name:      ing.material_name.trim(),
        category:  'other',
        unit:      ing.unit.trim(),
        stock:     0,
        min_level: 0,
      });
      if (r.data.success) {
        updateRow(index, 'raw_material_id', r.data.data.id);
        setIngredients((prev) => prev.map((row, i) => (i === index ? { ...row, isNew: false } : row)));
        await loadRawMaterials();
        toast.success(`"${ing.material_name.trim()}" added to raw materials.`);
      } else {
        toast.error(r.data.message || 'Failed to save material.');
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to save material.');
    } finally {
      setSavingRow(null);
    }
  };

  const handleClear = () => {
    setSelectedProductId('');
    setEditingRecipeId(null);
    setIngredients([EMPTY_ROW()]);
  };

  const handleSave = async () => {
    if (!selectedProductId) { toast.error('Select a finished product.'); return; }

    const unresolved = ingredients.filter((i) => i.isNew || !i.raw_material_id);
    if (unresolved.length > 0) {
      toast.error('Save every new material before saving the recipe.');
      return;
    }
    if (ingredients.some((i) => !i.quantity || Number(i.quantity) <= 0)) {
      toast.error('All ingredient rows need a quantity.');
      return;
    }

    const product = products.find((p) => p.id === selectedProductId);

    setSaving(true);
    try {
      const payload = {
        product_name: product?.name,
        batch_size:   1,
        batch_unit:   'bag',
        ingredients: ingredients.map((i) => ({
          raw_material_id: i.raw_material_id,
          qty_required:    Number(i.quantity),
          unit:            i.unit,
        })),
      };

      const r = editingRecipeId
        ? await api.put(`/production/recipes/${editingRecipeId}`, payload)
        : await api.post('/production/recipes', payload);

      if (r.data.success) {
        toast.success(editingRecipeId ? 'Recipe updated.' : 'Recipe saved.');
        handleClear();
        loadRecipes();
      } else {
        toast.error(r.data.message || 'Failed to save recipe.');
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to save recipe.');
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (recipe) => {
    const product = products.find((p) => p.name?.trim().toLowerCase() === recipe.product_name?.trim().toLowerCase());
    setSelectedProductId(product?.id || '');
    setEditingRecipeId(recipe.id);
    setIngredients(rowsFromRecipe(recipe));
    window.scrollTo(0, 0);
  };

  const handleDelete = async (id, name) => {
    if (!window.confirm(`Delete recipe for "${name}"? Cannot be undone.`)) return;
    try {
      const r = await api.delete(`/production/recipes/${id}`);
      if (r.data.success) {
        toast.success('Recipe deleted.');
        if (editingRecipeId === id) handleClear();
        loadRecipes();
      }
    } catch (e) {
      toast.error('Failed to delete recipe.');
    }
  };

  return (
    <div className="p-6">
      <PageHeader
        title="Recipe Management"
        subtitle="Create product recipes — define raw materials and quantities per batch"
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">

        {/* ── LEFT — Create/Edit Recipe ── */}
        <div className="bg-white rounded-2xl shadow-card border border-gray-100 p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-bold text-navy flex items-center gap-1.5">
              <Plus size={16} /> {editingRecipeId ? 'Edit Recipe' : 'Create New Recipe'}
            </h2>
            {editingRecipeId && (
              <button onClick={handleClear} className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1">
                <X size={13} /> Cancel edit
              </button>
            )}
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Finished Product *</label>
              <select
                value={selectedProductId}
                onChange={handleProductSelect}
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-navy focus:border-navy bg-white"
              >
                <option value="">— Select Finished Product —</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
              {editingRecipeId && (
                <p className="text-xs text-navy/70 mt-1.5">Editing existing recipe — materials auto-filled below.</p>
              )}
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium text-gray-700">Raw Materials *</label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => addIngredientRow('select')}
                    className="text-xs font-semibold text-navy hover:underline flex items-center gap-1"
                  >
                    <ListPlus size={13} /> Select Material
                  </button>
                  <button
                    type="button"
                    onClick={() => addIngredientRow('input')}
                    className="text-xs font-semibold text-orange hover:underline flex items-center gap-1"
                  >
                    <PencilLine size={13} /> Add New Material
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                {ingredients.map((ing, index) => (
                  <div key={index} className="border border-gray-200 rounded-lg p-2.5">
                    {ing.isNew ? (
                      <div className="grid grid-cols-[1fr_70px_70px_32px] gap-2 items-center">
                        <input
                          type="text"
                          placeholder="Material name..."
                          value={ing.material_name}
                          onChange={(e) => updateRow(index, 'material_name', e.target.value)}
                          className="border border-gray-300 rounded-md px-2 py-1.5 text-sm"
                        />
                        <input
                          type="number"
                          min="0"
                          placeholder="Qty"
                          value={ing.quantity}
                          onChange={(e) => updateRow(index, 'quantity', e.target.value)}
                          className="border border-gray-300 rounded-md px-2 py-1.5 text-sm w-full"
                        />
                        <input
                          type="text"
                          placeholder="Unit"
                          value={ing.unit}
                          onChange={(e) => updateRow(index, 'unit', e.target.value)}
                          className="border border-gray-300 rounded-md px-2 py-1.5 text-sm w-full"
                        />
                        <button
                          onClick={() => removeRow(index)}
                          disabled={ingredients.length === 1}
                          className="w-8 h-8 flex items-center justify-center rounded-md text-red-600 hover:bg-red-50 disabled:opacity-30 disabled:cursor-not-allowed"
                        >
                          <X size={15} />
                        </button>
                      </div>
                    ) : (
                      <div className="grid grid-cols-[1fr_70px_60px_32px] gap-2 items-center">
                        <select
                          value={ing.raw_material_id}
                          onChange={(e) => updateRow(index, 'raw_material_id', e.target.value)}
                          className="border border-gray-300 rounded-md px-2 py-1.5 text-sm w-full bg-white"
                        >
                          <option value="">-- Select --</option>
                          {rawMaterials.map((m) => (
                            <option key={m.id} value={m.id}>{m.name} ({m.unit})</option>
                          ))}
                        </select>
                        <input
                          type="number"
                          min="0"
                          placeholder="Qty"
                          value={ing.quantity}
                          onChange={(e) => updateRow(index, 'quantity', e.target.value)}
                          className="border border-gray-300 rounded-md px-2 py-1.5 text-sm w-full"
                        />
                        <div className="text-center text-xs text-gray-500 bg-gray-50 rounded-md py-1.5">
                          {ing.unit || '—'}
                        </div>
                        <button
                          onClick={() => removeRow(index)}
                          disabled={ingredients.length === 1}
                          className="w-8 h-8 flex items-center justify-center rounded-md text-red-600 hover:bg-red-50 disabled:opacity-30 disabled:cursor-not-allowed"
                        >
                          <X size={15} />
                        </button>
                      </div>
                    )}

                    {ing.isNew && ing.material_name && (
                      <button
                        onClick={() => saveNewMaterial(index)}
                        disabled={savingRow === index}
                        className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 px-2.5 py-1.5 rounded-md"
                      >
                        <Save size={12} /> {savingRow === index ? 'Saving...' : 'Save Material'}
                      </button>
                    )}
                  </div>
                ))}
              </div>

              <div className="flex gap-2 mt-2">
                <button
                  type="button"
                  onClick={() => addIngredientRow('select')}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg border border-dashed border-navy text-navy text-xs font-semibold hover:bg-navy/5"
                >
                  <ListPlus size={13} /> Select Existing
                </button>
                <button
                  type="button"
                  onClick={() => addIngredientRow('input')}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg border border-dashed border-orange text-orange text-xs font-semibold hover:bg-orange/5"
                >
                  <PencilLine size={13} /> Add New
                </button>
              </div>
            </div>

            <Button
              variant="primary"
              onClick={handleSave}
              disabled={saving}
              className="w-full flex items-center justify-center gap-2"
            >
              <Save size={15} /> {saving ? 'Saving...' : editingRecipeId ? 'Update Recipe' : 'Save Recipe'}
            </Button>
          </div>
        </div>

        {/* ── RIGHT — Saved Recipes ── */}
        <div>
          <h2 className="text-base font-bold text-navy mb-3 flex items-center gap-1.5">
            <ClipboardList size={16} /> Saved Recipes ({recipes.length})
          </h2>

          {loading ? (
            <div className="text-center py-10 text-gray-400 text-sm">Loading...</div>
          ) : recipes.length === 0 ? (
            <EmptyState icon={FlaskConical} title="No recipes yet" subtitle="Create your first recipe on the left" />
          ) : (
            <div className="flex flex-col gap-4">
              {recipes.map((recipe) => (
                <div key={recipe.id} className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-card">
                  <div className="bg-navy px-4 py-3 flex justify-between items-center">
                    <div>
                      <p className="text-white font-bold text-sm">{recipe.product_name}</p>
                      <p className="text-blue-200 text-xs mt-0.5">{recipe.recipe_ingredients?.length || 0} materials</p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleEdit(recipe)}
                        className="flex items-center gap-1 text-xs font-semibold text-navy bg-white hover:bg-gray-100 px-2.5 py-1.5 rounded-md"
                      >
                        <PencilLine size={12} /> Edit
                      </button>
                      <button
                        onClick={() => handleDelete(recipe.id, recipe.product_name)}
                        className="flex items-center gap-1 text-xs font-semibold text-white bg-red-600 hover:bg-red-700 px-2.5 py-1.5 rounded-md"
                      >
                        <Trash2 size={12} /> Delete
                      </button>
                    </div>
                  </div>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 text-left text-gray-500">
                        <th className="px-4 py-2 text-xs font-semibold uppercase">#</th>
                        <th className="px-4 py-2 text-xs font-semibold uppercase">Raw Material</th>
                        <th className="px-4 py-2 text-xs font-semibold uppercase text-right">Qty Required</th>
                        <th className="px-4 py-2 text-xs font-semibold uppercase text-right">Unit</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recipe.recipe_ingredients?.map((ing, i) => (
                        <tr key={ing.id} className={`border-t border-gray-50 ${i % 2 === 1 ? 'bg-gray-50/60' : ''}`}>
                          <td className="px-4 py-2.5 text-gray-400">{i + 1}</td>
                          <td className="px-4 py-2.5 font-medium text-navy">{ing.raw_materials?.name}</td>
                          <td className="px-4 py-2.5 text-right font-bold text-navy">{ing.qty_required}</td>
                          <td className="px-4 py-2.5 text-right text-gray-500">{ing.unit}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
