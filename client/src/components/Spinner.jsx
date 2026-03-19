import React from 'react';

export default function Spinner({ label = 'Loading…' }) {
  return (
    <div className="flex items-center gap-3 text-sm text-muted">
      <div className="h-5 w-5 animate-spin rounded-full border-2 border-border/60 border-t-accent" />
      <div>{label}</div>
    </div>
  );
}

