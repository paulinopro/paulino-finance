# OpenWA WhatsApp Notifications Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add opt-in WhatsApp reminders through one centrally managed OpenWA session while preserving Telegram, Web Push, and in-app notification behavior.

**Architecture:** Run a pinned OpenWA container as an independent service and call it through a focused backend HTTP adapter. Store each user's normalized destination number, consent, verification, and per-reminder WhatsApp preference; route generated notifications through isolated channel deliveries so one provider cannot abort another.

**Tech Stack:** Node.js 18, TypeScript, Express, PostgreSQL, React 18, CRACO/Jest, Docker Compose, OpenWA REST API `0.12.5`.

## Global Constraints

- Use one central Paulino Finance WhatsApp session; users never create OpenWA sessions.
- Pin `ghcr.io/rmyndharis/openwa:0.12.5`; do not use `latest`.
- Bind the OpenWA panel/API to `127.0.0.1:2785` by default.
- Keep Telegram, Web Push, and in-app history backward-compatible.
- Email delivery is outside this plan; preserve `email_enabled` without activating it.
- Store destination numbers as 8–15 international digits without `+`; the first digit cannot be zero.
- Require number, explicit consent, and a successful test before any per-type WhatsApp toggle can become true.
- Never log API keys or complete phone numbers.
- Do not retry OpenWA sends automatically in this phase because an ambiguous retry can duplicate a message.
- Preserve the existing uncommitted `AGENTS.md` change and exclude it from every commit.

---

## File Structure

### Backend files to create

- `backend/src/services/whatsappPhone.ts`: normalize, validate, mask, and derive the OpenWA chat ID.
- `backend/src/services/whatsappPhone.test.ts`: pure phone-domain regression tests.
- `backend/src/services/openWaService.ts`: OpenWA configuration, message formatting, timeout, and HTTP send adapter.
- `backend/src/services/openWaService.test.ts`: adapter and formatting tests with mocked `fetch`.
- `backend/src/controllers/whatsappNotificationController.ts`: authenticated user configuration and WhatsApp test endpoints.
- `backend/src/controllers/whatsappNotificationController.test.ts`: consent, verification, and test-send controller tests.
- `backend/src/services/notificationChannelDispatcher.ts`: isolated delivery orchestration for Telegram, WhatsApp, and Web Push.
- `backend/src/services/notificationChannelDispatcher.test.ts`: multi-channel success/failure isolation tests.
- `backend/src/controllers/notificationChannelTests.test.ts`: regression tests for independent Telegram/Push routes and legacy alias.
- `backend/src/services/notificationWhatsAppScheduler.test.ts`: scheduler selection and WhatsApp dispatch tests.

### Backend files to modify

- `backend/src/config/database.ts`: idempotent columns and constraints.
- `backend/src/controllers/notificationController.ts`: `whatsappEnabled`, channel-specific test handlers, and validation.
- `backend/src/routes/notifications.ts`: profile and channel test routes.
- `backend/src/services/notificationService.ts`: select WhatsApp data and use the dispatcher.
- `backend/src/services/telegramService.ts`: expose a consistent failure result without changing Telegram behavior.
- `backend/src/services/webPushService.ts`: retain current behavior and make it usable by the dispatcher.

### Frontend files to create

- `frontend/src/components/WhatsAppNotificationSettings.tsx`: number, consent, status, save/withdraw, and test UI.
- `frontend/src/components/WhatsAppNotificationSettings.test.tsx`: component states and actions.

### Frontend files to modify

- `frontend/src/pages/Settings.tsx`: render the component, expose per-type WhatsApp toggles, and call channel-specific test routes.
- `frontend/src/types/index.ts`: WhatsApp configuration and notification setting types.
- `frontend/src/i18n/locales/es/settings.json`: Spanish copy.
- `frontend/src/i18n/locales/en/settings.json`: English copy.
- `frontend/src/i18n/locales/de/settings.json`: German copy.

### Infrastructure and documentation files to modify

- `docker-compose.yml`: OpenWA service, volume, backend environment, and healthcheck.
- `docker.env.example`: documented OpenWA variables.
- `README.md`: central-session setup and validation runbook.

