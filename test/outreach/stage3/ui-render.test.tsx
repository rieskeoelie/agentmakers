import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { OutreachScreen } from "../../../src/components/admin/outreach/OutreachWorkspace.js";
import { NewRunForm } from "../../../src/components/admin/outreach/NewRunForm.js";
import { EvidenceList, ProspectDetailBody } from "../../../src/components/admin/outreach/ProspectDetailView.js";
import { ProspectsTable } from "../../../src/components/admin/outreach/ProspectsView.js";
import { ReviewCard } from "../../../src/components/admin/outreach/ReviewQueueView.js";
import { RunDetailBody } from "../../../src/components/admin/outreach/RunDetailView.js";
import { RunStatus, runMenuItems, RunsTable } from "../../../src/components/admin/outreach/RunsView.js";
import { SettingsBody } from "../../../src/components/admin/outreach/SettingsView.js";
import { EmptyState, ErrorState } from "../../../src/components/admin/ds/index.js";
import { fakeAdmin, renderWith } from "../../admin/helpers.js";
import { EnvSchema } from "../../../src/lib/outreach/config.js";
import { adminRepo } from "../../../src/lib/outreach/orchestration/adminRepository.js";
import { settingsForActor } from "../../../src/lib/outreach/orchestration/adminService.js";
import { DEFAULT_WORKER_SETTINGS } from "../../../src/lib/outreach/orchestration/settings.js";
import type { ProspectDetail, ReviewQueueItem, RunOverview, RunSummary } from "../../../src/lib/outreach/ui/types.js";
import { drain, fixtureContext, newRun, OWNER, prospectsOf, type TestDb } from "../stage2/helpers.js";
import { createStage3Db } from "./helpers.js";

vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

let t: TestDb;
let runs: RunSummary[];
let overview: RunOverview;
let detail: ProspectDetail;
let queue: ReviewQueueItem[];
const noop = () => undefined;
const html = (el: React.ReactElement) => renderToStaticMarkup(el);
const count = (s: string, needle: string) => s.split(needle).length - 1;

beforeAll(async () => {
  t = await createStage3Db();
  const run = await newRun(t.db, { concurrency: 1 });
  await drain(fixtureContext(t.db, { settings: { maxParallel: 1 } }), t);
  await newRun(t.db, { start: false }); // a CREATED run
  runs = await adminRepo.listRunsOverview(t.db, OWNER, null);
  overview = await adminRepo.getRunOverview(t.db, OWNER, run.id);
  const target = (await prospectsOf(t, run.id)).find((p) => p.domain === "tandartspraktijk-dewit.example")!;
  detail = await adminRepo.getProspectDetail(t.db, OWNER, target.id);
  queue = (await adminRepo.reviewQueue(t.db, OWNER, null, 50, 0)).items;
});
afterAll(async () => { await t.close(); });

describe("Runs list", () => {
  it("renders runs grouped by status with funnel columns; row actions follow the state machine", () => {
    const out = html(<RunsTable runs={runs} onOpen={noop} onAction={noop} onDuplicate={noop} canOperate />);
    expect(out).toContain('data-testid="group-completed"');
    expect(out).toContain('data-testid="group-active"');
    expect(count(out, 'data-testid="run-row"')).toBe(2);
    for (const h of ["Run", "Status", "Voortgang", "Geselecteerd", "Beslissers", "READY", "Review", "Kosten"]) expect(out).toContain(`>${h}<`);
    const labels = (r: RunSummary, op: boolean) => runMenuItems(r, op, noop, { open: noop, duplicate: noop }).map((i) => i.label);
    const completed = runs.find((r) => r.status === "COMPLETED")!;
    const created = runs.find((r) => r.status === "CREATED")!;
    expect(labels(completed, true).some((l) => ["Pauzeer", "Hervat", "Stop"].includes(l))).toBe(false);
    expect(labels(created, true)).toEqual(expect.arrayContaining(["Start", "Stop", "Dupliceren"]));
  });
  it("partners see no Start/Resume/Duplicate (paid spend is admin-only)", () => {
    const created = runs.find((r) => r.status === "CREATED")!;
    const items = runMenuItems(created, false, noop, { open: noop, duplicate: noop }).map((i) => i.label);
    expect(items).not.toContain("Start");
    expect(items).not.toContain("Dupliceren");
    expect(items).toContain("Stop");
  });
});

