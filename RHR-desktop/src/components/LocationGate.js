import React, { useState } from 'react';
import { MapPin, Loader2 } from 'lucide-react';
import AdminLocationService from '../services/adminLocationService';

// Blocks the whole desktop app behind a full-screen overlay right after
// login until the browser hands over a location — separate from the
// login form itself (which never blocks on location, see
// auth.service.js#loginWithCredentials) so a denied/unavailable location
// never locks an admin out of signing in, only out of doing anything
// once they're in. Confirmation is remembered in sessionStorage per user
// so it only asks once per browser tab session, not on every navigation.
export default function LocationGate({ user }) {
  const storageKey = user ? `rhr_location_confirmed_${user.id}` : null;
  const [confirmed, setConfirmed] = useState(() => (storageKey ? sessionStorage.getItem(storageKey) === '1' : true));
  const [requesting, setRequesting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  if (!user || confirmed) return null;

  const handleAllow = async () => {
    setRequesting(true);
    setErrorMsg('');
    try {
      await AdminLocationService.pingNow();
      if (storageKey) sessionStorage.setItem(storageKey, '1');
      setConfirmed(true);
    } catch (err) {
      setErrorMsg(err.message || 'Could not read your location. Please allow location access and try again.');
    } finally {
      setRequesting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[9999] bg-navy/95 backdrop-blur-sm flex items-center justify-center p-6">
      <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-7 text-center">
        <div className="w-14 h-14 rounded-xl bg-navy-chip flex items-center justify-center text-navy mx-auto mb-4">
          <MapPin size={26} />
        </div>
        <h2 className="text-lg font-bold text-navy mb-1.5">Share Your Location</h2>
        <p className="text-sm text-gray-500 mb-5">
          Allow location access to continue — this is recorded against your login and shown on Live GPS. The
          desktop stays locked until you allow it.
        </p>
        {errorMsg && (
          <div className="mb-4 bg-red-50 border border-red-200 text-red-700 text-xs px-3.5 py-2.5 rounded-lg text-left">
            {errorMsg}
          </div>
        )}
        <button
          onClick={handleAllow}
          disabled={requesting}
          className="w-full flex items-center justify-center gap-2 bg-navy hover:bg-navy/90 disabled:opacity-60 text-white font-medium py-2.5 rounded-lg transition-colors"
        >
          {requesting ? (
            <>
              <Loader2 size={16} className="animate-spin" /> Requesting...
            </>
          ) : (
            'Allow Location Access'
          )}
        </button>
      </div>
    </div>
  );
}
