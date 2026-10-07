import type { Tone } from '../ds'
import type { RunStatus } from '../../../lib/outreach/ui/types'
import type { ReplyClass, SendState } from '../../../lib/outreach/ui/sending'

/** Maps outreach states onto the single admin status palette. */
export const RUN_TONE: Record<RunStatus, Tone> = {
  CREATED: 'neutral', QUEUED: 'info', RUNNING: 'accent', PAUSED: 'warning', COMPLETED: 'success', STOPPED: 'neutral', FAILED: 'danger',
}

export const OUTCOME_TONE: Record<string, Tone> = {
  READY: 'success', NEEDS_REVIEW: 'warning', BLOCKED: 'danger', FAILED: 'danger', SKIPPED: 'neutral', CONTACT_NOT_FOUND: 'neutral',
  DECISION_MAKER_EMAIL_NOT_FOUND: 'neutral', EMAIL_NOT_ELIGIBLE: 'neutral', PENDING: 'info', IN_PROGRESS: 'info', CANCELLED: 'muted', DONE: 'neutral',
}

export const FIT_TONE: Record<string, Tone> = { GOOD_FIT: 'success', POSSIBLE_FIT: 'warning', SKIP: 'neutral' }

export const VERIFY_TONE: Record<'good' | 'warn' | 'bad' | 'none', Tone> = { good: 'success', warn: 'warning', bad: 'danger', none: 'muted' }

export const SEND_TONE: Record<SendState, Tone> = {
  QUEUED: 'info', PUSHING: 'info', ACTIVE: 'accent', COMPLETED: 'neutral', REPLIED: 'success', BOUNCED: 'danger',
  UNSUBSCRIBED: 'danger', STOPPED: 'warning', CANCELLED: 'muted', FAILED: 'danger',
}

export const CLASS_TONE: Record<ReplyClass, Tone> = {
  INTERESTED: 'success', QUESTION: 'info', NOT_NOW: 'warning', NOT_INTERESTED: 'danger', WRONG_PERSON: 'warning', OOO: 'neutral', UNSUBSCRIBE: 'danger', OTHER: 'neutral',
}

const EVENT_NAMES: Record<string, string> = {
  REPLY_CLASSIFIED: 'Reactie geclassificeerd', EMAIL_REPLY: 'Reactie ontvangen', SEND_PUSHED: 'Naar Smartlead gestuurd', SEND_QUEUED: 'In verzendwachtrij gezet',
  SEND_CANCELLED: 'Verzending geannuleerd', PROVIDER_CAMPAIGN: 'Smartlead-campagne bijgewerkt', EMAIL_SENT: 'E-mail verstuurd', EMAIL_BOUNCE: 'Bounce',
  LEAD_UNSUBSCRIBED: 'Afgemeld', MANUAL_REPLY: 'Handmatig antwoord', MANUAL_REPLY_SENT: 'Handmatig antwoord verstuurd', LEAD_PROMOTED: 'Naar CRM',
  PROMOTED: 'Naar CRM', SUPPRESSED: 'Uitgesloten', INBOX_STATE: 'Inboxstatus gewijzigd', DISPOSITION: 'Uitkomst gekozen',
}

/** Readable name for an event type: known names in Dutch, otherwise a de-shouted version of the code. */
export function eventLabel(type: string): string {
  if (EVENT_NAMES[type]) return EVENT_NAMES[type]!
  const s = type.replace(/_/g, ' ').toLowerCase()
  return s.charAt(0).toUpperCase() + s.slice(1)
}

export const EVENT_TONE = (type: string): 'success' | 'warning' | 'danger' | 'accent' | undefined => {
  if (/FAILED|REFUSED|BOUNCE|BLOCKED|UNSUBSCRIBE/.test(type)) return 'danger'
  if (/RETRY|PAUSE|LEASE_EXPIRED|STOPPED/.test(type)) return 'warning'
  if (/DONE|APPROVED|PUSHED|SENT|PROMOTED|REPLY/.test(type)) return 'success'
  if (/CREATED|STATUS|QUEUED/.test(type)) return 'accent'
  return undefined
}
