import React, { useEffect, useState } from 'react';
import { Users, UserCheck, BookOpen, Search, Phone, Mail, AlertTriangle, User, Tag, DollarSign, RotateCcw, Plus, Pencil, Trash2, MapPin, ChevronDown, ChevronUp, IdCard, Calendar } from 'lucide-react';
import api, { getCurrentUser } from '../services/api';
import Button from '../components/Button';
import Modal from '../components/Modal';
import EmptyState from '../components/EmptyState';
import { SkeletonTable } from '../components/Skeleton';
import { useToast } from '../components/Toast';
import CityFilter from '../components/CityFilter';
import { fetchAllCities } from '../utils/multiCityFetch';

const RATE_TIERS = [
  { value: 'manual', label: 'Standard Rate', desc: 'Original price' },
  { value: 'discount', label: 'Discount Rate', desc: 'Price − PKR 10' },
  { value: 'premium', label: 'Premium Rate', desc: 'Price + PKR 10' }
];

const RATE_BADGE = {
  manual:   { label: 'Standard', classes: 'bg-navy-chip text-navy' },
  discount: { label: 'Discount', classes: 'bg-emerald-50 text-emerald-700' },
  premium:  { label: 'Premium',  classes: 'bg-orange/10 text-orange' }
};

// New customers created while "All Cities" is selected land in Karachi —
// same default the Products/Raw Materials pages use, since there's no
// single real branch a "combined view" create action could target.
const KARACHI_COMPANY_ID = '1e5962c6-33a7-460b-913e-9e08db46973a';
const EMPTY_CUSTOMER_FORM = { full_name: '', phone: '', email: '', shop_name: '', shop_address: '', city: '', area: '', rate_tier: 'manual', salesman_id: '', opening_balance_amount: '', shop_latitude: null, shop_longitude: null };

// customerForm.phone holds ONLY the local 10-digit subscriber number
// (no country code, no leading 0) — the Phone field shows a fixed "+92"
// prefix so an admin can't type a number the backend's own normalizer
// doesn't recognize. This is what let a customer the admin added end up
// as a second, duplicate account once that same person opened the app
// and logged in with their real number: the admin-side form took
// whatever was typed as a flat string (e.g. a copy-pasted "3212211069"
// with no leading 0), which the old normalizer didn't convert to
// "+923212211069" — so the self-registration flow's existing-phone
// lookup never matched it. toApiPhone always sends a properly
// country-coded number now, no matter what the admin types.
const localPhoneDigits = (raw) => {
  let digits = String(raw || '').replace(/\D/g, '');
  if (digits.startsWith('92')) digits = digits.slice(2);
  else if (digits.startsWith('0')) digits = digits.slice(1);
  return digits.slice(0, 10);
};
const toApiPhone = (localDigits) => (localDigits ? '92' + localDigits : '');

// Compares the price inputs against the saved custom prices: a non-empty
// input that differs is an upsert, a cleared input that had a saved price
// is a delete. `invalid` is true if any edited row holds a bad number.
function diffCustomPrices(rows, inputs) {
  const upserts = [];
  const deletes = [];
  let invalid = false;
  for (const row of rows) {
    const raw = inputs[row.product_id];
    const saved = row.custom_price !== null && row.custom_price !== undefined ? Number(row.custom_price) : null;
    if (raw === '' || raw === null || raw === undefined) {
      if (saved !== null) deletes.push(row.product_id);
      continue;
    }
    const price = Number(raw);
    if (!Number.isFinite(price) || price < 0) { invalid = true; continue; }
    if (price !== saved) upserts.push({ productId: row.product_id, price });
  }
  return { upserts, deletes, invalid };
}

async function applyCustomPriceChanges(customerId, { upserts, deletes }) {
  await Promise.all([
    ...upserts.map((u) => api.put(`/customers/${customerId}/pricing/${u.productId}`, { price: u.price })),
    ...deletes.map((productId) => api.delete(`/customers/${customerId}/pricing/${productId}`)),
  ]);
}

const PAGE_SIZE = 10;

function getInitials(name) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  const initials = parts.length > 1 ? parts[0][0] + parts[1][0] : parts[0].slice(0, 2);
  return initials.toUpperCase();
}

