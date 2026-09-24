import { Component, type ErrorInfo, type ReactNode } from 'react';
import { RotateCcw, TriangleAlert } from 'lucide-react';

interface Props {
  name: string;
  children: ReactNode;
}
interface State {
  error: Error | null;
}

/** One boundary per route: a broken panel never takes down the command center. */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };
  static getDerivedStateFromError(error: Error): State {
    return { error };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    // surfaced in the console for developers; the user sees the recovery card
    console.warn(`[VAJRA] ${this.props.name} crashed`, error, info.componentStack);
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="grid h-full place-items-center p-6">
        <div className="panel max-w-md p-5 text-center">
          <TriangleAlert className="mx-auto h-8 w-8 text-sev-orange" />
          <div className="mt-2 text-base font-semibold text-white">{this.props.name} hit a problem</div>
          <p className="mt-1 text-sm text-slate-400">The engine is still running. Reload this panel to continue.</p>
          <button className="btn btn-primary mt-3" onClick={() => this.setState({ error: null })}>
            <RotateCcw className="h-4 w-4" /> Reload panel
          </button>
        </div>
      </div>
    );
  }
}
