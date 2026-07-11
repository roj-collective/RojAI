import { useState, type FormEvent } from "react";
import type { ProductFormData, Marketplace, Language, Tone } from "../types/listing";

interface ProductFormProps {
  onSubmit: (data: ProductFormData) => void;
  isLoading: boolean;
}

const CATEGORIES = [
  "Electronics",
  "Home & Kitchen",
  "Health & Beauty",
  "Sports & Outdoors",
  "Clothing & Accessories",
  "Toys & Games",
  "Books & Media",
  "Food & Grocery",
  "Pet Supplies",
  "Automotive",
  "Office Supplies",
  "Garden & Outdoors",
  "Baby & Kids",
  "Arts & Crafts",
  "Other",
];

const MARKETPLACES: { value: Marketplace; label: string }[] = [
  { value: "shopify", label: "Shopify" },
  { value: "etsy", label: "Etsy" },
  { value: "amazon", label: "Amazon" },
];

const LANGUAGES: { value: Language; label: string }[] = [
  { value: "en", label: "English" },
  { value: "fr", label: "French" },
  { value: "de", label: "German" },
  { value: "es", label: "Spanish" },
  { value: "it", label: "Italian" },
];

const TONES: { value: Tone; label: string; hint: string }[] = [
  { value: "professional", label: "Professional", hint: "Clear, authoritative copy" },
  { value: "luxury", label: "Luxury", hint: "Premium, aspirational tone" },
  { value: "friendly", label: "Friendly", hint: "Warm, conversational style" },
];

const INITIAL: ProductFormData = {
  productName: "",
  description: "",
  category: "",
  brand: "",
  marketplace: "shopify",
  language: "en",
  tone: "professional",
};

type FieldErrors = Partial<Record<keyof ProductFormData, string>>;

export default function ProductForm({ onSubmit, isLoading }: ProductFormProps) {
  const [form, setForm] = useState<ProductFormData>(INITIAL);
  const [errors, setErrors] = useState<FieldErrors>({});

  function validate(): FieldErrors {
    const errs: FieldErrors = {};
    if (!form.productName.trim()) errs.productName = "Product name is required.";
    if (!form.description.trim()) errs.description = "Short description is required.";
    if (!form.category) errs.category = "Please select a category.";
    return errs;
  }

  function handleChange(
    e: React.ChangeEvent<
      HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
    >
  ) {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
    // Clear error on change
    if (errors[name as keyof ProductFormData]) {
      setErrors((prev) => ({ ...prev, [name]: undefined }));
    }
  }

  function handleToneChange(tone: Tone) {
    setForm((prev) => ({ ...prev, tone }));
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      return;
    }
    onSubmit(form);
  }

  return (
    <form className="product-form" onSubmit={handleSubmit} noValidate>
      {/* Row: Product Name + Brand */}
      <div className="form-row">
        <div className={`form-field${errors.productName ? " form-field--error" : ""}`}>
          <label htmlFor="productName" className="form-label">
            Product Name <span className="required">*</span>
          </label>
          <input
            id="productName"
            name="productName"
            type="text"
            className="form-input"
            placeholder="e.g. Wireless Noise-Cancelling Headphones"
            value={form.productName}
            onChange={handleChange}
            disabled={isLoading}
            autoComplete="off"
          />
          {errors.productName && (
            <span className="form-error">{errors.productName}</span>
          )}
        </div>

        <div className="form-field">
          <label htmlFor="brand" className="form-label">
            Brand <span className="optional">(optional)</span>
          </label>
          <input
            id="brand"
            name="brand"
            type="text"
            className="form-input"
            placeholder="e.g. Sony, Unbranded"
            value={form.brand}
            onChange={handleChange}
            disabled={isLoading}
            autoComplete="off"
          />
        </div>
      </div>

      {/* Description */}
      <div className={`form-field${errors.description ? " form-field--error" : ""}`}>
        <label htmlFor="description" className="form-label">
          Short Product Description <span className="required">*</span>
        </label>
        <textarea
          id="description"
          name="description"
          className="form-textarea"
          rows={3}
          placeholder="Describe the key features, materials, or benefits of your product…"
          value={form.description}
          onChange={handleChange}
          disabled={isLoading}
        />
        {errors.description && (
          <span className="form-error">{errors.description}</span>
        )}
      </div>

      {/* Row: Category + Marketplace */}
      <div className="form-row">
        <div className={`form-field${errors.category ? " form-field--error" : ""}`}>
          <label htmlFor="category" className="form-label">
            Category <span className="required">*</span>
          </label>
          <select
            id="category"
            name="category"
            className="form-select"
            value={form.category}
            onChange={handleChange}
            disabled={isLoading}
          >
            <option value="">Select a category…</option>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          {errors.category && (
            <span className="form-error">{errors.category}</span>
          )}
        </div>

        <div className="form-field">
          <label htmlFor="marketplace" className="form-label">
            Marketplace
          </label>
          <select
            id="marketplace"
            name="marketplace"
            className="form-select"
            value={form.marketplace}
            onChange={handleChange}
            disabled={isLoading}
          >
            {MARKETPLACES.map(({ value, label }) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Row: Language */}
      <div className="form-row form-row--narrow">
        <div className="form-field">
          <label htmlFor="language" className="form-label">
            Language
          </label>
          <select
            id="language"
            name="language"
            className="form-select"
            value={form.language}
            onChange={handleChange}
            disabled={isLoading}
          >
            {LANGUAGES.map(({ value, label }) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Tone Selector */}
      <div className="form-field">
        <span className="form-label">Tone</span>
        <div className="tone-selector">
          {TONES.map(({ value, label, hint }) => (
            <button
              key={value}
              type="button"
              className={`tone-btn${form.tone === value ? " tone-btn--active" : ""}`}
              onClick={() => handleToneChange(value)}
              disabled={isLoading}
            >
              <span className="tone-btn__label">{label}</span>
              <span className="tone-btn__hint">{hint}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Submit */}
      <button
        type="submit"
        className="btn btn--primary btn--full"
        disabled={isLoading}
      >
        {isLoading ? (
          <>
            <span className="spinner" aria-hidden="true" />
            Generating…
          </>
        ) : (
          <>
            <span className="btn-icon" aria-hidden="true">✦</span>
            Generate Listing
          </>
        )}
      </button>
    </form>
  );
}