---

### Task 1: Phone Domain and Idempotent Schema

**Files:**
- Create: `backend/src/services/whatsappPhone.ts`
- Create: `backend/src/services/whatsappPhone.test.ts`
- Modify: `backend/src/config/database.ts`

**Interfaces:**
- Produces: `normalizeWhatsAppPhone(value: unknown): string | null`
- Produces: `maskWhatsAppPhone(phone: string): string`
- Produces: `toOpenWaChatId(phone: string): string`
- Produces schema columns `users.whatsapp_phone`, `users.whatsapp_consent_at`, `users.whatsapp_verified_at`, and `notification_settings.whatsapp_enabled`.

- [ ] **Step 1: Write phone-domain tests**

```ts
import {
  maskWhatsAppPhone,
  normalizeWhatsAppPhone,
  toOpenWaChatId,
} from './whatsappPhone';

describe('WhatsApp phone domain', () => {
  it.each([
    ['+1 809-555-1234', '18095551234'],
    ['34 612 345 678', '34612345678'],
    ['18095551234', '18095551234'],
  ])('normalizes %s', (input, expected) => {
    expect(normalizeWhatsAppPhone(input)).toBe(expected);
  });

  it.each(['', '0123456789', '1234567', '1234567890123456', '1ABC5551234'])('rejects %s', (input) => {
    expect(() => normalizeWhatsAppPhone(input)).toThrow('Invalid WhatsApp phone number');
  });

  expect(maskWhatsAppPhone('18095551234')).toBe('*******1234');
  expect(toOpenWaChatId('18095551234')).toBe('18095551234@c.us');
});
```

- [ ] **Step 2: Run the test and verify RED**

Run from `backend`: `npx jest src/services/whatsappPhone.test.ts --runInBand`

Expected: FAIL because `whatsappPhone.ts` does not exist.

- [ ] **Step 3: Implement the phone helpers**

```ts
export function normalizeWhatsAppPhone(value: unknown): string | null {
  if (value == null) return null;
  const raw = String(value).trim();
  if (!raw) throw new Error('Invalid WhatsApp phone number');
  if (!/^\+?[\d\s-]+$/.test(raw)) throw new Error('Invalid WhatsApp phone number');
  const normalized = raw.replace(/^\+/, '').replace(/[\s-]/g, '');
  if (!/^[1-9]\d{7,14}$/.test(normalized)) throw new Error('Invalid WhatsApp phone number');
  return normalized;
}

export function maskWhatsAppPhone(phone: string): string {
  return `${'*'.repeat(Math.max(0, phone.length - 4))}${phone.slice(-4)}`;
}

export function toOpenWaChatId(phone: string): string {
  return `${phone}@c.us`;
}
```

- [ ] **Step 4: Add idempotent migrations**

Add after the existing notification tables in `createTables()`:

```sql
ALTER TABLE users ADD COLUMN IF NOT EXISTS whatsapp_phone VARCHAR(20);
ALTER TABLE users ADD COLUMN IF NOT EXISTS whatsapp_consent_at TIMESTAMP;
ALTER TABLE users ADD COLUMN IF NOT EXISTS whatsapp_verified_at TIMESTAMP;
ALTER TABLE notification_settings
  ADD COLUMN IF NOT EXISTS whatsapp_enabled BOOLEAN NOT NULL DEFAULT FALSE;
```

- [ ] **Step 5: Run focused tests and TypeScript**

Run from `backend`:

```text
npx jest src/services/whatsappPhone.test.ts --runInBand
npx tsc --noEmit
```

Expected: phone tests PASS and TypeScript exits 0.

- [ ] **Step 6: Commit**

```text
git add backend/src/services/whatsappPhone.ts backend/src/services/whatsappPhone.test.ts backend/src/config/database.ts
git commit -m "feat: add WhatsApp phone preferences schema"
```

---

### Task 2: OpenWA HTTP Adapter

**Files:**
- Create: `backend/src/services/openWaService.ts`
- Create: `backend/src/services/openWaService.test.ts`

