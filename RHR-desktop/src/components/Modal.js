import React from 'react';
import { X } from 'lucide-react';

const MAX_WIDTH = {
  md: 'max-w-lg',
  lg: 'max-w-2xl',
  xl: 'max-w-3xl'
};

export default function Modal({ title, onClose, children, size = 'md' }) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className={`bg-white rounded-2xl shadow-xl w-full ${MAX_WIDTH[size] || MAX_WIDTH.md} max-h-[90vh] overflow-y-auto`}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-navy">{title}</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg p-1 transition-colors"
          >
            <X size={20} />
          </button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}
