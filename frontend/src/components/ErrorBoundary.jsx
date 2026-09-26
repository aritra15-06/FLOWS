import React from 'react';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
    this.setState({ errorInfo });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          padding: '24px',
          background: '#fff1f2',
          color: '#881337',
          borderRadius: '10px',
          margin: '16px',
          border: '1px solid #fecdd3',
          boxShadow: '0 4px 12px rgba(225, 29, 72, 0.08)',
          fontFamily: 'sans-serif'
        }}>
          <h2 style={{ color: '#e11d48', marginBottom: '8px', fontSize: '1.1rem', fontWeight: 800 }}>⚠️ Component Rendering Notice</h2>
          <p style={{ color: '#4c0519', marginBottom: '12px', fontSize: '0.85rem' }}>
            {this.props.fallbackMessage || 'A dashboard section encountered an issue while rendering.'}
          </p>
          <pre style={{
            background: '#ffffff',
            padding: '12px',
            borderRadius: '6px',
            fontSize: '12px',
            color: '#be123c',
            border: '1px solid #f43f5e',
            overflowX: 'auto',
            whiteSpace: 'pre-wrap'
          }}>
            {this.state.error?.toString()}
          </pre>
          <button
            onClick={() => this.setState({ hasError: false, error: null, errorInfo: null })}
            style={{
              marginTop: '12px',
              padding: '8px 16px',
              background: '#e11d48',
              color: '#fff',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontWeight: 700
            }}
          >
            Retry Section
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