**Interfaces:**
- Consumes: `toOpenWaChatId(phone: string)` and `maskWhatsAppPhone(phone: string)` from Task 1.
- Produces: `isOpenWaConfigured(): boolean`
- Produces: `formatMessageForWhatsApp(html: string): string`
- Produces: `sendWhatsAppMessage(phone: string, message: string): Promise<{ ok: true; providerMessageId?: string } | { ok: false; code: string; message: string }>`

- [ ] **Step 1: Write adapter tests with mocked fetch**

Cover these exact cases:

```ts
it('converts supported HTML before sending', async () => {
  process.env.OPENWA_ENABLED = 'true';
  process.env.OPENWA_BASE_URL = 'http://openwa:2785/api';
  process.env.OPENWA_API_KEY = 'secret';
  process.env.OPENWA_SESSION_ID = 'central';
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ data: { id: 'wamid-1' } }),
  }) as jest.Mock;

  await expect(sendWhatsAppMessage('18095551234', '<b>Pago</b><br>Hoy')).resolves.toEqual({
    ok: true,
    providerMessageId: 'wamid-1',
  });
  expect(global.fetch).toHaveBeenCalledWith(
    'http://openwa:2785/api/sessions/central/messages/send-text',
    expect.objectContaining({
      method: 'POST',
      headers: expect.objectContaining({ 'X-API-Key': 'secret' }),
      body: JSON.stringify({ chatId: '18095551234@c.us', text: '*Pago*\nHoy' }),
    })
  );
});

it.each([401, 404, 503])('returns an explicit provider error for HTTP %s', async (status) => {
  global.fetch = jest.fn().mockResolvedValue({ ok: false, status, text: async () => 'provider error' }) as jest.Mock;
  await expect(sendWhatsAppMessage('18095551234', 'test')).resolves.toMatchObject({ ok: false });
});
```

Add cases for missing configuration, malformed successful response, timeout/abort, and masking in logged errors.

- [ ] **Step 2: Run the test and verify RED**

Run: `npx jest src/services/openWaService.test.ts --runInBand`

Expected: FAIL because the adapter does not exist.

- [ ] **Step 3: Implement configuration and formatting**

Use an `AbortController` and a default timeout of 10 seconds. Normalize `OPENWA_BASE_URL` by removing trailing slashes. Translate `<b>`/`<strong>` to `*`, `<br>` and paragraph boundaries to newlines, decode the small set of entities produced by templates, and strip remaining tags.

The request body must be:

```ts
{
  chatId: toOpenWaChatId(phone),
  text: formatMessageForWhatsApp(message),
}
```

Return `{ ok: false, code: 'NOT_CONFIGURED' | 'TIMEOUT' | 'SESSION_UNAVAILABLE' | 'PROVIDER_ERROR', message }` instead of throwing for expected provider failures.

- [ ] **Step 4: Run focused tests and TypeScript**

```text
npx jest src/services/openWaService.test.ts --runInBand
npx tsc --noEmit
```

Expected: adapter tests PASS and TypeScript exits 0.

- [ ] **Step 5: Commit**

```text
git add backend/src/services/openWaService.ts backend/src/services/openWaService.test.ts
git commit -m "feat: add OpenWA messaging adapter"
```

---

### Task 3: User WhatsApp Configuration, Consent, and Verification

**Files:**
- Create: `backend/src/controllers/whatsappNotificationController.ts`
- Create: `backend/src/controllers/whatsappNotificationController.test.ts`
- Modify: `backend/src/routes/notifications.ts`

**Interfaces:**
- Consumes Task 1 phone helpers and Task 2 `sendWhatsAppMessage`.
- Produces `GET /api/notifications/whatsapp`.
- Produces `PUT /api/notifications/whatsapp` with `{ phone: string | null, consent: boolean }`.
- Produces `POST /api/notifications/test/whatsapp`.

- [ ] **Step 1: Write controller tests**

Mock the database and OpenWA adapter. Assert:

```ts
expect(getResponse.body).toEqual({
  success: true,
  whatsapp: {
    phone: '18095551234',
    consented: true,
    verified: false,
    consentedAt: expect.any(String),
    verifiedAt: null,
  },
});
```

Add tests proving:

