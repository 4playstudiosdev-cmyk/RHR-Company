import React from 'react';

export default function StatCard({ label, value, icon: Icon, color = 'navy', trend }) {
  const iconWrap = color === 'orange' ? 'bg-orange/10 text-orange' : 'bg-navy-chip text-navy';

  return (
    <div className="bg-white rounded-2xl shadow-card hover:shadow-md hover:-translate-y-0.5 transition-all duration-300 border border-gray-100 p-5 flex items-center gap-4">
      <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${iconWrap}`}>
        <Icon size={22} strokeWidth={2} />
      </div>
      <div className="min-w-0">
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">{label}</p>
        <p className="text-2xl font-bold text-navy leading-tight mt-0.5">{value}</p>
        {trend && (
          <div className="flex items-center gap-1 mt-1">
            <span className="text-[13px] font-medium text-emerald-600">{trend}</span>
          </div>
        )}
      </div>
    </div>
  );
}
