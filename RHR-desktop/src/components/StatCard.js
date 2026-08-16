import React from 'react';

export default function StatCard({ label, value, icon: Icon, color = 'navy' }) {
  const iconWrap =
    color === 'orange' ? 'bg-orange/10 text-orange' : 'bg-navy/10 text-navy';

  return (
    <div className="bg-white rounded-2xl shadow-sm hover:shadow-md transition-shadow border border-gray-100 p-5 flex items-center gap-4">
      <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${iconWrap}`}>
        <Icon size={22} strokeWidth={2} />
      </div>
      <div>
        <p className="text-2xl font-bold text-navy leading-tight">{value}</p>
        <p className="text-sm text-gray-500 mt-0.5">{label}</p>
      </div>
    </div>
  );
}
