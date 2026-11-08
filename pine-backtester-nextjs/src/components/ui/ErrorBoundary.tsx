'use client';

import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';
import { Button } from './Button';

interface Props {
  children: ReactNode;
  fallbackTitle?: string;
  onReset?: () => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
    if (this.props.onReset) {
      this.props.onReset();
    }
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center h-full p-6 text-center bg-[var(--bg-subtle)] border border-[var(--border-subtle)] rounded-xl space-y-3">
          <div className="w-10 h-10 rounded-full bg-rose-500/10 text-rose-600 flex items-center justify-center">
            <AlertCircle className="w-5 h-5" />
          </div>
          <div>
            <h4 className="text-sm font-semibold text-[var(--text-1)]">
              {this.props.fallbackTitle || 'Panel Recovery'}
            </h4>
            <p className="text-xs text-[var(--text-3)] max-w-sm mt-1">
              {this.state.error?.message || 'A transient rendering error occurred in this view.'}
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={this.handleReset}
            className="text-xs gap-1.5 h-8 font-medium"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Reset Component</span>
          </Button>
        </div>
      );
    }

    return this.props.children;
  }
}

