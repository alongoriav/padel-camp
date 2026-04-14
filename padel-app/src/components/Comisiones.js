import { useState, useEffect } from 'react'
import { supabase } from '../supabase'

const MESES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre']

const PRECIOS_TEORICOS = {
  1: { Semanal: 1000, 'Clase única': 1200 },
  2: { Semanal: 550, 'Clase única': 660 },
  3: { Semanal: 435, 'Clase única': 555 },
  4: { Semanal: 375, 'Clase única': 450 },
}

function calcValorTeorico(modalidad, participantes) {
  const p = Math.min(participantes || 1, 4)
  if (modalidad === 'Semanal' || modalidad === 'Promo' || modalidad === 'Cortesía')
    return PRECIOS_TEORICOS[p]?.Semanal || 0
  return PRECIOS_TEORICOS[p]?.['Clase única'] || 0
}

function calcComision(coach, clases, ingresoTeorico) {
  if (!coach) return 0
  if (coach.esquema_comision === 'Porcentaje') {
    const base = coach.sueldo_base || 0
    const neto = coach.aplica_iva ? ingresoTeorico / 1.16 : ingresoTeorico
    return base + neto * (coach.porcentaje_comision || 0)
  }
  if (coach.esquema_comision === 'Bono') {
    const horasMin = coach.horas_base_bono || 40
    const clasesPagadas = clases
    const pctAlcance = clasesPagadas / horasMin
    // Tabla de tramos
    let pctBase
    if (pctAlcance >= 1.0) pctBase = coach.tramo4_pct ?? 1.0
    else if (pctAlcance > 0.6) pctBase = coach.tramo3_pct ?? 0.7
    else if (pctAlcance > 0.3) pctBase = coach.tramo2_pct ?? 0.5
    else pctBase = coach.tramo1_pct ?? 0.3
    const baseProporcional = (coach.sueldo_base || 0) * pctBase
    const extra = Math.max(0, clasesPagadas - (coach.clases_base || 0)) * (coach.pago_extra_clase || 0)
    return baseProporcional + extra
  }
  if (coach.esquema_comision === 'Mixto') {
    const base = coach.sueldo_base || 0
    const privadas = clases * (coach.tarifa_privada_fija || 0)
    const neto = coach.aplica_iva ? ingresoTeorico / 1.16 : ingresoTeorico
    return base + privadas + neto * (coach.porcentaje_comision || 0)
  }
  return 0
}

