'use client'
import { useEffect, useState, useCallback } from 'react'

type Channel = {
  id: string
  label: string
  icon: string
  badge?: number
  color: string
  orbIcon: string
  orbBg: string
  orbShadow: string
  cardBg: string
  glowColor: string
  ringColor: string
  barColor: string
  chipBg: string
  chipBorder: string
  chipColor: string
  dotColor: string
  cardLabel: string
  phrases: string[]
  cols: string
  heads: string[]
  footerStat: string
  footerLink: string
  rows: Row[]
}

type Row = {
  av: string
  avColor: string
  name: string
  email: string
  meta: string
  meta2: string
  badge?: string
  badgeColor?: string
  badgeTextColor?: string
  btn: string
  btnActive: boolean
}

const WA_ICON = (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413z"/>
    <path d="M12 0C5.373 0 0 5.373 0 12c0 2.09.54 4.05 1.486 5.76L0 24l6.395-1.677A11.95 11.95 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.818a9.818 9.818 0 01-5.006-1.371l-.359-.214-3.8.996 1.013-3.695-.233-.375A9.818 9.818 0 1112 21.818z"/>
  </svg>
)
const IG_ICON = (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/>
  </svg>
)
const FB_ICON = (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
    <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
  </svg>
)

const CHANNELS: Channel[] = [
  {
    id: 'phone', label: 'Bellen', icon: '📞', badge: 2,
    color: '#0D9488', orbIcon: '🔊',
    orbBg: 'radial-gradient(ellipse at 35% 30%, #1A7A72 0%, #0D5A52 35%, #072E2A 100%)',
    orbShadow: '0 0 0 1px rgba(45,212,191,.3), 0 0 28px rgba(45,212,191,.28), 0 10px 28px rgba(0,0,0,.35)',
    cardBg: 'linear-gradient(160deg, #0A1F2D 0%, #0D2B3A 50%, #082018 100%)',
    glowColor: 'rgba(13,148,136,0.18)', ringColor: 'rgba(45,212,191,0.25)',
    barColor: 'linear-gradient(to top, #0D9488, #5EEAD4)',
    chipBg: 'rgba(13,148,136,0.18)', chipBorder: 'rgba(13,148,136,0.3)', chipColor: '#2DD4BF', dotColor: '#2DD4BF',
    cardLabel: 'AI Receptionist',
    phrases: ['"Donderdag om 10 uur past prima!"', '"Ik boek dat direct voor u in…"', '"Een moment, ik kijk even in de agenda…"', '"U ontvangt een bevestiging per e-mail."'],
    cols: '1fr 70px 56px 72px', heads: ['Naam & e-mail', 'Tijd', 'Duur', 'Opname'],
    footerStat: '3 afspraken ingeboekt vandaag', footerLink: 'Alle gesprekken →',
    rows: [
      { av:'MV', avColor:'#0D9488,#0891b2', name:'Mark van der Berg', email:'m.vandenberg@gmail.com', meta:'Nu', meta2:'02:14', badge:'Nu', badgeColor:'#DCFCE7', badgeTextColor:'#16A34A', btn:'▶ Live', btnActive:true },
      { av:'SJ', avColor:'#7C3AED,#a855f7', name:'Sophie Jansen', email:'s.jansen@outlook.com', meta:'09:41', meta2:'3:52', btn:'▶ Beluister', btnActive:false },
      { av:'PK', avColor:'#DB2777,#f472b6', name:'Peter de Kok', email:'pdekok@bedrijf.nl', meta:'08:17', meta2:'1:28', btn:'▶ Beluister', btnActive:false },
    ],
  },
  {
    id: 'wa', label: 'WhatsApp', icon: 'wa',
    color: '#16A34A', orbIcon: '💬',
    orbBg: 'radial-gradient(ellipse at 35% 30%, #166534 0%, #14532d 35%, #052e16 100%)',
    orbShadow: '0 0 0 1px rgba(34,197,94,.3), 0 0 28px rgba(34,197,94,.28), 0 10px 28px rgba(0,0,0,.35)',
    cardBg: 'linear-gradient(160deg, #052e16 0%, #0a3d1a 50%, #031a0c 100%)',
    glowColor: 'rgba(22,163,74,0.2)', ringColor: 'rgba(34,197,94,0.28)',
    barColor: 'linear-gradient(to top, #16A34A, #4ade80)',
    chipBg: 'rgba(22,163,74,0.2)', chipBorder: 'rgba(22,163,74,0.35)', chipColor: '#4ade80', dotColor: '#4ade80',
    cardLabel: 'WhatsApp Agent',
    phrases: ['"Hoi! Waarmee kan ik je helpen? 😊"', '"Ik stuur je de prijslijst zo door!"', '"Afspraak bevestigd voor vrijdag 14:00 ✓"', '"Klopt dat? Dan reserveer ik het voor je."'],
    cols: '1fr 72px 104px', heads: ['Naam & nummer', 'Tijd', 'Bericht'],
    footerStat: '8 chats afgehandeld vandaag', footerLink: 'Alle chats →',
    rows: [
      { av:'FL', avColor:'#16A34A,#4ade80', name:'Fatima el Lachkar', email:'+31 6 12 34 56 78', meta:'Nu', meta2:'Afspraak ingeboekt ✓', badge:'Nieuw', badgeColor:'#DCFCE7', badgeTextColor:'#16A34A', btn:'Bekijk chat', btnActive:true },
      { av:'TH', avColor:'#0D9488,#5EEAD4', name:'Thomas Huizing', email:'+31 6 87 65 43 21', meta:'11:02', meta2:'Prijs opgevraagd', btn:'Bekijk chat', btnActive:false },
      { av:'AM', avColor:'#7C3AED,#a855f7', name:'Anna Mulder', email:'+31 6 55 44 33 22', meta:'09:38', meta2:'Vraag beantwoord ✓', btn:'Bekijk chat', btnActive:false },
    ],
  },
  {
    id: 'ig', label: 'Instagram', icon: 'ig',
    color: '#DB2777', orbIcon: '📸',
    orbBg: 'radial-gradient(ellipse at 35% 30%, #831843 0%, #500724 35%, #2d0314 100%)',
    orbShadow: '0 0 0 1px rgba(236,72,153,.3), 0 0 28px rgba(236,72,153,.28), 0 10px 28px rgba(0,0,0,.35)',
    cardBg: 'linear-gradient(160deg, #2d0314 0%, #4a0522 50%, #1a0209 100%)',
    glowColor: 'rgba(219,39,119,0.2)', ringColor: 'rgba(236,72,153,0.28)',
    barColor: 'linear-gradient(to top, #DB2777, #f9a8d4)',
    chipBg: 'rgba(219,39,119,0.2)', chipBorder: 'rgba(219,39,119,0.35)', chipColor: '#f9a8d4', dotColor: '#f9a8d4',
    cardLabel: 'Instagram DM Agent',
    phrases: ['"Hé! Leuk dat je reageert op onze post 🌟"', '"Ik stuur je de link even door!"', '"Wil je een gratis consult inplannen?"', '"Super! Ik heb je aanmelding ontvangen ✓"'],
    cols: '1fr 72px 104px', heads: ['Naam & account', 'Tijd', 'Reactie op'],
    footerStat: '5 leads gekwalificeerd vandaag', footerLink: 'Alle DMs →',
    rows: [
      { av:'YB', avColor:'#DB2777,#f472b6', name:'Yasmine Bouali', email:'@yasmine.style', meta:'Nu', meta2:'Reel zomercollectie', badge:'Lead', badgeColor:'#FCE7F3', badgeTextColor:'#DB2777', btn:'Bekijk DM', btnActive:true },
      { av:'RV', avColor:'#7C3AED,#a855f7', name:'Robin Visser', email:'@robinv_official', meta:'10:15', meta2:'Post: aanbieding', btn:'Bekijk DM', btnActive:false },
      { av:'NK', avColor:'#B45309,#f59e0b', name:'Nora Kuijpers', email:'@nora.beauty', meta:'08:50', meta2:'Story: voor & na', btn:'Bekijk DM', btnActive:false },
    ],
  },
  {
    id: 'fb', label: 'Facebook', icon: 'fb',
    color: '#1D4ED8', orbIcon: '📘',
    orbBg: 'radial-gradient(ellipse at 35% 30%, #1e3a8a 0%, #1e3a8a 35%, #0f1f4d 100%)',
    orbShadow: '0 0 0 1px rgba(59,130,246,.3), 0 0 28px rgba(59,130,246,.28), 0 10px 28px rgba(0,0,0,.35)',
    cardBg: 'linear-gradient(160deg, #0f1f4d 0%, #172554 50%, #080f2a 100%)',
    glowColor: 'rgba(29,78,216,0.22)', ringColor: 'rgba(59,130,246,0.28)',
    barColor: 'linear-gradient(to top, #1D4ED8, #93c5fd)',
    chipBg: 'rgba(29,78,216,0.2)', chipBorder: 'rgba(59,130,246,0.35)', chipColor: '#93c5fd', dotColor: '#93c5fd',
    cardLabel: 'Facebook Messenger Agent',
    phrases: ['"Hallo! Hoe kan ik u vandaag helpen?"', '"Uw aanvraag is ontvangen, top!"', '"Ik stuur u de offerte binnen 5 min."', '"Fijn gesprek! Tot ziens 👋"'],
    cols: '1fr 72px 104px', heads: ['Naam & profiel', 'Tijd', 'Bericht'],
    footerStat: '6 reacties automatisch afgehandeld', footerLink: 'Alle berichten →',
    rows: [
      { av:'JB', avColor:'#1D4ED8,#60a5fa', name:'Jan van den Berg', email:'facebook.com/janvdberg', meta:'Nu', meta2:'Offerte aangevraagd', badge:'Nieuw', badgeColor:'#DBEAFE', badgeTextColor:'#1D4ED8', btn:'Bekijk chat', btnActive:true },
      { av:'KS', avColor:'#0D9488,#5EEAD4', name:'Karen Smits', email:'facebook.com/karen.sm', meta:'10:44', meta2:'Info over diensten', btn:'Bekijk chat', btnActive:false },
      { av:'DP', avColor:'#DB2777,#f9a8d4', name:'David Peters', email:'facebook.com/davidp', meta:'09:20', meta2:'Klacht ingediend', btn:'Bekijk chat', btnActive:false },
    ],
  },
  {
    id: 'sms', label: 'SMS', icon: '💬',
    color: '#B45309', orbIcon: '📱',
    orbBg: 'radial-gradient(ellipse at 35% 30%, #78350f 0%, #451a03 35%, #1c0a01 100%)',
    orbShadow: '0 0 0 1px rgba(251,146,60,.3), 0 0 28px rgba(251,146,60,.28), 0 10px 28px rgba(0,0,0,.35)',
    cardBg: 'linear-gradient(160deg, #1c0a01 0%, #2d1000 50%, #0f0500 100%)',
    glowColor: 'rgba(180,83,9,0.22)', ringColor: 'rgba(251,146,60,0.28)',
    barColor: 'linear-gradient(to top, #B45309, #fbbf24)',
    chipBg: 'rgba(180,83,9,0.2)', chipBorder: 'rgba(251,146,60,0.35)', chipColor: '#fbbf24', dotColor: '#fbbf24',
    cardLabel: 'SMS Agent',
    phrases: ['"Reminder: afspraak morgen om 10:00 ✓"', '"Uw reservering is bevestigd!"', '"Wilt u de afspraak verzetten? Reply JA."', '"Bedankt voor uw bericht, we nemen contact op."'],
    cols: '1fr 72px 104px', heads: ['Naam & nummer', 'Tijd', 'Status'],
    footerStat: '98% open rate vandaag', footerLink: 'Alle SMS →',
    rows: [
      { av:'HM', avColor:'#B45309,#fbbf24', name:'Hans Meijer', email:'+31 6 23 45 67 89', meta:'Nu', meta2:'Herinnering verstuurd', badge:'Nieuw', badgeColor:'#FEF3C7', badgeTextColor:'#B45309', btn:'Bekijk SMS', btnActive:true },
      { av:'EV', avColor:'#16A34A,#4ade80', name:'Els Vermeulen', email:'+31 6 98 76 54 32', meta:'11:30', meta2:'Bevestigd ✓', btn:'Bekijk SMS', btnActive:false },
      { av:'BK', avColor:'#1D4ED8,#93c5fd', name:'Bas Kramer', email:'+31 6 44 55 66 77', meta:'09:05', meta2:'No-show voorkomen', btn:'Bekijk SMS', btnActive:false },
    ],
  },
  {
    id: 'mail', label: 'E-mail', icon: '✉️',
    color: '#6366F1', orbIcon: '📧',
    orbBg: 'radial-gradient(ellipse at 35% 30%, #3730a3 0%, #1e1b4b 35%, #0d0b2a 100%)',
    orbShadow: '0 0 0 1px rgba(129,140,248,.3), 0 0 28px rgba(129,140,248,.28), 0 10px 28px rgba(0,0,0,.35)',
    cardBg: 'linear-gradient(160deg, #0d0b2a 0%, #1a1756 50%, #070619 100%)',
    glowColor: 'rgba(99,102,241,0.2)', ringColor: 'rgba(129,140,248,0.28)',
    barColor: 'linear-gradient(to top, #6366F1, #c7d2fe)',
    chipBg: 'rgba(99,102,241,0.2)', chipBorder: 'rgba(129,140,248,0.35)', chipColor: '#c7d2fe', dotColor: '#c7d2fe',
    cardLabel: 'E-mail Agent',
    phrases: ['"Bedankt voor uw e-mail, ik handel het af."', '"Uw offerte is zojuist verstuurd!"', '"Follow-up gepland voor over 3 dagen."', '"60% van e-mails automatisch beantwoord ✓"'],
    cols: '1fr 72px 104px', heads: ['Naam & e-mail', 'Tijd', 'Onderwerp'],
    footerStat: '60% automatisch beantwoord vandaag', footerLink: 'Alle e-mails →',
    rows: [
      { av:'MR', avColor:'#6366F1,#c7d2fe', name:'Melissa Roos', email:'m.roos@company.nl', meta:'Nu', meta2:'Offerte aanvraag', badge:'Nieuw', badgeColor:'#EEF2FF', badgeTextColor:'#6366F1', btn:'Bekijk mail', btnActive:true },
      { av:'GW', avColor:'#0D9488,#5EEAD4', name:'Gerrit Wolters', email:'g.wolters@gmail.com', meta:'10:58', meta2:'Support vraag', btn:'Bekijk mail', btnActive:false },
      { av:'LB', avColor:'#DB2777,#f9a8d4', name:'Laura Bakker', email:'l.bakker@werk.nl', meta:'08:33', meta2:'Klacht — opgelost ✓', btn:'Bekijk mail', btnActive:false },
    ],
  },
]

