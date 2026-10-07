'use client'
import { useState } from 'react'
import type { OutreachApi } from '../../../lib/outreach/ui/api'
import { EMPTY_NEW_RUN, MAX_PROSPECTS_PER_RUN, MODE_COPY, validateNewRun, type NewRunInput } from '../../../lib/outreach/ui/newRun'
import type { RunSummary, SendingMode } from '../../../lib/outreach/ui/types'
import { Btn, C, ErrorBox, Field, input, panel } from './ui'

export interface LandingOption { label: string; url: string }

export function NewRunForm({ api, landingOptions, initial, onCreated, onCancel }: {
  api: OutreachApi; landingOptions: LandingOption[]; initial?: NewRunInput; onCreated: (run: RunSummary) => void; onCancel: () => void
}) {
  const [v, setV] = useState<NewRunInput>(initial ?? EMPTY_NEW_RUN)
  const [errors, setErrors] = useState<Partial<Record<keyof NewRunInput, string>>>({})
  const [serverError, setServerError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const set = <K extends keyof NewRunInput>(k: K, val: NewRunInput[K]) => setV((o) => ({ ...o, [k]: val }))

  const submit = async (start: boolean) => {
    const r = validateNewRun(v, start)
    if (!r.ok) { setErrors(r.errors); return }
    setErrors({})
    setServerError(null)
    setBusy(true)
    try {
      const res = await api.createRun(r.body)
      onCreated(res.run)
    } catch (e) {
      setServerError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const known = landingOptions.some((o) => o.url === v.landingUrl)
  return (
    <form data-testid="new-run-form" onSubmit={(e) => { e.preventDefault(); void submit(true) }} style={{ ...panel, maxWidth: 860 }}>
      <h3 style={{ margin: '0 0 4px', fontFamily: "'Poppins',sans-serif", fontSize: '1.05rem' }}>Nieuwe run</h3>
      <div style={{ fontSize: '.82rem', color: C.muted, marginBottom: 14 }}>
        Zoekt bedrijven, onderzoekt hun website, vindt de beslisser en stelt een mail op. <strong>Er wordt niets verzonden</strong> — verzenden bestaat nog niet.
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
        <Field label="Naam van de run" error={errors.name}><input style={input} value={v.name} onChange={(e) => set('name', e.target.value)} placeholder="Tandartsen Hoorn — okt" /></Field>
        <Field label="Niche" error={errors.niche}><input style={input} value={v.niche} onChange={(e) => set('niche', e.target.value)} placeholder="tandarts" /></Field>
        <Field label="Land" error={errors.country}><input style={input} value={v.country} onChange={(e) => set('country', e.target.value)} /></Field>
        <Field label="Stad / regio" error={errors.region} hint="Optioneel"><input style={input} value={v.region} onChange={(e) => set('region', e.target.value)} placeholder="Hoorn" /></Field>
        <Field label={`Aantal prospects (max ${MAX_PROSPECTS_PER_RUN})`} error={errors.limit} hint={`Vaste limiet van ${MAX_PROSPECTS_PER_RUN} per run in deze fase.`}>
          <input style={input} type="number" min={1} max={MAX_PROSPECTS_PER_RUN} value={v.limit} onChange={(e) => set('limit', e.target.value)} />
        </Field>
        <Field label="Budget (€)" error={errors.budget} hint="Harde grens voor API-kosten van deze run."><input style={input} inputMode="decimal" value={v.budget} onChange={(e) => set('budget', e.target.value)} /></Field>
        <Field label="Taal van de mail" error={errors.language}>
          <select style={input} value={v.language} onChange={(e) => set('language', e.target.value as 'nl' | 'en')}><option value="nl">Nederlands</option><option value="en">Engels</option></select>
        </Field>
      </div>
      <div style={{ marginTop: 12 }}>
        <Field label="AgentMakers-landingspagina / aanbod" error={errors.landingUrl} hint="Hieruit wordt het Campaign Brain gemaakt (wat we wel en niet mogen beloven).">
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {landingOptions.length > 0 && (
              <select style={{ ...input, flex: '1 1 260px' }} value={known ? v.landingUrl : ''} onChange={(e) => set('landingUrl', e.target.value)}>
                <option value="">Kies een pagina…</option>
                {landingOptions.map((o) => <option key={o.url} value={o.url}>{o.label}</option>)}
              </select>
            )}
            <input style={{ ...input, flex: '2 1 320px' }} value={v.landingUrl} onChange={(e) => set('landingUrl', e.target.value)} placeholder="https://agentmakers.io/nl/…" />
          </div>
        </Field>
      </div>
      <fieldset style={{ border: `1px solid ${C.line}`, borderRadius: 10, padding: 12, marginTop: 14 }}>
        <legend style={{ fontSize: '.8rem', fontWeight: 700, color: C.text, padding: '0 6px' }}>Modus</legend>
        {(Object.keys(MODE_COPY) as SendingMode[]).map((m) => (
          <label key={m} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: '.82rem', marginBottom: 8, cursor: 'pointer' }}>
            <input type="radio" name="mode" checked={v.mode === m} onChange={() => set('mode', m)} style={{ marginTop: 3 }} />
            <span><strong>{MODE_COPY[m].label}</strong><br /><span style={{ color: C.muted }}>{MODE_COPY[m].text}</span></span>
          </label>
        ))}
        <div data-testid="no-sending-notice" style={{ background: C.amberBg, color: C.amber, borderRadius: 8, padding: '6px 10px', fontSize: '.78rem', fontWeight: 700 }}>
          Een run verstuurt zelf niets. Verzenden gebeurt pas via de verzendwachtrij, alleen als verzenden centraal aan staat.
        </div>
      </fieldset>
      {serverError && <div style={{ marginTop: 12 }}><ErrorBox message={serverError} /></div>}
      <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
        <Btn kind="primary" type="submit" disabled={busy}>{busy ? 'Bezig…' : 'Aanmaken en starten'}</Btn>
        <Btn disabled={busy} onClick={() => void submit(false)}>Alleen aanmaken</Btn>
        <Btn kind="ghost" disabled={busy} onClick={onCancel}>Annuleren</Btn>
      </div>
    </form>
  )
}
