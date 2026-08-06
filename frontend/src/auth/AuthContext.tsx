/**
 * AuthContext.tsx — React context providing authentication state.
 *
 * Cognito SDK (amazon-cognito-identity-js) is loaded via dynamic import
 * to avoid eagerly pulling in Node.js Buffer polyfills at module load time.
 * This is required for Vite browser compatibility.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

interface AuthState {
  isAuthenticated: boolean;
  isLoading: boolean;
  userEmail: string | null;
  idToken: string | null;
}

interface AuthContextValue extends AuthState {
  refreshSession: () => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    isAuthenticated: false,
    isLoading: true,
    userEmail: null,
    idToken: null,
  });

  const checkSession = useCallback(async () => {
    try {
      // Dynamic import: Cognito SDK only loaded at runtime (not at module parse time)
      const { getSession, getUserEmail } = await import("./authService");
      const session = await getSession();
      if (session && session.isValid()) {
        const token = session.getIdToken().getJwtToken();
        const email = getUserEmail();
        setState({
          isAuthenticated: true,
          isLoading: false,
          userEmail: email,
          idToken: token,
        });
      } else {
        setState({
          isAuthenticated: false,
          isLoading: false,
          userEmail: null,
          idToken: null,
        });
      }
    } catch {
      setState({
        isAuthenticated: false,
        isLoading: false,
        userEmail: null,
        idToken: null,
      });
    }
  }, []);

  useEffect(() => {
    checkSession();
  }, [checkSession]);

  const refreshSession = useCallback(async () => {
    await checkSession();
  }, [checkSession]);

  const logout = useCallback(() => {
    import("./authService").then(({ signOut }) => signOut());
    setState({
      isAuthenticated: false,
      isLoading: false,
      userEmail: null,
      idToken: null,
    });
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      ...state,
      refreshSession,
      logout,
    }),
    [state, refreshSession, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return ctx;
}
