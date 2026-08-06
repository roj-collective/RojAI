export { AuthProvider, useAuth } from "./AuthContext";
export { COGNITO_USER_POOL_ID, COGNITO_CLIENT_ID, COGNITO_REGION } from "./cognitoConfig";

// authService functions are NOT re-exported here to avoid eagerly loading
// amazon-cognito-identity-js (which requires Buffer polyfill).
// Import directly from "./authService" where needed.
