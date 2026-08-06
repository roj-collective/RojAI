import { useState, useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate, NavLink, useLocation } from "react-router-dom";
import HomePage from "./pages/HomePage";
import GeneratorPage from "./pages/GeneratorPage";
import HistoryPage from "./pages/HistoryPage";
import AccountPage from "./pages/AccountPage";
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

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();
  if (isLoading) return <div className="app-loading"><p>Loading...</p></div>;
  if (!isAuthenticated) return <Navigate to="/auth" replace />;
  return <>{children}</>;
}

function AuthRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();
  if (isLoading) return <div className="app-loading"><p>Loading...</p></div>;
  if (isAuthenticated) return <Navigate to="/app" replace />;
  return <>{children}</>;
}

function AppShell() {
  const [theme, setTheme] = useState<Theme>(getInitialTheme);
  const { isAuthenticated, userName, userEmail, logout } = useAuth();
  const location = useLocation();

  // Public pages don't show the app chrome (topbar with nav)
  const isPublicPage = location.pathname === "/" || location.pathname === "/privacy" || location.pathname === "/terms";

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("rojai-theme", theme);
  }, [theme]);

  function toggleTheme() {
    setTheme((t) => (t === "light" ? "dark" : "light"));
  }

  // Public page layout (homepage, privacy, terms)
  if (isPublicPage) {
    return (
      <div className="app-shell">
        <header className="topbar">
          <div className="topbar__brand">
            <a href="/" style={{ textDecoration: "none" }}>
              <RojAILogo size={28} layout="horizontal" />
            </a>
          </div>
          <div className="topbar__actions">
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
              <a href="/app" className="btn btn--primary btn--sm">Dashboard</a>
            ) : (
              <>
                <a href="/auth" className="topbar__link">Sign In</a>
                <a href="/auth" className="btn btn--primary btn--sm">Get Started</a>
              </>
            )}
          </div>
        </header>
        <main className="app-content">
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/privacy" element={<div className="static-page"><h1>Privacy Policy</h1><p>Coming soon.</p></div>} />
            <Route path="/terms" element={<div className="static-page"><h1>Terms of Service</h1><p>Coming soon.</p></div>} />
          </Routes>
        </main>
      </div>
    );
  }

  // Authenticated app layout
  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="topbar__brand">
          <a href="/" style={{ textDecoration: "none" }}>
            <RojAILogo size={28} layout="horizontal" />
          </a>
        </div>

        {isAuthenticated && (
          <nav className="topbar__nav" aria-label="Main navigation">
            <NavLink
              to="/app"
              end
              className={({ isActive }) =>
                `topbar__link ${isActive ? "topbar__link--active" : ""}`
              }
            >
              AI Listings
            </NavLink>
            <NavLink
              to="/history"
              className={({ isActive }) =>
                `topbar__link ${isActive ? "topbar__link--active" : ""}`
              }
            >
              History
            </NavLink>
            <NavLink
              to="/account"
              className={({ isActive }) =>
                `topbar__link ${isActive ? "topbar__link--active" : ""}`
              }
            >
              Account
            </NavLink>
          </nav>
        )}

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
          {isAuthenticated && (
            <div className="topbar__user">
              <span className="topbar__email" title={userEmail || ""}>
                {userName || "User"}
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
          )}
        </div>
      </header>

      <main className="app-content">
        <Routes>
          <Route path="/app" element={<ProtectedRoute><GeneratorPage /></ProtectedRoute>} />
          <Route path="/history" element={<ProtectedRoute><HistoryPage /></ProtectedRoute>} />
          <Route path="/account" element={<ProtectedRoute><AccountPage /></ProtectedRoute>} />
          <Route path="/auth" element={<AuthRoute><AuthPage /></AuthRoute>} />
          <Route path="*" element={<Navigate to="/app" replace />} />
        </Routes>
      </main>
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
