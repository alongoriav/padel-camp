import { useState, useEffect } from 'react'
import { supabase } from '../supabase'

const MESES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre']

const PRECIOS_TEORICOS = {
  1: { Semanal: 1000, 'Clase única': 1200 },
  2: { Semanal: 550, 'Clase única': 660 },
  3: { Semanal: 435, 'Clase única': 555 },
  4: { Semanal: 375, 'Clase única': 450 },
}

function calcValorTeorico(modalidad, participantes, clases) {
  const p = Math.min(participantes || 1, 4)
  if (modalidad === 'Semanal') {
    const base4 = (PRECIOS_TEORICOS[p]?.Semanal || 0) * 4
    return Math.round(base4 * (clases || 1) / 4)
  }
  return PRECIOS_TEORICOS[p]?.['Clase única'] || 0
}

function calcComision(coach, clases, ingresoTeorico) {
  if (!coach) return 0
  if (coach.esquema_comision === 'Porcentaje') {
    const base = coach.sueldo_base || 0
    const neto = coach.aplica_iva ? ingresoTeorico / 1.16 : ingresoTeorico
    return base + neto * (coach.porcentaje_comision || 0)
  }
  if (coach.esquema_comision === 'Bono') {
    const base = coach.sueldo_base || 0
    const extra = Math.max(0, clases - (coach.clases_base || 0)) * (coach.pago_extra_clase || 0)
    return base + extra
  }
  if (coach.esquema_comision === 'Mixto') {
    const base = coach.sueldo_base || 0
    const privadas = clases * (coach.tarifa_privada_fija || 0)
    const neto = coach.aplica_iva ? ingresoTeorico / 1.16 : ingresoTeorico
    const compartidas = neto * (coach.porcentaje_comision || 0)
    return base + privadas + compartidas
  }
  return 0
}

