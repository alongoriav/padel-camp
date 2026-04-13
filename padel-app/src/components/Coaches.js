import { useState, useEffect } from 'react'
import { supabase } from '../supabase'

const empty = {
  nombre: '', activo: true, sueldo_base: '',
  esquema_comision: 'Porcentaje',
  aplica_porcentaje: false, porcentaje_comision: '', aplica_iva: true,
  aplica_bono_clases: false, clases_base: 55, pago_extra_clase: '',
  aplica_horas_minimas: false, horas_base_bono: 40,
  aplica_tarifa_privada: false, tarifa_privada_fija: '',
  aplica_porcentaje_compartida: false, porcentaje_compartida: '',
}

const ESQUEMAS = [
  { value: 'Porcentaje', label: '% sobre cobrado' },
  { value: 'Bono', label: 'Bono por clases' },
  { value: 'Mixto', label: 'Mixto' },
]

function Switch({ checked, onChange, label }) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', userSelect: 'none' }}>
      <div onClick={onChange} style={{
        width: 40, height: 22, borderRadius: 11,
        background: checked ? 'var(--accent)' : 'var(--border)',
        position: 'relative', transition: 'background .2s', cursor: 'pointer', flexShrink: 0
      }}>
        <div style={{
          width: 16, height: 16, borderRadius: 8, background: 'white',
          position: 'absolute', top: 3, left: checked ? 21 : 3,
          transition: 'left .2s', boxShadow: '0 1px 3px rgba(0,0,0,.3)'
        }} />
      </div>
      <span style={{ fontSize: 14, color: checked ? 'var(--text)' : 'var(--text2)' }}>{label}</span>
    </label>
  )
}

