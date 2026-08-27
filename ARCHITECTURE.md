# Essay Editor Architecture

The frontend is organized by business capability. New code should live with the
feature that owns its behavior instead of being added to a global components or
hooks directory.

## Layers

- `src/app` initializes the application and coordinates workflows that cross
  feature boundaries. It may import feature public APIs and shared modules.
- `src/features/<feature>` owns its UI, controller hooks, repositories, styles,
  domain types, and tests. Other modules import a feature through its `index.ts`.
- `src/shared` contains business-neutral UI primitives, utilities, and Tauri
  adapters. Shared modules must never import from `src/features`.

Dependencies flow in one direction:

```text
app -> features -> shared
```

Features do not import each other's implementation files. When two features
need to collaborate, `src/app` passes values and callbacks between their public
interfaces.

## State and side effects

Local visual state stays in the component that owns it. Stateful workflows use
feature controller hooks; a global state library should only be introduced when
real cross-feature state makes it necessary.

External effects are hidden behind interfaces:

- settings use `SettingsRepository` backed by `store.bin`;
- the current draft uses `DraftRepository` backed by `drafts.bin`;
- publishing uses `EssayClient`;
- Tauri window, shell, HTTP, store, and updater APIs are accessed through small
  adapters or injectable services.

The draft repository owns migration from the legacy `localStorage.backup`
format. The legacy value is removed only after the migrated draft has been
saved successfully.

## Adding functionality

1. Add domain types and a service/repository interface inside the owning
   feature.
2. Keep network and persistence details out of React components.
3. Expose only the required symbols from the feature `index.ts`.
4. Add unit tests for repositories and controllers, then component tests for
   user-visible behavior.
5. Compose the feature in `src/app/App.tsx` without adding feature logic there.

All changes must pass `pnpm test` and `pnpm build`. Native changes additionally
require the Cargo tests and `cargo fmt -- --check` described in `AGENTS.md`.
