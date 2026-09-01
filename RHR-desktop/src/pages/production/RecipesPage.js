import { useState, useEffect } from 'react';
import api from '../../services/api';

export default function RecipesPage() {

  // ── STATE ──
  const [productName,  setProductName]  = useState('');
  const [ingredients,  setIngredients]  = useState([
    { raw_material_id: '', qty_required: '', unit: '' }
  ]);
  const [rawMaterials, setRawMaterials] = useState([]);
  const [recipes,      setRecipes]      = useState([]);
  const [saving,       setSaving]       = useState(false);
  const [loading,      setLoading]      = useState(true);

  useEffect(() => {
    loadRawMaterials();
    loadRecipes();
  }, []);

  // Load raw materials for dropdown
  const loadRawMaterials = async () => {
    try {
      const r = await api.get('/production/materials');
      if (r.data.success) setRawMaterials(r.data.data || []);
    } catch (e) {
      console.error('Failed to load raw materials');
    }
  };

  // Load saved recipes
  const loadRecipes = async () => {
    try {
      setLoading(true);
      const r = await api.get('/production/recipes');
      if (r.data.success) setRecipes(r.data.data || []);
    } catch (e) {
      console.error('Failed to load recipes');
    } finally {
      setLoading(false);
    }
  };

  // Add new ingredient row
  const addRow = () => {
    setIngredients([...ingredients,
      { raw_material_id: '', qty_required: '', unit: '' }
    ]);
  };

  // Remove ingredient row
  const removeRow = (index) => {
    if (ingredients.length === 1) return;
    setIngredients(ingredients.filter((_, i) => i !== index));
  };

  // Update ingredient field
  const updateRow = (index, field, value) => {
    const updated = [...ingredients];
    updated[index][field] = value;
    // Auto fill unit when material selected
    if (field === 'raw_material_id') {
      const mat = rawMaterials.find(m => m.id === value);
      if (mat) updated[index].unit = mat.unit || 'kg';
    }
    setIngredients(updated);
  };

  // Save recipe
  const handleSave = async () => {
    if (!productName.trim())
      return alert('Please enter product name');
    if (ingredients.some(i => !i.raw_material_id || !i.qty_required))
      return alert('All ingredient rows must be complete');

    setSaving(true);
    try {
      const r = await api.post('/production/recipes', {
        recipe_name:      productName.trim(),
        product_name:     productName.trim(),
        batch_size:       1,
        batch_unit:       'bag',
        ingredients: ingredients.map(i => ({
          raw_material_id: i.raw_material_id,
          qty_required:    Number(i.qty_required),
          unit:            i.unit,
        }))
      });

      if (r.data.success) {
        alert('✅ Recipe saved!');
        setProductName('');
        setIngredients([{ raw_material_id: '', qty_required: '', unit: '' }]);
        loadRecipes();
      } else {
        alert('Error: ' + r.data.message);
      }
    } catch (e) {
      alert('Connection error');
    } finally {
      setSaving(false);
    }
  };

  // Delete recipe
  const handleDelete = async (id, name) => {
    if (!window.confirm(`Delete recipe for "${name}"? Cannot be undone.`))
      return;
    try {
      const r = await api.delete(`/production/recipes/${id}`);
      if (r.data.success) {
        alert('Recipe deleted');
        loadRecipes();
      }
    } catch (e) {
      alert('Error deleting recipe');
    }
  };

  return (
    <div style={{ padding: '24px' }}>

      {/* PAGE HEADER */}
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: '24px', fontWeight: '700',
          color: '#1B2E6B', marginBottom: '4px' }}>
          Recipe Management
        </h1>
        <p style={{ color: '#6B7280', fontSize: '14px' }}>
          Create product recipes — define raw materials and quantities per batch
        </p>
      </div>

      {/* TWO COLUMN LAYOUT */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr',
        gap: '24px', alignItems: 'start' }}>

        {/* ── LEFT COLUMN — CREATE FORM ── */}
        <div style={{ background: 'white', borderRadius: '12px',
          border: '1px solid #E5E7EB', padding: '24px' }}>

          <h2 style={{ fontSize: '16px', fontWeight: '700',
            color: '#1B2E6B', marginBottom: '20px' }}>
            ➕ Create New Recipe
          </h2>

          {/* Product Name Input */}
          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', fontSize: '13px',
              fontWeight: '600', color: '#374151', marginBottom: '6px' }}>
              Product Name *
            </label>
            <input
              type="text"
              value={productName}
              onChange={e => setProductName(e.target.value)}
              placeholder="e.g. ReadyMix Tile Bond 150%"
              style={{
                width: '100%', padding: '10px 12px',
                border: '1px solid #D1D5DB', borderRadius: '8px',
                fontSize: '14px', outline: 'none',
                boxSizing: 'border-box'
              }}
            />
          </div>

          {/* Ingredients Section */}
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', fontSize: '13px',
              fontWeight: '600', color: '#374151', marginBottom: '12px' }}>
              Raw Materials *
            </label>

            {/* Table Header */}
            <div style={{ display: 'grid',
              gridTemplateColumns: '1fr 100px 60px 32px',
              gap: '8px', marginBottom: '8px' }}>
              <span style={{ fontSize: '12px', fontWeight: '600',
                color: '#6B7280' }}>MATERIAL</span>
              <span style={{ fontSize: '12px', fontWeight: '600',
                color: '#6B7280' }}>QTY</span>
              <span style={{ fontSize: '12px', fontWeight: '600',
                color: '#6B7280' }}>UNIT</span>
              <span></span>
            </div>

            {/* Ingredient Rows */}
            {ingredients.map((ing, index) => (
              <div key={index} style={{ display: 'grid',
                gridTemplateColumns: '1fr 100px 60px 32px',
                gap: '8px', marginBottom: '8px', alignItems: 'center' }}>

                {/* Material Dropdown */}
                <select
                  value={ing.raw_material_id}
                  onChange={e => updateRow(index, 'raw_material_id', e.target.value)}
                  style={{ padding: '8px', border: '1px solid #D1D5DB',
                    borderRadius: '6px', fontSize: '13px', width: '100%' }}
                >
                  <option value="">-- Select --</option>
                  {rawMaterials.map(mat => (
                    <option key={mat.id} value={mat.id}>
                      {mat.name}
                    </option>
                  ))}
                </select>

                {/* Qty Input */}
                <input
                  type="number"
                  value={ing.qty_required}
                  onChange={e => updateRow(index, 'qty_required', e.target.value)}
                  placeholder="0"
                  min="0"
                  style={{ padding: '8px', border: '1px solid #D1D5DB',
                    borderRadius: '6px', fontSize: '13px', width: '100%' }}
                />

                {/* Unit Display */}
                <div style={{ padding: '8px', background: '#F3F4F6',
                  borderRadius: '6px', fontSize: '12px',
                  color: '#6B7280', textAlign: 'center' }}>
                  {ing.unit || '—'}
                </div>

                {/* Remove Button */}
                <button
                  onClick={() => removeRow(index)}
                  disabled={ingredients.length === 1}
                  style={{
                    width: '32px', height: '32px',
                    background: ingredients.length === 1 ? '#F3F4F6' : '#FEE2E2',
                    color: ingredients.length === 1 ? '#9CA3AF' : '#DC2626',
                    border: 'none', borderRadius: '6px',
                    cursor: ingredients.length === 1 ? 'not-allowed' : 'pointer',
                    fontSize: '16px', fontWeight: '700'
                  }}
                >
                  ×
                </button>
              </div>
            ))}

            {/* Add Material Button */}
            <button
              onClick={addRow}
              style={{
                marginTop: '8px', padding: '8px 16px',
                background: 'white', color: '#E8841A',
                border: '1px dashed #E8841A', borderRadius: '8px',
                fontSize: '13px', fontWeight: '600', cursor: 'pointer',
                width: '100%'
              }}
            >
              + Add Material
            </button>
          </div>

          {/* Save Button */}
          <button
            onClick={handleSave}
            disabled={saving}
            style={{
              width: '100%', padding: '12px',
              background: saving ? '#9CA3AF' : '#1B2E6B',
              color: 'white', border: 'none',
              borderRadius: '8px', fontSize: '14px',
              fontWeight: '700', cursor: saving ? 'not-allowed' : 'pointer',
              marginTop: '8px'
            }}
          >
            {saving ? 'Saving...' : '💾 Save Recipe'}
          </button>
        </div>

        {/* ── RIGHT COLUMN — SAVED RECIPES ── */}
        <div>
          <h2 style={{ fontSize: '16px', fontWeight: '700',
            color: '#1B2E6B', marginBottom: '16px' }}>
            📋 Saved Recipes ({recipes.length})
          </h2>

          {loading ? (
            <div style={{ textAlign: 'center', padding: '40px',
              color: '#6B7280' }}>Loading...</div>
          ) : recipes.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px',
              background: 'white', borderRadius: '12px',
              border: '1px solid #E5E7EB' }}>
              <div style={{ fontSize: '48px', marginBottom: '12px' }}>📋</div>
              <p style={{ color: '#6B7280', fontSize: '14px' }}>
                No recipes yet. Create your first recipe.
              </p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {recipes.map(recipe => (
                <div key={recipe.id} style={{
                  background: 'white', borderRadius: '12px',
                  border: '1px solid #E5E7EB', overflow: 'hidden'
                }}>

                  {/* Recipe Card Header */}
                  <div style={{
                    background: '#1B2E6B', padding: '12px 16px',
                    display: 'flex', justifyContent: 'space-between',
                    alignItems: 'center'
                  }}>
                    <div>
                      <div style={{ color: 'white', fontWeight: '700',
                        fontSize: '15px' }}>
                        {recipe.recipe_name || recipe.product_name}
                      </div>
                      <div style={{ color: '#BDD7EE', fontSize: '12px',
                        marginTop: '2px' }}>
                        {recipe.recipe_ingredients?.length || 0} materials
                      </div>
                    </div>
                    <button
                      onClick={() => handleDelete(
                        recipe.id,
                        recipe.recipe_name || recipe.product_name
                      )}
                      style={{
                        background: '#C0392B', color: 'white',
                        border: 'none', borderRadius: '6px',
                        padding: '6px 12px', fontSize: '12px',
                        fontWeight: '600', cursor: 'pointer'
                      }}
                    >
                      🗑️ Delete
                    </button>
                  </div>

                  {/* Ingredients Table */}
                  <table style={{ width: '100%',
                    borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ background: '#F9FAFB' }}>
                        <th style={{ padding: '8px 16px', textAlign: 'left',
                          fontSize: '11px', fontWeight: '700',
                          color: '#6B7280', textTransform: 'uppercase' }}>
                          #
                        </th>
                        <th style={{ padding: '8px 16px', textAlign: 'left',
                          fontSize: '11px', fontWeight: '700',
                          color: '#6B7280', textTransform: 'uppercase' }}>
                          Raw Material
                        </th>
                        <th style={{ padding: '8px 16px', textAlign: 'right',
                          fontSize: '11px', fontWeight: '700',
                          color: '#6B7280', textTransform: 'uppercase' }}>
                          Qty Required
                        </th>
                        <th style={{ padding: '8px 16px', textAlign: 'right',
                          fontSize: '11px', fontWeight: '700',
                          color: '#6B7280', textTransform: 'uppercase' }}>
                          Unit
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {recipe.recipe_ingredients?.map((ing, i) => (
                        <tr key={ing.id}
                          style={{ borderTop: '1px solid #F3F4F6',
                            background: i % 2 === 0 ? 'white' : '#FAFAFA' }}>
                          <td style={{ padding: '10px 16px',
                            fontSize: '13px', color: '#9CA3AF' }}>
                            {i + 1}
                          </td>
                          <td style={{ padding: '10px 16px',
                            fontSize: '13px', color: '#1F2937',
                            fontWeight: '500' }}>
                            {ing.raw_materials?.name || ing.ingredient_name}
                          </td>
                          <td style={{ padding: '10px 16px',
                            fontSize: '13px', color: '#1B2E6B',
                            fontWeight: '700', textAlign: 'right' }}>
                            {ing.qty_required}
                          </td>
                          <td style={{ padding: '10px 16px',
                            fontSize: '13px', color: '#6B7280',
                            textAlign: 'right' }}>
                            {ing.unit}
                          </td>
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
