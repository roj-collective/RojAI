/**
 * AccountPage.tsx — User account settings and preferences.
 *
 * Design decision: Default listing preferences (marketplace, language, tone,
 * brand) are stored in localStorage for Phase 1. This avoids provisioning
 * a separate DynamoDB settings table before the feature is validated.
 *
 * Preferences are per-device. A future version may sync them server-side.
 */

import { useState, useEffect } from "react";
import { useAuth } from "../auth";
import type { Marketplace, Language, Tone } from "../types/listing";

const PREFS_KEY = "rojai-user-preferences";

interface UserPreferences {
  marketplace: Marketplace;
  language: Language;
  tone: Tone;
  brand: string;
}

const DEFAULT_PREFS: UserPreferences = {
  marketplace: "shopify",
  language: "en",
  tone: "professional",
  brand: "",
};

export function getUserPreferences(): UserPreferences {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (!raw) return DEFAULT_PREFS;
    return { ...DEFAULT_PREFS, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_PREFS;
  }
}

export function saveUserPreferences(prefs: UserPreferences): void {
  localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
}

export default function AccountPage() {
  const { userEmail, logout, idToken } = useAuth();
  const [prefs, setPrefs] = useState<UserPreferences>(getUserPreferences);
  const [saved, setSaved] = useState(false);
  const [usage, setUsage] = useState<{ generationCount: number; monthlyLimit: number; plan: string; resetDate: string } | null>(null);

  useEffect(() => {
    if (!idToken) return;
    const apiUrl = import.meta.env.VITE_API_BASE_URL || "";
    fetch(`${apiUrl}/web/usage`, { headers: { Authorization: `Bearer ${idToken}` } })
      .then((r) => r.json())
      .then(setUsage)
      .catch(() => {});
  }, [idToken]);

  function handleChange(field: keyof UserPreferences, value: string) {
    setPrefs((p) => ({ ...p, [field]: value }));
    setSaved(false);
  }

  function handleSave() {
    saveUserPreferences(prefs);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div className="account-page">
      <h1 className="account-page__title">Account</h1>

      {/* Account info */}
      <section className="account-section">
        <h2 className="account-section__heading">Account Information</h2>
        <div className="account-field">
          <label className="account-field__label">Email</label>
          <p className="account-field__value">{userEmail || "—"}</p>
        </div>
        <div className="account-field">
          <label className="account-field__label">Password</label>
          <p className="account-field__value">
            ••••••••{" "}
            <a href="/auth?view=forgotPassword" className="account-field__action">
              Change password
            </a>
          </p>
        </div>
      </section>

      {/* Plan & usage */}
      <section className="account-section">
        <h2 className="account-section__heading">Plan & Usage</h2>
        {usage && (
          <div className="account-usage">
            <div className="account-usage__plan">
              <span className="account-usage__badge">
                {usage.plan === "free" ? "Free Plan" : "Seller Plan"}
              </span>
            </div>
            <div className="account-usage__stats">
              <p>
                <strong>{usage.monthlyLimit - usage.generationCount}</strong> of{" "}
                {usage.monthlyLimit} generations remaining this month
              </p>
              <p className="account-usage__reset">
                Resets{" "}
                {new Date(usage.resetDate).toLocaleDateString(undefined, {
                  month: "long",
                  day: "numeric",
                })}
              </p>
            </div>
            {usage.plan === "free" && (
              <button type="button" className="account-upgrade-btn" disabled title="Coming soon">
                Upgrade to Seller — $9/month (Coming Soon)
              </button>
            )}
          </div>
        )}
      </section>

      {/* Default preferences */}
      <section className="account-section">
        <h2 className="account-section__heading">Default Listing Preferences</h2>
        <p className="account-section__note">
          These defaults pre-fill the generator form. Stored locally on this device.
        </p>

        <div className="account-prefs-grid">
          <div className="account-field">
            <label className="account-field__label" htmlFor="pref-marketplace">Marketplace</label>
            <select
              id="pref-marketplace"
              className="account-field__select"
              value={prefs.marketplace}
              onChange={(e) => handleChange("marketplace", e.target.value)}
            >
              <option value="shopify">Shopify</option>
              <option value="etsy">Etsy</option>
              <option value="amazon">Amazon</option>
            </select>
          </div>

          <div className="account-field">
            <label className="account-field__label" htmlFor="pref-language">Language</label>
            <select
              id="pref-language"
              className="account-field__select"
              value={prefs.language}
              onChange={(e) => handleChange("language", e.target.value)}
            >
              <option value="en">English</option>
              <option value="fr">French</option>
              <option value="de">German</option>
              <option value="es">Spanish</option>
              <option value="it">Italian</option>
            </select>
          </div>

          <div className="account-field">
            <label className="account-field__label" htmlFor="pref-tone">Tone</label>
            <select
              id="pref-tone"
              className="account-field__select"
              value={prefs.tone}
              onChange={(e) => handleChange("tone", e.target.value)}
            >
              <option value="professional">Professional</option>
              <option value="luxury">Luxury</option>
              <option value="friendly">Friendly</option>
            </select>
          </div>

          <div className="account-field">
            <label className="account-field__label" htmlFor="pref-brand">Default Brand Name</label>
            <input
              id="pref-brand"
              type="text"
              className="account-field__input"
              value={prefs.brand}
              onChange={(e) => handleChange("brand", e.target.value)}
              placeholder="e.g. RojKilim"
            />
          </div>
        </div>

        <button type="button" className="account-save-btn" onClick={handleSave}>
          {saved ? "Saved ✓" : "Save Preferences"}
        </button>
      </section>

      {/* Sign out */}
      <section className="account-section account-section--signout">
        <button type="button" className="account-signout-btn" onClick={logout}>
          Sign Out
        </button>
      </section>
    </div>
  );
}
