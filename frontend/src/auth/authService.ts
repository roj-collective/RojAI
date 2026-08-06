/**
 * authService.ts — Cognito authentication operations.
 *
 * Provides: signUp, confirmSignUp, signIn, signOut, forgotPassword,
 * confirmPassword, getSession, getIdToken, getCurrentUser.
 *
 * Uses amazon-cognito-identity-js directly (no Amplify SDK).
 * No secrets are stored or exposed — only public User Pool ID and Client ID.
 */

import {
  AuthenticationDetails,
  CognitoUser,
  CognitoUserAttribute,
  CognitoUserPool,
  CognitoUserSession,
} from "amazon-cognito-identity-js";

import { COGNITO_CLIENT_ID, COGNITO_USER_POOL_ID } from "./cognitoConfig";

// ── User Pool instance ──────────────────────────────────────────────────────

function getUserPool(): CognitoUserPool {
  if (!COGNITO_USER_POOL_ID || !COGNITO_CLIENT_ID) {
    throw new Error(
      "Cognito configuration missing. Set VITE_COGNITO_USER_POOL_ID and VITE_COGNITO_CLIENT_ID."
    );
  }
  return new CognitoUserPool({
    UserPoolId: COGNITO_USER_POOL_ID,
    ClientId: COGNITO_CLIENT_ID,
  });
}

function getCognitoUser(email: string): CognitoUser {
  return new CognitoUser({
    Username: email,
    Pool: getUserPool(),
  });
}

// ── Public API ──────────────────────────────────────────────────────────────

export interface SignUpResult {
  userConfirmed: boolean;
  userSub: string;
}

export async function signUp(email: string, password: string): Promise<SignUpResult> {
  const pool = getUserPool();
  const attributes = [
    new CognitoUserAttribute({ Name: "email", Value: email }),
  ];

  return new Promise((resolve, reject) => {
    pool.signUp(email, password, attributes, [], (err, result) => {
      if (err) {
        reject(err);
        return;
      }
      resolve({
        userConfirmed: result?.userConfirmed ?? false,
        userSub: result?.userSub ?? "",
      });
    });
  });
}

export async function confirmSignUp(email: string, code: string): Promise<void> {
  const user = getCognitoUser(email);
  return new Promise((resolve, reject) => {
    user.confirmRegistration(code, true, (err) => {
      if (err) {
        reject(err);
        return;
      }
      resolve();
    });
  });
}

export async function resendConfirmationCode(email: string): Promise<void> {
  const user = getCognitoUser(email);
  return new Promise((resolve, reject) => {
    user.resendConfirmationCode((err) => {
      if (err) {
        reject(err);
        return;
      }
      resolve();
    });
  });
}

export async function signIn(email: string, password: string): Promise<CognitoUserSession> {
  const user = getCognitoUser(email);
  const authDetails = new AuthenticationDetails({
    Username: email,
    Password: password,
  });

  return new Promise((resolve, reject) => {
    user.authenticateUser(authDetails, {
      onSuccess: (session) => resolve(session),
      onFailure: (err) => reject(err),
    });
  });
}

export function signOut(): void {
  const pool = getUserPool();
  const user = pool.getCurrentUser();
  if (user) {
    user.signOut();
  }
}

export async function forgotPassword(email: string): Promise<void> {
  const user = getCognitoUser(email);
  return new Promise((resolve, reject) => {
    user.forgotPassword({
      onSuccess: () => resolve(),
      onFailure: (err) => reject(err),
    });
  });
}

export async function confirmPassword(
  email: string,
  code: string,
  newPassword: string
): Promise<void> {
  const user = getCognitoUser(email);
  return new Promise((resolve, reject) => {
    user.confirmPassword(code, newPassword, {
      onSuccess: () => resolve(),
      onFailure: (err) => reject(err),
    });
  });
}

export async function getSession(): Promise<CognitoUserSession | null> {
  const pool = getUserPool();
  const user = pool.getCurrentUser();
  if (!user) return null;

  return new Promise((resolve) => {
    user.getSession((err: Error | null, session: CognitoUserSession | null) => {
      if (err || !session || !session.isValid()) {
        resolve(null);
        return;
      }
      resolve(session);
    });
  });
}

export async function getIdToken(): Promise<string | null> {
  const session = await getSession();
  if (!session) return null;
  return session.getIdToken().getJwtToken();
}

export function getCurrentUser(): CognitoUser | null {
  const pool = getUserPool();
  return pool.getCurrentUser();
}

export function getUserEmail(): string | null {
  const pool = getUserPool();
  const user = pool.getCurrentUser();
  return user?.getUsername() ?? null;
}
