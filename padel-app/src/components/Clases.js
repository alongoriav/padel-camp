import { useState, useEffect } from 'react'
import { supabase } from '../supabase'
import { CheckinNuevo, CheckinDetalle, guardarCheckins } from './CheckinWidget'

const DIAS = ['Lunes','Martes','Miércoles','Jueves','Viernes','Sábado','Domingo']
const HORAS = ['06:00','07:00','08:00','09:00','10:00','11:00','12:00','13:00','14:00','15:00','16:00','17:00','18:00','19:00','20:00','21:00']
const MODALIDADES = ['Semanal','Clase única','Promo']
const TIPOS = ['Privada','Compartida']
const METODOS = ['Efectivo','Tarjeta','Transferencia','Check-in','Pendiente','Promo']
const MESES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre']

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
  // Count remaining classes from fechaEntrada
  // We estimate: clases restantes = clasesTotal * (días restantes / días totales del mes)
  const inicio = new Date(fechaInicio + 'T00:00:00')
  const entrada = new Date(fechaEntrada + 'T00:00:00')
  const fin = new Date(inicio)
  fin.setMonth(fin.getMonth() + 1)
  fin.setDate(0) // last day of month
  const diasTotales = Math.round((fin - inicio) / (1000 * 60 * 60 * 24)) + 1
  const diasRestantes = Math.round((fin - entrada) / (1000 * 60 * 60 * 24)) + 1
  const proporcion = Math.min(1, Math.max(0, diasRestantes / diasTotales))
  return Math.round(montoBase * proporcion)
}

const MESES_IDX = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre']

function calcComisionAuto(inscripcion, coaches, detalle) {
  const coachId = inscripcion.clases?.coach_id || detalle?.coach_id
  const coach = coaches?.find(c => c.id === coachId)
  if (!coach) return 0
  const esPromo = inscripcion.metodo_pago === 'Promo'
  if (!inscripcion.pagado && !esPromo) return 0
  const monto = inscripcion.monto_cobrado || 0
  // Clases Promo: $300 fijo independiente del esquema
  if (esPromo) return Math.round(300 / 1.16)
  let comision = 0
  const tipo = inscripcion.clases?.tipo || detalle?.tipo
  if (coach.esquema_comision === 'Porcentaje') comision = Math.round(monto * (coach.porcentaje_comision || 0))
  else if (coach.esquema_comision === 'Bono') comision = coach.pago_extra_clase || 0
  else if (coach.esquema_comision === 'Mixto') {
    if (tipo === 'Privada') comision = Math.round(coach.tarifa_privada_fija || 0)
    else comision = Math.round(monto * (coach.porcentaje_comision || 0))
  }
  return Math.round(comision)
}

function EditableMonto({ inscripcion, onUpdate }) {
  const [editing, setEditing] = useState(false)
  const [valor, setValor] = useState(inscripcion.monto_cobrado || 0)
  const guardar = async () => {
    await supabase.from('inscripciones').update({ monto_cobrado: parseFloat(valor) }).eq('id', inscripcion.id)
    setEditing(false); onUpdate()
  }
  if (editing) return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
      <input className="form-input" type="number" value={valor} onChange={e => setValor(e.target.value)}
        style={{ maxWidth: 100, padding: '4px 8px', fontSize: 13 }} autoFocus onKeyDown={e => e.key === 'Enter' && guardar()} />
      <button onClick={guardar} style={{ background: 'var(--accent)', border: 'none', borderRadius: 6, padding: '4px 8px', fontSize: 12, cursor: 'pointer', color: '#000', fontWeight: 600 }}>✓</button>
      <button onClick={() => { setValor(inscripcion.monto_cobrado); setEditing(false) }}
        style={{ background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 6, padding: '4px 8px', fontSize: 12, cursor: 'pointer', color: 'var(--text2)' }}>✕</button>
    </div>
  )
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }} onClick={() => setEditing(true)}>
      <span style={{ fontFamily: 'var(--mono)', fontSize: 13 }}>${Number(inscripcion.monto_cobrado).toLocaleString('es-MX')}</span>
      <span style={{ fontSize: 11, color: 'var(--text2)' }}>✏️</span>
    </div>
  )
}

const emptyForm = {
  coach_id: '', tipo: 'Privada', modalidad: 'Semanal',
  dia: 'Lunes', hora: '09:00', fecha_inicio: '', fecha_fin: '',
  mes: MESES[new Date().getMonth()], anio: new Date().getFullYear(),
}

