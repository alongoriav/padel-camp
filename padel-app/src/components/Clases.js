import { useState, useEffect } from 'react'
import { supabase } from '../supabase'

const DIAS = ['Lunes','Martes','Miércoles','Jueves','Viernes','Sábado','Domingo']
const HORAS = ['06:00','07:00','08:00','09:00','10:00','11:00','12:00','13:00','14:00','15:00','16:00','17:00','18:00','19:00','20:00','21:00']
const MODALIDADES = ['Semanal','Clase única','Promo','Cortesía']
const TIPOS = ['Privada','Compartida']
const METODOS = ['Efectivo','Tarjeta','Transferencia','Pendiente']
const MESES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre']

function calcFechas(dia, fechaInicio) {
  if (!fechaInicio || !dia) return []
  const diaSemana = { Lunes:1, Martes:2, Miércoles:3, Jueves:4, Viernes:5, Sábado:6, Domingo:0 }[dia]
  const inicio = new Date(fechaInicio + 'T12:00:00')
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
  if (modalidad === 'Semanal') {
    const base4 = (precios[p]?.Semanal || 0) * 4
    return Math.round(base4 * clases / 4)
  }
  return precios[p]?.['Clase única'] || 0
}

function EditableMonto({ inscripcion, onUpdate }) {
  const [editing, setEditing] = useState(false)
  const [valor, setValor] = useState(inscripcion.monto_cobrado || 0)

  const guardar = async () => {
    await supabase.from("inscripciones").update({ monto_cobrado: parseFloat(valor) }).eq("id", inscripcion.id)
    setEditing(false)
    onUpdate()
  }

  if (editing) return (
    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
      <input className="form-input" type="number" value={valor}
        onChange={e => setValor(e.target.value)}
        style={{ maxWidth: 100, padding: "4px 8px", fontSize: 13 }}
        autoFocus onKeyDown={e => e.key === "Enter" && guardar()} />
      <button onClick={guardar} style={{ background: "var(--accent)", border: "none", borderRadius: 6, padding: "4px 8px", fontSize: 12, cursor: "pointer", color: "#000", fontWeight: 600 }}>✓</button>
      <button onClick={() => { setValor(inscripcion.monto_cobrado); setEditing(false) }}
        style={{ background: "var(--bg3)", border: "1px solid var(--border)", borderRadius: 6, padding: "4px 8px", fontSize: 12, cursor: "pointer", color: "var(--text2)" }}>✕</button>
    </div>
  )

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }} onClick={() => setEditing(true)}>
      <span style={{ fontFamily: "var(--mono)", fontSize: 13 }}>${ Number(inscripcion.monto_cobrado).toLocaleString("es-MX")}</span>
      <span style={{ fontSize: 11, color: "var(--text2)" }}>✏️</span>
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
  const [jugadoresClase, setJugadoresClase] = useState([]) // [{jugador_id, nombre, metodo, pagado}]
  const [busqueda, setBusqueda] = useState('')
  const [toast, setToast] = useState('')
  const [filterCoach, setFilterCoach] = useState('')
  const [filterMes, setFilterMes] = useState('')
  // Para agregar jugador en detalle
  const [busquedaDetalle, setBusquedaDetalle] = useState('')
  const isAdmin = usuario?.rol === 'admin'

  useEffect(() => { fetchAll() }, [])

  useEffect(() => {
    if (form.modalidad === 'Semanal' && form.dia && form.fecha_inicio) {
      const fs = calcFechas(form.dia, form.fecha_inicio)
      setFechas(fs)
      if (fs.length > 0) setForm(f => ({ ...f, fecha_fin: fs[fs.length-1].toISOString().split('T')[0] }))
    } else {
      setFechas([])
    }
  }, [form.dia, form.fecha_inicio, form.modalidad])

  const fetchAll = async () => {
    const [{ data: cs }, { data: js }, { data: cl }, { data: ins }] = await Promise.all([
      supabase.from('coaches').select('*').eq('activo', true).order('nombre'),
      supabase.from('jugadores').select('*').eq('activo', true).order('nombre'),
      supabase.from('clases').select('*, coaches(nombre)').order('created_at', { ascending: false }),
      supabase.from('inscripciones').select('*, jugadores(nombre)'),
    ])
    setCoaches(cs || [])
    setJugadores(js || [])
    setClases(cl || [])
    setInscripciones(ins || [])
    if (!form.coach_id && cs?.length) setForm(f => ({ ...f, coach_id: cs[0].id }))
  }

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(''), 3000) }
  const set = (key, val) => setForm(f => ({ ...f, [key]: val }))

  const numClases = form.modalidad === 'Semanal' ? fechas.length : 1
  const participantes = jugadoresClase.length || 1
  const montoPorJugador = calcMonto(form.modalidad, participantes, numClases)

  const jugadoresFiltrados = jugadores.filter(j =>
    j.nombre.toLowerCase().includes(busqueda.toLowerCase()) &&
    !jugadoresClase.find(jc => jc.jugador_id === j.id)
  )

  const agregarJugador = (j) => {
    setJugadoresClase(prev => [...prev, {
      jugador_id: j.id, nombre: j.nombre, metodo: 'Efectivo', pagado: false
    }])
    setBusqueda('')
  }

  const quitarJugador = (id) => setJugadoresClase(prev => prev.filter(j => j.jugador_id !== id))

  const updateJugador = (id, key, val) => {
    setJugadoresClase(prev => prev.map(j => j.jugador_id === id ? { ...j, [key]: val } : j))
  }

  const guardarClase = async () => {
    if (!form.coach_id || jugadoresClase.length === 0 || !form.fecha_inicio) return

    const { data: claseData, error } = await supabase.from('clases').insert({
      coach_id: form.coach_id,
      tipo: form.tipo,
      modalidad: form.modalidad,
      dia: form.modalidad === 'Semanal' ? form.dia : null,
      hora: form.hora + ':00',
      fecha_inicio: form.fecha_inicio,
      fecha_fin: form.modalidad === 'Semanal' ? form.fecha_fin : form.fecha_inicio,
      activo: true,
    }).select().single()

    if (error || !claseData) { showToast('Error al guardar'); return }

    const inserts = jugadoresClase.map(j => ({
      clase_id: claseData.id,
      jugador_id: j.jugador_id,
      metodo_pago: j.metodo,
      pagado: j.pagado,
      monto_cobrado: montoPorJugador,
      mes: form.mes, anio: form.anio,
    }))
    await supabase.from('inscripciones').insert(inserts)

    showToast('Clase registrada ✓')
    setModal(false)
    setJugadoresClase([])
    setForm(emptyForm)
    fetchAll()
  }

  const togglePago = async (ins) => {
    await supabase.from('inscripciones').update({ pagado: !ins.pagado }).eq('id', ins.id)
    fetchAll()
    // Refresh detalle
    if (detalle) {
      const { data } = await supabase.from('inscripciones').select('*, jugadores(nombre)').eq('clase_id', detalle.id)
      setDetalle(d => ({ ...d, _ins: data }))
    }
  }

  const agregarJugadorDetalle = async (j) => {
    const insDetalle = inscripciones.filter(i => i.clase_id === detalle.id)
    const nuevosParticipantes = insDetalle.length + 1
    const nuevaMonto = calcMonto(detalle.modalidad, nuevosParticipantes, 1)

    await supabase.from('inscripciones').insert({
      clase_id: detalle.id,
      jugador_id: j.id,
      metodo_pago: 'Pendiente',
      pagado: false,
      monto_cobrado: nuevaMonto,
      mes: insDetalle[0]?.mes || MESES[new Date().getMonth()],
      anio: 2026,
    })
    setBusquedaDetalle('')
    showToast(`${j.nombre} agregado ✓`)
    fetchAll()
  }

  const clasesFiltradas = clases.filter(c => {
    if (!isAdmin && c.coach_id !== usuario?.coach_id) return false
    if (filterCoach && c.coach_id !== filterCoach) return false
    const insMes = inscripciones.filter(i => i.clase_id === c.id)
    if (filterMes && !insMes.some(i => i.mes === filterMes)) return false
    return true
  })

  const insDetalle = detalle ? inscripciones.filter(i => i.clase_id === detalle.id) : []
  const jugadoresDisponiblesDetalle = jugadores.filter(j =>
    j.nombre.toLowerCase().includes(busquedaDetalle.toLowerCase()) &&
    !insDetalle.find(i => i.jugador_id === j.id)
  )

  return (
    <div style={{ maxWidth: 960 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700 }}>Clases</h1>
          <p style={{ color: 'var(--text2)', fontSize: 14, marginTop: 4 }}>{clasesFiltradas.length} clases</p>
        </div>
        {isAdmin && <button className="btn btn-primary" onClick={() => { setForm(emptyForm); setJugadoresClase([]); setBusqueda(''); setModal(true) }}>+ Nueva clase</button>}
      </div>

      {/* Filtros */}
      {isAdmin && (
        <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
          <select className="form-input" style={{ maxWidth: 200 }} value={filterCoach} onChange={e => setFilterCoach(e.target.value)}>
            <option value="">Todos los coaches</option>
            {coaches.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </select>
          <select className="form-input" style={{ maxWidth: 160, textTransform: 'capitalize' }} value={filterMes} onChange={e => setFilterMes(e.target.value)}>
            <option value="">Todos los meses</option>
            {MESES.map(m => <option key={m} value={m} style={{ textTransform: 'capitalize' }}>{m}</option>)}
          </select>
        </div>
      )}

      <div className="card" style={{ padding: 0 }}>
        <table className="table">
          <thead><tr>
            <th>Coach</th><th>Tipo</th><th>Modalidad</th><th>Horario</th><th>Jugadores</th><th>Mes</th><th>Pagos</th>
          </tr></thead>
          <tbody>
            {clasesFiltradas.length === 0 && (
              <tr><td colSpan={7} style={{ textAlign: 'center', color: 'var(--text2)', padding: 32 }}>Sin clases registradas</td></tr>
            )}
            {clasesFiltradas.map(c => {
              const ins = inscripciones.filter(i => i.clase_id === c.id)
              const pagados = ins.filter(i => i.pagado).length
              return (
                <tr key={c.id} style={{ cursor: 'pointer' }} onClick={() => setDetalle(c)}>
                  <td style={{ fontWeight: 600 }}>{c.coaches?.nombre}</td>
                  <td><span className={`badge ${c.tipo === 'Privada' ? 'badge-blue' : 'badge-yellow'}`}>{c.tipo}</span></td>
                  <td><span className={`badge ${c.modalidad === 'Semanal' ? 'badge-green' : c.modalidad === 'Promo' || c.modalidad === 'Cortesía' ? 'badge-gray' : 'badge-blue'}`}>{c.modalidad}</span></td>
                  <td style={{ fontSize: 13 }}>
                    {c.dia && <span>{c.dia} </span>}
                    <span style={{ fontFamily: 'var(--mono)' }}>{c.hora?.slice(0,5)}</span>
                  </td>
                  <td style={{ fontSize: 13 }}>{ins.length} jugador{ins.length !== 1 ? 'es' : ''}</td>
                  <td style={{ fontSize: 13, textTransform: 'capitalize' }}>{ins[0]?.mes || '—'}</td>
                  <td>
                    <span className={`badge ${pagados === ins.length && ins.length > 0 ? 'badge-green' : pagados > 0 ? 'badge-yellow' : 'badge-red'}`}>
                      {pagados}/{ins.length}
                    </span>
                  </td>
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
            <h2 className="modal-title">Nueva clase</h2>
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
                    <label className="form-label">Día de la semana</label>
                    <select className="form-input" value={form.dia} onChange={e => set('dia', e.target.value)}>
                      {DIAS.map(d => <option key={d}>{d}</option>)}
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Fecha de inicio</label>
                    <input className="form-input" type="date" value={form.fecha_inicio} onChange={e => set('fecha_inicio', e.target.value)} />
                  </div>
                </div>
              ) : (
                <div className="form-group">
                  <label className="form-label">Fecha de la clase</label>
                  <input className="form-input" type="date" value={form.fecha_inicio} onChange={e => set('fecha_inicio', e.target.value)} />
                </div>
              )}

              {form.modalidad === 'Semanal' && fechas.length > 0 && (
                <div style={{ background: 'rgba(0,229,160,.06)', border: '1px solid rgba(0,229,160,.2)', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: 'var(--text2)' }}>
                  📅 {fechas.length} clases: {fechas.map(f => f.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })).join(' · ')}
                </div>
              )}

              <div className="grid-2">
                <div className="form-group">
                  <label className="form-label">Mes de cobro</label>
                  <select className="form-input" value={form.mes} onChange={e => set('mes', e.target.value)}>
                    {MESES.map(m => <option key={m}>{m}</option>)}
                  </select>
                </div>
              </div>

              {/* Agregar jugadores */}
              <div style={{ borderTop: '1px solid var(--border)', paddingTop: 14 }}>
                <label className="form-label" style={{ marginBottom: 8, display: 'block' }}>
                  Jugadores {jugadoresClase.length > 0 && <span style={{ color: 'var(--accent)' }}>({jugadoresClase.length})</span>}
                </label>

                <div style={{ position: 'relative', marginBottom: 10 }}>
                  <input className="form-input" placeholder="Buscar y agregar jugador..."
                    value={busqueda} onChange={e => setBusqueda(e.target.value)} />
                  {busqueda && jugadoresFiltrados.length > 0 && (
                    <div style={{
                      position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 10,
                      background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 8,
                      maxHeight: 200, overflowY: 'auto', boxShadow: '0 8px 24px rgba(0,0,0,.4)'
                    }}>
                      {jugadoresFiltrados.slice(0, 8).map(j => (
                        <div key={j.id} onClick={() => agregarJugador(j)}
                          style={{ padding: '10px 14px', cursor: 'pointer', fontSize: 14, borderBottom: '1px solid var(--border)' }}
                          onMouseEnter={e => e.currentTarget.style.background = 'var(--border)'}
                          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                          {j.nombre}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {jugadoresClase.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {jugadoresClase.map(j => (
                      <div key={j.jugador_id} style={{
                        display: 'flex', alignItems: 'center', gap: 10,
                        background: 'var(--bg3)', borderRadius: 8, padding: '10px 12px',
                        border: '1px solid var(--border)'
                      }}>
                        <div style={{ fontWeight: 500, fontSize: 14, flex: 1 }}>{j.nombre}</div>
                        <select className="form-input" value={j.metodo} style={{ maxWidth: 140 }}
                          onChange={e => updateJugador(j.jugador_id, 'metodo', e.target.value)}>
                          {METODOS.map(m => <option key={m}>{m}</option>)}
                        </select>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 13, whiteSpace: 'nowrap' }}>
                          <input type="checkbox" checked={j.pagado}
                            onChange={e => updateJugador(j.jugador_id, 'pagado', e.target.checked)} />
                          Pagado
                        </label>
                        <button onClick={() => quitarJugador(j.jugador_id)}
                          style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer', fontSize: 16 }}>✕</button>
                      </div>
                    ))}
                  </div>
                )}

                {jugadoresClase.length === 0 && (
                  <p style={{ fontSize: 13, color: 'var(--text2)', textAlign: 'center', padding: '12px 0' }}>
                    Busca y agrega jugadores arriba
                  </p>
                )}
              </div>

              {/* Resumen precio */}
              {jugadoresClase.length > 0 && (
                <div style={{ background: 'rgba(0,229,160,.08)', border: '1px solid rgba(0,229,160,.2)', borderRadius: 8, padding: '12px 16px' }}>
                  <div style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 4 }}>Precio calculado automáticamente</div>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 22, fontWeight: 700, color: 'var(--accent)' }}>
                    ${montoPorJugador.toLocaleString('es-MX')}
                    <span style={{ fontSize: 13, fontWeight: 400, color: 'var(--text2)' }}> por jugador</span>
                  </div>
                  {jugadoresClase.length > 1 && (
                    <div style={{ fontSize: 13, color: 'var(--text2)', marginTop: 2 }}>
                      Total grupo: ${(montoPorJugador * jugadoresClase.length).toLocaleString('es-MX')} · {jugadoresClase.length} jugadores
                    </div>
                  )}
                  <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 2 }}>
                    {form.modalidad === 'Semanal' ? `${numClases} clases en el mes` : 'Clase única'}
                  </div>
                </div>
              )}

              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 4 }}>
                <button className="btn btn-secondary" onClick={() => setModal(false)}>Cancelar</button>
                <button className="btn btn-primary" onClick={guardarClase}
                  disabled={!form.coach_id || jugadoresClase.length === 0 || !form.fecha_inicio}>
                  Registrar clase
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal detalle clase */}
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
                  <span style={{ fontSize: 13, color: 'var(--text2)', fontFamily: 'var(--mono)' }}>🕐 {detalle.hora?.slice(0,5)}</span>
                </div>
              </div>
              <button className="btn btn-secondary btn-sm" onClick={() => setDetalle(null)}>Cerrar</button>
            </div>

            <table className="table" style={{ marginBottom: 16 }}>
              <thead><tr><th>Jugador</th><th>Monto</th><th>Método</th><th>Pago</th></tr></thead>
              <tbody>
                {insDetalle.map(i => (
                  <tr key={i.id}>
                    <td style={{ fontWeight: 500 }}>{i.jugadores?.nombre}</td>
                    <td><EditableMonto inscripcion={i} onUpdate={fetchAll} /></td>
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

            {/* Agregar jugador al grupo existente */}
            <div style={{ borderTop: '1px solid var(--border)', paddingTop: 14 }}>
              <label className="form-label" style={{ marginBottom: 8, display: 'block' }}>Agregar jugador al grupo</label>
              <div style={{ position: 'relative' }}>
                <input className="form-input" placeholder="Buscar jugador..."
                  value={busquedaDetalle} onChange={e => setBusquedaDetalle(e.target.value)} />
                {busquedaDetalle && jugadoresDisponiblesDetalle.length > 0 && (
                  <div style={{
                    position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 10,
                    background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 8,
                    maxHeight: 180, overflowY: 'auto', boxShadow: '0 8px 24px rgba(0,0,0,.4)'
                  }}>
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
          </div>
        </div>
      )}

      {toast && <div className="toast"><span style={{ color: 'var(--accent)' }}>✓</span>{toast}</div>}
    </div>
  )
}
