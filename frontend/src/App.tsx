import { useState, useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import GeneratorPage from "./pages/GeneratorPage";
import AuthPage from "./pages/AuthPage";
import RojAILogo from "./components/RojAILogo";
import UsageDisplay from "./components/UsageDisplay";
import { AuthProvider, useAuth } from "./auth";

type Theme = "light" | "dark";

function getInitialTheme(): Theme {
  if (typeof window === "undefined") return "light";
  const stored = localStorage.getItem("rojai-theme") as Theme | null;
  if (stored === "light" || stored === "dark") return stored;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

/** Wrapper that redirects unauthenticated users to /auth */
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="app-loading">
        <p>Loading...</p>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/auth" replace />;
  }

  return <>{children}</>;
}

/** Redirects authenticated users away from /auth */
function AuthRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="app-loading">
        <p>Loading...</p>
      </div>
    );
  }

  if (isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}

function AppShell() {
  const [theme, setTheme] = useState<Theme>(getInitialTheme);
  const { isAuthenticated, userEmail, logout } = useAuth();

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("rojai-theme", theme);
  }, [theme]);

  function toggleTheme() {
    setTheme((t) => (t === "light" ? "dark" : "light"));
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        {/* Brand */}
        <div className="topbar__brand">
          <RojAILogo size={28} layout="horizontal" />
        </div>

        {/* Navigation */}
        <nav className="topbar__nav" aria-label="Main navigation">
          <a href="/" className="topbar__link topbar__link--active">
            AI Listings
          </a>
          <span className="topbar__link topbar__link--soon" title="Coming soon">
            Analytics
          </span>
          <span className="topbar__link topbar__link--soon" title="Coming soon">
            Settings
          </span>
        </nav>

        {/* Right-side actions */}
        <div className="topbar__actions">
          {isAuthenticated && <UsageDisplay />}
          <button
            type="button"
            className="theme-toggle"
            onClick={toggleTheme}
            aria-label={theme === "light" ? "Switch to dark mode" : "Switch to light mode"}
            title={theme === "light" ? "Dark mode" : "Light mode"}
          >
            {theme === "light" ? "🌙" : "☀️"}
          </button>
          {isAuthenticated ? (
            <div className="topbar__user">
              <span className="topbar__email" title={userEmail || ""}>
                {userEmail?.split("@")[0] || "User"}
              </span>
              <button
                type="button"
                className="topbar__logout"
                onClick={logout}
                title="Sign out"
              >
                Sign out
              </button>
            </div>
          ) : (
            <a href="/auth" className="topbar__link">
              Sign in
            </a>
          )}
        </div>
      </header>

      <div className="app-content">
        <Routes>
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <GeneratorPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/auth"
            element={
              <AuthRoute>
                <AuthPage />
              </AuthRoute>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppShell />
      </AuthProvider>
    </BrowserRouter>
  );
}
