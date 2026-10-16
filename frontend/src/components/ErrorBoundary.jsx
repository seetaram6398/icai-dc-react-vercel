import { Component } from 'react';

class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null, info: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    this.setState({ info });
    console.error('ErrorBoundary caught:', error, info);
  }

  render() {
    if (this.state.error) {
      const stack = this.state.info?.componentStack || this.state.error?.stack || '';
      return (
        <div style={{ padding: 24, fontFamily: 'Menlo, Consolas, monospace', fontSize: 12 }}>
          <div className="alert alert-danger">
            <div className="fw-bold mb-2">The page crashed. Error message:</div>
            <pre style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{String(this.state.error?.message || this.state.error)}</pre>
          </div>
          {stack && (
            <details>
              <summary style={{ cursor: 'pointer', color: '#0b3a67' }}>Show stack trace</summary>
              <pre style={{ whiteSpace: 'pre-wrap', color: '#666', marginTop: 8 }}>{stack}</pre>
            </details>
          )}
        </div>
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;