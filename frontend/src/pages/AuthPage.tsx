/**
 * AuthPage.tsx — Login, register, email verification, and password reset.
 *
 * Tabbed UI with four states:
 * 1. Sign In (default)
 * 2. Sign Up (register)
 * 3. Verify Email (after registration)
 * 4. Forgot Password (reset flow)
 *
 * On successful sign-in, refreshes the auth context which triggers
 * navigation to the protected generator page.
 */

import { useState, type FormEvent } from "react";
import { useAuth } from "../auth";

// Auth functions are loaded dynamically to avoid eagerly importing
// amazon-cognito-identity-js (which needs Buffer polyfill).
const authModule = () => import("../auth/authService");

type AuthView = "signIn" | "signUp" | "verify" | "forgotPassword" | "resetPassword";

export default function AuthPage() {
  const { refreshSession } = useAuth();

  // Support ?view=forgotPassword from Account page "Change password" link
  const initialView = (): AuthView => {
    const params = new URLSearchParams(window.location.search);
    const v = params.get("view");
    if (v === "forgotPassword" || v === "signUp" || v === "signIn") return v;
    return "signIn";
  };

  const [view, setView] = useState<AuthView>(initialView);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [confirmCode, setConfirmCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  function clearMessages() {
    setError(null);
    setSuccess(null);
  }

  async function handleSignIn(e: FormEvent) {
    e.preventDefault();
    clearMessages();
    setIsLoading(true);
    try {
      await (await authModule()).signIn(email, password);
      await refreshSession();
    } catch (err: any) {
      if (err?.code === "UserNotConfirmedException") {
        setView("verify");
        setError("Please verify your email before signing in.");
      } else {
        setError(err?.message || "Sign in failed. Please try again.");
      }
    } finally {
      setIsLoading(false);
    }
  }

  async function handleSignUp(e: FormEvent) {
    e.preventDefault();
    clearMessages();
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError("Name is required.");
      return;
    }
    setIsLoading(true);
    try {
      const result = await (await authModule()).signUp(email, password, trimmedName);
      if (!result.userConfirmed) {
        setView("verify");
        setSuccess("Account created! Check your email for a verification code.");
      } else {
        await (await authModule()).signIn(email, password);
        await refreshSession();
      }
    } catch (err: any) {
      setError(err?.message || "Registration failed. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleVerify(e: FormEvent) {
    e.preventDefault();
    clearMessages();
    setIsLoading(true);
    try {
      await (await authModule()).confirmSignUp(email, confirmCode);
      setSuccess("Email verified! You can now sign in.");
      setView("signIn");
    } catch (err: any) {
      setError(err?.message || "Verification failed. Please check the code and try again.");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleResendCode() {
    clearMessages();
    try {
      await (await authModule()).resendConfirmationCode(email);
      setSuccess("Verification code resent. Check your email.");
    } catch (err: any) {
      setError(err?.message || "Could not resend code.");
    }
  }

  async function handleForgotPassword(e: FormEvent) {
    e.preventDefault();
    clearMessages();
    setIsLoading(true);
    try {
      await (await authModule()).forgotPassword(email);
      setSuccess("Password reset code sent to your email.");
      setView("resetPassword");
    } catch (err: any) {
      setError(err?.message || "Could not initiate password reset.");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleResetPassword(e: FormEvent) {
    e.preventDefault();
    clearMessages();
    setIsLoading(true);
    try {
      await (await authModule()).confirmPassword(email, confirmCode, newPassword);
      setSuccess("Password reset successful! You can now sign in.");
      setView("signIn");
    } catch (err: any) {
      setError(err?.message || "Password reset failed.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-header">
          <h1 className="auth-title">RojAI</h1>
          <p className="auth-subtitle">AI Listing Generator</p>
        </div>

        {error && <div className="auth-message auth-message--error">{error}</div>}
        {success && <div className="auth-message auth-message--success">{success}</div>}

        {/* ── Sign In ─────────────────────────────────────────────────── */}
        {view === "signIn" && (
          <form onSubmit={handleSignIn} className="auth-form">
            <h2 className="auth-form-title">Sign In</h2>
            <div className="auth-field">
              <label htmlFor="email">Email</label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                disabled={isLoading}
              />
            </div>
            <div className="auth-field">
              <label htmlFor="password">Password</label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                disabled={isLoading}
              />
            </div>
            <button type="submit" className="auth-btn" disabled={isLoading}>
              {isLoading ? "Signing in..." : "Sign In"}
            </button>
            <div className="auth-links">
              <button type="button" className="auth-link" onClick={() => { clearMessages(); setView("signUp"); }}>
                Create an account
              </button>
              <button type="button" className="auth-link" onClick={() => { clearMessages(); setView("forgotPassword"); }}>
                Forgot password?
              </button>
            </div>
          </form>
        )}

        {/* ── Sign Up ─────────────────────────────────────────────────── */}
        {view === "signUp" && (
          <form onSubmit={handleSignUp} className="auth-form">
            <h2 className="auth-form-title">Create Account</h2>
            <p className="auth-form-desc">
              Register for free — 5 AI listing generations per month.
            </p>
            <div className="auth-field">
              <label htmlFor="signup-name">Name</label>
              <input
                id="signup-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                autoComplete="name"
                disabled={isLoading}
                placeholder="Your name"
              />
            </div>
            <div className="auth-field">
              <label htmlFor="signup-email">Email</label>
              <input
                id="signup-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                disabled={isLoading}
              />
            </div>
            <div className="auth-field">
              <label htmlFor="signup-password">Password</label>
              <input
                id="signup-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="new-password"
                minLength={8}
                disabled={isLoading}
              />
              <span className="auth-hint">Min 8 characters, uppercase, lowercase, number</span>
            </div>
            <button type="submit" className="auth-btn" disabled={isLoading}>
              {isLoading ? "Creating account..." : "Create Account"}
            </button>
            <div className="auth-links">
              <button type="button" className="auth-link" onClick={() => { clearMessages(); setView("signIn"); }}>
                Already have an account? Sign in
              </button>
            </div>
          </form>
        )}

        {/* ── Verify Email ────────────────────────────────────────────── */}
        {view === "verify" && (
          <form onSubmit={handleVerify} className="auth-form">
            <h2 className="auth-form-title">Verify Email</h2>
            <p className="auth-form-desc">
              Enter the 6-digit code sent to <strong>{email}</strong>.
            </p>
            <div className="auth-field">
              <label htmlFor="verify-code">Verification Code</label>
              <input
                id="verify-code"
                type="text"
                inputMode="numeric"
                value={confirmCode}
                onChange={(e) => setConfirmCode(e.target.value)}
                required
                maxLength={6}
                disabled={isLoading}
                autoComplete="one-time-code"
              />
            </div>
            <button type="submit" className="auth-btn" disabled={isLoading}>
              {isLoading ? "Verifying..." : "Verify Email"}
            </button>
            <div className="auth-links">
              <button type="button" className="auth-link" onClick={handleResendCode}>
                Resend code
              </button>
              <button type="button" className="auth-link" onClick={() => { clearMessages(); setView("signIn"); }}>
                Back to sign in
              </button>
            </div>
          </form>
        )}

        {/* ── Forgot Password ─────────────────────────────────────────── */}
        {view === "forgotPassword" && (
          <form onSubmit={handleForgotPassword} className="auth-form">
            <h2 className="auth-form-title">Reset Password</h2>
            <p className="auth-form-desc">
              Enter your email and we'll send a reset code.
            </p>
            <div className="auth-field">
              <label htmlFor="forgot-email">Email</label>
              <input
                id="forgot-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                disabled={isLoading}
              />
            </div>
            <button type="submit" className="auth-btn" disabled={isLoading}>
              {isLoading ? "Sending..." : "Send Reset Code"}
            </button>
            <div className="auth-links">
              <button type="button" className="auth-link" onClick={() => { clearMessages(); setView("signIn"); }}>
                Back to sign in
              </button>
            </div>
          </form>
        )}

        {/* ── Reset Password (enter code + new password) ──────────────── */}
        {view === "resetPassword" && (
          <form onSubmit={handleResetPassword} className="auth-form">
            <h2 className="auth-form-title">Set New Password</h2>
            <p className="auth-form-desc">
              Enter the code from your email and your new password.
            </p>
            <div className="auth-field">
              <label htmlFor="reset-code">Reset Code</label>
              <input
                id="reset-code"
                type="text"
                inputMode="numeric"
                value={confirmCode}
                onChange={(e) => setConfirmCode(e.target.value)}
                required
                maxLength={6}
                disabled={isLoading}
                autoComplete="one-time-code"
              />
            </div>
            <div className="auth-field">
              <label htmlFor="new-password">New Password</label>
              <input
                id="new-password"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                minLength={8}
                autoComplete="new-password"
                disabled={isLoading}
              />
            </div>
            <button type="submit" className="auth-btn" disabled={isLoading}>
              {isLoading ? "Resetting..." : "Reset Password"}
            </button>
            <div className="auth-links">
              <button type="button" className="auth-link" onClick={() => { clearMessages(); setView("signIn"); }}>
                Back to sign in
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
