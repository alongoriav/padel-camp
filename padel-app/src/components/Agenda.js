import { useState, useEffect } from 'react'
import { supabase } from '../supabase'

const HORAS = ['06:00','07:00','08:00','09:00','10:00','11:00','12:00','13:00','14:00','15:00','16:00','17:00','18:00','19:00','20:00','21:00']
const DIAS_SEMANA = ['Lunes','Martes','Miércoles','Jueves','Viernes','Sábado','Domingo']

function getLunes(date) {
  const d = new Date(date)
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1)
  return new Date(d.setDate(diff))
}

function addDays(date, n) {
  const d = new Date(date)
  d.setDate(d.getDate() + n)
  return d
}

export default function Agenda({ usuario }) {
  const [semana, setSemana] = useState(getLunes(new Date()))
  const [clases, setClases] = useState([])
  const [coaches, setCoaches] = useState([])
  const [coachFilter, setCoachFilter] = useState('')
  const isAdmin = usuario?.rol === 'admin'

  useEffect(() => { fetchData() }, [semana, coachFilter])

  const fetchData = async () => {
    const lunes = semana.toISOString().split('T')[0]
    const domingo = addDays(semana, 6).toISOString().split('T')[0]

    const [{ data: cs }, { data: cl }] = await Promise.all([
      supabase.from('coaches').select('*').eq('activo', true).order('nombre'),
      supabase.from('clases')
        .select('*, coaches(nombre), inscripciones(*, jugadores(nombre))')
        .eq('activo', true)
        .or(`and(modalidad.eq.Semanal,fecha_inicio.lte.${domingo},fecha_fin.gte.${lunes}),and(modalidad.eq.Clase única,fecha_inicio.gte.${lunes},fecha_inicio.lte.${domingo})`)
    ])
    setCoaches(cs || [])
    let filtradas = cl || []
    if (!isAdmin && usuario?.coach_id) filtradas = filtradas.filter(c => c.coach_id === usuario.coach_id)
    if (coachFilter) filtradas = filtradas.filter(c => c.coach_id === coachFilter)
    setClases(filtradas)
  }

  const diasSemana = DIAS_SEMANA.map((d, i) => ({ nombre: d, fecha: addDays(semana, i) }))

  const getClasesEnSlot = (dia, hora) => {
    return clases.filter(c => {
      const horaClase = c.hora?.slice(0,5)
      if (horaClase !== hora) return false
      if (c.modalidad === 'Semanal') return c.dia === dia
      if (c.modalidad === 'Clase única') {
        const fechaClase = c.fecha_inicio
        const fechaDia = diasSemana.find(d => d.nombre === dia)?.fecha
        return fechaClase === fechaDia?.toISOString().split('T')[0]
      }
      return false
    })
  }

  const fmtFecha = (d) => d.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700 }}>Agenda semanal</h1>
          <p style={{ color: 'var(--text2)', fontSize: 14, marginTop: 4 }}>
            {fmtFecha(semana)} — {fmtFecha(addDays(semana, 6))}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          {isAdmin && (
            <select className="form-input" style={{ maxWidth: 180 }} value={coachFilter} onChange={e => setCoachFilter(e.target.value)}>
              <option value="">Todos los coaches</option>
              {coaches.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select>
          )}
          <button className="btn btn-secondary" onClick={() => setSemana(s => addDays(s, -7))}>← Anterior</button>
          <button className="btn btn-secondary" onClick={() => setSemana(getLunes(new Date()))}>Hoy</button>
          <button className="btn btn-secondary" onClick={() => setSemana(s => addDays(s, 7))}>Siguiente →</button>
        </div>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 700 }}>
          <thead>
            <tr>
              <th style={{ width: 70, padding: '8px 12px', textAlign: 'left', fontSize: 12, color: 'var(--text2)', fontWeight: 600, borderBottom: '1px solid var(--border)', background: 'var(--bg2)' }}>Hora</th>
              {diasSemana.map(d => {
                const esHoy = d.fecha.toDateString() === new Date().toDateString()
                return (
                  <th key={d.nombre} style={{ padding: '8px 10px', textAlign: 'center', fontSize: 12, fontWeight: 600, borderBottom: '1px solid var(--border)', background: esHoy ? 'rgba(0,229,160,.06)' : 'var(--bg2)', color: esHoy ? 'var(--accent)' : 'var(--text2)' }}>
                    <div>{d.nombre}</div>
                    <div style={{ fontWeight: 400, marginTop: 2 }}>{fmtFecha(d.fecha)}</div>
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {HORAS.map(hora => {
              const tieneAlgo = DIAS_SEMANA.some(d => getClasesEnSlot(d, hora).length > 0)
              return (
                <tr key={hora} style={{ opacity: tieneAlgo ? 1 : 0.4 }}>
                  <td style={{ padding: '6px 12px', fontSize: 12, color: 'var(--text2)', fontFamily: 'var(--mono)', borderBottom: '1px solid var(--border)', background: 'var(--bg2)', verticalAlign: 'top', paddingTop: 8 }}>{hora}</td>
                  {diasSemana.map(d => {
                    const slots = getClasesEnSlot(d.nombre, hora)
                    return (
                      <td key={d.nombre} style={{ padding: 4, borderBottom: '1px solid var(--border)', verticalAlign: 'top', minHeight: 40, background: d.fecha.toDateString() === new Date().toDateString() ? 'rgba(0,229,160,.03)' : 'transparent' }}>
                        {slots.map(c => {
                          const ins = c.inscripciones || []
                          const pagados = ins.filter(i => i.pagado).length
                          const todos = ins.length
                          return (
                            <div key={c.id} style={{
                              background: 'var(--bg3)', border: `1px solid ${c.tipo === 'Privada' ? 'rgba(0,102,255,.3)' : 'rgba(255,165,2,.3)'}`,
                              borderRadius: 6, padding: '5px 8px', marginBottom: 3, fontSize: 12
                            }}>
                              <div style={{ fontWeight: 600, color: 'var(--text)', marginBottom: 2 }}>{c.coaches?.nombre}</div>
                              {ins.map(i => (
                                <div key={i.id} style={{ color: i.pagado ? 'var(--accent)' : 'var(--danger)', fontSize: 11 }}>
                                  {i.pagado ? '✅' : '❌'} {i.jugadores?.nombre}
                                </div>
                              ))}
                              <div style={{ marginTop: 3, color: 'var(--text2)', fontSize: 10 }}>
                                {pagados}/{todos} pagados
                              </div>
                            </div>
                          )
                        })}
                      </td>
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
