import React, { useState } from 'react';
import { Loader2, Server } from 'lucide-react';
import api from '../services/api';
import ServerSettingsModal from '../components/ServerSettingsModal';

export default function Login({ onLogin }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showServerSettings, setShowServerSettings] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await api.post('/auth/login', { email, password });
      const { token, user } = res.data.data;
      if (!['super_admin', 'branch_admin'].includes(user.role)) {
        setError('This account does not have admin access.');
        setLoading(false);
        return;
      }
      onLogin(token, user);
    } catch (err) {
      setError(err.response?.data?.message || 'Login failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center"
      style={{ background: 'linear-gradient(135deg, #1B2E6B 0%, #0F1D4A 100%)' }}
    >
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-xl p-8">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-navy tracking-wide">RHR & Company</h1>
          <p className="text-sm text-gray-500 mt-1">Admin Desktop Panel</p>
        </div>

        {error && (
          <div className="mb-4 bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-2.5 rounded-lg">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-navy focus:border-navy transition-shadow"
              placeholder="admin@rhr.com"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Password</label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-navy focus:border-navy transition-shadow"
              placeholder="********"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 bg-orange hover:bg-orange/90 disabled:opacity-60 text-white font-medium py-2.5 rounded-lg transition-colors"
          >
            {loading && <Loader2 size={16} className="animate-spin" />}
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>

        <button
          type="button"
          onClick={() => setShowServerSettings(true)}
          className="w-full flex items-center justify-center gap-1.5 text-xs text-gray-400 hover:text-navy mt-5 transition-colors"
        >
          <Server size={12} /> Server Settings
        </button>
      </div>

      {showServerSettings && <ServerSettingsModal onClose={() => setShowServerSettings(false)} />}
    </div>
  );
}