export default function Clases({ usuario }) {
  const [clases, setClases] = useState([])
  const [coaches, setCoaches] = useState([])
  const [jugadores, setJugadores] = useState([])
  const [inscripciones, setInscripciones] = useState([])
  const [modal, setModal] = useState(false)
  const [detalle, setDetalle] = useState(null)
  const [form, setForm] = useState(emptyForm)
  const [fechas, setFechas] = useState([])
  const [jugadoresClase, setJugadoresClase] = useState([])
  const [checkinFechas, setCheckinFechas] = useState({})
  const [fechasExcluidasMap, setFechasExcluidasMap] = useState({})
  const [busqueda, setBusqueda] = useState('')
  const [toast, setToast] = useState('')
  const [filterCoach, setFilterCoach] = useState('')
  const [filterJugador, setFilterJugador] = useState('')
  const [filterMes, setFilterMes] = useState('')
  const [filterDesde, setFilterDesde] = useState('')
  const [sortCol, setSortCol] = useState('fecha_inicio')
  const [sortDir, setSortDir] = useState('desc')
  const [filterHasta, setFilterHasta] = useState('')
  const [busquedaDetalle, setBusquedaDetalle] = useState('')
  const [fechaEntradaDetalle, setFechaEntradaDetalle] = useState('')
  const [editandoHora, setEditandoHora] = useState(false)
  const [nuevaHora, setNuevaHora] = useState('')
  const [modalComision, setModalComision] = useState(null)
  const [confirmarEliminar, setConfirmarEliminar] = useState(null)
  const [comisionManual, setComisionManual] = useState('')
  const [montoManual, setMontoManual] = useState('')
  const [editMode, setEditMode] = useState(false)
  const [editClaseId, setEditClaseId] = useState(null)
  const [modalNuevoJugador, setModalNuevoJugador] = useState(false)
  const [nuevoJugadorNombre, setNuevoJugadorNombre] = useState('')
  const [nuevoJugadorDesde, setNuevoJugadorDesde] = useState('clase') // 'clase' or 'detalle'
  const isAdmin = usuario?.rol === 'admin'

  useEffect(() => { fetchAll() }, [])

  useEffect(() => {
    if (form.modalidad === 'Semanal' && form.dia && form.fecha_inicio) {
      const fs = calcFechas(form.dia, form.fecha_inicio)
      setFechas(fs)
      if (fs.length > 0) setForm(f => ({ ...f, fecha_fin: fs[fs.length-1].toISOString().split('T')[0] }))
    } else setFechas([])
  }, [form.dia, form.fecha_inicio, form.modalidad])

  const fetchAll = async () => {
    const [{ data: cs }, { data: js }, { data: cl }, { data: ins }] = await Promise.all([
      supabase.from('coaches').select('*').eq('activo', true).order('nombre'),
      supabase.from('jugadores').select('*').eq('activo', true).order('nombre'),
      supabase.from('clases').select('*, coaches(nombre)').order('fecha_inicio', { ascending: false }),
      supabase.from('inscripciones').select('*, jugadores(nombre), clases(coach_id, fecha_inicio, fecha_fin, clases_en_rango, modalidad, tipo, hora, dia)'),
    ])
    setCoaches(cs || []); setJugadores(js || [])
    setClases(cl || []); setInscripciones(ins || [])
    if (!form.coach_id && cs?.length) setForm(f => ({ ...f, coach_id: cs[0].id }))
  }

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(''), 3000) }
  const set = (key, val) => setForm(f => ({ ...f, [key]: val }))

  const fechasExcluidasGlobal = jugadoresClase.length > 0 ? (fechasExcluidasMap[jugadoresClase[0]?.jugador_id] || new Set()) : new Set()
  const numClases = form.modalidad === 'Semanal' ? Math.max(1, fechas.filter(f => !fechasExcluidasGlobal.has(f.toISOString().slice(0,10))).length) : 1
  const participantes = jugadoresClase.length || 1
  const montoPorJugador = calcMonto(form.modalidad, participantes, numClases)

  const busquedaTrimmed = busqueda.trim()
  const jugadoresFiltrados = jugadores.filter(j =>
    (busquedaTrimmed === '' || j.nombre.toLowerCase().includes(busquedaTrimmed.toLowerCase())) &&
    !jugadoresClase.find(jc => jc.jugador_id === j.id)
  )



  const quitarComisionManual = async (inscripcionId) => {
    await supabase.from('inscripciones').update({ comision_override: null }).eq('id', inscripcionId)
    showToast('Comisión restaurada ✓')
    fetchAll()
  }

  const guardarHora = async () => {
    if (!nuevaHora || !detalle) return
    await supabase.from('clases').update({ hora: nuevaHora + ':00' }).eq('id', detalle.id)
    setDetalle(d => ({ ...d, hora: nuevaHora + ':00' }))
    setEditandoHora(false)
    showToast('Horario actualizado ✓')
    fetchAll()
  }

  const crearYAgregarJugador = async () => {
    if (!nuevoJugadorNombre.trim()) return
    const nombre = nuevoJugadorNombre.trim().split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ')
    const { data } = await supabase.from('jugadores').insert({ nombre, activo: true }).select().single()
    if (!data) { showToast('Error al crear jugador'); return }
    // Refresh jugadores list
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

  const getDiaFromFecha = (fecha) => {
    if (!fecha) return null
    const DIAS_N = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado']
    const d = new Date(fecha + 'T12:00:00')
    return DIAS_N[d.getDay()]
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
    fetchAll()
  }

  
  const abrirEdicion = (clase) => {
    setEditClaseId(clase.id)
    const ins = inscripciones.filter(i => i.clase_id === clase.id)
    setForm({
      coach_id: clase.coach_id,
      tipo: clase.tipo,
      modalidad: clase.modalidad,
      dia: clase.dia || 'Lunes',
      hora: clase.hora?.slice(0,5) || '09:00',
      fecha_inicio: clase.fecha_inicio || '',
      fecha_fin: clase.fecha_fin || clase.fecha_inicio || '',
      mes: ins[0]?.mes || MESES[new Date().getMonth()],
      anio: ins[0]?.anio || new Date().getFullYear(),
    })
    setJugadoresClase(ins.map(i => ({
      jugador_id: i.jugador_id,
      nombre: i.jugadores?.nombre || jugadores.find(j => j.id === i.jugador_id)?.nombre || '',
      metodo: i.metodo_pago || 'Efectivo',
      pagado: i.pagado || false,
      fecha_entrada: i.fecha_entrada || '',
      esPromo: i.metodo_pago === 'Promo',
    })))
    setEditMode(true)
    setDetalle(null)
    setModal(true)
  }

  const editarClase = async (claseId) => {
    const numClases = form.modalidad === 'Semanal' ? calcFechas(form.dia, form.fecha_inicio).length : 1
    const diaGuardar = form.modalidad === 'Semanal' && form.dia ? form.dia : getDiaFromFecha(form.fecha_inicio)
    await supabase.from('clases').update({
      coach_id: form.coach_id, tipo: form.tipo, modalidad: form.modalidad,
      dia: diaGuardar,
      hora: form.hora + ':00',
      fecha_inicio: form.fecha_inicio,
      fecha_fin: form.modalidad === 'Semanal' ? form.fecha_fin : form.fecha_inicio,
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
    setModal(false)
    setEditMode(false)
    showToast('Clase actualizada ✓')
    fetchAll()
  }

  const guardarClase = async () => {
    if (!form.coach_id || jugadoresClase.length === 0 || !form.fecha_inicio) return
    const { data: claseData } = await supabase.from('clases').insert({
      coach_id: form.coach_id, tipo: form.tipo, modalidad: form.modalidad,
      dia: form.modalidad === 'Semanal' && form.dia ? form.dia : getDiaFromFecha(form.fecha_inicio),
      hora: form.hora + ':00', fecha_inicio: form.fecha_inicio,
      fecha_fin: form.modalidad === 'Semanal' ? form.fecha_fin : form.fecha_inicio, activo: true,
    }).select().single()
    if (!claseData) { showToast('Error al guardar'); return }
    const insRows = jugadoresClase.map(j => {
      const montoBase = j._montoProporcional != null ? j._montoProporcional : montoPorJugador
      const descCheckin = j.metodo === 'Check-in' ? (checkinFechas[j.jugador_id]?.length || 0) * 200 : 0
      return {
        clase_id: claseData.id, jugador_id: j.jugador_id,
        metodo_pago: j.metodo, pagado: j.pagado,
        monto_cobrado: montoBase - descCheckin, mes: form.mes, anio: form.anio,
        fecha_entrada: j.fecha_entrada || null,
      }
    })
    const { data: insData } = await supabase.from('inscripciones').insert(insRows).select()
    // Guardar check-ins por jugador
    if (insData) {
      for (const ins of insData) {
        const jug = jugadoresClase.find(j => j.jugador_id === ins.jugador_id)
        if (jug?.metodo === 'Check-in') {
          await guardarCheckins(ins.id, checkinFechas[jug.jugador_id] || [])
        }
        const excluidas = [...(fechasExcluidasMap[jug?.jugador_id] || [])]
        if (excluidas.length > 0) {
          await supabase.from('ausencias').insert(excluidas.map(f => ({ inscripcion_id: ins.id, fecha: f })))
        }
      }
    }
    showToast('Clase registrada ✓')
    setModal(false); setJugadoresClase([]); setCheckinFechas({}); setFechasExcluidasMap({}); setForm(emptyForm); fetchAll()
  }

  const eliminarJugadorDetalle = async (ins) => {
    setConfirmarEliminar(ins)
  }

  const confirmarEliminarJugador = async () => {
    const ins = confirmarEliminar
    if (!ins) return
    const nombre = ins.jugadores?.nombre
    setConfirmarEliminar(null)
    await supabase.from('inscripciones').delete().eq('id', ins.id)
    await fetchAll()
    showToast(`${nombre} eliminado de la clase`)
  }

  const togglePago = async (ins) => {
    const ahora = new Date().toISOString().split('T')[0]
    const esPromo = ins.clases?.modalidad === 'Promo' || ins.clases?.modalidad === 'Cortesía'
    const update = ins.pagado 
      ? { pagado: false, fecha_pago: null }
      : { pagado: true, fecha_pago: ahora }
    await supabase.from('inscripciones').update(update).eq('id', ins.id)
    fetchAll()
    if (detalle) {
      const { data } = await supabase.from('inscripciones').select('*, jugadores(nombre)').eq('clase_id', detalle.id)
      setDetalle(d => ({ ...d, _ins: data }))
    }
  }

  const eliminarClase = async (claseId) => {
    if (!window.confirm('¿Eliminar esta clase y todas sus inscripciones? Esta acción no se puede deshacer.')) return
    await supabase.from('inscripciones').delete().eq('clase_id', claseId)
    await supabase.from('clases').delete().eq('id', claseId)
    setDetalle(null)
    showToast('Clase eliminada ✓')
    fetchAll()
  }

  const agregarJugadorDetalle = async (j) => {
    const insDetalle = inscripciones.filter(i => i.clase_id === detalle.id)
    const totalParticipantes = insDetalle.length + 1
    const montoBase = calcMonto(detalle.modalidad, totalParticipantes, detalle.clases_en_rango || 1)
    // Recalculate existing players with new participant count
    const montoNuevo = calcMonto(detalle.modalidad, totalParticipantes, detalle.clases_en_rango || 1)
    const montoAnterior = calcMonto(detalle.modalidad, insDetalle.length, detalle.clases_en_rango || 1)
    const saldoFavor = montoAnterior - montoNuevo
    // Calculate proportional for new player
    const montoFinal = fechaEntradaDetalle && detalle.fecha_inicio
      ? calcMontoProporcional(montoNuevo, fechaEntradaDetalle, detalle.fecha_inicio, detalle.clases_en_rango || 1)
      : montoNuevo
    await supabase.from('inscripciones').insert({
      clase_id: detalle.id, jugador_id: j.id, metodo_pago: 'Pendiente', pagado: false,
      monto_cobrado: montoFinal, mes: insDetalle[0]?.mes || MESES[new Date().getMonth()], anio: 2026,
      fecha_entrada: fechaEntradaDetalle || null,
    })
    setBusquedaDetalle('')
    setFechaEntradaDetalle('')
    const msg = saldoFavor > 0
      ? `${j.nombre} agregado ✓ · Saldo a favor jugadores existentes: $${saldoFavor.toLocaleString('es-MX')} c/u`
      : `${j.nombre} agregado ✓`
    showToast(msg)
    fetchAll()
  }

  const toggleSort = (col) => {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortCol(col); setSortDir('asc') }
  }

  const SortIcon = ({ col }) => {
    if (sortCol !== col) return <span style={{ color: 'var(--border)', marginLeft: 4 }}>↕</span>
    return <span style={{ color: 'var(--accent)', marginLeft: 4 }}>{sortDir === 'asc' ? '↑' : '↓'}</span>
  }

  const clasesFiltradas = clases.filter(c => {
    if (!isAdmin && c.coach_id !== usuario?.coach_id) return false
    if (filterCoach && c.coach_id !== filterCoach) return false
    if (filterJugador) {
      const ins = inscripciones.filter(i => i.clase_id === c.id)
      const nombres = ins.map(i => (i.jugadores?.nombre || '').toLowerCase())
      if (!nombres.some(n => n.includes(filterJugador.toLowerCase()))) return false
    }
    if (filterMes) {
      const ins = inscripciones.filter(i => i.clase_id === c.id)
      if (!ins.some(i => i.mes === filterMes)) return false
    }
    // Filtro por rango: incluir clases semanales donde alguna sesión cae en el rango
    if (filterDesde || filterHasta) {
      const DIAS_MAP_C = { 'Lunes':1,'Martes':2,'Miércoles':3,'Jueves':4,'Viernes':5,'Sábado':6,'Domingo':0 }
      const desdeD = filterDesde ? new Date(filterDesde + 'T12:00:00') : null
      const hastaD = filterHasta ? new Date(filterHasta + 'T12:00:00') : null
      const fi = new Date((c.fecha_inicio || '') + 'T12:00:00')
      const ff = c.fecha_fin ? new Date(c.fecha_fin + 'T12:00:00') : fi
      if (c.modalidad === 'Clase única') {
        if (desdeD && fi < desdeD) return false
        if (hastaD && fi > hastaD) return false
      } else if (c.dia && DIAS_MAP_C[c.dia] !== undefined) {
        // Clase semanal: verificar que fecha_inicio <= hasta Y fecha_fin >= desde
        if (hastaD && fi > hastaD) return false
        if (desdeD && ff < desdeD) return false
        // Verificar que el día de la semana cae en el rango efectivo
        const rInicio = desdeD && fi < desdeD ? desdeD : fi
        const rFin = hastaD && ff > hastaD ? hastaD : ff
        const d = new Date(rInicio)
        let ok = false
        for (let i = 0; i <= 6; i++) {
          if (d.getDay() === DIAS_MAP_C[c.dia] && d <= rFin) { ok = true; break }
          d.setDate(d.getDate() + 1)
        }
        if (!ok) return false
      } else {
        if (desdeD && fi < desdeD) return false
        if (hastaD && fi > hastaD) return false
      }
    }
    return true
  })

  const clasesFiltradas2 = [...clasesFiltradas].sort((a, b) => {
    let va, vb
    const ins_a = inscripciones.filter(i => i.clase_id === a.id)
    const ins_b = inscripciones.filter(i => i.clase_id === b.id)
    switch(sortCol) {
      case 'coach': va = a.coaches?.nombre || ''; vb = b.coaches?.nombre || ''; break
      case 'tipo': va = a.tipo || ''; vb = b.tipo || ''; break
      case 'modalidad': va = a.modalidad || ''; vb = b.modalidad || ''; break
      case 'horario': va = (a.dia || '') + (a.hora || ''); vb = (b.dia || '') + (b.hora || ''); break
      case 'jugadores': va = ins_a.length; vb = ins_b.length; break
      case 'mes': va = ins_a[0]?.mes || ''; vb = ins_b[0]?.mes || ''; break
      case 'pagos': va = ins_a.filter(i => i.pagado).length / (ins_a.length || 1); vb = ins_b.filter(i => i.pagado).length / (ins_b.length || 1); break
      default: va = a.fecha_inicio || ''; vb = b.fecha_inicio || ''
    }
    if (va < vb) return sortDir === 'asc' ? -1 : 1
    if (va > vb) return sortDir === 'asc' ? 1 : -1
    return 0
  })

  const insDetalle = detalle ? inscripciones.filter(i => i.clase_id === detalle.id) : []
  const busquedaDetalleTrimmed = busquedaDetalle.trim()
  const jugadoresDisponiblesDetalle = jugadores.filter(j =>
    (busquedaDetalleTrimmed === '' || j.nombre.toLowerCase().includes(busquedaDetalleTrimmed.toLowerCase())) &&
    !insDetalle.find(i => i.jugador_id === j.id)
  )

  const hayFiltroFecha = filterDesde || filterHasta

  return (
    <div style={{ maxWidth: 960 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700 }}>Clases</h1>
          <p style={{ color: 'var(--text2)', fontSize: 14, marginTop: 4 }}>{clasesFiltradas.length} clases</p>
        </div>
        {isAdmin && <button className="btn btn-primary" onClick={() => { setForm(emptyForm); setJugadoresClase([]); setBusqueda(''); setModal(true) }}>+ Nueva clase</button>}
      </div>

      {isAdmin && (
        <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
          <select className="form-input" style={{ maxWidth: 180 }} value={filterCoach} onChange={e => setFilterCoach(e.target.value)}>
            <option value="">Todos los coaches</option>
            {coaches.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </select>
          <input className="form-input" placeholder="🔍 Buscar jugador..." value={filterJugador}
            onChange={e => setFilterJugador(e.target.value)}
            style={{ maxWidth: 200 }} />
          <select className="form-input" style={{ maxWidth: 150, textTransform: 'capitalize' }} value={filterMes} onChange={e => { setFilterMes(e.target.value); setFilterDesde(''); setFilterHasta('') }}>
            <option value="">Todos los meses</option>
            {MESES.map(m => <option key={m} value={m} style={{ textTransform: 'capitalize' }}>{m}</option>)}
          </select>
          <span style={{ color: 'var(--text2)', fontSize: 13 }}>o rango:</span>
          <input className="form-input" type="date" value={filterDesde} style={{ maxWidth: 150 }}
            onChange={e => { setFilterDesde(e.target.value); setFilterMes('') }} />
          <span style={{ color: 'var(--text2)', fontSize: 13 }}>→</span>
          <input className="form-input" type="date" value={filterHasta} style={{ maxWidth: 150 }}
            onChange={e => { setFilterHasta(e.target.value); setFilterMes('') }} />
          {(filterMes || hayFiltroFecha) && (
            <button className="btn btn-secondary btn-sm" onClick={() => { setFilterMes(''); setFilterDesde(''); setFilterHasta(''); setFilterJugador('') }}>✕ Limpiar</button>
          )}
        </div>
      )}

      {!isAdmin && (
        <div style={{ marginBottom: 12 }}>
          <input className="form-input" placeholder="🔍 Buscar jugador..." value={filterJugador}
            onChange={e => setFilterJugador(e.target.value)}
            style={{ maxWidth: 240 }} />
        </div>
      )}

      <div className="card" style={{ padding: 0 }}>
        <table className="table">
          <thead><tr>
            {[['coach','Coach'],['tipo','Tipo'],['modalidad','Modalidad'],['horario','Horario'],['jugadores','Alumnos'],['pago','Pago'],['mes','Mes'],['pagos','Pagos']].map(([col, label]) => (
              <th key={col} onClick={() => toggleSort(col)} style={{ cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }}>
                {label}<SortIcon col={col} />
              </th>
            ))}
          </tr></thead>
          <tbody>
            {clasesFiltradas2.length === 0 && (
              <tr><td colSpan={8} style={{ textAlign: 'center', color: 'var(--text2)', padding: 32 }}>Sin clases</td></tr>
            )}
            {clasesFiltradas2.map(c => {
              const ins = inscripciones.filter(i => i.clase_id === c.id)
              const pagados = ins.filter(i => i.pagado).length
              return (
                <tr key={c.id} style={{ cursor: 'pointer' }} onClick={() => setDetalle(c)}>
                  <td style={{ fontWeight: 600 }}>{c.coaches?.nombre}</td>
                  <td><span className={`badge ${c.tipo === 'Privada' ? 'badge-blue' : 'badge-yellow'}`}>{c.tipo}</span></td>
                  <td><span className={`badge ${c.modalidad === 'Semanal' ? 'badge-green' : c.modalidad === 'Promo' ? 'badge-yellow' : c.modalidad === 'Cortesía' ? 'badge-gray' : 'badge-blue'}`}>{c.modalidad}</span></td>
                  <td style={{ fontSize: 13 }}>
                    {c.dia && <span>{c.dia} </span>}
                    <span style={{ fontFamily: 'var(--mono)' }}>{c.hora?.slice(0,5)}</span>
                  </td>
                  <td style={{ fontSize: 13, maxWidth: 200 }}>
                    {ins.length === 0
                      ? <span style={{ color: 'var(--text2)' }}>—</span>
                      : <span style={{ color: 'var(--text2)' }}>
                          {ins.map(i => i.jugadores?.nombre).filter(Boolean).join(', ')}
                        </span>
                    }
                  </td>
                  <td style={{ fontSize: 13 }}>
                    {(() => {
                      const promos = ins.filter(i => i.metodo_pago === 'Promo')
                      const otros = ins.filter(i => i.metodo_pago !== 'Promo')
                      return (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                          {promos.map(i => (
                            <span key={i.id} style={{ fontSize: 11, background: 'rgba(255,165,2,.15)', color: 'rgba(255,165,2,.9)', borderRadius: 4, padding: '1px 6px', fontWeight: 600 }}>
                              🎁 {i.jugadores?.nombre?.split(' ')[0]}
                            </span>
                          ))}
                          {otros.length > 0 && promos.length === 0 && (
                            <span style={{ color: 'var(--text2)', fontSize: 12 }}>
                              {[...new Set(otros.map(i => i.metodo_pago))].join(', ')}
                            </span>
                          )}
                          {otros.length > 0 && promos.length > 0 && (
                            <span style={{ color: 'var(--text2)', fontSize: 12 }}>+{otros.length}</span>
                          )}
                        </div>
                      )
                    })()}
                  </td>
                  <td style={{ fontSize: 13, textTransform: 'capitalize' }}>{ins[0]?.mes || '—'}</td>
                  <td><span className={`badge ${pagados === ins.length && ins.length > 0 ? 'badge-green' : pagados > 0 ? 'badge-yellow' : 'badge-red'}`}>{pagados}/{ins.length}</span></td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Modal nueva clase */}
      {modal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setModal(false)}>
          <div className="modal" style={{ maxWidth: 600 }}>
            <h2 className="modal-title">{editMode ? "✏️ Editar clase" : "Nueva clase"}</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div className="grid-2">
                <div className="form-group">
                  <label className="form-label">Coach</label>
                  <select className="form-input" value={form.coach_id} onChange={e => set('coach_id', e.target.value)}>
                    {coaches.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Tipo</label>
                  <div style={{ display: 'flex', gap: 8 }}>
                    {TIPOS.map(t => (
                      <button key={t} onClick={() => set('tipo', t)} style={{
                        flex: 1, padding: '9px', borderRadius: 8,
                        border: `1px solid ${form.tipo === t ? 'var(--accent)' : 'var(--border)'}`,
                        background: form.tipo === t ? 'rgba(0,229,160,.1)' : 'var(--bg3)',
                        color: form.tipo === t ? 'var(--accent)' : 'var(--text2)',
                        fontSize: 13, fontWeight: 500, cursor: 'pointer'
                      }}>{t}</button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="grid-2">
                <div className="form-group">
                  <label className="form-label">Modalidad</label>
                  <select className="form-input" value={form.modalidad} onChange={e => set('modalidad', e.target.value)}>
                    {MODALIDADES.map(m => <option key={m}>{m}</option>)}
                  </select>
                  {form.tipo === 'Compartida' && (
                    <p style={{ fontSize: 11, color: 'var(--text2)', marginTop: 4 }}>💡 Para promo individual usa el botón 🎁 por jugador</p>
                  )}
                </div>
                <div className="form-group">
                  <label className="form-label">Hora</label>
                  <select className="form-input" value={form.hora} onChange={e => set('hora', e.target.value)}>
                    {HORAS.map(h => <option key={h}>{h}</option>)}
                  </select>
                </div>
              </div>

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
                    <input className="form-input" type="date" value={form.fecha_inicio} onChange={e => set('fecha_inicio', e.target.value)} />
                  </div>
                </div>
              ) : (
                <div className="form-group">
                  <label className="form-label">Fecha</label>
                  <input className="form-input" type="date" value={form.fecha_inicio} onChange={e => set('fecha_inicio', e.target.value)} />
                </div>
              )}

              {form.modalidad === 'Semanal' && fechas.length > 0 && (
                <div style={{ background: 'rgba(0,229,160,.06)', border: '1px solid rgba(0,229,160,.2)', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: 'var(--text2)' }}>
                  <div style={{ fontWeight: 600, marginBottom: 8, color: 'var(--text2)' }}>📅 Selecciona fechas de asistencia:</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {fechas.map(f => {
                      const ds = f.toISOString().slice(0,10)
                      const label = f.toLocaleDateString('es-MX', { weekday: 'short', day: 'numeric', month: 'short' })
                      const algunaExcluida = jugadoresClase.some(j => fechasExcluidasMap[j.jugador_id]?.has(ds))
                      return (
                        <label key={ds} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer',
                          background: algunaExcluida ? 'rgba(255,59,48,.08)' : 'rgba(0,229,160,.1)',
                          border: `1px solid ${algunaExcluida ? 'rgba(255,59,48,.3)' : 'rgba(0,229,160,.3)'}`,
                          borderRadius: 6, padding: '4px 10px', fontSize: 12 }}>
                          <input type="checkbox" defaultChecked
                            onChange={e => {
                              const checked = e.target.checked
                              setFechasExcluidasMap(prev => {
                                const next = { ...prev }
                                jugadoresClase.forEach(j => {
                                  const s = new Set(prev[j.jugador_id] || [])
                                  if (!checked) s.add(ds); else s.delete(ds)
                                  next[j.jugador_id] = s
                                })
                                return next
                              })
                            }} />
                          {label}
                        </label>
                      )
                    })}
                  </div>
                  {(() => {
                    const excluidas = jugadoresClase.length > 0 ? [...(fechasExcluidasMap[jugadoresClase[0]?.jugador_id] || [])].length : 0
                    const sel = fechas.length - excluidas
                    return excluidas > 0 && <div style={{ marginTop: 8, fontSize: 12, color: 'var(--danger)' }}>⚠️ {excluidas} fecha{excluidas!==1?'s':''} excluida{excluidas!==1?'s':''} — se cobrarán {sel} clase{sel!==1?'s':''}</div>
                  })()}
                </div>
              )}

              <div className="form-group">
                <label className="form-label">Mes de cobro</label>
                <select className="form-input" value={form.mes} onChange={e => set('mes', e.target.value)}>
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
                  <input className="form-input" placeholder="Buscar jugador..." value={busqueda} 
                    onChange={e => setBusqueda(e.target.value)} />
                  {busqueda.length > 0 && jugadoresFiltrados.length > 0 && (
                    <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 10, background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 8, maxHeight: 180, overflowY: 'auto', boxShadow: '0 8px 24px rgba(0,0,0,.4)' }}>
                      {jugadoresFiltrados.slice(0, 6).map(j => (
                        <div key={j.id} onMouseDown={e => { e.preventDefault(); setJugadoresClase(prev => [...prev, { jugador_id: j.id, nombre: j.nombre, metodo: 'Efectivo', pagado: false, fecha_entrada: '' }]); setBusqueda('') }}
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
                  <div key={j.jugador_id} style={{ display: 'flex', alignItems: 'center', gap: 8, background: j.esPromo ? 'rgba(255,165,2,.08)' : 'var(--bg3)', borderRadius: 8, padding: '8px 12px', marginBottom: 6, border: `1px solid ${j.esPromo ? 'rgba(255,165,2,.3)' : 'var(--border)'}` }}>
                    <div style={{ fontWeight: 500, fontSize: 14, flex: 1 }}>{j.nombre}</div>
                    <select className="form-input" value={j.metodo} style={{ maxWidth: 130, borderColor: j.metodo === 'Promo' ? 'rgba(255,165,2,.6)' : undefined }}
                      onChange={e => {
                        const esPromo = e.target.value === 'Promo'
                        setJugadoresClase(prev => prev.map(x => x.jugador_id === j.jugador_id ? { ...x, metodo: e.target.value, pagado: esPromo ? true : x.pagado } : x))
                      }}>
                      {METODOS.map(m => <option key={m}>{m}</option>)}
                    </select>
                    {j.metodo === 'Promo'
                      ? <span style={{ fontSize: 12, color: 'rgba(255,165,2,.9)', fontWeight: 600, whiteSpace: 'nowrap' }}>🎁 Promo</span>
                      : <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 13, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                          <input type="checkbox" checked={j.pagado}
                            onChange={e => setJugadoresClase(prev => prev.map(x => x.jugador_id === j.jugador_id ? { ...x, pagado: e.target.checked } : x))} />
                          Pagado
                        </label>
                    }
                    {j.metodo === 'Check-in' && (
                      <div style={{ width: '100%', marginTop: 4 }}>
                        <CheckinNuevo
                          dia={form.dia} fechaInicio={form.fecha_inicio}
                          fechaFin={form.modalidad === 'Semanal' ? form.fecha_fin : form.fecha_inicio}
                          modalidad={form.modalidad}
                          onChange={({ fechas, descuento }) => setCheckinFechas(prev => ({ ...prev, [j.jugador_id]: fechas }))}
                        />
                      </div>
                    )}
                    {form.tipo === 'Compartida' && (
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
                                <div style={{ fontSize: 10, color: 'var(--text2)', marginTop: 2 }}>vs ${calcMonto(form.modalidad, jugadoresClase.length, numClases).toLocaleString('es-MX')} base</div>
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
                        <div style={{ textAlign: 'right' }}>
                          {j.metodo === 'Check-in' && (checkinFechas[j.jugador_id]?.length || 0) > 0 && (
                            <div style={{ fontSize: 10, color: '#0066cc' }}>
                              -{(checkinFechas[j.jugador_id].length * 200).toLocaleString('es-MX')} check-in
                            </div>
                          )}
                          <span style={{ fontFamily: 'var(--mono)', color: esProporcional ? 'var(--warn)' : 'var(--accent)', fontWeight: 700, fontSize: 15 }}>
                            ${(monto - (j.metodo === 'Check-in' ? (checkinFechas[j.jugador_id]?.length || 0) * 200 : 0)).toLocaleString('es-MX')}
                          </span>
                        </div>
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
                <button className="btn btn-secondary" onClick={() => { setModal(false); setEditMode(false) }}>Cancelar</button>
                <button className="btn btn-primary"
                  onClick={editMode ? () => editarClase(editClaseId) : guardarClase}
                  disabled={!form.coach_id || (!editMode && jugadoresClase.length === 0) || !form.fecha_inicio}>
                  {editMode ? '💾 Guardar cambios' : 'Registrar clase'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal detalle */}
      {detalle && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setDetalle(null)}>
          <div className="modal" style={{ maxWidth: 580 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
              <div>
                <h2 style={{ fontSize: 18, fontWeight: 700 }}>{detalle.coaches?.nombre}</h2>
                <div style={{ display: 'flex', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
                  <span className={`badge ${detalle.tipo === 'Privada' ? 'badge-blue' : 'badge-yellow'}`}>{detalle.tipo}</span>
                  <span className={`badge ${detalle.modalidad === 'Semanal' ? 'badge-green' : 'badge-gray'}`}>{detalle.modalidad}</span>
                  {detalle.dia && <span style={{ fontSize: 13, color: 'var(--text2)' }}>📅 {detalle.dia}</span>}
                  {editandoHora ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <select className="form-input" value={nuevaHora} onChange={e => setNuevaHora(e.target.value)}
                        style={{ padding: '3px 8px', fontSize: 13, maxWidth: 100 }}>
                        {['06:00','07:00','08:00','09:00','10:00','11:00','12:00','13:00','14:00','15:00','16:00','17:00','18:00','19:00','20:00','21:00'].map(h => (
                          <option key={h} value={h}>{h}</option>
                        ))}
                      </select>
                      <button onClick={guardarHora} style={{ background: 'var(--accent)', border: 'none', borderRadius: 6, padding: '3px 8px', fontSize: 12, cursor: 'pointer', color: '#000', fontWeight: 700 }}>✓</button>
                      <button onClick={() => setEditandoHora(false)} style={{ background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 6, padding: '3px 8px', fontSize: 12, cursor: 'pointer', color: 'var(--text2)' }}>✕</button>
                    </div>
                  ) : (
                    <span onClick={() => { setNuevaHora(detalle.hora?.slice(0,5) || '09:00'); setEditandoHora(true) }}
                      style={{ fontSize: 13, color: detalle.hora?.slice(0,5) === '00:00' ? 'var(--danger)' : 'var(--text2)', fontFamily: 'var(--mono)', cursor: 'pointer', textDecoration: 'underline dotted' }}
                      title="Clic para editar horario">
                      🕐 {detalle.hora?.slice(0,5)} {detalle.hora?.slice(0,5) === '00:00' && '⚠️'}
                    </span>
                  )}
                  <span style={{ fontSize: 13, color: 'var(--text2)' }}>{detalle.fecha_inicio}</span>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-sm" onClick={() => abrirEdicion(detalle)}
                  style={{ background: 'rgba(0,229,160,.1)', border: '1px solid rgba(0,229,160,.3)', color: 'var(--accent)', borderRadius: 8, padding: '6px 12px', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
                  ✏️ Editar clase
                </button>
                <button className="btn btn-sm" onClick={() => eliminarClase(detalle.id)}
                  style={{ background: 'rgba(255,59,48,.15)', border: '1px solid rgba(255,59,48,.3)', color: 'var(--danger)', borderRadius: 8, padding: '6px 12px', cursor: 'pointer', fontSize: 13 }}>
                  🗑 Eliminar clase
                </button>
                <button className="btn btn-secondary btn-sm" onClick={() => setDetalle(null)}>Cerrar</button>
              </div>
            </div>

            {insDetalle.length > 0 && (() => {
              const montoActual = calcMonto(detalle?.modalidad, insDetalle.length, detalle?.clases_en_rango || 1)
              const montoConUno = calcMonto(detalle?.modalidad, insDetalle.length + 1, detalle?.clases_en_rango || 1)
              const saldo = montoActual - montoConUno
              return saldo > 0 ? (
                <div style={{ background: 'rgba(255,165,2,.08)', border: '1px solid rgba(255,165,2,.2)', borderRadius: 8, padding: '8px 12px', fontSize: 12, color: 'var(--warn)', marginBottom: 10 }}>
                  💡 Si agregas un jugador más, el precio baja a ${montoConUno.toLocaleString('es-MX')} c/u · Saldo a favor jugadores actuales: <strong>${saldo.toLocaleString('es-MX')} c/u</strong>
                </div>
              ) : null
            })()}
            <table className="table" style={{ marginBottom: 16 }}>
              <thead><tr><th>Jugador</th><th>Monto</th><th>Método</th><th>Pago</th><th>Comisión</th></tr></thead>
              <tbody>
                {insDetalle.map(i => (
                  <tr key={i.id}>
                    <td style={{ fontWeight: 500 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span>{i.jugadores?.nombre}</span>
                        {detalle?.tipo === 'Compartida' && (
                          <button onClick={() => eliminarJugadorDetalle(i)} title="Eliminar jugador"
                            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, color: 'var(--danger)', padding: '2px 4px', lineHeight: 1, opacity: 0.7 }}
                            onMouseEnter={e => e.currentTarget.style.opacity = '1'}
                            onMouseLeave={e => e.currentTarget.style.opacity = '0.7'}>
                            🗑️
                          </button>
                        )}
                      </div>
                      {i.fecha_entrada && <div style={{ fontSize: 10, color: 'var(--warn)' }}>Desde {i.fecha_entrada}</div>}
                    </td>
                    <td><EditableMonto inscripcion={i} onUpdate={fetchAll} /></td>
                    <td style={{ fontSize: 13 }}>
                      {i.metodo_pago}
                      {i.metodo_pago === 'Check-in' && (
                        <div style={{ fontSize: 10, color: 'var(--warn)', marginTop: 2 }}>
                          ${i.monto_checkin || 200} check-in
                          {i.monto_complemento > 0 && ` + $${i.monto_complemento} ${i.metodo_complemento || ''}`}
                        </div>
                      )}
                    </td>
                    <td>
                      <button onClick={() => i.metodo_pago !== 'Promo' && togglePago(i)}
                        className={`badge ${i.metodo_pago === 'Promo' ? 'badge-yellow' : i.pagado ? 'badge-green' : i.metodo_pago === 'Check-in' && !i.complemento_pagado ? 'badge-yellow' : 'badge-red'}`}
                        style={{ border: 'none', cursor: i.metodo_pago === 'Promo' ? 'default' : 'pointer' }}>
                        {i.metodo_pago === 'Promo' ? '🎁 Promo' : i.pagado ? '✅ Pagado' : i.metodo_pago === 'Check-in' ? '⚡ Check-in' : '❌ Pendiente'}
                      </button>
                      {i.metodo_pago === 'Check-in' && <CheckinDetalle inscripcionId={i.id} />}
                    </td>
                    <td>
                      {(() => {
                        const comAuto = calcComisionAuto(i, coaches, detalle)
                        const comFinal = i.comision_override != null ? i.comision_override : comAuto
                        const esManual = i.comision_override != null
                        return (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ fontFamily: 'var(--mono)', fontSize: 13, color: esManual ? 'var(--warn)' : 'var(--text2)', fontWeight: esManual ? 700 : 400 }}>
                              ${comFinal.toLocaleString('es-MX')}{esManual ? ' ✏️' : ''}
                            </span>
                            <button onClick={() => { setComisionManual(String(comFinal)); setMontoManual(String(i.monto_cobrado || 0)); setModalComision({ inscripcion: i, comisionAuto: comAuto }) }}
                              style={{ background: 'rgba(255,165,2,.15)', border: '1px solid rgba(255,165,2,.3)', borderRadius: 6, padding: '3px 8px', cursor: 'pointer', fontSize: 11, color: 'var(--warn)', whiteSpace: 'nowrap', fontWeight: 600 }}>
                              ✏️ Personalizar
                            </button>
                            {esManual && (
                              <button onClick={() => quitarComisionManual(i.id)} title="Restaurar"
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

            <div style={{ borderTop: '1px solid var(--border)', paddingTop: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <label className="form-label" style={{ margin: 0 }}>Agregar jugador al grupo</label>
                <button type="button" onClick={() => { setNuevoJugadorDesde('detalle'); setModalNuevoJugador(true) }} style={{
                  background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 8,
                  padding: '4px 10px', cursor: 'pointer', fontSize: 12, color: 'var(--text2)'
                }}>+ Jugador nuevo</button>
              </div>
              <div style={{ position: 'relative' }}>
                <input className="form-input" placeholder="Buscar jugador..." value={busquedaDetalle} 
                  onChange={e => setBusquedaDetalle(e.target.value)} />
                {busquedaDetalle && jugadoresDisponiblesDetalle.length > 0 && (
                  <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 10, background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 8, maxHeight: 180, overflowY: 'auto', boxShadow: '0 8px 24px rgba(0,0,0,.4)' }}>
                    {jugadoresDisponiblesDetalle.slice(0, 6).map(j => (
                      <div key={j.id} onMouseDown={e => { e.preventDefault(); agregarJugadorDetalle(j) }}
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
          </div>
        </div>
      )}

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

      {modalComision && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setModalComision(null)}>
          <div className="modal" style={{ maxWidth: 400 }}>
            <h2 className="modal-title">Comisión personalizada</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ background: 'rgba(255,165,2,.08)', border: '1px solid rgba(255,165,2,.2)', borderRadius: 8, padding: '10px 14px', fontSize: 13 }}>
                <div style={{ color: 'var(--text2)', marginBottom: 4 }}>Jugador: <strong style={{ color: 'var(--text)' }}>{modalComision.inscripcion.jugadores?.nombre}</strong></div>
                <div style={{ color: 'var(--text2)' }}>Comisión automática: <strong style={{ color: 'var(--accent)', fontFamily: 'var(--mono)' }}>${modalComision.comisionAuto.toLocaleString('es-MX')}</strong></div>
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
      {confirmarEliminar && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setConfirmarEliminar(null)}>
          <div className="modal" style={{ maxWidth: 380 }}>
            <h2 className="modal-title">¿Eliminar jugador?</h2>
            <p style={{ color: 'var(--text2)', fontSize: 14, marginBottom: 20 }}>
              ¿Estás seguro de que quieres eliminar a <strong style={{ color: 'var(--text)' }}>{confirmarEliminar.jugadores?.nombre}</strong> de esta clase? Esta acción no se puede deshacer.
            </p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary" onClick={() => setConfirmarEliminar(null)}>Cancelar</button>
              <button className="btn" style={{ background: 'var(--danger)', color: '#fff', border: 'none' }} onClick={confirmarEliminarJugador}>Sí, eliminar</button>
            </div>
          </div>
        </div>
      )}

      {toast && <div className="toast"><span style={{ color: 'var(--accent)' }}>✓</span>{toast}</div>}
    </div>
  )
}
