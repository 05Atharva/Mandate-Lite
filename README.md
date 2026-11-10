# Mandate Lite

Controlled checkout for an AI purchasing agent. The planner proposes catalog products; a deterministic server enforces a published spending mandate before PayPal sandbox checkout.

Implementation follows [the PRD](PayPal-Hackathon-Mandate-Lite-PRD.md). This is a single-workspace prototype with one merchant, owner and agent, and USD only. It does not grant unattended access to a buyer wallet.

## Development

Requires Node.js 24.14 or newer and npm.

```powershell
npm ci
Copy-Item .env.example .env
# Set distinct OWNER_PASSWORD and AGENT_API_KEY in .env.
npm run db:seed
npm run dev
```

Open http://localhost:3000. Configure PayPal sandbox seller client ID, secret and merchant ID, plus an OpenAI API key, to run the live integration gate. Credentials stay server-side. The app never substitutes simulated payment success or scripted AI output for missing credentials.

```powershell
npm run check
npm test
npm run build
npm start
```

The SQLite database is stored in `data/mandate.sqlite` by default. Seed is idempotent and preserves existing financial state. The active pilot mandate is immutable; revocation prevents future attempts. Uncertain external operations keep their reservation until reconciled.

## Implementation status

- Implemented: seeded catalog, strict basket validation, immutable mandate, atomic reservations, exact approval binding, durable PayPal operations, conservative reconciliation, credential separation and CSRF protection.
- In progress: React owner console and purchase desk, broader integration tests.
- Pending external evidence: real PayPal buyer-consent/capture/cancel and five real model planning prompts. These require configured accounts; unit fixtures are not live evidence.

The built-in Node SQLite API currently emits an experimental-feature warning. This prototype uses one server process and persistent local storage; do not deploy multiple replicas or place the ledger on an ephemeral disk.
