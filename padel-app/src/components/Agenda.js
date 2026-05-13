import { useState, useEffect } from 'react'
import { supabase } from '../supabase'
import ModalClase from './ModalClase'

const HORAS = ['06:00','07:00','08:00','09:00','10:00','11:00','12:00','13:00','14:00','15:00','16:00','17:00','18:00','19:00','20:00','21:00']
const DIAS_SEMANA = ['Lunes','Martes','Miércoles','Jueves','Viernes','Sábado','Domingo']
const METODOS = ['Efectivo','Tarjeta','Transferencia','Check-in','Pendiente']
const MODALIDADES = ['Semanal','Clase única','Promo']
const TIPOS = ['Privada','Compartida']
const MESES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre']

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

function calcFechas(dia, fechaInicio) {
  if (!fechaInicio || !dia) return []
  const diaSemana = { Lunes:1, Martes:2, Miércoles:3, Jueves:4, Viernes:5, Sábado:6, Domingo:0 }[dia]
  const inicio = new Date(fechaInicio + 'T00:00:00')
  const year = inicio.getFullYear(), month = inicio.getMonth()
  const fechas = []
  for (let d = 1; d <= 31; d++) {
    const fecha = new Date(year, month, d)
    if (fecha.getMonth() !== month) break
    if (fecha.getDay() === diaSemana && fecha >= inicio) fechas.push(fecha)
  }
  return fechas
}

function calcMonto(modalidad, participantes, clases) {
  const precios = {
    1: { Semanal: 1000, 'Clase única': 1200 },
    2: { Semanal: 550, 'Clase única': 660 },
    3: { Semanal: 435, 'Clase única': 555 },
    4: { Semanal: 375, 'Clase única': 450 }
  }
  if (modalidad === 'Promo' || modalidad === 'Cortesía') return 0
  const p = Math.min(participantes, 4)
  if (modalidad === 'Semanal') return Math.round((precios[p]?.Semanal || 0) * 4 * clases / 4)
  return precios[p]?.['Clase única'] || 0
}

function calcMontoProporcional(montoBase, fechaEntrada, fechaInicio, clasesTotal) {
  if (!fechaEntrada || !fechaInicio || fechaEntrada <= fechaInicio) return montoBase
  const inicio = new Date(fechaInicio + 'T00:00:00')
  const entrada = new Date(fechaEntrada + 'T00:00:00')
  const fin = new Date(inicio)
  fin.setMonth(fin.getMonth() + 1)
  fin.setDate(0)
  const diasTotales = Math.round((fin - inicio) / (1000*60*60*24)) + 1
  const diasRestantes = Math.round((fin - entrada) / (1000*60*60*24)) + 1
  const proporcion = Math.min(1, Math.max(0, diasRestantes / diasTotales))
  return Math.round(montoBase * proporcion)
}

