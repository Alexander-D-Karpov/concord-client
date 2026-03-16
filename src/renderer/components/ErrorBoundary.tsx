import React, { Component, ErrorInfo } from 'react';

interface Props {
    children: React.ReactNode;
    fallback?: React.ReactNode;
    name?: string;
}

interface State {
    hasError: boolean;
    error: Error | null;
}

class ErrorBoundary extends Component<Props, State> {
    constructor(props: Props) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error };
    }

    componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        console.error(`[ErrorBoundary:${this.props.name || 'unknown'}]`, error, errorInfo);
    }

    render() {
        if (this.state.hasError) {
            if (this.props.fallback) return this.props.fallback;
            return (
                <div className="flex items-center justify-center h-full p-8">
                    <div className="text-center max-w-sm">
                        <div className="text-4xl mb-4">⚠️</div>
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">Something went wrong</h3>
                        <p className="text-sm text-gray-500 dark:text-dark-400 mb-4">{this.state.error?.message}</p>
                        <button
                            onClick={() => this.setState({ hasError: false, error: null })}
                            className="btn-primary"
                        >
                            Try Again
                        </button>
                    </div>
                </div>
            );
        }
        return this.props.children;
    }
}

export default ErrorBoundary;