import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

// Wraps each page's content area — without this, any uncaught render
// error anywhere in a page (a bad API shape, an undefined field) unmounts
// the ENTIRE React tree and leaves a completely blank white screen with
// no indication of what broke (reported against Reports → Expenses).
// This confines the crash to the page itself and shows what actually
// threw, so it's screenshot-able and fixable instead of a silent blank.
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('Page crashed:', error, info?.componentStack);
  }

  componentDidUpdate(prevProps) {
    // Reset once the user navigates away — otherwise the error screen
    // would stick around forever even after picking a different page.
    if (this.state.error && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ error: null });
    }
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex items-center justify-center min-h-[60vh] p-6">
          <div className="text-center p-8 bg-white rounded-2xl shadow-card border border-red-100 max-w-lg">
            <AlertTriangle className="mx-auto mb-4 text-red-500" size={40} />
            <h2 className="text-lg font-bold text-red-600 mb-2">This page hit an error</h2>
            <p className="text-sm text-gray-500 mb-1">
              Please screenshot this and report it — it tells us exactly what to fix.
            </p>
            <p className="text-xs text-gray-400 font-mono mt-3 mb-5 break-words bg-gray-50 rounded-lg p-3 text-left">
              {this.state.error.message || String(this.state.error)}
            </p>
            <button
              onClick={() => window.location.reload()}
              className="inline-flex items-center gap-2 bg-navy hover:bg-navy/90 text-white text-sm font-medium px-4 py-2.5 rounded-lg transition-colors"
            >
              <RefreshCw size={15} /> Reload
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
