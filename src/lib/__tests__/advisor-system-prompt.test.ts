/**
 * Unit tests for the AI Advisor system prompt builder (feature #50).
 *
 * The prompt is the advisor's spine — everything else (terminology
 * discipline, refusal behavior, tier-aware escalation) hangs off it. If
 * any of these rails are missing, the prompt silently fails open on
 * rendering.
 *
 * See docs/AI-ADVISOR-SPEC.md §System prompt outline and §Persona.
 */
import { describe, it, expect } from "vitest";
import { buildAdvisorSystemPrompt } from "@/lib/advisor-system-prompt";

describe("buildAdvisorSystemPrompt — member context", () => {
  it("includes the member's name verbatim", () => {
    const prompt = buildAdvisorSystemPrompt({
      memberName: "Robert Saenz",
      tierSlug: "estate",
    });
    expect(prompt).toContain("Robert Saenz");
  });

  it("includes the published tier name for each tierSlug", () => {
    const cases: Array<
      [Parameters<typeof buildAdvisorSystemPrompt>[0]["tierSlug"], string]
    > = [
      ["collector", "Collector"],
      ["reserve", "Reserve"],
      ["private_vault", "Private Vault"],
      ["estate", "Estate"],
    ];
    for (const [slug, display] of cases) {
      const prompt = buildAdvisorSystemPrompt({
        memberName: "Test Member",
        tierSlug: slug,
      });
      expect(prompt).toContain(display);
    }
  });

  it("renders portfolio summary when provided (bottle count, locker count, value, alerts)", () => {
    const prompt = buildAdvisorSystemPrompt({
      memberName: "Robert Saenz",
      tierSlug: "estate",
      portfolioSummary: {
        bottleCount: 10,
        lockerCount: 3,
        totalValueUsd: 45_320,
        activeAlerts: 1,
      },
    });
    expect(prompt).toMatch(/10/);
    expect(prompt).toMatch(/3/);
    expect(prompt).toMatch(/\$45,320/);
    // Active alerts line should still be present even with 1
    expect(prompt).toMatch(/alerts?:\s*1/i);
  });

  it("omits portfolio summary lines when not provided", () => {
    const prompt = buildAdvisorSystemPrompt({
      memberName: "Robert Saenz",
      tierSlug: "collector",
    });
    expect(prompt).not.toMatch(/Bottles in collection/i);
    expect(prompt).not.toMatch(/Active Sentinel alerts/i);
  });
});

describe("buildAdvisorSystemPrompt — escalation path branches by tier", () => {
  it("Private Vault escalates to concierge", () => {
    const prompt = buildAdvisorSystemPrompt({
      memberName: "Test",
      tierSlug: "private_vault",
    });
    expect(prompt).toContain("contact your Caveau concierge");
    expect(prompt).not.toContain("contact Caveau support");
  });

  it("Estate escalates to concierge", () => {
    const prompt = buildAdvisorSystemPrompt({
      memberName: "Test",
      tierSlug: "estate",
    });
    expect(prompt).toContain("contact your Caveau concierge");
    expect(prompt).not.toContain("contact Caveau support");
  });

  it("Collector escalates to support (not concierge)", () => {
    const prompt = buildAdvisorSystemPrompt({
      memberName: "Test",
      tierSlug: "collector",
    });
    expect(prompt).toContain("contact Caveau support");
    expect(prompt).not.toContain("contact your Caveau concierge");
  });

  it("Reserve escalates to support (not concierge)", () => {
    const prompt = buildAdvisorSystemPrompt({
      memberName: "Test",
      tierSlug: "reserve",
    });
    expect(prompt).toContain("contact Caveau support");
    expect(prompt).not.toContain("contact your Caveau concierge");
  });
});

describe("buildAdvisorSystemPrompt — terminology constraints", () => {
  const prompt = buildAdvisorSystemPrompt({
    memberName: "Test",
    tierSlug: "estate",
  });

  it("mandates CCR terminology (not 'certificate')", () => {
    expect(prompt).toContain("Caveau Custody & Condition Report");
    expect(prompt).toContain("CCR");
    // The prompt should explicitly forbid the old term
    expect(prompt).toMatch(/Never.+certificate/i);
    expect(prompt).toMatch(/provenance certificate/i);
  });

  it("mandates NFC (not QR)", () => {
    expect(prompt).toContain("NFC tags");
    expect(prompt).toMatch(/Never.+QR/i);
  });

  it("mandates vault/locker/slot (not 'cellar space')", () => {
    expect(prompt).toMatch(/vault.+locker.+slot/i);
    expect(prompt).toMatch(/cellar space/i);
    expect(prompt).toMatch(/Never.+cellar space/i);
  });

  it("lists all four public tier names", () => {
    expect(prompt).toContain("Collector");
    expect(prompt).toContain("Reserve");
    expect(prompt).toContain("Private Vault");
    expect(prompt).toContain("Estate");
  });

  it("forbids the internal DB enum values (gold / platinum / black)", () => {
    expect(prompt).toMatch(/gold/i);
    expect(prompt).toMatch(/platinum/i);
    expect(prompt).toMatch(/black/i);
    expect(prompt).toMatch(/Never.+(gold|platinum|black)/i);
  });
});

describe("buildAdvisorSystemPrompt — structural sections", () => {
  const prompt = buildAdvisorSystemPrompt({
    memberName: "Robert Saenz",
    tierSlug: "estate",
    portfolioSummary: {
      bottleCount: 10,
      lockerCount: 3,
      totalValueUsd: 45_320,
      activeAlerts: 0,
    },
  });

  it("anchors the role as Caveau AI Advisor", () => {
    expect(prompt).toMatch(/Caveau AI Advisor/);
  });

  it("names the available tools so the model can pick the right one", () => {
    expect(prompt).toContain("getMemberPortfolio");
    expect(prompt).toContain("getLivexPriceHistory");
    expect(prompt).toContain("getActiveAlerts");
    expect(prompt).toContain("getCCRList");
    expect(prompt).toContain("getTierDetails");
    expect(prompt).toContain("getWineDetail");
    expect(prompt).toContain("getLivexBenchmark");
  });

  it("states the tool policy: cite a tool result, decline rather than hallucinate", () => {
    expect(prompt).toMatch(/MUST cite/i);
    expect(prompt).toMatch(/decline/i);
  });

  it("enforces the cross-member refusal rule", () => {
    expect(prompt).toMatch(/cannot access any other member/i);
    expect(prompt).toMatch(/only speak to your portfolio/i);
  });

  it("includes format and length rules", () => {
    expect(prompt).toMatch(/4–6 sentences|4-6 sentences/);
    expect(prompt).toMatch(/Apr 16, 2026/);
  });
});