function RuleBlock({ title, active, onToggle, children }) {
  return (
    <div style={{
      border: `1px solid ${active ? 'rgba(0,229,160,.3)' : 'var(--border)'}`,
      borderRadius: 10, overflow: 'hidden', transition: 'border .2s'
    }}>
      <div style={{
        padding: '12px 16px', background: active ? 'rgba(0,229,160,.06)' : 'var(--bg3)',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center'
      }}>
        <span style={{ fontSize: 14, fontWeight: 600 }}>{title}</span>
        <Switch checked={active} onChange={onToggle} label={active ? 'Activo' : 'Inactivo'} />
      </div>
      {active && (
        <div style={{ padding: '14px 16px', background: 'var(--bg2)', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {children}
        </div>
      )}
    </div>
  )
}

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
  const set = (key, val) => setForm(f => ({ ...f, [key]: val }))

  const openNew = () => { setForm(empty); setEditId(null); setModal(true) }

  const openEdit = (c) => {
    setForm({
      nombre: c.nombre || '', activo: c.activo ?? true,
      sueldo_base: c.sueldo_base || '',
      esquema_comision: c.esquema_comision || 'Porcentaje',
      aplica_porcentaje: !!(c.porcentaje_comision && c.esquema_comision === 'Porcentaje'),
      porcentaje_comision: c.porcentaje_comision && c.esquema_comision === 'Porcentaje' ? (c.porcentaje_comision * 100).toString() : '',
      aplica_iva: c.aplica_iva ?? true,
      aplica_bono_clases: !!(c.pago_extra_clase),
      clases_base: c.clases_base || 55,
      pago_extra_clase: c.pago_extra_clase || '',
      aplica_horas_minimas: !!(c.horas_base_bono),
      horas_base_bono: c.horas_base_bono || 40,
      aplica_tarifa_privada: !!(c.tarifa_privada_fija),
      tarifa_privada_fija: c.tarifa_privada_fija || '',
      aplica_porcentaje_compartida: !!(c.porcentaje_comision && c.esquema_comision === 'Mixto'),
      porcentaje_compartida: c.porcentaje_comision && c.esquema_comision === 'Mixto' ? (c.porcentaje_comision * 100).toString() : '',
    })
    setEditId(c.id); setModal(true)
  }

  const save = async () => {
    const pct = form.esquema_comision === 'Porcentaje' && form.aplica_porcentaje
      ? parseFloat(form.porcentaje_comision) / 100
      : form.esquema_comision === 'Mixto' && form.aplica_porcentaje_compartida
      ? parseFloat(form.porcentaje_compartida) / 100
      : null

    const payload = {
      nombre: form.nombre, activo: form.activo,
      sueldo_base: form.sueldo_base ? parseFloat(form.sueldo_base) : 0,
      esquema_comision: form.esquema_comision,
      porcentaje_comision: pct,
      aplica_iva: form.aplica_iva,
      bono_mensual: form.esquema_comision === 'Bono' ? parseFloat(form.sueldo_base || 0) : null,
      clases_base: form.aplica_bono_clases ? parseInt(form.clases_base) : null,
      pago_extra_clase: form.aplica_bono_clases ? parseFloat(form.pago_extra_clase) : null,
      horas_base_bono: form.aplica_horas_minimas ? parseFloat(form.horas_base_bono) : null,
      tarifa_privada_fija: form.aplica_tarifa_privada ? parseFloat(form.tarifa_privada_fija) : null,
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

  const reglaResumen = (c) => {
    const parts = []
    if (c.sueldo_base) parts.push(`Base $${Number(c.sueldo_base).toLocaleString('es-MX')}`)
    if (c.esquema_comision === 'Porcentaje' && c.porcentaje_comision)
      parts.push(`${(c.porcentaje_comision * 100).toFixed(0)}%${c.aplica_iva ? ' neto' : ' bruto'}`)
    if (c.esquema_comision === 'Bono') {
      if (c.horas_base_bono) parts.push(`≥${c.horas_base_bono}hrs para base completo`)
      if (c.pago_extra_clase) parts.push(`+$${c.pago_extra_clase} c/clase >${c.clases_base}`)
    }
    if (c.esquema_comision === 'Mixto') {
      if (c.tarifa_privada_fija) parts.push(`Privada $${c.tarifa_privada_fija}`)
      if (c.porcentaje_comision) parts.push(`Compartida ${(c.porcentaje_comision * 100).toFixed(0)}%`)
    }
    return parts.join(' · ') || 'Sin reglas definidas'
  }

  return (
    <div style={{ maxWidth: 860 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700 }}>Coaches</h1>
          <p style={{ color: 'var(--text2)', fontSize: 14, marginTop: 4 }}>{coaches.length} coaches registrados</p>
        </div>
        <button className="btn btn-primary" onClick={openNew}>+ Agregar coach</button>
      </div>

      <div className="card" style={{ padding: 0 }}>
        <table className="table">
          <thead><tr><th>Nombre</th><th>Esquema</th><th>Reglas de pago</th><th>Estado</th><th></th></tr></thead>
          <tbody>
            {coaches.length === 0 && (
              <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--text2)', padding: 32 }}>Sin coaches aún</td></tr>
            )}
            {coaches.map(c => (
              <tr key={c.id}>
                <td style={{ fontWeight: 600 }}>{c.nombre}</td>
                <td><span className={`badge ${c.esquema_comision === 'Bono' ? 'badge-blue' : c.esquema_comision === 'Porcentaje' ? 'badge-green' : 'badge-yellow'}`}>{c.esquema_comision}</span></td>
                <td style={{ fontSize: 12, color: 'var(--text2)' }}>{reglaResumen(c)}</td>
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
          <div className="modal" style={{ maxWidth: 580 }}>
            <h2 className="modal-title">{editId ? 'Editar coach' : 'Nuevo coach'}</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

              <div className="grid-2">
                <div className="form-group">
                  <label className="form-label">Nombre del coach</label>
                  <input className="form-input" value={form.nombre} onChange={e => set('nombre', e.target.value)} placeholder="Nombre completo" />
                </div>
                <div className="form-group">
                  <label className="form-label">Sueldo base mensual ($)</label>
                  <input className="form-input" type="number" value={form.sueldo_base} onChange={e => set('sueldo_base', e.target.value)} placeholder="0" />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Esquema de comisión</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  {ESQUEMAS.map(e => (
                    <button key={e.value} onClick={() => set('esquema_comision', e.value)}
                      style={{
                        flex: 1, padding: '9px 10px', borderRadius: 8,
                        border: `1px solid ${form.esquema_comision === e.value ? 'var(--accent)' : 'var(--border)'}`,
                        background: form.esquema_comision === e.value ? 'rgba(0,229,160,.1)' : 'var(--bg3)',
                        color: form.esquema_comision === e.value ? 'var(--accent)' : 'var(--text2)',
                        fontSize: 13, fontWeight: 500, cursor: 'pointer'
                      }}>
                      {e.label}
                    </button>
                  ))}
                </div>
              </div>

              {form.esquema_comision === 'Porcentaje' && (
                <RuleBlock title="📊 Porcentaje sobre lo cobrado"
                  active={form.aplica_porcentaje}
                  onToggle={() => set('aplica_porcentaje', !form.aplica_porcentaje)}>
                  <div className="grid-2">
                    <div className="form-group">
                      <label className="form-label">Porcentaje (%)</label>
                      <input className="form-input" type="number" value={form.porcentaje_comision}
                        onChange={e => set('porcentaje_comision', e.target.value)} placeholder="60" />
                    </div>
                    <div style={{ display: 'flex', alignItems: 'flex-end', paddingBottom: 6 }}>
                      <Switch checked={form.aplica_iva} onChange={() => set('aplica_iva', !form.aplica_iva)}
                        label="Descontar IVA (16%) primero" />
                    </div>
                  </div>
                </RuleBlock>
              )}

              {form.esquema_comision === 'Bono' && (<>
                <RuleBlock title="⏱ Horas mínimas para sueldo base completo"
                  active={form.aplica_horas_minimas}
                  onToggle={() => set('aplica_horas_minimas', !form.aplica_horas_minimas)}>
                  <div className="form-group">
                    <label className="form-label">Mínimo de horas mensuales</label>
                    <input className="form-input" type="number" value={form.horas_base_bono}
                      onChange={e => set('horas_base_bono', e.target.value)} placeholder="40" />
                  </div>
                  <p style={{ fontSize: 12, color: 'var(--text2)' }}>Si no llega al mínimo, se paga proporcional (hrs reales ÷ mínimo × sueldo base)</p>
                </RuleBlock>

                <RuleBlock title="🎾 Pago extra por clases adicionales"
                  active={form.aplica_bono_clases}
                  onToggle={() => set('aplica_bono_clases', !form.aplica_bono_clases)}>
                  <div className="grid-2">
                    <div className="form-group">
                      <label className="form-label">Clases incluidas en base</label>
                      <input className="form-input" type="number" value={form.clases_base}
                        onChange={e => set('clases_base', e.target.value)} placeholder="55" />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Monto extra por clase adicional ($)</label>
                      <input className="form-input" type="number" value={form.pago_extra_clase}
                        onChange={e => set('pago_extra_clase', e.target.value)} placeholder="500" />
                    </div>
                  </div>
                </RuleBlock>
              </>)}

              {form.esquema_comision === 'Mixto' && (<>
                <RuleBlock title="🏷 Tarifa fija por clase privada"
                  active={form.aplica_tarifa_privada}
                  onToggle={() => set('aplica_tarifa_privada', !form.aplica_tarifa_privada)}>
                  <div className="form-group">
                    <label className="form-label">Monto fijo por clase privada ($)</label>
                    <input className="form-input" type="number" value={form.tarifa_privada_fija}
                      onChange={e => set('tarifa_privada_fija', e.target.value)} placeholder="700" />
                  </div>
                </RuleBlock>

                <RuleBlock title="📊 Porcentaje por clase compartida"
                  active={form.aplica_porcentaje_compartida}
                  onToggle={() => set('aplica_porcentaje_compartida', !form.aplica_porcentaje_compartida)}>
                  <div className="grid-2">
                    <div className="form-group">
                      <label className="form-label">Porcentaje (%)</label>
                      <input className="form-input" type="number" value={form.porcentaje_compartida}
                        onChange={e => set('porcentaje_compartida', e.target.value)} placeholder="65" />
                    </div>
                    <div style={{ display: 'flex', alignItems: 'flex-end', paddingBottom: 6 }}>
                      <Switch checked={form.aplica_iva} onChange={() => set('aplica_iva', !form.aplica_iva)}
                        label="Descontar IVA (16%) primero" />
                    </div>
                  </div>
                </RuleBlock>
              </>)}

              <div style={{ background: 'var(--bg3)', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: 'var(--text2)', lineHeight: 1.6 }}>
                💡 <strong style={{ color: 'var(--text)' }}>Resumen: </strong>
                {form.sueldo_base ? `Base $${Number(form.sueldo_base || 0).toLocaleString('es-MX')}` : 'Sin base'}
                {form.esquema_comision === 'Porcentaje' && form.aplica_porcentaje && form.porcentaje_comision ? ` + ${form.porcentaje_comision}% sobre ${form.aplica_iva ? 'neto (sin IVA)' : 'bruto'}` : ''}
                {form.esquema_comision === 'Bono' && form.aplica_horas_minimas ? ` (proporcional si <${form.horas_base_bono}hrs)` : ''}
                {form.esquema_comision === 'Bono' && form.aplica_bono_clases ? ` + $${form.pago_extra_clase || 0} por clase >${form.clases_base}` : ''}
                {form.esquema_comision === 'Mixto' && form.aplica_tarifa_privada ? ` + $${form.tarifa_privada_fija || 0} por privada` : ''}
                {form.esquema_comision === 'Mixto' && form.aplica_porcentaje_compartida ? ` + ${form.porcentaje_compartida || 0}% compartida${form.aplica_iva ? ' (neto)' : ''}` : ''}
              </div>

              <div style={{ display: 'flex', gap: 10, justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
                <Switch checked={form.activo} onChange={() => set('activo', !form.activo)} label="Coach activo" />
                <div style={{ display: 'flex', gap: 10 }}>
                  <button className="btn btn-secondary" onClick={() => setModal(false)}>Cancelar</button>
                  <button className="btn btn-primary" onClick={save} disabled={!form.nombre}>Guardar</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {toast && <div className="toast"><span style={{ color: 'var(--accent)' }}>✓</span>{toast}</div>}
    </div>
  )
}
