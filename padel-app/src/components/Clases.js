import { useState, useEffect } from 'react'
import { supabase } from '../supabase'
import ModalClase from './ModalClase'

const DIAS = ['Lunes','Martes','Miércoles','Jueves','Viernes','Sábado','Domingo']
const HORAS = ['06:00','07:00','08:00','09:00','10:00','11:00','12:00','13:00','14:00','15:00','16:00','17:00','18:00','19:00','20:00','21:00']
const MODALIDADES = ['Semanal','Clase única','Promo']
const TIPOS = ['Privada','Compartida']
const METODOS = ['Efectivo','Tarjeta','Transferencia','Check-in','Pendiente']
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

function calcComisionAuto(inscripcion, coaches) {
  const coach = coaches?.find(c => c.id === inscripcion.clases?.coach_id)
  if (!coach || !inscripcion.pagado) return 0
  const mod = inscripcion.clases?.modalidad
  if (mod === 'Promo' || mod === 'Cortesía') return 0
  const monto = inscripcion.monto_cobrado || 0
  if (coach.esquema_comision === 'Porcentaje') return Math.round(monto * (coach.porcentaje_comision || 0))
  if (coach.esquema_comision === 'Bono') return coach.pago_extra_clase || 0
  if (coach.esquema_comision === 'Mixto') {
    if (inscripcion.clases?.tipo === 'Privada') return Math.round(coach.tarifa_privada_fija || 0)
    return Math.round(monto * (coach.porcentaje_comision || 0))
  }
  return 0
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
  const [modalClaseId, setModalClaseId] = useState(null) // null=closed, 'new'=nueva, uuid=editar
  const [modalInitialForm, setModalInitialForm] = useState(null)
  const [fechas, setFechas] = useState([])
  const [toast, setToast] = useState('')
  const [filterCoach, setFilterCoach] = useState('')
  const [filterMes, setFilterMes] = useState('')
  const [filterDesde, setFilterDesde] = useState('')
  const [sortCol, setSortCol] = useState('fecha_inicio')
  const [sortDir, setSortDir] = useState('desc')
  const [filterHasta, setFilterHasta] = useState('')
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
      supabase.from('inscripciones').select('*, jugadores(nombre), clases(fecha_inicio, fecha_fin, clases_en_rango, modalidad)'),
    ])
    setCoaches(cs || []); setJugadores(js || [])
    setClases(cl || []); setInscripciones(ins || [])
    if (!form.coach_id && cs?.length) setForm(f => ({ ...f, coach_id: cs[0].id }))
  }

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(''), 3000) }
  const set = (key, val) => setForm(f => ({ ...f, [key]: val }))

  const numClases = form.modalidad === 'Semanal' ? fechas.length : 1
  const participantes = jugadoresClase.length || 1
  const montoPorJugador = calcMonto(form.modalidad, participantes, numClases)

  const busquedaTrimmed = busqueda.trim()
  const jugadoresFiltrados = jugadores.filter(j =>
    (busquedaTrimmed === '' || j.nombre.toLowerCase().includes(busquedaTrimmed.toLowerCase())) &&
    !jugadoresClase.find(jc => jc.jugador_id === j.id)
  )

  const guardarComisionManual = async () => {
    if (!modalComision) return
    const valor = parseFloat(comisionManual)
    if (isNaN(valor)) return
    await supabase.from('inscripciones').update({ comision_override: valor }).eq('id', modalComision.inscripcion.id)
    setModalComision(null)
    showToast('Comisión personalizada guardada ✓')
    fetchAll()
  }

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

  const guardarClase = async () => {
    if (!form.coach_id || jugadoresClase.length === 0 || !form.fecha_inicio) return
    const { data: claseData } = await supabase.from('clases').insert({
      coach_id: form.coach_id, tipo: form.tipo, modalidad: form.modalidad,
      dia: (form.modalidad === 'Semanal' || form.modalidad === 'Promo') && form.dia ? form.dia : null,
      hora: form.hora + ':00', fecha_inicio: form.fecha_inicio,
      fecha_fin: form.modalidad === 'Semanal' ? form.fecha_fin : form.fecha_inicio, activo: true,
    }).select().single()
    if (!claseData) { showToast('Error al guardar'); return }
    await supabase.from('inscripciones').insert(jugadoresClase.map(j => {
      const montoFinal = j._montoProporcional != null ? j._montoProporcional : montoPorJugador
      return {
        clase_id: claseData.id, jugador_id: j.jugador_id,
        metodo_pago: j.metodo, pagado: j.pagado,
        monto_cobrado: montoFinal, mes: form.mes, anio: form.anio,
        fecha_entrada: j.fecha_entrada || null,
      }
    }))
    showToast('Clase registrada ✓')
    setModal(false); setJugadoresClase([]); setForm(emptyForm); fetchAll()
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
    if (filterMes) {
      const ins = inscripciones.filter(i => i.clase_id === c.id)
      if (!ins.some(i => i.mes === filterMes)) return false
    }
    if (filterDesde && c.fecha_inicio < filterDesde) return false
    if (filterHasta && c.fecha_inicio > filterHasta) return false
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
        {isAdmin && <button className="btn btn-primary" onClick={() => { setModalClaseId('new'); setModalInitialForm(null) }}>+ Nueva clase</button>}
      </div>

      {isAdmin && (
        <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
          <select className="form-input" style={{ maxWidth: 180 }} value={filterCoach} onChange={e => setFilterCoach(e.target.value)}>
            <option value="">Todos los coaches</option>
            {coaches.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </select>
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
            <button className="btn btn-secondary btn-sm" onClick={() => { setFilterMes(''); setFilterDesde(''); setFilterHasta('') }}>✕ Limpiar</button>
          )}
        </div>
      )}

      <div className="card" style={{ padding: 0 }}>
        <table className="table">
          <thead><tr>
            {[['coach','Coach'],['tipo','Tipo'],['modalidad','Modalidad'],['horario','Horario'],['jugadores','Jugadores'],['mes','Mes'],['pagos','Pagos']].map(([col, label]) => (
              <th key={col} onClick={() => toggleSort(col)} style={{ cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }}>
                {label}<SortIcon col={col} />
              </th>
            ))}
          </tr></thead>
          <tbody>
            {clasesFiltradas2.length === 0 && (
              <tr><td colSpan={7} style={{ textAlign: 'center', color: 'var(--text2)', padding: 32 }}>Sin clases</td></tr>
            )}
            {clasesFiltradas2.map(c => {
              const ins = inscripciones.filter(i => i.clase_id === c.id)
              const pagados = ins.filter(i => i.pagado).length
              return (
                <tr key={c.id} style={{ cursor: 'pointer' }} onClick={() => setModalClaseId(c.id)}>
                  <td style={{ fontWeight: 600 }}>{c.coaches?.nombre}</td>
                  <td><span className={`badge ${c.tipo === 'Privada' ? 'badge-blue' : 'badge-yellow'}`}>{c.tipo}</span></td>
                  <td><span className={`badge ${c.modalidad === 'Semanal' ? 'badge-green' : c.modalidad === 'Promo' || c.modalidad === 'Cortesía' ? 'badge-gray' : 'badge-blue'}`}>{c.modalidad}</span></td>
                  <td style={{ fontSize: 13 }}>
                    {c.dia && <span>{c.dia} </span>}
                    <span style={{ fontFamily: 'var(--mono)' }}>{c.hora?.slice(0,5)}</span>
                  </td>
                  <td style={{ fontSize: 13 }}>{ins.length} jugador{ins.length !== 1 ? 'es' : ''}</td>
                  <td style={{ fontSize: 13, textTransform: 'capitalize' }}>{ins[0]?.mes || '—'}</td>
                  <td><span className={`badge ${pagados === ins.length && ins.length > 0 ? 'badge-green' : pagados > 0 ? 'badge-yellow' : 'badge-red'}`}>{pagados}/{ins.length}</span></td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {modalClaseId && (
        <ModalClase
          claseId={modalClaseId === 'new' ? null : modalClaseId}
          initialForm={modalInitialForm}
          coaches={coaches}
          jugadores={jugadores}
          inscripcionesList={inscripciones}
          onClose={() => { setModalClaseId(null); setModalInitialForm(null) }}
          onSaved={() => fetchAll()}
        />
      )}
    </div>
  )
}
    </div>
  )
}
