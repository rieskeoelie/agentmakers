import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, describe, expect, it } from "vitest";
import { OwnerDiscoveryPanel, OwnerRunBody } from "../../../src/components/admin/outreach/OwnerRunDetail.js";
import { OwnerRunForm, RunKindSelector } from "../../../src/components/admin/outreach/NewRunForm.js";
import { buildActivity } from "../../../src/components/admin/outreach/activity.js";
import { OwnerDiscoveryInputSchema } from "../../../src/lib/outreach/owner/config.js";
import { buildDiscoveryPlan } from "../../../src/lib/outreach/owner/plan.js";
import { discoverOwnerCompanies } from "../../../src/lib/outreach/owner/discovery.js";
import { processOwnerProspect } from "../../../src/lib/outreach/owner/pipeline.js";
import type { ProspectListItem, RunOverview } from "../../../src/lib/outreach/ui/types.js";
import { pipelineDeps, SCENARIO, stubDiscovery } from "./fakes.js";

const EMPTY = OwnerDiscoveryInputSchema.parse({ run_type: "OWNER_DISCOVERY" });
const OCT7 = new Date(2026, 9, 7, 12);
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/\s+/g, " ");

describe("new run: type selector + owner form", () => {
  it("offers both run types", () => {
    const html = renderToStaticMarkup(<RunKindSelector value="OWNER" onChange={() => undefined} />);
    expect(text(html)).toContain("Doelgroep zoeken");
    expect(text(html)).toContain("Eigenaar vinden");
    expect(html).toContain(`data-checked="true"><input type="radio" name="run-kind" checked="" value="OWNER"/>`);
  });
  it("owner form: autonomous mode, optional fields, no niche / landing page, start button", () => {
    const html = renderToStaticMarkup(<OwnerRunForm onSubmit={() => undefined} onCancel={() => undefined} now={OCT7} />);
    const t = text(html);
    expect(t).toContain("Zelf bedrijven zoeken");
    expect(t).toContain("Bedrijven opgeven");
    expect(t).toContain("Branche, plaats en bedrijfsnaam mogen leeg blijven. AgentMakers stelt dan zelf een begrensd zoekplan samen.");
    for (const label of ["Land", "Plaats / regio", "Branche", "Doelpersoon", "Aantal gewenste resultaten", "Max. budget (€)"]) expect(t).toContain(label);
    expect(t).toContain("Start eigenaarsonderzoek");
    expect(html).toContain('placeholder="Eigenaarsonderzoek — Nederland — 7 okt"');
    expect(html).toMatch(/<option value="OWNER" selected="">Eigenaar\/DGA<\/option>/);
    expect(html).toContain('value="25"');
    expect(t).not.toMatch(/Niche|landingspagina|Campaign Brain/i);
    expect(html).not.toContain("am-field-error");
  });
});

