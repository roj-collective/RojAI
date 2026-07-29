/**
 * RojAILogo — Logo component using the official RojAI woven kilim mark.
 *
 * Props:
 *  size   — controls the height of the mark (default 32px).
 *  layout — "mark-only" shows just the icon; "horizontal" shows icon + wordmark side
 *           by side (default); "stacked" shows icon above wordmark.
 */

interface RojAILogoProps {
  size?: number;
  layout?: "horizontal" | "stacked" | "mark-only";
  className?: string;
}

export default function RojAILogo({
  size = 32,
  layout = "horizontal",
  className = "",
}: RojAILogoProps) {
  const mark = (
    <img
      src="/rojai-logo.png"
      alt="RojAI"
      width={size}
      height={size}
      style={{ flexShrink: 0, objectFit: "contain" }}
    />
  );

  const wordmark = (
    <span
      style={{
        fontSize: size * 0.56,
        fontWeight: 700,
        letterSpacing: "0.12em",
        color: "var(--color-text)",
        lineHeight: 1,
        userSelect: "none",
      }}
    >
      ROJAI
    </span>
  );

  const subtag =
    layout === "stacked" ? (
      <span
        style={{
          fontSize: size * 0.28,
          fontWeight: 500,
          letterSpacing: "0.06em",
          color: "var(--color-text-secondary)",
          textTransform: "uppercase" as const,
          marginTop: 2,
        }}
      >
        AI Marketplace Assistant
      </span>
    ) : null;

  if (layout === "mark-only") return <span className={className}>{mark}</span>;

  if (layout === "stacked") {
    return (
      <span
        className={className}
        style={{
          display: "inline-flex",
          flexDirection: "column",
          alignItems: "center",
          gap: size * 0.18,
        }}
      >
        {mark}
        {wordmark}
        {subtag}
      </span>
    );
  }

  // Default: horizontal
  return (
    <span
      className={className}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: size * 0.28,
      }}
    >
      {mark}
      {wordmark}
    </span>
  );
}