function timeAgo(dateStr) {
  const diffMs = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins} min${mins > 1 ? 's' : ''} ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hr${hrs > 1 ? 's' : ''} ago`;
  const days = Math.floor(hrs / 24);
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;
  return new Date(dateStr).toLocaleDateString('en-GB');
}

function filterCustomers(list, term) {
  if (!term.trim()) return list;
  const q = term.trim().toLowerCase();
  return list.filter(
    (c) =>
      c.full_name?.toLowerCase().includes(q) ||
      c.phone?.toLowerCase().includes(q) ||
      c.email?.toLowerCase().includes(q) ||
      c.shop_name?.toLowerCase().includes(q)
  );
}

export default function Customers({ onViewLedger, autoOpenCreate }) {
  const toast = useToast();
  const user = getCurrentUser();
  const defaultCity = user?.role === 'super_admin' ? '1e5962c6-33a7-460b-913e-9e08db46973a' : user?.companyId; // KHI default
  const [selectedCity, setSelectedCity] = useState(defaultCity);
  const [tab, setTab] = useState('pending');
  const [pending, setPending] = useState([]);
  const [all, setAll] = useState([]);
  const [ordersByCustomer, setOrdersByCustomer] = useState({});
  const [salesmenList, setSalesmenList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [approvingId, setApprovingId] = useState(null);
  const [approvingCustomer, setApprovingCustomer] = useState(null);
  const [approveRateTier, setApproveRateTier] = useState('manual');
  const [approveCreditLimit, setApproveCreditLimit] = useState('');
  // 3-step approval wizard — step 1 (details/salesman/credit/opening
  // balance) and step 3 (read-only review) are staged locally and only
  // committed on the final Approve click, so cancelling mid-wizard
  // never leaves a half-configured unapproved customer. Step 2's
  // product pricing saves as you go (same proven endpoint the
  // standalone Pricing modal already uses) — harmless either way since
  // an unapproved customer can't log in to be affected by it yet.
  const [wizardStep, setWizardStep] = useState(1);
  const [approveOpeningBalance, setApproveOpeningBalance] = useState('');
  const [approveSalesmanId, setApproveSalesmanId] = useState('');
  const [wizardPricingRows, setWizardPricingRows] = useState([]);
  const [wizardPricingLoading, setWizardPricingLoading] = useState(false);
  const [wizardPricingSearch, setWizardPricingSearch] = useState('');
  const [wizardPriceInputs, setWizardPriceInputs] = useState({});
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [filterCity, setFilterCity] = useState('');
  const [filterArea, setFilterArea] = useState('');
  const [filterSalesman, setFilterSalesman] = useState('');
  const [expandedCustomerId, setExpandedCustomerId] = useState(null);
  // Add Customer is also a 3-step wizard (Edit stays single-page, as
  // before) — step 2's custom prices are staged locally only, since the
  // customer doesn't exist yet to attach customer_product_prices rows
  // to; they're written right after the customer is actually created in
  // step 3's final submit.
  const [addStep, setAddStep] = useState(1);
  const [addProducts, setAddProducts] = useState([]);
  const [loadingAddProducts, setLoadingAddProducts] = useState(false);
  const [addProductSearch, setAddProductSearch] = useState('');
  const [addCustomPrices, setAddCustomPrices] = useState({});

  // "Customer Information" tab — super_admin only, every city. Reuses the
  // same `all` list already loaded for the All Customers tab.
  const [infoSearch, setInfoSearch] = useState('');
  const [downloadingInfoId, setDownloadingInfoId] = useState(null);

  // Outstanding balance per customer — fetched lazily, only for the rows
  // actually visible on the current page (avoids an N+1 ledger call for
  // every customer in the company on every page load).
  const [outstandingMap, setOutstandingMap] = useState({});
  const [outstandingLoading, setOutstandingLoading] = useState({});

  useEffect(() => {
    loadCustomers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCity]);

  const loadCustomers = async () => {
    setLoading(true);
    setError('');
    try {
      const companyFilter = selectedCity === 'all' ? null : selectedCity;
      const params = { company_id: companyFilter };
      const [pendingData, allData, ordersData, salesmenData] = companyFilter
        ? await Promise.all([
            api.get('/customers/pending', { params }).then((r) => r.data.data || []),
            api.get('/customers', { params }).then((r) => r.data.data || []),
            api.get('/orders', { params }).then((r) => r.data.data || []),
            api.get('/salesmen', { params }).then((r) => r.data.data || [])
          ])
        : await Promise.all([
            fetchAllCities('/customers/pending'),
            fetchAllCities('/customers'),
            fetchAllCities('/orders'),
            fetchAllCities('/salesmen')
          ]);
      setPending(pendingData);
      setAll(allData);
      setSalesmenList(salesmenData);

      const counts = {};
      ordersData.forEach((o) => {
        if (o.customer_id) counts[o.customer_id] = (counts[o.customer_id] || 0) + 1;
      });
      setOrdersByCustomer(counts);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load customers.');
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (customer) => {
    setApprovingCustomer(customer);
    setWizardStep(1);
    setApproveRateTier('manual');
    setApproveCreditLimit('');
    setApproveOpeningBalance('');
    setApproveSalesmanId('');
    setWizardPricingSearch('');
    setWizardPricingLoading(true);
    try {
      const res = await api.get(`/customers/${customer.id}/pricing`);
      const rows = res.data.data || [];
      setWizardPricingRows(rows);
      setWizardPriceInputs(Object.fromEntries(rows.map((r) => [r.product_id, r.custom_price ?? ''])));
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to load products.');
      setWizardPricingRows([]);
    } finally {
      setWizardPricingLoading(false);
    }
  };

  const closeWizard = () => {
    setApprovingCustomer(null);
    setWizardStep(1);
  };

  // Prices typed in step 2 that will be written on Approve — what the
  // Review step lists, so it matches exactly what gets saved.
  const wizardStagedPrices = wizardPricingRows
    .filter((r) => {
      const v = wizardPriceInputs[r.product_id];
      return v !== '' && v !== null && v !== undefined && Number(v) >= 0;
    })
    .map((r) => ({ product_id: r.product_id, name: r.name, price: Number(wizardPriceInputs[r.product_id]) }));

  const visibleWizardPricingRows = wizardPricingSearch.trim()
    ? wizardPricingRows.filter((r) =>
        r.name.toLowerCase().includes(wizardPricingSearch.trim().toLowerCase()) ||
        (r.category || '').toLowerCase().includes(wizardPricingSearch.trim().toLowerCase())
      )
    : wizardPricingRows;

  // Final step — everything collected across steps 1-2 lands on the
  // server here in one go: approve + rate tier + credit limit, assign
  // salesman (if picked), log an opening balance (if entered), and write
  // the custom product prices staged in step 2.
  const confirmApprove = async () => {
    const customer = approvingCustomer;
    const { upserts, deletes, invalid } = diffCustomPrices(wizardPricingRows, wizardPriceInputs);
    if (invalid) {
      toast.error('One of the custom prices is invalid — go back to the Pricing step and fix it.');
      return;
    }
    setApprovingId(customer.id);
    try {
      await applyCustomPriceChanges(customer.id, { upserts, deletes });
      await api.patch(`/auth/approve-customer/${customer.id}`, {
        rate_tier: approveRateTier,
        credit_limit: approveCreditLimit === '' ? null : Number(approveCreditLimit),
      });
      if (approveSalesmanId) {
        await api.patch(`/customers/${customer.id}/assign-salesman`, { salesman_id: approveSalesmanId });
      }
      if (approveOpeningBalance !== '' && Number(approveOpeningBalance) > 0) {
        await api.post('/opening-balances', {
          entity_type: 'customer',
          entity_id: customer.id,
          entity_name: customer.full_name,
          balance_type: 'debit',
          amount: Number(approveOpeningBalance),
          notes: 'Opening balance set during approval',
        });
      }
      setPending((prev) => prev.filter((c) => c.id !== customer.id));
      toast.success(`${customer.full_name} approved.`);
      loadCustomers();
      closeWizard();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to approve customer.');
    } finally {
      setApprovingId(null);
    }
  };

  const handleChangeCreditLimit = async (customer, creditLimit) => {
    try {
      await api.patch(`/customers/${customer.id}/credit-limit`, { credit_limit: creditLimit === '' ? null : Number(creditLimit) });
      setAll((prev) => prev.map((c) => (c.id === customer.id ? { ...c, credit_limit: creditLimit === '' ? null : Number(creditLimit) } : c)));
      toast.success(`${customer.full_name}'s credit limit updated.`);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to update credit limit.');
    }
  };

  const handleChangeRateTier = async (customer, rateTier) => {
    if (rateTier === (customer.rate_tier || 'manual')) return;
    try {
      await api.patch(`/customers/${customer.id}/rate-tier`, { rate_tier: rateTier });
      setAll((prev) => prev.map((c) => (c.id === customer.id ? { ...c, rate_tier: rateTier } : c)));
      toast.success(`${customer.full_name}'s rate tier updated.`);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to update rate tier.');
    }
  };

  const handleAssignSalesman = async (customer, salesmanId) => {
    if (salesmanId === (customer.salesman_id || '')) return;
    try {
      await api.patch(`/customers/${customer.id}/assign-salesman`, { salesman_id: salesmanId || null });
      setAll((prev) => prev.map((c) => (c.id === customer.id ? { ...c, salesman_id: salesmanId || null } : c)));
      toast.success(salesmanId ? 'Salesman assigned.' : 'Salesman unassigned.');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to assign salesman.');
    }
  };

  // Double confirmation — this permanently erases the customer and their
  // ledger, orders and payments from the database, so it's deliberately
  // harder to do by accident than a normal action.
  const handleDeleteCustomer = async (customer) => {
    const first = window.confirm(
      `Delete customer "${customer.full_name}" permanently?\n\n` +
      `This erases their account, login, ledger, orders, payments and custom prices from the database.`
    );
    if (!first) return;

    const second = window.confirm(
      `⚠️ FINAL WARNING\n\n` +
      `"${customer.full_name}" and ALL their records will be deleted for good.\n\n` +
      `This CANNOT be undone. Delete anyway?`
    );
    if (!second) return;

    try {
      await api.delete(`/customers/${customer.id}`);
      toast.success('Customer deleted permanently.');
      loadCustomers();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to delete customer.');
    }
  };

  const [pricingCustomer, setPricingCustomer] = useState(null);
  const [pricingRows, setPricingRows] = useState([]);
  const [pricingLoading, setPricingLoading] = useState(false);
  const [pricingSearch, setPricingSearch] = useState('');
  const [priceInputs, setPriceInputs] = useState({});
  const [savingPrices, setSavingPrices] = useState(false);

  const openPricingModal = async (customer) => {
    setPricingCustomer(customer);
    setPricingSearch('');
    setPricingLoading(true);
    try {
      const res = await api.get(`/customers/${customer.id}/pricing`);
      const rows = res.data.data || [];
      setPricingRows(rows);
      setPriceInputs(Object.fromEntries(rows.map((r) => [r.product_id, r.custom_price ?? ''])));
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to load pricing.');
      setPricingRows([]);
    } finally {
      setPricingLoading(false);
    }
  };

  // One Save for the whole list — writes every price that differs from
  // what's stored (set/changed -> PUT, cleared -> DELETE).
  const handleSaveAllPrices = async () => {
    const { upserts, deletes, invalid } = diffCustomPrices(pricingRows, priceInputs);
    if (invalid) {
      toast.error('Enter a valid price (0 or more) in every edited row.');
      return;
    }
    if (upserts.length === 0 && deletes.length === 0) {
      toast.success('No price changes to save.');
      return;
    }
    setSavingPrices(true);
    try {
      await applyCustomPriceChanges(pricingCustomer.id, { upserts, deletes });
      setPricingRows((prev) => prev.map((r) => {
        const up = upserts.find((u) => u.productId === r.product_id);
        if (up) return { ...r, custom_price: up.price };
        if (deletes.includes(r.product_id)) return { ...r, custom_price: null };
        return r;
      }));
      toast.success('Prices saved.');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to save prices.');
    } finally {
      setSavingPrices(false);
    }
  };

  const visiblePricingRows = pricingSearch.trim()
    ? pricingRows.filter((r) => r.name.toLowerCase().includes(pricingSearch.trim().toLowerCase()))
    : pricingRows;

  const [showCustomerModal, setShowCustomerModal] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState(null);
  const [customerForm, setCustomerForm] = useState(EMPTY_CUSTOMER_FORM);
  const [savingCustomer, setSavingCustomer] = useState(false);
  const [locatingMe, setLocatingMe] = useState(false);
  const [locationSearch, setLocationSearch] = useState('');
  const [locationResults, setLocationResults] = useState([]);
  const [searchingLocation, setSearchingLocation] = useState(false);

  const handleUseCurrentLocation = () => {
    if (!navigator.geolocation) {
      toast.error('Location isn\'t available in this browser.');
      return;
    }
    setLocatingMe(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCustomerForm((prev) => ({ ...prev, shop_latitude: pos.coords.latitude, shop_longitude: pos.coords.longitude }));
        setLocatingMe(false);
        toast.success('Current location captured.');
      },
      () => {
        setLocatingMe(false);
        toast.error('Could not get your location — check browser permission.');
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const handleSearchLocation = async () => {
    if (locationSearch.trim().length < 3) {
      toast.error('Type at least 3 characters to search.');
      return;
    }
    setSearchingLocation(true);
    try {
      const res = await api.get('/geocode/search', { params: { q: locationSearch.trim() } });
      setLocationResults(res.data?.data || []);
    } catch (err) {
      toast.error('Search failed.');
    } finally {
      setSearchingLocation(false);
    }
  };

  const handlePickLocationResult = (result) => {
    setCustomerForm((prev) => ({
      ...prev,
      shop_latitude: result.latitude,
      shop_longitude: result.longitude,
      shop_address: prev.shop_address || result.display_name
    }));
    setLocationResults([]);
    setLocationSearch('');
  };

  const openAddCustomerModal = () => {
    setEditingCustomer(null);
    setCustomerForm(EMPTY_CUSTOMER_FORM);
    setAddStep(1);
    setAddCustomPrices({});
    setAddProductSearch('');
    setShowCustomerModal(true);
  };

  const goToAddPricingStep = async () => {
    if (!customerForm.full_name || !customerForm.phone) {
      toast.error('Full name and phone are required.');
      return;
    }
    setAddStep(2);
    if (addProducts.length > 0) return;
    setLoadingAddProducts(true);
    try {
      const targetCompanyId = selectedCity === 'all' ? KARACHI_COMPANY_ID : selectedCity;
      const res = await api.get('/products', { params: { company_id: targetCompanyId, limit: 500 } });
      setAddProducts(res.data.data?.products || []);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to load products.');
    } finally {
      setLoadingAddProducts(false);
    }
  };

  const visibleAddProducts = addProductSearch.trim()
    ? addProducts.filter((p) =>
        p.name.toLowerCase().includes(addProductSearch.trim().toLowerCase()) ||
        (p.categories?.name || '').toLowerCase().includes(addProductSearch.trim().toLowerCase())
      )
    : addProducts;

  // Runs the normal create-customer flow, then applies whatever custom
  // prices were staged in step 2 to the brand-new customer id.
  const handleSaveNewCustomerWithPricing = async () => {
    setSavingCustomer(true);
    try {
      const targetCompanyId = selectedCity === 'all' ? KARACHI_COMPANY_ID : selectedCity;
      const { opening_balance_amount, ...customerPayload } = customerForm;
      const res = await api.post('/customers', {
        ...customerPayload,
        phone: toApiPhone(customerForm.phone),
        salesman_id: customerForm.salesman_id || null,
        company_id: targetCompanyId
      });
      const newCustomer = res.data?.data;
      if (newCustomer?.id && opening_balance_amount && Number(opening_balance_amount) > 0) {
        await api.post('/opening-balances', {
          entity_type: 'customer',
          entity_id: newCustomer.id,
          entity_name: customerForm.full_name,
          balance_type: 'debit',
          amount: Number(opening_balance_amount),
          notes: 'Opening balance at customer creation'
        });
      }
      const pricesToApply = Object.entries(addCustomPrices).filter(([, v]) => v !== '' && v !== null && v !== undefined);
      if (newCustomer?.id && pricesToApply.length > 0) {
        await Promise.all(
          pricesToApply.map(([productId, price]) =>
            api.put(`/customers/${newCustomer.id}/pricing/${productId}`, { price: Number(price) })
          )
        );
      }
      toast.success('Customer account created.');
      setShowCustomerModal(false);
      loadCustomers();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to save customer.');
    } finally {
      setSavingCustomer(false);
    }
  };

  // Header's "+ Quick Action" → "Register Dealer Account".
  useEffect(() => {
    if (autoOpenCreate) openAddCustomerModal();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoOpenCreate]);

  const openEditCustomerModal = (customer) => {
    setEditingCustomer(customer);
    setCustomerForm({
      full_name:    customer.full_name || '',
      phone:        localPhoneDigits(customer.phone),
      email:        customer.email || '',
      shop_name:    customer.shop_name || '',
      shop_address: customer.shop_address || '',
      city:         customer.city || '',
      area:         customer.area || '',
      salesman_id:  customer.salesman_id || '',
      shop_latitude:  customer.shop_latitude ?? null,
      shop_longitude: customer.shop_longitude ?? null
    });
    setShowCustomerModal(true);
  };

  // Edit stays a single-page save — only Add Customer goes through the
  // 3-step wizard (see handleSaveNewCustomerWithPricing above).
  const handleSaveCustomer = async (e) => {
    e.preventDefault();
    if (!editingCustomer) return;
    if (!customerForm.full_name || !customerForm.phone) {
      toast.error('Full name and phone are required.');
      return;
    }
    setSavingCustomer(true);
    try {
      const { salesman_id, ...rest } = customerForm;
      await api.patch(`/customers/${editingCustomer.id}`, { ...rest, phone: toApiPhone(customerForm.phone) });
      if (salesman_id !== (editingCustomer.salesman_id || '')) {
        await api.patch(`/customers/${editingCustomer.id}/assign-salesman`, { salesman_id: salesman_id || null });
      }
      toast.success('Customer updated.');
      setShowCustomerModal(false);
      loadCustomers();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to save customer.');
    } finally {
      setSavingCustomer(false);
    }
  };

  const handleDownloadProfilePdf = async (customer) => {
    setDownloadingInfoId(customer.id);
    try {
      const res = await api.get(`/customers/${customer.id}/profile-pdf`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = `customer-${(customer.full_name || customer.id).replace(/\s+/g, '_')}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      toast.success('Customer PDF downloaded.');
    } catch (err) {
      toast.error('Failed to download customer PDF.');
    } finally {
      setDownloadingInfoId(null);
    }
  };

  const infoFiltered = filterCustomers(all, infoSearch);

  const filtered = filterCustomers(all, search).filter((c) => {
    if (filterCity && !c.city?.toLowerCase().includes(filterCity.toLowerCase())) return false;
    if (filterArea && !c.area?.toLowerCase().includes(filterArea.toLowerCase())) return false;
    if (filterSalesman && c.salesman_id !== filterSalesman) return false;
    return true;
  });
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageCustomers = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // Lazy-load outstanding balances for whichever customers are on screen.
  useEffect(() => {
    const toFetch = pageCustomers.filter(
      (c) => !(c.id in outstandingMap) && !outstandingLoading[c.id]
    );
    if (toFetch.length === 0) return;

    setOutstandingLoading((prev) => {
      const next = { ...prev };
      toFetch.forEach((c) => { next[c.id] = true; });
      return next;
    });

    Promise.all(
      toFetch.map((c) =>
        api
          .get(`/ledger/${c.id}`)
          .then((res) => ({ id: c.id, balance: res.data.data.currentBalance || 0 }))
          .catch(() => ({ id: c.id, balance: null }))
      )
    ).then((results) => {
      setOutstandingMap((prev) => {
        const next = { ...prev };
        results.forEach((r) => { next[r.id] = r.balance; });
        return next;
      });
      setOutstandingLoading((prev) => {
        const next = { ...prev };
        toFetch.forEach((c) => { delete next[c.id]; });
        return next;
      });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, search, all]);

  useEffect(() => {
    setPage(1);
  }, [search, filterCity, filterArea, filterSalesman]);

  return (
    <div className="p-6">
      <div className="flex justify-between items-start flex-wrap gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-navy">Customers Management</h1>
          <p className="text-sm text-gray-500 mt-1">Review pending approvals and manage your customer database.</p>
        </div>
        <div className="flex items-center gap-3">
          <CityFilter selectedCity={selectedCity} onChange={setSelectedCity} />
          <Button variant="accent" onClick={openAddCustomerModal} className="flex items-center gap-2">
            <Plus size={16} /> Add Customer
          </Button>
        </div>
      </div>

      <div className="flex gap-6 border-b border-gray-200 mb-6">
        <button
          onClick={() => setTab('pending')}
          className={`pb-3 text-sm font-semibold transition-colors flex items-center gap-1.5 -mb-px border-b-2 ${
            tab === 'pending' ? 'text-navy border-navy' : 'text-gray-400 border-transparent hover:text-navy'
          }`}
        >
          Pending Approval
          {pending.length > 0 && (
            <span className="bg-orange text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">{pending.length}</span>
          )}
        </button>
        <button
          onClick={() => setTab('all')}
          className={`pb-3 text-sm font-semibold transition-colors flex items-center gap-1.5 -mb-px border-b-2 ${
            tab === 'all' ? 'text-navy border-navy' : 'text-gray-400 border-transparent hover:text-navy'
          }`}
        >
          All Customers
        </button>
        {user?.role === 'super_admin' && (
          <button
            onClick={() => setTab('info')}
            className={`pb-3 text-sm font-semibold transition-colors flex items-center gap-1.5 -mb-px border-b-2 ${
              tab === 'info' ? 'text-navy border-navy' : 'text-gray-400 border-transparent hover:text-navy'
            }`}
          >
            Customer Information
          </button>
        )}
      </div>

      {error && (
        <div className="mb-6 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">
          {error}
        </div>
      )}

      {loading ? (
        <SkeletonTable rows={5} cols={4} />
      ) : tab === 'pending' ? (
        <section className="mb-8">
          {pending.length === 0 ? (
            <div className="bg-white rounded-2xl shadow-card border border-gray-100">
              <EmptyState icon={UserCheck} title="No customers awaiting approval" subtitle="New signups will show up here" />
            </div>
          ) : (
            <>
              <div className="bg-orange-50 border border-orange/30 rounded-xl p-4 mb-6 flex items-start gap-3">
                <AlertTriangle size={20} className="text-orange mt-0.5 flex-shrink-0" />
                <div>
                  <h3 className="font-semibold text-navy text-sm">
                    Action Required: {pending.length} Pending Customer Application{pending.length > 1 ? 's' : ''}
                  </h3>
                  <p className="text-sm text-gray-500 mt-0.5">
                    These applications require review before customers can start placing orders.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                {pending.map((customer) => (
                  <div key={customer.id} className="bg-white rounded-2xl shadow-card border border-gray-100 p-5 flex flex-col">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-12 h-12 rounded-full bg-navy-chip text-navy flex items-center justify-center font-bold flex-shrink-0">
                        {getInitials(customer.full_name)}
                      </div>
                      <div className="min-w-0">
                        <h4 className="font-semibold text-navy truncate">{customer.shop_name || customer.full_name}</h4>
                        <p className="text-xs text-gray-400">Requested: {timeAgo(customer.created_at)}</p>
                      </div>
                    </div>
                    <div className="space-y-2 mb-5 flex-1">
                      {customer.shop_name && (
                        <div className="flex items-center gap-2 text-gray-600 text-sm">
                          <User size={15} className="text-gray-400" />
                          <span>Contact: {customer.full_name}</span>
                        </div>
                      )}
                      <div className="flex items-center gap-2 text-gray-600 text-sm">
                        <Phone size={15} className="text-gray-400" />
                        <span>{customer.phone}</span>
                      </div>
                      {customer.email && (
                        <div className="flex items-center gap-2 text-gray-600 text-sm">
                          <Mail size={15} className="text-gray-400" />
                          <span className="truncate">{customer.email}</span>
                        </div>
                      )}
                    </div>
                    <Button
                      variant="accent"
                      className="w-full"
                      onClick={() => handleApprove(customer)}
                      disabled={approvingId === customer.id}
                    >
                      {approvingId === customer.id ? 'Approving...' : 'Approve'}
                    </Button>
                  </div>
                ))}
              </div>
            </>
          )}
        </section>
      ) : tab === 'all' ? (
        <section>
          <div className="flex justify-between items-center mb-4 gap-3 flex-wrap">
            <h3 className="font-semibold text-navy">Active Customer Database</h3>
            <div className="relative w-full sm:w-64">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search name, phone, email..."
                className="w-full bg-white border border-gray-200 rounded-full pl-9 pr-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-navy-chip focus:border-navy transition-all shadow-sm"
              />
            </div>
          </div>

          <div className="flex items-center gap-2 mb-4 flex-wrap">
            <input
              type="text"
              value={filterCity}
              onChange={(e) => setFilterCity(e.target.value)}
              placeholder="Filter by city..."
              className="w-36 bg-white border border-gray-200 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-navy-chip focus:border-navy transition-shadow"
            />
            <input
              type="text"
              value={filterArea}
              onChange={(e) => setFilterArea(e.target.value)}
              placeholder="Filter by area..."
              className="w-36 bg-white border border-gray-200 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-navy-chip focus:border-navy transition-shadow"
            />
            <select
              value={filterSalesman}
              onChange={(e) => setFilterSalesman(e.target.value)}
              className="bg-white border border-gray-200 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-navy-chip focus:border-navy"
            >
              <option value="">All Salesmen</option>
              {salesmenList.map((s) => (
                <option key={s.id} value={s.id}>{s.full_name}</option>
              ))}
            </select>
            {(filterCity || filterArea || filterSalesman) && (
              <button
                onClick={() => { setFilterCity(''); setFilterArea(''); setFilterSalesman(''); }}
                className="text-xs font-medium text-red-600 bg-red-50 hover:bg-red-100 px-3 py-1.5 rounded-lg transition-colors"
              >
                ✕ Clear Filters
              </button>
            )}
          </div>

          {filtered.length === 0 ? (
            <div className="bg-white rounded-2xl shadow-card border border-gray-100">
              <EmptyState icon={Users} title="No customers found" subtitle={search ? 'Try a different search' : undefined} />
            </div>
          ) : (
            <div className="bg-white rounded-2xl shadow-card border border-gray-100 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-100 text-gray-500">
                      <th className="py-3 px-3 font-semibold text-xs uppercase tracking-wide w-8"></th>
                      <th className="py-3 px-6 font-semibold text-xs uppercase tracking-wide">Customer</th>
                      <th className="py-3 px-4 font-semibold text-xs uppercase tracking-wide">Phone</th>
                      <th className="py-3 px-4 font-semibold text-xs uppercase tracking-wide">Rate</th>
                      <th className="py-3 px-4 font-semibold text-xs uppercase tracking-wide">Salesman</th>
                      <th className="py-3 px-4 font-semibold text-xs uppercase tracking-wide">City</th>
                      <th className="py-3 px-4 font-semibold text-xs uppercase tracking-wide">Area</th>
                      <th className="py-3 px-4 font-semibold text-xs uppercase tracking-wide text-right">Orders</th>
                      <th className="py-3 px-4 font-semibold text-xs uppercase tracking-wide text-right">Outstanding</th>
                      <th className="py-3 px-4 font-semibold text-xs uppercase tracking-wide text-right">Credit Limit</th>
                      <th className="py-3 px-4 font-semibold text-xs uppercase tracking-wide text-center">Status</th>
                      <th className="py-3 px-6 font-semibold text-xs uppercase tracking-wide text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pageCustomers.map((customer, i) => {
                      const balance = outstandingMap[customer.id];
                      const isExpanded = expandedCustomerId === customer.id;
                      return (
                        <React.Fragment key={customer.id}>
                        <tr
                          className={`border-b border-gray-50 last:border-0 hover:bg-gray-50/80 transition-colors ${
                            i % 2 === 1 ? 'bg-gray-50/40' : ''
                          } ${isExpanded ? 'bg-navy-chip/30' : ''}`}
                        >
                          <td className="py-3 px-3">
                            <button
                              onClick={() => setExpandedCustomerId(isExpanded ? null : customer.id)}
                              className="p-1.5 rounded-lg text-gray-400 hover:text-navy hover:bg-navy/10 transition-colors"
                              title={isExpanded ? 'Hide details' : 'View full details'}
                            >
                              {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                            </button>
                          </td>
                          <td className="py-3 px-6">
                            <div className="flex items-center gap-3">
                              {customer.profile_photo_url ? (
                                <img
                                  src={customer.profile_photo_url}
                                  alt={customer.full_name}
                                  className="w-10 h-10 rounded-full object-cover flex-shrink-0"
                                />
                              ) : (
                                <div className="w-10 h-10 rounded-full bg-navy-chip text-navy flex items-center justify-center font-semibold flex-shrink-0">
                                  {getInitials(customer.full_name)}
                                </div>
                              )}
                              <div className="min-w-0">
                                <div className="font-semibold text-navy truncate">{customer.full_name}</div>
                                <div className="text-xs text-gray-400 truncate">
                                  {customer.shop_name || customer.email || '—'}
                                </div>
                              </div>
                            </div>
                          </td>
                          <td className="py-3 px-4 text-gray-600">{customer.phone}</td>
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-2">
                              <span
                                className={`inline-block px-2.5 py-1 rounded-full text-[11px] font-bold whitespace-nowrap ${
                                  (RATE_BADGE[customer.rate_tier] || RATE_BADGE.manual).classes
                                }`}
                              >
                                {(RATE_BADGE[customer.rate_tier] || RATE_BADGE.manual).label}
                              </span>
                              <select
                                value={customer.rate_tier || 'manual'}
                                onChange={(e) => handleChangeRateTier(customer, e.target.value)}
                                className="border border-gray-200 rounded-md px-1.5 py-0.5 text-[11px] text-gray-500 focus:outline-none focus:ring-1 focus:ring-navy-chip focus:border-navy bg-white cursor-pointer"
                              >
                                {RATE_TIERS.map((t) => (
                                  <option key={t.value} value={t.value}>{t.label.replace(' Rate', '')}</option>
                                ))}
                              </select>
                            </div>
                          </td>
                          <td className="py-3 px-4 text-gray-600 text-[13px]">
                            {salesmenList.find((s) => s.id === customer.salesman_id)?.full_name || (
                              <span className="text-gray-300">— None —</span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-gray-600 text-[13px]">{customer.city || '—'}</td>
                          <td className="py-3 px-4 text-gray-600 text-[13px]">{customer.area || '—'}</td>
                          <td className="py-3 px-4 text-right text-navy font-medium">
                            {ordersByCustomer[customer.id] || 0}
                          </td>
                          {(() => {
                            const limit = customer.credit_limit;
                            const overLimit = typeof balance === 'number' && limit && Number(limit) > 0 && balance > Number(limit);
                            return (
                              <>
                                <td className="py-3 px-4 text-right font-semibold">
                                  {balance === undefined ? (
                                    <span className="text-gray-300 text-xs">loading…</span>
                                  ) : balance === null ? (
                                    <span className="text-gray-300 text-xs">—</span>
                                  ) : balance > 0 ? (
                                    <span className={overLimit ? 'inline-flex items-center gap-1 text-red-700' : 'text-red-600'}>
                                      {overLimit && <AlertTriangle size={13} />}
                                      PKR {Number(balance).toLocaleString()}
                                    </span>
                                  ) : (
                                    <span className="text-gray-400">PKR 0</span>
                                  )}
                                </td>
                                <td className="py-3 px-4 text-right">
                                  <input
                                    type="number"
                                    min="0"
                                    defaultValue={customer.credit_limit ?? ''}
                                    placeholder="No limit"
                                    onBlur={(e) => {
                                      const val = e.target.value;
                                      if (Number(val || 0) === Number(customer.credit_limit || 0)) return;
                                      handleChangeCreditLimit(customer, val);
                                    }}
                                    title={overLimit ? `Over limit by PKR ${(balance - Number(limit)).toLocaleString()}` : undefined}
                                    className={`w-24 border rounded-md px-2 py-1 text-[12px] text-right focus:outline-none focus:ring-1 focus:ring-navy-chip focus:border-navy ${
                                      overLimit ? 'border-red-300 bg-red-50 text-red-700 font-semibold' : 'border-gray-200 text-gray-600'
                                    }`}
                                  />
                                </td>
                              </>
                            );
                          })()}
                          <td className="py-3 px-4 text-center">
                            <span
                              className={`inline-block px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wide ${
                                customer.is_approved ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
                              }`}
                            >
                              {customer.is_approved ? 'Approved' : 'Pending'}
                            </span>
                          </td>
                          <td className="py-3 px-6 text-right">
                            <div className="flex items-center justify-end gap-3">
                              <button
                                onClick={() => openEditCustomerModal(customer)}
                                className="inline-flex items-center gap-1.5 text-xs text-navy hover:underline font-medium"
                              >
                                <Pencil size={13} /> Edit
                              </button>
                              <button
                                onClick={() => openPricingModal(customer)}
                                className="inline-flex items-center gap-1.5 text-xs text-navy hover:underline font-medium"
                              >
                                <DollarSign size={13} /> Pricing
                              </button>
                              {onViewLedger && (
                                <button
                                  onClick={() => onViewLedger(customer.id)}
                                  className="inline-flex items-center gap-1.5 text-xs text-navy hover:underline font-medium"
                                >
                                  <BookOpen size={13} /> View Ledger
                                </button>
                              )}
                              <button
                                onClick={() => handleDeleteCustomer(customer)}
                                className="inline-flex items-center gap-1.5 text-xs text-red-600 hover:underline font-medium"
                              >
                                <Trash2 size={13} /> Delete
                              </button>
                            </div>
                          </td>
                        </tr>
                        {isExpanded && (
                          <tr className="bg-navy-chip/10 border-b border-gray-100">
                            <td colSpan={12} className="px-8 py-6">
                              <div className="flex flex-col md:flex-row gap-6">
                                <div className="flex flex-col items-center gap-2 flex-shrink-0">
                                  {customer.profile_photo_url ? (
                                    <img
                                      src={customer.profile_photo_url}
                                      alt={customer.full_name}
                                      className="w-24 h-24 rounded-2xl object-cover border border-gray-200 shadow-sm"
                                    />
                                  ) : (
                                    <div className="w-24 h-24 rounded-2xl bg-navy-chip text-navy flex items-center justify-center text-2xl font-bold border border-gray-200">
                                      {getInitials(customer.full_name)}
                                    </div>
                                  )}
                                  <span className="text-xs text-gray-400">Profile Photo</span>
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3 flex-1">
                                  <div className="flex items-center gap-2 text-sm">
                                    <Phone size={14} className="text-gray-400 flex-shrink-0" />
                                    <span className="text-gray-500">Phone:</span>
                                    <span className="font-medium text-navy">{customer.phone || '—'}</span>
                                  </div>
                                  <div className="flex items-center gap-2 text-sm">
                                    <Phone size={14} className="text-gray-400 flex-shrink-0" />
                                    <span className="text-gray-500">WhatsApp:</span>
                                    <span className="font-medium text-navy">{customer.whatsapp_phone || '—'}</span>
                                  </div>
                                  <div className="flex items-center gap-2 text-sm">
                                    <Mail size={14} className="text-gray-400 flex-shrink-0" />
                                    <span className="text-gray-500">Email:</span>
                                    <span className="font-medium text-navy">{customer.email || '—'}</span>
                                  </div>
                                  <div className="flex items-center gap-2 text-sm">
                                    <IdCard size={14} className="text-gray-400 flex-shrink-0" />
                                    <span className="text-gray-500">NIC Number:</span>
                                    <span className="font-medium text-navy">{customer.nic_number || '—'}</span>
                                  </div>
                                  <div className="flex items-start gap-2 text-sm sm:col-span-2">
                                    <MapPin size={14} className="text-gray-400 flex-shrink-0 mt-0.5" />
                                    <span className="text-gray-500">Shop Address:</span>
                                    <span className="font-medium text-navy">{customer.shop_address || '—'}</span>
                                  </div>
                                  <div className="flex items-center gap-2 text-sm">
                                    <Calendar size={14} className="text-gray-400 flex-shrink-0" />
                                    <span className="text-gray-500">Registered:</span>
                                    <span className="font-medium text-navy">
                                      {customer.created_at ? new Date(customer.created_at).toLocaleDateString('en-GB') : '—'}
                                    </span>
                                  </div>
                                </div>

                                <div className="flex gap-4 flex-shrink-0 flex-wrap">
                                  <div className="flex flex-col items-center gap-1.5">
                                    <span className="text-xs text-gray-400">Shop Photo</span>
                                    {customer.shop_image_url ? (
                                      <a href={customer.shop_image_url} target="_blank" rel="noreferrer">
                                        <img src={customer.shop_image_url} alt="Shop" className="w-28 h-20 rounded-lg object-cover border border-gray-200 hover:opacity-80 transition-opacity" />
                                      </a>
                                    ) : (
                                      <div className="w-28 h-20 rounded-lg bg-gray-100 border border-gray-200 flex items-center justify-center text-gray-300">
                                        <MapPin size={20} />
                                      </div>
                                    )}
                                  </div>
                                  <div className="flex flex-col items-center gap-1.5">
                                    <span className="text-xs text-gray-400">NIC Front</span>
                                    {customer.nic_image_url ? (
                                      <a href={customer.nic_image_url} target="_blank" rel="noreferrer">
                                        <img src={customer.nic_image_url} alt="NIC Front" className="w-28 h-20 rounded-lg object-cover border border-gray-200 hover:opacity-80 transition-opacity" />
                                      </a>
                                    ) : (
                                      <div className="w-28 h-20 rounded-lg bg-gray-100 border border-gray-200 flex items-center justify-center text-gray-300">
                                        <IdCard size={20} />
                                      </div>
                                    )}
                                  </div>
                                  <div className="flex flex-col items-center gap-1.5">
                                    <span className="text-xs text-gray-400">NIC Back</span>
                                    {customer.nic_back_image_url ? (
                                      <a href={customer.nic_back_image_url} target="_blank" rel="noreferrer">
                                        <img src={customer.nic_back_image_url} alt="NIC Back" className="w-28 h-20 rounded-lg object-cover border border-gray-200 hover:opacity-80 transition-opacity" />
                                      </a>
                                    ) : (
                                      <div className="w-28 h-20 rounded-lg bg-gray-100 border border-gray-200 flex items-center justify-center text-gray-300">
                                        <IdCard size={20} />
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="px-6 py-4 border-t border-gray-100 flex justify-between items-center flex-wrap gap-3">
                <span className="text-xs text-gray-400">
                  Showing {(page - 1) * PAGE_SIZE + 1} to {Math.min(page * PAGE_SIZE, filtered.length)} of {filtered.length} entries
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
            </div>
          )}
        </section>
      ) : (
        <section>
          <div className="flex justify-between items-center mb-4 gap-3 flex-wrap">
            <div>
              <h3 className="font-semibold text-navy">Customer Information</h3>
              <p className="text-xs text-gray-400 mt-0.5">
                Select any customer (every city) to download their complete profile as a PDF — photo, NIC image and every detail.
              </p>
            </div>
            <div className="relative w-full sm:w-64">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={infoSearch}
                onChange={(e) => setInfoSearch(e.target.value)}
                placeholder="Search name, phone, email..."
                className="w-full bg-white border border-gray-200 rounded-full pl-9 pr-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-navy-chip focus:border-navy transition-all shadow-sm"
              />
            </div>
          </div>

          {infoFiltered.length === 0 ? (
            <div className="bg-white rounded-2xl shadow-card border border-gray-100">
              <EmptyState icon={Users} title="No customers found" subtitle="Try a different search term" />
            </div>
          ) : (
            <div className="bg-white rounded-2xl shadow-card border border-gray-100 overflow-hidden">
              <div className="divide-y divide-gray-50">
                {infoFiltered.map((customer) => (
                  <div key={customer.id} className="flex items-center gap-3 px-6 py-3.5 hover:bg-gray-50/80 transition-colors">
                    {customer.profile_photo_url ? (
                      <img
                        src={customer.profile_photo_url}
                        alt={customer.full_name}
                        className="w-11 h-11 rounded-full object-cover flex-shrink-0"
                      />
                    ) : (
                      <div className="w-11 h-11 rounded-full bg-navy-chip text-navy flex items-center justify-center font-semibold flex-shrink-0">
                        {getInitials(customer.full_name)}
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold text-navy truncate">{customer.full_name}</div>
                      <div className="text-xs text-gray-400 truncate">
                        {customer.phone} · {customer.shop_name || customer.email || '—'}
                      </div>
                    </div>
                    <button
                      onClick={() => handleDownloadProfilePdf(customer)}
                      disabled={downloadingInfoId === customer.id}
                      className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-white border border-gray-200 text-navy text-xs font-semibold hover:bg-gray-50 transition-colors shadow-sm disabled:opacity-50 flex-shrink-0"
                    >
                      {downloadingInfoId === customer.id ? 'Downloading…' : 'Download PDF'}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      )}

      {approvingCustomer && (
        <Modal title={`Approve — ${approvingCustomer.full_name}`} onClose={closeWizard}>
          {/* Step indicator */}
          <div className="flex items-center gap-2 mb-5">
            {[1, 2, 3].map((n) => (
              <React.Fragment key={n}>
                <div className={`flex items-center gap-1.5 text-xs font-semibold ${wizardStep >= n ? 'text-navy' : 'text-gray-300'}`}>
                  <span className={`w-6 h-6 rounded-full flex items-center justify-center ${
                    wizardStep > n ? 'bg-emerald-500 text-white' : wizardStep === n ? 'bg-navy text-white' : 'bg-gray-100 text-gray-400'
                  }`}>
                    {n}
                  </span>
                  {n === 1 ? 'Details' : n === 2 ? 'Pricing' : 'Review'}
                </div>
                {n < 3 && <div className={`flex-1 h-0.5 ${wizardStep > n ? 'bg-emerald-500' : 'bg-gray-100'}`} />}
              </React.Fragment>
            ))}
          </div>

          {wizardStep === 1 && (
            <>
              <div className="bg-gray-50 border border-gray-100 rounded-xl p-4 mb-4 space-y-2">
                <div className="flex items-start gap-3">
                  {approvingCustomer.profile_photo_url ? (
                    <img src={approvingCustomer.profile_photo_url} alt="" className="w-14 h-14 rounded-xl object-cover border border-gray-200" />
                  ) : (
                    <div className="w-14 h-14 rounded-xl bg-navy-chip text-navy flex items-center justify-center font-bold flex-shrink-0">
                      {getInitials(approvingCustomer.full_name)}
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="font-semibold text-navy">{approvingCustomer.full_name}</p>
                    <p className="text-xs text-gray-500">{approvingCustomer.phone}{approvingCustomer.email ? ` · ${approvingCustomer.email}` : ''}</p>
                    {approvingCustomer.shop_name && <p className="text-xs text-gray-500">{approvingCustomer.shop_name}</p>}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-gray-500 pt-2 border-t border-gray-200">
                  {approvingCustomer.shop_address && <p className="col-span-2">Address: {approvingCustomer.shop_address}</p>}
                  {(approvingCustomer.city || approvingCustomer.area) && <p>Location: {[approvingCustomer.city, approvingCustomer.area].filter(Boolean).join(', ')}</p>}
                  {approvingCustomer.nic_number && <p>NIC: {approvingCustomer.nic_number}</p>}
                </div>
                {(approvingCustomer.shop_image_url || approvingCustomer.nic_image_url || approvingCustomer.nic_back_image_url) && (
                  <div className="flex gap-2 pt-2 border-t border-gray-200">
                    {approvingCustomer.shop_image_url && (
                      <a href={approvingCustomer.shop_image_url} target="_blank" rel="noreferrer">
                        <img src={approvingCustomer.shop_image_url} alt="Shop" className="w-16 h-12 rounded-lg object-cover border border-gray-200" />
                      </a>
                    )}
                    {approvingCustomer.nic_image_url && (
                      <a href={approvingCustomer.nic_image_url} target="_blank" rel="noreferrer">
                        <img src={approvingCustomer.nic_image_url} alt="NIC Front" className="w-16 h-12 rounded-lg object-cover border border-gray-200" />
                      </a>
                    )}
                    {approvingCustomer.nic_back_image_url && (
                      <a href={approvingCustomer.nic_back_image_url} target="_blank" rel="noreferrer">
                        <img src={approvingCustomer.nic_back_image_url} alt="NIC Back" className="w-16 h-12 rounded-lg object-cover border border-gray-200" />
                      </a>
                    )}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3 mb-4">
                <div>
                  <label className="text-sm font-medium text-navy">Credit Limit (PKR)</label>
                  <input
                    type="number"
                    min="0"
                    value={approveCreditLimit}
                    onChange={(e) => setApproveCreditLimit(e.target.value)}
                    placeholder="Leave blank for no limit"
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-navy mt-1.5"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-navy">Opening Balance (PKR)</label>
                  <input
                    type="number"
                    min="0"
                    value={approveOpeningBalance}
                    onChange={(e) => setApproveOpeningBalance(e.target.value)}
                    placeholder="Amount already owed"
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-navy mt-1.5"
                  />
                </div>
              </div>

              <div className="mb-2">
                <label className="text-sm font-medium text-navy">Assign Salesman</label>
                <select
                  value={approveSalesmanId}
                  onChange={(e) => setApproveSalesmanId(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-navy mt-1.5 bg-white"
                >
                  <option value="">— No salesman —</option>
                  {salesmenList.filter((s) => s.company_id === approvingCustomer.company_id).map((s) => (
                    <option key={s.id} value={s.id}>{s.full_name}</option>
                  ))}
                </select>
              </div>

              <div className="flex justify-end gap-2 pt-4">
                <Button type="button" variant="secondary" onClick={closeWizard}>Cancel</Button>
                <Button type="button" onClick={() => setWizardStep(2)}>Next: Pricing</Button>
              </div>
            </>
          )}

          {wizardStep === 2 && (
            <>
              <p className="text-sm text-gray-500 mb-3">
                Set a specific rate for this customer on individual products — overrides their rate tier for that product only. Everything is saved when you approve in the last step.
              </p>
              <div className="relative mb-3">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  value={wizardPricingSearch}
                  onChange={(e) => setWizardPricingSearch(e.target.value)}
                  placeholder="Search products or categories..."
                  className="w-full border border-gray-200 rounded-lg pl-8 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-navy-chip focus:border-navy transition-shadow"
                />
              </div>

              {wizardPricingLoading ? (
                <p className="text-sm text-gray-400 py-6 text-center">Loading products…</p>
              ) : visibleWizardPricingRows.length === 0 ? (
                <p className="text-sm text-gray-400 py-6 text-center">No products found.</p>
              ) : (
                <div className="max-h-[360px] overflow-y-auto -mx-1 space-y-2">
                  {visibleWizardPricingRows.map((row) => {
                    const hasCustom = row.custom_price !== null && row.custom_price !== undefined;
                    return (
                      <div key={row.product_id} className="flex items-center gap-3 border border-gray-100 rounded-xl px-3.5 py-2.5 mx-1">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-medium text-navy truncate">{row.name}</p>
                            {row.category && (
                              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-navy-chip text-navy flex-shrink-0">{row.category}</span>
                            )}
                          </div>
                          <p className="text-xs text-gray-400">
                            Catalog: PKR {row.catalog_price.toLocaleString()}{hasCustom && <span className="text-navy font-medium"> · Custom: PKR {Number(row.custom_price).toLocaleString()}</span>}
                          </p>
                        </div>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          placeholder={String(row.catalog_price)}
                          value={wizardPriceInputs[row.product_id] ?? ''}
                          onChange={(e) => setWizardPriceInputs((prev) => ({ ...prev, [row.product_id]: e.target.value }))}
                          className="w-24 border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-navy focus:border-navy transition-shadow"
                        />
                        {(wizardPriceInputs[row.product_id] ?? '') !== '' && (
                          <button
                            type="button"
                            onClick={() => setWizardPriceInputs((prev) => ({ ...prev, [row.product_id]: '' }))}
                            title="Reset to default"
                            className="text-gray-400 hover:text-red-600 p-1.5"
                          >
                            <RotateCcw size={14} />
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              <div className="flex justify-end gap-2 pt-4">
                <Button type="button" variant="secondary" onClick={() => setWizardStep(1)}>Back</Button>
                <Button type="button" onClick={() => setWizardStep(3)}>Next: Review</Button>
              </div>
            </>
          )}

          {wizardStep === 3 && (
            <>
              <p className="text-sm text-gray-500 mb-4">Review everything below — approving will apply all of it and let the customer start placing orders.</p>
              <div className="space-y-3">
                <div className="bg-gray-50 border border-gray-100 rounded-xl p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">Customer</p>
                  <p className="text-sm font-semibold text-navy">{approvingCustomer.full_name}</p>
                  <p className="text-xs text-gray-500">{approvingCustomer.phone}{approvingCustomer.shop_name ? ` · ${approvingCustomer.shop_name}` : ''}</p>
                </div>
                <div className="bg-gray-50 border border-gray-100 rounded-xl p-4 grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Salesman</p>
                    <p className="text-sm font-medium text-navy">{salesmenList.find((s) => s.id === approveSalesmanId)?.full_name || '— None —'}</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Credit Limit</p>
                    <p className="text-sm font-medium text-navy">{approveCreditLimit ? `PKR ${Number(approveCreditLimit).toLocaleString()}` : 'No limit'}</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Opening Balance</p>
                    <p className="text-sm font-medium text-navy">{approveOpeningBalance ? `PKR ${Number(approveOpeningBalance).toLocaleString()}` : 'None'}</p>
                  </div>
                </div>
                <div className="bg-gray-50 border border-gray-100 rounded-xl p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">Custom Product Pricing</p>
                  {wizardStagedPrices.length === 0 ? (
                    <p className="text-xs text-gray-400">No custom prices set — catalog price applies to everything.</p>
                  ) : (
                    <div className="space-y-1.5 max-h-[160px] overflow-y-auto">
                      {wizardStagedPrices.map((r) => (
                        <div key={r.product_id} className="flex items-center justify-between text-sm">
                          <span className="text-gray-600 truncate">{r.name}</span>
                          <span className="font-medium text-navy flex-shrink-0 ml-2">PKR {Number(r.price).toLocaleString()}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-4">
                <Button type="button" variant="secondary" disabled={approvingId === approvingCustomer.id} onClick={() => setWizardStep(2)}>Back</Button>
                <Button type="button" disabled={approvingId === approvingCustomer.id} onClick={confirmApprove}>
                  {approvingId === approvingCustomer.id ? 'Approving...' : 'Approve'}
                </Button>
              </div>
            </>
          )}
        </Modal>
      )}

      {pricingCustomer && (
        <Modal title={`Set Custom Pricing — ${pricingCustomer.full_name}`} onClose={() => setPricingCustomer(null)}>
          <p className="text-sm text-gray-500 mb-3">
            Set a specific rate for this customer on individual products — overrides their rate tier for that product only.
          </p>
          <div className="relative mb-3">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={pricingSearch}
              onChange={(e) => setPricingSearch(e.target.value)}
              placeholder="Search products..."
              className="w-full border border-gray-200 rounded-lg pl-8 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-navy-chip focus:border-navy transition-shadow"
            />
          </div>

          {pricingLoading ? (
            <p className="text-sm text-gray-400 py-6 text-center">Loading products…</p>
          ) : visiblePricingRows.length === 0 ? (
            <p className="text-sm text-gray-400 py-6 text-center">No products found.</p>
          ) : (
            <div className="max-h-[360px] overflow-y-auto -mx-1 space-y-2">
              {visiblePricingRows.map((row) => {
                const hasCustom = row.custom_price !== null && row.custom_price !== undefined;
                return (
                  <div key={row.product_id} className="flex items-center gap-3 border border-gray-100 rounded-xl px-3.5 py-2.5 mx-1">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-navy truncate">{row.name}</p>
                      <p className="text-xs text-gray-400">
                        Catalog: PKR {row.catalog_price.toLocaleString()}{hasCustom && <span className="text-navy font-medium"> · Custom: PKR {Number(row.custom_price).toLocaleString()}</span>}
                      </p>
                    </div>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder={String(row.catalog_price)}
                      value={priceInputs[row.product_id] ?? ''}
                      onChange={(e) => setPriceInputs((prev) => ({ ...prev, [row.product_id]: e.target.value }))}
                      className="w-24 border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-navy focus:border-navy transition-shadow"
                    />
                    {(priceInputs[row.product_id] ?? '') !== '' && (
                      <button
                        type="button"
                        onClick={() => setPriceInputs((prev) => ({ ...prev, [row.product_id]: '' }))}
                        title="Reset to default"
                        className="text-gray-400 hover:text-red-600 p-1.5"
                      >
                        <RotateCcw size={14} />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-4">
            <Button type="button" variant="secondary" onClick={() => setPricingCustomer(null)}>Close</Button>
            <Button type="button" disabled={savingPrices || pricingLoading} onClick={handleSaveAllPrices}>
              {savingPrices ? 'Saving...' : 'Save Prices'}
            </Button>
          </div>
        </Modal>
      )}

      {showCustomerModal && (
        <Modal title={editingCustomer ? 'Edit Customer' : 'Add Customer'} onClose={() => setShowCustomerModal(false)}>
          <form onSubmit={handleSaveCustomer} className="space-y-4">
            {!editingCustomer && (
              <div className="flex items-center gap-2 mb-1">
                {[1, 2, 3].map((n) => (
                  <React.Fragment key={n}>
                    <div className={`flex items-center gap-1.5 text-xs font-semibold ${addStep >= n ? 'text-navy' : 'text-gray-300'}`}>
                      <span className={`w-6 h-6 rounded-full flex items-center justify-center ${
                        addStep > n ? 'bg-emerald-500 text-white' : addStep === n ? 'bg-navy text-white' : 'bg-gray-100 text-gray-400'
                      }`}>
                        {n}
                      </span>
                      {n === 1 ? 'Details' : n === 2 ? 'Pricing' : 'Review'}
                    </div>
                    {n < 3 && <div className={`flex-1 h-0.5 ${addStep > n ? 'bg-emerald-500' : 'bg-gray-100'}`} />}
                  </React.Fragment>
                ))}
              </div>
            )}
            {(editingCustomer || addStep === 1) && (
            <>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Full Name *</label>
              <input
                type="text"
                required
                value={customerForm.full_name}
                onChange={(e) => setCustomerForm({ ...customerForm, full_name: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-navy focus:border-navy transition-shadow"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Phone *</label>
              <div className="flex items-center border border-gray-300 rounded-lg overflow-hidden focus-within:ring-2 focus-within:ring-navy focus-within:border-navy transition-shadow">
                <span className="px-3 py-2.5 text-sm text-gray-500 bg-gray-50 border-r border-gray-300">+92</span>
                <input
                  type="text"
                  required
                  placeholder="3001234567"
                  value={customerForm.phone}
                  onChange={(e) => setCustomerForm({ ...customerForm, phone: localPhoneDigits(e.target.value) })}
                  className="flex-1 min-w-0 px-3 py-2.5 text-sm focus:outline-none"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Email</label>
              <input
                type="email"
                value={customerForm.email}
                onChange={(e) => setCustomerForm({ ...customerForm, email: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-navy focus:border-navy transition-shadow"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Shop Name</label>
              <input
                type="text"
                value={customerForm.shop_name}
                onChange={(e) => setCustomerForm({ ...customerForm, shop_name: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-navy focus:border-navy transition-shadow"
              />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-sm font-medium text-gray-700">Shop Address</label>
                {editingCustomer?.shop_latitude != null && editingCustomer?.shop_longitude != null && (
                  <a
                    href={`https://www.google.com/maps/search/?api=1&query=${editingCustomer.shop_latitude},${editingCustomer.shop_longitude}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs font-semibold text-navy hover:underline flex items-center gap-1"
                  >
                    <MapPin size={12} /> View on Google Maps
                  </a>
                )}
              </div>
              <textarea
                rows={2}
                value={customerForm.shop_address}
                onChange={(e) => setCustomerForm({ ...customerForm, shop_address: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-navy focus:border-navy transition-shadow"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Shop Location</label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleUseCurrentLocation}
                  disabled={locatingMe}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-300 text-sm font-medium text-navy hover:bg-gray-50 disabled:opacity-50 whitespace-nowrap"
                >
                  <MapPin size={14} /> {locatingMe ? 'Locating...' : 'Update Location'}
                </button>
                <input
                  type="text"
                  placeholder="Or search an address..."
                  value={locationSearch}
                  onChange={(e) => setLocationSearch(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleSearchLocation())}
                  className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-navy focus:border-navy transition-shadow"
                />
                <button
                  type="button"
                  onClick={handleSearchLocation}
                  disabled={searchingLocation}
                  className="px-3 py-2 rounded-lg border border-gray-300 text-sm font-medium text-navy hover:bg-gray-50 disabled:opacity-50"
                >
                  <Search size={14} />
                </button>
              </div>
              {locationResults.length > 0 && (
                <div className="mt-1.5 border border-gray-200 rounded-lg overflow-hidden max-h-40 overflow-y-auto">
                  {locationResults.map((r, i) => (
                    <button
                      type="button"
                      key={i}
                      onClick={() => handlePickLocationResult(r)}
                      className="block w-full text-left px-3 py-2 text-xs text-gray-600 hover:bg-gray-50 border-b border-gray-100 last:border-0"
                    >
                      {r.display_name}
                    </button>
                  ))}
                </div>
              )}
              {customerForm.shop_latitude != null && customerForm.shop_longitude != null && (
                <p className="text-xs text-emerald-600 mt-1.5 flex items-center gap-1">
                  <MapPin size={12} /> Location captured ({Number(customerForm.shop_latitude).toFixed(5)}, {Number(customerForm.shop_longitude).toFixed(5)})
                </p>
              )}
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">City</label>
                <input
                  type="text"
                  placeholder="e.g. Karachi"
                  value={customerForm.city}
                  onChange={(e) => setCustomerForm({ ...customerForm, city: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-navy focus:border-navy transition-shadow"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Area</label>
                <input
                  type="text"
                  placeholder="e.g. Gulshan, Saddar, DHA"
                  value={customerForm.area}
                  onChange={(e) => setCustomerForm({ ...customerForm, area: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-navy focus:border-navy transition-shadow"
                />
              </div>
            </div>
            {!editingCustomer && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Opening Balance — Amount Owed (optional)</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="Amount (PKR)"
                  value={customerForm.opening_balance_amount}
                  onChange={(e) => setCustomerForm({ ...customerForm, opening_balance_amount: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-navy focus:border-navy transition-shadow"
                />
                <p className="text-xs text-gray-400 mt-1.5">
                  Leave blank for a fresh account. If set, it's recorded as the customer's first ledger entry (what they already owe) — visible to the customer, their salesman, and in the admin ledger.
                </p>
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Assign Salesman (optional)</label>
              <select
                value={customerForm.salesman_id}
                onChange={(e) => setCustomerForm({ ...customerForm, salesman_id: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-navy focus:border-navy bg-white"
              >
                <option value="">— No Salesman —</option>
                {salesmenList
                  .filter((s) => {
                    const targetCompanyId = editingCustomer ? editingCustomer.company_id : selectedCity;
                    return targetCompanyId === 'all' || !targetCompanyId || s.company_id === targetCompanyId;
                  })
                  .map((s) => (
                    <option key={s.id} value={s.id}>{s.full_name}</option>
                  ))}
              </select>
            </div>
            {editingCustomer && (
              <p className="text-xs text-gray-400">Phone number can't be changed here.</p>
            )}
            </>
            )}

            {!editingCustomer && addStep === 2 && (
              <>
                <p className="text-sm text-gray-500">
                  Every product, at its default price — set a custom price for any of them if this customer gets a special rate. Leave blank to keep the default.
                </p>
                <div className="relative">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    value={addProductSearch}
                    onChange={(e) => setAddProductSearch(e.target.value)}
                    placeholder="Search products or categories..."
                    className="w-full border border-gray-200 rounded-lg pl-8 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-navy-chip focus:border-navy transition-shadow"
                  />
                </div>
                {loadingAddProducts ? (
                  <p className="text-sm text-gray-400 py-6 text-center">Loading products…</p>
                ) : visibleAddProducts.length === 0 ? (
                  <p className="text-sm text-gray-400 py-6 text-center">No products found.</p>
                ) : (
                  <div className="max-h-[360px] overflow-y-auto -mx-1 space-y-2">
                    {visibleAddProducts.map((p) => (
                      <div key={p.id} className="flex items-center gap-3 border border-gray-100 rounded-xl px-3.5 py-2.5 mx-1">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-medium text-navy truncate">{p.name}</p>
                            {p.categories?.name && (
                              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-navy-chip text-navy flex-shrink-0">{p.categories.name}</span>
                            )}
                          </div>
                          <p className="text-xs text-gray-400">Default: PKR {Number(p.price).toLocaleString()}</p>
                        </div>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          placeholder={String(p.price)}
                          value={addCustomPrices[p.id] ?? ''}
                          onChange={(e) => setAddCustomPrices((prev) => ({ ...prev, [p.id]: e.target.value }))}
                          className="w-24 border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-navy focus:border-navy transition-shadow"
                        />
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}

            {!editingCustomer && addStep === 3 && (
              <>
                <p className="text-sm text-gray-500">Review everything below before creating the account.</p>
                <div className="bg-gray-50 border border-gray-100 rounded-xl p-4 space-y-1">
                  <p className="text-sm font-semibold text-navy">{customerForm.full_name}</p>
                  <p className="text-xs text-gray-500">+92{customerForm.phone}{customerForm.email ? ` · ${customerForm.email}` : ''}</p>
                  {customerForm.shop_name && <p className="text-xs text-gray-500">{customerForm.shop_name}</p>}
                  {customerForm.shop_address && <p className="text-xs text-gray-500">{customerForm.shop_address}</p>}
                  {(customerForm.city || customerForm.area) && <p className="text-xs text-gray-500">{[customerForm.city, customerForm.area].filter(Boolean).join(', ')}</p>}
                </div>
                <div className="bg-gray-50 border border-gray-100 rounded-xl p-4 grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Salesman</p>
                    <p className="text-sm font-medium text-navy">{salesmenList.find((s) => s.id === customerForm.salesman_id)?.full_name || '— None —'}</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Opening Balance</p>
                    <p className="text-sm font-medium text-navy">{customerForm.opening_balance_amount ? `PKR ${Number(customerForm.opening_balance_amount).toLocaleString()}` : 'None'}</p>
                  </div>
                </div>
                <div className="bg-gray-50 border border-gray-100 rounded-xl p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">Custom Product Pricing</p>
                  {Object.entries(addCustomPrices).filter(([, v]) => v !== '' && v !== null && v !== undefined).length === 0 ? (
                    <p className="text-xs text-gray-400">No custom prices set — default pricing applies to everything.</p>
                  ) : (
                    <div className="space-y-1.5 max-h-[160px] overflow-y-auto">
                      {Object.entries(addCustomPrices).filter(([, v]) => v !== '' && v !== null && v !== undefined).map(([productId, price]) => {
                        const product = addProducts.find((p) => p.id === productId);
                        return (
                          <div key={productId} className="flex items-center justify-between text-sm">
                            <span className="text-gray-600 truncate">{product?.name || productId}</span>
                            <span className="font-medium text-navy flex-shrink-0 ml-2">PKR {Number(price).toLocaleString()}</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
                <p className="text-xs text-gray-400">
                  Creates the account directly (auto-approved) — most customers should instead self-register from the mobile app and be approved from the Pending Approval section above.
                </p>
              </>
            )}

            <div className="flex justify-end gap-3 pt-2">
              {editingCustomer ? (
                <>
                  <Button type="button" variant="secondary" onClick={() => setShowCustomerModal(false)}>Cancel</Button>
                  <Button type="submit" variant="accent" disabled={savingCustomer}>{savingCustomer ? 'Saving...' : 'Save'}</Button>
                </>
              ) : addStep === 1 ? (
                <>
                  <Button type="button" variant="secondary" onClick={() => setShowCustomerModal(false)}>Cancel</Button>
                  <Button type="button" variant="accent" onClick={goToAddPricingStep}>Next: Pricing</Button>
                </>
              ) : addStep === 2 ? (
                <>
                  <Button type="button" variant="secondary" onClick={() => setAddStep(1)}>Back</Button>
                  <Button type="button" variant="accent" onClick={() => setAddStep(3)}>Next: Review</Button>
                </>
              ) : (
                <>
                  <Button type="button" variant="secondary" disabled={savingCustomer} onClick={() => setAddStep(2)}>Back</Button>
                  <Button type="button" variant="accent" disabled={savingCustomer} onClick={handleSaveNewCustomerWithPricing}>
                    {savingCustomer ? 'Saving...' : 'Add Customer'}
                  </Button>
                </>
              )}
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