function TabIcon({ icon }: { icon: string }) {
  if (icon === 'wa') return <span style={{ color: 'currentColor' }}>{WA_ICON}</span>
  if (icon === 'ig') return <span style={{ color: 'currentColor' }}>{IG_ICON}</span>
  if (icon === 'fb') return <span style={{ color: 'currentColor' }}>{FB_ICON}</span>
  return <span>{icon}</span>
}

const BAR_HEIGHTS = [7, 13, 16, 10, 18, 12, 15, 8]

export function HeroDashboard() {
  const [activeId, setActiveId] = useState('phone')
  const [phraseIdx, setPhraseIdx] = useState(0)
  const [phraseVisible, setPhraseVisible] = useState(true)

  const ch = CHANNELS.find(c => c.id === activeId) ?? CHANNELS[0]

  // Reset phrase on channel change
  useEffect(() => {
    setPhraseIdx(0)
    setPhraseVisible(true)
  }, [activeId])

  // Cycle phrases
  useEffect(() => {
    const id = setInterval(() => {
      setPhraseVisible(false)
      setTimeout(() => {
        setPhraseIdx(i => (i + 1) % ch.phrases.length)
        setPhraseVisible(true)
      }, 300)
    }, 3200)
    return () => clearInterval(id)
  }, [ch.phrases.length])

  const selectChannel = useCallback((id: string) => setActiveId(id), [])

  return (
    <div style={{
      borderRadius: 22,
      boxShadow: '0 8px 40px rgba(0,0,0,0.10), 0 2px 8px rgba(0,0,0,0.06)',
      overflow: 'hidden',
      border: '1px solid #E2E8F0',
    }}>
      {/* ── DARK HEADER ── */}
      <div style={{ padding: '22px 20px 18px', position: 'relative', overflow: 'hidden', background: ch.cardBg, transition: 'background .5s' }}>
        {/* glow */}
        <div style={{ position: 'absolute', top: -40, left: '50%', transform: 'translateX(-50%)', width: 280, height: 280, borderRadius: '50%', background: `radial-gradient(circle, ${ch.glowColor} 0%, transparent 70%)`, pointerEvents: 'none' }} />

        {/* topbar */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, position: 'relative', zIndex: 1 }}>
          <span style={{ fontSize: '.68rem', fontWeight: 700, color: 'rgba(240,244,248,0.4)', letterSpacing: '.08em', textTransform: 'uppercase' }}>{ch.cardLabel}</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 5, background: ch.chipBg, border: `1px solid ${ch.chipBorder}`, borderRadius: 100, padding: '4px 10px', fontSize: '.62rem', fontWeight: 700, color: ch.chipColor, letterSpacing: '.06em', textTransform: 'uppercase', transition: 'all .4s' }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: ch.dotColor, display: 'inline-block', animation: 'hd-dot 2s ease-in-out infinite' }} />
            Live
          </span>
        </div>

        {/* orb row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, position: 'relative', zIndex: 1 }}>
          {/* orb */}
          <div style={{ position: 'relative', width: 80, height: 80, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            {[0, 1, 2].map(i => (
              <div key={i} style={{
                position: 'absolute', width: 80, height: 80, borderRadius: '50%',
                border: `1.5px solid ${ch.ringColor}`,
                opacity: 1 - i * 0.3,
                animation: `hd-ring 2.4s ease-out ${i * 0.6}s infinite`,
              }} />
            ))}
            <div style={{ position: 'absolute', width: 80, height: 80, borderRadius: '50%', background: `radial-gradient(circle, ${ch.glowColor} 0%, transparent 70%)`, filter: 'blur(12px)', animation: 'hd-glow 2.4s ease-in-out infinite' }} />
            <div style={{
              width: 60, height: 60, borderRadius: '50%',
              background: ch.orbBg, position: 'relative',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '1.2rem',
              boxShadow: `inset 0 1.5px 0 rgba(255,255,255,.22), inset 0 -1px 0 rgba(0,0,0,.4), ${ch.orbShadow}`,
              transition: 'background .4s, box-shadow .4s',
            }}>
              <div style={{ position: 'absolute', top: 5, left: '50%', transform: 'translateX(-50%)', width: 22, height: 7, background: 'radial-gradient(ellipse, rgba(255,255,255,.18) 0%, transparent 80%)', borderRadius: '50%' }} />
              {ch.orbIcon}
            </div>
          </div>

          {/* right of orb */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 2.5, height: 16, marginBottom: 10 }}>
              {BAR_HEIGHTS.map((h, i) => (
                <div key={i} style={{
                  width: 2.5, borderRadius: 3, height: h,
                  background: ch.barColor,
                  animation: `hd-bar ${0.55 + i * 0.07}s ease-in-out infinite alternate`,
                  transition: 'background .4s',
                }} />
              ))}
            </div>
            <p style={{
              color: 'rgba(240,244,248,0.65)', fontSize: '.76rem', lineHeight: 1.5,
              fontStyle: 'italic', minHeight: 34,
              opacity: phraseVisible ? 1 : 0,
              transform: phraseVisible ? 'translateY(0)' : 'translateY(3px)',
              transition: 'opacity .3s, transform .3s',
            }}>
              {ch.phrases[phraseIdx]}
            </p>
          </div>
        </div>
      </div>

      {/* ── WHITE BOTTOM ── */}
      <div style={{ background: '#fff' }}>
        {/* tabs */}
        <div style={{ display: 'flex', padding: '0 12px', borderBottom: '1px solid #F1F5F9', overflowX: 'auto' }}>
          {CHANNELS.map(c => (
            <button key={c.id} onClick={() => selectChannel(c.id)} style={{
              display: 'flex', alignItems: 'center', gap: 4,
              padding: '9px 7px 8px', border: 'none', background: 'none',
              fontSize: '.62rem', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap',
              borderBottom: `2px solid ${c.id === activeId ? c.color : 'transparent'}`,
              color: c.id === activeId ? c.color : '#94A3B8',
              marginBottom: -1, transition: 'all .2s',
            }}>
              <TabIcon icon={c.icon} />
              {c.label}
              {c.badge && <span style={{ background: '#FEE2E2', color: '#DC2626', borderRadius: 100, padding: '1px 5px', fontSize: '.52rem', fontWeight: 700 }}>{c.badge}</span>}
            </button>
          ))}
        </div>

        {/* table head */}
        <div style={{ display: 'grid', gridTemplateColumns: ch.cols, padding: '6px 14px', background: '#F8FAFC', borderBottom: '1px solid #F1F5F9' }}>
          {ch.heads.map(h => (
            <span key={h} style={{ fontSize: '.57rem', fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '.05em' }}>{h}</span>
          ))}
        </div>

        {/* rows */}
        {ch.rows.map((row, i) => (
          <div key={i} style={{
            display: 'grid', gridTemplateColumns: ch.cols,
            padding: '8px 14px', alignItems: 'center',
            borderBottom: i < ch.rows.length - 1 ? '1px solid #F8FAFC' : 'none',
            background: row.btnActive ? '#F0FDFA' : '#fff',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
              <div style={{ width: 24, height: 24, borderRadius: '50%', background: `linear-gradient(135deg, ${row.avColor})`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '.55rem', fontWeight: 700, color: '#fff', flexShrink: 0 }}>
                {row.av}
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: '.72rem', fontWeight: 600, color: '#1E293B', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {row.name}
                  {row.badge && <span style={{ display: 'inline-block', background: row.badgeColor, color: row.badgeTextColor, borderRadius: 4, padding: '1px 4px', fontSize: '.5rem', fontWeight: 700, marginLeft: 4 }}>{row.badge}</span>}
                </div>
                <div style={{ fontSize: '.6rem', color: '#94A3B8', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{row.email}</div>
              </div>
            </div>
            <span style={{ fontSize: '.65rem', color: '#64748B' }}>{row.meta}</span>
            <span style={{ fontSize: '.65rem', fontWeight: 600, color: '#334155' }}>{row.meta2}</span>
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 3,
              borderRadius: 5, padding: '3px 6px',
              fontSize: '.58rem', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap',
              background: row.btnActive ? ch.color : '#F8FAFC',
              color: row.btnActive ? '#fff' : ch.color,
              border: `1px solid ${row.btnActive ? ch.color : '#E2E8F0'}`,
            }}>{row.btn}</span>
          </div>
        ))}

        {/* footer */}
        <div style={{ padding: '8px 14px', borderTop: '1px solid #F1F5F9', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: '.65rem', color: '#64748B' }}>
            <strong style={{ color: ch.color }}>{ch.footerStat.split(' ')[0]}</strong>{' '}{ch.footerStat.split(' ').slice(1).join(' ')}
          </span>
          <a href="/ai-agents" style={{ fontSize: '.65rem', fontWeight: 600, color: ch.color, textDecoration: 'none' }}>{ch.footerLink}</a>
        </div>
      </div>

      <style>{`
        @keyframes hd-ring { 0% { transform:scale(1); opacity:1; } 100% { transform:scale(1.8); opacity:0; } }
        @keyframes hd-glow { 0%,100% { opacity:.7; } 50% { opacity:1; } }
        @keyframes hd-bar  { from { transform:scaleY(.35); } to { transform:scaleY(1.6); } }
        @keyframes hd-dot  { 0%,100% { opacity:1; transform:scale(1); } 50% { opacity:.4; transform:scale(.7); } }
      `}</style>
    </div>
  )
}
