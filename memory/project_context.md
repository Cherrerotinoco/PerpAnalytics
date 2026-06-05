---
name: project-context
description: PerpAnalytics — dashboard de análisis de trades de Solana perpetuals, con calculadora de proyección de cuenta
metadata:
  type: project
---

**PerpAnalytics** — live en perpAnalytics.app. Analiza trades cerrados de Jupiter Perpetuals y Pacifica Finance a partir de una wallet pública de Solana.

Stack: React 19, TypeScript 5.9 strict, Vite 8 (Node ≥ 20), pnpm workspace, react-router-dom v7, GridStack v12.6, Recharts 2.15, Lightweight Charts v5.2.

Páginas actuales:
- `/` — Landing page con mock trades
- `/dashboard` — App principal (wallet input + dashboard grid)
- `/calculator` — Calculadora de proyección de cuenta BTC futuros (añadida en esta sesión)
- `/cookie-policy` — Estática

**Why:** El usuario quiere una herramienta de análisis personal para modelar crecimiento de cuenta con sus parámetros reales de trading.

**How to apply:** Al añadir nuevas páginas, seguir el mismo patrón: crear en `app/src/pages/`, registrar en `App.tsx`, añadir link en `Header.tsx` con clase `tc-header-nav-link`.
