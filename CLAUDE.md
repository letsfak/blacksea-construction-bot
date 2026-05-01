# Construction Site Bot

**Version:** 1.0.0 | **Port:** 3000 | **Stack:** Node.js 18 + Firebase Firestore + Telegram Bot API + OpenAI

## What

Telegram bot for construction site management: daily work logging, material tracking, warehouse flows, and GPT-4 AI reports. Multi-tenant architecture supports multiple companies on a single deployment.

## Quick Start

```bash
bash setup.sh                        # First-time setup
npm start                            # Start bot (port 3000)
node smoke_test.mjs                  # Smoke tests (5 checks)
node multitenant/test_full_flow.js   # Multi-tenant integration test
```

## Commands

```bash
# Development
npm install                          # Install dependencies
npm start                            # Start bot + Express webhook server
node generate-rehber.js              # Build Excel user guide

# Testing
node smoke_test.mjs                  # Health, Firestore, OpenAI, Telegram, activity
node smoke_test.mjs --json           # JSON output
node multitenant/test_full_flow.js   # Multi-tenant flow (requires .env)
node multitenant/test_syntax_only.js # Syntax check (no Firebase needed)
node multitenant/test_invite.js      # Invite system test
node multitenant/test_onboarding.js  # Onboarding wizard test

# Data
node seed-full.js                    # Seed full example dataset
node seed-bugun.js                   # Seed today's records
node seed-plan.js                    # Seed work plans
node multitenant/migrate.js          # Migration tool (DRY_RUN=true by default)

# Docker (not configured — deploy directly to Render.com)
cp .env.example .env
npm install && npm start
```

## Architecture

```
index.js                         # Entry point: Express server, all bot handlers, cron jobs
multitenant/
  auth.js                        # Firm resolution, role validation, cross-firm isolation
  compat.js                      # Bridge: hardcoded USERS dict → Firestore kullanicilar
  firma_service.js               # Company CRUD (firmalar collection)
  kullanici_service.js           # User CRUD (kullanicilar collection)
  santiye_service.js             # Construction site CRUD (santiyeler collection)
  invite.js                      # Invite code generate/validate
  invite_handler.js              # Handles /start invite_<code> flow
  onboarding.js                  # 10-step new-company wizard (state machine)
  onboarding_questions.js        # Question definitions and step order
  firestore_helpers.js           # firma_id-filtered Firestore query wrappers
  analytics.js                   # Usage analytics helpers
  migrate.js                     # Data migration utility
  test_full_flow.js              # Integration test: full onboarding + invite
seed-*.js                        # Example data population scripts
generate-rehber.js               # Produces Excel user guide via ExcelJS
smoke_test.mjs                   # System health checks (ESM)
```

**Data flow:** Telegram message → Express `/` POST webhook → `handleMessage()` in `index.js` → session state machine → Firestore read/write via `firestore_helpers.js` (auto-applies `firma_id` filter). Photo attachments go to Dropbox. AI queries go to OpenAI.

## Key Files

```
index.js                   Main bot — 143KB, all command handlers, cron jobs, Express
multitenant/auth.js        getUserFirmaId(), getKullanici(), canAccessFirma()
multitenant/firestore_helpers.js  getIsTakibi(), addMalzeme(), etc. — always use these
multitenant/onboarding.js  startOnboarding(), handleOnboardingMessage() — state machine
multitenant/compat.js      initCompat(USERS) — call once at startup
multitenant/invite.js      createInviteCode(), validateInviteCode()
smoke_test.mjs             5 system checks — run before every deploy
.env.example               All required env vars with comments
```

## Configuration

All configuration is via environment variables. See `.env.example`:

| Variable | Required | Description |
|---|---|---|
| `TELEGRAM_TOKEN` | Yes | Token from @BotFather |
| `BOT_USERNAME` | No | Bot username for invite links |
| `ADMIN_CHAT_ID` | Yes | Receives onboarding notifications |
| `DEFAULT_FIRMA_ID` | Yes | Fallback company slug (single-tenant compat) |
| `FIREBASE_CREDENTIALS` | Yes | Stringified service account JSON |
| `OPENAI_API_KEY` | Yes | GPT-4 for reports and AI chat |
| `DROPBOX_APP_KEY` | No | Photo upload feature |
| `DROPBOX_APP_SECRET` | No | Dropbox OAuth2 |
| `DROPBOX_REFRESH_TOKEN` | No | Dropbox refresh token |
| `PORT` | No | Default 3000; auto-injected by Render |
| `RENDER_EXTERNAL_URL` | No | Self-ping URL to prevent free-tier sleep |
| `DRY_RUN` | No | `true` = migration script dry run |

## Firestore Collections

| Collection | Purpose |
|---|---|
| `is_takibi` | Daily work records (santiye, tarih, ekip, yevmiye, aciklama) |
| `malzeme_takibi` | Material in/out log |
| `santiye_stoku` | Current site inventory snapshot |
| `depo_hareketleri` | Warehouse-to-site transfer records |
| `is_plani` | Planned work items per site |
| `firmalar` | Company documents (multi-tenant) |
| `kullanicilar` | User documents keyed by Telegram ID |
| `santiyeler` | Construction site documents per firma |
| `pending_setups` | In-progress onboarding sessions (24h TTL) |
| `kisiler` | Legacy: loaded back to USERS on restart |

## User Roles

`patron` (owner) > `mudur` (manager) > `sef` (foreman) > `satinalma` (procurement) > `kullanici`

Role checks are in `multitenant/auth.js`: `isPatron()`, `isSef()`, `validateUserRole()`.

## Multi-Tenant Invariants

- Every Firestore write MUST include `firma_id`
- Use `multitenant/firestore_helpers.js` wrappers — never raw `db.collection()` for business data
- Verify access with `canAccessFirma(telegramId, firmaId)` before returning cross-firm data
- `DEFAULT_FIRMA_ID` env var is the compat-mode fallback — required even in multi-tenant mode
- `initCompat(USERS)` must be called once at startup (already in `index.js`)

## Do Not Touch

- `MAHAL_MAP` in `index.js` — floor/location definitions tied to existing Firestore records; changing breaks historical data
- `USERS` shape in `index.js` — `{ name, role, santiye }` — compat layer depends on exact keys
- `PENDING_COLLECTION = 'pending_setups'` in `onboarding.js` — changing breaks in-flight onboardings

## Adding a New Bot Command

1. Write handler function in `index.js` (follow existing `async function handle...` pattern)
2. Register in `handleMessage()` router
3. Update `/yardim` command list
4. If it writes to Firestore, use a `firestore_helpers.js` wrapper or add one
5. Update `CLAUDE.md` key files section if it is a major addition

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).
