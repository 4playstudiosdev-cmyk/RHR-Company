import React from 'react';

const VARIANTS = {
  primary: 'bg-navy text-white hover:bg-navy/90',
  accent: 'bg-orange text-white hover:bg-orange/90',
  secondary: 'border border-gray-300 text-gray-600 hover:bg-gray-50',
  danger: 'bg-red-600 text-white hover:bg-red-700'
};

export default function Button({ variant = 'primary', className = '', children, ...props }) {
  return (
    <button
      className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-60 disabled:cursor-not-allowed ${VARIANTS[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
