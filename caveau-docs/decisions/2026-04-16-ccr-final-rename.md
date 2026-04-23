# Decision: Rename "Caveau Certificate" → "Caveau Custody & Condition Report" (final)

**Date:** 2026-04-16 (8:20 PM)
**Decided by:** Robert Saenz (founder)
**Status:** Implemented — final name, not a placeholder

## Context

Earlier the same day we adopted "Caveau Certificate" as a neutral, brand-anchored placeholder while a real naming exercise ran in parallel (see [2026-04-16-caveau-certificate-rename.md](./2026-04-16-caveau-certificate-rename.md)). Eight hours later Rob emailed Samuel and Nate (8:20 PM, cc'd Sam Pratt-Jalloh) naming the problem with "Certificate" as a category and picking the final name.

## Decision

The document is the **Caveau Custody & Condition Report (CCR)**, not a certificate of any kind. Everywhere the app, member conversations, or collateral previously said "Provenance Certificate," "Custody & Condition Report" (pre-rename), or "Caveau Certificate" (placeholder) now reads "Caveau Custody & Condition Report" long-form or "CCR" short-form.

## Rob's Rationale

Three arguments from the email, in his words:

1. **"Certificate" implies certifying authority.** Auction houses have pre-existing relationships with known certifying institutions. A "Caveau Provenance Certificate" or "Caveau Certificate" at Christie's or Sotheby's intake gets the question *"who is Caveau and why should we accept this?"* — and pre-launch we can't answer that with authority.
2. **We don't need to claim authority.** What Christie's, Sotheby's, and Hart Davis Hart actually ask for at consignment is *documentation*: purchase history, storage conditions, custody chain, photographic inventory. They don't require a certificate from a specific authority; they require a credible, verifiable paper trail. That's what the platform produces.
3. **"Custody & Condition Report" is accurate and defensible.** It describes what the document literally is — a record of everything that happened to the bottle from the day it entered Caveau custody. No overclaim. As Caveau establishes direct relationships with auction houses and insurers, the weight of the document grows with the company; the name doesn't have to do that work upfront.

The CCR contents per Rob's email:
- Purchase records and acquisition history
- NFC tag assignment and scan history for each bottle
- Continuous Sentinel monitoring data (temperature, humidity, UV, vibration)
- Storage facility documentation and custody chain records
- Photographic inventory from intake

## Changes Made

Commit `fe5479f` on `main` pushed 2026-04-16 8:57 PM ET:

- Member-facing copy across 22 files (UI headings, card titles, page text, button labels, timeline event titles, tier benefit list)
- PDF export title + subject metadata (`renderProvenancePdf`)
- Handoff package label ("Caveau Certificate" → "Custody & Condition Report" field)
- Verify page ("Certificate Verified" → "Report Verified", "Certificate No." → "Report No.")
- Document header subtitle on `/report/[id]`: dropped "CERTIFICATE" eyebrow → "CUSTODY & CONDITION REPORT"
- Doc comments, CLAUDE.md, SPEC.md, README.md, docs/* all synchronized
- Memory updated (NFC strategy memory — final name locked, rationale captured)

## What Was Deliberately Not Changed

Same set as the previous two renames — kept stable so issued hashes still verify and existing deploy envs don't break:

- **Routes** — `/report/[id]` (primary), `/certificate/[id]` (legacy redirect), `/verify/[hash]`
- **DB model** — `ProvenanceCertificate` (internal name only; zero migration risk)
- **Env var** — `CERTIFICATE_HMAC_SECRET`
- **HMAC algorithm + domain string** — so every CCR hash ever issued still validates on `/verify/[hash]`
- **Internal identifiers** — file names (`certificate-doc.tsx`, `certificate-hash.ts`, `api/certificates/[id]/*`), the `certificateNumber` field in DB/types, the `"certificate"` timeline-event-kind key, component function names
- **Migration SQL comments from prior renames** — frozen historical record
- **Investor deck, 10-bottle PDF, equity summary .docx** — binary files; Rob's pass before the next investor conversation
- **Rob's earlier email threads in `communications/`** — verbatim historical record; the 04-08 thread's line-107 use of "Custody & Condition Report" is Rob's own words and now happens to match the final name

## Why It Matters

This name choice is credibility-defensive. For a luxury-vault startup pre-launch, the story at an auction-house intake desk ("we provide the Caveau Custody & Condition Report — here's the unbroken custody chain, the environmental envelope, the photo inventory") is a stronger sell than the story implied by "Certificate" ("you should accept our certification"). The CCR frames Caveau as the documentation layer auction houses can verify against, not the authority auction houses must trust.

Rob's closing line in the email: *"That's a stronger story than a certificate from a company no one has heard of yet."*

## Follow-ups

- **Investor materials** (pitch deck, 10-bottle PDF, equity summary) — binary files, need Rob's pass before the next investor conversation. The gap-list "Revised asks for Rob" #1 ("Pick the real Caveau Certificate name") is now resolved.
- **AI Advisor prompt scaffolding** (Phase 6 #50) should be written against the CCR name from day one so the advisor never says "certificate."
- **Future email / collateral from Samuel to auction houses** — default to long form first mention ("Caveau Custody & Condition Report"), CCR on subsequent mentions.
