import React, { useState } from 'react';
import { Server } from 'lucide-react';
import Modal from './Modal';
import Button from './Button';
import { DEFAULT_API_URL, getApiUrl, setApiUrl } from '../services/api';

// Strips a trailing /api/v1 (and any trailing slash) so the input shows
// just the host:port — setApiUrl adds /api/v1 back on save.
function toHostOnly(apiUrl) {
  return apiUrl.replace(/\/?api\/v1\/?$/, '').replace(/\/$/, '');
}

export default function ServerSettingsModal({ onClose }) {
  const [host, setHost] = useState(toHostOnly(getApiUrl()));

  const handleSave = (e) => {
    e.preventDefault();
    const trimmed = host.trim().replace(/\/$/, '');
    if (!trimmed) return;
    setApiUrl(`${trimmed}/api/v1`);
    window.location.reload(); // reload so every already-created client picks up the change
  };

  return (
    <Modal title="Server Settings" onClose={onClose}>
      <form onSubmit={handleSave} className="space-y-4">
        <div className="flex items-start gap-3 bg-gray-50 border border-gray-200 rounded-lg p-3">
          <Server size={18} className="text-navy flex-shrink-0 mt-0.5" />
          <p className="text-xs text-gray-500">
            Point this app at whichever machine is running the RHR backend on your network —
            useful when the backend isn't on this same PC. The "Not secure" warning in the
            browser address bar is expected here: this connects over plain http:// on your local
            network, not the public internet, so it isn't a security issue.
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Backend Server URL</label>
          <input
            type="text"
            value={host}
            onChange={(e) => setHost(e.target.value)}
            placeholder="http://192.168.10.172:3000"
            className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-navy focus:border-navy transition-shadow"
          />
          <p className="text-xs text-gray-400 mt-1">Default: {toHostOnly(DEFAULT_API_URL)}</p>
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="accent">Save &amp; Reconnect</Button>
        </div>
      </form>
    </Modal>
  );
}
