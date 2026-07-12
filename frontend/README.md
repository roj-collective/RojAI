# Frontend

React + TypeScript + Vite single-page application for ROJAI.

## Structure

```
src/
  components/       UI components (ProductForm, ListingResults, EmptyState, etc.)
  pages/            Page-level components (GeneratorPage)
  services/         API service layer (listingService.ts)
  types/            TypeScript interfaces (ProductFormData, GeneratedListing)
  layouts/          Layout wrappers
  index.css         Global styles (CSS custom properties, no framework)
  App.tsx           Root component with routing and theme toggle
  main.tsx          Entry point
public/             Static assets (logo, favicon)
```

## Local Development

```bash
npm ci
cp .env.example .env.local
npm run dev
```

Runs at `http://localhost:5173`.

## Environment

| Variable | Description |
|----------|-------------|
| `VITE_API_BASE_URL` | Backend API base URL (no trailing slash) |

Set in `.env.local` for local dev or in Amplify Console for production.

## Build

```bash
npm run build    # TypeScript check + Vite production build → dist/
```

## Deployment

Deployed via AWS Amplify Hosting. The `amplify.yml` at repo root tells Amplify to:
1. `cd frontend && npm ci`
2. `npm run build`
3. Serve `dist/`

The `VITE_API_BASE_URL` environment variable is set in the Amplify Console.

## Design

- Pure CSS with custom properties (no Tailwind, no CSS framework)
- Dark/light theme via `[data-theme]` attribute + localStorage
- Mobile-responsive layout
- Woven kilim logo mark with ROJAI wordmark
