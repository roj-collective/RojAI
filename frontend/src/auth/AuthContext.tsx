/**
 * AuthContext.tsx — React context providing authentication state.
 *
 * Wraps the app to provide:
 * - isAuthenticated: whether the user has a valid session
 * - isLoading: whether the initial session check is in progress
 * - userEmail: the signed-in user's email
 * - login/logout/refresh functions
 *
 * On mount, checks for an existing valid Cognito session in localStorage.
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

import { getSession, getUserEmail, signOut } from "./authService";

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
    signOut();
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
