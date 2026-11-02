import { Component, type ErrorInfo, type ReactNode } from "react";

export class ErrorBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(_error: Error, _info: ErrorInfo) {
    /* Never log messages or credentials. */
  }
  render() {
    if (this.state.failed)
      return (
        <main
          style={{
            minHeight: "100vh",
            display: "grid",
            placeContent: "center",
            gap: 16,
            padding: 32,
            background: "#111114",
            color: "#eeedf2",
            fontFamily: "sans-serif",
          }}
        >
          <h1>Vamos tentar de novo.</h1>
          <p>
            A interface não conseguiu abrir. Sua biblioteca permanece neste
            dispositivo.
          </p>
          <button
            onClick={() => location.reload()}
            style={{ padding: "12px 20px", cursor: "pointer" }}
          >
            Reabrir Gemdrop
          </button>
        </main>
      );
    return this.props.children;
  }
}
