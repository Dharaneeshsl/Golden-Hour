import React from "react";

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("React ErrorBoundary caught an exception:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="panel error-box" style={{ margin: "2rem auto", maxWidth: "600px", padding: "2rem" }}>
          <h2>Something went wrong</h2>
          <p className="muted">An unexpected UI render error occurred.</p>
          <p className="error">{this.state.error?.message || "Render error"}</p>
          <button
            className="primary"
            style={{ marginTop: "1rem" }}
            onClick={() => {
              this.setState({ hasError: false, error: null });
              window.location.reload();
            }}
          >
            Reload Application
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
