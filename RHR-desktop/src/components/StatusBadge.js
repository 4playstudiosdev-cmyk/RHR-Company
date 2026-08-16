import React from 'react';

const COLORS = {
  pending: 'bg-yellow-100 text-yellow-800',
  confirmed: 'bg-blue-100 text-blue-800',
  preparing: 'bg-purple-100 text-purple-800',
  dispatched: 'bg-orange/10 text-orange',
  delivered: 'bg-green-100 text-green-800',
  cancelled: 'bg-red-100 text-red-800',
  rejected: 'bg-red-100 text-red-800',
  approved: 'bg-green-100 text-green-800'
};

export default function StatusBadge({ status }) {
  const classes = COLORS[status] || 'bg-gray-100 text-gray-800';
  return (
    <span className={`inline-block px-3 py-1 rounded-full text-xs font-semibold capitalize ${classes}`}>
      {status}
    </span>
  );
}
