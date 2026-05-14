import { useState, useEffect } from 'react'
import { supabase } from '../supabase'

const HORAS = ['06:00','07:00','08:00','09:00','10:00','11:00','12:00','13:00','14:00','15:00','16:00','17:00','18:00','19:00','20:00','21:00']
const DIAS = ['Lunes','Martes','Miércoles','Jueves','Viernes','Sábado','Domingo']
const MODALIDADES = ['Semanal','Clase única']
const METODOS = ['Efectivo','Tarjeta','Transferencia','Check-in','Pendiente','Promo']
const MESES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre']
const MESES_IDX = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre']

const PRECIOS = {
  1: { Semanal: 1000, 'Clase única': 1200 },
  2: { Semanal: 550,  'Clase única': 660 },
  3: { Semanal: 435,  'Clase única': 555 },
  4: { Semanal: 375,  'Clase única': 450 },
}

function calcMonto(modalidad, participantes, numClases) {
  const n = Math.min(Math.max(participantes, 1), 4)
  const base = PRECIOS[n]?.[modalidad] || 0
  return base * numClases
}

function calcFechas(dia, fechaInicio) {
  if (!dia || !fechaInicio) return []
  const inicio = new Date(fechaInicio + 'T00:00:00')
  if (isNaN(inicio)) return []
  const diaSemana = { Lunes:1, Martes:2, Miércoles:3, Jueves:4, Viernes:5, Sábado:6, Domingo:0 }[dia]
  const year = inicio.getFullYear()
  const month = inicio.getMonth()
  const fechas = []
  const lastDay = new Date(year, month + 1, 0).getDate()
  for (let d = 1; d <= lastDay; d++) {
    const fecha = new Date(year, month, d)
    if (fecha.getDay() === diaSemana && fecha >= inicio) fechas.push(fecha)
  }
  return fechas
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

function calcComisionAuto(inscripcion, coaches, claseInfo) {
  const coachId = inscripcion.clases?.coach_id || claseInfo?.coach_id
  const coach = coaches?.find(c => c.id === coachId)
  if (!coach) return 0
  const esPromo = inscripcion.metodo_pago === 'Promo'
  if (!inscripcion.pagado && !esPromo) return 0
  const monto = inscripcion.monto_cobrado || 0
  let factorPromo = 1
  if (esPromo) {
    const mesIdx = MESES_IDX.indexOf((inscripcion.mes || '').toLowerCase())
    const anio = inscripcion.anio || 2026
    factorPromo = (anio > 2026 || (anio === 2026 && mesIdx >= 4)) ? 0.5 : 1
  }
  let comision = 0
  const tipo = inscripcion.clases?.tipo || claseInfo?.tipo
  if (coach.esquema_comision === 'Porcentaje') comision = Math.round(monto * (coach.porcentaje_comision || 0))
  else if (coach.esquema_comision === 'Bono') comision = coach.pago_extra_clase || 0
  else if (coach.esquema_comision === 'Mixto') {
    if (tipo === 'Privada') comision = Math.round(coach.tarifa_privada_fija || 0)
    else comision = Math.round(monto * (coach.porcentaje_comision || 0))
  }
  return Math.round(comision * (esPromo ? factorPromo : 1))
}

const emptyForm = {
  coach_id: '', tipo: 'Privada', modalidad: 'Semanal',
  dia: 'Lunes', hora: '09:00', fecha_inicio: '', fecha_fin: '',
  mes: MESES[new Date().getMonth()], anio: new Date().getFullYear(),
}

// ─── Main Modal Component ────────────────────────────────────────────────────
export default function ModalClase({ 
  claseId,        // null = nueva clase, uuid = editar clase existente
  initialForm,    // pre-filled form data (e.g. from clicking a slot in Agenda)
  onClose,        // called when modal closes
  onSaved,        // called after successful save
  coaches,
  jugadores: jugadoresList,
  inscripcionesList, // all inscripciones (for detail view)
}) {
  const [form, setForm] = useState(initialForm || emptyForm)
  const [jugadoresClase, setJugadoresClase] = useState([])
  const [insDetalle, setInsDetalle] = useState([])
  const [busqueda, setBusqueda] = useState('')
  const [busquedaDetalle, setBusquedaDetalle] = useState('')
  const [fechaEntradaDetalle, setFechaEntradaDetalle] = useState('')
  const [editandoHora, setEditandoHora] = useState(false)
  const [nuevaHora, setNuevaHora] = useState('')
  const [modalComision, setModalComision] = useState(null)
  const [comisionManual, setComisionManual] = useState('')
  const [montoManual, setMontoManual] = useState('')
  const [modalNuevoJugador, setModalNuevoJugador] = useState(false)
  const [nuevoJugadorNombre, setNuevoJugadorNombre] = useState('')
  const [nuevoJugadorDesde, setNuevoJugadorDesde] = useState('clase')
  const [toast, setToast] = useState('')
  const [jugadores, setJugadores] = useState(jugadoresList || [])
  const [loading, setLoading] = useState(false)
  const isEdit = !!claseId

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(''), 3000) }
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  useEffect(() => {
    setJugadores(jugadoresList || [])
  }, [jugadoresList])

  useEffect(() => {
    if (claseId) {
      // Load existing class data
      loadClaseData()
    } else if (initialForm) {
      setForm(f => ({ ...f, ...initialForm }))
    }
  }, [claseId])

  const loadClaseData = async () => {
    const { data: clase } = await supabase.from('clases').select('*').eq('id', claseId).single()
    if (!clase) return
    setForm({
      coach_id: clase.coach_id,
      tipo: clase.tipo,
      modalidad: clase.modalidad === 'Promo' ? 'Semanal' : clase.modalidad,
      dia: clase.dia || 'Lunes',
      hora: clase.hora?.slice(0,5) || '09:00',
      fecha_inicio: clase.fecha_inicio || '',
      fecha_fin: clase.fecha_fin || clase.fecha_inicio || '',
      mes: '',
      anio: new Date().getFullYear(),
    })
    const { data: ins } = await supabase.from('inscripciones')
      .select('*, jugadores(nombre), clases(coach_id, tipo, modalidad, clases_en_rango)')
      .eq('clase_id', claseId)
    if (ins?.length) {
      setInsDetalle(ins)
      setForm(f => ({ ...f, mes: ins[0]?.mes || MESES[new Date().getMonth()], anio: ins[0]?.anio || 2026 }))
      setJugadoresClase(ins.map(i => ({
        jugador_id: i.jugador_id,
        nombre: i.jugadores?.nombre || jugadores.find(j => j.id === i.jugador_id)?.nombre || '',
        metodo: i.metodo_pago || 'Efectivo',
        pagado: i.pagado || false,
        fecha_entrada: i.fecha_entrada || '',
        esPromo: i.metodo_pago === 'Promo',
        _insId: i.id,
      })))
    }
  }

  const fechas = form.modalidad === 'Semanal' ? calcFechas(form.dia, form.fecha_inicio) : (form.fecha_inicio ? [new Date(form.fecha_inicio + 'T00:00:00')] : [])
  const numClases = fechas.length || 1
  const participantes = jugadoresClase.length || 1
  const montoPorJugador = calcMonto(form.modalidad, participantes, numClases)

  const busquedaTrimmed = busqueda.trim()
  const jugadoresFiltrados = jugadores.filter(j =>
    (busquedaTrimmed === '' || j.nombre.toLowerCase().includes(busquedaTrimmed.toLowerCase())) &&
    !jugadoresClase.find(jc => jc.jugador_id === j.id)
  )
  const busquedaDetalleTrimmed = busquedaDetalle.trim()
  const jugadoresDisponiblesDetalle = jugadores.filter(j =>
    (busquedaDetalleTrimmed === '' || j.nombre.toLowerCase().includes(busquedaDetalleTrimmed.toLowerCase())) &&
    !insDetalle.find(i => i.jugador_id === j.id)
  )

  // ── Save new class ──
  const guardarClase = async () => {
    if (!form.coach_id || jugadoresClase.length === 0 || !form.fecha_inicio) return
    setLoading(true)
    const { data: claseData } = await supabase.from('clases').insert({
      coach_id: form.coach_id, tipo: form.tipo, modalidad: form.modalidad,
      dia: form.modalidad === 'Semanal' && form.dia ? form.dia : null,
      hora: form.hora + ':00',
      fecha_inicio: form.fecha_inicio,
      fecha_fin: form.modalidad === 'Semanal' ? (fechas[fechas.length-1]?.toISOString().split('T')[0] || form.fecha_inicio) : form.fecha_inicio,
      clases_en_rango: numClases,
    }).select().single()
    if (!claseData) { setLoading(false); return }
    await supabase.from('inscripciones').insert(jugadoresClase.map(j => {
      const montoFinal = j.esPromo ? 0 : (j._montoProporcional != null ? j._montoProporcional : montoPorJugador)
      return {
        clase_id: claseData.id, jugador_id: j.jugador_id,
        metodo_pago: j.esPromo ? 'Promo' : j.metodo,
        pagado: j.esPromo ? true : j.pagado,
        monto_cobrado: montoFinal, mes: form.mes, anio: form.anio,
        fecha_entrada: j.fecha_entrada || null,
      }
    }))
    setLoading(false)
    showToast('Clase registrada ✓')
    onSaved?.()
    onClose?.()
  }

  // ── Edit existing class ──
  const editarClase = async () => {
    if (!claseId) return
    setLoading(true)
    await supabase.from('clases').update({
      coach_id: form.coach_id, tipo: form.tipo, modalidad: form.modalidad,
      dia: form.modalidad === 'Semanal' && form.dia ? form.dia : null,
      hora: form.hora + ':00',
      fecha_inicio: form.fecha_inicio,
      fecha_fin: form.modalidad === 'Semanal' ? (fechas[fechas.length-1]?.toISOString().split('T')[0] || form.fecha_inicio) : form.fecha_inicio,
      clases_en_rango: numClases,
    }).eq('id', claseId)
    for (const j of jugadoresClase) {
      if (j.jugador_id) {
        await supabase.from('inscripciones').update({
          metodo_pago: j.esPromo ? 'Promo' : j.metodo,
          pagado: j.esPromo ? true : j.pagado,
          mes: form.mes, anio: form.anio,
          fecha_entrada: j.fecha_entrada || null,
        }).eq('clase_id', claseId).eq('jugador_id', j.jugador_id)
      }
    }
    setLoading(false)
    showToast('Clase actualizada ✓')
    onSaved?.()
    onClose?.()
  }

  // ── Detail actions ──
  const togglePago = async (ins) => {
    const nuevoPagado = !ins.pagado
    await supabase.from('inscripciones').update({
      pagado: nuevoPagado,
      fecha_pago: nuevoPagado ? new Date().toISOString().split('T')[0] : null
    }).eq('id', ins.id)
    loadClaseData()
  }

  const eliminarClase = async () => {
    if (!window.confirm('¿Eliminar esta clase y todas sus inscripciones?')) return
    await supabase.from('inscripciones').delete().eq('clase_id', claseId)
    await supabase.from('clases').delete().eq('id', claseId)
    showToast('Clase eliminada ✓')
    onSaved?.()
    onClose?.()
  }

  const guardarHora = async () => {
    if (!nuevaHora || !claseId) return
    await supabase.from('clases').update({ hora: nuevaHora + ':00' }).eq('id', claseId)
    setForm(f => ({ ...f, hora: nuevaHora }))
    setEditandoHora(false)
    showToast('Horario actualizado ✓')
    onSaved?.()
  }

  const guardarComisionManual = async () => {
    if (!modalComision) return
    const valorCom = parseFloat(comisionManual)
    const valorMonto = parseFloat(montoManual)
    if (isNaN(valorCom)) return
    const payload = { comision_override: valorCom }
    if (!isNaN(valorMonto)) payload.monto_cobrado = valorMonto
    await supabase.from('inscripciones').update(payload).eq('id', modalComision.inscripcion.id)
    setModalComision(null)
    showToast('Datos guardados ✓')
    loadClaseData()
    onSaved?.()
  }

  const quitarComisionManual = async (inscripcionId) => {
    await supabase.from('inscripciones').update({ comision_override: null }).eq('id', inscripcionId)
    showToast('Comisión restaurada ✓')
    loadClaseData()
    onSaved?.()
  }

  const agregarJugadorDetalle = async (j) => {
    const nuevosParticipantes = insDetalle.length + 1
    const montoBase = calcMonto(form.modalidad, nuevosParticipantes, numClases)
    const montoAnterior = calcMonto(form.modalidad, insDetalle.length, numClases)
    const saldoFavor = montoAnterior - montoBase
    const montoFinal = fechaEntradaDetalle && form.fecha_inicio
      ? calcMontoProporcional(montoBase, fechaEntradaDetalle, form.fecha_inicio, numClases)
      : montoBase
    await supabase.from('inscripciones').insert({
      clase_id: claseId, jugador_id: j.id,
      metodo_pago: 'Pendiente', pagado: false,
      monto_cobrado: montoFinal,
      mes: insDetalle[0]?.mes || MESES[new Date().getMonth()],
      anio: insDetalle[0]?.anio || 2026,
      fecha_entrada: fechaEntradaDetalle || null,
    })
    setBusquedaDetalle('')
    setFechaEntradaDetalle('')
    const msg = saldoFavor > 0
      ? `${j.nombre} agregado ✓ · Saldo a favor actuales: $${saldoFavor.toLocaleString('es-MX')} c/u`
      : `${j.nombre} agregado ✓`
    showToast(msg)
    loadClaseData()
    onSaved?.()
  }

  const crearYAgregarJugador = async () => {
    if (!nuevoJugadorNombre.trim()) return
    const nombre = nuevoJugadorNombre.trim().split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ')
    const { data } = await supabase.from('jugadores').insert({ nombre, activo: true }).select().single()
    if (!data) { showToast('Error al crear jugador'); return }
    const { data: js } = await supabase.from('jugadores').select('*').eq('activo', true).order('nombre')
    setJugadores(js || [])
    if (nuevoJugadorDesde === 'clase') {
      setJugadoresClase(prev => [...prev, { jugador_id: data.id, nombre: data.nombre, metodo: 'Efectivo', pagado: false, fecha_entrada: '' }])
    } else {
      await agregarJugadorDetalle(data)
    }
    setNuevoJugadorNombre('')
    setModalNuevoJugador(false)
    showToast(`${nombre} creado y agregado ✓`)
  }

  const coachSeleccionado = coaches?.find(c => c.id === form.coach_id)

  // ─── RENDER ────────────────────────────────────────────────────────────────
  return (
    <>
      <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose?.()}>
        <div className="modal" style={{ maxWidth: 560, maxHeight: '90vh', overflowY: 'auto' }}>

          {/* ── Header ── */}
          {isEdit ? (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                <div>
                  <h2 style={{ fontSize: 20, fontWeight: 700 }}>{coachSeleccionado?.nombre || '—'}</h2>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 6, flexWrap: 'wrap' }}>
                    <span className={`badge ${form.tipo === 'Compartida' ? 'badge-orange' : 'badge-blue'}`}>{form.tipo}</span>
                    <span className={`badge ${form.modalidad === 'Semanal' ? 'badge-green' : 'badge-gray'}`}>{form.modalidad}</span>
                    {form.dia && <span style={{ fontSize: 13, color: 'var(--text2)' }}>📅 {form.dia}</span>}
                    {editandoHora ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <select className="form-input" value={nuevaHora} onChange={e => setNuevaHora(e.target.value)}
                          style={{ padding: '3px 8px', fontSize: 13, maxWidth: 100 }}>
                          {HORAS.map(h => <option key={h} value={h}>{h}</option>)}
                        </select>
                        <button onClick={guardarHora} style={{ background: 'var(--accent)', border: 'none', borderRadius: 6, padding: '3px 8px', fontSize: 12, cursor: 'pointer', color: '#000', fontWeight: 700 }}>✓</button>
                        <button onClick={() => setEditandoHora(false)} style={{ background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 6, padding: '3px 8px', fontSize: 12, cursor: 'pointer', color: 'var(--text2)' }}>✕</button>
                      </div>
                    ) : (
                      <span onClick={() => { setNuevaHora(form.hora || '09:00'); setEditandoHora(true) }}
                        style={{ fontSize: 13, color: form.hora === '00:00' ? 'var(--danger)' : 'var(--text2)', fontFamily: 'var(--mono)', cursor: 'pointer', textDecoration: 'underline dotted' }}
                        title="Clic para editar">
                        🕐 {form.hora} {form.hora === '00:00' && '⚠️'}
                      </span>
                    )}
                    <span style={{ fontSize: 13, color: 'var(--text2)' }}>{form.fecha_inicio}</span>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                  <button onClick={eliminarClase}
                    style={{ background: 'rgba(255,59,48,.15)', border: '1px solid rgba(255,59,48,.3)', color: 'var(--danger)', borderRadius: 8, padding: '6px 12px', cursor: 'pointer', fontSize: 13 }}>
                    🗑 Eliminar
                  </button>
                  <button className="btn btn-secondary btn-sm" onClick={onClose}>Cerrar</button>
                </div>
              </div>

              {/* Saldo a favor info */}
              {form.tipo === 'Compartida' && insDetalle.length > 0 && (() => {
                const montoActual = calcMonto(form.modalidad, insDetalle.length, numClases)
                const montoConUno = calcMonto(form.modalidad, insDetalle.length + 1, numClases)
                const saldo = montoActual - montoConUno
                return saldo > 0 ? (
                  <div style={{ background: 'rgba(255,165,2,.08)', border: '1px solid rgba(255,165,2,.2)', borderRadius: 8, padding: '8px 12px', fontSize: 12, color: 'var(--warn)', marginBottom: 10 }}>
                    💡 Al agregar un jugador el precio baja a ${montoConUno.toLocaleString('es-MX')} c/u · Saldo a favor actuales: <strong>${saldo.toLocaleString('es-MX')} c/u</strong>
                  </div>
                ) : null
              })()}

              {/* Detail table */}
              <table className="table" style={{ marginBottom: 16, fontSize: 14 }}>
                <thead><tr><th>Jugador</th><th>Monto</th><th>Método</th><th>Pago</th><th>Comisión</th></tr></thead>
                <tbody>
                  {insDetalle.map(i => (
                    <tr key={i.id}>
                      <td style={{ fontWeight: 600 }}>
                        {i.jugadores?.nombre}
                        {i.fecha_entrada && <div style={{ fontSize: 10, color: 'var(--warn)' }}>Desde {i.fecha_entrada}</div>}
                        {i.metodo_pago === 'Promo' && <div style={{ fontSize: 10, color: 'var(--warn)' }}>🎁 Promo</div>}
                      </td>
                      <td style={{ fontFamily: 'var(--mono)', fontSize: 14 }}>${i.monto_cobrado?.toLocaleString('es-MX')}</td>
                      <td style={{ fontSize: 13 }}>{i.metodo_pago}</td>
                      <td>
                        <button onClick={() => togglePago(i)}
                          className={`badge ${i.pagado ? 'badge-green' : 'badge-red'}`}
                          style={{ border: 'none', cursor: 'pointer' }}>
                          {i.pagado ? '✅ Pagado' : '❌ Pendiente'}
                        </button>
                      </td>
                      <td>
                        {(() => {
                          const comAuto = calcComisionAuto(i, coaches, { coach_id: form.coach_id, tipo: form.tipo })
                          const comFinal = i.comision_override != null ? i.comision_override : comAuto
                          const esManual = i.comision_override != null
                          return (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                              <span style={{ fontFamily: 'var(--mono)', fontSize: 13, color: esManual ? 'var(--warn)' : 'var(--text2)', fontWeight: esManual ? 700 : 400 }}>
                                ${comFinal.toLocaleString('es-MX')}{esManual ? ' ✏️' : ''}
                              </span>
                              <button onClick={() => { setComisionManual(String(comFinal)); setMontoManual(String(i.monto_cobrado || 0)); setModalComision({ inscripcion: i, comisionAuto: comAuto }) }}
                                style={{ background: 'rgba(255,165,2,.15)', border: '1px solid rgba(255,165,2,.3)', borderRadius: 6, padding: '3px 8px', cursor: 'pointer', fontSize: 11, color: 'var(--warn)', whiteSpace: 'nowrap', fontWeight: 600 }}>
                                ✏️ Personalizar
                              </button>
                              {esManual && (
                                <button onClick={() => quitarComisionManual(i.id)} title="Restaurar automático"
                                  style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, color: 'var(--text2)' }}>↩</button>
                              )}
                            </div>
                          )
                        })()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Add player to existing class */}
              <div style={{ borderTop: '1px solid var(--border)', paddingTop: 14 }}>
                {form.tipo === 'Compartida' && (
                  <div style={{ marginBottom: 10 }}>
                    <label style={{ fontSize: 11, color: 'var(--text2)', display: 'block', marginBottom: 4 }}>
                      📅 Fecha de entrada <span style={{ fontStyle: 'italic' }}>(opcional)</span>
                    </label>
                    <input type="date" value={fechaEntradaDetalle} onChange={e => setFechaEntradaDetalle(e.target.value)}
                      style={{ background: 'var(--bg3)', border: `1px solid ${fechaEntradaDetalle ? 'rgba(255,59,48,.5)' : 'var(--border)'}`, borderRadius: 8, padding: '7px 10px', fontSize: 13, color: 'var(--text)', width: '100%' }} />
                    {fechaEntradaDetalle && form.fecha_inicio && (
                      <div style={{ marginTop: 6, background: 'rgba(255,165,2,.1)', border: '1px solid rgba(255,165,2,.3)', borderRadius: 8, padding: '6px 10px', fontSize: 12 }}>
                        <span style={{ color: 'var(--text2)' }}>Monto proporcional: </span>
                        <strong style={{ color: 'var(--warn)', fontFamily: 'var(--mono)' }}>
                          ${calcMontoProporcional(calcMonto(form.modalidad, insDetalle.length + 1, numClases), fechaEntradaDetalle, form.fecha_inicio, numClases).toLocaleString('es-MX')}
                        </strong>
                      </div>
                    )}
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <label className="form-label" style={{ margin: 0 }}>Agregar jugador al grupo</label>
                  <button type="button" onClick={() => { setNuevoJugadorDesde('detalle'); setModalNuevoJugador(true) }}
                    style={{ background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 8, padding: '4px 10px', cursor: 'pointer', fontSize: 12, color: 'var(--text2)' }}>
                    + Jugador nuevo
                  </button>
                </div>
                <div style={{ position: 'relative' }}>
                  <input className="form-input" placeholder="Buscar jugador..." value={busquedaDetalle}
                    onChange={e => setBusquedaDetalle(e.target.value)} />
                  {busquedaDetalle.length > 0 && jugadoresDisponiblesDetalle.length > 0 && (
                    <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 8, zIndex: 10, maxHeight: 200, overflowY: 'auto' }}>
                      {jugadoresDisponiblesDetalle.slice(0, 6).map(j => (
                        <div key={j.id} onMouseDown={e => { e.preventDefault(); agregarJugadorDetalle(j) }}
                          style={{ padding: '8px 12px', cursor: 'pointer', fontSize: 14 }}
                          onMouseEnter={e => e.target.style.background = 'var(--bg2)'}
                          onMouseLeave={e => e.target.style.background = 'transparent'}>
                          {j.nombre}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Edit class button */}
              <div style={{ marginTop: 14, display: 'flex', justifyContent: 'flex-end' }}>
                <button onClick={() => {
                  // Switch to edit form mode
                  setInsDetalle([])
                }} style={{ background: 'rgba(0,229,160,.1)', border: '1px solid rgba(0,229,160,.3)', color: 'var(--accent)', borderRadius: 8, padding: '7px 14px', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
                  ✏️ Editar datos de la clase
                </button>
              </div>
            </div>
          ) : (
            // ── NEW CLASS FORM ──
            <div>
              <h2 className="modal-title">{isEdit ? '✏️ Editar clase' : 'Nueva clase'}</h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

                {/* Coach + Tipo */}
                <div className="grid-2">
                  <div className="form-group">
                    <label className="form-label">Coach</label>
                    <select className="form-input" value={form.coach_id} onChange={e => set('coach_id', e.target.value)}>
                      <option value="">Seleccionar...</option>
                      {coaches?.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Tipo</label>
                    <div style={{ display: 'flex', gap: 8 }}>
                      {['Privada','Compartida'].map(t => (
                        <button key={t} type="button" onClick={() => set('tipo', t)}
                          className={`btn btn-sm ${form.tipo === t ? 'btn-primary' : 'btn-secondary'}`}
                          style={{ flex: 1 }}>{t}</button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Modalidad + Hora */}
                <div className="grid-2">
                  <div className="form-group">
                    <label className="form-label">Modalidad</label>
                    <select className="form-input" value={form.modalidad} onChange={e => set('modalidad', e.target.value)}>
                      {MODALIDADES.map(m => <option key={m}>{m}</option>)}
                    </select>
                    {form.tipo === 'Compartida' && (
                      <p style={{ fontSize: 11, color: 'var(--text2)', marginTop: 4 }}>💡 Para promo individual usa 🎁 por jugador</p>
                    )}
                  </div>
                  <div className="form-group">
                    <label className="form-label">Hora</label>
                    <select className="form-input" value={form.hora} onChange={e => set('hora', e.target.value)}>
                      {HORAS.map(h => <option key={h}>{h}</option>)}
                    </select>
                  </div>
                </div>

                {/* Día + Fecha */}
                {form.modalidad === 'Semanal' ? (
                  <div className="grid-2">
                    <div className="form-group">
                      <label className="form-label">Día</label>
                      <select className="form-input" value={form.dia} onChange={e => set('dia', e.target.value)}>
                        {DIAS.map(d => <option key={d}>{d}</option>)}
                      </select>
                    </div>
                    <div className="form-group">
                      <label className="form-label">Fecha inicio</label>
                      <input className="form-input" type="date" value={form.fecha_inicio}
                        onChange={e => set('fecha_inicio', e.target.value)} />
                    </div>
                  </div>
                ) : (
                  <div className="form-group">
                    <label className="form-label">Fecha</label>
                    <input className="form-input" type="date" value={form.fecha_inicio}
                      onChange={e => set('fecha_inicio', e.target.value)} />
                  </div>
                )}

                {/* Fechas preview */}
                {form.modalidad === 'Semanal' && fechas.length > 0 && (
                  <div style={{ background: 'rgba(0,229,160,.06)', border: '1px solid rgba(0,229,160,.2)', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: 'var(--text2)' }}>
                    📅 {fechas.length} clases: {fechas.map(f => f.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })).join(' · ')}
                  </div>
                )}

                {/* Mes cobro */}
                <div className="form-group">
                  <label className="form-label">Mes de cobro</label>
                  <select className="form-input" value={form.mes} onChange={e => set('mes', e.target.value)}
                    style={{ textTransform: 'capitalize' }}>
                    {MESES.map(m => <option key={m} value={m} style={{ textTransform: 'capitalize' }}>{m}</option>)}
                  </select>
                </div>

                {/* Jugadores */}
                <div className="form-group">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <label className="form-label" style={{ margin: 0 }}>
                      Jugadores {jugadoresClase.length > 0 && <span style={{ color: 'var(--accent)' }}>({jugadoresClase.length})</span>}
                    </label>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button type="button" onClick={() => { setNuevoJugadorDesde('clase'); setModalNuevoJugador(true) }}
                        style={{ background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 8, padding: '5px 12px', cursor: 'pointer', fontSize: 13, color: 'var(--text2)' }}>
                        + Nuevo
                      </button>
                      <button type="button" onClick={() => setBusqueda(' ')}
                        style={{ background: 'var(--accent)', border: 'none', borderRadius: 8, padding: '5px 12px', cursor: 'pointer', fontSize: 13, fontWeight: 700, color: '#000' }}>
                        + Agregar
                      </button>
                    </div>
                  </div>

                  <div style={{ position: 'relative', marginBottom: 10 }}>
                    <input className="form-input" placeholder="Buscar jugador..." value={busqueda}
                      onChange={e => setBusqueda(e.target.value)} />
                    {busqueda.length > 0 && jugadoresFiltrados.length > 0 && (
                      <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 8, zIndex: 10, maxHeight: 200, overflowY: 'auto' }}>
                        {jugadoresFiltrados.slice(0, 6).map(j => (
                          <div key={j.id} onMouseDown={e => { e.preventDefault(); setJugadoresClase(prev => [...prev, { jugador_id: j.id, nombre: j.nombre, metodo: 'Efectivo', pagado: false, fecha_entrada: '' }]); setBusqueda('') }}
                            style={{ padding: '8px 12px', cursor: 'pointer', fontSize: 14 }}
                            onMouseEnter={e => e.target.style.background = 'var(--bg2)'}
                            onMouseLeave={e => e.target.style.background = 'transparent'}>
                            {j.nombre}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {jugadoresClase.map(j => (
                    <div key={j.jugador_id} style={{ display: 'flex', alignItems: 'center', gap: 8, background: j.esPromo ? 'rgba(255,165,2,.08)' : 'var(--bg3)', borderRadius: 8, padding: '8px 12px', marginBottom: 6, border: `1px solid ${j.esPromo ? 'rgba(255,165,2,.3)' : 'var(--border)'}` }}>
                      <div style={{ fontWeight: 500, fontSize: 14, flex: 1 }}>
                        {j.nombre}
                        {j.esPromo && <span style={{ marginLeft: 6, fontSize: 11, background: 'rgba(255,165,2,.2)', color: 'var(--warn)', borderRadius: 4, padding: '1px 6px' }}>PROMO</span>}
                      </div>
                      {form.tipo === 'Compartida' && (
                        <button type="button" onClick={() => setJugadoresClase(prev => prev.map(x => x.jugador_id === j.jugador_id ? { ...x, esPromo: !x.esPromo, metodo: !x.esPromo ? 'Promo' : 'Efectivo', pagado: !x.esPromo ? true : false } : x))}
                          style={{ background: j.esPromo ? 'rgba(255,165,2,.2)' : 'var(--bg2)', border: `1px solid ${j.esPromo ? 'var(--warn)' : 'var(--border)'}`, borderRadius: 6, padding: '4px 10px', cursor: 'pointer', fontSize: 11, color: j.esPromo ? 'var(--warn)' : 'var(--text2)', fontWeight: j.esPromo ? 700 : 400 }}>
                          🎁 {j.esPromo ? 'Es Promo' : 'Dar Promo'}
                        </button>
                      )}
                      {!j.esPromo && (
                        <select className="form-input" value={j.metodo} style={{ maxWidth: 130 }}
                          onChange={e => setJugadoresClase(prev => prev.map(x => x.jugador_id === j.jugador_id ? { ...x, metodo: e.target.value } : x))}>
                          {METODOS.map(m => <option key={m}>{m}</option>)}
                        </select>
                      )}
                      {!j.esPromo && (
                        <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 13, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                          <input type="checkbox" checked={j.pagado}
                            onChange={e => setJugadoresClase(prev => prev.map(x => x.jugador_id === j.jugador_id ? { ...x, pagado: e.target.checked } : x))} />
                          Pagado
                        </label>
                      )}
                      {form.tipo === 'Compartida' && (
                        <div style={{ position: 'relative' }}>
                          <button onClick={() => setJugadoresClase(prev => prev.map(x => x.jugador_id === j.jugador_id ? { ...x, _showCal: !x._showCal } : x))}
                            style={{ background: j.fecha_entrada ? 'rgba(255,59,48,.2)' : 'rgba(255,59,48,.1)', border: '1px solid rgba(255,59,48,.4)', borderRadius: 8, padding: '5px 8px', cursor: 'pointer', fontSize: 11, color: '#ff3b30', whiteSpace: 'nowrap', fontWeight: 600 }}>
                            📅 {j.fecha_entrada ? j.fecha_entrada : 'Fecha entrada'}
                          </button>
                          {j._showCal && (
                            <div style={{ position: 'absolute', right: 0, top: '110%', zIndex: 50, background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 12, padding: 14, boxShadow: '0 8px 32px rgba(0,0,0,.5)', minWidth: 260 }}>
                              <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 8 }}>¿Desde cuándo entra?</div>
                              <input type="date" value={j.fecha_entrada || ''}
                                onChange={e => {
                                  const fecha = e.target.value
                                  const montoBase = calcMonto(form.modalidad, jugadoresClase.length, numClases)
                                  const montoP = fecha && form.fecha_inicio ? calcMontoProporcional(montoBase, fecha, form.fecha_inicio, numClases) : montoBase
                                  setJugadoresClase(prev => prev.map(x => x.jugador_id === j.jugador_id ? { ...x, fecha_entrada: fecha, _showCal: false, _montoProporcional: montoP } : x))
                                }}
                                style={{ width: '100%', background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 10px', fontSize: 14, color: 'var(--text)' }} />
                              {j.fecha_entrada && form.fecha_inicio && (
                                <div style={{ marginTop: 10, background: 'rgba(255,165,2,.1)', border: '1px solid rgba(255,165,2,.3)', borderRadius: 8, padding: '8px 12px' }}>
                                  <div style={{ fontSize: 11, color: 'var(--warn)', marginBottom: 2 }}>Monto proporcional:</div>
                                  <div style={{ fontFamily: 'var(--mono)', fontSize: 18, fontWeight: 700, color: 'var(--warn)' }}>
                                    ${calcMontoProporcional(calcMonto(form.modalidad, jugadoresClase.length, numClases), j.fecha_entrada, form.fecha_inicio, numClases).toLocaleString('es-MX')}
                                  </div>
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

                {/* Monto summary */}
                {jugadoresClase.length > 0 && (
                  <div style={{ background: 'rgba(0,229,160,.08)', border: '1px solid rgba(0,229,160,.2)', borderRadius: 8, padding: '12px 16px' }}>
                    {jugadoresClase.map(j => {
                      const monto = j.esPromo ? 0 : (j._montoProporcional != null ? j._montoProporcional : montoPorJugador)
                      const esProporcional = !j.esPromo && j._montoProporcional != null && j._montoProporcional !== montoPorJugador
                      return (
                        <div key={j.jugador_id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginTop: 3 }}>
                          <span style={{ color: 'var(--text2)' }}>
                            {j.nombre}
                            {j.esPromo && <span style={{ marginLeft: 6, fontSize: 11, color: 'var(--warn)' }}>🎁 Promo</span>}
                            {j.fecha_entrada && <span style={{ color: 'var(--danger)', fontSize: 11, marginLeft: 4 }}>desde {j.fecha_entrada}</span>}
                          </span>
                          <span style={{ fontFamily: 'var(--mono)', color: j.esPromo ? 'var(--warn)' : esProporcional ? 'var(--warn)' : 'var(--accent)', fontWeight: 700, fontSize: 15 }}>
                            {j.esPromo ? 'PROMO' : `$${monto.toLocaleString('es-MX')}`}
                          </span>
                        </div>
                      )
                    })}
                    <div style={{ borderTop: '1px solid rgba(0,229,160,.2)', marginTop: 8, paddingTop: 8, display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text2)' }}>
                      <span>${montoPorJugador.toLocaleString('es-MX')}/jugador · {numClases} clase{numClases !== 1 ? 's' : ''}</span>
                      <span style={{ color: 'var(--accent)', fontWeight: 600 }}>
                        Total: ${jugadoresClase.filter(j => !j.esPromo).reduce((a, j) => a + (j._montoProporcional != null ? j._montoProporcional : montoPorJugador), 0).toLocaleString('es-MX')}
                      </span>
                    </div>
                  </div>
                )}

                {/* Actions */}
                <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                  <button className="btn btn-secondary" onClick={onClose}>Cancelar</button>
                  <button className="btn btn-primary"
                    onClick={isEdit ? editarClase : guardarClase}
                    disabled={loading || !form.coach_id || jugadoresClase.length === 0 || !form.fecha_inicio}>
                    {loading ? 'Guardando...' : isEdit ? '💾 Guardar cambios' : 'Registrar clase'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Modal nuevo jugador */}
      {modalNuevoJugador && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setModalNuevoJugador(false)}>
          <div className="modal" style={{ maxWidth: 380 }}>
            <h2 className="modal-title">Nuevo jugador</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div className="form-group">
                <label className="form-label">Nombre completo</label>
                <input className="form-input" placeholder="Ej: Juan Pérez" value={nuevoJugadorNombre}
                  onChange={e => setNuevoJugadorNombre(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && crearYAgregarJugador()} autoFocus />
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

      {/* Modal comisión personalizada */}
      {modalComision && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setModalComision(null)}>
          <div className="modal" style={{ maxWidth: 400 }}>
            <h2 className="modal-title">Comisión personalizada</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ background: 'rgba(255,165,2,.08)', border: '1px solid rgba(255,165,2,.2)', borderRadius: 8, padding: '10px 14px', fontSize: 13 }}>
                <div style={{ color: 'var(--text2)', marginBottom: 4 }}>Jugador: <strong style={{ color: 'var(--text)' }}>{modalComision.inscripcion.jugadores?.nombre}</strong></div>
                <div style={{ color: 'var(--text2)' }}>Comisión automática: <strong style={{ color: 'var(--accent)', fontFamily: 'var(--mono)' }}>${modalComision.comisionAuto.toLocaleString('es-MX')}</strong></div>
              </div>
              <div style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.6 }}>
                ¿Deseas establecer valores personalizados para <strong>{modalComision.inscripcion.jugadores?.nombre}</strong>? No afectará a los demás jugadores.
              </div>
              <div className="form-group">
                <label className="form-label">Monto cobrado al jugador ($)</label>
                <input className="form-input" type="number" min="0" value={montoManual}
                  onChange={e => setMontoManual(e.target.value)} autoFocus />
              </div>
              <div className="form-group">
                <label className="form-label">Comisión del coach ($)</label>
                <input className="form-input" type="number" min="0" value={comisionManual}
                  onChange={e => setComisionManual(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && guardarComisionManual()} />
              </div>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                <button className="btn btn-secondary" onClick={() => setModalComision(null)}>Cancelar</button>
                <button className="btn btn-primary" onClick={guardarComisionManual}>Confirmar</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {toast && <div className="toast"><span style={{ color: 'var(--accent)' }}>✓</span>{toast}</div>}
    </>
  )
}
