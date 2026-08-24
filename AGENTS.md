# Repository Guidelines

## Project Structure & Module Organization

The React/TypeScript frontend lives in `src/`. `src/App.tsx` contains the main editor flow, reusable controls are under `src/components/`, shadcn/Radix primitives are in `src/components/ui/`, and persistence helpers belong in `src/hooks/` or `src/lib/`. Global styling is in `src/App.css`; Tailwind and Vite configuration remain at the repository root. The native Tauri 2 application is under `src-tauri/`: Rust startup code is in `src-tauri/src/`, permissions are in `src-tauri/capabilities/`, and packaged icons are in `src-tauri/icons/`.

## Build, Test, and Development Commands

Use pnpm; `pnpm-lock.yaml` is the authoritative dependency lockfile.

- `pnpm install` installs JavaScript and Tauri CLI dependencies.
- `pnpm dev` runs the frontend-only Vite server on port 1420.
- `pnpm tauri dev` launches the complete desktop app with hot reload.
- `pnpm build` runs strict TypeScript checks and creates the frontend bundle.
- `pnpm tauri build` produces platform installers/bundles.
- `cargo test --manifest-path src-tauri/Cargo.toml` runs Rust tests.
- `cargo fmt --manifest-path src-tauri/Cargo.toml -- --check` verifies Rust formatting.

## Coding Style & Naming Conventions

Follow the existing TypeScript style: four-space indentation, single quotes, no semicolons, and functional React components. Use `PascalCase` for components and exported types, `camelCase` for functions and variables, and kebab-case filenames such as `settings-dialog.tsx`. Prefer the `@/` alias for imports from `src/`. Keep Tailwind utilities in JSX and shared CSS variables in `src/App.css`. Rust code must follow `rustfmt`. No ESLint or Prettier configuration is currently present, so avoid unrelated formatting churn.

## Testing Guidelines

There is no frontend test framework or coverage threshold yet. Every change must at least pass `pnpm build`; native changes must also pass Cargo tests and formatting. Manually verify editing, local backup restoration, settings persistence, publishing, toast feedback, and both themes when affected. If adding frontend tests, use colocated `*.test.ts` or `*.test.tsx` files and add the runner command to `package.json`.

## Commit & Pull Request Guidelines

History uses short conventional prefixes such as `fix:`, `style:`, and `doc:`; continue with an imperative, focused subject (for example, `fix: preserve draft after publish failure`). Pull requests should explain the user-visible impact, list verification commands, link relevant issues, and include before/after screenshots for visual changes. Keep generated icons or lockfile updates separate from unrelated source changes.

## Security & Configuration

Never commit Essay access tokens or local Tauri store files. Treat changes to `src-tauri/capabilities/` and external API permissions as security-sensitive and justify them in the pull request.
