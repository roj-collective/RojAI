import type { RecommendationResponse } from "../services/recommendations.server";

interface RecommendationCardProps {
  recommendation: RecommendationResponse;
}

/**
 * Displays an AI-generated recommendation with all returned fields:
 * title, bullet points, description, SEO keywords, tags, and source.
 */
export function RecommendationCard({ recommendation }: RecommendationCardProps) {
  return (
    <s-section heading="AI Recommendation">
      <s-stack direction="block" gap="base">
        <s-box padding="base" borderWidth="base" borderRadius="base">
          <s-text>
            <strong>Suggested title:</strong> {recommendation.title}
          </s-text>
        </s-box>

        <s-box padding="base" borderWidth="base" borderRadius="base">
          <s-text>
            <strong>Bullet points:</strong>
          </s-text>
          <ul style={{ margin: "8px 0 0 16px", padding: 0 }}>
            {recommendation.bulletPoints.map((bp, i) => (
              <li key={i} style={{ marginBottom: "4px" }}>
                <s-text>{bp}</s-text>
              </li>
            ))}
          </ul>
        </s-box>

        <s-box padding="base" borderWidth="base" borderRadius="base">
          <s-text>
            <strong>Description:</strong> {recommendation.description}
          </s-text>
        </s-box>

        <s-box padding="base" borderWidth="base" borderRadius="base">
          <s-text>
            <strong>SEO keywords:</strong> {recommendation.seoKeywords.join(", ")}
          </s-text>
        </s-box>

        <s-box padding="base" borderWidth="base" borderRadius="base">
          <s-text>
            <strong>Tags:</strong> {recommendation.tags.join(", ")}
          </s-text>
        </s-box>

        <s-box padding="base" borderWidth="base" borderRadius="base">
          <s-badge tone="info">
            Source: {recommendation.metadata.source}
          </s-badge>
        </s-box>
      </s-stack>
    </s-section>
  );
}
