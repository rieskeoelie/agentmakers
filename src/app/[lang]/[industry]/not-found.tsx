export default function NotFound() {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Nunito',sans-serif", textAlign: 'center', background: '#F1F5F9' }}>
      <div>
        <h1 style={{ fontFamily: "'Poppins',sans-serif", fontSize: '3rem', fontWeight: 700, color: '#0D9488', marginBottom: 16 }}>404</h1>
        <p style={{ fontSize: '1.15rem', color: '#64748B', marginBottom: 32 }}>Deze pagina bestaat niet of is nog niet live.</p>
        <a href="/" style={{ background: '#0D9488', color: '#fff', padding: '14px 32px', borderRadius: 10, textDecoration: 'none', fontWeight: 600 }}>← Terug naar home</a>
      </div>
    </div>
  )
}
