# Mancala Trainer — Project Conventions

## What this is

A web Mancala trainer. PWA-style SPA, no backend. Local play vs bots and 2-player pass-and-play, plus post-game analysis.

## Architectural principles (non-negotiable)

1. **src/engine/** is pure TypeScript with ZERO UI or browser deps. Must run unmodified in a Web Worker, Node, or browser. No React imports, no DOM access, no audio, no localStorage. Prefer pure functions over immutable state.
2. The engine is parameterized for variants. Default ruleset is Kalah(6,4) tournament rules; the API takes a RuleConfig so future variants (Oware, different sizes) plug in without rewrites.
3. **Bots** in src/bots/ import only from src/engine/ and run in a Web Worker.
4. **UI** in src/ui/ is a thin view layer; components must not encode game rules.
5. Every engine change requires Vitest tests with named cases for the tricky edges.
6. Settings persist via localStorage with a single "mancala-settings" key.

## Code conventions

- Strict TS, no `any` outside TODO markers.
- Functional components with hooks.
- Zustand for shared state, useState for local.
- PascalCase.tsx for components, camelCase.ts elsewhere.
- All user-facing strings in src/ui/strings.ts.

## Theme system

Three themes available at all times (warm-earth default, dark-museum, modern-desert). Switchable via settings. All colors via CSS variables; never hardcoded hex outside the theme tokens.

## Milestone-based development

Stay in scope per milestone, end with tests passing and a written summary.
