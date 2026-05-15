import { useState, useEffect } from 'react'
import { supabase } from '../supabase'

const emptyForm = { nombre: '', email: '', password: '', rol: 'operador' }
const ROLES = ['admin', 'operador', 'coach']

export default function Usuarios() {
  const [usuarios, setUsuarios] = useState([])
  const [coaches, setCoaches] = useState([])
  const [modal, setModal] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [editId, setEditId] = useState(null)
  const [loading, setLoading] = useState(false)
  const [toast, setToast] = useState('')

  useEffect(() => { fetchAll() }, [])

  const fetchAll = async () => {
    const { data: us } = await supabase.from('usuarios').select('*').order('nombre')
    const { data: cs } = await supabase.from('coaches').select('id, nombre').order('nombre')
    setUsuarios(us || [])
    setCoaches(cs || [])
  }

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(''), 3000) }
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const openNew = () => { setForm(emptyForm); setEditId(null); setModal(true) }
  const openEdit = (u) => {
    setForm({ nombre: u.nombre, email: '', password: '', rol: u.rol, coach_id: u.coach_id || '' })
    setEditId(u.id)
    setModal(true)
  }

  const guardar = async () => {
    if (!form.nombre.trim()) return
    setLoading(true)
    try {
      if (editId) {
        // Update rol and nombre only
        const payload = { nombre: form.nombre, rol: form.rol }
        if (form.rol === 'coach') payload.coach_id = form.coach_id || null
        else payload.coach_id = null
        await supabase.from('usuarios').update(payload).eq('id', editId)
        showToast('Usuario actualizado ✓')
      } else {
        // Crear usuario nuevo
        if (!form.email.trim() || !form.password.trim()) {
          showToast('Email y contraseña son requeridos')
          setLoading(false)
          return
        }
        // Paso 1: crear en auth con signUp
        const { data: authData, error: authError } = await supabase.auth.signUp({
          email: form.email.trim(),
          password: form.password,
          options: { data: { nombre: form.nombre.trim() } }
        })
        if (authError) {
          showToast('Error: ' + authError.message)
          setLoading(false)
          return
        }
        const userId = authData?.user?.id
        if (!userId) {
          showToast('Error al obtener ID del usuario')
          setLoading(false)
          return
        }
        // Paso 2: insertar en tabla usuarios
        const payload = {
          id: userId,
          nombre: form.nombre.trim(),
          rol: form.rol,
          coach_id: form.rol === 'coach' ? form.coach_id || null : null
        }
        const { error: dbError } = await supabase.from('usuarios').insert(payload)
        if (dbError) {
          showToast('Error al guardar usuario: ' + dbError.message)
          setLoading(false)
          return
        }
        showToast('Usuario creado ✓')
      }
      setModal(false)
      fetchAll()
    } catch (e) {
      showToast('Error: ' + e.message)
    }
    setLoading(false)
  }

  const getRolColor = (rol) => {
    if (rol === 'admin') return '#ff3b30'
    if (rol === 'operador') return 'var(--accent)'
    return 'var(--warn)'
  }

  const getRolBg = (rol) => {
    if (rol === 'admin') return 'rgba(255,59,48,.15)'
    if (rol === 'operador') return 'rgba(0,229,160,.15)'
    return 'rgba(255,165,2,.15)'
  }

  return (
    <div style={{ maxWidth: 750 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700 }}>Usuarios</h1>
          <p style={{ color: 'var(--text2)', fontSize: 14, marginTop: 4 }}>{usuarios.length} usuarios registrados</p>
        </div>
        <button className="btn btn-primary" onClick={openNew}>+ Nuevo usuario</button>
      </div>

      <div className="card" style={{ padding: 0 }}>
        <table className="table">
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Rol</th>
              <th>Coach vinculado</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {usuarios.length === 0 && (
              <tr><td colSpan={4} style={{ textAlign: 'center', color: 'var(--text2)', padding: 32 }}>Sin usuarios</td></tr>
            )}
            {usuarios.map(u => (
              <tr key={u.id}>
                <td style={{ fontWeight: 500 }}>{u.nombre}</td>
                <td>
                  <span style={{
                    background: getRolBg(u.rol), color: getRolColor(u.rol),
                    borderRadius: 6, padding: '3px 10px', fontSize: 12, fontWeight: 600, textTransform: 'capitalize'
                  }}>{u.rol}</span>
                </td>
                <td style={{ color: 'var(--text2)', fontSize: 13 }}>
                  {u.coach_id ? coaches.find(c => c.id === u.coach_id)?.nombre || '—' : '—'}
                </td>
                <td>
                  <button className="btn btn-secondary btn-sm" onClick={() => openEdit(u)}>
                    Editar
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Info box */}
      <div style={{ marginTop: 16, background: 'rgba(0,229,160,.06)', border: '1px solid rgba(0,229,160,.15)', borderRadius: 10, padding: '12px 16px', fontSize: 12, color: 'var(--text2)', lineHeight: 1.8 }}>
        <strong style={{ color: 'var(--text)' }}>Roles del sistema:</strong><br/>
        <span style={{ color: '#ff3b30', fontWeight: 600 }}>Admin</span> — acceso completo a todos los módulos<br/>
        <span style={{ color: 'var(--accent)', fontWeight: 600 }}>Operador</span> — acceso a Agenda, Clases, Jugadores y En Vivo<br/>
        <span style={{ color: 'var(--warn)', fontWeight: 600 }}>Coach</span> — acceso solo a su propia agenda y clases<br/>
        <br/>
        <strong style={{ color: 'var(--text)' }}>Para crear un nuevo usuario</strong> ve a Supabase → SQL Editor y ejecuta:<br/>
        <code style={{ background: 'var(--bg3)', borderRadius: 4, padding: '2px 6px', fontSize: 11 }}>
          SELECT crear_usuario_padel('email@ejemplo.com', 'contraseña', 'Nombre', 'operador', null);
        </code>
      </div>

      {modal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setModal(false)}>
          <div className="modal" style={{ maxWidth: 420 }}>
            <h2 className="modal-title">{editId ? 'Editar usuario' : 'Nuevo usuario'}</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div className="form-group">
                <label className="form-label">Nombre *</label>
                <input className="form-input" placeholder="Nombre completo" value={form.nombre}
                  onChange={e => set('nombre', e.target.value)} autoFocus />
              </div>
              {!editId && (
                <>
                  <div className="form-group">
                    <label className="form-label">Email *</label>
                    <input className="form-input" type="email" placeholder="correo@ejemplo.com"
                      value={form.email} onChange={e => set('email', e.target.value)} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Contraseña *</label>
                    <input className="form-input" type="password" placeholder="Mínimo 8 caracteres"
                      value={form.password} onChange={e => set('password', e.target.value)} />
                  </div>
                </>
              )}
              <div className="form-group">
                <label className="form-label">Rol *</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  {ROLES.map(r => (
                    <button key={r} type="button" onClick={() => set('rol', r)} style={{
                      flex: 1, padding: '8px', borderRadius: 8, border: 'none', cursor: 'pointer',
                      fontSize: 13, textTransform: 'capitalize', fontWeight: form.rol === r ? 700 : 400,
                      background: form.rol === r ? getRolBg(r) : 'var(--bg3)',
                      color: form.rol === r ? getRolColor(r) : 'var(--text2)',
                      outline: form.rol === r ? `1px solid ${getRolColor(r)}` : 'none'
                    }}>{r}</button>
                  ))}
                </div>
              </div>
              {form.rol === 'coach' && (
                <div className="form-group">
                  <label className="form-label">Coach vinculado</label>
                  <select className="form-input" value={form.coach_id || ''} onChange={e => set('coach_id', e.target.value)}>
                    <option value="">Seleccionar coach...</option>
                    {coaches.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                  </select>
                </div>
              )}
              {!editId && (
                <div style={{ background: 'rgba(255,165,2,.08)', border: '1px solid rgba(255,165,2,.2)', borderRadius: 8, padding: '8px 12px', fontSize: 12, color: 'var(--warn)' }}>
                  ⚠️ La creación de usuarios requiere permisos de servicio. Si falla, usa el SQL Editor de Supabase.
                </div>
              )}
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                <button className="btn btn-secondary" onClick={() => setModal(false)}>Cancelar</button>
                <button className="btn btn-primary" onClick={guardar} disabled={loading || !form.nombre.trim()}>
                  {loading ? 'Guardando...' : editId ? 'Guardar cambios' : 'Crear usuario'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {toast && <div className="toast"><span style={{ color: 'var(--accent)' }}>✓</span>{toast}</div>}
    </div>
  )
}
