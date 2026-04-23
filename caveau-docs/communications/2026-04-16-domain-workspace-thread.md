# Re: Working Caveau deck — domains & Google Workspace

Email thread between Nathaniel Sohn and Robert Saenz (CC: Samuel Jalloh).
April 16, 2026.

Continuation of the `2026-04-08-working-caveau-deck-thread.md` thread — moving to a new file because the subject shifted from the deck itself to infrastructure setup (domains, shared drive, demo talk track).

---

## 1. Nathaniel Sohn — Thu, Apr 16, 2026 at 12:32 AM EDT

**From:** Nathaniel Sohn
**To:** Robert Saenz
**Cc:** Samuel Jalloh
**Subject:** Re: Working Caveau deck

Rob,

Thanks for sending over the material.

The NFC approach makes sense. The app already supports bottle-level provenance records with unique certificate hashes, so linking an NFC tag to that same record would be straightforward.

More broadly, a lot of what's described in these docs is already built and running. Sentinel monitoring, provenance certificates, locker management, member onboarding, disposition tracking. The Liv-ex valuation integration is built and ready to go live once we get an API agreement signed.

Based on your materials, I'm putting together a list of additional features and changes the app needs to fully support the vision and be able to demo the capabilities described in the investor slide deck.

Once the app is in a good place, I'll also put together a demo talk track for you and Samuel. Basically a guided walkthrough you can use to show the app to a potential investor on the spot, even if I'm not in the room. I want to make sure the demo lands the same way every time.

We should also get a shared drive set up. Google Drive, OneDrive, whatever works. Rob, I thought I remember you said you already have the domain for Caveau. If you did that through something like Google Business where the account comes with drive, we can use that. If not, I'm happy to set it up.

Nate

---

## 2. Robert Saenz — Thu, Apr 16, 2026 at 2:11 PM EDT

**From:** Robert Saenz <saenz.robertb@gmail.com>
**To:** Nathaniel Sohn
**Cc:** Samuel Jalloh
**Subject:** Re: Working Caveau deck

Nate,

On the domain and Drive question: I own three domains already.

- **caveauwine.com** (Porkbun) — this is our primary brand domain. All email and the marketing site live here.
- **caveauwines.com** (Porkbun) — owned defensively. We'll 301 redirect it to caveauwine.com so we don't fragment brand traffic.
- **caveau.ai** (GoDaddy) — owned and reserved for the platform/app side. Gives us clean separation between the consumer wine brand and the tech if we want to spin the app out later.

None of these came bundled with Drive, so I'll stand up Google Workspace on caveauwine.com this week (Business Standard — shared drives, 2TB per user). I'll provision you, Samuel, and me with accounts and set up a shared drive structure: raise materials, financials, product/app, operations, legal. Send me the email handle you want and I'll get you added.

On the demo talk track — yes, prioritize that alongside the feature gap list. Having a consistent walkthrough I can run in front of an investor without you in the room is exactly the leverage we need for the raise.

Rob

---

## Decisions captured from this thread

- **Domains:** `caveauwine.com` is the consumer/vault brand; `caveau.ai` is reserved for the platform so the app side can spin out later; `caveauwines.com` is defensive and will 301 to the primary.
- **Workspace:** Google Workspace Business Standard on caveauwine.com, provisioned this week. Shared drive structure: raise materials, financials, product/app, operations, legal.
- **Priorities for Nate:** (1) feature gap list based on investor materials, (2) demo talk track for Rob + Samuel to run solo in front of investors.
- **Pending from Nate:** email handle for Workspace provisioning.
