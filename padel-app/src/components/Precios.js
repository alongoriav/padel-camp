import { useState, useEffect } from 'react'
import { supabase } from '../supabase'

const LABELS = { 1: 'Individual', 2: 'Doble', 3: 'Triple', 4: 'Cuádruple' }
const ICONS = { 1: '👤', 2: '👥', 3: '👥👤', 4: '👥👥' }

export default function Precios() {
  const [precios, setPrecios] = useState([])
  const [editando, setEditando] = useState(false)
  const [form, setForm] = useState({})
  const [toast, setToast] = useState('')
  const [historial, setHistorial] = useState([])

  useEffect(() => { fetchPrecios() }, [])

  const fetchPrecios = async () => {
    const { data } = await supabase.from('precios').select('*').order('participantes')
    setPrecios(data || [])
    // Init form
    const f = {}
    ;(data || []).forEach(p => {
      f[`${p.participantes}_semanal`] = p.semanal_mensual
      f[`${p.participantes}_unica`] = p.clase_unica
    })
    setForm(f)
  }

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(''), 3000) }

  const guardar = async () => {
    // Save snapshot to historial antes de cambiar
    const snapshot = {
      fecha: new Date().toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' }),
      precios: precios.map(p => ({ ...p }))
    }
    setHistorial(h => [snapshot, ...h].slice(0, 5))

    for (const p of precios) {
      const semanal = parseFloat(form[`${p.participantes}_semanal`])
      const unica = parseFloat(form[`${p.participantes}_unica`])
      const semanal_por_clase = semanal / 4
      await supabase.from('precios').update({
        semanal_mensual: semanal,
        clase_unica: unica,
        semanal_por_clase: semanal_por_clase
      }).eq('id', p.id)
    }
    showToast('Precios actualizados ✓')
    setEditando(false)
    fetchPrecios()
  }

  const cancelar = () => {
    const f = {}
    precios.forEach(p => {
      f[`${p.participantes}_semanal`] = p.semanal_mensual
      f[`${p.participantes}_unica`] = p.clase_unica
    })
    setForm(f)
    setEditando(false)
  }

  const fmt = (n) => '$' + Number(n).toLocaleString('es-MX', { minimumFractionDigits: 2 })

  return (
    <div style={{ maxWidth: 700 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700 }}>Precios</h1>
          <p style={{ color: 'var(--text2)', fontSize: 14, marginTop: 4 }}>
            Tarifas por persona según número de participantes
          </p>
        </div>
        {!editando
          ? <button className="btn btn-primary" onClick={() => setEditando(true)}>✏️ Editar precios</button>
          : <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn btn-secondary" onClick={cancelar}>Cancelar</button>
              <button className="btn btn-primary" onClick={guardar}>Guardar cambios</button>
            </div>
        }
      </div>

      {editando && (
        <div style={{ background: 'rgba(255,165,2,.08)', border: '1px solid rgba(255,165,2,.3)', borderRadius: 10, padding: '12px 16px', marginBottom: 20, fontSize: 13, color: 'var(--warn)' }}>
          ⚠️ Los precios nuevos solo aplican a clases registradas <strong>después</strong> de guardar. Las clases existentes mantienen su precio original.
        </div>
      )}

      <div className="card" style={{ padding: 0, marginBottom: 24 }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text2)' }}>PARTICIPANTES</div>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text2)', textAlign: 'center' }}>SEMANAL / MES</div>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text2)', textAlign: 'center' }}>CLASE ÚNICA</div>
        </div>

        {precios.map(p => (
          <div key={p.participantes} style={{
            padding: '16px 20px', borderBottom: '1px solid var(--border)',
            display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, alignItems: 'center'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 18 }}>{ICONS[p.participantes]}</span>
              <div>
                <div style={{ fontWeight: 600, fontSize: 15 }}>{LABELS[p.participantes]}</div>
                <div style={{ fontSize: 12, color: 'var(--text2)' }}>{p.participantes} persona{p.participantes > 1 ? 's' : ''}</div>
              </div>
            </div>

            <div style={{ textAlign: 'center' }}>
              {editando
                ? <input className="form-input" type="number"
                    value={form[`${p.participantes}_semanal`]}
                    onChange={e => setForm(f => ({ ...f, [`${p.participantes}_semanal`]: e.target.value }))}
                    style={{ textAlign: 'center', maxWidth: 120 }} />
                : <div>
                    <div style={{ fontFamily: 'var(--mono)', fontSize: 18, fontWeight: 700, color: 'var(--accent)' }}>
                      {fmt(p.semanal_mensual)}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text2)' }}>
                      {fmt(p.semanal_por_clase)} por clase
                    </div>
                  </div>
              }
            </div>

            <div style={{ textAlign: 'center' }}>
              {editando
                ? <input className="form-input" type="number"
                    value={form[`${p.participantes}_unica`]}
                    onChange={e => setForm(f => ({ ...f, [`${p.participantes}_unica`]: e.target.value }))}
                    style={{ textAlign: 'center', maxWidth: 120 }} />
                : <div style={{ fontFamily: 'var(--mono)', fontSize: 18, fontWeight: 700, color: 'var(--accent2)' }}>
                    {fmt(p.clase_unica)}
                  </div>
              }
            </div>
          </div>
        ))}
      </div>

      <div className="card">
        <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>📋 Notas</h3>
        <ul style={{ fontSize: 13, color: 'var(--text2)', display: 'flex', flexDirection: 'column', gap: 8, listStyle: 'none' }}>
          <li>• El precio semanal es mensual por persona basado en 4 clases.</li>
          <li>• Si en el mes caen 5 clases, el sistema cobra 5/4 del mensual automáticamente.</li>
          <li>• Promo / Cortesía = $0 pero la clase sigue contando para agenda y comisiones.</li>
          <li>• Para separar el horario se deberá liquidar todas las clases a inicio de mes.</li>
        </ul>
      </div>

      {historial.length > 0 && (
        <div className="card" style={{ marginTop: 20 }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>🕐 Historial de cambios (últimos 5)</h3>
          {historial.map((h, i) => (
            <div key={i} style={{ padding: '10px 0', borderBottom: i < historial.length - 1 ? '1px solid var(--border)' : 'none' }}>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>{h.fecha}</div>
              <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                {h.precios.map(p => (
                  <span key={p.participantes} style={{ fontSize: 12, color: 'var(--text2)' }}>
                    {LABELS[p.participantes]}: ${p.semanal_mensual} / ${p.clase_unica}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {toast && <div className="toast"><span style={{ color: 'var(--accent)' }}>✓</span>{toast}</div>}
    </div>
  )
}
