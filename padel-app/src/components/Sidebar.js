import { supabase } from '../supabase'

const navItems = [
  { id: 'dashboard', label: 'Resumen', icon: '📊', adminOnly: false },
  { id: 'agenda', label: 'Agenda', icon: '📅', adminOnly: false },
  { id: 'clases', label: 'Clases', icon: '🎾', adminOnly: false },
  { id: 'jugadores', label: 'Jugadores', icon: '👤', adminOnly: true },
  { id: 'coaches', label: 'Coaches', icon: '🏆', adminOnly: true },
  { id: 'comisiones', label: 'Comisiones', icon: '💰', adminOnly: true },
  { id: 'precios', label: 'Precios', icon: '🏷️', adminOnly: true },
  { id: 'envivo', label: 'En Vivo', icon: '📺', adminOnly: false },
]

export default function Sidebar({ page, setPage, isAdmin, usuario }) {
  const items = navItems.filter(i => !i.adminOnly || isAdmin)

  return (
    <aside style={{
      width: 220, background: 'var(--bg2)', borderRight: '1px solid var(--border)',
      display: 'flex', flexDirection: 'column', minHeight: '100vh',
      position: 'sticky', top: 0, flexShrink: 0
    }}>
      <div style={{ padding: '20px 16px 12px', borderBottom: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 22 }}>🎾</span>
          <div>
            <div style={{ fontWeight: 700, fontSize: 15 }}>Padel Camp</div>
            <div style={{ fontSize: 11, color: 'var(--text2)' }}>{isAdmin ? 'Administrador' : 'Coach'}</div>
          </div>
        </div>
      </div>

      <nav style={{ flex: 1, padding: '12px 8px' }}>
        {items.map(item => (
          <button key={item.id} onClick={() => setPage(item.id)}
            style={{
              width: '100%', display: 'flex', alignItems: 'center', gap: 10,
              padding: '10px 12px', borderRadius: 8, border: 'none',
              background: page === item.id ? 'var(--bg3)' : 'transparent',
              color: page === item.id ? 'var(--text)' : 'var(--text2)',
              fontSize: 14, fontWeight: page === item.id ? 600 : 400,
              cursor: 'pointer', transition: 'all .15s', marginBottom: 2,
              borderLeft: page === item.id ? '2px solid var(--accent)' : '2px solid transparent'
            }}>
            <span>{item.icon}</span>
            {item.label}
          </button>
        ))}
      </nav>

      <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border)' }}>
        <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 8, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {usuario?.nombre || 'Usuario'}
        </div>
        <button className="btn btn-secondary btn-sm" style={{ width: '100%', justifyContent: 'center' }}
          onClick={() => supabase.auth.signOut()}>
          Cerrar sesión
        </button>
      </div>
    </aside>
  )
}
