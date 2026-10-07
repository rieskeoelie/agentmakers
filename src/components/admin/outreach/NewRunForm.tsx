'use client'
import { useCallback, useEffect, useState } from 'react'
import { Button, Callout, ErrorState, Field, Input, Page, PageHeader, Section, Select, BlockSkeleton } from '../ds'
import { useAdmin } from '../app/AdminContext'
import { EMPTY_NEW_RUN, inputFromRun, MAX_PROSPECTS_PER_RUN, MODE_COPY, validateNewRun, type NewRunInput } from '../../../lib/outreach/ui/newRun'
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

/** Full page: /admin/outreach/new (optionally prefilled from an existing run). */
export function NewRunScreen({ landingOptions, duplicateOf }: { landingOptions: LandingOption[]; duplicateOf: string | null }) {
  const a = useAdmin()
  const [initial, setInitial] = useState<NewRunInput | null>(duplicateOf ? null : EMPTY_NEW_RUN)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)

  const loadSource = useCallback(() => {
    if (!duplicateOf) return
    setLoadError(null)
    a.api.getRun(duplicateOf).then((o) => setInitial(inputFromRun(o.run as RunSummary)), (e: Error) => setLoadError(e.message))
  }, [a.api, duplicateOf])
  useEffect(() => { loadSource() }, [loadSource])

  const back = () => a.navigate({ screen: 'outreach', view: 'runs' })
  const create = async (r: { ok: true; body: Parameters<typeof a.api.createRun>[0] }) => {
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
        subtitle="Zoekt bedrijven, onderzoekt hun website, vindt de beslisser en stelt een mail op." />
      {loadError && <ErrorState message={loadError} onRetry={loadSource} />}
      {!initial && !loadError && <BlockSkeleton lines={6} />}
      {initial && <NewRunForm key={duplicateOf ?? 'new'} landingOptions={landingOptions} initial={initial} onSubmit={(r) => void create(r)} onCancel={back} busy={busy} serverError={serverError} />}
    </Page>
  )
}