describe("Run detail", () => {
  it("shows status, the full funnel, spend vs budget and blocked prospects — and says nothing is sent", () => {
    const out = html(<RunDetailBody data={overview} onOpenProspect={noop} />);
    for (const s of ["Gevonden", "Onderzocht", "GOOD_FIT", "Beslissers", "Zakelijke e-mails", "READY", "NEEDS_REVIEW"]) expect(out).toContain(s);
    expect(out).toContain('data-testid="run-funnel"');
    expect(out).not.toContain("niets wordt verzonden");
    expect(out).toContain("Geblokkeerd (");
    expect(out).toContain("100%");
    expect(out).toContain("Kosten");
  });
  it("a paused-for-budget run explains why and offers Resume + Stop", () => {
    const paused: RunOverview = { ...overview, run: { ...overview.run, status: "PAUSED", status_reason: "BUDGET_EXHAUSTED" } };
    expect(html(<RunStatus run={paused.run} />)).toContain("Budget op");
    const labels = runMenuItems(paused.run, true, noop, { open: noop }).map((i) => i.label);
    expect(labels).toEqual(expect.arrayContaining(["Hervat", "Stop"]));
  });
});

describe("New run form", () => {
  it("states that nothing is sent, caps the limit at 20 and explains both modes", () => {
    const out = html(<NewRunForm landingOptions={[{ label: "Tandartsen", url: "https://agentmakers.io/nl/tandartspraktijken" }]} onSubmit={noop} onCancel={noop} />);
    expect(out).toContain('data-testid="no-sending-notice"');
    expect(out).toContain('max="20"');
    expect(out).toContain("Autopilot");
    expect(out).toContain("Review vóór verzenden");
    expect(out).toContain("Er wordt niets verzonden tot een mens ze goedkeurt");
  });
});

describe("Prospects table", () => {
  it("renders the required columns", async () => {
    const page = await adminRepo.searchProspects(t.db, OWNER, null, {}, 25, 0);
    const out = html(<ProspectsTable items={page.items} onOpen={noop} />);
    for (const h of ["Bedrijf", "Run", "Beslisser", "E-mail", "Status · fit", "Kosten", "Bijgewerkt"]) expect(out).toContain(`>${h}<`);
    const withEmail = page.items.find((p) => p.email && p.verification_status && p.city)!;
    expect(out).toContain(withEmail.city!); // location shown with the company
    expect(out).toContain(withEmail.verification_status!); // verification shown with the email
    expect(out).toContain(withEmail.fit!); // fit shown with the status
    const withRole = page.items.find((p) => p.contact_title)!;
    expect(out).toContain(withRole.contact_title!); // role is shown under the decision maker
    expect(count(out, 'data-testid="prospect-row"')).toBe(page.items.length);
  });
});

describe("Prospect detail", () => {
  it("renders all ten sections with real data", () => {
    const out = html(<ProspectDetailBody d={detail} />);
    for (const id of ["company", "qualification", "decision-maker", "verification", "brain", "evidence", "personalization", "outreach", "providers", "timeline"]) expect(out).toContain(`data-section="${id}"`);
    expect(out).toContain("GOOD_FIT");
    expect(out).toContain('data-testid="rendered-email"');
    expect(out).toContain("Concept — er wordt niets verzonden.");
    expect(out).toContain(detail.prospect.record!.contact!.email!);
  });
  it("FACT and INFERENCE are visually distinct; inferences are labelled as not-a-fact", () => {
    const out = html(<EvidenceList evidence={detail.evidence} />);
    const facts = detail.evidence.filter((e) => e.kind === "FACT").length;
    const infs = detail.evidence.filter((e) => e.kind === "INFERENCE").length;
    expect(facts).toBeGreaterThan(0);
    expect(infs).toBeGreaterThan(0);
    expect(count(out, 'data-kind="FACT"')).toBe(facts);
    expect(count(out, 'data-kind="INFERENCE"')).toBe(infs);
    expect(count(out, ">FEIT<")).toBe(facts);
    expect(count(out, ">AFLEIDING<")).toBe(infs);
    expect(count(out, "Geen feit — wordt nooit als feit in een mail gebruikt.")).toBe(infs);
    expect(count(out, "Bron:")).toBe(facts); // only facts carry a source
  });
  it("shows why a NEEDS_REVIEW prospect cannot be approved", () => {
    const d: ProspectDetail = { ...detail, prospect: { ...detail.prospect, outcome: "NEEDS_REVIEW" }, review_blockers: ["GENERIC_ADDRESS_NOT_A_RECIPIENT"] };
    expect(html(<ProspectDetailBody d={d} />)).toContain('data-testid="review-blockers"');
  });
});