- Saving a new normalized phone sets consent server-side and clears verification.
- Re-saving the same phone with consent preserves verification.
- Withdrawing consent clears both timestamps and sets every `notification_settings.whatsapp_enabled` to false in one transaction.
- A failed OpenWA test does not set verification.
- A successful OpenWA test sets verification only when the phone still matches inside the update predicate.

- [ ] **Step 2: Run the tests and verify RED**

Run: `npx jest src/controllers/whatsappNotificationController.test.ts --runInBand`

Expected: FAIL because handlers and routes do not exist.

- [ ] **Step 3: Implement transactional configuration handlers**

Use `getClient()`, `BEGIN`, a tenant-scoped `SELECT ... FOR UPDATE`, conditional updates, `COMMIT`, `ROLLBACK`, and `release()`.

The successful response shape is:

```ts
type WhatsAppUserConfiguration = {
  phone: string | null;
  consented: boolean;
  verified: boolean;
  consentedAt: string | null;
  verifiedAt: string | null;
};
```

- [ ] **Step 4: Add routes before `/:id`**

```ts
router.get('/whatsapp', getWhatsAppConfiguration);
router.put('/whatsapp', updateWhatsAppConfiguration);
router.post('/test/whatsapp', testWhatsAppNotification);
```

Keep them behind the existing authentication and subscription middleware.

- [ ] **Step 5: Run focused tests and TypeScript**

```text
npx jest src/controllers/whatsappNotificationController.test.ts --runInBand
npx tsc --noEmit
```

- [ ] **Step 6: Commit**

```text
git add backend/src/controllers/whatsappNotificationController.ts backend/src/controllers/whatsappNotificationController.test.ts backend/src/routes/notifications.ts
git commit -m "feat: add WhatsApp consent and verification API"
```

---

### Task 4: Per-Type Preferences and Independent Channel Tests

**Files:**
- Modify: `backend/src/controllers/notificationController.ts`
- Modify: `backend/src/routes/notifications.ts`
- Create: `backend/src/controllers/notificationChannelTests.test.ts`

**Interfaces:**
- Extends notification settings with `whatsappEnabled: boolean`.
- Produces `POST /api/notifications/test/telegram`.
- Preserves `POST /api/notifications/test` as a Telegram alias.
- Preserves `POST /api/notifications/push/test` and adds `POST /api/notifications/test/push` as the canonical parallel route.

- [ ] **Step 1: Write settings and route tests**

Assert that `getNotificationSettings` maps `whatsapp_enabled` and that update SQL preserves all existing fields while writing it.

Write rejection cases:

```ts
it('rejects enabling WhatsApp without consent and verification', async () => {
  mockQuery
    .mockResolvedValueOnce({ rows: [{ whatsapp_phone: '18095551234', whatsapp_consent_at: null, whatsapp_verified_at: null }] });
  await updateNotificationSettings(req({ whatsappEnabled: true }), res);
  expect(res.status).toHaveBeenCalledWith(409);
});
```

Add route-level assertions that Telegram, WhatsApp, and Push handlers are distinct and that the legacy Telegram alias remains registered.

- [ ] **Step 2: Run the tests and verify RED**

Run: `npx jest src/controllers/notificationChannelTests.test.ts --runInBand`

- [ ] **Step 3: Implement settings mapping and guarded update**

Before storing `whatsappEnabled: true`, query:

```sql
SELECT whatsapp_phone, whatsapp_consent_at, whatsapp_verified_at
FROM users
WHERE id = $1
```

Return HTTP 409 unless all three fields are present. Extend the upsert with `whatsapp_enabled`, but do not change the defaults for Telegram or email.

- [ ] **Step 4: Split and alias test routes**

Rename the Telegram handler to `testTelegramNotification`, route it at both `/test/telegram` and `/test`, and route the existing push handler at both `/test/push` and `/push/test`.

- [ ] **Step 5: Run focused and compatibility tests**

```text
npx jest src/controllers/notificationChannelTests.test.ts --runInBand
npx tsc --noEmit
```

- [ ] **Step 6: Commit**

