import React, { useState } from 'react';
import { Loader2, Server, Factory, Mail, Lock, Eye, EyeOff, ArrowRight, Network, ShoppingCart, Compass } from 'lucide-react';
import api from '../services/api';
import ServerSettingsModal from '../components/ServerSettingsModal';

const FEATURES = [
  { icon: Network, title: 'Multi-Branch Control', text: 'Unified management across all locations.' },
  { icon: ShoppingCart, title: 'Real-Time Orders', text: 'Track fulfilment from order to delivery.' },
  { icon: Compass, title: 'Live GPS Tracking', text: 'Monitor field staff and delivery status.' }
];

export default function Login({ onLogin }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
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
    <div className="min-h-screen flex flex-col md:flex-row bg-cream">
      {/* Left: Login form */}
      <div className="w-full md:w-[45%] min-h-screen flex items-center justify-center p-6">
        <div className="w-full max-w-sm bg-white rounded-2xl shadow-card border border-gray-100 p-8">
          <div className="text-center mb-7 flex flex-col items-center">
            <div className="w-14 h-14 rounded-xl bg-navy-container flex items-center justify-center text-white mb-3">
              <Factory size={26} />
            </div>
            <h1 className="text-xl font-bold text-navy">RHR & Company</h1>
            <p className="text-sm text-gray-500 mt-0.5">Admin Control Center</p>
          </div>

          {error && (
            <div className="mb-4 bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-2.5 rounded-lg">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Email Address</label>
              <div className="relative">
                <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg pl-9 pr-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-navy-chip focus:border-navy transition-shadow"
                  placeholder="admin@rhr.com"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Password</label>
              <div className="relative">
                <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg pl-9 pr-9 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-navy-chip focus:border-navy transition-shadow"
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-navy transition-colors"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 bg-navy hover:bg-navy/90 disabled:opacity-60 text-white font-medium py-2.5 rounded-lg transition-colors mt-2"
            >
              {loading ? (
                <>
                  <Loader2 size={16} className="animate-spin" /> Signing in...
                </>
              ) : (
                <>
                  Sign In <ArrowRight size={16} />
                </>
              )}
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
      </div>

      {/* Right: Branding panel */}
      <div
        className="hidden md:flex w-[55%] min-h-screen relative flex-col items-center justify-center p-xl overflow-hidden"
        style={{ background: 'linear-gradient(135deg, #2e55b8 0%, #073c9f 100%)' }}
      >
        <div className="absolute -top-32 -right-32 w-96 h-96 bg-white/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-32 -left-32 w-96 h-96 bg-emerald-400/10 rounded-full blur-3xl pointer-events-none" />

        <div className="flex flex-col items-center z-10 w-full max-w-lg gap-10 px-8">
          <div className="relative w-32 h-32 flex items-center justify-center">
            <div className="absolute inset-0 bg-white/20 blur-2xl rounded-full" />
            <div className="relative z-10 w-full h-full rounded-3xl bg-white/10 border border-white/20 flex items-center justify-center backdrop-blur-sm">
              <Factory size={56} className="text-white" />
            </div>
          </div>

          <div className="text-center flex flex-col gap-2">
            <h2 className="text-3xl font-bold text-white">Welcome to RHR Admin</h2>
            <p className="text-navy-chip max-w-md mx-auto">
              Construction materials manufacturing — order, dispatch, and field operations in one place.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 w-full">
            {FEATURES.map((f) => {
              const Icon = f.icon;
              return (
                <div
                  key={f.title}
                  className="bg-white/10 border border-white/20 backdrop-blur-sm rounded-xl p-4 flex flex-col gap-2 items-center text-center text-white transition-transform hover:-translate-y-1 duration-300"
                >
                  <div className="w-11 h-11 rounded-full bg-white/10 flex items-center justify-center">
                    <Icon size={20} />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold">{f.title}</h3>
                    <p className="text-xs text-navy-chip mt-1">{f.text}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="absolute bottom-6 w-full text-center z-10">
          <p className="text-[11px] font-semibold text-navy-chip/70 tracking-widest uppercase">Powered by Dreambyte</p>
        </div>
      </div>

      {showServerSettings && <ServerSettingsModal onClose={() => setShowServerSettings(false)} />}
    </div>
  );
}
