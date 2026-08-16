import React from 'react';

export default function EmptyState({ icon: Icon, title, subtitle }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-16 px-6">
      {Icon && (
        <div className="w-14 h-14 rounded-full bg-gray-100 flex items-center justify-center mb-4 text-gray-400">
          <Icon size={26} strokeWidth={1.75} />
        </div>
      )}
      <p className="text-sm font-medium text-gray-600">{title}</p>
      {subtitle && <p className="text-xs text-gray-400 mt-1">{subtitle}</p>}
    </div>
  );
}
