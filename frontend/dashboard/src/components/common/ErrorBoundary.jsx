import React from 'react';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="py-16 px-4 text-center space-y-4 bg-[#101216] border border-[#F07178]/30 rounded-3xl p-8 max-w-xl mx-auto mt-8 shadow-xl">
          <div className="w-12 h-12 rounded-2xl bg-[#F07178]/10 border border-[#F07178]/30 flex items-center justify-center mx-auto text-[#F07178]">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <h2 className="text-base font-semibold text-[#E6E8EB]">Something went wrong</h2>
          <p className="text-xs text-[#9BA1AC] max-w-md mx-auto leading-relaxed font-mono">
            {this.state.error?.message || 'An unexpected error occurred while rendering this view.'}
          </p>
          <div className="pt-2 flex items-center justify-center space-x-3">
            <button
              onClick={this.handleReset}
              className="inline-flex items-center space-x-1.5 px-4 py-2 rounded-full bg-[#16181D] hover:bg-[#1E2127] border border-[#2A2E37] text-xs text-[#E6E8EB] font-mono transition-all cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5 text-[#82AAFF]" />
              <span>RELOAD</span>
            </button>
            <a
              href="/app"
              className="inline-flex items-center space-x-1.5 px-4 py-2 rounded-full bg-[#82AAFF] hover:bg-[#9bbefc] text-xs text-[#0A0B0D] font-semibold transition-all"
            >
              <Home className="w-3.5 h-3.5" />
              <span>DASHBOARD</span>
            </a>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
