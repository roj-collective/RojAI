import type { Finding } from "../lib/quality-scorer";
import { severityTone } from "./ScoreBadge";

interface FindingsListProps {
  findings: Finding[];
}

/**
 * Displays a list of quality findings with severity badges,
 * field names, messages, and point deductions.
 */
export function FindingsList({ findings }: FindingsListProps) {
  if (findings.length === 0) {
    return (
      <s-section heading="Findings">
        <s-paragraph>
          No quality issues found. This product listing meets all criteria.
        </s-paragraph>
      </s-section>
    );
  }

  return (
    <s-section heading={`Findings (${findings.length})`}>
      <s-stack direction="block" gap="base">
        {findings.map((finding, i) => (
          <s-box
            key={i}
            padding="base"
            borderWidth="base"
            borderRadius="base"
          >
            <s-stack direction="inline" gap="base">
              <s-badge tone={severityTone(finding.severity)}>
                {finding.severity.toUpperCase()}
              </s-badge>
              <s-text>
                <strong>{finding.field}:</strong> {finding.message} (−
                {finding.pointsDeducted} pts)
              </s-text>
            </s-stack>
          </s-box>
        ))}
      </s-stack>
    </s-section>
  );
}
