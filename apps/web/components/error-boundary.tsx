"use client";

import { Component, type ReactNode } from "react";
import { ErrorView } from "@/components/error-view";

type Props = {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, info: { componentStack: string }) => void;
};

type State = { hasError: boolean; error: Error | null };

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, hasError: false };

  static getDerivedStateFromError(error: Error): State {
    return { error, hasError: true };
  }

  componentDidCatch(error: Error, info: { componentStack: string }): void {
    console.error(error, info.componentStack);
    this.props.onError?.(error, info);
  }

  handleReset = (): void => {
    this.setState({ error: null, hasError: false });
  };

  render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }
      return (
        <ErrorView
          message={this.state.error?.message}
          onReset={this.handleReset}
          title="Something went wrong"
        />
      );
    }
    return this.props.children;
  }
}
