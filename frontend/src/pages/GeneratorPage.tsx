import { useState, useCallback } from "react";
import ProductForm from "../components/ProductForm";
import ListingResults from "../components/ListingResults";
import LoadingState from "../components/LoadingState";
import ErrorMessage from "../components/ErrorMessage";
import EmptyState from "../components/EmptyState";
import UpgradePrompt from "../components/UpgradePrompt";
import { generateListing, type GenerationError } from "../services/listingService";
import type { GenerationState, ProductFormData } from "../types/listing";
import { useAuth } from "../auth";

const INITIAL_STATE: GenerationState = {
  status: "idle",
  listing: null,
  error: null,
};

export default function GeneratorPage() {
  const { idToken } = useAuth();
  const [state, setState] = useState<GenerationState>(INITIAL_STATE);
  const [limitInfo, setLimitInfo] = useState<{
    resetsAt?: string;
    message?: string;
  } | null>(null);

  const handleSubmit = useCallback(
    async (form: ProductFormData) => {
      if (!idToken) {
        setState({ status: "error", listing: null, error: "Please sign in to generate listings." });
        return;
      }

      setState({ status: "loading", listing: null, error: null });
      setLimitInfo(null);

      // Generate a unique idempotency key for this request
      const idempotencyKey = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

      try {
        const listing = await generateListing(form, idToken, { idempotencyKey });
        setState({ status: "success", listing, error: null });
      } catch (err: unknown) {
        const genErr = err as GenerationError;
        if (genErr.limitReached || genErr.regenerationLimitReached) {
          setLimitInfo({
            resetsAt: genErr.resetsAt,
            message: genErr.message,
          });
          setState({ status: "idle", listing: null, error: null });
        } else {
          setState({
            status: "error",
            listing: null,
            error: genErr.message || "An unexpected error occurred. Please try again.",
          });
        }
      }
    },
    [idToken]
  );

  const handleRetry = useCallback(() => {
    setState(INITIAL_STATE);
    setLimitInfo(null);
  }, []);

  const isLoading = state.status === "loading";

  return (
    <div className="generator-page">
      {/* Left panel — form */}
      <aside className="generator-page__form-panel">
        <div className="panel-header">
          <p className="panel-header__eyebrow">ROJAI</p>
          <h1 className="panel-header__title">AI Listing Generator</h1>
          <p className="panel-header__subtitle">
            Describe your product and we'll craft marketplace-ready copy —
            titles, bullet points, descriptions, and SEO keywords.
          </p>
        </div>
        <ProductForm onSubmit={handleSubmit} isLoading={isLoading} />
      </aside>

      {/* Right panel — output */}
      <main className="generator-page__results-panel">
        {limitInfo && (
          <UpgradePrompt resetsAt={limitInfo.resetsAt} message={limitInfo.message} />
        )}
        {!limitInfo && state.status === "idle" && <EmptyState />}
        {state.status === "loading" && <LoadingState />}
        {state.status === "error" && state.error && (
          <ErrorMessage message={state.error} onRetry={handleRetry} />
        )}
        {state.status === "success" && state.listing && (
          <ListingResults listing={state.listing} />
        )}
      </main>
    </div>
  );
}
