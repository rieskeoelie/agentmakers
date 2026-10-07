'use client'
import { useCallback, useEffect, useState } from 'react'
import { Button, Callout, ErrorState, Field, Input, Page, PageHeader, Section, Select, BlockSkeleton, Textarea } from '../ds'
import { useAdmin } from '../app/AdminContext'
import {
  EMPTY_NEW_RUN, EMPTY_OWNER_RUN, inputFromRun, isOwnerRun, MAX_PROSPECTS_PER_RUN, MODE_COPY, OWNER_COUNTRIES, OWNER_MAX_BUDGET_EUR, OWNER_MAX_COMPANIES_PER_RUN,
  ownerInputFromRun, validateNewRun, validateOwnerRun, type NewRunBody, type NewRunInput, type OwnerRunBody, type OwnerRunInput, type RunKind,
} from '../../../lib/outreach/ui/newRun'
import { autoOwnerRunName } from '../../../lib/outreach/owner/naming'
import type { RunSummary, SendingMode } from '../../../lib/outreach/ui/types'

export interface LandingOption { label: string; url: string }

/** Presentational form. Validation mirrors the server; the server re-validates everything. */
export function NewRunForm({ landingOptions, initial, onSubmit, onCancel, busy, serverError }: {
  landingOptions: LandingOption[]; initial?: NewRunInput; onSubmit: (body: ReturnType<typeof validateNewRun> & { ok: true }) => void
  onCancel: () => void; busy?: boolean; serverError?: string | null
}) {
  const [v, setV] = useState<NewRunInput>(initial ?? EMPTY_NEW_RUN)
  const [errors, setErrors] = useState<Partial<Record<keyof NewRunInput, string>>>({})
  const set = <K extends keyof NewRunInput>(k: K, val: NewRunInput[K]) => setV((o) => ({ ...o, [k]: val }))
  const submit = (start: boolean) => {
    const r = validateNewRun(v, start)
    if (!r.ok) { setErrors(r.errors); return }
    setErrors({})
    onSubmit(r)
  }
  const known = landingOptions.some((o) => o.url === v.landingUrl)

  return (
    <form data-testid="new-run-form" onSubmit={(e) => { e.preventDefault(); submit(true) }} style={{ maxWidth: 820 }}>
      <Section title="Doelgroep" description="Welke bedrijven de run zoekt.">
        <div className="am-panel am-panel-pad">
          <div className="am-form-grid">
            <Field label="Naam van de run" error={errors.name} htmlFor="nr-name"><Input id="nr-name" value={v.name} onChange={(e) => set('name', e.target.value)} placeholder="Tandartsen Hoorn — okt" /></Field>
            <Field label="Niche" error={errors.niche} htmlFor="nr-niche"><Input id="nr-niche" value={v.niche} onChange={(e) => set('niche', e.target.value)} placeholder="tandarts" /></Field>
            <Field label="Land" error={errors.country} htmlFor="nr-country"><Input id="nr-country" value={v.country} onChange={(e) => set('country', e.target.value)} /></Field>
            <Field label="Stad / regio" error={errors.region} help="Optioneel" htmlFor="nr-region"><Input id="nr-region" value={v.region} onChange={(e) => set('region', e.target.value)} placeholder="Hoorn" /></Field>
          </div>
        </div>
      </Section>

      <Section title="Aanbod" description="Hieruit wordt het Campaign Brain gemaakt: wat we wel en niet mogen beloven.">
        <div className="am-panel am-panel-pad am-stack" style={{ gap: 16 }}>
          <Field label="AgentMakers-landingspagina" error={errors.landingUrl} htmlFor="nr-landing">
            <div className="am-inline" style={{ flexWrap: 'wrap' }}>
              {landingOptions.length > 0 && (
                <Select aria-label="Kies een pagina" style={{ flex: '1 1 240px' }} value={known ? v.landingUrl : ''} onChange={(e) => set('landingUrl', e.target.value)}>
                  <option value="">Kies een pagina…</option>
                  {landingOptions.map((o) => <option key={o.url} value={o.url}>{o.label}</option>)}
                </Select>
              )}
              <Input id="nr-landing" style={{ flex: '2 1 300px' }} value={v.landingUrl} onChange={(e) => set('landingUrl', e.target.value)} placeholder="https://agentmakers.io/nl/…" />
            </div>
          </Field>
          <div className="am-form-grid">
            <Field label="Taal van de mail" htmlFor="nr-lang">
              <Select id="nr-lang" value={v.language} onChange={(e) => set('language', e.target.value as 'nl' | 'en')}><option value="nl">Nederlands</option><option value="en">Engels</option></Select>
            </Field>
          </div>
        </div>
      </Section>

      <Section title="Limieten" description="Harde grenzen; de server dwingt ze ook af.">
        <div className="am-panel am-panel-pad">
          <div className="am-form-grid">
            <Field label="Aantal prospects" error={errors.limit} help={`Maximaal ${MAX_PROSPECTS_PER_RUN} per run.`} htmlFor="nr-limit">
              <Input id="nr-limit" type="number" min={1} max={MAX_PROSPECTS_PER_RUN} value={v.limit} onChange={(e) => set('limit', e.target.value)} />
            </Field>
            <Field label="Budget (€)" error={errors.budget} help="Grens voor API-kosten van deze run." htmlFor="nr-budget">
              <Input id="nr-budget" inputMode="decimal" value={v.budget} onChange={(e) => set('budget', e.target.value)} />
            </Field>
          </div>
        </div>
      </Section>

      <Section title="Modus">
        <div className="am-panel am-panel-pad am-stack" style={{ gap: 12 }} role="radiogroup" aria-label="Modus">
          {(Object.keys(MODE_COPY) as SendingMode[]).map((m) => (
            <label key={m} className="am-check" style={{ alignItems: 'flex-start' }}>
              <input type="radio" name="mode" checked={v.mode === m} onChange={() => set('mode', m)} style={{ marginTop: 3 }} />
              <span><span className="am-strong">{MODE_COPY[m].label}</span><br /><span className="am-muted">{MODE_COPY[m].text}</span></span>
            </label>
          ))}
          <div data-testid="no-sending-notice">
            <Callout tone="info" icon="shield">Een run verstuurt zelf niets. Verzenden gebeurt pas via de verzendwachtrij, en alleen als verzenden centraal aan staat.</Callout>
          </div>
        </div>
      </Section>

      {serverError && <div style={{ marginBottom: 16 }}><Callout tone="danger" title="Aanmaken mislukt">{serverError}</Callout></div>}
      <div className="am-form-actions">
        <Button variant="primary" type="submit" icon="play" loading={busy}>Aanmaken en starten</Button>
        <Button disabled={busy} onClick={() => submit(false)}>Alleen aanmaken</Button>
        <Button variant="ghost" disabled={busy} onClick={onCancel}>Annuleren</Button>
      </div>
    </form>
  )
}

