# Component Guide

> Last updated: 2026-04-13 | All components built

## Overview

Caveau uses 17 shared components, each in its own file under `src/components/`. Related sub-components are colocated in the same file to keep the file count low.

## Components

### providers.tsx
**Status:** Complete (Track A — Auth)

Thin client wrapper around NextAuth's `SessionProvider`. Exists as a separate file because `layout.tsx` is a Server Component and cannot import a client context directly.

**Props:** `children`

**Used in:** `app/layout.tsx` (wraps the entire app)

---

### nav.tsx
**Status:** Complete (Feature 03)

The app shell navigation. Two layouts:
- **Desktop:** Fixed left sidebar — Caveau ◈ logo, 4 nav links (Dashboard, Collection, Locker, Sentinel), member name at bottom
- **Mobile (<768px):** Fixed bottom tab bar with 4 icons

**Used in:** `layout.tsx` (wraps all pages)

---

### facility-context.tsx
**Status:** Complete (Feature #16 — multi-facility support)

Client-side React context that powers the nav's facility switcher. `FacilityProvider` is mounted inside `nav.tsx` with the current member's facilities and the active facility id; consumers call `useFacility()` to read the list and call `switchFacility(id)` to change it. The switcher calls the `setCurrentFacility` server action (writes the signed facility cookie), then hard-navigates the current path so client-side filter/sort state resets and server components re-query against the new facility scope.

**Props (`FacilityProvider`):** `facilities`, `currentFacilityId`, `children`

**Used in:** `nav.tsx` (provider) and the dropdown rendered inside the nav (consumer)

---

### scan-label-button.tsx
**Status:** Complete (Feature #24 — wine label OCR)

Reusable client button for scanning a wine label via Google Cloud Vision. Owns its own file input, upload state, scan state, and error state so it can be dropped into both the standalone `AddWineForm` and the inline locker-slot add-wine form. Flow: validate file (jpeg/png/webp, ≤5MB) → presign + PUT to S3 → call OCR server action → emit `onParsed` with parsed fields + S3 image key. When `GOOGLE_CLOUD_VISION_API_KEY` is unset the button renders disabled with a tooltip; parents hide it entirely when S3 is also unconfigured. Status region announces progress and errors via `aria-live`.

**Props:** `visionConfigured`, `getUploadUrl`, `scanAction`, `onParsed`, plus optional styling overrides

**Used in:** `add-wine-form.tsx`, locker-grid inline add-wine form

---

### toast.tsx
**Status:** Complete

Self-contained toast system — no library, no context, no prop drilling. Any client component calls `showToast(message, kind)` and the global `<Toaster />` mounted in the root layout picks it up via a window `CustomEvent`. Two kinds: `"success"` (gold check) and `"error"` (danger X). Auto-dismiss after 3.5s with manual dismiss via the X button; stacks up to 4 toasts and drops the oldest.

**Exports:** `Toaster` (mount in layout), `showToast(message, kind)` helper, `ToastKind` type

**Used in:** `app/layout.tsx` (mounts `Toaster`); any client component that needs to signal success/error feedback

---

### metric-card.tsx
**Status:** Complete (Feature 04)

Reusable stat card showing an icon, large value, label, and optional trend indicator.

**Props:** `icon`, `value`, `label`, `trend?` (percentage with up/down arrow)

**Used in:** Dashboard, Sentinel condition cards

---

### wine-card.tsx
**Status:** Complete (Feature 06, updated for investor demo and #37)

Wine bottle card for grid/list display. Shows wine image (or placeholder), name (serif font), vintage, region badge, drink window badge (Ready to Drink / Aging / Past Peak), current value with appreciation %. Clickable — links to `/wine/[id]`.

**Props:** Wine object from Prisma (includes `drinkWindowStart`, `drinkWindowEnd`, and `createdAt` for sort-by-recently-added in the collection view)

**Used in:** Collection page (grid mode). The collection page itself wraps the grid in a sort dropdown + expanded filter panel (#37) — see `src/app/collection/collection-client.tsx`.

---

### wine-image-upload.tsx
**Status:** Complete (Feature #18)

Client component that handles wine bottle photo upload via presigned S3 URL. On mount it checks whether image uploads are enabled (via a flag returned from the server action) — when `AWS_S3_BUCKET` is unset, the UI renders a friendly "uploads disabled" state instead of the dropzone so the rest of the wine detail page keeps working. Calls `getUploadUrl()` server action to mint a presigned PUT URL, then PUTs the file straight to S3, then calls `confirmUpload()` to persist the key on the wine row.

**Props:** `wineId`, `currentImageKey?`, `getUploadUrl`, `confirmUpload`

**Used in:** Wine detail page

---

### locker-grid.tsx
**Status:** Complete (Feature 08, extended by #35/#36/#38)

4×8 CSS grid representing a locker's 32 slots. Empty slots have dashed borders, occupied slots show wine name and a varietal-colored accent. Clicking an occupied slot opens a slide-in detail panel; clicking an empty slot opens the assign/add-wine modal (#35/#36).

A filter bar above the grid (added in #38) supports occupancy (all/occupied/empty), region, varietal, and drink-window status. Non-matching slots dim to `opacity-30` and become non-interactive — the physical layout never reflows so the locker stays visually intact.

**Props:** Locker slots (32), unassigned wines, add-wine trigger

**Used in:** Locker page

---

### sensor-charts.tsx
**Status:** Complete (Feature 09, updated for investor demo)

All Recharts visualizations and access log in one file:
- **TemperatureChart** — AreaChart with gold gradient fill, red reference lines at 50°F and 59°F
- **HumidityChart** — LineChart, blue
- **VibrationGauge** — Bar gauge with green/yellow/red zones
- **AccessLog** — Recent door/badge access events list

**Props:** Array of sensor readings, dark theme styling

**Used in:** Sentinel page

---

### dashboard-charts.tsx
**Status:** Complete (Stretch Goal 16)

Analytics charts for the dashboard:
- **CollectionValueChart** — Area chart showing collection value over time (from WineValuation data)
- **StorageUtilizationChart** — Donut chart showing occupied vs total locker slots
- **AlertFrequencyChart** — Bar chart showing alert counts per day (last 30 days)

**Props:** Valuation trend data, slot counts, alert frequency data

**Used in:** Dashboard page

---

### alert-list.tsx
**Status:** Complete (Feature 10)

Alert history table with columns: time, type, severity (color-coded badge), message, resolved status.

**Props:** Array of alerts (database + live)

**Used in:** Sentinel page, Dashboard (recent alerts)

---

### certificate-doc.tsx
**Status:** Complete (Feature 13 + Stretch Goal 17)

Full certificate layout: gold double-line border, Caveau ◈ logo centered, wine info, monitoring period, environmental summary, SHA-256 integrity badge, certificate number, QR code linking to `/verify/[hash]` for public verification. Print-optimized with `@media print` styles.

**Props:** ProvenanceCertificate with wine and locker relations

**Used in:** Certificate page

---

### add-wine-form.tsx
**Status:** Complete (Feature 07)

Modal form for adding a new wine. Fields: name, vintage, region, varietal, producer, purchase price. All inputs have `aria-required="true"`. Submits via Next.js Server Action.

**Props:** `open`, `onClose`, `addWineAction`

**Used in:** Collection page

---

### disposition-form.tsx
**Status:** Complete (Feature 34)

Native `<dialog>` modal for recording wine disposition (sold, transferred, consumed, gifted, removed). Conditional fields: sale price (for "sold"), recipient (for "transferred"/"gifted"). Uses `useEffect` to manage dialog open/close state. All icons have `aria-hidden="true"`, select has `aria-required` and `aria-label`.

**Props:** `open`, `onClose`, `wineId`, `wineName`, `recordDispositionAction`

**Used in:** Wine detail page

---

### valuation-chart.tsx
**Status:** Complete (Feature 34)

Price history chart for a single wine. Shows valuation entries over time with an inline form to add new valuations.

**Props:** `wineId`, `valuations` (array of `{date, price, source}`)

**Used in:** Wine detail page

---

### skeleton.tsx
**Status:** Complete

Loading skeleton primitives used by route-level `loading.tsx` files. Exports a base `Skeleton` (shimmer block) plus higher-level pieces like `MetricCardSkeleton`, `WineCardSkeleton`, and grid wrappers. All match the glass-card visual language so the perceived layout doesn't shift when real data arrives.

**Used in:** `app/loading.tsx`, `collection/loading.tsx`, `locker/loading.tsx`, `sentinel/loading.tsx`, `wine/[id]/loading.tsx`, `certificate/[id]/loading.tsx`, `verify/[hash]/loading.tsx`

---

## Lib Utilities

### auth.ts
NextAuth v4 configuration: Credentials provider (email + bcrypt), JWT strategy, 4-hour session, role/tier copied into the token. Exports `getServerAuth()` for Server Components and Server Actions.

### env.ts
Boot-time environment validation. Throws if `DATABASE_URL` or `NEXTAUTH_SECRET` is missing — fail fast at startup, not on the first request. All other vars (`NEXTAUTH_URL`, AWS/Google/Upstash keys, `CERTIFICATE_HMAC_SECRET`, `FACILITY_COOKIE_SECRET`, `NEXT_PUBLIC_SHOW_DEMO_CREDS`) are optional and surface as `string | undefined` so call sites have to handle the missing case explicitly.

### rate-limit.ts
In-memory per-IP token bucket. Used by `middleware.ts` for auth and verify endpoints. Resets on deploy and does not persist across serverless instances — adequate for the demo, replace with Upstash/KV for production hardening.

### safe-callback.ts
Whitelists `callbackUrl` query params so the login page can't be turned into an open redirect. Only same-origin pathnames pass.

### schemas.ts
Zod schemas for every request body and query string parsed by API routes. Includes `parseOr400()` helper that returns either typed data or a `NextResponse` with a generic 400.

### current-facility.ts
Facility cookie read/write used by the `/nav` facility switcher (#16). Encodes the member's currently-selected facility so server components can scope locker/sensor queries without a round-trip to the DB.

### email.ts
AWS SES client + `send()` wrapper. When `AWS_SES_FROM_EMAIL` is unset it logs the would-be send and no-ops, so dev/demo environments never hit SES.

### notify-alert.ts
Alert → email dispatch (#19). Reads each member's notification preferences (`emailAlertsEnabled`, severity threshold, cooldown), checks `Alert.notifiedAt` to enforce the cooldown, then calls `email.send()` and stamps `notifiedAt`. Safe to call from server actions and API routes.

### s3.ts
Presigned upload URL helpers + `getPublicUrl(imageKey)` (#18). Returns the CloudFront URL when `AWS_CLOUDFRONT_DOMAIN` is set, otherwise the direct S3 URL. When `AWS_S3_BUCKET` is unset, `isUploadEnabled()` returns false so the UI can show the disabled state.

### certificate-hash.ts
HMAC generation and verification for provenance certificate hashes. Keeps the hashing key in one place so `/verify/[hash]` and certificate creation use the same algorithm.

### use-body-scroll-lock.ts
React hook that locks background scroll when a modal is open — used by the disposition dialog, add-wine modal, and locker slot picker.

### logger.ts
Structured logging wrapper. Emits JSON in production, pretty output in development.

### prisma.ts
Prisma client singleton. Uses `globalThis` trick to prevent multiple instances in development (hot reload).

### utils.ts
Formatting helpers — all accept `Prisma.Decimal | number | string | null | undefined`:
- `toNumber()` — convert any value to a JS number
- `formatCurrency()` — e.g. "$4,800.00"
- `formatCurrencyCompact()` — e.g. "$4.8K"
- `formatNumber()` — e.g. "4,800" (configurable decimal places)
- `formatTemp()` — e.g. "55.2°F"
- `formatHumidity()` — e.g. "65.0%"
- `formatVibration()` — e.g. "0.12 mm/s"
- `formatLight()` — e.g. "0.5 lux"
- `formatRelativeTime()` — e.g. "2h ago"
- `formatDate()` — e.g. "Mar 15, 2026"
- `percentChange()` — percentage difference between two values

### sensors.ts
Sensor simulation using the specified formulas (sine wave + gaussian noise via Box-Muller transform). Exports `simulateReading()`, `checkThresholds()`, and `THRESHOLDS` constants.
