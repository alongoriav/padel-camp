import { useState, useEffect } from 'react'
import { supabase } from '../supabase'

const emptyForm = { nombre: '', telefono: '', fecha_nacimiento: '', activo: true }

export default function Jugadores() {
  const [jugadores, setJugadores] = useState([])
  const [modal, setModal] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [editId, setEditId] = useState(null)
  const [search, setSearch] = useState('')
  const [toast, setToast] = useState('')

  useEffect(() => { fetchJugadores() }, [])

  const fetchJugadores = async () => {
    const { data } = await supabase.from('jugadores').select('*').order('nombre')
    setJugadores(data || [])
  }

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(''), 3000) }
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const openNew = () => { setForm(emptyForm); setEditId(null); setModal(true) }
  const openEdit = (j) => {
    setForm({ nombre: j.nombre, telefono: j.telefono || '', fecha_nacimiento: j.fecha_nacimiento || '', activo: j.activo ?? true })
    setEditId(j.id); setModal(true)
  }

  const save = async () => {
    if (!form.nombre.trim()) return
    const payload = {
      nombre: form.nombre.trim(),
      telefono: form.telefono.trim() || null,
      fecha_nacimiento: form.fecha_nacimiento || null,
      activo: form.activo,
    }
    if (editId) {
      await supabase.from('jugadores').update(payload).eq('id', editId)
      showToast('Jugador actualizado ✓')
    } else {
      await supabase.from('jugadores').insert(payload)
      showToast('Jugador agregado ✓')
    }
    setModal(false); fetchJugadores()
  }

  const toggle = async (j) => {
    await supabase.from('jugadores').update({ activo: !j.activo }).eq('id', j.id)
    fetchJugadores()
  }

  const calcEdad = (fecha) => {
    if (!fecha) return null
    const hoy = new Date()
    const nac = new Date(fecha)
    let edad = hoy.getFullYear() - nac.getFullYear()
    const m = hoy.getMonth() - nac.getMonth()
    if (m < 0 || (m === 0 && hoy.getDate() < nac.getDate())) edad--
    return edad
  }

  const filtered = jugadores.filter(j => j.nombre.toLowerCase().includes(search.toLowerCase()))

  return (
    <div style={{ maxWidth: 800 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700 }}>Jugadores</h1>
          <p style={{ color: 'var(--text2)', fontSize: 14, marginTop: 4 }}>{jugadores.filter(j => j.activo).length} activos · {jugadores.length} total</p>
        </div>
        <button className="btn btn-primary" onClick={openNew}>+ Agregar jugador</button>
      </div>

      <input className="form-input" placeholder="Buscar jugador..." value={search}
        onChange={e => setSearch(e.target.value)} style={{ marginBottom: 16, maxWidth: 300 }} />

      <div className="card" style={{ padding: 0 }}>
        <table className="table">
          <thead><tr><th>Nombre</th><th>Teléfono</th><th>Edad</th><th>Estado</th><th></th></tr></thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--text2)', padding: 32 }}>
                {search ? 'Sin resultados' : 'Sin jugadores aún'}
              </td></tr>
            )}
            {filtered.map(j => (
              <tr key={j.id}>
                <td style={{ fontWeight: 500 }}>{j.nombre}</td>
                <td style={{ fontSize: 13, color: 'var(--text2)' }}>{j.telefono || '—'}</td>
                <td style={{ fontSize: 13, color: 'var(--text2)' }}>{j.fecha_nacimiento ? `${calcEdad(j.fecha_nacimiento)} años` : '—'}</td>
                <td><span className={`badge ${j.activo ? 'badge-green' : 'badge-gray'}`}>{j.activo ? 'Activo' : 'Inactivo'}</span></td>
                <td>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button className="btn btn-secondary btn-sm" onClick={() => openEdit(j)}>Editar</button>
                    <button className="btn btn-secondary btn-sm" onClick={() => toggle(j)}>{j.activo ? 'Desactivar' : 'Activar'}</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setModal(false)}>
          <div className="modal" style={{ maxWidth: 440 }}>
            <h2 className="modal-title">{editId ? 'Editar jugador' : 'Nuevo jugador'}</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div className="form-group">
                <label className="form-label">Nombre completo *</label>
                <input className="form-input" placeholder="Ej: Juan Pérez" value={form.nombre}
                  onChange={e => set('nombre', e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && save()} autoFocus />
              </div>
              <div className="form-group">
                <label className="form-label">Teléfono</label>
                <input className="form-input" placeholder="Ej: 8112345678" value={form.telefono}
                  onChange={e => set('telefono', e.target.value)} type="tel" />
              </div>
              <div className="form-group">
                <label className="form-label">Fecha de nacimiento</label>
                <input className="form-input" type="date" value={form.fecha_nacimiento}
                  onChange={e => set('fecha_nacimiento', e.target.value)} />
                {form.fecha_nacimiento && (
                  <p style={{ fontSize: 12, color: 'var(--text2)', marginTop: 4 }}>
                    {calcEdad(form.fecha_nacimiento)} años
                  </p>
                )}
              </div>
              {editId && (
                <div className="form-group">
                  <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
                    <input type="checkbox" checked={form.activo} onChange={e => set('activo', e.target.checked)} />
                    <span className="form-label" style={{ margin: 0 }}>Jugador activo</span>
                  </label>
                </div>
              )}
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                <button className="btn btn-secondary" onClick={() => setModal(false)}>Cancelar</button>
                <button className="btn btn-primary" onClick={save} disabled={!form.nombre.trim()}>
                  {editId ? 'Guardar' : 'Agregar'}
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