const RUN_KINDS: Array<{ kind: RunKind; title: string; text: string }> = [
  { kind: 'AUDIENCE', title: 'Doelgroep zoeken', text: 'Bedrijven in een niche zoeken, de beslisser vinden en een mail opstellen.' },
  { kind: 'OWNER', title: 'Eigenaar vinden', text: 'De eigenaar/DGA van bedrijven vinden en verifiëren. Alleen onderzoek — er wordt niets verzonden.' },
]

/** Run type selector ("Doelgroep zoeken" / "Eigenaar vinden"). */
export function RunKindSelector({ value, onChange, disabled }: { value: RunKind; onChange: (k: RunKind) => void; disabled?: boolean }) {
  return (
    <div className="am-choice-grid" role="radiogroup" aria-label="Soort run" data-testid="run-kind">
      {RUN_KINDS.map((k) => (
        <label key={k.kind} className="am-choice" data-checked={value === k.kind ? 'true' : undefined} data-disabled={disabled ? 'true' : undefined}>
          <input type="radio" name="run-kind" value={k.kind} checked={value === k.kind} disabled={disabled} onChange={() => onChange(k.kind)} />
          <span className="am-choice-title">{k.title}</span>
          <span className="am-choice-text">{k.text}</span>
        </label>
      ))}
    </div>
  )
}

const OWNER_MODES: Array<{ value: OwnerRunInput['discoveryMode']; title: string; text: string }> = [
  { value: 'AUTONOMOUS', title: 'Zelf bedrijven zoeken', text: 'AgentMakers zoekt geschikte bedrijven en onderzoekt wie de eigenaar is.' },
  { value: 'COMPANY_LIST', title: 'Bedrijven opgeven', text: 'Jij geeft de bedrijven (websites) op; AgentMakers zoekt per bedrijf de eigenaar.' },
]

