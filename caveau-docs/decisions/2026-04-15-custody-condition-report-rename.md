# Decision: Rename "Provenance Certificate" → "Custody & Condition Report"

**Date:** 2026-04-15
**Decided by:** Robert Saenz (founder), Nathaniel Sohn (CTO)
**Status:** Superseded 2026-04-16 by [Caveau Certificate placeholder rename](./2026-04-16-caveau-certificate-rename.md)

## Context

Rob's April 15 email to the team laid out the NFC bottle tracking strategy and used the term "Custody & Condition Report" to describe what the app previously called a "Provenance Certificate." The NFC tap on a tagged bottle pulls up "the bottle's complete Caveau Custody & Condition record — purchase history, storage data, custody chain."

## Decision

Rename all user-facing references from "Provenance Certificate" to "Custody & Condition Report." This better describes what the document actually is: a record of custody chain and environmental condition, not just an origin statement.

## Changes Made

- Route: `/certificate/[id]` → `/report/[id]` (legacy URL redirects)
- Component text: "Provenance Certificate" → "Custody & Condition Report"
- Timeline heading: "Provenance Timeline" → "Custody & Condition Timeline"
- PDF export: title and headers updated
- Verify page: all user-facing text updated
- Database: model name unchanged (`ProvenanceCertificate`) — internal naming is fine

## Why It Matters

"Custody & Condition Report" aligns with what auction houses (Christie's, Sotheby's) actually want: documented chain of custody with environmental records, not just a certificate of origin. The terminology reinforces Caveau's positioning as a trusted vault custodian.

Committed as `d4553a6 feat(42): rename Provenance Certificate → Custody & Condition Report`.