export default function Comisiones() {
  const [coaches, setCoaches] = useState([])
  const [inscripciones, setInscripciones] = useState([])
  const [clases, setClases] = useState([])
  const [modoFiltro, setModoFiltro] = useState('mes')
  const [mesSeleccionado, setMesSeleccionado] = useState(MESES[new Date().getMonth()])
  const [desde, setDesde] = useState('')
  const [hasta, setHasta] = useState('')
  const [resumen, setResumen] = useState([])
  const [promos, setPromos] = useState([])
  const [tabActiva, setTabActiva] = useState('comisiones')
  const [modalExport, setModalExport] = useState(false)
  const [coachExport, setCoachExport] = useState('todos')
  const [exportando, setExportando] = useState(false)

  useEffect(() => { fetchData() }, [])
  useEffect(() => { calcResumen() }, [mesSeleccionado, desde, hasta, modoFiltro, coaches, inscripciones, clases])

  const fetchData = async () => {
    const [{ data: cs }, { data: ins }, { data: cl }] = await Promise.all([
      supabase.from('coaches').select('*').order('nombre'),
      supabase.from('inscripciones').select('*, jugadores(nombre), clases(coach_id, tipo, modalidad, fecha_inicio, dia, hora, clases_en_rango)'),
      supabase.from('clases').select('*'),
    ])
    setCoaches(cs || [])
    setInscripciones(ins || [])
    setClases(cl || [])
  }

  const filtrarIns = (ins) => {
    if (modoFiltro === 'mes') return ins.filter(i => i.mes === mesSeleccionado)
    if (modoFiltro === 'rango') {
      return ins.filter(i => {
        const fecha = i.clases?.fecha_inicio
        if (!fecha) return false
        if (desde && fecha < desde) return false
        if (hasta && fecha > hasta) return false
        return true
      })
    }
    return ins
  }

  const calcResumen = () => {
    const res = coaches.map(coach => {
      const insMes = filtrarIns(inscripciones).filter(i => i.clases?.coach_id === coach.id)
      // Solo inscripciones pagadas (o Promo/Cortesía que siempre cuentan)
      const insParaComision = insMes.filter(i => {
        const modalidad = i.clases?.modalidad
        if (modalidad === 'Promo' || modalidad === 'Cortesía') return true
        return i.pagado
      })
      // Sumar horas reales (clases_en_rango) por clase única
      // Sumar horas reales (clases_en_rango) por clase única pagada
      const clasesUnicas = (() => {
        const seen = new Set()
        let total = 0
        insParaComision.forEach(i => {
          if (!seen.has(i.clase_id)) {
            seen.add(i.clase_id)
            total += (i.clases?.clases_en_rango || 1)
          }
        })
        return total
      })()
      let ingresoTeorico = 0
      insParaComision.forEach(i => {
        const modalidad = i.clases?.modalidad
        const p = insMes.filter(x => x.clase_id === i.clase_id).length
        if (modalidad === 'Promo' || modalidad === 'Cortesía') {
          ingresoTeorico += calcValorTeorico(modalidad, p)
        } else {
          const monto = i.monto_cobrado && i.monto_cobrado > 0 ? i.monto_cobrado : calcValorTeorico(modalidad, p)
          ingresoTeorico += monto
        }
      })
      const cobrado = insMes.filter(i => i.pagado).reduce((a, i) => a + (i.monto_cobrado || 0), 0)
      const comision = calcComision(coach, clasesUnicas, ingresoTeorico)
      return { coach, clasesUnicas, ingresoTeorico, cobrado, comision }
    }).filter(r => r.clasesUnicas > 0 || coaches.length <= 6)
    setResumen(res)

    const promosMes = filtrarIns(inscripciones).filter(i => {
      const m = i.clases?.modalidad
      return m === 'Promo' || m === 'Cortesía'
    }).map(i => {
      const p = filtrarIns(inscripciones).filter(x => x.clase_id === i.clase_id).length
      return {
        jugador: i.jugadores?.nombre,
        modalidad: i.clases?.modalidad,
        coach: coaches.find(c => c.id === i.clases?.coach_id)?.nombre || '—',
        valorTeorico: calcValorTeorico(i.clases?.modalidad, p),
      }
    })
    setPromos(promosMes)
  }

  const fmt = (n) => '$' + (n || 0).toLocaleString('es-MX', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
  const totalComisiones = resumen.reduce((a, r) => a + r.comision, 0)
  const totalIngreso = resumen.reduce((a, r) => a + r.ingresoTeorico, 0)
  const totalPromos = promos.reduce((a, p) => a + p.valorTeorico, 0)

  const labelPeriodo = modoFiltro === 'mes'
    ? mesSeleccionado
    : desde && hasta ? `${desde} al ${hasta}` : desde ? `Desde ${desde}` : hasta ? `Hasta ${hasta}` : 'Todo'

  const generarPDF = () => {
    setExportando(true)
    const cargarJsPDF = () => {
      if (window.jspdf) { ejecutarPDF(); return }
      const s = document.createElement('script')
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js'
      s.onload = ejecutarPDF
      document.head.appendChild(s)
    }

    const ejecutarPDF = () => {
      const { jsPDF } = window.jspdf
      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
      const W = 210, M = 16

      // Calculate date range info
      const calcDiasRango = (desde, hasta, mes) => {
        if (desde && hasta) {
          const d1 = new Date(desde), d2 = new Date(hasta)
          return Math.round((d2 - d1) / (1000*60*60*24)) + 1
        }
        // Full month
        const now = new Date()
        const year = now.getFullYear()
        const mesIdx = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'].indexOf(mes)
        if (mesIdx >= 0) return new Date(year, mesIdx+1, 0).getDate()
        return 30
      }

      const diasMes = (mes) => {
        const now = new Date()
        const mesIdx = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'].indexOf(mes)
        if (mesIdx >= 0) return new Date(now.getFullYear(), mesIdx+1, 0).getDate()
        return 30
      }

      const fmt2 = (n) => '$' + Math.round(n||0).toLocaleString('es-MX')

      const txt = (text, x, y, size=9, bold=false, color=[40,50,70], align='left') => {
        doc.setFontSize(size); doc.setFont('helvetica', bold ? 'bold' : 'normal')
        doc.setTextColor(...color); doc.text(String(text||''), x, y, {align})
      }

      const resumenFiltrado = coachExport === 'todos'
        ? resumen
        : resumen.filter(r => r.coach.id === coachExport)

      resumenFiltrado.forEach((r, idx) => {
        if (idx > 0) doc.addPage()
        let y = M

        // Calculate base proporcional
        const diasRango = calcDiasRango(desde, hasta, mesSeleccionado)
        const diasDelMes = modoFiltro === 'mes' ? diasMes(mesSeleccionado) : 30
        const baseProporcional = (r.coach.sueldo_base || 0) / diasDelMes * diasRango

        // Recalcular ingreso teórico para este coach en el periodo
        const insCoachAll = filtrarIns(inscripciones).filter(i => i.clases?.coach_id === r.coach.id)
        const insCoachPDF = insCoachAll.filter(i => {
          const modalidad = i.clases?.modalidad
          if (modalidad === 'Promo' || modalidad === 'Cortesía') return true
          return i.pagado
        })
        let ingresoTeoricoPDF = 0
        insCoachPDF.forEach(i => {
          const modalidad = i.clases?.modalidad
          const p = insCoachAll.filter(x => x.clase_id === i.clase_id).length
          if (modalidad === 'Promo' || modalidad === 'Cortesía') {
            ingresoTeoricoPDF += calcValorTeorico(modalidad, p)
          } else {
            const monto = i.monto_cobrado && i.monto_cobrado > 0 ? i.monto_cobrado : calcValorTeorico(modalidad, p)
            ingresoTeoricoPDF += monto
          }
        })

        // Comision solo por clases (sin base)
        let comisionClases = 0
        if (r.coach.esquema_comision === 'Porcentaje') {
          const neto = r.coach.aplica_iva ? ingresoTeoricoPDF / 1.16 : ingresoTeoricoPDF
          comisionClases = neto * (r.coach.porcentaje_comision || 0)
        } else if (r.coach.esquema_comision === 'Bono') {
          comisionClases = Math.max(0, r.clasesUnicas - (r.coach.clases_base || 0)) * (r.coach.pago_extra_clase || 0)
        } else if (r.coach.esquema_comision === 'Mixto') {
          const neto = r.coach.aplica_iva ? ingresoTeoricoPDF / 1.16 : ingresoTeoricoPDF
          comisionClases = r.clasesUnicas * (r.coach.tarifa_privada_fija || 0) + neto * (r.coach.porcentaje_comision || 0)
        }
        const totalAPagar = baseProporcional + comisionClases

        // Header
        doc.setFillColor(15, 17, 26)
        doc.rect(0, 0, W, 30, 'F')
        doc.setFillColor(0, 229, 160)
        doc.rect(0, 0, 4, 30, 'F')
        txt('PADEL CAMP', M+4, 11, 16, true, [0,229,160])
        txt('Estado de Cuenta — Comisiones', M+4, 19, 10, false, [160,175,200])
        txt(`Periodo: ${labelPeriodo}`, M+4, 26, 8, false, [100,120,150])
        txt(new Date().toLocaleDateString('es-MX', {day:'numeric',month:'long',year:'numeric'}), W-M, 26, 8, false, [100,120,150], 'right')
        y = 38

        // Coach card
        doc.setFillColor(24, 30, 46)
        doc.roundedRect(M, y, W-M*2, 24, 3, 3, 'F')
        doc.setFillColor(0, 229, 160)
        doc.roundedRect(M, y, 4, 24, 2, 2, 'F')
        txt(r.coach.nombre, M+8, y+9, 16, true, [230,240,255])
        txt(`Periodo: ${diasRango} días`, M+8, y+16, 8, false, [100,130,160])
        txt(fmt2(totalAPagar), W-M-2, y+12, 18, true, [0,229,160], 'right')
        txt('TOTAL A PAGAR', W-M-2, y+19, 7, false, [100,130,160], 'right')
        y += 30

        // Payment breakdown
        doc.setFillColor(20, 25, 40)
        doc.roundedRect(M, y, W-M*2, 20, 2, 2, 'F')
        
        // Left: base
        txt('Sueldo base proporcional', M+6, y+8, 8, false, [130,150,180])
        txt(`$${Math.round(r.coach.sueldo_base||0).toLocaleString('es-MX')} ÷ ${diasDelMes} días × ${diasRango} días`, M+6, y+14, 7.5, false, [90,110,140])
        txt(fmt2(baseProporcional), M+80, y+12, 12, true, [200,215,240], 'center')

        // Right: comision clases
        txt('Comisión por clases', M+110, y+8, 8, false, [130,150,180])
        let reglaCorta = ''
        if (r.coach.esquema_comision === 'Porcentaje') reglaCorta = `${(r.coach.porcentaje_comision*100).toFixed(0)}% sobre neto${r.coach.aplica_iva ? ' (÷1.16)' : ''}`
        if (r.coach.esquema_comision === 'Bono') {
          const pct = r.clasesUnicas / (r.coach.horas_base_bono || 40)
          const tramo = pct >= 1 ? `100%+: ${Math.round((r.coach.tramo4_pct??1)*100)}%` : pct > 0.6 ? `60-99%: ${Math.round((r.coach.tramo3_pct??0.7)*100)}%` : pct > 0.3 ? `30-60%: ${Math.round((r.coach.tramo2_pct??0.5)*100)}%` : `0-30%: ${Math.round((r.coach.tramo1_pct??0.3)*100)}%`
          reglaCorta = `${r.clasesUnicas}/${r.coach.horas_base_bono} clases · tramo ${tramo} del base`
        }
        if (r.coach.esquema_comision === 'Mixto') reglaCorta = `$${r.coach.tarifa_privada_fija}/priv + ${(r.coach.porcentaje_comision*100).toFixed(0)}% comp`
        txt(reglaCorta, M+110, y+14, 7.5, false, [90,110,140])
        txt(fmt2(comisionClases), W-M-6, y+12, 12, true, [200,215,240], 'right')
        y += 26

        // Total line
        doc.setFillColor(0, 229, 160)
        doc.rect(M, y, W-M*2, 0.5, 'F')
        y += 5
        txt(`TOTAL A PAGAR: ${fmt2(baseProporcional)} + ${fmt2(comisionClases)} =`, M, y, 9, false, [130,150,180])
        txt(fmt2(totalAPagar), W-M, y, 12, true, [0,229,160], 'right')
        y += 10

        // Table title
        txt('CLASES DEL PERIODO', M, y, 8, true, [80,100,130])
        y += 5

        // Table header
        const cols = [
          { label: 'Jugador', w: 50 },
          { label: 'Día', w: 24 },
          { label: 'Horario', w: 18 },
          { label: 'Tipo', w: 22 },
          { label: 'Modalidad', w: 26 },
          { label: 'Mes', w: 18 },
        ]
        doc.setFillColor(20, 26, 42)
        doc.rect(M, y, W-M*2, 6, 'F')
        let cx = M + 2
        cols.forEach(c => {
          txt(c.label, cx, y+4, 7, true, [130,150,180])
          cx += c.w
        })
        y += 7

        const insCoach = filtrarIns(inscripciones).filter(i => i.clases?.coach_id === r.coach.id)
        insCoach.forEach((ins, i) => {
          if (y > 270) { doc.addPage(); y = M }
          const bg = i % 2 === 0 ? [17, 21, 34] : [21, 27, 42]
          doc.setFillColor(...bg)
          doc.rect(M, y, W-M*2, 5.5, 'F')
          cx = M + 2
          const row = [
            { val: ins.jugadores?.nombre || '—', color: [200,215,240] },
            { val: ins.clases?.dia || '—', color: [160,175,200] },
            { val: ins.clases?.hora?.slice(0,5) || '—', color: [160,175,200] },
            { val: ins.clases?.tipo || '—', color: [140,160,190] },
            { val: ins.clases?.modalidad || '—', color: ins.clases?.modalidad === 'Promo' ? [200,160,60] : [140,160,190] },
            { val: ins.mes || '—', color: [140,160,190] },
          ]
          row.forEach((cell, j) => {
            txt(String(cell.val).substring(0,22), cx, y+4, 7.5, false, cell.color)
            cx += cols[j].w
          })
          y += 5.5
        })

        if (insCoach.length === 0) {
          txt('Sin clases en este periodo', M+2, y+4, 8, false, [80,100,130])
          y += 8
        }

        // Footer total
        y += 6
        doc.setFillColor(15, 19, 30)
        doc.rect(M, y, W-M*2, 10, 'F')
        txt(`Total clases impartidas: ${r.clasesUnicas}`, M+4, y+6, 8, false, [120,140,170])
        txt(`TOTAL A PAGAR: ${fmt2(totalAPagar)}`, W-M-4, y+6, 10, true, [0,229,160], 'right')
      })

      // Page numbers
      const pages = doc.getNumberOfPages()
      for (let i = 1; i <= pages; i++) {
        doc.setPage(i)
        doc.setFontSize(7); doc.setTextColor(80,100,130)
        doc.text(`Padel Camp · Estado de Cuenta · ${labelPeriodo}`, M, 293)
        doc.text(`${i} / ${pages}`, W-M, 293, {align:'right'})
      }

      const coachNombre = coachExport === 'todos' ? 'todos' : coaches.find(c => c.id === coachExport)?.nombre?.replace(/\s/g,'_') || 'coach'
      doc.save(`comisiones_${coachNombre}_${labelPeriodo.replace(/[^a-zA-Z0-9]/g,'_')}.pdf`)
      setExportando(false)
      setModalExport(false)
    }

    cargarJsPDF()
  }

  return (
    <div style={{ maxWidth: 960 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700 }}>Comisiones</h1>
          <p style={{ color: 'var(--text2)', fontSize: 14, marginTop: 4 }}>Calculadas sobre ingreso teórico · Promo no castiga al coach</p>
          <button className="btn btn-secondary btn-sm" onClick={() => setModalExport(true)} style={{ marginTop: 8 }}>
            📄 Exportar PDF
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'flex-end' }}>
          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={() => setModoFiltro('mes')} style={{
              padding: '7px 14px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 13,
              background: modoFiltro === 'mes' ? 'var(--accent)' : 'var(--bg3)',
              color: modoFiltro === 'mes' ? '#000' : 'var(--text2)', fontWeight: modoFiltro === 'mes' ? 600 : 400,
            }}>Por mes</button>
            <button onClick={() => setModoFiltro('rango')} style={{
              padding: '7px 14px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 13,
              background: modoFiltro === 'rango' ? 'var(--accent)' : 'var(--bg3)',
              color: modoFiltro === 'rango' ? '#000' : 'var(--text2)', fontWeight: modoFiltro === 'rango' ? 600 : 400,
            }}>Rango de fechas</button>
          </div>

          {modoFiltro === 'mes' && (
            <select className="form-input" style={{ maxWidth: 180, textTransform: 'capitalize' }} value={mesSeleccionado} onChange={e => setMesSeleccionado(e.target.value)}>
              {MESES.map(m => <option key={m} value={m} style={{ textTransform: 'capitalize' }}>{m}</option>)}
            </select>
          )}

          {modoFiltro === 'rango' && (
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <input className="form-input" type="date" value={desde} onChange={e => setDesde(e.target.value)} style={{ maxWidth: 150 }} />
              <span style={{ color: 'var(--text2)', fontSize: 13 }}>→</span>
              <input className="form-input" type="date" value={hasta} onChange={e => setHasta(e.target.value)} style={{ maxWidth: 150 }} />
              {(desde || hasta) && <button className="btn btn-secondary btn-sm" onClick={() => { setDesde(''); setHasta('') }}>✕</button>}
            </div>
          )}
        </div>
      </div>

      <div style={{ background: 'rgba(0,229,160,.08)', border: '1px solid rgba(0,229,160,.2)', borderRadius: 8, padding: '8px 14px', fontSize: 13, color: 'var(--accent)', marginBottom: 20, textTransform: 'capitalize' }}>
        📅 Periodo: {labelPeriodo}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14, marginBottom: 24 }}>
        <div className="stat-card"><div className="stat-value" style={{ fontSize: 20 }}>{fmt(totalIngreso)}</div><div className="stat-label">Ingreso teórico</div></div>
        <div className="stat-card"><div className="stat-value" style={{ fontSize: 20, color: 'var(--accent)' }}>{fmt(totalComisiones)}</div><div className="stat-label">Total comisiones</div></div>
        <div className="stat-card"><div className="stat-value" style={{ fontSize: 20, color: 'var(--accent2)' }}>{totalIngreso > 0 ? ((totalComisiones/totalIngreso)*100).toFixed(1)+'%' : '—'}</div><div className="stat-label">% en comisiones</div></div>
        <div className="stat-card" style={{ borderColor: 'rgba(255,165,2,.3)' }}><div className="stat-value" style={{ fontSize: 20, color: 'var(--warn)' }}>{fmt(totalPromos)}</div><div className="stat-label">Valor clases Promo</div></div>
      </div>

      <div style={{ display: 'flex', gap: 4, marginBottom: 16 }}>
        {[{ id: 'comisiones', label: '💰 Comisiones por coach' }, { id: 'promos', label: `🎁 Promo / Cortesía (${promos.length})` }].map(t => (
          <button key={t.id} onClick={() => setTabActiva(t.id)} style={{
            padding: '8px 16px', borderRadius: 8, border: 'none', cursor: 'pointer',
            background: tabActiva === t.id ? 'var(--accent)' : 'var(--bg3)',
            color: tabActiva === t.id ? '#000' : 'var(--text2)', fontSize: 13,
            fontWeight: tabActiva === t.id ? 600 : 400,
          }}>{t.label}</button>
        ))}
      </div>

      {tabActiva === 'comisiones' && (
        <div className="card" style={{ padding: 0 }}>
          <table className="table">
            <thead><tr><th>Coach</th><th>Esquema</th><th>Clases</th><th>Ingreso teórico</th><th>Comisión</th><th>Regla</th></tr></thead>
            <tbody>
              {resumen.map(r => (
                <tr key={r.coach.id}>
                  <td style={{ fontWeight: 600 }}>{r.coach.nombre}</td>
                  <td><span className={`badge ${r.coach.esquema_comision === 'Bono' ? 'badge-blue' : r.coach.esquema_comision === 'Porcentaje' ? 'badge-green' : 'badge-yellow'}`}>{r.coach.esquema_comision}</span></td>
                  <td style={{ fontFamily: 'var(--mono)', fontSize: 13 }}>{r.clasesUnicas}</td>
                  <td style={{ fontFamily: 'var(--mono)', fontSize: 13 }}>{fmt(r.ingresoTeorico)}</td>
                  <td style={{ fontFamily: 'var(--mono)', fontSize: 14, fontWeight: 700, color: 'var(--accent)' }}>{fmt(r.comision)}</td>
                  <td style={{ fontSize: 12, color: 'var(--text2)' }}>
                    {r.coach.esquema_comision === 'Bono' && (() => {
                    const pct = r.clasesUnicas / (r.coach.horas_base_bono || 40)
                    const tramo = pct >= 1 ? `100%+ → ${Math.round((r.coach.tramo4_pct??1)*100)}%` : pct > 0.6 ? `60-99% → ${Math.round((r.coach.tramo3_pct??0.7)*100)}%` : pct > 0.3 ? `30-60% → ${Math.round((r.coach.tramo2_pct??0.5)*100)}%` : `0-30% → ${Math.round((r.coach.tramo1_pct??0.3)*100)}%`
                    return `${r.clasesUnicas}/${r.coach.horas_base_bono} clases · ${tramo} del base`
                  })()}
                    {r.coach.esquema_comision === 'Porcentaje' && `Base ${fmt(r.coach.sueldo_base)} + ${(r.coach.porcentaje_comision*100).toFixed(0)}% ${r.coach.aplica_iva ? 'neto' : 'bruto'}`}
                    {r.coach.esquema_comision === 'Mixto' && `Base ${fmt(r.coach.sueldo_base)} + ${fmt(r.coach.tarifa_privada_fija)}/priv + ${(r.coach.porcentaje_comision*100).toFixed(0)}%`}
                  </td>
                </tr>
              ))}
              {resumen.length === 0 && <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--text2)', padding: 32 }}>Sin datos para {labelPeriodo}</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {tabActiva === 'promos' && (
        <div className="card" style={{ padding: 0 }}>
          {promos.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 40, color: 'var(--text2)' }}>No hay clases Promo o Cortesía en este periodo</div>
          ) : (<>
            <table className="table">
              <thead><tr><th>Jugador</th><th>Tipo</th><th>Coach</th><th>Valor teórico</th></tr></thead>
              <tbody>
                {promos.map((p, i) => (
                  <tr key={i}>
                    <td style={{ fontWeight: 500 }}>{p.jugador}</td>
                    <td><span className="badge badge-gray">{p.modalidad}</span></td>
                    <td style={{ fontSize: 13 }}>{p.coach}</td>
                    <td style={{ fontFamily: 'var(--mono)', fontSize: 13, color: 'var(--warn)' }}>{fmt(p.valorTeorico)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
              <span style={{ color: 'var(--text2)' }}>{promos.length} clases sin cobro</span>
              <span style={{ fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--warn)' }}>Total: {fmt(totalPromos)}</span>
            </div>
          </>)}
        </div>
      )}

      <div style={{ marginTop: 16, padding: '12px 16px', background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13, color: 'var(--text2)' }}>
        💡 Las comisiones se calculan únicamente sobre clases pagadas. Promo/Cortesía siempre cuentan. Check-in cuenta cuando el complemento está pagado.
      </div>

      {/* Modal exportar */}
      {modalExport && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setModalExport(false)}>
          <div className="modal" style={{ maxWidth: 420 }}>
            <h2 className="modal-title">Exportar reporte PDF</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

              <div style={{ background: 'var(--bg3)', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: 'var(--text2)' }}>
                📅 Periodo: <strong style={{ color: 'var(--text)', textTransform: 'capitalize' }}>{labelPeriodo}</strong>
              </div>

              <div className="form-group">
                <label className="form-label">¿Para qué coach?</label>
                <select className="form-input" value={coachExport} onChange={e => setCoachExport(e.target.value)}>
                  <option value="todos">Todos los coaches (una página por coach)</option>
                  {resumen.map(r => (
                    <option key={r.coach.id} value={r.coach.id}>{r.coach.nombre}</option>
                  ))}
                </select>
              </div>

              <div style={{ background: 'rgba(0,229,160,.06)', border: '1px solid rgba(0,229,160,.15)', borderRadius: 8, padding: '10px 14px', fontSize: 12, color: 'var(--text2)', lineHeight: 1.6 }}>
                El reporte incluirá por cada coach:<br />
                • Periodo y fecha de generación<br />
                • Sueldo base, esquema y regla de cálculo<br />
                • Tabla detallada de clases (jugador, día, horario, tipo, monto, estado)<br />
                • Comisión total del periodo<br />
                • Cada coach inicia en página nueva
              </div>

              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                <button className="btn btn-secondary" onClick={() => setModalExport(false)}>Cancelar</button>
                <button className="btn btn-primary" onClick={generarPDF} disabled={exportando}>
                  {exportando ? 'Generando...' : '⬇️ Descargar PDF'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
