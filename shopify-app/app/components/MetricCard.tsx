interface MetricCardProps {
  value: number | string;
  label: string;
}

/**
 * Displays a single metric value with a label in a bordered card.
 */
export function MetricCard({ value, label }: MetricCardProps) {
  return (
    <s-box padding="base" borderWidth="base" borderRadius="base">
      <s-text>
        <strong>{value}</strong> {label}
      </s-text>
    </s-box>
  );
}

interface MetricRowProps {
  children: React.ReactNode;
}

/**
 * A horizontal row of MetricCards.
 */
export function MetricRow({ children }: MetricRowProps) {
  return <s-stack direction="inline" gap="base">{children}</s-stack>;
}
