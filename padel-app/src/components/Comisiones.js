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
    const base = coach.sueldo_base || 0
    const extra = Math.max(0, clases - (coach.clases_base || 0)) * (coach.pago_extra_clase || 0)
    return base + extra
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

  useEffect(() => { fetchData() }, [])
  useEffect(() => { calcResumen() }, [mesSeleccionado, desde, hasta, modoFiltro, coaches, inscripciones, clases])

  const fetchData = async () => {
    const [{ data: cs }, { data: ins }, { data: cl }] = await Promise.all([
      supabase.from('coaches').select('*').order('nombre'),
      supabase.from('inscripciones').select('*, jugadores(nombre), clases(coach_id, tipo, modalidad, fecha_inicio)'),
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
      const clasesUnicas = new Set(insMes.map(i => i.clase_id)).size

      let ingresoTeorico = 0
      insMes.forEach(i => {
        const modalidad = i.clases?.modalidad
        if (modalidad === 'Promo' || modalidad === 'Cortesía') {
          const participantesGrupo = insMes.filter(x => x.clase_id === i.clase_id).length
          ingresoTeorico += calcValorTeorico(modalidad, participantesGrupo)
        } else {
          ingresoTeorico += i.monto_cobrado || 0
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
      const participantesGrupo = filtrarIns(inscripciones).filter(x => x.clase_id === i.clase_id).length
      return {
        jugador: i.jugadores?.nombre,
        modalidad: i.clases?.modalidad,
        coach: coaches.find(c => c.id === i.clases?.coach_id)?.nombre || '—',
        valorTeorico: calcValorTeorico(i.clases?.modalidad, participantesGrupo),
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
    : desde && hasta ? `${desde} → ${hasta}` : desde ? `Desde ${desde}` : hasta ? `Hasta ${hasta}` : 'Todo'

  const generarReporte = () => {
    const script = document.createElement('script')
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js'
    script.onload = () => {
      const { jsPDF } = window.jspdf
      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
      const W = 210, margin = 18
      let y = margin

      const addText = (text, x, yy, size=10, bold=false, color=[0,0,0]) => {
        doc.setFontSize(size)
        doc.setFont('helvetica', bold ? 'bold' : 'normal')
        doc.setTextColor(...color)
        doc.text(String(text), x, yy)
      }

      const fmt = (n) => '$' + (n||0).toLocaleString('es-MX', {minimumFractionDigits:0, maximumFractionDigits:0})

      // Header
      doc.setFillColor(15, 17, 23)
      doc.rect(0, 0, W, 32, 'F')
      addText('PADEL CAMP', margin, 13, 18, true, [0,229,160])
      addText('Reporte de Comisiones', margin, 21, 11, false, [180,190,210])
      addText(`Periodo: ${labelPeriodo}`, margin, 28, 9, false, [130,140,165])
      addText(`Generado: ${new Date().toLocaleDateString('es-MX', {day:'numeric',month:'long',year:'numeric'})}`, W-margin, 28, 9, false, [130,140,165])
      doc.setFontSize(9); doc.setTextColor(130,140,165)
      doc.text(`Generado: ${new Date().toLocaleDateString('es-MX', {day:'numeric',month:'long',year:'numeric'})}`, W-margin, 28, {align:'right'})

      y = 44

      // Summary stats
      doc.setFillColor(24, 28, 40)
      doc.roundedRect(margin, y, W-margin*2, 22, 3, 3, 'F')
      const stats = [
        { label: 'Ingreso Teórico', value: fmt(totalIngreso) },
        { label: 'Total Comisiones', value: fmt(totalComisiones) },
        { label: '% del Ingreso', value: totalIngreso > 0 ? ((totalComisiones/totalIngreso)*100).toFixed(1)+'%' : '—' },
        { label: 'Valor Promos', value: fmt(totalPromos) },
      ]
      const colW = (W-margin*2) / 4
      stats.forEach((s, i) => {
        const x = margin + i*colW + colW/2
        addText(s.value, x, y+10, 11, true, [0,229,160])
        doc.setFontSize(8); doc.setFont('helvetica','normal'); doc.setTextColor(130,140,165)
        doc.text(s.label, x, y+17, {align:'center'})
      })

      y += 32

      // Per coach sections
      resumen.forEach(r => {
        if (y > 250) { doc.addPage(); y = margin }

        // Coach header
        doc.setFillColor(30, 37, 53)
        doc.roundedRect(margin, y, W-margin*2, 14, 2, 2, 'F')
        doc.setDrawColor(0,229,160); doc.setLineWidth(0.8)
        doc.line(margin, y, margin, y+14)
        addText(r.coach.nombre, margin+5, y+6, 12, true, [240,245,255])
        addText(r.coach.esquema_comision, margin+5, y+11, 8, false, [0,229,160])
        addText(`Comisión: ${fmt(r.comision)}`, W-margin, y+6, 12, true, [0,229,160])
        doc.setFontSize(8); doc.setTextColor(130,140,165)
        doc.text(`Comisión: ${fmt(r.comision)}`, W-margin, y+6, {align:'right'})
        y += 18

        // Coach details row
        const details = [
          `Sueldo base: ${fmt(r.coach.sueldo_base)}`,
          `Clases: ${r.clasesUnicas}`,
          `Ingreso teórico: ${fmt(r.ingresoTeorico)}`,
          `Cobrado: ${fmt(r.cobrado)}`,
        ]
        details.forEach((d, i) => {
          addText(d, margin + i * (W-margin*2)/4, y, 8, false, [100,110,130])
        })
        y += 6

        // Rule
        let regla = ''
        if (r.coach.esquema_comision === 'Porcentaje') regla = `Base ${fmt(r.coach.sueldo_base)} + ${(r.coach.porcentaje_comision*100).toFixed(0)}% sobre ${r.coach.aplica_iva ? 'neto (sin IVA)' : 'bruto'}`
        if (r.coach.esquema_comision === 'Bono') regla = `Base ${fmt(r.coach.sueldo_base)} (min ${r.coach.horas_base_bono}hrs) + ${fmt(r.coach.pago_extra_clase)} por clase >${r.coach.clases_base}`
        if (r.coach.esquema_comision === 'Mixto') regla = `Base ${fmt(r.coach.sueldo_base)} + ${fmt(r.coach.tarifa_privada_fija)}/privada + ${(r.coach.porcentaje_comision*100).toFixed(0)}% compartida`
        addText(`Regla: ${regla}`, margin, y, 7.5, false, [80,90,110])
        y += 8

        // Classes table header
        doc.setFillColor(20, 25, 38)
        doc.rect(margin, y, W-margin*2, 6, 'F')
        const cols = ['Jugador', 'Día / Horario', 'Modalidad', 'Mes', 'Monto', 'Estado']
        const colWidths = [42, 32, 24, 18, 24, 22]
        let x = margin + 2
        cols.forEach((col, i) => {
          addText(col, x, y+4, 7.5, true, [150,160,180])
          x += colWidths[i]
        })
        y += 8

        // Class rows
        const insCoach = filtrarIns(inscripciones).filter(i => i.clases?.coach_id === r.coach.id)
        insCoach.forEach((ins, idx) => {
          if (y > 268) { doc.addPage(); y = margin }
          const bgColor = idx % 2 === 0 ? [18, 22, 34] : [22, 27, 40]
          doc.setFillColor(...bgColor)
          doc.rect(margin, y, W-margin*2, 5.5, 'F')
          x = margin + 2
          const row = [
            ins.jugadores?.nombre || '—',
            `${ins.clases?.dia || ''} ${ins.clases?.hora?.slice(0,5) || ''}`.trim() || '—',
            ins.clases?.modalidad || '—',
            ins.mes || '—',
            fmt(ins.monto_cobrado),
            ins.pagado ? 'Pagado' : 'Pendiente',
          ]
          row.forEach((val, i) => {
            const color = i === 5 ? (ins.pagado ? [0,200,120] : [255,100,100]) : i === 4 ? [200,210,230] : [160,170,195]
            addText(String(val).substring(0,22), x, y+4, 7.5, false, color)
            x += colWidths[i]
          })
          y += 5.5
        })
        y += 8

        // Separator
        doc.setDrawColor(40, 50, 70); doc.setLineWidth(0.3)
        doc.line(margin, y-3, W-margin, y-3)
      })

      // Footer
      const pages = doc.getNumberOfPages()
      for (let i = 1; i <= pages; i++) {
        doc.setPage(i)
        doc.setFontSize(8); doc.setTextColor(80,90,110)
        doc.text(`Padel Camp — Reporte de Comisiones — ${labelPeriodo}`, margin, 293)
        doc.text(`Pág. ${i} / ${pages}`, W-margin, 293, {align:'right'})
      }

      const nombre = `comisiones_${labelPeriodo.replace(/[^a-zA-Z0-9]/g,'_')}_${new Date().toISOString().split('T')[0]}.pdf`
      doc.save(nombre)
    }
    document.head.appendChild(script)
  }

  return (
    <div style={{ maxWidth: 960 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700 }}>Comisiones</h1>
          <p style={{ color: 'var(--text2)', fontSize: 14, marginTop: 4 }}>Calculadas sobre ingreso teórico · Promo no castiga al coach</p>
          <button className="btn btn-secondary btn-sm" onClick={generarReporte} style={{ marginTop: 6 }}>📄 Exportar PDF</button>
        </div>

        {/* Selector modo filtro */}
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
              <input className="form-input" type="date" value={desde} onChange={e => setDesde(e.target.value)} style={{ maxWidth: 150 }} placeholder="Desde" />
              <span style={{ color: 'var(--text2)', fontSize: 13 }}>→</span>
              <input className="form-input" type="date" value={hasta} onChange={e => setHasta(e.target.value)} style={{ maxWidth: 150 }} placeholder="Hasta" />
              {(desde || hasta) && <button className="btn btn-secondary btn-sm" onClick={() => { setDesde(''); setHasta('') }}>✕</button>}
            </div>
          )}
        </div>
      </div>

      {/* Periodo activo */}
      <div style={{ background: 'rgba(0,229,160,.08)', border: '1px solid rgba(0,229,160,.2)', borderRadius: 8, padding: '8px 14px', fontSize: 13, color: 'var(--accent)', marginBottom: 20, textTransform: 'capitalize' }}>
        📅 Periodo: {labelPeriodo}
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14, marginBottom: 24 }}>
        <div className="stat-card">
          <div className="stat-value" style={{ fontSize: 20 }}>{fmt(totalIngreso)}</div>
          <div className="stat-label">Ingreso teórico</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ fontSize: 20, color: 'var(--accent)' }}>{fmt(totalComisiones)}</div>
          <div className="stat-label">Total comisiones</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ fontSize: 20, color: 'var(--accent2)' }}>
            {totalIngreso > 0 ? ((totalComisiones / totalIngreso) * 100).toFixed(1) + '%' : '—'}
          </div>
          <div className="stat-label">% en comisiones</div>
        </div>
        <div className="stat-card" style={{ borderColor: 'rgba(255,165,2,.3)' }}>
          <div className="stat-value" style={{ fontSize: 20, color: 'var(--warn)' }}>{fmt(totalPromos)}</div>
          <div className="stat-label">Valor clases Promo</div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 16 }}>
        {[
          { id: 'comisiones', label: '💰 Comisiones por coach' },
          { id: 'promos', label: `🎁 Promo / Cortesía (${promos.length})` },
        ].map(t => (
          <button key={t.id} onClick={() => setTabActiva(t.id)} style={{
            padding: '8px 16px', borderRadius: 8, border: 'none', cursor: 'pointer',
            background: tabActiva === t.id ? 'var(--accent)' : 'var(--bg3)',
            color: tabActiva === t.id ? '#000' : 'var(--text2)',
            fontSize: 13, fontWeight: tabActiva === t.id ? 600 : 400,
          }}>{t.label}</button>
        ))}
      </div>

      {tabActiva === 'comisiones' && (
        <div className="card" style={{ padding: 0 }}>
          <table className="table">
            <thead><tr>
              <th>Coach</th><th>Esquema</th><th>Clases</th><th>Ingreso teórico</th><th>Comisión</th><th>Regla</th>
            </tr></thead>
            <tbody>
              {resumen.map(r => (
                <tr key={r.coach.id}>
                  <td style={{ fontWeight: 600 }}>{r.coach.nombre}</td>
                  <td><span className={`badge ${r.coach.esquema_comision === 'Bono' ? 'badge-blue' : r.coach.esquema_comision === 'Porcentaje' ? 'badge-green' : 'badge-yellow'}`}>{r.coach.esquema_comision}</span></td>
                  <td style={{ fontFamily: 'var(--mono)', fontSize: 13 }}>{r.clasesUnicas}</td>
                  <td style={{ fontFamily: 'var(--mono)', fontSize: 13 }}>{fmt(r.ingresoTeorico)}</td>
                  <td style={{ fontFamily: 'var(--mono)', fontSize: 14, fontWeight: 700, color: 'var(--accent)' }}>{fmt(r.comision)}</td>
                  <td style={{ fontSize: 12, color: 'var(--text2)' }}>
                    {r.coach.esquema_comision === 'Bono' && `Base ${fmt(r.coach.sueldo_base)} + ${fmt(r.coach.pago_extra_clase)}/clase>${r.coach.clases_base}`}
                    {r.coach.esquema_comision === 'Porcentaje' && `Base ${fmt(r.coach.sueldo_base)} + ${(r.coach.porcentaje_comision * 100).toFixed(0)}% ${r.coach.aplica_iva ? 'neto' : 'bruto'}`}
                    {r.coach.esquema_comision === 'Mixto' && `Base ${fmt(r.coach.sueldo_base)} + ${fmt(r.coach.tarifa_privada_fija)}/priv + ${(r.coach.porcentaje_comision * 100).toFixed(0)}%`}
                  </td>
                </tr>
              ))}
              {resumen.length === 0 && (
                <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--text2)', padding: 32 }}>
                  Sin datos para {labelPeriodo}
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {tabActiva === 'promos' && (
        <div className="card" style={{ padding: 0 }}>
          {promos.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 40, color: 'var(--text2)' }}>
              No hay clases Promo o Cortesía en este periodo
            </div>
          ) : (
            <>
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
            </>
          )}
        </div>
      )}

      <div style={{ marginTop: 16, padding: '12px 16px', background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13, color: 'var(--text2)' }}>
        💡 Ingreso teórico de Promo/Cortesía se calcula según precio por participantes. El coach siempre recibe su comisión completa.
      </div>
    </div>
  )
}
