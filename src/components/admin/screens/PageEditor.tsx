'use client'
import { useEffect, useState } from 'react'
import { BlockSkeleton, Button, Callout, EmptyState, ErrorState, Field, Input, Page, PageHeader, Section, Status, Textarea } from '../ds'
import { useAdmin } from '../app/AdminContext'
import type { LandingPage } from '../app/model'

type Content = Record<string, unknown>
const SECTIONS = [
  { id: 'hero', label: 'Hero' }, { id: 'probleem', label: 'Probleem' }, { id: 'oplossing', label: 'Oplossing' }, { id: 'usecases', label: 'Use cases' },
  { id: 'agents', label: 'Agents' }, { id: 'stappen', label: 'Stappen' }, { id: 'statistieken', label: 'Statistieken' }, { id: 'cta', label: 'Call to action' }, { id: 'calculator', label: 'Calculator' },
] as const
type SectionId = (typeof SECTIONS)[number]['id']

/** Focused landing-page editor (NL source; EN/ES are translated by the API on save). */
export function PageEditorScreen({ id }: { id: string }) {
  const a = useAdmin()
  const page = a.pages.find((p) => p.id === id) ?? null
  const [content, setContent] = useState<Content | null>(null)
  const [hero, setHero] = useState('')
  const [section, setSection] = useState<SectionId>('hero')
  const [saving, setSaving] = useState(false)
  const [imgBusy, setImgBusy] = useState(false)
  const [msg, setMsg] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null)
  const [dirty, setDirty] = useState(false)
  useEffect(() => { if (page && content === null) { setContent(page.body_content_nl || {}); setHero(page.hero_image_url || '') } }, [page, content])

  if (!page || !content) {
    return (
      <Page>
        <PageHeader breadcrumb={[{ label: a.t('pagesTitle'), onClick: () => a.navigate({ screen: 'pages' }) }]} title={a.t('pagesTitle')} />
        {a.crmLoading ? <BlockSkeleton /> : a.crmError ? <ErrorState message={a.crmError} onRetry={() => void a.refreshCrm()} /> : <EmptyState icon="file" title="Pagina niet gevonden" action={<Button onClick={() => a.navigate({ screen: 'pages' })}>{a.t('back')}</Button>} />}
      </Page>
    )
  }

  const str = (k: string) => (content[k] as string) || ''
  const arr = (k: string) => (content[k] as Content[]) || []
  const setText = (k: string, v: string) => { setContent((c) => ({ ...c, [k]: v })); setDirty(true) }
  const setItem = (k: string, i: number, f: string, v: string) => {
    setContent((c) => { const list = [...(((c ?? {})[k] as Content[]) || [])]; list[i] = { ...(list[i] || {}), [f]: v }; return { ...c, [k]: list } })
    setDirty(true)
  }
  const save = async () => {
    setSaving(true); setMsg(null)
    try {
      const res = await fetch('/api/pages', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: page.id, body_content_nl: content, hero_headline_nl: str('hero_headline') || page.hero_headline_nl, hero_subline_nl: str('hero_subline') || page.hero_subline_nl, hero_image_url: hero || page.hero_image_url }),
      })
      if (!res.ok) throw new Error('Opslaan mislukt')
      const updated = await res.json()
      a.setPages((ps) => ps.map((p) => (p.id === page.id ? { ...p, ...updated, body_content_nl: content } as LandingPage : p)))
      setDirty(false)
      setMsg({ tone: 'success', text: 'Opgeslagen en vertaald naar EN en ES.' })
    } catch (e) { setMsg({ tone: 'danger', text: (e as Error).message }) } finally { setSaving(false) }
  }
  const newImage = async () => {
    setImgBusy(true)
    try {
      const params = new URLSearchParams({ industry: page.industry, slug: page.slug, t: String(Date.now()) })
      const data = await (await fetch(`/api/admin/hero-image?${params}`)).json()
      if (data.url) { setHero(data.url); setDirty(true) }
    } finally { setImgBusy(false) }
  }

  const TextField = ({ label, k, rows = 1 }: { label: string; k: string; rows?: number }) =>
    rows > 1 ? <Field label={label}><Textarea rows={rows} value={str(k)} onChange={(e) => setText(k, e.target.value)} /></Field>
      : <Field label={label}><Input value={str(k)} onChange={(e) => setText(k, e.target.value)} /></Field>
  const Items = ({ k, label, fields }: { k: string; label: string; fields: Array<{ f: string; label: string; rows?: number }> }) => (
    <div className="am-stack" style={{ gap: 12, marginTop: 8 }}>
      {arr(k).map((_, i) => (
        <div key={i} className="am-panel am-panel-pad">
          <div className="am-section-title" style={{ fontSize: 13, marginBottom: 10 }}>{label} {i + 1}</div>
          <div className="am-stack" style={{ gap: 12 }}>
            {fields.map((fd) => (
              <Field key={fd.f} label={fd.label}>
                {fd.rows ? <Textarea rows={fd.rows} value={(arr(k)[i]?.[fd.f] as string) || ''} onChange={(e) => setItem(k, i, fd.f, e.target.value)} />
                  : <Input value={(arr(k)[i]?.[fd.f] as string) || ''} onChange={(e) => setItem(k, i, fd.f, e.target.value)} />}
              </Field>
            ))}
          </div>
        </div>
      ))}
      {arr(k).length === 0 && <p className="am-muted">Geen items in deze sectie.</p>}
    </div>
  )

  return (
    <Page>
      <PageHeader breadcrumb={[{ label: a.t('pagesTitle'), onClick: () => a.navigate({ screen: 'pages' }) }]} title={page.industry}
        status={<Status tone={page.status === 'live' ? 'success' : 'neutral'}>{page.status === 'live' ? a.t('pageLive') : a.t('pageDraft')}</Status>}
        subtitle={<>/nl/{page.slug} · wijzigingen in het Nederlands worden bij opslaan vertaald naar EN en ES.</>}
        actions={<>
          <Button icon="external" onClick={() => window.open(`/nl/${page.slug}`, '_blank')}>{a.t('viewPage')}</Button>
          <Button variant="primary" icon="check" loading={saving} disabled={!dirty} onClick={() => void save()}>Opslaan en vertalen</Button>
        </>} />
      {msg && <div style={{ marginBottom: 16 }}><Callout tone={msg.tone}>{msg.text}</Callout></div>}
      <div style={{ display: 'grid', gridTemplateColumns: '180px minmax(0, 720px)', gap: 32, alignItems: 'start' }}>
        <nav aria-label="Secties" className="am-stack" style={{ gap: 2, position: 'sticky', top: 24 }}>
          {SECTIONS.map((s) => (
            <button key={s.id} type="button" className="am-nav-item" aria-current={section === s.id ? 'page' : undefined} onClick={() => setSection(s.id)}><span className="am-nav-text">{s.label}</span></button>
          ))}
        </nav>
        <div>
          {section === 'hero' && <Section title="Hero" description="Eerste sectie bovenaan de pagina.">
            <div className="am-stack" style={{ gap: 16 }}>
              {TextField({ label: 'Headline', k: 'hero_headline', rows: 2 })}
              {TextField({ label: 'Subline', k: 'hero_subline', rows: 3 })}
              {TextField({ label: 'Badge (label boven de headline)', k: 'hero_badge' })}
              <Field label="Hero-afbeelding" help="Plak een afbeelding-URL of kies een nieuwe foto.">
                {hero && <img src={hero} alt="" style={{ width: '100%', height: 200, objectFit: 'cover', borderRadius: 'var(--am-r-lg)', border: '1px solid var(--am-border)' }} />}
                <div className="am-inline" style={{ flexWrap: 'nowrap' }}>
                  <Input value={hero} onChange={(e) => { setHero(e.target.value); setDirty(true) }} placeholder="https://…" style={{ flex: 1 }} />
                  <Button icon="refresh" loading={imgBusy} onClick={() => void newImage()}>Nieuwe foto</Button>
                </div>
              </Field>
            </div>
          </Section>}
          {section === 'probleem' && <Section title="Probleem"><div className="am-stack" style={{ gap: 16 }}>{TextField({ label: 'Headline', k: 'problem_headline', rows: 2 })}{TextField({ label: 'Tekst', k: 'problem_body', rows: 5 })}</div></Section>}
          {section === 'oplossing' && <Section title="Oplossing"><div className="am-stack" style={{ gap: 16 }}>{TextField({ label: 'Headline', k: 'solution_headline', rows: 2 })}{TextField({ label: 'Subline', k: 'solution_subline', rows: 3 })}</div></Section>}
          {section === 'usecases' && <Section title="Use cases"><div className="am-stack" style={{ gap: 16 }}>{TextField({ label: 'Label', k: 'usecases_label' })}{TextField({ label: 'Headline', k: 'usecases_headline', rows: 2 })}{TextField({ label: 'Subline', k: 'usecases_subline', rows: 2 })}</div>{Items({ k: 'usecases', label: 'Use case', fields: [{ f: 'title', label: 'Titel' }, { f: 'body', label: 'Tekst', rows: 2 }] })}</Section>}
          {section === 'agents' && <Section title="Agents"><div className="am-stack" style={{ gap: 16 }}>{TextField({ label: 'Label', k: 'agents_label' })}{TextField({ label: 'Headline', k: 'agents_headline', rows: 2 })}{TextField({ label: 'Subline', k: 'agents_subline', rows: 2 })}</div>{Items({ k: 'agents', label: 'Agent', fields: [{ f: 'title', label: 'Titel' }, { f: 'body', label: 'Tekst', rows: 2 }, { f: 'tag', label: 'Tag' }] })}</Section>}
          {section === 'stappen' && <Section title="Stappen"><div className="am-stack" style={{ gap: 16 }}>{TextField({ label: 'Titel', k: 'steps_title', rows: 2 })}{TextField({ label: 'Subtitel', k: 'steps_sub', rows: 2 })}</div>{Items({ k: 'steps', label: 'Stap', fields: [{ f: 'title', label: 'Titel' }, { f: 'body', label: 'Tekst', rows: 2 }] })}</Section>}
          {section === 'statistieken' && <Section title="Statistieken"><div className="am-stack" style={{ gap: 16 }}>{TextField({ label: 'Label', k: 'stats_label' })}{TextField({ label: 'Headline', k: 'stats_title', rows: 2 })}</div>{Items({ k: 'stats', label: 'Statistiek', fields: [{ f: 'value', label: 'Waarde' }, { f: 'label', label: 'Label', rows: 2 }] })}</Section>}
          {section === 'cta' && <Section title="Call to action">{TextField({ label: 'Headline', k: 'cta_headline', rows: 2 })}</Section>}
          {section === 'calculator' && <Section title="Calculator"><div className="am-stack" style={{ gap: 16 }}>
            {TextField({ label: 'Label slider 1 (gemiste afspraken)', k: 'calc_calls_label' })}
            {TextField({ label: 'Label slider 2 (waarde per afspraak)', k: 'calc_value_label' })}
            <div className="am-form-grid">
              <Field label="Standaard gemiste afspraken"><Input type="number" value={(content.revenue_calls as number) || 5} onChange={(e) => { setContent((c) => ({ ...c, revenue_calls: Number(e.target.value) })); setDirty(true) }} /></Field>
              <Field label="Standaard waarde per afspraak (€)"><Input type="number" value={(content.revenue_per_call as number) || 500} onChange={(e) => { setContent((c) => ({ ...c, revenue_per_call: Number(e.target.value) })); setDirty(true) }} /></Field>
            </div>
          </div></Section>}
        </div>
      </div>
    </Page>
  )
}