```text
git add backend/src/controllers/notificationController.ts backend/src/controllers/notificationChannelTests.test.ts backend/src/routes/notifications.ts
git commit -m "feat: add per-type WhatsApp notification settings"
```

---

### Task 5: Isolated Multichannel Dispatcher and Scheduler Integration

**Files:**
- Create: `backend/src/services/notificationChannelDispatcher.ts`
- Create: `backend/src/services/notificationChannelDispatcher.test.ts`
- Create: `backend/src/services/notificationWhatsAppScheduler.test.ts`
- Modify: `backend/src/services/notificationService.ts`
- Modify: `backend/src/services/telegramService.ts`
- Modify: `backend/src/services/webPushService.ts`

**Interfaces:**
- Consumes `sendWhatsAppMessage(phone, message)`.
- Produces:

```ts
export type NotificationChannel = 'PUSH' | 'TELEGRAM' | 'WHATSAPP';
export type ChannelDeliveryResult = {
  channel: NotificationChannel;
  ok: boolean;
  errorCode?: string;
};
export async function dispatchNotificationChannels(input: {
  userId: number;
  notificationId: number;
  title: string;
  message: string;
  telegram?: { enabled: boolean; chatId: string | null };
  whatsapp?: { enabled: boolean; phone: string | null };
  pushEnabled: boolean;
}): Promise<ChannelDeliveryResult[]>;
```

- [ ] **Step 1: Write dispatcher failure-isolation tests**

```ts
it('continues WhatsApp and Push when Telegram fails', async () => {
  mockTelegram.mockResolvedValue(false);
  mockWhatsApp.mockResolvedValue({ ok: true });
  mockPush.mockRejectedValue(new Error('push unavailable'));

  await expect(dispatchNotificationChannels(inputWithAllChannels)).resolves.toEqual(
    expect.arrayContaining([
      { channel: 'TELEGRAM', ok: false, errorCode: 'SEND_FAILED' },
      { channel: 'WHATSAPP', ok: true },
      { channel: 'PUSH', ok: false, errorCode: 'SEND_FAILED' },
    ])
  );
});
```

Add the inverse OpenWA-failure case and verify disabled channels are not called.

- [ ] **Step 2: Run dispatcher tests and verify RED**

Run: `npx jest src/services/notificationChannelDispatcher.test.ts --runInBand`

- [ ] **Step 3: Implement the dispatcher with settled deliveries**

Build only enabled calls and settle each independently. Convert expected failures into `ChannelDeliveryResult`; log channel, user ID, notification ID, and error code, never destination or secret.

- [ ] **Step 4: Write scheduler regression tests**

Tests must prove the scheduler query selects `u.whatsapp_phone`, `u.whatsapp_consent_at`, `u.whatsapp_verified_at`, and `ns.whatsapp_enabled`; inactive/unverified WhatsApp never dispatches; verified WhatsApp and Telegram can dispatch together; OpenWA failure does not mark the sweep failed.

- [ ] **Step 5: Replace direct channel calls in all three reminder branches**

For `CARD_PAYMENT`, `LOAN_PAYMENT`, and `RECURRING_EXPENSE`, call `dispatchNotificationChannels` after inserting the in-app row. Preserve the existing templates and eligibility queries.

- [ ] **Step 6: Run scheduler, dispatcher, and full backend tests**

```text
npx jest src/services/notificationChannelDispatcher.test.ts src/services/notificationWhatsAppScheduler.test.ts --runInBand
npx jest --runInBand --forceExit
npx tsc --noEmit
```

- [ ] **Step 7: Commit**

```text
git add backend/src/services/notificationChannelDispatcher.ts backend/src/services/notificationChannelDispatcher.test.ts backend/src/services/notificationWhatsAppScheduler.test.ts backend/src/services/notificationService.ts backend/src/services/telegramService.ts backend/src/services/webPushService.ts
git commit -m "feat: dispatch reminders across isolated channels"
```

---

### Task 6: WhatsApp Settings UI and Localized Channel Tests