export default function Agenda({ usuario }) {
  const isAdmin = usuario?.rol === 'admin' || usuario?.rol === 'operador'
  const [semana, setSemana] = useState(getLunes(new Date()))
  const [clases, setClases] = useState([])
  const [coaches, setCoaches] = useState([])
  const [jugadores, setJugadores] = useState([])
  const [coachFilter, setCoachFilter] = useState('')
  const [modalClaseId, setModalClaseId] = useState(null)
  const [modalInitialForm, setModalInitialForm] = useState(null)
  const [toast, setToast] = useState('')

  const fetchData = async () => {
    const lunes = semana.toISOString().split('T')[0]
    const domingo = addDays(semana, 6).toISOString().split('T')[0]
    const [{ data: cs }, { data: cl }, { data: js }] = await Promise.all([
      supabase.from('coaches').select('*').eq('activo', true).order('nombre'),
      supabase.from('clases').select('*, coaches(nombre), inscripciones(*, jugadores(nombre))')
        .or(`and(modalidad.eq.Semanal,fecha_inicio.lte.${domingo},fecha_fin.gte.${lunes}),and(modalidad.eq.Promo,fecha_inicio.lte.${domingo},fecha_fin.gte.${lunes}),and(modalidad.eq.Cortesía,fecha_inicio.lte.${domingo},fecha_fin.gte.${lunes}),and(modalidad.eq.Clase única,fecha_inicio.gte.${lunes},fecha_inicio.lte.${domingo})`),
      supabase.from('jugadores').select('*').eq('activo', true).order('nombre'),
    ])
    setCoaches(cs || [])
    setJugadores(js || [])
    let filtradas = cl || []
    if (!isAdmin && usuario?.coach_id) filtradas = filtradas.filter(c => c.coach_id === usuario.coach_id)
    if (coachFilter) filtradas = filtradas.filter(c => c.coach_id === coachFilter)
    setClases(filtradas)
  }

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(''), 3000) }

  const diasSemana = DIAS_SEMANA.map((d, i) => ({ nombre: d, fecha: addDays(semana, i) }))

  const getClasesEnSlot = (dia, hora) => {
    return clases.filter(c => {
      const horaClase = c.hora?.slice(0,5)
      if (horaClase !== hora) return false
      if (c.modalidad === 'Semanal') return c.dia === dia
      if (c.modalidad === 'Promo' || c.modalidad === 'Cortesía') {
        // Si tiene día asignado usar día, sino usar fecha_inicio
        if (c.dia) return c.dia === dia
        const fechaDia = diasSemana.find(d => d.nombre === dia)?.fecha
        return c.fecha_inicio === fechaDia?.toISOString().split('T')[0]
      }
      if (c.modalidad === 'Clase única') {
        const fechaDia = diasSemana.find(d => d.nombre === dia)?.fecha
        return c.fecha_inicio === fechaDia?.toISOString().split('T')[0]
      }
      return false
    })
  }


  const abrirNueva = (dia, hora, fecha) => {
    if (!isAdmin) return
    const fechaStr = fecha.toISOString().split('T')[0]
    setFormNueva({
      coach_id: coaches[0]?.id || '',
      tipo: 'Privada', modalidad: 'Semanal',
      dia, hora, fecha_inicio: fechaStr, fecha_fin: '',
      mes: MESES[fecha.getMonth()], anio: fecha.getFullYear(),
    })
    setJugadoresClase([])
    setBusqueda('')
    setFechasNueva([])
    setModalClaseId('new')
  }






  const fmtFecha = (d) => d.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700 }}>Agenda semanal</h1>
          <p style={{ color: 'var(--text2)', fontSize: 14, marginTop: 4 }}>
            {fmtFecha(semana)} — {fmtFecha(addDays(semana, 6))}
            {isAdmin && <span style={{ marginLeft: 12, color: 'var(--accent)', fontSize: 12 }}>💡 Clic en clase para editar · Clic en slot vacío para crear</span>}
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
                <tr key={hora} style={{ opacity: tieneAlgo ? 1 : 0.5 }}>
                  <td style={{ padding: '6px 12px', fontSize: 12, color: 'var(--text2)', fontFamily: 'var(--mono)', borderBottom: '1px solid var(--border)', background: 'var(--bg2)', verticalAlign: 'top', paddingTop: 8 }}>{hora}</td>
                  {diasSemana.map(d => {
                    const slots = getClasesEnSlot(d.nombre, hora)
                    const esHoy = d.fecha.toDateString() === new Date().toDateString()
                    return (
                      <td key={d.nombre}
                        onClick={() => slots.length === 0 && isAdmin && (setModalClaseId('new'), setModalInitialForm({ dia: d.nombre, hora, fecha_inicio: d.fecha?.toISOString().split('T')[0] || '' }))}
                        style={{
                          padding: 4, borderBottom: '1px solid var(--border)', verticalAlign: 'top',
                          minHeight: 44, minWidth: 100,
                          background: esHoy ? 'rgba(0,229,160,.03)' : 'transparent',
                          cursor: slots.length === 0 && isAdmin ? 'pointer' : 'default',
                          transition: 'background .15s',
                        }}
                        onMouseEnter={e => { if (slots.length === 0 && isAdmin) e.currentTarget.style.background = 'rgba(0,229,160,.06)' }}
                        onMouseLeave={e => { e.currentTarget.style.background = esHoy ? 'rgba(0,229,160,.03)' : 'transparent' }}
                      >
                        {slots.length === 0 && isAdmin && (
                          <div style={{ height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0, transition: 'opacity .15s' }}
                            onMouseEnter={e => e.currentTarget.style.opacity = '1'}
                            onMouseLeave={e => e.currentTarget.style.opacity = '0'}>
                            <span style={{ fontSize: 18, color: 'var(--accent)' }}>+</span>
                          </div>
                        )}
                        {slots.map(c => {
                          const ins = c.inscripciones || []
                          const pagados = ins.filter(i => i.pagado).length
                          return (
                            <div key={c.id}
                              onClick={e => { e.stopPropagation(); setModalClaseId(c.id) }}
                              style={{
                                background: 'var(--bg3)',
                                border: `1px solid ${c.tipo === 'Privada' ? 'rgba(0,102,255,.4)' : 'rgba(255,165,2,.4)'}`,
                                borderRadius: 6, padding: '6px 8px', marginBottom: 3, fontSize: 12,
                                cursor: 'pointer', transition: 'all .15s',
                              }}
                              onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.02)'}
                              onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
                            >
                              <div style={{ fontWeight: 600, color: 'var(--text)', marginBottom: 2 }}>{c.coaches?.nombre}</div>
                              {ins.map(i => (
                                <div key={i.id} style={{ color: i.pagado ? 'var(--accent)' : 'var(--danger)', fontSize: 11 }}>
                                  {i.pagado ? '✅' : '❌'} {i.jugadores?.nombre}
                                </div>
                              ))}
                              <div style={{ marginTop: 3, color: 'var(--text2)', fontSize: 10 }}>
                                {pagados}/{ins.length} pagados
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

      {/* Modal detalle clase */}
      {modalClaseId && (
        <ModalClase
          claseId={modalClaseId === 'new' ? null : modalClaseId}
          initialForm={modalClaseId === 'new' ? modalInitialForm : null}
          coaches={coaches}
          jugadores={jugadores}
          inscripcionesList={[]}
          onClose={() => { setModalClaseId(null); setModalInitialForm(null) }}
          onSaved={() => fetchData()}
        />
      )}
    </div>
  )
}
