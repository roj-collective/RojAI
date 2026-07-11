/**
 * RojAILogo — inline SVG logo component.
 *
 * The woven kilim mark uses the brand palette extracted from the original
 * RojKilim mark: crimson red (#c8132a), olive green (#8a9a2e), warm tan (#c9a87c).
 * The wordmark reads "ROJAI" in a clean, tracked sans-serif style.
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
  const markSize = size;

  const mark = (
    <svg
      width={markSize}
      height={markSize}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      style={{ flexShrink: 0 }}
    >
      {/* Tan / beige horizontal strands */}
      <rect x="10" y="27" width="20" height="10" rx="3" fill="#c9a87c" />
      <rect x="34" y="27" width="20" height="10" rx="3" fill="#c9a87c" />

      {/* Olive accent squares */}
      <rect x="28" y="8"  width="8" height="8" rx="2" fill="#8a9a2e" />
      <rect x="28" y="48" width="8" height="8" rx="2" fill="#8a9a2e" />
      <rect x="8"  y="28" width="8" height="8" rx="2" fill="#8a9a2e" />
      <rect x="48" y="28" width="8" height="8" rx="2" fill="#8a9a2e" />

      {/* Red diagonal bars — top-left to bottom-right */}
      <rect
        x="18" y="14" width="22" height="9" rx="4"
        fill="#c8132a"
        transform="rotate(45 29 18.5)"
      />
      {/* Red diagonal bars — top-right to bottom-left */}
      <rect
        x="24" y="14" width="22" height="9" rx="4"
        fill="#c8132a"
        transform="rotate(-45 35 18.5)"
      />
      {/* Red diagonal bars — bottom crossing */}
      <rect
        x="18" y="41" width="22" height="9" rx="4"
        fill="#c8132a"
        transform="rotate(-45 29 45.5)"
      />
      <rect
        x="24" y="41" width="22" height="9" rx="4"
        fill="#c8132a"
        transform="rotate(45 35 45.5)"
      />
    </svg>
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
