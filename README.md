# GCS_Architecture

GRAVITAS GCS — Architecture & Ground Control Station Application for multi-domain unmanned systems (UAVs, UGVs, and extensible categories).

## Overview
- **Master & Subsystem Architecture**: Detailed architectural specifications, manifests, and data models for ~152 canonical engines across 12 architectural categories.
- **Frontend Stack**: Built with React 19, TypeScript, and Vite.

## Architecture Coverage
| Category | Files |
|---|---|
| Master (L0–L1–Deploy) | `master/` |
| Core (Registry, Adapters, Telemetry, Gateway, Integration) | `core/` |
| Communications (Transport, Multi-Network, Link Monitoring, Secure, Offline) | `communications/` |
| COP & Geospatial | `cop-geospatial/` |
| Planning & Navigation | `planning-navigation/` |
| Operations | `operations/` |
| Sensors & Payloads | `sensors-payloads/` |
| Security & Reliability | `security-reliability/` |
| Data & Observability | `data-observability/` |
| Customization & Intelligence | `customization-intelligence/` |
| End-to-End Flows | `end-to-end-flows/` |
| ER Diagrams | `er-diagrams/` |

## Getting Started

### Prerequisites
- Node.js >= 18

### Development
```bash
npm install
npm run dev
```

### Production Build
```bash
npm run build
npm run preview
```

### Lint & Type Check
```bash
npm run lint
npx tsc -b --noEmit
```

## Deployment

The application is a static SPA (Single Page Application) — `npm run build` outputs to the `dist/` directory.

Deployment configs are included for:
- **Netlify**: `netlify.toml`
- **Vercel**: `vercel.json`

> **Note**: The app uses an in-memory + `localStorage` fallback for the canvas state when deployed statically (no backend server required). Architecture JSON files are bundled at build time.



Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the Oxlint configuration

If you are developing a production application, we recommend enabling type-aware lint rules by installing `oxlint-tsgolint` and editing `.oxlintrc.json`:

```json
{
  "$schema": "./node_modules/oxlint/configuration_schema.json",
  "plugins": ["react", "typescript", "oxc"],
  "options": {
    "typeAware": true
  },
  "rules": {
    "react/rules-of-hooks": "error",
    "react/only-export-components": ["warn", { "allowConstantExport": true }]
  }
}
```

See the [Oxlint rules documentation](https://oxc.rs/docs/guide/usage/linter/rules) for the full list of rules and categories.
