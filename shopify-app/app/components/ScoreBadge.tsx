import { getScoreBadge, type BadgeTone } from "../lib/quality-scorer";

interface ScoreBadgeProps {
  score: number;
  showLabel?: boolean;
}

/**
 * Displays a quality score as a Polaris badge with appropriate tone.
 * Score ≥80 = success, ≥60 = warning, <60 = critical.
 */
export function ScoreBadge({ score, showLabel = false }: ScoreBadgeProps) {
  const { label, tone } = getScoreBadge(score);
  return (
    <s-badge tone={tone}>
      {score}/100{showLabel ? ` — ${label}` : ""}
    </s-badge>
  );
}

/**
 * Maps a finding severity to the appropriate badge tone.
 */
export function severityTone(severity: string): BadgeTone {
  if (severity === "critical" || severity === "high") return "critical";
  if (severity === "medium") return "warning";
  return "info";
}
