export default function LoadingState() {
  return (
    <div className="loading-state" role="status" aria-live="polite">
      <div className="loading-state__animation">
        <span className="loading-dot" />
        <span className="loading-dot" />
        <span className="loading-dot" />
      </div>
      <p className="loading-state__title">Generating your listing…</p>
      <p className="loading-state__subtitle">
        Our AI is crafting optimised copy for your product.
      </p>
    </div>
  );
}
