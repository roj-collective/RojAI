import { useState, useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import GeneratorPage from "./pages/GeneratorPage";
import RojAILogo from "./components/RojAILogo";

type Theme = "light" | "dark";

function getInitialTheme(): Theme {
  if (typeof window === "undefined") return "light";
  const stored = localStorage.getItem("rojai-theme") as Theme | null;
  if (stored === "light" || stored === "dark") return stored;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export default function App() {
  const [theme, setTheme] = useState<Theme>(getInitialTheme);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("rojai-theme", theme);
  }, [theme]);

  function toggleTheme() {
    setTheme((t) => (t === "light" ? "dark" : "light"));
  }

  return (
    <BrowserRouter>
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
            <span className="topbar__tagline">AI Marketplace Assistant</span>
            <button
              type="button"
              className="theme-toggle"
              onClick={toggleTheme}
              aria-label={theme === "light" ? "Switch to dark mode" : "Switch to light mode"}
              title={theme === "light" ? "Dark mode" : "Light mode"}
            >
              {theme === "light" ? "🌙" : "☀️"}
            </button>
            <div className="avatar" aria-label="User avatar" title="Account">
              RJ
            </div>
          </div>
        </header>

        <div className="app-content">
          <Routes>
            <Route path="/" element={<GeneratorPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </div>
      </div>
    </BrowserRouter>
  );
}
