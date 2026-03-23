import React, { useState } from 'react';
import toast from 'react-hot-toast';

export default function ReportDownloadButton({ onGenerate, className = '', label = 'Print Report' }) {
  const [loading, setLoading] = useState(false);

  async function handleClick() {
    setLoading(true);
    try {
      await onGenerate();
      toast.success('PDF report opened');
    } catch (error) {
      toast.error(error.message || 'Failed to generate PDF report');
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      onClick={handleClick}
      disabled={loading}
      className={`inline-flex items-center justify-center gap-2 rounded-xl border border-border/50 bg-surface px-4 py-2 text-sm font-medium shadow-sm transition hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-60 ${className}`}
    >
      {loading ? 'Preparing PDF...' : label}
    </button>
  );
}
