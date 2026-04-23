# Decision: Reframe Caveau as "Naples Vault Operator's Software Layer"

**Date:** 2026-04-14
**Decided by:** Robert Saenz (founder), after investor review with Samuel Jalloh (biz dev) and Nathaniel Sohn (CTO)
**Status:** Adopted — core positioning for seed round

## Context

Caveau was originally scoped as a wine cellar management app — inventory, valuations, IoT sensors, Caveau Custody & Condition Reports — with a member-to-member marketplace on the Phase 3 roadmap (#33). The mental model was closer to "CellarTracker with better data and a monitoring layer."

During the April 2026 investor review Rob surfaced a broader thesis that had been implicit in the name all along. From his April 8 email to Samuel (see [`communications/2026-04-08-working-caveau-deck-thread.md`](../communications/2026-04-08-working-caveau-deck-thread.md)):

> *"A caveau is a wine cellar vault, and the vision has always been that the physical space is only one expression of that concept. The broader idea is a private wine storage market serving Naples specifically."*

Rob's Naples-specific observations:

- Southwest Florida clientele have serious collections and real vulnerabilities — they run out of cellar space, hurricane season brings flooding risk, fire and theft are real concerns.
- No purpose-built, climate-controlled facility positioned above sea level caters to that market other than [Carl's Wine Vault](https://www.carlswinevault.com/).
- Proper storage documentation under a monitored chain of custody is material to sale value at Christie's / Sotheby's / Hart Davis Hart.
- The locker program is the entry point; the storage facility is the infrastructure play above it; Sentinel is the technology backbone; the App ties it all together.

## Decision

Caveau is the **software layer for a Naples-based luxury wine vault operator**, not a general-purpose wine app. The primary narrative — to investors, to members, in UI copy, in product prioritization — is chain-of-custody and vault custodianship. Marketplace-style peer-to-peer trading, social/tasting-note features, and general collection-manager framing are explicitly downstream of that core.

Four levers define the business going forward:

1. **Physical infrastructure** — Naples vault facility, above sea level, purpose-built, climate-controlled. The moat.
2. **Sentinel IoT platform** — continuous environmental monitoring (temp / humidity / vibration / access). The evidence.
3. **Caveau Custody & Condition Report (CCR)** — the documentation auction houses and insurers verify against. The output.
4. **Caveau App** — the surface that turns 1–3 into a product a member can see, trust, and transact against.

The marketplace (#33) is deprioritized as a direct consequence — see [`2026-04-14-marketplace-deprioritized.md`](./2026-04-14-marketplace-deprioritized.md).

## Rationale

- **The name was always doing more work than the product was.** "Caveau" means vault. Shipping a collection-manager app under that name and leaving the vault as aspirational ceded the strongest piece of the story.
- **Naples is a viable first market on its own.** UHNW collectors with hurricane exposure and no above-sea-level custodian option is a real, contained, defensible wedge. We don't need national scale to make the unit economics work.
- **Chain-of-custody is defensible; collection management is not.** CellarTracker (free), Vivino (consumer), InVintory (luxury consumer app) already occupy the collection-manager space. None of them operate a physical vault. Physical infrastructure is the moat.
- **Insurance and auction-house credibility compound.** PURE / Chubb / AXA XL / Berkley One all underwrite private collections; documented custody changes their risk math. Christie's / Sotheby's want documentation at consignment. Both ecosystems reward a credible custodian more than they reward a better app.
- **The AI Advisor and Liv-ex intelligence land differently on top of a vault.** "Your bottle in our vault, monitored by our sensors, just hit a sell window" is a stronger product than "Your bottle somewhere, according to your data entry, maybe hit a sell window."

## What We Give Up

- **Consumer marketplace path.** Member-to-member trading (#33) moves off the roadmap. Exit facilitation (#47) — auction / broker / private sale handoff at commission — absorbs the underlying need.
- **Geographic optionality upfront.** The pitch, the seed spend, and the first 12–18 months of product work are Naples-first. Multi-location (#32) stays on the roadmap but doesn't drive design decisions today.
- **Collection-manager feature breadth.** Social features, tasting notes, community ratings, cellar-sharing — all of it gets deprioritized behind chain-of-custody, Sentinel, and CCR tooling. This is a narrowing, not a pause; we don't plan to revisit most of it.
- **Broader wine-tech positioning.** We will not describe ourselves as a wine app. In investor materials, deck copy, and app UI, we describe ourselves as a luxury wine vault with software — the order matters.

## Revisit Conditions

Reopen the framing if any of the following hold:

- Naples vault economics don't work — we can't secure above-sea-level space at a cost that supports the published tier pricing, or UHNW demand doesn't materialize at projected rates after the first 12 months of operations.
- A strategic software acquirer surfaces with meaningfully better terms than the vault-plus-software story suggests — in that scenario the software layer may need to become portable / multi-custodian sooner than Phase 5 currently assumes.
- Regulatory or insurance posture shifts such that custody documentation stops being the differentiating currency at auction houses and with underwriters.
- Multi-location expansion lands earlier than planned (e.g., through a partnership) and "Naples vault operator" starts underselling the footprint.

None of these are expected inside the seed-round window. The framing should hold for at least 18–24 months.
