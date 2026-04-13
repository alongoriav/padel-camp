import { useState, useEffect } from 'react'
import { supabase } from '../supabase'

export default function Jugadores() {
  const [jugadores, setJugadores] = useState([])
  const [modal, setModal] = useState(false)
  const [nombre, setNombre] = useState('')
  const [editId, setEditId] = useState(null)
  const [search, setSearch] = useState('')
  const [toast, setToast] = useState('')

  useEffect(() => { fetchJugadores() }, [])

  const fetchJugadores = async () => {
    const { data } = await supabase.from('jugadores').select('*').order('nombre')
    setJugadores(data || [])
  }

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(''), 3000) }

  const openNew = () => { setNombre(''); setEditId(null); setModal(true) }
  const openEdit = (j) => { setNombre(j.nombre); setEditId(j.id); setModal(true) }

  const save = async () => {
    if (editId) {
      await supabase.from('jugadores').update({ nombre }).eq('id', editId)
      showToast('Jugador actualizado ✓')
    } else {
      await supabase.from('jugadores').insert({ nombre })
      showToast('Jugador agregado ✓')
    }
    setModal(false); fetchJugadores()
  }

  const toggle = async (j) => {
    await supabase.from('jugadores').update({ activo: !j.activo }).eq('id', j.id)
    fetchJugadores()
  }

  const filtered = jugadores.filter(j => j.nombre.toLowerCase().includes(search.toLowerCase()))

  return (
    <div style={{ maxWidth: 700 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700 }}>Jugadores</h1>
          <p style={{ color: 'var(--text2)', fontSize: 14, marginTop: 4 }}>{jugadores.filter(j => j.activo).length} activos</p>
        </div>
        <button className="btn btn-primary" onClick={openNew}>+ Agregar jugador</button>
      </div>

      <input className="form-input" placeholder="Buscar jugador..." value={search}
        onChange={e => setSearch(e.target.value)} style={{ marginBottom: 16, maxWidth: 300 }} />

      <div className="card" style={{ padding: 0 }}>
        <table className="table">
          <thead><tr><th>Nombre</th><th>Estado</th><th></th></tr></thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan={3} style={{ textAlign: 'center', color: 'var(--text2)', padding: 32 }}>
                {search ? 'Sin resultados' : 'Sin jugadores aún'}
              </td></tr>
            )}
            {filtered.map(j => (
              <tr key={j.id}>
                <td style={{ fontWeight: 500 }}>{j.nombre}</td>
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
          <div className="modal" style={{ maxWidth: 400 }}>
            <h2 className="modal-title">{editId ? 'Editar jugador' : 'Nuevo jugador'}</h2>
            <div className="form-group" style={{ marginBottom: 20 }}>
              <label className="form-label">Nombre completo</label>
              <input className="form-input" value={nombre} onChange={e => setNombre(e.target.value)}
                placeholder="Nombre del jugador" autoFocus
                onKeyDown={e => e.key === 'Enter' && nombre && save()} />
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary" onClick={() => setModal(false)}>Cancelar</button>
              <button className="btn btn-primary" onClick={save} disabled={!nombre}>Guardar</button>
            </div>
          </div>
        </div>
      )}

      {toast && <div className="toast"><span style={{ color: 'var(--accent)' }}>✓</span>{toast}</div>}
    </div>
  )
}
