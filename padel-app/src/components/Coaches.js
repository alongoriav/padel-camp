import { useState, useEffect } from 'react'
import { supabase } from '../supabase'

const ESQUEMAS = ['Bono', 'Porcentaje', 'Mixto']
const empty = { nombre: '', esquema_comision: 'Porcentaje', porcentaje_comision: '', bono_mensual: '', clases_base: '', pago_extra_clase: '', tarifa_privada_fija: '', activo: true }

export default function Coaches() {
  const [coaches, setCoaches] = useState([])
  const [modal, setModal] = useState(false)
  const [form, setForm] = useState(empty)
  const [editId, setEditId] = useState(null)
  const [toast, setToast] = useState('')

  useEffect(() => { fetchCoaches() }, [])

  const fetchCoaches = async () => {
    const { data } = await supabase.from('coaches').select('*').order('nombre')
    setCoaches(data || [])
  }

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(''), 3000) }

  const openNew = () => { setForm(empty); setEditId(null); setModal(true) }
  const openEdit = (c) => { setForm(c); setEditId(c.id); setModal(true) }

  const save = async () => {
    const payload = {
      nombre: form.nombre,
      esquema_comision: form.esquema_comision,
      porcentaje_comision: form.porcentaje_comision ? parseFloat(form.porcentaje_comision) : null,
      bono_mensual: form.bono_mensual ? parseFloat(form.bono_mensual) : null,
      clases_base: form.clases_base ? parseInt(form.clases_base) : null,
      pago_extra_clase: form.pago_extra_clase ? parseFloat(form.pago_extra_clase) : null,
      tarifa_privada_fija: form.tarifa_privada_fija ? parseFloat(form.tarifa_privada_fija) : null,
      activo: form.activo,
    }
    if (editId) {
      await supabase.from('coaches').update(payload).eq('id', editId)
      showToast('Coach actualizado ✓')
    } else {
      await supabase.from('coaches').insert(payload)
      showToast('Coach agregado ✓')
    }
    setModal(false); fetchCoaches()
  }

  const toggle = async (c) => {
    await supabase.from('coaches').update({ activo: !c.activo }).eq('id', c.id)
    fetchCoaches()
  }

  return (
    <div style={{ maxWidth: 800 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700 }}>Coaches</h1>
          <p style={{ color: 'var(--text2)', fontSize: 14, marginTop: 4 }}>{coaches.length} coaches registrados</p>
        </div>
        <button className="btn btn-primary" onClick={openNew}>+ Agregar coach</button>
      </div>

      <div className="card" style={{ padding: 0 }}>
        <table className="table">
          <thead><tr>
            <th>Nombre</th><th>Esquema</th><th>Detalles</th><th>Estado</th><th></th>
          </tr></thead>
          <tbody>
            {coaches.length === 0 && (
              <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--text2)', padding: 32 }}>
                Sin coaches aún. Agrega el primero.
              </td></tr>
            )}
            {coaches.map(c => (
              <tr key={c.id}>
                <td style={{ fontWeight: 600 }}>{c.nombre}</td>
                <td><span className={`badge ${c.esquema_comision === 'Bono' ? 'badge-blue' : c.esquema_comision === 'Porcentaje' ? 'badge-green' : 'badge-yellow'}`}>{c.esquema_comision}</span></td>
                <td style={{ fontSize: 13, color: 'var(--text2)' }}>
                  {c.esquema_comision === 'Bono' && `Base $${c.bono_mensual?.toLocaleString()} + $${c.pago_extra_clase} c/u extra (>${c.clases_base})`}
                  {c.esquema_comision === 'Porcentaje' && `${(c.porcentaje_comision * 100).toFixed(0)}% del ingreso`}
                  {c.esquema_comision === 'Mixto' && `Privada $${c.tarifa_privada_fija} + ${(c.porcentaje_comision * 100).toFixed(0)}% compartida`}
                </td>
                <td><span className={`badge ${c.activo ? 'badge-green' : 'badge-gray'}`}>{c.activo ? 'Activo' : 'Inactivo'}</span></td>
                <td>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button className="btn btn-secondary btn-sm" onClick={() => openEdit(c)}>Editar</button>
                    <button className="btn btn-secondary btn-sm" onClick={() => toggle(c)}>{c.activo ? 'Desactivar' : 'Activar'}</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setModal(false)}>
          <div className="modal">
            <h2 className="modal-title">{editId ? 'Editar coach' : 'Nuevo coach'}</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div className="form-group">
                <label className="form-label">Nombre</label>
                <input className="form-input" value={form.nombre} onChange={e => setForm({ ...form, nombre: e.target.value })} placeholder="Nombre del coach" />
              </div>
              <div className="form-group">
                <label className="form-label">Esquema de comisión</label>
                <select className="form-input" value={form.esquema_comision} onChange={e => setForm({ ...form, esquema_comision: e.target.value })}>
                  {ESQUEMAS.map(e => <option key={e}>{e}</option>)}
                </select>
              </div>

              {(form.esquema_comision === 'Porcentaje' || form.esquema_comision === 'Mixto') && (
                <div className="form-group">
                  <label className="form-label">Porcentaje (ej: 0.50 para 50%)</label>
                  <input className="form-input" type="number" step="0.01" value={form.porcentaje_comision} onChange={e => setForm({ ...form, porcentaje_comision: e.target.value })} placeholder="0.50" />
                </div>
              )}
              {(form.esquema_comision === 'Bono' || form.esquema_comision === 'Mixto') && (<>
                <div className="grid-2">
                  <div className="form-group">
                    <label className="form-label">Bono mensual base</label>
                    <input className="form-input" type="number" value={form.bono_mensual} onChange={e => setForm({ ...form, bono_mensual: e.target.value })} placeholder="40000" />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Clases base incluidas</label>
                    <input className="form-input" type="number" value={form.clases_base} onChange={e => setForm({ ...form, clases_base: e.target.value })} placeholder="55" />
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">Pago extra por clase adicional</label>
                  <input className="form-input" type="number" value={form.pago_extra_clase} onChange={e => setForm({ ...form, pago_extra_clase: e.target.value })} placeholder="500" />
                </div>
              </>)}
              {form.esquema_comision === 'Mixto' && (
                <div className="form-group">
                  <label className="form-label">Tarifa fija por clase privada</label>
                  <input className="form-input" type="number" value={form.tarifa_privada_fija} onChange={e => setForm({ ...form, tarifa_privada_fija: e.target.value })} placeholder="700" />
                </div>
              )}

              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 8 }}>
                <button className="btn btn-secondary" onClick={() => setModal(false)}>Cancelar</button>
                <button className="btn btn-primary" onClick={save} disabled={!form.nombre}>Guardar</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {toast && <div className="toast"><span style={{ color: 'var(--accent)' }}>✓</span>{toast}</div>}
    </div>
  )
}
