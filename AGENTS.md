# Caveau — Codex / ChatGPT Guide

This repo was originally built with Claude Code; it is now maintained with ChatGPT/Codex. Keep `AGENTS.md` short and stable so assistants have a single source of truth.

## Commands

```bash
npm install
npm run dev
```

Recommended validation:

```bash
npm run ci
```

Production build:

```bash
npm run build
```

## Where to Look

- Roadmap + feature status: `SPEC.md` (Post‑Demo Roadmap)
- Setup + env vars: `docs/GETTING_STARTED.md` and `.env.example`
- Architecture + directory map: `docs/ARCHITECTURE.md`
- Data model notes: `docs/DATA_MODEL.md` and `prisma/schema.prisma`
- UI design system: `docs/DESIGN_SYSTEM.md`

## Conventions

- **Next.js App Router**: prefer Server Components; use Server Actions for mutations.
- **Prisma Decimals**: `Decimal` fields are `Prisma.Decimal` objects — convert via `Number()` / `.toNumber()` before arithmetic; format via `src/lib/utils.ts`.
- **Auth + scoping**: scope all member data reads/writes to the authenticated member; public/bearer exceptions are enumerated in `src/middleware.ts`.
- **UI**: dark theme always, mobile‑first (check 375px). Reuse existing patterns/components; primary card style is `bg-[#141416]/80 backdrop-blur-xl border border-[#2A2A30]/50 rounded-2xl`.
- **Simplicity**: colocate subcomponents, avoid new abstractions unless reused.

## Workflow (Codex)

- Make small, surgical diffs.
- Update/add tests when touching core helpers (`src/lib/__tests__/`).
- Don’t `git commit` / `git push` unless explicitly asked.