**Files:**
- Create: `frontend/src/components/WhatsAppNotificationSettings.tsx`
- Create: `frontend/src/components/WhatsAppNotificationSettings.test.tsx`
- Modify: `frontend/src/pages/Settings.tsx`
- Modify: `frontend/src/types/index.ts`
- Modify: `frontend/src/i18n/locales/es/settings.json`
- Modify: `frontend/src/i18n/locales/en/settings.json`
- Modify: `frontend/src/i18n/locales/de/settings.json`

**Interfaces:**
- Consumes `GET/PUT /notifications/whatsapp` and `POST /notifications/test/whatsapp`.
- Consumes `whatsappEnabled` in notification settings.
- Produces:

```ts
export interface WhatsAppNotificationConfiguration {
  phone: string | null;
  consented: boolean;
  verified: boolean;
  consentedAt: string | null;
  verifiedAt: string | null;
}
```

- [ ] **Step 1: Write component tests**

Mock the API and assert:

- Unconfigured state displays phone input and unchecked consent.
- Saving calls `PUT /notifications/whatsapp` with `{ phone, consent: true }`.
- Pending state offers a test button.
- Successful test refreshes state and displays verified.
- Changing the phone returns to pending.
- Withdrawal calls `{ phone: null, consent: false }` after confirmation.
- API errors display translated toast messages.

- [ ] **Step 2: Run component tests and verify RED**

Run from `frontend`: `npx craco test --watchAll=false --runInBand src/components/WhatsAppNotificationSettings.test.tsx`

- [ ] **Step 3: Implement the focused component**

Keep API/state logic inside the new component rather than expanding `Settings.tsx`. Disable test until number and consent exist. Display only the current user's full number.

- [ ] **Step 4: Add per-type WhatsApp toggles**

Extend the default setting object:

```ts
{
  enabled: true,
  telegramEnabled: false,
  whatsappEnabled: false,
  daysBefore: [3, 7],
}
```

Disable each WhatsApp toggle unless the fetched configuration is verified; retain the stored false value and show explanatory text.

- [ ] **Step 5: Point test buttons to canonical routes**

Telegram uses `/notifications/test/telegram`, WhatsApp stays encapsulated in its component, and Push uses `/notifications/test/push`.

- [ ] **Step 6: Add complete translations**

Add equivalent keys in `es`, `en`, and `de` for title, phone label/hint, consent, save, withdraw, states, test, toggle, prerequisite explanation, success, and each actionable error.

- [ ] **Step 7: Run frontend tests and TypeScript**

```text
npx craco test --watchAll=false --runInBand --forceExit
npx tsc --noEmit
```

- [ ] **Step 8: Commit**

```text
git add frontend/src/components/WhatsAppNotificationSettings.tsx frontend/src/components/WhatsAppNotificationSettings.test.tsx frontend/src/pages/Settings.tsx frontend/src/types/index.ts frontend/src/i18n/locales/es/settings.json frontend/src/i18n/locales/en/settings.json frontend/src/i18n/locales/de/settings.json
git commit -m "feat: add WhatsApp notification settings UI"
```

---

### Task 7: OpenWA Docker Service and Operator Runbook

**Files:**
- Modify: `docker-compose.yml`
- Modify: `docker.env.example`
- Modify: `README.md`

**Interfaces:**
- Provides internal API at `http://openwa:2785/api`.
- Provides loopback dashboard at `http://localhost:2785`.
- Provides persistent volume `openwa_data:/app/data`.

- [ ] **Step 1: Add explicit environment examples**

```dotenv
OPENWA_ENABLED=false
OPENWA_API_KEY=replace-with-a-long-random-key
OPENWA_SESSION_ID=paulino-finance-central
OPENWA_BASE_URL=http://openwa:2785/api
OPENWA_REQUEST_TIMEOUT_MS=10000
OPENWA_PORT=2785
```

- [ ] **Step 2: Add the pinned OpenWA service**

