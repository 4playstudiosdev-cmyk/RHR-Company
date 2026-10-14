import React, { useEffect, useState } from 'react';
import { Image as ImageIcon, Video, Upload, Trash2 } from 'lucide-react';
import api, { getCurrentUser } from '../services/api';
import Button from '../components/Button';
import EmptyState from '../components/EmptyState';
import { SkeletonTable } from '../components/Skeleton';
import { useToast } from '../components/Toast';

// Admin-managed slides for the customer app home screen's auto-sliding
// banner (see RHR-frontend's promo_slider.dart). A banner with no
// company_id shows to every branch's customers; one with a company_id
// shows only to that branch.
export default function Promotions() {
  const toast = useToast();
  const user = getCurrentUser();
  const [banners, setBanners] = useState([]);
  const [loading, setLoading] = useState(true);
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState('');
  const [mediaType, setMediaType] = useState('image');
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const load = async () => {
    setLoading(true);
    try {
      const res = await api.get('/promo-banners/admin');
      setBanners(res.data.data || []);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to load banners.');
    } finally {
      setLoading(false);
    }
  };

  const handlePickFile = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const isVideo = f.type.startsWith('video/');
    if (f.size > (isVideo ? 50 : 10) * 1024 * 1024) {
      toast.error(`File too large. Max ${isVideo ? 50 : 10}MB.`);
      return;
    }
    setFile(f);
    setMediaType(isVideo ? 'video' : 'image');
    const reader = new FileReader();
    reader.onload = (ev) => setPreview(ev.target.result);
    reader.readAsDataURL(f);
  };

  const handleUpload = async () => {
    if (!file) {
      toast.error('Choose an image or video first.');
      return;
    }
    setUploading(true);
    try {
      const base64 = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload  = () => resolve(reader.result.split(',')[1]);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const uploadRes = await api.post('/storage/upload', {
        bucket:     'promo-banners',
        fileName:   file.name,
        fileBase64: base64,
        mimeType:   file.type
      });
      await api.post('/promo-banners', {
        media_url:     uploadRes.data.data.url,
        media_type:    mediaType,
        display_order: banners.length,
        company_id:    user?.role === 'super_admin' ? null : undefined
      });
      toast.success('Banner added.');
      setFile(null);
      setPreview('');
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to upload banner.');
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (banner) => {
    if (!window.confirm('Remove this banner?')) return;
    try {
      await api.delete(`/promo-banners/${banner.id}`);
      setBanners((prev) => prev.filter((b) => b.id !== banner.id));
      toast.success('Banner removed.');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to remove banner.');
    }
  };

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-navy">Home Screen Slider</h1>
        <p className="text-sm text-gray-500 mt-1">
          Images and videos shown as an auto-sliding banner in the customer app's home screen.
          {user?.role === 'super_admin' && ' Uploaded here, they show to every branch.'}
        </p>
      </div>

      <div className="bg-white rounded-2xl shadow-card border border-gray-100 p-6 mb-6">
        <h3 className="font-semibold text-navy mb-4 flex items-center gap-2">
          <span className="bg-navy-chip text-navy p-2 rounded-lg flex items-center justify-center">
            <Upload size={16} />
          </span>
          Add a Slide
        </h3>
        <div className="flex flex-col sm:flex-row gap-4 items-start">
          <label className="flex-1 border-2 border-dashed border-gray-200 rounded-xl p-6 text-center cursor-pointer hover:border-navy transition-colors">
            <input type="file" accept="image/*,video/mp4" className="hidden" onChange={handlePickFile} />
            {preview ? (
              mediaType === 'video' ? (
                <video src={preview} className="max-h-40 mx-auto rounded-lg" controls />
              ) : (
                <img src={preview} alt="Preview" className="max-h-40 mx-auto rounded-lg" />
              )
            ) : (
              <div className="text-gray-400">
                <ImageIcon size={28} className="mx-auto mb-2" />
                <p className="text-sm">Click to choose an image or MP4 video</p>
              </div>
            )}
          </label>
          <Button onClick={handleUpload} disabled={uploading || !file}>
            {uploading ? 'Uploading…' : 'Upload Slide'}
          </Button>
        </div>
      </div>

      {loading ? (
        <SkeletonTable rows={3} />
      ) : banners.length === 0 ? (
        <EmptyState icon={ImageIcon} title="No slides yet" subtitle="Add an image or video above to start the home screen slider." />
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {banners.map((b) => (
            <div key={b.id} className="bg-white rounded-2xl shadow-card border border-gray-100 overflow-hidden">
              <div className="h-32 bg-gray-50 flex items-center justify-center">
                {b.media_type === 'video' ? (
                  <video src={b.media_url} className="w-full h-full object-cover" muted />
                ) : (
                  <img src={b.media_url} alt="Banner" className="w-full h-full object-cover" />
                )}
              </div>
              <div className="p-3 flex items-center justify-between">
                <span className="inline-flex items-center gap-1 text-[11px] font-bold uppercase text-gray-400">
                  {b.media_type === 'video' ? <Video size={12} /> : <ImageIcon size={12} />}
                  {b.media_type}
                </span>
                <button
                  onClick={() => handleDelete(b)}
                  className="text-red-500 hover:text-red-700"
                  title="Remove"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