export default function Comisiones() {
  const [coaches, setCoaches] = useState([])
  const [inscripciones, setInscripciones] = useState([])
  const [clases, setClases] = useState([])
  const [mesSeleccionado, setMesSeleccionado] = useState(MESES[new Date().getMonth()])
  const [resumen, setResumen] = useState([])
  const [promos, setPromos] = useState([])
  const [tabActiva, setTabActiva] = useState('comisiones')

  useEffect(() => { fetchData() }, [])
  useEffect(() => { calcResumen() }, [mesSeleccionado, coaches, inscripciones, clases])

  const fetchData = async () => {
    const [{ data: cs }, { data: ins }, { data: cl }] = await Promise.all([
      supabase.from('coaches').select('*').order('nombre'),
      supabase.from('inscripciones').select('*, jugadores(nombre), clases(coach_id, tipo, modalidad)'),
      supabase.from('clases').select('*'),
    ])
    setCoaches(cs || [])
    setInscripciones(ins || [])
    setClases(cl || [])
  }

  const calcResumen = () => {
    // Calcular comisiones
    const res = coaches.map(coach => {
      const insMes = inscripciones.filter(i => i.mes === mesSeleccionado && i.clases?.coach_id === coach.id)
      const clasesUnicas = new Set(insMes.map(i => i.clase_id)).size

      // Para cada inscripción, usar valor teórico si es Promo/Cortesía
      let ingresoTeorico = 0
      insMes.forEach(i => {
        const modalidad = i.clases?.modalidad
        if (modalidad === 'Promo' || modalidad === 'Cortesía') {
          // Calcular valor teórico según participantes del grupo
          const participantesGrupo = insMes.filter(x => x.clase_id === i.clase_id).length
          const clasesEnRango = clases.find(c => c.id === i.clase_id)
          const numClases = 1 // aproximación por inscripción
          ingresoTeorico += calcValorTeorico(i.clases?.modalidad === 'Promo' ? 'Semanal' : 'Clase única', participantesGrupo, numClases)
        } else {
          ingresoTeorico += i.monto_cobrado || 0
        }
      })

      const cobrado = insMes.filter(i => i.pagado).reduce((a, i) => a + (i.monto_cobrado || 0), 0)
      const comision = calcComision(coach, clasesUnicas, ingresoTeorico)
      return { coach, clasesUnicas, ingresoTeorico, cobrado, comision }
    }).filter(r => r.clasesUnicas > 0 || coaches.length <= 6)

    setResumen(res)

    // Calcular promos del mes
    const promosMes = inscripciones.filter(i => {
      const modalidad = i.clases?.modalidad
      return i.mes === mesSeleccionado && (modalidad === 'Promo' || modalidad === 'Cortesía')
    }).map(i => {
      const participantesGrupo = inscripciones.filter(x => x.clase_id === i.clase_id).length
      const valorTeorico = calcValorTeorico('Semanal', participantesGrupo, 1)
      const coachNombre = coaches.find(c => c.id === i.clases?.coach_id)?.nombre || '—'
      return {
        jugador: i.jugadores?.nombre,
        modalidad: i.clases?.modalidad,
        coach: coachNombre,
        valorTeorico,
        mes: i.mes,
      }
    })
    setPromos(promosMes)
  }

  const fmt = (n) => '$' + (n || 0).toLocaleString('es-MX', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
  const totalComisiones = resumen.reduce((a, r) => a + r.comision, 0)
  const totalIngreso = resumen.reduce((a, r) => a + r.ingresoTeorico, 0)
  const totalPromos = promos.reduce((a, p) => a + p.valorTeorico, 0)

  return (
    <div style={{ maxWidth: 900 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700 }}>Comisiones</h1>
          <p style={{ color: 'var(--text2)', fontSize: 14, marginTop: 4 }}>Calculadas sobre ingreso teórico · Promo/Cortesía no castiga al coach</p>
        </div>
        <select className="form-input" style={{ maxWidth: 180, textTransform: 'capitalize' }} value={mesSeleccionado} onChange={e => setMesSeleccionado(e.target.value)}>
          {MESES.map(m => <option key={m} value={m} style={{ textTransform: 'capitalize' }}>{m}</option>)}
        </select>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14, marginBottom: 24 }}>
        <div className="stat-card">
          <div className="stat-value" style={{ fontSize: 20 }}>{fmt(totalIngreso)}</div>
          <div className="stat-label">Ingreso teórico</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ fontSize: 20, color: 'var(--accent)' }}>{fmt(totalComisiones)}</div>
          <div className="stat-label">Total comisiones</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ fontSize: 20, color: 'var(--accent2)' }}>
            {totalIngreso > 0 ? ((totalComisiones / totalIngreso) * 100).toFixed(1) + '%' : '—'}
          </div>
          <div className="stat-label">% en comisiones</div>
        </div>
        <div className="stat-card" style={{ borderColor: 'rgba(255,165,2,.3)' }}>
          <div className="stat-value" style={{ fontSize: 20, color: 'var(--warn)' }}>{fmt(totalPromos)}</div>
          <div className="stat-label">Valor clases Promo</div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 16 }}>
        {[
          { id: 'comisiones', label: '💰 Comisiones por coach' },
          { id: 'promos', label: `🎁 Promo / Cortesía (${promos.length})` },
        ].map(t => (
          <button key={t.id} onClick={() => setTabActiva(t.id)} style={{
            padding: '8px 16px', borderRadius: 8, border: 'none', cursor: 'pointer',
            background: tabActiva === t.id ? 'var(--accent)' : 'var(--bg3)',
            color: tabActiva === t.id ? '#000' : 'var(--text2)',
            fontSize: 13, fontWeight: tabActiva === t.id ? 600 : 400,
          }}>{t.label}</button>
        ))}
      </div>

      {/* Comisiones tab */}
      {tabActiva === 'comisiones' && (
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
                    {r.coach.esquema_comision === 'Bono' && `Base ${fmt(r.coach.sueldo_base)} + ${fmt(r.coach.pago_extra_clase)}/clase extra (>${r.coach.clases_base})`}
                    {r.coach.esquema_comision === 'Porcentaje' && `Base ${fmt(r.coach.sueldo_base)} + ${(r.coach.porcentaje_comision * 100).toFixed(0)}% ${r.coach.aplica_iva ? 'neto' : 'bruto'}`}
                    {r.coach.esquema_comision === 'Mixto' && `Base ${fmt(r.coach.sueldo_base)} + ${fmt(r.coach.tarifa_privada_fija)}/priv + ${(r.coach.porcentaje_comision * 100).toFixed(0)}% comp`}
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
      )}

      {/* Promos tab */}
      {tabActiva === 'promos' && (
        <div className="card" style={{ padding: 0 }}>
          {promos.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 40, color: 'var(--text2)' }}>
              No hay clases Promo o Cortesía en {mesSeleccionado}
            </div>
          ) : (
            <>
              <table className="table">
                <thead><tr>
                  <th>Jugador</th><th>Tipo</th><th>Coach</th><th>Valor teórico</th>
                </tr></thead>
                <tbody>
                  {promos.map((p, i) => (
                    <tr key={i}>
                      <td style={{ fontWeight: 500 }}>{p.jugador}</td>
                      <td><span className="badge badge-gray">{p.modalidad}</span></td>
                      <td style={{ fontSize: 13 }}>{p.coach}</td>
                      <td style={{ fontFamily: 'var(--mono)', fontSize: 13, color: 'var(--warn)' }}>{fmt(p.valorTeorico)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                <span style={{ color: 'var(--text2)' }}>{promos.length} clases sin cobro en {mesSeleccionado}</span>
                <span style={{ fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--warn)' }}>Total: {fmt(totalPromos)}</span>
              </div>
            </>
          )}
        </div>
      )}

      <div style={{ marginTop: 16, padding: '12px 16px', background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13, color: 'var(--text2)' }}>
        💡 El ingreso teórico de clases Promo/Cortesía se calcula según el precio que correspondería por número de participantes. El coach siempre recibe su comisión completa.
      </div>
    </div>
  )
}
