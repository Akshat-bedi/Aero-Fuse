import { Component, ErrorInfo, ReactNode } from 'react';
import { AlertOctagon, RotateCcw, Home, AlertTriangle } from 'lucide-react';
import { Button } from './Button';

interface GlobalErrorBoundaryProps {
  children: ReactNode;
}

interface GlobalErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

/**
 * Global Error Boundary: Catches unhandled application crashes and presents
 * a military C2 tactical fault screen rather than a blank white page.
 */
export class GlobalErrorBoundary extends Component<
  GlobalErrorBoundaryProps,
  GlobalErrorBoundaryState
> {
  constructor(props: GlobalErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<GlobalErrorBoundaryState> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    this.setState({ errorInfo });
    console.error('[GlobalErrorBoundary] Tactical runtime exception:', error, errorInfo);
  }

  handleReload = () => {
    window.location.reload();
  };

  handleResetStorage = () => {
    try {
      localStorage.clear();
      sessionStorage.clear();
    } catch (err) {
      console.warn('Could not clear local storage:', err);
    }
    window.location.href = '/';
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="h-screen w-screen bg-command-bg text-command-text font-mono flex items-center justify-center p-6 select-none">
          <div className="w-full max-w-xl bg-command-panel border-2 border-command-critical p-6 rounded-[2px] flex flex-col gap-4 shadow-none">
            {/* Header */}
            <div className="flex items-center gap-3 border-b border-command-critical-border pb-3">
              <div className="w-8 h-8 rounded-[2px] bg-command-critical-bg flex items-center justify-center text-command-critical border border-command-critical-border shrink-0">
                <AlertOctagon className="w-5 h-5" />
              </div>
              <div className="flex flex-col">
                <h1 className="text-sm font-bold uppercase tracking-wider text-command-critical">
                  CRITICAL FAULT // SYSTEM EXCEPTION
                </h1>
                <span className="text-[10px] text-command-muted uppercase">
                  NATIONAL AIR OPS CENTRE · TACTICAL C2 RUNTIME
                </span>
              </div>
            </div>

            {/* Error Message */}
            <div className="flex flex-col gap-1.5 text-xs">
              <p className="text-command-heading font-semibold">
                An unhandled software fault interrupted the tactical presentation layer.
              </p>
              <div className="p-3 bg-command-bg border border-command-border/80 text-[11px] text-command-critical overflow-x-auto max-h-40 rounded-[1px]">
                <code>{this.state.error?.toString() || 'Unknown runtime error'}</code>
              </div>
              {this.state.errorInfo?.componentStack && (
                <details className="text-[10px] text-command-subdued cursor-pointer pt-1">
                  <summary className="hover:text-command-muted">Component Stack Trace</summary>
                  <pre className="p-2 bg-command-bg border border-command-border/50 overflow-x-auto mt-1 max-h-32 text-[9px]">
                    {this.state.errorInfo.componentStack}
                  </pre>
                </details>
              )}
            </div>

            {/* Recovery Actions */}
            <div className="flex items-center justify-between pt-3 border-t border-command-border/80">
              <Button
                variant="ghost"
                size="sm"
                onClick={this.handleResetStorage}
                className="text-xs text-command-muted hover:text-command-critical border border-command-border"
              >
                Reset Local Cache
              </Button>

              <div className="flex items-center gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => (window.location.href = '/')}
                  className="text-xs"
                >
                  <Home className="w-3.5 h-3.5 mr-1" />
                  COP Home
                </Button>
                <Button
                  variant="danger"
                  size="sm"
                  onClick={this.handleReload}
                  className="text-xs font-bold"
                >
                  <RotateCcw className="w-3.5 h-3.5 mr-1" />
                  Reload Console
                </Button>
              </div>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

interface FeatureErrorBoundaryProps {
  children: ReactNode;
  featureName: string;
}

interface FeatureErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

/**
 * Feature Error Boundary: Isolates faults to individual feature routes so a crash
 * in one feature doesn't disable the rest of the tactical C2 suite.
 */
export class FeatureErrorBoundary extends Component<
  FeatureErrorBoundaryProps,
  FeatureErrorBoundaryState
> {
  constructor(props: FeatureErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<FeatureErrorBoundaryState> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.warn(
      `[FeatureErrorBoundary] Fault in module [${this.props.featureName}]:`,
      error,
      errorInfo,
    );
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="h-full w-full flex items-center justify-center p-6 bg-command-bg font-mono select-none">
          <div className="w-full max-w-md bg-command-panel border border-command-warning p-5 rounded-[2px] flex flex-col gap-3">
            <div className="flex items-center gap-2.5 border-b border-command-border pb-2.5">
              <AlertTriangle className="w-5 h-5 text-command-warning shrink-0" />
              <div>
                <h3 className="text-xs font-bold uppercase text-command-warning tracking-wider">
                  Module Fault // {this.props.featureName}
                </h3>
                <span className="text-[10px] text-command-muted">
                  The active module encountered a rendering anomaly.
                </span>
              </div>
            </div>

            <p className="text-xs text-command-text">
              {this.state.error?.message || 'Unexpected module rendering failure.'}
            </p>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-command-border text-xs">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => (window.location.href = '/')}
                className="text-xs"
              >
                COP Home
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={this.handleRetry}
                className="text-xs font-bold"
              >
                <RotateCcw className="w-3.5 h-3.5 mr-1" />
                Retry Module
              </Button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
