import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { buildActivity, completionSummary, dayLabel } from "../../src/components/admin/outreach/activity.js";
import { RunActivity } from "../../src/components/admin/outreach/RunActivity.js";
import { completedFunnel, completedRun, failedRun, sendingRun } from "./activity-fixtures.js";

const RAW = /CONTACT_NOT_FOUND|DECISION_MAKER|SKIPPED|RUNNING|COMPLETED|QUEUED|PROSPECT_DONE|RUN_STATUS|SETUP_DONE|KILL_SWITCH|PROVIDER_CAMPAIGN/;

describe("run activity", () => {
  it("humanizes, hides noise and groups repeated outcomes (real production sequence)", () => {
    const rows = buildActivity(completedRun, completedFunnel);
    expect(rows.map((r) => r.text)).toEqual([
      "Run afgerond",
      "5 prospects zonder contactpersoon",
      "Prospect overgeslagen", // no outcome reasons passed → no reason is claimed
      "Beslisser gevonden, maar geen zakelijk e-mailadres",
      "3 prospects overgeslagen",
      "10 bedrijven geselecteerd uit 80",
      "Run gestart",
      "Run aangemaakt",
    ]);
    for (const r of rows) expect(r.text).not.toMatch(RAW);
    expect(rows[0]!.sub).toBe("10 prospects verwerkt · 0 READY");
    const withOutcomes = buildActivity(completedRun, completedFunnel, { CONTACT_NOT_FOUND: 5, DECISION_MAKER_EMAIL_NOT_FOUND: 1, SKIPPED: 4 });
    expect(withOutcomes[0]!.sub).toBe("10 prospects verwerkt · 0 READY · 5 zonder contactpersoon · 1 zonder zakelijk e-mailadres · 4 overgeslagen");
    expect(rows[1]!.events).toHaveLength(5); // technical detail keeps every source event
  });
  it("semantic tones: not-found is amber, skipped neutral, completion and selection positive, failures red", () => {
    const rows = buildActivity(completedRun, completedFunnel);
    const tone = (t: string) => rows.find((r) => r.text === t)!.tone;
    expect(tone("5 prospects zonder contactpersoon")).toBe("warning");
    expect(tone("Beslisser gevonden, maar geen zakelijk e-mailadres")).toBe("warning");
    expect(tone("3 prospects overgeslagen")).toBe("neutral");
    expect(tone("Run afgerond")).toBe("success");
    expect(tone("Run gestart")).toBe("neutral");
    const failed = buildActivity(failedRun);
    expect(failed.map((r) => [r.text, r.tone])).toEqual([
      ["Run mislukt", "danger"], ["Bedrijven zoeken mislukt", "danger"], ["Bedrijven zoeken 2× opnieuw ingepland", "warning"],
      ["Run gestart", "neutral"], ["Run aangemaakt", "neutral"],
    ]);
  });
  it("run-level events are emphasised, prospect events are details", () => {
    const rows = buildActivity(completedRun, completedFunnel);
    expect(rows.filter((r) => r.level === "run").map((r) => r.text)).toEqual(["Run afgerond", "10 bedrijven geselecteerd uit 80", "Run gestart", "Run aangemaakt"]);
  });
  it("sending events read as plain language", () => {
    const rows = buildActivity(sendingRun).map((r) => r.text);
    expect(rows).toContain("Reactie herkend als vraag");
    expect(rows).toContain("Handmatig antwoord verstuurd");
    expect(rows).toContain("Toegevoegd aan CRM");
    expect(rows).toContain("Smartlead-campagne gepauzeerd · 2×");
    expect(rows).not.toContain("MANUAL_REPLY_STARTED");
    for (const t of rows) expect(t).not.toMatch(RAW);
  });
  it("day labels and summary", () => {
    const now = new Date("2026-10-07T12:00:00+02:00");
    expect(dayLabel("2026-10-07T08:00:00+02:00", now)).toBe("Vandaag");
    expect(dayLabel("2026-10-06T23:58:00+02:00", now)).toBe("Gisteren");
    expect(dayLabel("2026-10-05T10:00:00+02:00", now)).toBe("5 oktober");
    expect(completionSummary({ ...completedFunnel, ready: 2, needs_review: 1 })).toBe("10 prospects verwerkt · 2 READY · 1 review");
  });
  it("renders compact rows, a day separator for older days, and a show-all control only for long histories", () => {
    const now = new Date("2026-10-07T12:00:00+02:00");
    const short = renderToStaticMarkup(<RunActivity events={failedRun} now={now} />);
    expect(short).toContain(">Gisteren<");
    expect(short).not.toContain("Alle activiteit tonen");
    expect(short).not.toMatch(/>[^<]*(SETUP_FAILED|RUN_STATUS)[^<]*</); // codes only appear in the expandable detail
    const long = renderToStaticMarkup(<RunActivity events={[...sendingRun, ...completedRun]} funnel={completedFunnel} now={now} />);
    expect(long).toContain("Alle activiteit tonen");
    expect(long.split('data-testid="activity-row"').length - 1).toBe(10);
  });
});