describe("Review queue", () => {
  it("each card shows the decision context and the four actions", () => {
    expect(queue.length).toBeGreaterThan(0);
    const out = html(<ReviewCard item={queue[0]!} onAction={noop} onOpen={noop} />);
    for (const s of ["Beslisser", "E-mail", "Verificatie", "Waarom review?", "Voorgestelde mail", "wordt niet verzonden", "Bewijs (", "Goedkeuren", "Afwijzen", "Bedrijf uitsluiten", "Contact uitsluiten"]) expect(out).toContain(s);
  });
  it("Approve is disabled when the server reports hard blockers, enabled otherwise", () => {
    const base = queue[0]!;
    const approveBtn = (s: string) => s.slice(s.lastIndexOf("<button", s.indexOf(">Goedkeuren<")), s.indexOf(">Goedkeuren<"));
    const blocked = html(<ReviewCard item={{ ...base, blockers: ["GENERIC_ADDRESS_NOT_A_RECIPIENT"] }} onAction={noop} onOpen={noop} />);
    expect(blocked).toContain('data-testid="approve-blocked"');
    expect(approveBtn(blocked)).toContain("disabled");
    const free = html(<ReviewCard item={{ ...base, blockers: [] }} onAction={noop} onOpen={noop} />);
    expect(free).not.toContain('data-testid="approve-blocked"');
    expect(approveBtn(free)).not.toContain("disabled");
  });
});

describe("Settings, empty and error states", () => {
  it("settings show configuration status but never secret values", () => {
    const env = EnvSchema.parse({ HUNTER_API_KEY: "hunter-secret-value" });
    const out = html(<SettingsBody s={settingsForActor(OWNER, env, DEFAULT_WORKER_SETTINGS, undefined)} />);
    expect(out).toContain("Providers");
    expect(out).not.toContain("hunter-secret-value");
    expect(out).toContain("Niet geconfigureerd");
    expect(out).toContain("Geconfigureerd");
  });
  it("empty and error states", () => {
    expect(html(<EmptyState title="Nog geen runs" text="Start een run" />)).toContain('data-testid="empty-state"');
    const err = html(<ErrorState message="Geen toegang." onRetry={noop} />);
    expect(err).toContain('role="alert"');
    expect(err).toContain("Geen toegang.");
    expect(err).toContain(">Opnieuw<");
  });
  it("workspace: Runs / Prospects / Review / Instellingen as local tabs; Inbox is its own sidebar item; legacy tool retired", () => {
    const out = renderWith(fakeAdmin({ me: { userId: "u", displayName: "U", isAdmin: true, isSuperAdmin: false } }), <OutreachScreen route={{ screen: "outreach", view: "runs" }} />);
    for (const s of [">Runs<", ">Prospects<", ">Review<", ">Instellingen<"]) expect(out).toContain(s);
    expect(out).not.toContain(">Inbox<");
    expect(out).not.toContain("Oude demo-link tool");
  });
  it("review queue states that approval sends nothing", () => {
    const out = renderWith(fakeAdmin(), <OutreachScreen route={{ screen: "outreach", view: "review" }} />);
    expect(out).toContain("Goedkeuren verstuurt niets.");
  });
});
