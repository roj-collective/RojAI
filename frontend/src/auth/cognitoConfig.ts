/**
 * cognitoConfig.ts — Cognito User Pool configuration.
 *
 * Values are injected at build time via Vite environment variables.
 * These are public identifiers (User Pool ID and Client ID) — not secrets.
 */

export const COGNITO_USER_POOL_ID = import.meta.env.VITE_COGNITO_USER_POOL_ID || "";
export const COGNITO_CLIENT_ID = import.meta.env.VITE_COGNITO_CLIENT_ID || "";
export const COGNITO_REGION = import.meta.env.VITE_COGNITO_REGION || "us-east-1";
