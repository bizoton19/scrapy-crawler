# Split the Wine — Prototype

Mobile-first bill splitting: host photographs a receipt, guests claim items via a shareable link, fees split proportionally.

## What's in this repo

```
split-the-wine/
├── apps/mobile/         # Expo (React Native) app — iOS / Android / web
├── apps/web-fallback/   # Touch-first mobile web (guest + host demo shell)
├── server/              # Express API + WebSocket + vision parse
├── packages/shared-types/
└── uploads/             # Receipt photos (local)
```

## Quick start (demo without a vision key)

```bash
cd split-the-wine/server
npm install
npm run dev
```

Open **http://localhost:8787** — phone-framed mobile web UI.

1. Tap **New receipt — demo bar tab** (loads the §12 Adler reference receipt).
2. Review / edit items → **Create claim link**.
3. Open the claim URL (or **Watch live claims**).
4. Claim with large steppers; open a second browser window to see realtime updates.
5. **Who owes** → save Venmo/Zelle handle → **Request payment message** (copies + opens SMS draft; does not auto-send).

### Expo app

```bash
# terminal 1 — API
cd split-the-wine/server && npm run dev

# terminal 2 — Expo
cd split-the-wine/apps/mobile
EXPO_PUBLIC_API_URL=http://localhost:8787/api \
EXPO_PUBLIC_WS_URL=ws://localhost:8787/live \
npm run start
```

Use a device/simulator, or `npm run web` for Expo web.

## Vision API key (needed for real receipt OCR)

Without a key the server runs in **demo mode** (sample bar tab). For live parsing, set **one** of:

```bash
export ANTHROPIC_API_KEY=sk-ant-...     # preferred (Claude vision)
# or
export VISION_MODEL_API_KEY=sk-ant-...  # alias for Anthropic
# or
export OPENAI_API_KEY=sk-...            # GPT-4o vision fallback
```

Optional:

```bash
export VISION_MODEL=claude-sonnet-4-20250514
export OPENAI_VISION_MODEL=gpt-4o
export PUBLIC_BASE_URL=http://localhost:8787
export PORT=8787
```

Then restart the server and upload a real receipt photo. You still always land on the **review/edit** screen before publishing.

> **Tell the agent / ops:** paste an Anthropic or OpenAI key into the environment to enable live vision. No key is required to exercise claiming, realtime, or fee math.

## API (v1)

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/receipts` | multipart `image` upload |
| POST | `/api/receipts/:id/parse` | vision (or demo) → draft items |
| PUT | `/api/receipts/:id` | publish reviewed items + claim URL |
| GET | `/api/receipts/:id` | current state |
| POST | `/api/receipts/:id/claims` | integer claim (transactional) |
| DELETE | `/api/claims/:claimId` | undo own claim (`X-Claim-Token`) |
| PUT | `/api/receipts/:id/host-info` | payment method + handle |
| GET | `/api/receipts/:id/totals` | proportional fee split |
| POST | `/api/receipts/:id/finalize` | lock claiming |
| WS | `/live?receiptId=` | realtime updates |

## Product decisions baked into this prototype

- Guests: **no account** (name + optional contact).
- Finalize: **host-only**, allows unclaimed leftovers.
- Payment requests: **stub only** (prefilled SMS / clipboard) — never auto-sends money or messages.
- Money math: **integer cents** server-side.

## Tests

```bash
cd split-the-wine/server && npm test
```
