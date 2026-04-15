import { useState, useEffect } from 'react'
import { supabase } from '../supabase'

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
  const [semana, setSemana] = useState(getLunes(new Date()))
  const [clases, setClases] = useState([])
  const [coaches, setCoaches] = useState([])
  const [jugadores, setJugadores] = useState([])
  const [coachFilter, setCoachFilter] = useState('')
  const [detalleClase, setDetalleClase] = useState(null)
  const [inscripcionesDetalle, setInscripcionesDetalle] = useState([])
  const [modalNueva, setModalNueva] = useState(false)
  const [formNueva, setFormNueva] = useState({})
  const [fechasNueva, setFechasNueva] = useState([])
  const [jugadoresClase, setJugadoresClase] = useState([])
  const [busqueda, setBusqueda] = useState('')
  const [busquedaDetalle, setBusquedaDetalle] = useState('')
  const [fechaEntradaDetalle, setFechaEntradaDetalle] = useState('')
  const [toast, setToast] = useState('')
  const [modalNuevoJugador, setModalNuevoJugador] = useState(false)
  const [nuevoJugadorNombre, setNuevoJugadorNombre] = useState('')
  const [nuevoJugadorDesde, setNuevoJugadorDesde] = useState('clase')
  const isAdmin = usuario?.rol === 'admin'

  useEffect(() => { fetchData() }, [semana, coachFilter])

  useEffect(() => {
    if (formNueva.modalidad === 'Semanal' && formNueva.dia && formNueva.fecha_inicio) {
      const fs = calcFechas(formNueva.dia, formNueva.fecha_inicio)
      setFechasNueva(fs)
      if (fs.length > 0) setFormNueva(f => ({ ...f, fecha_fin: fs[fs.length-1].toISOString().split('T')[0] }))
    }
  }, [formNueva.dia, formNueva.fecha_inicio, formNueva.modalidad])

  const fetchData = async () => {
    const lunes = semana.toISOString().split('T')[0]
    const domingo = addDays(semana, 6).toISOString().split('T')[0]
    const [{ data: cs }, { data: cl }, { data: js }] = await Promise.all([
      supabase.from('coaches').select('*').eq('activo', true).order('nombre'),
      supabase.from('clases').select('*, coaches(nombre), inscripciones(*, jugadores(nombre))').eq('activo', true)
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

  const crearYAgregarJugador = async () => {
    if (!nuevoJugadorNombre.trim()) return
    const nombre = nuevoJugadorNombre.trim().split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ')
    const { data } = await supabase.from('jugadores').insert({ nombre, activo: true }).select().single()
    if (!data) { showToast('Error al crear jugador'); return }
    const { data: js } = await supabase.from('jugadores').select('*').eq('activo', true).order('nombre')
    setJugadores(js || [])
    if (nuevoJugadorDesde === 'clase') {
      setJugadoresClase(prev => [...prev, { jugador_id: data.id, nombre: data.nombre, metodo: 'Efectivo', pagado: false }])
    } else if (detalleClase) {
      await agregarJugadorDetalle(data)
    }
    setNuevoJugadorNombre('')
    setModalNuevoJugador(false)
    showToast(`${nombre} creado y agregado ✓`)
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

  const abrirDetalle = async (c) => {
    setDetalleClase(c)
    const { data } = await supabase.from('inscripciones').select('*, jugadores(nombre), clases(fecha_inicio, clases_en_rango, modalidad, tipo)').eq('clase_id', c.id)
    setInscripcionesDetalle(data || [])
    setBusquedaDetalle('')
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
    setModalNueva(true)
  }

  const togglePago = async (ins) => {
    const ahora = new Date().toISOString().split('T')[0]
    const update = ins.pagado 
      ? { pagado: false, fecha_pago: null }
      : { pagado: true, fecha_pago: ahora }
    await supabase.from('inscripciones').update(update).eq('id', ins.id)
    const { data } = await supabase.from('inscripciones').select('*, jugadores(nombre)').eq('clase_id', detalleClase.id)
    setInscripcionesDetalle(data || [])
    fetchData()
  }

  const eliminarClase = async (claseId) => {
    if (!window.confirm('¿Eliminar esta clase y todas sus inscripciones? Esta acción no se puede deshacer.')) return
    await supabase.from('inscripciones').delete().eq('clase_id', claseId)
    await supabase.from('clases').delete().eq('id', claseId)
    setDetalleClase(null)
    showToast('Clase eliminada ✓')
    fetchData()
  }

  const agregarJugadorDetalle = async (j) => {
    const nuevosParticipantes = inscripcionesDetalle.length + 1
    const montoBase = calcMonto(detalleClase.modalidad, nuevosParticipantes, detalleClase.clases_en_rango || 1)
    const montoAnterior = calcMonto(detalleClase.modalidad, inscripcionesDetalle.length, detalleClase.clases_en_rango || 1)
    const saldoFavor = montoAnterior - montoBase
    const montoFinal = fechaEntradaDetalle && detalleClase.fecha_inicio
      ? calcMontoProporcional(montoBase, fechaEntradaDetalle, detalleClase.fecha_inicio, detalleClase.clases_en_rango || 1)
      : montoBase
    await supabase.from('inscripciones').insert({
      clase_id: detalleClase.id, jugador_id: j.id,
      metodo_pago: 'Pendiente', pagado: false,
      monto_cobrado: montoFinal,
      mes: inscripcionesDetalle[0]?.mes || MESES[new Date().getMonth()],
      anio: 2026,
      fecha_entrada: fechaEntradaDetalle || null,
    })
    setBusquedaDetalle('')
    setFechaEntradaDetalle('')
    const msg = saldoFavor > 0
      ? `${j.nombre} agregado ✓ · Saldo a favor existentes: $${saldoFavor.toLocaleString('es-MX')} c/u`
      : `${j.nombre} agregado ✓`
    showToast(msg)
    const { data } = await supabase.from('inscripciones').select('*, jugadores(nombre)').eq('clase_id', detalleClase.id)
    setInscripcionesDetalle(data || [])
    fetchData()
  }

  const busquedaTrimmed = busqueda.trim()
  const jugadoresFiltrados = jugadores.filter(j =>
    (busquedaTrimmed === '' || j.nombre.toLowerCase().includes(busquedaTrimmed.toLowerCase())) &&
    !jugadoresClase.find(jc => jc.jugador_id === j.id)
  )

  const busquedaDetalleTrimmed = busquedaDetalle.trim()
  const jugadoresDisponiblesDetalle = jugadores.filter(j =>
    (busquedaDetalleTrimmed === '' || j.nombre.toLowerCase().includes(busquedaDetalleTrimmed.toLowerCase())) &&
    !inscripcionesDetalle.find(i => i.jugador_id === j.id)
  )

  const participantes = jugadoresClase.length || 1
  const numClases = formNueva.modalidad === 'Semanal' ? fechasNueva.length : 1
  const montoPorJugador = calcMonto(formNueva.modalidad, participantes, numClases)

  const guardarNueva = async () => {
    if (!formNueva.coach_id || jugadoresClase.length === 0 || !formNueva.fecha_inicio) return
    const { data: claseData } = await supabase.from('clases').insert({
      coach_id: formNueva.coach_id, tipo: formNueva.tipo, modalidad: formNueva.modalidad,
      dia: (formNueva.modalidad === 'Semanal' || formNueva.modalidad === 'Promo') && formNueva.dia ? formNueva.dia : null,
      hora: formNueva.hora + ':00',
      fecha_inicio: formNueva.fecha_inicio,
      fecha_fin: formNueva.modalidad === 'Semanal' ? formNueva.fecha_fin : formNueva.fecha_inicio,
      // For Promo with dia, keep the dia so it shows on agenda weekly view
      activo: true,
    }).select().single()
    if (!claseData) { showToast('Error al guardar'); return }
    await supabase.from('inscripciones').insert(jugadoresClase.map(j => {
      const montoFinal = j._montoProporcional != null ? j._montoProporcional : montoPorJugador
      return {
        clase_id: claseData.id, jugador_id: j.jugador_id,
        metodo_pago: j.metodo, pagado: j.pagado,
        monto_cobrado: montoFinal, mes: formNueva.mes, anio: formNueva.anio,
        fecha_entrada: j.fecha_entrada || null,
      }
    }))
    showToast('Clase creada ✓')
    setModalNueva(false)
    fetchData()
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
                        onClick={() => slots.length === 0 && abrirNueva(d.nombre, hora, d.fecha)}
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
                              onClick={e => { e.stopPropagation(); abrirDetalle(c) }}
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
      {detalleClase && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setDetalleClase(null)}>
          <div className="modal" style={{ maxWidth: 560 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
              <div>
                <h2 style={{ fontSize: 18, fontWeight: 700 }}>{detalleClase.coaches?.nombre}</h2>
                <div style={{ display: 'flex', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
                  <span className={`badge ${detalleClase.tipo === 'Privada' ? 'badge-blue' : 'badge-yellow'}`}>{detalleClase.tipo}</span>
                  <span className={`badge ${detalleClase.modalidad === 'Semanal' ? 'badge-green' : 'badge-gray'}`}>{detalleClase.modalidad}</span>
                  {detalleClase.dia && <span style={{ fontSize: 13, color: 'var(--text2)' }}>📅 {detalleClase.dia}</span>}
                  <span style={{ fontSize: 13, color: 'var(--text2)', fontFamily: 'var(--mono)' }}>🕐 {detalleClase.hora?.slice(0,5)}</span>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-sm" onClick={() => eliminarClase(detalleClase.id)}
                  style={{ background: 'rgba(255,59,48,.15)', border: '1px solid rgba(255,59,48,.3)', color: 'var(--danger)', borderRadius: 8, padding: '6px 12px', cursor: 'pointer', fontSize: 13 }}>
                  🗑 Eliminar clase
                </button>
                <button className="btn btn-secondary btn-sm" onClick={() => setDetalleClase(null)}>Cerrar</button>
              </div>
            </div>

            <table className="table" style={{ marginBottom: 16 }}>
              <thead><tr><th>Jugador</th><th>Monto</th><th>Método</th><th>Pago</th></tr></thead>
              <tbody>
                {inscripcionesDetalle.map(i => (
                  <tr key={i.id}>
                    <td style={{ fontWeight: 500 }}>{i.jugadores?.nombre}</td>
                    <td style={{ fontFamily: 'var(--mono)', fontSize: 13 }}>${i.monto_cobrado?.toLocaleString('es-MX')}</td>
                    <td style={{ fontSize: 13 }}>{i.metodo_pago}</td>
                    <td>
                      <button onClick={() => togglePago(i)}
                        className={`badge ${i.pagado ? 'badge-green' : 'badge-red'}`}
                        style={{ border: 'none', cursor: 'pointer' }}>
                        {i.pagado ? '✅ Pagado' : '❌ Pendiente'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {isAdmin && (
              <div style={{ borderTop: '1px solid var(--border)', paddingTop: 14 }}>
                {detalleClase?.tipo === 'Compartida' && inscripcionesDetalle.length > 0 && (() => {
                  const montoActual = calcMonto(detalleClase.modalidad, inscripcionesDetalle.length, detalleClase.clases_en_rango || 1)
                  const montoConUno = calcMonto(detalleClase.modalidad, inscripcionesDetalle.length + 1, detalleClase.clases_en_rango || 1)
                  const saldo = montoActual - montoConUno
                  return saldo > 0 ? (
                    <div style={{ background: 'rgba(255,165,2,.08)', border: '1px solid rgba(255,165,2,.2)', borderRadius: 8, padding: '8px 12px', fontSize: 12, color: 'var(--warn)', marginBottom: 10 }}>
                      💡 Al agregar un jugador el precio baja a ${montoConUno.toLocaleString('es-MX')} c/u · Saldo a favor actuales: <strong>${saldo.toLocaleString('es-MX')} c/u</strong>
                    </div>
                  ) : null
                })()}
                {detalleClase?.tipo === 'Compartida' && (
                  <div style={{ marginBottom: 10 }}>
                    <label style={{ fontSize: 11, color: 'var(--text2)', display: 'block', marginBottom: 4 }}>
                      📅 Fecha de entrada del nuevo jugador <span style={{ fontStyle: 'italic' }}>(opcional — vacío = desde inicio)</span>
                    </label>
                    <input type="date" value={fechaEntradaDetalle}
                      onChange={e => setFechaEntradaDetalle(e.target.value)}
                      style={{ background: 'var(--bg3)', border: `1px solid ${fechaEntradaDetalle ? 'rgba(255,59,48,.5)' : 'var(--border)'}`, borderRadius: 8, padding: '7px 10px', fontSize: 13, color: 'var(--text)', width: '100%' }} />
                    {fechaEntradaDetalle && detalleClase?.fecha_inicio && (
                      <div style={{ marginTop: 6, background: 'rgba(255,165,2,.1)', border: '1px solid rgba(255,165,2,.3)', borderRadius: 8, padding: '6px 10px', fontSize: 12 }}>
                        <span style={{ color: 'var(--text2)' }}>Monto proporcional: </span>
                        <strong style={{ color: 'var(--warn)', fontFamily: 'var(--mono)' }}>
                          ${calcMontoProporcional(
                            calcMonto(detalleClase.modalidad, inscripcionesDetalle.length + 1, detalleClase.clases_en_rango || 1),
                            fechaEntradaDetalle, detalleClase.fecha_inicio, detalleClase.clases_en_rango || 1
                          ).toLocaleString('es-MX')}
                        </strong>
                      </div>
                    )}
                  </div>
                )}
                <label className="form-label" style={{ marginBottom: 8, display: 'block' }}>Agregar jugador al grupo</label>
                <div style={{ position: 'relative' }}>
                  <input className="form-input" placeholder="Buscar jugador..."
                    value={busquedaDetalle} onChange={e => setBusquedaDetalle(e.target.value)} />
                  {busquedaDetalle.length > 0 && jugadoresDisponiblesDetalle.length > 0 && (
                    <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 10, background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 8, maxHeight: 180, overflowY: 'auto', boxShadow: '0 8px 24px rgba(0,0,0,.4)' }}>
                      {jugadoresDisponiblesDetalle.slice(0, 6).map(j => (
                        <div key={j.id} onClick={() => agregarJugadorDetalle(j)}
                          style={{ padding: '10px 14px', cursor: 'pointer', fontSize: 14, borderBottom: '1px solid var(--border)' }}
                          onMouseEnter={e => e.currentTarget.style.background = 'var(--border)'}
                          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                          + {j.nombre}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal nueva clase desde agenda */}
      {modalNueva && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setModalNueva(false)}>
          <div className="modal" style={{ maxWidth: 560 }}>
            <h2 className="modal-title">Nueva clase — {formNueva.dia} {formNueva.hora}</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div className="grid-2">
                <div className="form-group">
                  <label className="form-label">Coach</label>
                  <select className="form-input" value={formNueva.coach_id} onChange={e => setFormNueva(f => ({ ...f, coach_id: e.target.value }))}>
                    {coaches.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Tipo</label>
                  <div style={{ display: 'flex', gap: 8 }}>
                    {TIPOS.map(t => (
                      <button key={t} onClick={() => setFormNueva(f => ({ ...f, tipo: t }))} style={{
                        flex: 1, padding: '9px', borderRadius: 8,
                        border: `1px solid ${formNueva.tipo === t ? 'var(--accent)' : 'var(--border)'}`,
                        background: formNueva.tipo === t ? 'rgba(0,229,160,.1)' : 'var(--bg3)',
                        color: formNueva.tipo === t ? 'var(--accent)' : 'var(--text2)',
                        fontSize: 13, fontWeight: 500, cursor: 'pointer'
                      }}>{t}</button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="grid-2">
                <div className="form-group">
                  <label className="form-label">Modalidad</label>
                  <select className="form-input" value={formNueva.modalidad} onChange={e => setFormNueva(f => ({ ...f, modalidad: e.target.value }))}>
                    {MODALIDADES.map(m => <option key={m}>{m}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Fecha inicio</label>
                  <input className="form-input" type="date" value={formNueva.fecha_inicio}
                    onChange={e => setFormNueva(f => ({ ...f, fecha_inicio: e.target.value }))} />
                </div>
              </div>

              {formNueva.modalidad === 'Semanal' && fechasNueva.length > 0 && (
                <div style={{ background: 'rgba(0,229,160,.06)', border: '1px solid rgba(0,229,160,.2)', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: 'var(--text2)' }}>
                  📅 {fechasNueva.length} clases: {fechasNueva.map(f => f.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })).join(' · ')}
                </div>
              )}

              <div className="form-group">
                <label className="form-label">Mes de cobro</label>
                <select className="form-input" value={formNueva.mes} onChange={e => setFormNueva(f => ({ ...f, mes: e.target.value }))}>
                  {MESES.map(m => <option key={m}>{m}</option>)}
                </select>
              </div>

              <div className="form-group">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <label className="form-label" style={{ margin: 0 }}>
                    Jugadores {jugadoresClase.length > 0 && <span style={{ color: 'var(--accent)' }}>({jugadoresClase.length})</span>}
                  </label>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button type="button" onClick={() => { setNuevoJugadorDesde('clase'); setModalNuevoJugador(true) }} style={{
                      background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 8,
                      padding: '5px 12px', cursor: 'pointer', fontSize: 13, color: 'var(--text2)'
                    }}>+ Nuevo</button>
                    <button type="button" onClick={() => setBusqueda(' ')} style={{
                      background: 'var(--accent)', border: 'none', borderRadius: 8,
                      padding: '5px 12px', cursor: 'pointer', fontSize: 13, fontWeight: 700, color: '#000'
                    }}>+ Agregar</button>
                  </div>
                </div>
                <div style={{ position: 'relative', marginBottom: 10 }}>
                  <input className="form-input" placeholder="Buscar jugador..."
                    value={busqueda} onChange={e => setBusqueda(e.target.value)}
                    />
                  {busqueda.length > 0 && jugadoresFiltrados.length > 0 && (
                    <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 10, background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 8, maxHeight: 180, overflowY: 'auto', boxShadow: '0 8px 24px rgba(0,0,0,.4)' }}>
                      {jugadoresFiltrados.slice(0, 6).map(j => (
                        <div key={j.id} onClick={() => { setJugadoresClase(prev => [...prev, { jugador_id: j.id, nombre: j.nombre, metodo: 'Efectivo', pagado: false }]); setBusqueda('') }}
                          style={{ padding: '10px 14px', cursor: 'pointer', fontSize: 14, borderBottom: '1px solid var(--border)' }}
                          onMouseEnter={e => e.currentTarget.style.background = 'var(--border)'}
                          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                          {j.nombre}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                {jugadoresClase.map(j => (
                  <div key={j.jugador_id} style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--bg3)', borderRadius: 8, padding: '8px 12px', marginBottom: 6, border: '1px solid var(--border)' }}>
                    <div style={{ fontWeight: 500, fontSize: 14, flex: 1 }}>{j.nombre}</div>
                    <select className="form-input" value={j.metodo} style={{ maxWidth: 130 }}
                      onChange={e => setJugadoresClase(prev => prev.map(x => x.jugador_id === j.jugador_id ? { ...x, metodo: e.target.value } : x))}>
                      {METODOS.map(m => <option key={m}>{m}</option>)}
                    </select>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 13, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                      <input type="checkbox" checked={j.pagado}
                        onChange={e => setJugadoresClase(prev => prev.map(x => x.jugador_id === j.jugador_id ? { ...x, pagado: e.target.checked } : x))} />
                      Pagado
                    </label>
                    {formNueva.tipo === 'Compartida' && (
                      <div style={{ position: 'relative' }}>
                        <button onClick={() => setJugadoresClase(prev => prev.map(x => x.jugador_id === j.jugador_id ? { ...x, _showCal: !x._showCal } : x))}
                          style={{ background: j.fecha_entrada ? 'rgba(255,59,48,.2)' : 'rgba(255,59,48,.1)', border: '1px solid rgba(255,59,48,.4)', borderRadius: 8, padding: '5px 8px', cursor: 'pointer', fontSize: 11, color: '#ff3b30', whiteSpace: 'nowrap', fontWeight: 600 }}>
                          📅 {j.fecha_entrada ? j.fecha_entrada : 'Fecha entrada'}
                        </button>
                        {j._showCal && (
                          <div style={{ position: 'absolute', right: 0, top: '110%', zIndex: 50, background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 12, padding: 14, boxShadow: '0 8px 32px rgba(0,0,0,.5)', minWidth: 260 }}>
                            <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 8 }}>¿Desde cuándo entra este jugador?</div>
                            <input type="date" value={j.fecha_entrada || ''}
                              onChange={e => {
                                const fecha = e.target.value
                                const montoBase = calcMonto(formNueva.modalidad, jugadoresClase.length, numClases)
                                const montoP = fecha && formNueva.fecha_inicio ? calcMontoProporcional(montoBase, fecha, formNueva.fecha_inicio, numClases) : montoBase
                                setJugadoresClase(prev => prev.map(x => x.jugador_id === j.jugador_id ? { ...x, fecha_entrada: fecha, _showCal: false, _montoProporcional: montoP } : x))
                              }}
                              style={{ width: '100%', background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 10px', fontSize: 14, color: 'var(--text)' }} />
                            {j.fecha_entrada && formNueva.fecha_inicio && (
                              <div style={{ marginTop: 10, background: 'rgba(255,165,2,.1)', border: '1px solid rgba(255,165,2,.3)', borderRadius: 8, padding: '8px 12px' }}>
                                <div style={{ fontSize: 11, color: 'var(--warn)', marginBottom: 2 }}>Monto proporcional:</div>
                                <div style={{ fontFamily: 'var(--mono)', fontSize: 18, fontWeight: 700, color: 'var(--warn)' }}>
                                  ${calcMontoProporcional(calcMonto(formNueva.modalidad, jugadoresClase.length, numClases), j.fecha_entrada, formNueva.fecha_inicio, numClases).toLocaleString('es-MX')}
                                </div>
                                <div style={{ fontSize: 10, color: 'var(--text2)', marginTop: 2 }}>vs ${calcMonto(formNueva.modalidad, jugadoresClase.length, numClases).toLocaleString('es-MX')} base</div>
                              </div>
                            )}
                            <button onClick={() => setJugadoresClase(prev => prev.map(x => x.jugador_id === j.jugador_id ? { ...x, fecha_entrada: '', _showCal: false, _montoProporcional: null } : x))}
                              style={{ marginTop: 8, width: '100%', background: 'transparent', border: '1px solid var(--border)', borderRadius: 8, padding: '6px', fontSize: 12, color: 'var(--text2)', cursor: 'pointer' }}>
                              Quitar fecha
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                    <button onClick={() => setJugadoresClase(prev => prev.filter(x => x.jugador_id !== j.jugador_id))}
                      style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer', fontSize: 16 }}>✕</button>
                  </div>
                ))}
              </div>

              {jugadoresClase.length > 0 && (
                <div style={{ background: 'rgba(0,229,160,.08)', border: '1px solid rgba(0,229,160,.2)', borderRadius: 8, padding: '12px 16px' }}>
                  {jugadoresClase.map(j => {
                    const monto = j._montoProporcional != null ? j._montoProporcional : montoPorJugador
                    const esProporcional = j._montoProporcional != null && j._montoProporcional !== montoPorJugador
                    return (
                      <div key={j.jugador_id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginTop: 3 }}>
                        <span style={{ color: 'var(--text2)' }}>{j.nombre} {j.fecha_entrada && <span style={{ color: 'var(--danger)', fontSize: 11 }}>desde {j.fecha_entrada}</span>}</span>
                        <span style={{ fontFamily: 'var(--mono)', color: esProporcional ? 'var(--warn)' : 'var(--accent)', fontWeight: 700, fontSize: 15 }}>
                          ${monto.toLocaleString('es-MX')}
                        </span>
                      </div>
                    )
                  })}
                  <div style={{ borderTop: '1px solid rgba(0,229,160,.2)', marginTop: 8, paddingTop: 8, display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text2)' }}>
                    <span>Precio base: ${montoPorJugador.toLocaleString('es-MX')}/jugador · {numClases} clase{numClases !== 1 ? 's' : ''}</span>
                    <span style={{ color: 'var(--accent)', fontWeight: 600 }}>Total: ${jugadoresClase.reduce((a, j) => a + (j._montoProporcional != null ? j._montoProporcional : montoPorJugador), 0).toLocaleString('es-MX')}</span>
                  </div>
                </div>
              )}

              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 4 }}>
                <button className="btn btn-secondary" onClick={() => setModalNueva(false)}>Cancelar</button>
                <button className="btn btn-primary" onClick={guardarNueva}
                  disabled={!formNueva.coach_id || jugadoresClase.length === 0}>
                  Crear clase
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {modalNuevoJugador && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setModalNuevoJugador(false)}>
          <div className="modal" style={{ maxWidth: 380 }}>
            <h2 className="modal-title">Nuevo jugador</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div className="form-group">
                <label className="form-label">Nombre completo</label>
                <input className="form-input" placeholder="Ej: Juan Pérez" value={nuevoJugadorNombre}
                  onChange={e => setNuevoJugadorNombre(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && crearYAgregarJugador()}
                  autoFocus />
              </div>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                <button className="btn btn-secondary" onClick={() => setModalNuevoJugador(false)}>Cancelar</button>
                <button className="btn btn-primary" onClick={crearYAgregarJugador} disabled={!nuevoJugadorNombre.trim()}>
                  Crear y agregar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {toast && <div className="toast"><span style={{ color: 'var(--accent)' }}>✓</span>{toast}</div>}
    </div>
  )
}
