import React, { useEffect, useState, useRef } from 'react';
import { Plus, Search, Package, Pencil, Trash2, Upload, X, Image } from 'lucide-react';
import api, { getCurrentUser } from '../services/api';
import Modal from '../components/Modal';
import Button from '../components/Button';
import PageHeader from '../components/PageHeader';
import EmptyState from '../components/EmptyState';
import { SkeletonTable } from '../components/Skeleton';
import { useToast } from '../components/Toast';

const EMPTY_FORM = {
  name: '',
  description: '',
  sku: '',
  price: '',
  stock_quantity: '',
  unit: '',
  category_id: '',
  image_url: ''
};

const PAGE_SIZE = 10;

export default function Products() {
  const toast      = useToast();
  const fileInputRef = useRef(null);
  const user = getCurrentUser();
  const isSuperAdmin = user?.role === 'super_admin';

  const [products, setProducts]     = useState([]);
  const [total, setTotal]           = useState(0);
  const [page, setPage]             = useState(1);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState('');
  const [search, setSearch]         = useState('');
  const [activeCategory, setActiveCategory] = useState('');
  const [showModal, setShowModal]   = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [form, setForm]             = useState(EMPTY_FORM);
  const [saving, setSaving]         = useState(false);
  const [imageFile, setImageFile]   = useState(null);
  const [imagePreview, setImagePreview] = useState('');
  const [uploading, setUploading]   = useState(false);
  const [categories, setCategories] = useState([]);
  const [branches, setBranches]     = useState([]);
  const [activeBranch, setActiveBranch] = useState(user?.companyId || '');

  useEffect(() => {
    if (isSuperAdmin) loadBranches();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    loadCategories();
    setActiveCategory('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeBranch]);

  useEffect(() => {
    loadProducts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, activeCategory, activeBranch]);

  const loadBranches = async () => {
    try {
      const res = await api.get('/companies');
      setBranches(res.data.data || []);
    } catch {
      // non-fatal — branch switcher just won't show options
    }
  };

  const loadCategories = async () => {
    try {
      const res = await api.get('/categories', {
        params: isSuperAdmin && activeBranch ? { company_id: activeBranch } : {}
      });
      setCategories(res.data.data || []);
    } catch {
      // non-fatal — form still works without category list
    }
  };

  const loadProducts = async (searchTerm = search) => {
    setLoading(true);
    setError('');
    try {
      const res = await api.get('/products', {
        params: {
          page,
          limit: PAGE_SIZE,
          ...(searchTerm ? { search: searchTerm } : {}),
          ...(activeCategory ? { category_id: activeCategory } : {}),
          ...(isSuperAdmin && activeBranch ? { company_id: activeBranch } : {})
        }
      });
      setProducts(res.data.data.products || []);
      setTotal(res.data.data.total || 0);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load products.');
    } finally {
      setLoading(false);
    }
  };

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    setPage(1);
    loadProducts(search);
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const openAddModal = () => {
    setEditingProduct(null);
    setForm(EMPTY_FORM);
    setImageFile(null);
    setImagePreview('');
    setShowModal(true);
  };

  const openEditModal = (product) => {
    setEditingProduct(product);
    setForm({
      name:           product.name || '',
      description:    product.description || '',
      sku:            product.sku || '',
      price:          product.price ?? '',
      stock_quantity: product.stock_quantity ?? '',
      unit:           product.unit || '',
      category_id:    product.category_id || '',
      image_url:      product.image_url || ''
    });
    setImageFile(null);
    setImagePreview(product.image_url || '');
    setShowModal(true);
  };

  const handleImageChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      toast.error('Only JPG, PNG, WEBP images are allowed.');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error('Image too large. Maximum size is 10MB.');
      return;
    }
    setImageFile(file);
    const reader = new FileReader();
    reader.onload = (ev) => setImagePreview(ev.target.result);
    reader.readAsDataURL(file);
  };

  const removeImage = () => {
    setImageFile(null);
    setImagePreview('');
    setForm((prev) => ({ ...prev, image_url: '' }));
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const uploadImage = async (file) => {
    const base64 = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload  = () => resolve(reader.result.split(',')[1]);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
    setUploading(true);
    try {
      const res = await api.post('/storage/upload', {
        bucket:      'product-images',
        fileName:    file.name,
        fileBase64:  base64,
        mimeType:    file.type
      });
      return res.data.data.url;
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!form.name || !form.price) {
      toast.error('Name and price are required.');
      return;
    }
    setSaving(true);

    let imageUrl = form.image_url;
    if (imageFile) {
      try {
        imageUrl = await uploadImage(imageFile);
      } catch (err) {
        toast.error(err.response?.data?.message || 'Image upload failed.');
        setSaving(false);
        return;
      }
    }

    const payload = {
      name:           form.name,
      description:    form.description,
      sku:            form.sku,
      price:          Number(form.price),
      stock_quantity: Number(form.stock_quantity) || 0,
      unit:           form.unit,
      ...(form.category_id ? { category_id: form.category_id } : {}),
      ...(imageUrl ? { image_url: imageUrl } : {}),
      // Only relevant on create — sends the new product to whichever
      // branch is currently selected instead of always super_admin's own.
      ...(!editingProduct && isSuperAdmin && activeBranch ? { company_id: activeBranch } : {})
    };

    try {
      if (editingProduct) {
        await api.put(`/products/${editingProduct.id}`, payload);
        toast.success('Product updated successfully.');
      } else {
        await api.post('/products', payload);
        toast.success('Product added successfully.');
      }
      setShowModal(false);
      loadProducts(search);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to save product.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (product) => {
    if (!window.confirm(`Delete "${product.name}"? This cannot be undone.`)) return;
    try {
      await api.delete(`/products/${product.id}`);
      toast.success('Product deleted.');
      loadProducts(search);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to delete product.');
    }
  };

  return (
    <div className="p-6">
      <PageHeader
        title="Products"
        subtitle="Manage your catalogue, pricing and stock"
        action={
          <Button variant="accent" onClick={openAddModal} className="flex items-center gap-2">
            <Plus size={16} /> Add Product
          </Button>
        }
      />

      {isSuperAdmin && branches.length > 0 && (
        <div className="mb-4 flex items-center gap-2">
          <label className="text-sm font-medium text-gray-600">Branch:</label>
          <select
            value={activeBranch}
            onChange={(e) => { setActiveBranch(e.target.value); setPage(1); }}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-navy-chip focus:border-navy bg-white"
          >
            {branches.map((b) => (
              <option key={b.id} value={b.id}>{b.name} ({b.city})</option>
            ))}
          </select>
        </div>
      )}

      <form onSubmit={handleSearchSubmit} className="mb-4 flex gap-2">
        <div className="relative w-full max-w-sm">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search products by name..."
            className="w-full border border-gray-300 rounded-lg pl-9 pr-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-navy-chip focus:border-navy transition-shadow"
          />
        </div>
        <Button type="submit" variant="primary">Search</Button>
      </form>

      {categories.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-6">
          <button
            onClick={() => { setActiveCategory(''); setPage(1); }}
            className={`px-3.5 py-1.5 rounded-full text-sm font-medium transition-colors ${
              !activeCategory ? 'bg-navy text-white' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
            }`}
          >
            All Products
          </button>
          {categories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => { setActiveCategory(cat.id); setPage(1); }}
              className={`px-3.5 py-1.5 rounded-full text-sm font-medium transition-colors ${
                activeCategory === cat.id ? 'bg-navy text-white' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
              }`}
            >
              {cat.name}
            </button>
          ))}
        </div>
      )}

      {error && (
        <div className="mb-6 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">
          {error}
        </div>
      )}

      <div className="bg-white rounded-2xl shadow-card border border-gray-100 overflow-hidden">
        {loading ? (
          <SkeletonTable rows={6} cols={6} />
        ) : products.length === 0 ? (
          <EmptyState
            icon={Package}
            title="No products found"
            subtitle="Try a different search or add a new product"
          />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-500 bg-gray-50 border-b border-gray-100">
                    <th className="px-4 py-3 font-semibold text-xs uppercase tracking-wide w-16">Image</th>
                    <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide">Product</th>
                    <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide">Category</th>
                    <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide">Price</th>
                    <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide">Stock</th>
                    <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide">Status</th>
                    <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {products.map((product, i) => (
                    <tr
                      key={product.id}
                      className={`border-b border-gray-50 last:border-0 hover:bg-gray-50/80 transition-colors ${
                        i % 2 === 1 ? 'bg-gray-50/40' : ''
                      }`}
                    >
                      <td className="px-4 py-3">
                        {product.image_url ? (
                          <img
                            src={product.image_url}
                            alt={product.name}
                            className="w-12 h-12 object-cover rounded-lg border border-gray-200"
                            onError={(e) => {
                              e.target.onerror = null;
                              e.target.style.display = 'none';
                            }}
                          />
                        ) : (
                          <div className="w-12 h-12 bg-gray-100 rounded-lg flex items-center justify-center">
                            <Package size={18} className="text-gray-400" />
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-3.5">
                        <p className="font-medium text-navy">{product.name}</p>
                        {product.sku && <p className="text-xs text-gray-400">SKU: {product.sku}</p>}
                      </td>
                      <td className="px-6 py-3.5 text-gray-600">{product.categories?.name || '—'}</td>
                      <td className="px-6 py-3.5 text-gray-600">
                        PKR {Number(product.price).toLocaleString()}
                      </td>
                      <td className="px-6 py-3.5 text-gray-600">
                        {product.stock_quantity}
                        {product.unit ? ` ${product.unit}` : ''}
                      </td>
                      <td className="px-6 py-3.5">
                        {Number(product.stock_quantity) > 0 ? (
                          <span className="inline-block px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 text-[11px] font-semibold">
                            In Stock
                          </span>
                        ) : (
                          <span className="inline-block px-2.5 py-1 rounded-full bg-red-50 text-red-600 text-[11px] font-semibold">
                            Out of Stock
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-3.5">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => openEditModal(product)}
                            className="p-2 rounded-lg text-navy hover:bg-navy/10 transition-colors"
                            title="Edit"
                          >
                            <Pencil size={15} />
                          </button>
                          <button
                            onClick={() => handleDelete(product)}
                            className="p-2 rounded-lg text-red-600 hover:bg-red-50 transition-colors"
                            title="Delete"
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="px-6 py-4 border-t border-gray-100 flex justify-between items-center flex-wrap gap-3">
              <span className="text-xs text-gray-400">
                Showing {(page - 1) * PAGE_SIZE + 1} to {Math.min(page * PAGE_SIZE, total)} of {total} entries
              </span>
              <div className="flex gap-1.5">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="px-3 py-1.5 border border-gray-200 rounded-md text-gray-500 text-sm hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Prev
                </button>
                {Array.from({ length: totalPages }).map((_, i) => (
                  <button
                    key={i}
                    onClick={() => setPage(i + 1)}
                    className={`px-3 py-1.5 rounded-md text-sm border ${
                      page === i + 1 ? 'bg-navy text-white border-navy' : 'border-gray-200 text-gray-500 hover:bg-gray-50'
                    }`}
                  >
                    {i + 1}
                  </button>
                ))}
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="px-3 py-1.5 border border-gray-200 rounded-md text-gray-500 text-sm hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Next
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {showModal && (
        <Modal
          title={editingProduct ? 'Edit Product' : 'Add Product'}
          onClose={() => setShowModal(false)}
        >
          <form onSubmit={handleSave} className="space-y-4">

            {!editingProduct && isSuperAdmin && activeBranch && (
              <div className="bg-navy-chip/40 border border-navy-chip rounded-lg px-3.5 py-2 text-xs text-navy">
                Adding to: <strong>{branches.find((b) => b.id === activeBranch)?.name || 'selected branch'}</strong>
              </div>
            )}

            {/* ── IMAGE UPLOAD ── */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Product Image
              </label>
              {imagePreview ? (
                <div className="relative w-full h-48 rounded-xl overflow-hidden border border-gray-200 bg-gray-50">
                  <img
                    src={imagePreview}
                    alt="Preview"
                    className="w-full h-full object-contain"
                  />
                  <button
                    type="button"
                    onClick={removeImage}
                    className="absolute top-2 right-2 bg-red-500 text-white rounded-full p-1 hover:bg-red-600 transition-colors shadow-md"
                  >
                    <X size={14} />
                  </button>
                </div>
              ) : (
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full h-36 border-2 border-dashed border-gray-300 rounded-xl flex flex-col items-center justify-center cursor-pointer hover:border-navy hover:bg-navy/5 transition-colors"
                >
                  <Image size={30} className="text-gray-400 mb-2" />
                  <p className="text-sm font-medium text-gray-500">Click to upload product image</p>
                  <p className="text-xs text-gray-400 mt-1">JPG, PNG, WEBP — max 10MB</p>
                </div>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={handleImageChange}
                className="hidden"
              />
              {!imagePreview && (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="mt-2 flex items-center gap-1.5 text-xs text-navy hover:underline"
                >
                  <Upload size={12} /> Choose file
                </button>
              )}
            </div>

            {/* ── NAME ── */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Name *</label>
              <input
                type="text"
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-navy focus:border-navy transition-shadow"
              />
            </div>

            {/* ── DESCRIPTION ── */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Description</label>
              <textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-navy focus:border-navy transition-shadow"
                rows={2}
              />
            </div>

            {/* ── CATEGORY ── */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Category</label>
              <select
                value={form.category_id}
                onChange={(e) => setForm({ ...form, category_id: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-navy focus:border-navy transition-shadow bg-white"
              >
                <option value="">— No Category —</option>
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.id}>{cat.name}</option>
                ))}
              </select>
            </div>

            {/* ── PRICE + STOCK ── */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Price (PKR) *</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  required
                  value={form.price}
                  onChange={(e) => setForm({ ...form, price: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-navy focus:border-navy transition-shadow"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Stock Quantity</label>
                <input
                  type="number"
                  min="0"
                  value={form.stock_quantity}
                  onChange={(e) => setForm({ ...form, stock_quantity: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-navy focus:border-navy transition-shadow"
                />
              </div>
            </div>

            {/* ── SKU + UNIT ── */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">SKU</label>
                <input
                  type="text"
                  value={form.sku}
                  onChange={(e) => setForm({ ...form, sku: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-navy focus:border-navy transition-shadow"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Unit</label>
                <input
                  type="text"
                  placeholder="e.g. bag, kg, litre"
                  value={form.unit}
                  onChange={(e) => setForm({ ...form, unit: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-navy focus:border-navy transition-shadow"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <Button type="button" variant="secondary" onClick={() => setShowModal(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="accent" disabled={saving || uploading}>
                {uploading ? 'Uploading image...' : saving ? 'Saving...' : 'Save Product'}
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
