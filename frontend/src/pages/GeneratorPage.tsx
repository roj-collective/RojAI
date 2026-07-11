import { useState, useCallback } from "react";
import ProductForm from "../components/ProductForm";
import ListingResults from "../components/ListingResults";
import LoadingState from "../components/LoadingState";
import ErrorMessage from "../components/ErrorMessage";
import EmptyState from "../components/EmptyState";
import { generateListing } from "../services/listingService";
import type { GenerationState, ProductFormData } from "../types/listing";

const INITIAL_STATE: GenerationState = {
  status: "idle",
  listing: null,
  error: null,
};

export default function GeneratorPage() {
  const [state, setState] = useState<GenerationState>(INITIAL_STATE);

  const handleSubmit = useCallback(async (form: ProductFormData) => {
    setState({ status: "loading", listing: null, error: null });
    try {
      const listing = await generateListing(form);
      setState({ status: "success", listing, error: null });
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "An unexpected error occurred. Please try again.";
      setState({ status: "error", listing: null, error: message });
    }
  }, []);

  const handleRetry = useCallback(() => {
    setState(INITIAL_STATE);
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
        {state.status === "idle" && <EmptyState />}
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
