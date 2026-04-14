import { useState, useEffect } from 'react'
import { supabase } from '../supabase'

const MESES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre']
const COLORS = ['#00e5a0','#0066ff','#f97316','#a78bfa','#f472b6','#facc15','#22d3ee','#f87171']

function BarChart({ data, height = 120 }) {
  if (!data?.length) return null
  const max = Math.max(...data.map(d => d.value)) || 1
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: height + 30, paddingTop: 8 }}>
      {data.map((d, i) => (
        <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
          <div style={{ fontSize: 9, color: 'var(--text2)', fontFamily: 'var(--mono)' }}>
            {d.value > 0 ? '$' + Math.round(d.value / 1000) + 'k' : ''}
          </div>
          <div style={{ width: '100%', borderRadius: '4px 4px 0 0', background: d.color || '#00e5a0', height: `${Math.max((d.value / max) * height, 2)}px`, transition: 'height .3s ease' }} />
          <div style={{ fontSize: 9, color: 'var(--text2)', textAlign: 'center', whiteSpace: 'nowrap', overflow: 'hidden', width: '100%', textOverflow: 'ellipsis' }}>{d.label}</div>
        </div>
      ))}
    </div>
  )
}

function MultiBar({ data, keys, colors, height = 100 }) {
  if (!data?.length) return null
  const max = Math.max(...data.flatMap(d => keys.map(k => d[k] || 0))) || 1
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: height + 30 }}>
      {data.map((d, i) => (
        <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, width: '100%', height }}>
            {keys.map((k, j) => (
              <div key={k} style={{ flex: 1, borderRadius: '4px 4px 0 0', background: colors[j], height: `${Math.max((d[k] / max) * height, 3)}px`, transition: 'height .4s ease', alignSelf: 'flex-end' }} />
            ))}
          </div>
          <div style={{ fontSize: 9, color: 'var(--text2)', textAlign: 'center', textTransform: 'capitalize', whiteSpace: 'nowrap', overflow: 'hidden', width: '100%', textOverflow: 'ellipsis' }}>{d.label}</div>
        </div>
      ))}
    </div>
  )
}

function DonutChart({ data, size = 120 }) {
  if (!data?.length) return null
  const total = data.reduce((a, d) => a + d.value, 0)
  if (total === 0) return null
  let cumulative = 0
  const segments = data.map(d => { const pct = d.value / total; const start = cumulative; cumulative += pct; return { ...d, start, pct } })
  const r = 45, cx = 60, cy = 60, stroke = 18, circumference = 2 * Math.PI * r
  return (
    <div style={{ position: 'relative', width: size, height: size }}>
      <svg width={size} height={size} viewBox="0 0 120 120">
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#1e2535" strokeWidth={stroke} />
        {segments.map((s, i) => (
          <circle key={i} cx={cx} cy={cy} r={r} fill="none" stroke={s.color} strokeWidth={stroke}
            strokeDasharray={`${s.pct * circumference} ${circumference}`}
            strokeDashoffset={-s.start * circumference}
            transform={`rotate(-90 ${cx} ${cy})`} />
        ))}
        <text x={cx} y={cy - 4} textAnchor="middle" fill="#e8edf5" fontSize="11" fontWeight="bold">{Math.round(total / 1000)}k</text>
        <text x={cx} y={cy + 10} textAnchor="middle" fill="#8b96b0" fontSize="7">total</text>
      </svg>
    </div>
  )
}

function calcComisionCoach(coach, clasesPagadas, ingresoTeorico) {
  if (!coach) return { comision: 0, base: 0 }
  let base = 0, comisionClases = 0
  if (coach.esquema_comision === 'Porcentaje') {
    base = coach.sueldo_base || 0
    const neto = coach.aplica_iva ? ingresoTeorico / 1.16 : ingresoTeorico
    comisionClases = neto * (coach.porcentaje_comision || 0)
  } else if (coach.esquema_comision === 'Bono') {
    const horasMin = coach.horas_base_bono || 40
    const pctAlcance = clasesPagadas / horasMin
    let pctBase = pctAlcance >= 1.0 ? (coach.tramo4_pct ?? 1.0) : pctAlcance > 0.6 ? (coach.tramo3_pct ?? 0.7) : pctAlcance > 0.3 ? (coach.tramo2_pct ?? 0.5) : (coach.tramo1_pct ?? 0.3)
    base = (coach.sueldo_base || 0) * pctBase
    comisionClases = Math.max(0, clasesPagadas - (coach.clases_base || 0)) * (coach.pago_extra_clase || 0)
  } else if (coach.esquema_comision === 'Mixto') {
    base = coach.sueldo_base || 0
    const neto = coach.aplica_iva ? ingresoTeorico / 1.16 : ingresoTeorico
    comisionClases = clasesPagadas * (coach.tarifa_privada_fija || 0) + neto * (coach.porcentaje_comision || 0)
  }
  return { comision: base + comisionClases, base, comisionClases }
}

