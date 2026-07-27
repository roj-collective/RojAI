/**
 * Health check endpoint for production monitoring.
 * Returns HTTP 200 with {"status": "ok"}.
 * Does NOT require Shopify authentication.
 * Used by Render health checks and uptime monitors.
 */
export const loader = () => {
  return new Response(JSON.stringify({ status: "ok" }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};