/** Owner Discovery form. Every field may stay empty; only quantity and budget are bounded. */
export function OwnerRunForm({ initial, onSubmit, onCancel, busy, serverError, now }: {
  initial?: OwnerRunInput; onSubmit: (r: { ok: true; body: OwnerRunBody }) => void; onCancel: () => void; busy?: boolean; serverError?: string | null; now?: Date
}) {
  const [v, setV] = useState<OwnerRunInput>(initial ?? EMPTY_OWNER_RUN)
  const [errors, setErrors] = useState<Partial<Record<keyof OwnerRunInput, string>>>({})
  const set = <K extends keyof OwnerRunInput>(k: K, val: OwnerRunInput[K]) => setV((o) => ({ ...o, [k]: val }))
  const submit = (start: boolean) => {
    const r = validateOwnerRun(v, start)
    if (!r.ok) { setErrors(r.errors); return }
    setErrors({})
    onSubmit(r)
  }
  const autoName = autoOwnerRunName({ country: v.country, region: v.region.trim() || null, industry: v.industry.trim() || null }, now)
  const list = v.discoveryMode === 'COMPANY_LIST'
  return (
    <form data-testid="owner-run-form" onSubmit={(e) => { e.preventDefault(); submit(true) }} style={{ maxWidth: 820 }}>
      <Section title="Werkwijze">
        <div className="am-choice-grid" role="radiogroup" aria-label="Werkwijze" data-testid="owner-mode">
          {OWNER_MODES.map((m) => (
            <label key={m.value} className="am-choice" data-checked={v.discoveryMode === m.value ? 'true' : undefined}>
              <input type="radio" name="owner-mode" value={m.value} checked={v.discoveryMode === m.value} onChange={() => set('discoveryMode', m.value)} />
              <span className="am-choice-title">{m.title}</span>
              <span className="am-choice-text">{m.text}</span>
            </label>
          ))}
        </div>
      </Section>

      {list && (
        <Section title="Bedrijven" description="Eén bedrijf per regel: website, of naam en website gescheiden door een komma.">
          <div className="am-panel am-panel-pad">
            <Field label="Bedrijven" error={errors.companies} htmlFor="or-companies" help={`Maximaal ${OWNER_MAX_COMPANIES_PER_RUN}.`}>
              <Textarea id="or-companies" rows={6} value={v.companies} onChange={(e) => set('companies', e.target.value)} placeholder={'bakkerijdevries.nl\nAutobedrijf Jansen, autojansen.nl'} />
            </Field>
          </div>
        </Section>
      )}

      <Section title={list ? 'Instellingen' : 'Zoekgebied'} description={list ? undefined : 'Alles is optioneel.'}>
        <div className="am-panel am-panel-pad am-stack" style={{ gap: 16 }}>
          {!list && (
            <p className="am-muted" style={{ margin: 0 }} data-testid="owner-autonomy-note">
              Branche, plaats en bedrijfsnaam mogen leeg blijven. AgentMakers stelt dan zelf een begrensd zoekplan samen.
            </p>
          )}
          <div className="am-form-grid">
            <Field label="Land" htmlFor="or-country">
              <Select id="or-country" value={v.country} onChange={(e) => set('country', e.target.value)}>
                {OWNER_COUNTRIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
              </Select>
            </Field>
            {!list && <Field label="Plaats / regio" error={errors.region} help="Optioneel" htmlFor="or-region"><Input id="or-region" value={v.region} onChange={(e) => set('region', e.target.value)} placeholder="Leeg = AgentMakers kiest" /></Field>}
            {!list && <Field label="Branche" error={errors.industry} help="Optioneel" htmlFor="or-industry"><Input id="or-industry" value={v.industry} onChange={(e) => set('industry', e.target.value)} placeholder="Leeg = AgentMakers kiest" /></Field>}
            <Field label="Doelpersoon" htmlFor="or-person">
              <Select id="or-person" value={v.targetPerson} onChange={(e) => set('targetPerson', e.target.value as OwnerRunInput['targetPerson'])}>
                <option value="OWNER">Eigenaar/DGA</option>
                <option value="DECISION_MAKER">Eigenaar of directeur</option>
              </Select>
            </Field>
            {!list && (
              <Field label="Aantal gewenste resultaten" error={errors.limit} help={`Aantal bedrijven om te onderzoeken (max. ${OWNER_MAX_COMPANIES_PER_RUN}).`} htmlFor="or-limit">
                <Input id="or-limit" type="number" min={1} max={OWNER_MAX_COMPANIES_PER_RUN} value={v.limit} onChange={(e) => set('limit', e.target.value)} />
              </Field>
            )}
            <Field label="Max. budget (€)" error={errors.budget} help={`Grens voor API-kosten (max. €${OWNER_MAX_BUDGET_EUR}).`} htmlFor="or-budget">
              <Input id="or-budget" inputMode="decimal" value={v.budget} onChange={(e) => set('budget', e.target.value)} />
            </Field>
            <Field label="Naam van de run" error={errors.name} help="Optioneel" htmlFor="or-name">
              <Input id="or-name" value={v.name} onChange={(e) => set('name', e.target.value)} placeholder={autoName} />
            </Field>
          </div>
          <div data-testid="owner-no-sending-notice">
            <Callout tone="info" icon="shield">Alleen onderzoek. Er wordt geen campagne aangemaakt, niets in de verzendwachtrij gezet en niets verzonden.</Callout>
          </div>
        </div>
      </Section>

      {serverError && <div style={{ marginBottom: 16 }}><Callout tone="danger" title="Aanmaken mislukt">{serverError}</Callout></div>}
      <div className="am-form-actions">
        <Button variant="primary" type="submit" icon="play" loading={busy}>Start eigenaarsonderzoek</Button>
        <Button disabled={busy} onClick={() => submit(false)}>Alleen aanmaken</Button>
        <Button variant="ghost" disabled={busy} onClick={onCancel}>Annuleren</Button>
      </div>
    </form>
  )
}

/** Full page: /admin/outreach/new (optionally prefilled from an existing run). */
export function NewRunScreen({ landingOptions, duplicateOf }: { landingOptions: LandingOption[]; duplicateOf: string | null }) {
  const a = useAdmin()
  const [initial, setInitial] = useState<NewRunInput | null>(duplicateOf ? null : EMPTY_NEW_RUN)
  const [ownerInitial, setOwnerInitial] = useState<OwnerRunInput>(EMPTY_OWNER_RUN)
  const [kind, setKind] = useState<RunKind>('AUDIENCE')
  const [loadError, setLoadError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)

  const loadSource = useCallback(() => {
    if (!duplicateOf) return
    setLoadError(null)
    a.api.getRun(duplicateOf).then((o) => {
      const run = o.run as RunSummary
      if (isOwnerRun(run)) {
        setOwnerInitial(ownerInputFromRun(run as unknown as { name: string; campaign: Record<string, unknown>; budget_cap_eur: number }))
        setKind('OWNER')
        setInitial(EMPTY_NEW_RUN)
      } else setInitial(inputFromRun(run))
    }, (e: Error) => setLoadError(e.message))
  }, [a.api, duplicateOf])
  useEffect(() => { loadSource() }, [loadSource])

  const back = () => a.navigate({ screen: 'outreach', view: 'runs' })
  const create = async (r: { ok: true; body: NewRunBody | OwnerRunBody }) => {
    setBusy(true); setServerError(null)
    try {
      const res = await a.api.createRun(r.body)
      a.navigate({ screen: 'outreach', view: 'run', id: res.run.id })
    } catch (e) { setServerError((e as Error).message) } finally { setBusy(false) }
  }

  if (!a.canOperate) {
    return <Page><PageHeader breadcrumb={[{ label: 'Outreach', onClick: back }]} title="Nieuwe run" /><Callout tone="warning">Alleen beheerders kunnen runs aanmaken.</Callout></Page>
  }
  return (
    <Page>
      <PageHeader breadcrumb={[{ label: 'Outreach', onClick: back }, { label: 'Runs', onClick: back }]} title={duplicateOf ? 'Run dupliceren' : 'Nieuwe run'}
        subtitle={kind === 'OWNER'
          ? 'Zoekt bedrijven, bevestigt hun identiteit en vindt en verifieert de eigenaar/DGA. Verstuurt nooit.'
          : 'Zoekt bedrijven, onderzoekt hun website, vindt de beslisser en stelt een mail op.'} />
      {loadError && <ErrorState message={loadError} onRetry={loadSource} />}
      {!initial && !loadError && <BlockSkeleton lines={6} />}
      {initial && (
        <>
          <div style={{ maxWidth: 820, marginBottom: 24 }}><RunKindSelector value={kind} onChange={(k) => { setKind(k); setServerError(null) }} disabled={!!duplicateOf || busy} /></div>
          {kind === 'OWNER'
            ? <OwnerRunForm key={`owner-${duplicateOf ?? 'new'}`} initial={ownerInitial} onSubmit={(r) => void create(r)} onCancel={back} busy={busy} serverError={serverError} />
            : <NewRunForm key={duplicateOf ?? 'new'} landingOptions={landingOptions} initial={initial} onSubmit={(r) => void create(r)} onCancel={back} busy={busy} serverError={serverError} />}
        </>
      )}
    </Page>
  )
}
