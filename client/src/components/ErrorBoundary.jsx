import React from 'react';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    // eslint-disable-next-line no-console
    console.error('ErrorBoundary', error, info);
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div className="rounded-2xl border border-border/50 bg-surface/70 p-6 shadow-sm backdrop-blur">
        <div className="text-lg font-semibold">Something went wrong</div>
        <div className="mt-2 text-sm text-muted">{this.state.error?.message || 'Unknown error'}</div>
        <button
          onClick={() => window.location.reload()}
          className="mt-4 rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-white transition hover:bg-accent2"
        >
          Reload
        </button>
      </div>
    );
  }
}
