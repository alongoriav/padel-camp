import { useState, useEffect } from 'react'
import { supabase } from '../supabase'

const MESES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre']

function DateRangeFilter({ desde, hasta, onDesde, onHasta, onLimpiar }) {
  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
      <div className="form-group" style={{ flexDirection: 'row', alignItems: 'center', gap: 8, margin: 0 }}>
        <label className="form-label" style={{ whiteSpace: 'nowrap', margin: 0 }}>Desde</label>
        <input className="form-input" type="date" value={desde} onChange={e => onDesde(e.target.value)} style={{ maxWidth: 150 }} />
      </div>
      <div className="form-group" style={{ flexDirection: 'row', alignItems: 'center', gap: 8, margin: 0 }}>
        <label className="form-label" style={{ whiteSpace: 'nowrap', margin: 0 }}>Hasta</label>
        <input className="form-input" type="date" value={hasta} onChange={e => onHasta(e.target.value)} style={{ maxWidth: 150 }} />
      </div>
      {(desde || hasta) && (
        <button className="btn btn-secondary btn-sm" onClick={onLimpiar}>✕ Limpiar</button>
      )}
    </div>
  )
}

export default function Dashboard({ usuario }) {
  const [inscripciones, setInscripciones] = useState([])
  const [stats, setStats] = useState(null)
  const [porMes, setPorMes] = useState([])
  const [porCoach, setPorCoach] = useState([])
  const [desde, setDesde] = useState('')
  const [hasta, setHasta] = useState('')

  useEffect(() => { fetchStats() }, [])
  useEffect(() => { calcStats() }, [inscripciones, desde, hasta])

  const fetchStats = async () => {
    const { data: ins } = await supabase.from('inscripciones').select('*, clases(coach_id, fecha_inicio, coaches(nombre))')
    setInscripciones(ins || [])
  }

  const calcStats = () => {
    let ins = inscripciones
    if (desde) ins = ins.filter(i => i.clases?.fecha_inicio >= desde)
    if (hasta) ins = ins.filter(i => i.clases?.fecha_inicio <= hasta)

    const total = ins.reduce((a, i) => a + (i.monto_cobrado || 0), 0)
    const cobrado = ins.filter(i => i.pagado).reduce((a, i) => a + (i.monto_cobrado || 0), 0)
    const pendiente = ins.filter(i => !i.pagado).reduce((a, i) => a + (i.monto_cobrado || 0), 0)
    setStats({ total, cobrado, pendiente, clases: ins.length })

    const mMap = {}
    ins.forEach(i => {
      const k = i.mes || 'Sin mes'
      if (!mMap[k]) mMap[k] = { mes: k, programado: 0, cobrado: 0, pendiente: 0 }
      mMap[k].programado += i.monto_cobrado || 0
      if (i.pagado) mMap[k].cobrado += i.monto_cobrado || 0
      else mMap[k].pendiente += i.monto_cobrado || 0
    })
    const ordenMeses = MESES
    setPorMes(Object.values(mMap).sort((a, b) => ordenMeses.indexOf(a.mes) - ordenMeses.indexOf(b.mes)))

    const cMap = {}
    ins.forEach(i => {
      const nombre = i.clases?.coaches?.nombre || 'Sin coach'
      if (!cMap[nombre]) cMap[nombre] = { nombre, programado: 0, cobrado: 0, clases: 0 }
      cMap[nombre].programado += i.monto_cobrado || 0
      if (i.pagado) cMap[nombre].cobrado += i.monto_cobrado || 0
      cMap[nombre].clases++
    })
    setPorCoach(Object.values(cMap).sort((a, b) => b.programado - a.programado))
  }

  const fmt = (n) => '$' + (n || 0).toLocaleString('es-MX')

  return (
    <div style={{ maxWidth: 960 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700 }}>Resumen general</h1>
          <p style={{ color: 'var(--text2)', fontSize: 14, marginTop: 4 }}>Vista consolidada de tu academia</p>
        </div>
        <DateRangeFilter desde={desde} hasta={hasta} onDesde={setDesde} onHasta={setHasta} onLimpiar={() => { setDesde(''); setHasta('') }} />
      </div>

      {desde || hasta ? (
        <div style={{ background: 'rgba(0,229,160,.08)', border: '1px solid rgba(0,229,160,.2)', borderRadius: 8, padding: '8px 14px', fontSize: 13, color: 'var(--accent)', marginBottom: 16 }}>
          📅 Mostrando: {desde || '—'} → {hasta || '—'}
        </div>
      ) : null}

      {stats && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', marginBottom: 28, gap: 14 }}>
          {[
            { label: 'Total programado', value: fmt(stats.total), color: 'var(--text)' },
            { label: 'Total cobrado', value: fmt(stats.cobrado), color: 'var(--accent)' },
            { label: 'Pendiente', value: fmt(stats.pendiente), color: 'var(--warn)' },
            { label: 'Inscripciones', value: stats.clases, color: 'var(--accent2)' },
          ].map(s => (
            <div className="stat-card" key={s.label}>
              <div className="stat-value" style={{ color: s.color, fontSize: 22 }}>{s.value}</div>
              <div className="stat-label">{s.label}</div>
            </div>
          ))}
        </div>
      )}

      <div className="grid-2" style={{ gap: 20 }}>
        <div className="card">
          <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 16 }}>Por mes</h3>
          {porMes.length === 0 ? (
            <p style={{ color: 'var(--text2)', fontSize: 14 }}>Sin datos</p>
          ) : (
            <table className="table">
              <thead><tr><th>Mes</th><th>Programado</th><th>Cobrado</th><th>Pendiente</th></tr></thead>
              <tbody>
                {porMes.map(m => (
                  <tr key={m.mes}>
                    <td style={{ fontWeight: 500, textTransform: 'capitalize' }}>{m.mes}</td>
                    <td style={{ fontFamily: 'var(--mono)', fontSize: 13 }}>{fmt(m.programado)}</td>
                    <td style={{ fontFamily: 'var(--mono)', fontSize: 13, color: 'var(--accent)' }}>{fmt(m.cobrado)}</td>
                    <td style={{ fontFamily: 'var(--mono)', fontSize: 13, color: 'var(--warn)' }}>{fmt(m.pendiente)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="card">
          <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 16 }}>Por coach</h3>
          {porCoach.length === 0 ? (
            <p style={{ color: 'var(--text2)', fontSize: 14 }}>Sin datos</p>
          ) : (
            <table className="table">
              <thead><tr><th>Coach</th><th>Programado</th><th>Cobrado</th><th>Clases</th></tr></thead>
              <tbody>
                {porCoach.map(c => (
                  <tr key={c.nombre}>
                    <td style={{ fontWeight: 500 }}>{c.nombre}</td>
                    <td style={{ fontFamily: 'var(--mono)', fontSize: 13 }}>{fmt(c.programado)}</td>
                    <td style={{ fontFamily: 'var(--mono)', fontSize: 13, color: 'var(--accent)' }}>{fmt(c.cobrado)}</td>
                    <td style={{ fontFamily: 'var(--mono)', fontSize: 13 }}>{c.clases}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}
