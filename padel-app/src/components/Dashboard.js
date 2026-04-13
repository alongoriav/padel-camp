import { useState, useEffect } from 'react'
import { supabase } from '../supabase'

const MESES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre']

export default function Dashboard({ usuario }) {
  const [stats, setStats] = useState(null)
  const [porMes, setPorMes] = useState([])
  const [porCoach, setPorCoach] = useState([])
  const [mesActual] = useState(new Date().getMonth())

  useEffect(() => { fetchStats() }, [])

  const fetchStats = async () => {
    const { data: ins } = await supabase.from('inscripciones').select('*, clases(coach_id, coaches(nombre))')
    if (!ins) return

    const total = ins.reduce((a, i) => a + (i.monto_cobrado || 0), 0)
    const cobrado = ins.filter(i => i.pagado).reduce((a, i) => a + (i.monto_cobrado || 0), 0)
    const pendiente = ins.filter(i => !i.pagado).reduce((a, i) => a + (i.monto_cobrado || 0), 0)

    setStats({ total, cobrado, pendiente, clases: ins.length })

    // Por mes
    const mMap = {}
    ins.forEach(i => {
      const k = i.mes || 'Sin mes'
      if (!mMap[k]) mMap[k] = { mes: k, programado: 0, cobrado: 0, pendiente: 0 }
      mMap[k].programado += i.monto_cobrado || 0
      if (i.pagado) mMap[k].cobrado += i.monto_cobrado || 0
      else mMap[k].pendiente += i.monto_cobrado || 0
    })
    setPorMes(Object.values(mMap).slice(0, 6))

    // Por coach
    const cMap = {}
    ins.forEach(i => {
      const nombre = i.clases?.coaches?.nombre || 'Sin coach'
      if (!cMap[nombre]) cMap[nombre] = { nombre, programado: 0, cobrado: 0, clases: 0 }
      cMap[nombre].programado += i.monto_cobrado || 0
      if (i.pagado) cMap[nombre].cobrado += i.monto_cobrado || 0
      cMap[nombre].clases++
    })
    setPorCoach(Object.values(cMap))
  }

  const fmt = (n) => '$' + (n || 0).toLocaleString('es-MX')

  return (
    <div style={{ maxWidth: 900 }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700 }}>Resumen general</h1>
        <p style={{ color: 'var(--text2)', fontSize: 14, marginTop: 4 }}>Vista consolidada de tu academia</p>
      </div>

      {stats && (
        <div className="grid-2" style={{ gridTemplateColumns: 'repeat(4,1fr)', marginBottom: 28, gap: 14 }}>
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
            <p style={{ color: 'var(--text2)', fontSize: 14 }}>Sin datos aún</p>
          ) : (
            <table className="table">
              <thead><tr>
                <th>Mes</th><th>Programado</th><th>Cobrado</th><th>Pendiente</th>
              </tr></thead>
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
            <p style={{ color: 'var(--text2)', fontSize: 14 }}>Sin datos aún</p>
          ) : (
            <table className="table">
              <thead><tr>
                <th>Coach</th><th>Programado</th><th>Cobrado</th><th>Clases</th>
              </tr></thead>
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
