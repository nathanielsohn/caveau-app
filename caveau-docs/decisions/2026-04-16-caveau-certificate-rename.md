# Decision: Rename "Custody & Condition Report" → "Caveau Certificate" (placeholder)

**Date:** 2026-04-16
**Decided by:** Robert Saenz (founder), Nathaniel Sohn (CTO)
**Status:** Superseded 2026-04-16 (same day, 8:20 PM) by [Caveau Custody & Condition Report final rename](./2026-04-16-ccr-final-rename.md). Placeholder was live for roughly eight hours.

## Context

One day after the 2026-04-15 rename to "Custody & Condition Report," Rob said the name needs to change again. No final replacement picked yet — Rob will do a separate naming exercise (brand strategist prompt drafted for that purpose).

Pre-launch, one-maintainer codebase: a rename later is a find/replace, not a migration. Rather than block other work on a naming decision, ship a neutral, brand-anchored placeholder now.

## Decision

Use **"Caveau Certificate"** as the interim name across all user-facing surfaces. Final name to be chosen separately.

The document header reads "Caveau / CERTIFICATE" (the "Caveau" logo is already set in serif above, so the subtitle drops the brand to avoid "Caveau Caveau").

## Changes Made

- User-facing copy: all "Custody & Condition Report" / "Provenance Certificate" → "Caveau Certificate"
- Document + PDF header subtitle: "CUSTODY & CONDITION REPORT" → "CERTIFICATE"
- Timeline h2 ("Custody & Condition Timeline") → "Timeline" (eyebrow "Chain of Custody" retained)
- Public page footers: dropped "Custody & Condition Services" tagline → "Caveau · Naples, FL"
- Tier copy, nav text, verify page, bottle landing, handoff bundle, wine detail link, layout metadata
- Doc comments + CLAUDE.md / SPEC.md / README.md / docs/* updated

## What Was Deliberately Not Changed

To keep a future rename cheap and avoid breakage:
- **Routes** — `/report/[id]`, `/certificate/[id]` (legacy redirect), `/verify/[hash]` all unchanged
- **DB model** — `ProvenanceCertificate` (internal name — no migration risk)
- **Env var** — `CERTIFICATE_HMAC_SECRET` (renaming breaks deployed envs)
- **HMAC domain + algorithm** — unchanged, so every certificate issued to date still verifies
- **Migration SQL comments** — frozen historical record, left alone
- **Investor deck / 10-bottle PDF / pitch materials** — binary files, will need Rob's pass separately before the next investor conversation
- **Rob's 2026-04-08 email thread** — historical communication record, left verbatim

## Why It Matters

"Caveau Certificate" is a neutral, brand-anchored placeholder. It's short, reads well on the document header and in conversation ("I'll send you the Caveau Certificate for that Lafite"), and sidesteps overclaiming — we attest to custody + condition while in our vault, not to pre-custody authenticity.

The real risk of waiting for the perfect name is that it blocks other work. Shipping a serviceable placeholder keeps momentum; the next rename is cheap because the plumbing didn't change.
