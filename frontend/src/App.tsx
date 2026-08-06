import { useState, useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate, NavLink } from "react-router-dom";
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
  if (isAuthenticated) return <Navigate to="/" replace />;
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
        <div className="topbar__brand">
          <RojAILogo size={28} layout="horizontal" />
        </div>

        {isAuthenticated && (
          <nav className="topbar__nav" aria-label="Main navigation">
            <NavLink
              to="/"
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
          )}
        </div>
      </header>

      <main className="app-content">
        <Routes>
          <Route path="/" element={<ProtectedRoute><GeneratorPage /></ProtectedRoute>} />
          <Route path="/history" element={<ProtectedRoute><HistoryPage /></ProtectedRoute>} />
          <Route path="/account" element={<ProtectedRoute><AccountPage /></ProtectedRoute>} />
          <Route path="/auth" element={<AuthRoute><AuthPage /></AuthRoute>} />
          <Route path="*" element={<Navigate to="/" replace />} />
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