```yaml
openwa:
  image: ghcr.io/rmyndharis/openwa:0.12.5
  container_name: paulino-finance-openwa
  restart: unless-stopped
  environment:
    NODE_ENV: production
    PORT: 2785
    API_MASTER_KEY: ${OPENWA_API_KEY:-}
    AUTO_START_SESSIONS: ${OPENWA_AUTO_START_SESSIONS:-true}
    ENGINE_TYPE: ${OPENWA_ENGINE_TYPE:-whatsapp-web.js}
  ports:
    - "127.0.0.1:${OPENWA_PORT:-2785}:2785"
  volumes:
    - openwa_data:/app/data
  networks:
    - paulino-network
  healthcheck:
    test: ["CMD", "node", "-e", "fetch('http://127.0.0.1:2785/api/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"]
    interval: 15s
    timeout: 5s
    retries: 20
    start_period: 60s
```

Add `openwa_data:` to top-level volumes and pass the five backend variables from the Compose environment. Do not make backend startup depend on OpenWA health.

- [ ] **Step 3: Validate Compose before starting it**

Run: `docker compose config`

Expected: exit 0, pinned OpenWA image, loopback host binding, backend variables present, and no undefined service/volume.

- [ ] **Step 4: Write the operator runbook**

Document:

1. Generate a long `OPENWA_API_KEY` and place it in root `.env`.
2. Set `OPENWA_ENABLED=true`.
3. Start/recreate the stack.
4. Open `http://localhost:2785`.
5. Authenticate with the configured key.
6. Create session `paulino-finance-central`, start it, and scan QR or enter pairing code.
7. Confirm session ready.
8. Configure and test a user's number in Paulino Finance.
9. Note that OpenWA is unofficial and the central number can be restricted by WhatsApp.

- [ ] **Step 5: Commit**

```text
git add docker-compose.yml docker.env.example README.md
git commit -m "infra: add pinned OpenWA service"
```

---

### Task 8: Build Artifacts, Full Verification, and Live Handoff

**Files:**
- Modify: `backend/dist/**` through the existing backend build.
- No source behavior changes unless a verification failure identifies a defect.

**Interfaces:**
- Consumes every preceding task.
- Produces a reproducible stack ready for central-session linking.

- [ ] **Step 1: Run complete backend verification**

From `backend`:

```text
npx jest --runInBand --forceExit
npx tsc --noEmit
npm run build
```

Expected: every suite passes, both TypeScript commands exit 0, and `dist` reflects source.

- [ ] **Step 2: Run complete frontend verification**

From `frontend`:

```text
npx craco test --watchAll=false --runInBand --forceExit
npx tsc --noEmit
```

Expected: every suite passes and TypeScript exits 0.

- [ ] **Step 3: Run repository checks**

```text
git diff --check
git status --short
docker compose config
```

Expected: no whitespace errors; only intended product files plus the pre-existing unstaged `AGENTS.md` change.

- [ ] **Step 4: Rebuild and recreate Docker**

Run from repository root:

```text
docker compose up -d --build --force-recreate
docker compose ps
```

Expected: PostgreSQL healthy; backend, frontend, and OpenWA running. A missing/unlinked WhatsApp session must not prevent backend/frontend health.

- [ ] **Step 5: Verify application endpoints**

```text
docker exec paulino-finance-backend wget -qO- http://127.0.0.1:5000/health
docker exec paulino-finance-frontend wget -q --spider http://127.0.0.1:3000
docker exec paulino-finance-openwa node -e "fetch('http://127.0.0.1:2785/api/health').then(async r=>{console.log(await r.text());if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
```

Expected: backend and OpenWA health JSON plus successful frontend response.

- [ ] **Step 6: Perform authenticated smoke tests without a linked session**

Verify Telegram and Push tests still use their independent routes. Verify WhatsApp returns an actionable session/configuration error rather than a generic 500 and does not change `whatsapp_verified_at`.

- [ ] **Step 7: Commit generated artifacts**

```text
git add backend/dist
git commit -m "build: regenerate backend artifacts"
```

- [ ] **Step 8: Request code review and close all critical/important findings**

Review the complete implementation range against the design spec. Re-run the affected focused test plus both full suites after every correction.

- [ ] **Step 9: Hand off the live-session step**

Ask the operator to link the central number in the OpenWA panel. Then use a consenting test user to send one WhatsApp test and confirm `whatsapp_verified_at` becomes non-null. Enable one reminder type and confirm Telegram plus WhatsApp can both be selected.
