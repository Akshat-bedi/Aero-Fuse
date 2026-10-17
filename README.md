# AirOps DSS

**AirOps DSS** (Dynamic Air Operations & Resource Optimisation Decision-Support System) is a decision-support platform designed for an Air Force Operations Centre. It fuses disparate real-time operational streams—aircraft serviceability, crew readiness, weapon inventories, airspace sectors, weather conditions, threats, and mission priorities—into a unified tactical picture. The system proactively detects bottlenecks, evaluates trade-offs, and proposes actionable retasking recommendations for human commander approval within seconds.

> **Note:** All data is fictional and simulated.

---

## Repository Layout

```text
aero-fuse/
├── frontend/        # React 18 + Vite + TypeScript command-centre frontend application
├── backend/         # Backend service layer (REST + WebSocket, to be developed)
├── shared/seed/     # Shared seed data and fixtures
├── docs/            # Shared cross-cutting documentation
├── .gitignore       # Root monorepo gitignore
└── README.md        # Monorepo root README
```

---

## Running the Frontend

Navigate to the `frontend` workspace:

```bash
cd frontend
npm install
npm run dev
```

The application runs locally on `http://localhost:5173`.
To run tests, production build, or linting:

```bash
npm run test
npm run build
npm run lint
```
