/**
 * UsageDisplay.tsx — Shows the user's current plan, remaining generations, and reset date.
 */

import { useEffect, useState } from "react";
import { useAuth } from "../auth";
import { fetchUsage, type UsageInfo } from "../services/listingService";

export default function UsageDisplay() {
  const { idToken } = useAuth();
  const [usage, setUsage] = useState<UsageInfo | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!idToken) return;
    let cancelled = false;

    fetchUsage(idToken)
      .then((data) => {
        if (!cancelled) setUsage(data);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });

    return () => {
      cancelled = true;
    };
  }, [idToken]);

  if (error) return null; // Fail silently — non-critical UI
  if (!usage) return null;

  const remaining = Math.max(0, usage.monthlyLimit - usage.generationCount);
  const resetFormatted = new Date(usage.resetDate).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });

  return (
    <div className="usage-display" aria-label="Usage information">
      <div className="usage-display__plan">
        <span className="usage-display__badge">
          {usage.plan === "free" ? "Free" : "Seller"}
        </span>
      </div>
      <div className="usage-display__stats">
        <span className="usage-display__remaining">
          <strong>{remaining}</strong> / {usage.monthlyLimit} generations left
        </span>
        <span className="usage-display__reset">
          Resets {resetFormatted}
        </span>
      </div>
    </div>
  );
}
