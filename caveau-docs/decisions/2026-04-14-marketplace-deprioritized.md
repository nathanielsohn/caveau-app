# Decision: Deprioritize Wine Marketplace (#33)

**Date:** 2026-04-14
**Decided by:** Team consensus after investor review
**Status:** Deprioritized — revisit post-pilot

## Context

Feature #33 (Wine Marketplace — member-to-member trading) was originally planned for Phase 3. After Rob Saenz's April 2026 investor review reframed Caveau as a vault-custodian platform rather than a collection manager, the marketplace was identified as diluting the core positioning.

## Decision

Deprioritize #33. Do not build member-to-member trading before the seed round closes.

## Rationale

- **Positioning conflict:** A marketplace makes Caveau look like a consumer trading platform (CellarTracker, Vivino). The vault-custodian thesis is "we store, monitor, and help you transact when the time is right" — not "we are the transaction venue."
- **Exit facilitation is the better model:** Feature #47 (exit facilitation workflow) handles the same need through auction houses, brokers, and private sales at 10–12% commission. This reinforces the trusted intermediary positioning vs. competing with Sotheby's/Christie's.
- **Resource allocation:** Engineering time is better spent on features that strengthen the investor demo (#39-#42, #43-#49).

## Revisit Conditions

Consider re-adding post-pilot if:
- Member demand for peer-to-peer trading surfaces organically
- A white-label marketplace partner (e.g., Bordeaux Index, Cult Wines) approaches for integration
- Post-Series A when the core vault platform is established