export default function Dashboard({ usuario }) {
  const [inscripciones, setInscripciones] = useState([])
  const [coachesData, setCoachesData] = useState([])
  const [modoFiltro, setModoFiltro] = useState('mes')
  const [mesSeleccionado, setMesSeleccionado] = useState(MESES[new Date().getMonth()])
  const [desde, setDesde] = useState('')
  const [hasta, setHasta] = useState('')
  const [loading, setLoading] = useState(true)
  const [modalCorte, setModalCorte] = useState(false)
  const [fechaCorte, setFechaCorte] = useState(new Date().toISOString().split('T')[0])
  const [generando, setGenerando] = useState(false)

  useEffect(() => { fetchData() }, [])

  const fetchData = async () => {
    const [{ data: ins }, { data: cs }] = await Promise.all([
      supabase.from('inscripciones').select('*, jugadores(nombre), clases(coach_id, tipo, modalidad, dia, hora, fecha_inicio, coaches(nombre))'),
      supabase.from('coaches').select('*').eq('activo', true),
    ])
    setInscripciones(ins || [])
    setCoachesData(cs || [])
    setLoading(false)
  }

  // Filter inscriptions based on mode
  const filtered = inscripciones.filter(i => {
    if (modoFiltro === 'mes') return i.mes === mesSeleccionado
    if (modoFiltro === 'rango') {
      const fecha = i.clases?.fecha_inicio
      if (!fecha) return false
      if (desde && fecha < desde) return false
      if (hasta && fecha > hasta) return false
      return true
    }
    return true
  })

  const fmt = (n) => '$' + Math.round(n || 0).toLocaleString('es-MX')
  const pct = (a, b) => b > 0 ? ((a / b) * 100).toFixed(1) + '%' : '—'

  const labelPeriodo = modoFiltro === 'mes' ? mesSeleccionado : desde && hasta ? `${desde} → ${hasta}` : desde ? `Desde ${desde}` : hasta ? `Hasta ${hasta}` : 'Todo'

  // KPIs
  const totalProgramado = filtered.reduce((a, i) => a + (i.monto_cobrado || 0), 0)
  const totalCobrado = filtered.filter(i => i.pagado).reduce((a, i) => a + (i.monto_cobrado || 0), 0)
  const totalPendiente = filtered.filter(i => !i.pagado).reduce((a, i) => a + (i.monto_cobrado || 0), 0)
  const totalClases = new Set(filtered.map(i => i.clase_id)).size
  const jugadoresActivos = new Set(filtered.map(i => i.jugador_id)).size
  const tasaCobro = pct(totalCobrado, totalProgramado)

  // Evolución — por mes si modo mes (todos los meses), por día/semana si rango
  const evolucionData = modoFiltro === 'mes'
    ? (() => {
        return MESES.map(mes => {
          const insMes = inscripciones.filter(i => i.mes === mes)
          const cobrado = insMes.filter(i => i.pagado).reduce((a, i) => a + (i.monto_cobrado || 0), 0)
          const pendiente = insMes.filter(i => !i.pagado).reduce((a, i) => a + (i.monto_cobrado || 0), 0)
          return { label: mes.slice(0, 3), cobrado, pendiente }
        }).filter(m => m.cobrado + m.pendiente > 0)
      })()
    : (() => {
        // Group by month within range
        const map = {}
        filtered.forEach(i => {
          const k = i.mes || 'Sin mes'
          if (!map[k]) map[k] = { label: k.slice(0, 3), cobrado: 0, pendiente: 0 }
          if (i.pagado) map[k].cobrado += i.monto_cobrado || 0
          else map[k].pendiente += i.monto_cobrado || 0
        })
        return Object.values(map).sort((a, b) => MESES.indexOf(MESES.find(m => m.startsWith(a.label)) || '') - MESES.indexOf(MESES.find(m => m.startsWith(b.label)) || ''))
      })()

  // Por coach con comisión
  const porCoach = (() => {
    const map = {}
    filtered.forEach(i => {
      const coachNombre = i.clases?.coaches?.nombre || 'Sin coach'
      const coachId = i.clases?.coach_id
      if (!map[coachNombre]) map[coachNombre] = { nombre: coachNombre, coachId, programado: 0, cobrado: 0, clases: new Set(), clasesPagadas: new Set() }
      map[coachNombre].programado += i.monto_cobrado || 0
      if (i.pagado) { map[coachNombre].cobrado += i.monto_cobrado || 0; map[coachNombre].clasesPagadas.add(i.clase_id) }
      map[coachNombre].clases.add(i.clase_id)
    })
    return Object.values(map).map(c => {
      const coach = coachesData.find(cd => cd.id === c.coachId)
      const clasesPagadasCount = c.clasesPagadas.size
      const { comision, base, comisionClases } = calcComisionCoach(coach, clasesPagadasCount, c.cobrado)
      // Un solo % : total pagado al coach / total cobrado por sus clases
      const pctComision = '0'
      const pctTotal = c.cobrado > 0 ? ((comision / c.cobrado) * 100).toFixed(1) : '0'
      return { ...c, clases: c.clases.size, clasesPagadas: clasesPagadasCount, pendiente: c.programado - c.cobrado, comision, base, comisionClases, pctComision, pctTotal }
    }).sort((a, b) => b.programado - a.programado)
  })()

  // Top jugadores
  const topJugadores = (() => {
    const map = {}
    filtered.filter(i => i.pagado).forEach(i => {
      const nombre = i.jugadores?.nombre || '—'
      if (!map[nombre]) map[nombre] = 0
      map[nombre] += i.monto_cobrado || 0
    })
    return Object.entries(map).map(([nombre, total]) => ({ nombre, total })).sort((a, b) => b.total - a.total).slice(0, 8)
  })()

  // Distribución tipo
  const distTipo = (() => {
    const privadas = filtered.filter(i => i.clases?.tipo === 'Privada')
    const compartidas = filtered.filter(i => i.clases?.tipo === 'Compartida')
    return [
      { label: 'Privada', value: privadas.reduce((a, i) => a + (i.monto_cobrado || 0), 0), color: '#0066ff', count: new Set(privadas.map(i => i.clase_id)).size },
      { label: 'Compartida', value: compartidas.reduce((a, i) => a + (i.monto_cobrado || 0), 0), color: '#a78bfa', count: new Set(compartidas.map(i => i.clase_id)).size },
    ]
  })()

  // Mejores horarios
  const mejoresHorarios = (() => {
    const map = {}
    filtered.filter(i => i.pagado).forEach(i => {
      const hora = i.clases?.hora?.slice(0, 5) || '—'
      if (!map[hora]) map[hora] = { hora, total: 0 }
      map[hora].total += i.monto_cobrado || 0
    })
    return Object.values(map).sort((a, b) => b.total - a.total).slice(0, 8)
  })()

  // Recontrataciones — compara mes actual vs anterior, o acumulado en rango
  const recontrataciones = (() => {
    const result = {}
    if (modoFiltro === 'mes') {
      // Comparar jugadores del mes seleccionado vs mes anterior
      const mesIdx = MESES.indexOf(mesSeleccionado)
      const mesAnterior = mesIdx > 0 ? MESES[mesIdx - 1] : null
      const jugadoresMesActual = {}
      const jugadoresMesAnterior = {}
      inscripciones.forEach(i => {
        const coach = i.clases?.coaches?.nombre || 'Sin coach'
        if (i.mes === mesSeleccionado) {
          if (!jugadoresMesActual[coach]) jugadoresMesActual[coach] = new Set()
          jugadoresMesActual[coach].add(i.jugador_id)
        }
        if (mesAnterior && i.mes === mesAnterior) {
          if (!jugadoresMesAnterior[coach]) jugadoresMesAnterior[coach] = new Set()
          jugadoresMesAnterior[coach].add(i.jugador_id)
        }
      })
      Object.keys(jugadoresMesActual).forEach(coach => {
        const actual = jugadoresMesActual[coach] || new Set()
        const anterior = jugadoresMesAnterior[coach] || new Set()
        const recontratados = [...actual].filter(j => anterior.has(j)).length
        result[coach] = {
          total: actual.size,
          recontratados,
          pct: actual.size > 0 ? Math.round((recontratados / actual.size) * 100) : 0,
          label: mesAnterior ? `vs ${mesAnterior}` : 'sin mes anterior'
        }
      })
    } else {
      // Acumulado: jugadores que aparecen en 2+ meses dentro del rango
      const coachJugadorMes = {}
      filtered.forEach(i => {
        const coach = i.clases?.coaches?.nombre || 'Sin coach'
        const mes = MESES.indexOf(i.mes)
        if (mes < 0) return
        if (!coachJugadorMes[coach]) coachJugadorMes[coach] = {}
        if (!coachJugadorMes[coach][i.jugador_id]) coachJugadorMes[coach][i.jugador_id] = new Set()
        coachJugadorMes[coach][i.jugador_id].add(mes)
      })
      Object.entries(coachJugadorMes).forEach(([coach, jugadores]) => {
        let recontratados = 0, totalJugadores = Object.keys(jugadores).length
        Object.values(jugadores).forEach(meses => { if (meses.size >= 2) recontratados++ })
        result[coach] = { total: totalJugadores, recontratados, pct: totalJugadores > 0 ? Math.round((recontratados / totalJugadores) * 100) : 0, label: 'acumulado' }
      })
    }
    return result
  })()

  // Distribución modalidad
  const distModalidad = (() => {
    const map = {}, clasesSet = new Set()
    filtered.forEach(i => {
      if (clasesSet.has(i.clase_id)) return
      clasesSet.add(i.clase_id)
      const m = i.clases?.modalidad || '—'
      if (!map[m]) map[m] = 0
      map[m]++
    })
    return Object.entries(map).map(([label, value], i) => ({ label, value, color: COLORS[i] }))
  })()

  const checkInStats = (() => {
    const checkIns = filtered.filter(i => i.metodo_pago === 'Check-in')
    return { count: checkIns.length, pendienteComplemento: checkIns.filter(i => !i.complemento_pagado).reduce((a, i) => a + (i.monto_complemento || 0), 0) }
  })()

  const generarCorte = async () => {
    setGenerando(true)
    const { data: insDetalle } = await supabase.from('inscripciones').select('*, jugadores(nombre), clases(coach_id, dia, hora, tipo, modalidad, coaches(nombre)))').eq('pagado', true).eq('fecha_pago', fechaCorte)
    const pagos = insDetalle || []
    const cargar = () => { if (window.jspdf) { ejecutar(pagos); return }; const s = document.createElement('script'); s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js'; s.onload = () => ejecutar(pagos); document.head.appendChild(s) }
    const ejecutar = (pagos) => {
      const { jsPDF } = window.jspdf; const doc = new jsPDF({ unit: 'mm', format: 'a4' }); const W = 210, M = 16
      const f = (n) => '$' + Math.round(n||0).toLocaleString('es-MX')
      const t = (text, x, y, size=9, bold=false, color=[40,50,70], align='left') => { doc.setFontSize(size); doc.setFont('helvetica', bold ? 'bold' : 'normal'); doc.setTextColor(...color); doc.text(String(text||''), x, y, {align}) }
      const fechaFmt = new Date(fechaCorte+'T12:00:00').toLocaleDateString('es-MX',{weekday:'long',day:'numeric',month:'long',year:'numeric'})
      doc.setFillColor(15,17,26); doc.rect(0,0,W,30,'F'); doc.setFillColor(0,229,160); doc.rect(0,0,4,30,'F')
      t('PADEL CAMP',M+4,11,16,true,[0,229,160]); t('Corte de Caja',M+4,19,10,false,[160,175,200]); t(fechaFmt.charAt(0).toUpperCase()+fechaFmt.slice(1),M+4,26,8,false,[100,120,150])
      let y = 38
      const metodos = {}
      pagos.forEach(p => { const m = p.metodo_pago||'Sin método'; if (!metodos[m]) metodos[m]={total:0,pagos:[]}; metodos[m].total+=p.monto_cobrado||0; metodos[m].pagos.push(p) })
      const totalDia = pagos.reduce((a,p)=>a+(p.monto_cobrado||0),0)
      const items = [{label:'Total',val:f(totalDia),color:[0,229,160]},{label:'Efectivo',val:f(metodos['Efectivo']?.total||0),color:[250,204,21]},{label:'Tarjeta',val:f(metodos['Tarjeta']?.total||0),color:[74,148,255]},{label:'Transferencia',val:f(metodos['Transferencia']?.total||0),color:[167,139,250]}]
      const cw=(W-M*2)/4
      items.forEach((s,i)=>{ const x=M+i*cw; doc.setFillColor(20,26,42); doc.rect(x,y,cw-2,18,'F'); t(s.val,x+cw/2-1,y+9,12,true,s.color,'center'); t(s.label,x+cw/2-1,y+15,7,false,[90,110,140],'center') })
      y+=24; t(`${pagos.length} cobros del día`,M,y,8,false,[80,100,130]); y+=8
      if (!pagos.length) { doc.setFillColor(20,26,42); doc.rect(M,y,W-M*2,20,'F'); t('Sin cobros para esta fecha',W/2,y+11,10,false,[80,100,130],'center') }
      else {
        Object.entries(metodos).forEach(([metodo,data])=>{
          if(y>240){doc.addPage();y=M}
          const mc=metodo==='Efectivo'?[250,204,21]:metodo==='Tarjeta'?[74,148,255]:[167,139,250]
          doc.setFillColor(18,24,38); doc.rect(M,y,W-M*2,8,'F'); doc.setFillColor(...mc); doc.rect(M,y,3,8,'F')
          t(metodo.toUpperCase(),M+6,y+5,8,true,mc); t(f(data.total),W-M,y+5,9,true,mc,'right'); y+=10
          doc.setFillColor(15,20,32); doc.rect(M,y,W-M*2,5.5,'F')
          t('Jugador',M+2,y+4,7,true,[100,120,150]); t('Coach',M+48,y+4,7,true,[100,120,150]); t('Horario',M+80,y+4,7,true,[100,120,150]); t('Tipo',M+102,y+4,7,true,[100,120,150]); t('Monto',W-M-2,y+4,7,true,[100,120,150],'right'); y+=6
          data.pagos.forEach((p,i)=>{ if(y>270){doc.addPage();y=M}; doc.setFillColor(i%2===0?[16,20,32]:[19,24,38]); doc.rect(M,y,W-M*2,5.5,'F'); t(String(p.jugadores?.nombre||'—').substring(0,18),M+2,y+4,7.5,false,[200,215,240]); t(String(p.clases?.coaches?.nombre||'—').substring(0,12),M+48,y+4,7.5,false,[160,175,200]); t((p.clases?.hora?.slice(0,5)||'—'),M+80,y+4,7.5,false,[140,160,190]); t(p.clases?.tipo||'—',M+102,y+4,7.5,false,[140,160,190]); t(f(p.monto_cobrado),W-M-2,y+4,8,true,[200,220,255],'right'); y+=5.5 })
          doc.setFillColor(18,24,38); doc.rect(M,y,W-M*2,6,'F'); t(`Subtotal ${metodo}`,M+4,y+4,7.5,false,[100,120,150]); t(f(data.total),W-M-2,y+4,8,true,mc,'right'); y+=10
        })
        doc.setFillColor(0,229,160); doc.rect(M,y,W-M*2,0.5,'F'); y+=5
        t('TOTAL COBRADO DEL DÍA',M,y,10,true,[160,180,210]); t(f(totalDia),W-M,y,14,true,[0,229,160],'right')
      }
      const pages=doc.getNumberOfPages(); for(let i=1;i<=pages;i++){doc.setPage(i);doc.setFontSize(7);doc.setTextColor(60,80,110);doc.text(`Padel Camp · Corte de Caja · ${fechaCorte}`,M,293);doc.text(`${i}/${pages}`,W-M,293,{align:'right'})}
      doc.save(`corte_caja_${fechaCorte}.pdf`); setGenerando(false); setModalCorte(false)
    }
    cargar()
  }

  if (loading) return <div style={{ color: 'var(--text2)', padding: 40, textAlign: 'center' }}>Cargando...</div>

  return (
    <div style={{ maxWidth: 1000 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700 }}>Dashboard</h1>
          <p style={{ color: 'var(--text2)', fontSize: 13, marginTop: 3 }}>
            Programado = total facturado · Cobrado = pagos recibidos · Pendiente = por cobrar
          </p>
          <p style={{ color: 'var(--accent)', fontSize: 13, marginTop: 2, fontWeight: 600, textTransform: 'capitalize' }}>
            📅 {labelPeriodo}
          </p>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'flex-end' }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button className="btn btn-secondary btn-sm" onClick={() => setModalCorte(true)}>🧾 Corte de caja</button>
          </div>
          {/* Mode toggle */}
          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={() => setModoFiltro('mes')} style={{ padding: '7px 14px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 13, background: modoFiltro === 'mes' ? 'var(--accent)' : 'var(--bg3)', color: modoFiltro === 'mes' ? '#000' : 'var(--text2)', fontWeight: modoFiltro === 'mes' ? 600 : 400 }}>Por mes</button>
            <button onClick={() => setModoFiltro('rango')} style={{ padding: '7px 14px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 13, background: modoFiltro === 'rango' ? 'var(--accent)' : 'var(--bg3)', color: modoFiltro === 'rango' ? '#000' : 'var(--text2)', fontWeight: modoFiltro === 'rango' ? 600 : 400 }}>Rango de fechas</button>
          </div>
          {modoFiltro === 'mes' && (
            <select className="form-input" style={{ maxWidth: 180, textTransform: 'capitalize' }} value={mesSeleccionado} onChange={e => setMesSeleccionado(e.target.value)}>
              {MESES.map(m => <option key={m} value={m} style={{ textTransform: 'capitalize' }}>{m}</option>)}
            </select>
          )}
          {modoFiltro === 'rango' && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input className="form-input" type="date" value={desde} onChange={e => setDesde(e.target.value)} style={{ maxWidth: 150 }} />
              <span style={{ color: 'var(--text2)', fontSize: 13 }}>→</span>
              <input className="form-input" type="date" value={hasta} onChange={e => setHasta(e.target.value)} style={{ maxWidth: 150 }} />
              {(desde || hasta) && <button className="btn btn-secondary btn-sm" onClick={() => { setDesde(''); setHasta('') }}>✕</button>}
            </div>
          )}
        </div>
      </div>

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 12, marginBottom: 24 }}>
        {[
          { label: 'Programado', value: fmt(totalProgramado), color: 'var(--text)', sub: '100% facturado' },
          { label: 'Cobrado', value: fmt(totalCobrado), color: 'var(--accent)', sub: tasaCobro + ' del total' },
          { label: 'Pendiente', value: fmt(totalPendiente), color: 'var(--warn)', sub: pct(totalPendiente, totalProgramado) + ' sin cobrar' },
          { label: 'Clases', value: totalClases, color: 'var(--accent2)', sub: 'impartidas' },
          { label: 'Jugadores', value: jugadoresActivos, color: '#a78bfa', sub: 'activos' },
          { label: 'Tasa cobro', value: tasaCobro, color: totalCobrado / totalProgramado > 0.8 ? 'var(--accent)' : 'var(--warn)', sub: 'efectividad' },
          { label: 'Check-ins', value: checkInStats.count, color: '#f97316', sub: `$${Math.round(checkInStats.pendienteComplemento / 1000)}k compl. pend.` },
        ].map(k => (
          <div className="stat-card" key={k.label} style={{ padding: 12 }}>
            <div style={{ fontSize: 9, color: 'var(--text2)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '.05em' }}>{k.label}</div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 16, fontWeight: 700, color: k.color }}>{k.value}</div>
            <div style={{ fontSize: 10, color: 'var(--text2)', marginTop: 3 }}>{k.sub}</div>
          </div>
        ))}
      </div>

      {/* Evolución + Tipo */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16, marginBottom: 16 }}>
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <h3 style={{ fontSize: 14, fontWeight: 600 }}>
              {modoFiltro === 'mes' ? 'Evolución anual 2026' : `Evolución · ${labelPeriodo}`}
            </h3>
            <div style={{ display: 'flex', gap: 12, fontSize: 11 }}>
              {[{ color: '#00e5a0', label: 'Cobrado' }, { color: '#ffa502', label: 'Pendiente' }].map(l => (
                <span key={l.label} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ width: 8, height: 8, borderRadius: 2, background: l.color, display: 'inline-block' }} />
                  <span style={{ color: 'var(--text2)' }}>{l.label}</span>
                </span>
              ))}
            </div>
          </div>
          <MultiBar data={evolucionData} keys={['cobrado', 'pendiente']} colors={['#00e5a0', '#ffa502']} height={110} />
        </div>
        <div className="card">
          <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>Tipo de clase</h3>
          <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
            <DonutChart data={distTipo} size={110} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, flex: 1 }}>
              {distTipo.map(d => (
                <div key={d.label}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 3 }}>
                    <span style={{ color: d.color, fontWeight: 600 }}>{d.label}</span>
                    <span style={{ color: 'var(--text2)', fontFamily: 'var(--mono)', fontSize: 11 }}>{pct(d.value, totalProgramado)}</span>
                  </div>
                  <div style={{ height: 4, borderRadius: 2, background: 'var(--bg3)' }}>
                    <div style={{ height: '100%', borderRadius: 2, background: d.color, width: pct(d.value, totalProgramado) }} />
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--text2)', marginTop: 2 }}>{d.count} clases · {fmt(d.value)}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Por coach con % comisión */}
      <div className="card" style={{ marginBottom: 16 }}>
        <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 16 }}>Ingresos y comisiones por coach</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
          {porCoach.filter(c => c.nombre !== 'Sin coach').map((c, i) => (
            <div key={c.nombre} style={{ background: 'var(--bg3)', borderRadius: 10, padding: 14, border: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{c.nombre}</div>
                <div style={{ fontSize: 11, color: 'var(--text2)' }}>{c.clasesPagadas} clases pagadas</div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 10 }}>
                <div style={{ background: 'var(--bg2)', borderRadius: 6, padding: '6px 8px' }}>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 13, fontWeight: 700, color: 'var(--accent)' }}>{fmt(c.cobrado)}</div>
                  <div style={{ fontSize: 10, color: 'var(--text2)' }}>Cobrado</div>
                </div>
                <div style={{ background: 'var(--bg2)', borderRadius: 6, padding: '6px 8px' }}>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 13, fontWeight: 700, color: 'var(--warn)' }}>{fmt(c.pendiente)}</div>
                  <div style={{ fontSize: 10, color: 'var(--text2)' }}>Pendiente</div>
                </div>
              </div>
              {/* % comisión */}
              <div style={{ background: 'var(--bg2)', borderRadius: 8, padding: '10px 12px', marginBottom: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <span style={{ fontSize: 11, color: 'var(--text2)' }}>% costo coach s/ cobrado</span>
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 16, fontWeight: 700, color: c.pctTotal > 80 ? 'var(--danger)' : c.pctTotal > 60 ? 'var(--warn)' : 'var(--accent)' }}>{c.pctTotal}%</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 11, color: 'var(--text2)' }}>Total a pagar</span>
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{fmt(c.comision)}</span>
                </div>
              </div>
              <div style={{ height: 6, borderRadius: 3, background: 'var(--bg2)', overflow: 'hidden' }}>
                <div style={{ height: '100%', borderRadius: 3, background: 'var(--accent)', width: pct(c.cobrado, c.programado) }} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text2)', marginTop: 4 }}>
                <span>Programado: {fmt(c.programado)}</span>
                <span style={{ color: 'var(--accent)' }}>{pct(c.cobrado, c.programado)} cobrado</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Top jugadores + Mejores horarios */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
        <div className="card">
          <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 14 }}>Top jugadores por ingreso</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {topJugadores.map((j, i) => (
              <div key={j.nombre} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 20, height: 20, borderRadius: 6, background: COLORS[i % COLORS.length], display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: '#0d1117', flexShrink: 0 }}>{i + 1}</div>
                <div style={{ flex: 1, fontSize: 13 }}>{j.nombre}</div>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--accent)', fontWeight: 600 }}>{fmt(j.total)}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="card">
          <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 14 }}>Mejores horarios</h3>
          <BarChart data={mejoresHorarios.map((h, i) => ({ label: h.hora, value: h.total, color: COLORS[i % COLORS.length] }))} height={130} />
        </div>
      </div>

      {/* Modalidad */}
      <div className="card" style={{ marginBottom: 16 }}>
        <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 14 }}>Distribución por modalidad</h3>
        <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
          <DonutChart data={distModalidad} size={120} />
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, flex: 1 }}>
            {distModalidad.map(d => (
              <div key={d.label} style={{ background: 'var(--bg3)', borderRadius: 8, padding: '8px 14px', border: `1px solid ${d.color}33` }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                  <div style={{ width: 8, height: 8, borderRadius: 2, background: d.color }} />
                  <span style={{ fontSize: 12, fontWeight: 600, color: d.color }}>{d.label}</span>
                </div>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 18, fontWeight: 700 }}>{d.value}</div>
                <div style={{ fontSize: 10, color: 'var(--text2)' }}>{pct(d.value, distModalidad.reduce((a, x) => a + x.value, 0))} del total</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Recontrataciones */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ marginBottom: 14 }}>
          <h3 style={{ fontSize: 14, fontWeight: 600 }}>Recontrataciones por coach</h3>
          <p style={{ fontSize: 12, color: 'var(--text2)', marginTop: 3 }}>Jugadores que repiten con el mismo coach en 2+ meses — mide fidelización y eficacia</p>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
          {Object.entries(recontrataciones).filter(([c]) => c !== 'Sin coach').map(([coach, data]) => (
            <div key={coach} style={{ background: 'var(--bg3)', borderRadius: 10, padding: 14, border: '1px solid var(--border)' }}>
              <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 10 }}>{coach}</div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 22, fontWeight: 700, color: 'var(--accent)' }}>{data.recontratados}</div>
                  <div style={{ fontSize: 10, color: 'var(--text2)' }}>recontratados</div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 22, fontWeight: 700 }}>{data.total}</div>
                  <div style={{ fontSize: 10, color: 'var(--text2)' }}>total jugadores</div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 22, fontWeight: 700, color: data.pct >= 70 ? 'var(--accent)' : data.pct >= 40 ? 'var(--warn)' : 'var(--danger)' }}>{data.pct}%</div>
                  <div style={{ fontSize: 10, color: 'var(--text2)' }}>fidelización</div>
                </div>
              </div>
              <div style={{ height: 6, borderRadius: 3, background: 'var(--bg2)' }}>
                <div style={{ height: '100%', borderRadius: 3, width: `${data.pct}%`, background: data.pct >= 70 ? 'var(--accent)' : data.pct >= 40 ? 'var(--warn)' : 'var(--danger)', transition: 'width .3s' }} />
              </div>
              <div style={{ fontSize: 10, color: 'var(--text2)', marginTop: 4, display: 'flex', justifyContent: 'space-between' }}>
                <span>{data.pct >= 70 ? '🟢 Excelente' : data.pct >= 40 ? '🟡 Media' : '🔴 Baja'}</span>
                <span style={{ color: 'var(--text2)', fontStyle: 'italic' }}>{data.label}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Modal corte */}
      {modalCorte && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setModalCorte(false)}>
          <div className="modal" style={{ maxWidth: 400 }}>
            <h2 className="modal-title">🧾 Corte de caja</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div className="form-group">
                <label className="form-label">Fecha del corte</label>
                <input className="form-input" type="date" value={fechaCorte} onChange={e => setFechaCorte(e.target.value)} />
              </div>
              <div style={{ background: 'rgba(0,229,160,.06)', border: '1px solid rgba(0,229,160,.15)', borderRadius: 8, padding: '10px 14px', fontSize: 12, color: 'var(--text2)', lineHeight: 1.7 }}>
                Incluye todos los cobros marcados como pagados en esa fecha, desglosados por método de pago.
              </div>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                <button className="btn btn-secondary" onClick={() => setModalCorte(false)}>Cancelar</button>
                <button className="btn btn-primary" onClick={generarCorte} disabled={!fechaCorte || generando}>
                  {generando ? 'Generando...' : '⬇️ Descargar PDF'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
