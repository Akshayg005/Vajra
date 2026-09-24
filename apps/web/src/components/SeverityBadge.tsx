import { AlertTriangle, CheckCircle2, Eye, Siren } from 'lucide-react';
import type { Severity } from '@vajra/contracts';

const META: Record<Severity, { label: string; action: string; cls: string; Icon: typeof Siren }> = {
  green: { label: 'GREEN', action: 'No warning', cls: 'bg-sev-green/15 text-sev-green border-sev-green/40', Icon: CheckCircle2 },
  yellow: { label: 'YELLOW', action: 'Be updated', cls: 'bg-sev-yellow/15 text-sev-yellow border-sev-yellow/40', Icon: Eye },
  orange: { label: 'ORANGE', action: 'Be prepared', cls: 'bg-sev-orange/15 text-sev-orange border-sev-orange/40', Icon: AlertTriangle },
  red: { label: 'RED', action: 'Take action', cls: 'bg-sev-red/20 text-sev-red border-sev-red/50', Icon: Siren },
};

/** IMD colour code — always shown with an icon and text (never colour alone). */
export function SeverityBadge({ severity, compact, withAction }: { severity: Severity; compact?: boolean; withAction?: boolean }) {
  const m = META[severity];
  return (
    <span className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] font-bold tracking-wider ${m.cls}`}>
      <m.Icon className={compact ? 'h-3 w-3' : 'h-3.5 w-3.5'} strokeWidth={2.5} />
      {m.label}
      {withAction && <span className="font-medium normal-case tracking-normal opacity-80">· {m.action}</span>}
    </span>
  );
}
