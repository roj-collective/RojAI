/**
 * UpgradePrompt.tsx — Shown when the user has exhausted their free plan allowance.
 *
 * Displays a clear message about the limit, when it resets, and a placeholder
 * upgrade CTA (Stripe integration will come in Phase 2).
 */

interface UpgradePromptProps {
  resetsAt?: string;
  message?: string;
}

export default function UpgradePrompt({ resetsAt, message }: UpgradePromptProps) {
  const resetFormatted = resetsAt
    ? new Date(resetsAt).toLocaleDateString(undefined, {
        month: "long",
        day: "numeric",
        year: "numeric",
      })
    : "next month";

  return (
    <div className="upgrade-prompt" role="alert">
      <div className="upgrade-prompt__icon" aria-hidden="true">
        ⚡
      </div>
      <h3 className="upgrade-prompt__title">Free Plan Limit Reached</h3>
      <p className="upgrade-prompt__message">
        {message || "You've used all your free AI generations for this month."}
      </p>
      <p className="upgrade-prompt__reset">
        Your allowance resets on <strong>{resetFormatted}</strong>.
      </p>
      <div className="upgrade-prompt__cta">
        <p className="upgrade-prompt__plan-info">
          <strong>Seller Plan — $9/month</strong>
          <br />
          100 generations/month, 3 regenerations per listing, full listing history,
          brand-voice settings, and platform-specific output.
        </p>
        <button
          type="button"
          className="upgrade-prompt__btn"
          disabled
          title="Coming soon"
        >
          Upgrade to Seller (Coming Soon)
        </button>
      </div>
    </div>
  );
}
