# CodeLens

CodeLens is a browser-based codebase intelligence tool for developers. The app runs entirely in the browser with no backend services.

## Stack

- Vite + React + TypeScript
- Zustand for client-side state
- D3 for graph rendering foundations
- React Router for app-level routing support
- Tailwind configured with a custom codelens theme (dark mode via class)
- Octokit for GitHub API integration

## Available Scripts

- npm run dev starts the Vite dev server.
- npm run build runs type-checking and creates a production build.
- npm run preview previews the production build locally.

## Source Layout

```
src/
  components/
    layout/
    graph/
    panels/
    ui/
  hooks/
  lib/
    github/
    analysis/
    graph/
    local/
  store/
  types/
  utils/
  App.tsx
  main.tsx
  index.css
```

## Current Status

This scaffold includes strongly typed placeholder modules and UI shells with no business logic yet. It is ready for implementing:

- repository input and parsing flows
- dependency graph construction and layout
- health/security scoring pipelines
- blast radius exploration and export workflows
