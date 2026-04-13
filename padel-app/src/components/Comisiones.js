import { useState, useEffect } from 'react'
import { supabase } from '../supabase'

const MESES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre']

function calcComision(coach, clases, ingresoTeorico) {
  if (!coach) return 0
  if (coach.esquema_comision === 'Porcentaje') return ingresoTeorico * (coach.porcentaje_comision || 0)
  if (coach.esquema_comision === 'Bono') {
    const base = coach.bono_mensual || 0
    const extra = Math.max(0, clases - (coach.clases_base || 0)) * (coach.pago_extra_clase || 0)
    return base + extra
  }
  if (coach.esquema_comision === 'Mixto') {
    const privadas = clases * (coach.tarifa_privada_fija || 0)
    const compartidas = ingresoTeorico * (coach.porcentaje_comision || 0)
    return privadas + compartidas
  }
  return 0
}

export default function Comisiones() {
  const [coaches, setCoaches] = useState([])
  const [inscripciones, setInscripciones] = useState([])
  const [mesSeleccionado, setMesSeleccionado] = useState(MESES[new Date().getMonth()])
  const [resumen, setResumen] = useState([])

  useEffect(() => { fetchData() }, [])
  useEffect(() => { calcResumen() }, [mesSeleccionado, coaches, inscripciones])

  const fetchData = async () => {
    const [{ data: cs }, { data: ins }] = await Promise.all([
      supabase.from('coaches').select('*').order('nombre'),
      supabase.from('inscripciones').select('*, clases(coach_id, tipo, modalidad)'),
    ])
    setCoaches(cs || [])
    setInscripciones(ins || [])
  }

  const calcResumen = () => {
    const res = coaches.map(coach => {
      const insMes = inscripciones.filter(i => i.mes === mesSeleccionado && i.clases?.coach_id === coach.id)
      // Contar clases únicas (agrupar por clase)
      const clasesUnicas = new Set(insMes.map(i => i.clase_id)).size
      // Ingreso teórico
      const ingresoTeorico = insMes.reduce((a, i) => a + (i.monto_cobrado || 0), 0)
      const cobrado = insMes.filter(i => i.pagado).reduce((a, i) => a + (i.monto_cobrado || 0), 0)
      const comision = calcComision(coach, clasesUnicas, ingresoTeorico)
      return { coach, clasesUnicas, ingresoTeorico, cobrado, comision }
    }).filter(r => r.clasesUnicas > 0 || coaches.length <= 6)

    setResumen(res)
  }

  const fmt = (n) => '$' + (n || 0).toLocaleString('es-MX', { minimumFractionDigits: 0, maximumFractionDigits: 0 })

  const totalComisiones = resumen.reduce((a, r) => a + r.comision, 0)
  const totalIngreso = resumen.reduce((a, r) => a + r.ingresoTeorico, 0)

  return (
    <div style={{ maxWidth: 900 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700 }}>Comisiones</h1>
          <p style={{ color: 'var(--text2)', fontSize: 14, marginTop: 4 }}>Calculadas sobre ingreso teórico por clase</p>
        </div>
        <select className="form-input" style={{ maxWidth: 180, textTransform: 'capitalize' }} value={mesSeleccionado} onChange={e => setMesSeleccionado(e.target.value)}>
          {MESES.map(m => <option key={m} value={m} style={{ textTransform: 'capitalize' }}>{m}</option>)}
        </select>
      </div>

      <div className="grid-2" style={{ gridTemplateColumns: 'repeat(3,1fr)', marginBottom: 24, gap: 14 }}>
        <div className="stat-card">
          <div className="stat-value" style={{ fontSize: 22 }}>{fmt(totalIngreso)}</div>
          <div className="stat-label">Ingreso teórico del mes</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ fontSize: 22, color: 'var(--accent)' }}>{fmt(totalComisiones)}</div>
          <div className="stat-label">Total comisiones a pagar</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ fontSize: 22, color: 'var(--accent2)' }}>
            {totalIngreso > 0 ? ((totalComisiones / totalIngreso) * 100).toFixed(1) + '%' : '—'}
          </div>
          <div className="stat-label">% del ingreso en comisiones</div>
        </div>
      </div>

      <div className="card" style={{ padding: 0 }}>
        <table className="table">
          <thead><tr>
            <th>Coach</th><th>Esquema</th><th>Clases</th><th>Ingreso teórico</th><th>Comisión</th><th>Regla</th>
          </tr></thead>
          <tbody>
            {resumen.map(r => (
              <tr key={r.coach.id}>
                <td style={{ fontWeight: 600 }}>{r.coach.nombre}</td>
                <td><span className={`badge ${r.coach.esquema_comision === 'Bono' ? 'badge-blue' : r.coach.esquema_comision === 'Porcentaje' ? 'badge-green' : 'badge-yellow'}`}>{r.coach.esquema_comision}</span></td>
                <td style={{ fontFamily: 'var(--mono)', fontSize: 13 }}>{r.clasesUnicas}</td>
                <td style={{ fontFamily: 'var(--mono)', fontSize: 13 }}>{fmt(r.ingresoTeorico)}</td>
                <td style={{ fontFamily: 'var(--mono)', fontSize: 14, fontWeight: 700, color: 'var(--accent)' }}>{fmt(r.comision)}</td>
                <td style={{ fontSize: 12, color: 'var(--text2)' }}>
                  {r.coach.esquema_comision === 'Bono' && `${fmt(r.coach.bono_mensual)} base + ${fmt(r.coach.pago_extra_clase)} c/clase extra (>${r.coach.clases_base})`}
                  {r.coach.esquema_comision === 'Porcentaje' && `${(r.coach.porcentaje_comision * 100).toFixed(0)}% del ingreso teórico`}
                  {r.coach.esquema_comision === 'Mixto' && `${fmt(r.coach.tarifa_privada_fija)} x clase + ${(r.coach.porcentaje_comision * 100).toFixed(0)}% compartida`}
                </td>
              </tr>
            ))}
            {resumen.length === 0 && (
              <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--text2)', padding: 32 }}>
                Sin datos para {mesSeleccionado}
              </td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div style={{ marginTop: 16, padding: '12px 16px', background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13, color: 'var(--text2)' }}>
        💡 Las comisiones se calculan sobre el ingreso teórico de la clase, aunque no esté pagada. Promo/Cortesía no castiga al coach.
      </div>
    </div>
  )
}