describe("owner run detail", () => {
  let data: RunOverview;
  let items: ProspectListItem[];
  beforeAll(async () => {
    const plan = buildDiscoveryPlan(EMPTY, OCT7);
    const disc = await discoverOwnerCompanies(EMPTY, plan, stubDiscovery(() => SCENARIO.companies).p);
    items = [];
    for (const [i, c] of disc.selected.entries()) {
      const rec = await processOwnerProspect(c, i + 1, EMPTY, pipelineDeps().deps);
      items.push({
        id: `p${i}`, run_id: "r1", run_name: "x", position: i + 1, company_name: c.company_name, domain: c.domain!, city: c.city, country: "NL", fit: null,
        contact_name: rec.contact?.name ?? null, contact_title: rec.contact?.title ?? null, email: rec.contact?.email ?? null, verification_status: rec.verification_status,
        eligibility: (rec.email_eligibility?.eligibility ?? null) as ProspectListItem["eligibility"], queue_state: "DONE", current_step: "DONE",
        outcome: rec.status as ProspectListItem["outcome"], outcome_reasons: rec.status_reasons, spent_eur: 0, attempts: 1, updated_at: "2026-10-07T10:00:00Z", owner: rec.owner_discovery,
      });
    }
    data = {
      run: {
        id: "r1", owner_user_id: "u", name: "Eigenaarsonderzoek — Nederland — 7 okt", status: "COMPLETED", status_reason: null, sending_mode: "REVIEW_BEFORE_SENDING",
        campaign: { ...EMPTY, niche: undefined as never, agentmakers_url: undefined as never }, prospect_limit: 25, concurrency: 3, budget_cap_eur: 5, spent_eur: 0.42, reserved_eur: 0,
        budget_available_eur: 4.58, setup_state: "DONE", setup_last_error: null, created_at: "2026-10-07T10:00:00Z", started_at: "2026-10-07T10:00:00Z", finished_at: "2026-10-07T10:05:00Z",
        discovery_summary: { run_type: "OWNER_DISCOVERY", ...disc.summary },
        funnel: { discovered: 8, selected: 6, total: 6, researched: 5, good_fit: 0, possible_fit: 0, decision_makers: 4, business_emails: 3, eligible_emails: 3, ready: 1, needs_review: 2,
          blocked: 0, skipped: 3, failed: 0, pending: 0, in_progress: 0, finished: 6, cancelled: 0,
          owner_identity_verified: 5, owner_researched: 5, owner_person_found: 4, owner_confirmed: 2, owner_business_emails: 3, owner_found_no_email: 1 },
      },
      errors: [], blocked: [], recent_events: [],
    };
  });

  it("shows the owner funnel (no GOOD_FIT), plan, registry state and the results table; no sending", () => {
    const html = renderToStaticMarkup(<OwnerRunBody data={data} prospects={items} activeIndex={null} names={{}} onOpenProspect={() => undefined} now={Date.parse("2026-10-07T10:06:00Z")} />);
    const t = text(html);
    for (const s of ["Bedrijven gevonden", "Identiteit bevestigd", "Onderzocht", "Persoon gevonden", "Eigenaar/DGA bevestigd", "Zakelijke e-mail", "READY", "Review"]) expect(t).toContain(s);
    expect(t).not.toContain("GOOD_FIT");
    expect(t).toContain("Registerbron Niet geconfigureerd");
    expect(t).toContain("Verzenden Nooit — alleen onderzoek");
    expect(t).toContain("Niets opgegeven: AgentMakers kiest eigenaar-gedreven MKB-branches in middelgrote plaatsen.");
    for (const h of ["Bedrijf", "Eigenaar", "Rol", "Identiteit", "Bewijs", "Zakelijke e-mail", "E-mailverificatie", "Status"]) expect(t).toContain(h);
    expect(t).toContain("Jan Jansen");
    expect(t).toContain("Eigenaar gevonden, geen e-mail");
    expect(t).toContain("Directeur/beslisser");
    expect(t).toContain("Bedrijf niet eenduidig");
    expect(t).toContain("Geverifieerd");
    // No raw enums in the visible text.
    expect(t).not.toMatch(/OWNER_FOUND_NO_EMAIL|COMPANY_AMBIGUOUS|NOT_CONFIGURED|DIRECTOR_NOT_OWNER|INSUFFICIENT/);
    expect(t).not.toMatch(/verzendwachtrij|Smartlead/i);
  });

  it("prospect owner panel", () => {
    const p = items.find((x) => x.domain === "schilderjansen.nl")!;
    const t = text(renderToStaticMarkup(<OwnerDiscoveryPanel od={p.owner!} email={p.email} />));
    expect(t).toContain("Jan Jansen");
    expect(t).toContain("Website van het bedrijf");
    expect(t).toContain("Register: Niet geconfigureerd");
    expect(t).toContain("jan@schilderjansen.nl");
  });

  it("activity: owner outcomes are research results, never 'klaar voor verzending'", () => {
    const ev = (id: number, outcome: string) => ({ id, prospect_id: `p${id}`, type: "PROSPECT_DONE", actor: "worker", data: { outcome }, created_at: "2026-10-07T10:01:00Z" });
    const rows = buildActivity([ev(1, "READY"), ev(2, "DECISION_MAKER_EMAIL_NOT_FOUND")], data.run.funnel, undefined, { p2: ["COMPANY_AMBIGUOUS"] }, true);
    expect(rows.map((r) => r.text)).toEqual(["Eigenaar en e-mailadres volledig geverifieerd (READY)", "Eigenaar gevonden, geen geverifieerd e-mailadres"]);
    expect(rows.map((r) => r.text).join(" ")).not.toMatch(/verzending/);
  });
});
