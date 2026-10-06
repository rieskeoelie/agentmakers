import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import OutreachWorkspace from "../../../src/components/admin/outreach/OutreachWorkspace.js";
import { NewRunForm } from "../../../src/components/admin/outreach/NewRunForm.js";
import { EvidenceList, ProspectDetailBody } from "../../../src/components/admin/outreach/ProspectDetailView.js";
import { ProspectsTable } from "../../../src/components/admin/outreach/ProspectsView.js";
import { ReviewCard } from "../../../src/components/admin/outreach/ReviewQueueView.js";
import { RunDetailBody } from "../../../src/components/admin/outreach/RunDetailView.js";
import { RunsTable } from "../../../src/components/admin/outreach/RunsView.js";
import { SettingsBody } from "../../../src/components/admin/outreach/SettingsView.js";
import { EmptyState, ErrorBox } from "../../../src/components/admin/outreach/ui.js";
import { EnvSchema } from "../../../src/lib/outreach/config.js";
import { adminRepo } from "../../../src/lib/outreach/orchestration/adminRepository.js";
import { settingsForActor } from "../../../src/lib/outreach/orchestration/adminService.js";
import { DEFAULT_WORKER_SETTINGS } from "../../../src/lib/outreach/orchestration/settings.js";
import { outreachApi } from "../../../src/lib/outreach/ui/api.js";
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
const api = outreachApi(null, (async () => new Response("{}")) as typeof fetch);
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
  it("renders runs grouped by status with funnel columns and only valid actions", () => {
    const out = html(<RunsTable runs={runs} onOpen={noop} onAction={noop} onDuplicate={noop} canOperate />);
    expect(out).toContain('data-testid="run-group-completed"');
    expect(out).toContain('data-testid="run-group-active"');
    expect(count(out, 'data-testid="run-row"')).toBe(2);
    for (const h of ["Gevonden", "Onderzocht", "GOOD_FIT", "Beslissers", "E-mails", "READY", "Review", "Kosten"]) expect(out).toContain(`>${h}<`);
    const completed = out.slice(out.indexOf('run-group-completed'));
    expect(completed).not.toMatch(/>Pauzeer<|>Hervat<|>Stop</);
    const active = out.slice(out.indexOf('run-group-active'), out.indexOf('run-group-completed'));
    expect(active).toContain(">Start<");
    expect(active).toContain(">Stop<");
    expect(out).toContain(">Dupliceer<");
  });
  it("partners see no Start/Resume/Duplicate (paid spend is admin-only)", () => {
    const out = html(<RunsTable runs={runs} onOpen={noop} onAction={noop} onDuplicate={noop} canOperate={false} />);
    expect(out).not.toContain(">Start<");
    expect(out).not.toContain(">Dupliceer<");
    expect(out).toContain(">Stop<");
  });
});

describe("Run detail", () => {
  it("shows status, the full funnel, spend vs budget and blocked prospects — and says nothing is sent", () => {
    const out = html(<RunDetailBody data={overview} onAction={noop} onOpenProspect={noop} canOperate />);
    for (const s of ["Gevonden", "Onderzocht", "GOOD_FIT", "Beslissers", "Zakelijke e-mails", "READY", "NEEDS_REVIEW"]) expect(out).toContain(s);
    expect(out).toContain("Klaar");
    expect(out).toContain("niets wordt verzonden");
    expect(out).toContain("Geblokkeerd (");
    expect(out).toContain("100%");
    expect(out).not.toMatch(/>Pauzeer<|>Hervat</); // completed run: no actions
  });
  it("a paused-for-budget run explains why and offers Resume + Stop", () => {
    const paused: RunOverview = { ...overview, run: { ...overview.run, status: "PAUSED", status_reason: "BUDGET_EXHAUSTED" } };
    const out = html(<RunDetailBody data={paused} onAction={noop} onOpenProspect={noop} canOperate />);
    expect(out).toContain("Budget op");
    expect(out).toContain(">Hervat<");
    expect(out).toContain(">Stop<");
  });
});

describe("New run form", () => {
  it("states that nothing is sent, caps the limit at 20 and explains both modes", () => {
    const out = html(<NewRunForm api={api} landingOptions={[{ label: "Tandartsen", url: "https://agentmakers.io/nl/tandartspraktijken" }]} onCreated={noop} onCancel={noop} />);
    expect(out).toContain('data-testid="no-sending-notice"');
    expect(out).toContain('max="20"');
    expect(out).toContain("Autopilot");
    expect(out).toContain("Review vóór verzenden");
    expect(out).toContain("Er wordt NIETS verzonden");
  });
});

describe("Prospects table", () => {
  it("renders the required columns", async () => {
    const page = await adminRepo.searchProspects(t.db, OWNER, null, {}, 25, 0);
    const out = html(<ProspectsTable items={page.items} onOpen={noop} />);
    for (const h of ["Bedrijf", "Locatie", "Run", "Fit", "Beslisser", "Rol", "E-mail", "Verificatie", "Status", "Kosten", "Laatste activiteit"]) expect(out).toContain(`>${h}<`);
    expect(count(out, 'data-testid="prospect-row"')).toBe(page.items.length);
  });
});

describe("Prospect detail", () => {
  it("renders sections A–H with real data", () => {
    const out = html(<ProspectDetailBody d={detail} />);
    for (const id of ["A", "B", "C", "D", "E", "F", "G", "H"]) expect(out).toContain(`data-section="${id}"`);
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
    for (const s of ["Beslisser", "E-mail", "Verificatie", "Waarom review?", "VOORGESTELDE MAIL", "Bewijs (", "Goedkeuren", "Afwijzen", "Bedrijf uitsluiten", "Contact uitsluiten"]) expect(out).toContain(s);
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
    expect(out).toContain("Uitgeschakeld");
    expect(out).not.toContain("hunter-secret-value");
    expect(out).toContain("ontbreekt");
  });
  it("empty and error states", () => {
    expect(html(<EmptyState title="Nog geen runs" text="Start een run" />)).toContain('data-testid="empty-state"');
    const err = html(<ErrorBox message="Geen toegang." onRetry={noop} />);
    expect(err).toContain('role="alert"');
    expect(err).toContain("Geen toegang.");
    expect(err).toContain(">Opnieuw<");
  });
  it("workspace: Runs / Prospects / Review / Settings — no Inbox; sending clearly disabled", () => {
    const out = html(<OutreachWorkspace currentUser={{ userId: "u", isAdmin: true, isSuperAdmin: false }} viewAsUser={null} landingOptions={[]} onOpenLegacy={noop} />);
    for (const s of [">Runs<", ">Prospects<", ">Review<", ">Instellingen<", "Verzenden uitgeschakeld", "Oude demo-link tool"]) expect(out).toContain(s);
    expect(out).not.toMatch(/Inbox/i);
  });
});
