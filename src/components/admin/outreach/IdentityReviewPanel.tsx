'use client'
import { Callout, ExtLink, KeyValue } from '../ds'
import { corroborationLabel, reasonLabel } from '../../../lib/outreach/ui/review'
import type { IdentityReview } from '../../../lib/outreach/ui/types'

/** Approvable identity review: who, claimed role, matching evidence, uncertainty, why it was routed to review. */
export function IdentityReviewPanel({ identity, missingAfterApproval }: { identity: IdentityReview; missingAfterApproval: string[] }) {
  const c = identity.candidate
  const nm = identity.evidence.near_match
  const evidence = nm
    ? <span>Gevonden bij “{nm.organisation}” · ondersteund door: {nm.corroboration.map(corroborationLabel).join(', ')}{nm.result_url ? <> · <ExtLink href={nm.result_url} /></> : null}</span>
    : <span>Voornaam + functie op de eigen website{identity.evidence.title_source_url ? <> · <ExtLink href={identity.evidence.title_source_url} /></> : null}{identity.evidence.surname_source ? ' · achternaam uit één Hunter-contact op het bedrijfsdomein' : ' · geen achternaam bekend'}</span>
  return (
    <div data-testid="identity-review">
      <Callout tone="warning" title="Handmatige bevestiging nodig">
        <KeyValue dense items={[
          ['Kandidaat', c.name],
          ['Functie (geclaimd)', c.title],
          ['Bewijs', evidence],
          ['Onzekerheid', nm?.uncertainty ?? reasonLabel(identity.reason)],
          ['Waarom review', reasonLabel(identity.reason)],
          ['Na bevestiging', missingAfterApproval.length ? `blijft niet-READY — ${missingAfterApproval.map(reasonLabel).join(' · ')}` : 'normale regels; READY alleen als alles klopt'],
        ]} />
      </Callout>
    </div>
  )
}

