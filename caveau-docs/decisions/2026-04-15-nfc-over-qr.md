# Decision: NFC Over QR for Bottle-Level Tracking

**Date:** 2026-04-15
**Decided by:** Robert Saenz (founder), cc'd to Samuel Jalloh (biz dev) and Nathaniel Sohn (CTO)
**Status:** Adopted — default intake procedure at launch

## Context

The vault-operator reframe ([`2026-04-14-vault-operator-reframe.md`](./2026-04-14-vault-operator-reframe.md)) made bottle-level custody the core product. That in turn raised a physical question the app had been handwaving: *how does a specific bottle in a specific locker map to a specific record?*

The obvious default is a printed QR sticker on each bottle. Cheap, universal, any phone can scan it. Every logistics system on earth uses this pattern.

Rob rejected the default in his April 15 email to Samuel and Nate (message #6, "NFC tagging — how it works at intake", in [`communications/2026-04-08-working-caveau-deck-thread.md`](../communications/2026-04-08-working-caveau-deck-thread.md)):

> *"The short version: no QR stickers. Ever. A sticker on a $10,000 bottle of Screaming Eagle risks damaging the label and signals that someone has handled and modified the bottle post-production. Auction houses notice. It's a non-starter."*

The rest of the email laid out the replacement: NFC (Near Field Communication) tags, in two presentation tiers scaled to bottle value.

## Decision

Caveau uses **NFC, not QR**, for bottle-level identification. Two tag variants are provisioned at intake based on bottle value:

- **Trophy tier — bottles $1,000+.** NFC capsule tag applied directly under or over the foil at the top of the bottle. Invisible. Does not touch the label. The bottle looks exactly as it did when it arrived.
- **Standard tier — bottles under $1,000.** Branded Caveau navy neck collar with an embedded NFC chip. Visible and intentionally so — navy, gold CAVEAU wordmark, fine gold border lines top and bottom. A signal that the bottle is under Caveau management.

Both tag variants link to the same platform record. A phone tap pulls up the bottle's full Caveau Custody & Condition record — purchase history, storage data, custody chain — with no app required on the buyer's end. Scans are identical in the Caveau App regardless of tier; the difference is purely physical presentation.

The value threshold ($1,000) is a working default — revisit once the first 500–1,000 bottles have been tagged and we have feedback from members and auction-house contacts.

## Rationale

- **Auction-house intake notices post-production label modifications.** A QR sticker — anywhere on the bottle, at any size — is a visible sign that someone has handled the bottle after bottling. At consignment, that's a credibility hit. It undercuts the exact story the CCR is supposed to tell.
- **Precedent: this is how the top of the market already works.** Chateau Le Pin and other top Bordeaux estates use NFC capsule tags for authentication. Sticking with that precedent aligns Caveau with the institutions auction houses already recognize, rather than inventing a new convention under the Caveau brand.
- **Invisibility for trophies is non-negotiable.** A $10K+ bottle's resale value is partially aesthetic. The capsule-under-foil NFC placement is the only option that preserves the bottle's untouched appearance while still giving us bottle-level tracking.
- **Visible branding at the sub-trophy level is a feature, not a compromise.** For standard cellar bottles the navy-and-gold collar *is* the product surface — a member opens their cellar and sees their collection under Caveau management. The collar also acts as passive marketing when bottles move between homes, gift recipients, or tastings.
- **Bottle-level granularity is what makes the CCR credible.** Most wine storage competitors track at the case level. We track at the bottle level from the day it enters custody. Christie's and Sotheby's want an unbroken record for every bottle, not a case summary. NFC at the bottle level is the physical foundation of the CCR's claim.
- **No buyer-side app requirement.** iOS and Android both support NFC reads natively — a tap opens a URL in the browser. That lets us surface the CCR to a prospective buyer (or a nervous auction-house staffer) without asking them to install anything.

## What We Give Up

- **Unit cost.** QR stickers are effectively free; NFC tags run ~$0.30–$1.50 per tag (capsule NFC higher), and the navy collar is an additional manufactured good. This is a per-bottle cost the business eats as a custodian expense, priced into membership tiers.
- **Universality of scanning hardware.** Every smartphone has a camera; not every smartphone has NFC enabled (older Androids, some enterprise-locked devices). In practice, all current iPhones and modern Androids handle NFC, so this affects a small long tail of buyers.
- **Print-on-demand operational simplicity.** QR stickers can be printed at the intake desk on any label printer. NFC tag + navy collar requires inventory of physical goods — receiving, counting, tracking. Staff process and supply chain both absorb complexity.
- **Fast re-tagging in the field.** A damaged or lost QR sticker is trivially reprinted. An NFC tag failure means the bottle has to be re-tagged in a controlled environment — potentially by disturbing the capsule, which is exactly the situation we're trying to avoid. The CCR's custody chain has to record any re-tag event.
- **Cross-custodian portability.** QR is a universal convention; our NFC scheme maps to the Caveau platform specifically. If a bottle leaves Caveau custody, the tag is Caveau-branded infrastructure, not an open standard.

Each of these is a real cost. None of them outweighs the auction-house-intake concern for a vault custodian whose value proposition *is* credibility at resale.

## Revisit Conditions

Reopen the choice if any of the following hold:

- **Supply unreliability.** NFC capsule or collar supply becomes inconsistent, costs spike meaningfully beyond today's range, or vendor quality control introduces failure rates that disturb the custody chain.
- **Auction-house standards shift.** Christie's / Sotheby's / Hart Davis Hart publish a bottle-tagging standard that excludes NFC, or recognize a specific competing technology, and compliance becomes the faster path to credibility.
- **Member pushback on the navy collar.** Some members may not want a branded collar on their bottles at all. If that feedback becomes common, we may need to offer an invisible-tag option for standard bottles at an uplift, or rethink the sub-$1K approach entirely.
- **Successor technology.** A provenance-tagging standard emerges (DNA ink, nano-etched capsule marking, chip-in-cork) that solves the invisibility-plus-identity problem with better properties than NFC — particularly around re-tagging and cross-custodian portability.
- **Threshold tuning.** The $1,000 trophy/standard boundary is a working default. If a meaningful share of bottles cluster just above or below, or member sentiment treats $500+ bottles as trophy-grade, adjust the threshold rather than the underlying NFC decision.

None of these are load-bearing for launch. The decision is firm for the first operational year.
