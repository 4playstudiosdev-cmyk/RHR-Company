import React, { useState } from 'react';
import { TrendingUp, Wallet, FileSpreadsheet, Download } from 'lucide-react';
import api from '../services/api';
import PageHeader from '../components/PageHeader';
import { useToast } from '../components/Toast';

const REPORTS = [
  { type: 'sales', label: 'Sales Report', subtitle: 'All orders with customer and amount details', icon: TrendingUp },
  { type: 'payments', label: 'Payments Report', subtitle: 'All recorded payments and their status', icon: Wallet },
  { type: 'outstanding', label: 'Outstanding Report', subtitle: 'Current ledger balance per customer', icon: FileSpreadsheet }
];

export default function Reports() {
  const toast = useToast();
  const [downloadingType, setDownloadingType] = useState(null);

  const handleExport = async (type) => {
    setDownloadingType(type);
    try {
      const res = await api.get('/reports/export', {
        params: { type },
        responseType: 'blob'
      });
      const url = window.URL.createObjectURL(
        new Blob([res.data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
      );
      const link = document.createElement('a');
      link.href = url;
      link.download = `${type}-report.xlsx`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      toast.success('Report downloaded.');
    } catch (err) {
      toast.error('Failed to generate report.');
    } finally {
      setDownloadingType(null);
    }
  };

  return (
    <div className="p-6">
      <PageHeader title="Reports" subtitle="Export company data to Excel" />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {REPORTS.map(({ type, label, subtitle, icon: Icon }) => (
          <div
            key={type}
            className="bg-white rounded-2xl shadow-sm hover:shadow-md transition-shadow border border-gray-100 p-6 flex flex-col"
          >
            <div className="w-12 h-12 rounded-xl bg-navy/10 text-navy flex items-center justify-center mb-4">
              <Icon size={22} strokeWidth={2} />
            </div>
            <h3 className="font-semibold text-navy mb-1">{label}</h3>
            <p className="text-xs text-gray-400 mb-5 flex-1">{subtitle}</p>
            <button
              onClick={() => handleExport(type)}
              disabled={downloadingType === type}
              className="flex items-center justify-center gap-2 bg-orange hover:bg-orange/90 disabled:opacity-60 text-white text-sm font-medium py-2.5 rounded-lg transition-colors"
            >
              <Download size={15} />
              {downloadingType === type ? 'Generating...' : 'Download Excel'}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
