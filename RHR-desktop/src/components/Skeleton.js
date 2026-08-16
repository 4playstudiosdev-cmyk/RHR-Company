import React from 'react';

export function SkeletonBlock({ className = '' }) {
  return <div className={`animate-pulse bg-gray-200 rounded-md ${className}`} />;
}

export function SkeletonStatCards({ count = 4 }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 flex items-center gap-4"
        >
          <SkeletonBlock className="w-12 h-12 rounded-xl flex-shrink-0" />
          <div className="flex-1 space-y-2">
            <SkeletonBlock className="h-6 w-16" />
            <SkeletonBlock className="h-3 w-24" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function SkeletonTable({ rows = 5, cols = 4 }) {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-100">
        <SkeletonBlock className="h-4 w-32" />
      </div>
      <div className="divide-y divide-gray-50">
        {Array.from({ length: rows }).map((_, r) => (
          <div key={r} className="flex items-center gap-6 px-6 py-4">
            {Array.from({ length: cols }).map((__, c) => (
              <SkeletonBlock key={c} className="h-4 flex-1" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export function SkeletonCards({ count = 6 }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <SkeletonBlock className="h-40 w-full rounded-none" />
          <div className="p-4 space-y-2">
            <SkeletonBlock className="h-5 w-24" />
            <SkeletonBlock className="h-3 w-32" />
            <SkeletonBlock className="h-3 w-20" />
          </div>
        </div>
      ))}
    </div>
  );
}
