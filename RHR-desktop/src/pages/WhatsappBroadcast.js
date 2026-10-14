import React, { useEffect, useMemo, useState } from 'react';
import { MessageCircle, Send, Search, Image as ImageIcon, X } from 'lucide-react';
import api from '../services/api';
import Button from '../components/Button';
import { useToast } from '../components/Toast';

// Super-admin only — blasts a WhatsApp text (optionally with one image)
// to selected customers, via the existing RHR-whatsapp-bot integration
// (same bot instance that already sends OTPs and payment receipts —
// see RHR-backend's broadcast.controller.js). Sends run in the
// background server-side; this page shows "started", not a live
// per-customer progress bar.
export default function WhatsappBroadcast() {
  const toast = useToast();
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(new Set());
  const [message, setMessage] = useState('');
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const load = async () => {
    setLoading(true);
    try {
      const res = await api.get('/broadcast/customers');
      setCustomers(res.data.data || []);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to load customers.');
    } finally {
      setLoading(false);
    }
  };

  const filtered = useMemo(() => {
    if (!search.trim()) return customers;
    const q = search.trim().toLowerCase();
    return customers.filter(
      (c) => c.full_name?.toLowerCase().includes(q) || c.phone?.includes(q) || c.city?.toLowerCase().includes(q)
    );
  }, [customers, search]);

  const allFilteredSelected = filtered.length > 0 && filtered.every((c) => selected.has(c.id));

  const toggleAll = () => {
    const next = new Set(selected);
    if (allFilteredSelected) {
      filtered.forEach((c) => next.delete(c.id));
    } else {
      filtered.forEach((c) => next.add(c.id));
    }
    setSelected(next);
  };

  const toggleOne = (id) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelected(next);
  };

  const handlePickImage = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > 5 * 1024 * 1024) {
      toast.error('Image too large. Max 5MB.');
      return;
    }
    setImageFile(f);
    const reader = new FileReader();
    reader.onload = (ev) => setImagePreview(ev.target.result);
    reader.readAsDataURL(f);
  };

  const handleSend = async () => {
    if (selected.size === 0) {
      toast.error('Select at least one customer.');
      return;
    }
    if (!message.trim() && !imageFile) {
      toast.error('Write a message or attach an image.');
      return;
    }
    setSending(true);
    try {
      let image_base64, image_mime_type, image_file_name;
      if (imageFile) {
        image_base64 = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload  = () => resolve(reader.result.split(',')[1]);
          reader.onerror = reject;
          reader.readAsDataURL(imageFile);
        });
        image_mime_type = imageFile.type;
        image_file_name = imageFile.name;
      }
      const res = await api.post('/broadcast/send', {
        customer_ids: Array.from(selected),
        message: message.trim(),
        image_base64, image_mime_type, image_file_name
      });
      toast.success(res.data.message || 'Broadcast started.');
      setMessage('');
      setImageFile(null);
      setImagePreview('');
      setSelected(new Set());
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to start broadcast.');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-navy">WhatsApp Notification</h1>
        <p className="text-sm text-gray-500 mt-1">Send a WhatsApp message to selected customers via the RHR WhatsApp bot.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Customer selection */}
        <div className="lg:col-span-7">
          <div className="bg-white rounded-2xl shadow-card border border-gray-100 p-5">
            <div className="flex items-center justify-between mb-3 gap-3">
              <div className="relative flex-1">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-300" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search by name, phone, or city..."
                  className="w-full border border-gray-200 rounded-xl pl-9 pr-3 py-2 text-sm focus:outline-none focus:border-navy"
                />
              </div>
              <label className="flex items-center gap-1.5 text-xs text-gray-600 whitespace-nowrap">
                <input type="checkbox" checked={allFilteredSelected} onChange={toggleAll} />
                Select All ({filtered.length})
              </label>
            </div>
            <div className="text-xs text-gray-400 mb-2">{selected.size} selected</div>
            {loading ? (
              <p className="text-sm text-gray-400 py-8 text-center">Loading customers…</p>
            ) : filtered.length === 0 ? (
              <p className="text-sm text-gray-400 py-8 text-center">No customers found.</p>
            ) : (
              <div className="max-h-[480px] overflow-y-auto divide-y divide-gray-50">
                {filtered.map((c) => (
                  <label key={c.id} className="flex items-center gap-3 py-2.5 cursor-pointer hover:bg-gray-50/80 px-2 rounded-lg">
                    <input type="checkbox" checked={selected.has(c.id)} onChange={() => toggleOne(c.id)} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-navy truncate">{c.full_name}</p>
                      <p className="text-xs text-gray-400">{c.whatsapp_phone || c.phone || 'No phone'}{c.city ? ` · ${c.city}` : ''}</p>
                    </div>
                  </label>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Compose */}
        <div className="lg:col-span-5">
          <div className="bg-white rounded-2xl shadow-card border-l-4 border-navy p-6">
            <h3 className="font-semibold text-navy mb-4 flex items-center gap-2">
              <span className="bg-navy-chip text-navy p-2 rounded-lg flex items-center justify-center">
                <MessageCircle size={16} />
              </span>
              Compose Message
            </h3>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={6}
              placeholder="Type your message..."
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-navy resize-none mb-3"
            />
            {imagePreview ? (
              <div className="relative mb-3 inline-block">
                <img src={imagePreview} alt="Attachment" className="h-28 rounded-lg object-cover" />
                <button
                  onClick={() => { setImageFile(null); setImagePreview(''); }}
                  className="absolute -top-2 -right-2 bg-white rounded-full shadow p-1 text-red-500"
                >
                  <X size={14} />
                </button>
              </div>
            ) : (
              <label className="flex items-center gap-2 text-sm text-navy border border-dashed border-gray-200 rounded-xl px-3 py-2.5 cursor-pointer hover:border-navy mb-3 w-fit">
                <input type="file" accept="image/*" className="hidden" onChange={handlePickImage} />
                <ImageIcon size={16} />
                Attach an image (optional)
              </label>
            )}
            {imagePreview && (
              <p className="text-xs text-gray-400 -mt-2 mb-3">
                Delivered as a PDF attachment (WhatsApp Web can't reliably send native photos from this bot).
              </p>
            )}
            <Button onClick={handleSend} disabled={sending} className="w-full flex items-center justify-center gap-2">
              <Send size={16} />
              {sending ? 'Starting…' : `Send to ${selected.size} customer${selected.size === 1 ? '' : 's'}`}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
