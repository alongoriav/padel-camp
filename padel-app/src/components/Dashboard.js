import { useState, useEffect } from 'react'
import { supabase } from '../supabase'

const MESES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre']

export default function Dashboard({ usuario }) {
  const [inscripciones, setInscripciones] = useState([])
  const [stats, setStats] = useState(null)
  const [porMes, setPorMes] = useState([])
  const [porCoach, setPorCoach] = useState([])
  const [desde, setDesde] = useState('')
  const [hasta, setHasta] = useState('')
  const [modalCorte, setModalCorte] = useState(false)
  const [fechaCorte, setFechaCorte] = useState(new Date().toISOString().split('T')[0])
  const [generando, setGenerando] = useState(false)

  useEffect(() => { fetchStats() }, [])
  useEffect(() => { calcStats() }, [inscripciones, desde, hasta])

  const fetchStats = async () => {
    const { data: ins } = await supabase.from('inscripciones').select('*, clases(coach_id, fecha_inicio, coaches(nombre))')
    setInscripciones(ins || [])
  }

  const calcStats = () => {
    let ins = inscripciones
    if (desde) ins = ins.filter(i => i.clases?.fecha_inicio >= desde)
    if (hasta) ins = ins.filter(i => i.clases?.fecha_inicio <= hasta)

    const total = ins.reduce((a, i) => a + (i.monto_cobrado || 0), 0)
    const cobrado = ins.filter(i => i.pagado).reduce((a, i) => a + (i.monto_cobrado || 0), 0)
    const pendiente = ins.filter(i => !i.pagado).reduce((a, i) => a + (i.monto_cobrado || 0), 0)
    setStats({ total, cobrado, pendiente, clases: ins.length })

    const mMap = {}
    ins.forEach(i => {
      const k = i.mes || 'Sin mes'
      if (!mMap[k]) mMap[k] = { mes: k, programado: 0, cobrado: 0, pendiente: 0 }
      mMap[k].programado += i.monto_cobrado || 0
      if (i.pagado) mMap[k].cobrado += i.monto_cobrado || 0
      else mMap[k].pendiente += i.monto_cobrado || 0
    })
    setPorMes(Object.values(mMap).sort((a, b) => MESES.indexOf(a.mes) - MESES.indexOf(b.mes)))

    const cMap = {}
    ins.forEach(i => {
      const nombre = i.clases?.coaches?.nombre || 'Sin coach'
      if (!cMap[nombre]) cMap[nombre] = { nombre, programado: 0, cobrado: 0, clases: 0 }
      cMap[nombre].programado += i.monto_cobrado || 0
      if (i.pagado) cMap[nombre].cobrado += i.monto_cobrado || 0
      cMap[nombre].clases++
    })
    setPorCoach(Object.values(cMap).sort((a, b) => b.programado - a.programado))
  }

  const generarCorte = async () => {
    setGenerando(true)

    const { data: insDetalle } = await supabase
      .from('inscripciones')
      .select('*, jugadores(nombre), clases(coach_id, dia, hora, tipo, modalidad, fecha_inicio, coaches(nombre))')
      .eq('pagado', true)
      .eq('fecha_pago', fechaCorte)

    const pagosDelDia = insDetalle || []

    const cargarJsPDF = () => {
      if (window.jspdf) { ejecutarCorte(pagosDelDia); return }
      const s = document.createElement('script')
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js'
      s.onload = () => ejecutarCorte(pagosDelDia)
      document.head.appendChild(s)
    }

    const ejecutarCorte = (pagos) => {
      const { jsPDF } = window.jspdf
      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
      const W = 210, M = 16
      const fmt = (n) => '$' + Math.round(n||0).toLocaleString('es-MX')

      const txt = (text, x, y, size=9, bold=false, color=[40,50,70], align='left') => {
        doc.setFontSize(size); doc.setFont('helvetica', bold ? 'bold' : 'normal')
        doc.setTextColor(...color); doc.text(String(text||''), x, y, {align})
      }

      const fechaFmt = new Date(fechaCorte + 'T12:00:00').toLocaleDateString('es-MX', {
        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
      })

      // Header
      doc.setFillColor(15, 17, 26)
      doc.rect(0, 0, W, 30, 'F')
      doc.setFillColor(0, 229, 160)
      doc.rect(0, 0, 4, 30, 'F')
      txt('PADEL CAMP', M+4, 11, 16, true, [0,229,160])
      txt('Corte de Caja', M+4, 19, 10, false, [160,175,200])
      txt(fechaFmt.charAt(0).toUpperCase() + fechaFmt.slice(1), M+4, 26, 8, false, [100,120,150])
      txt(new Date().toLocaleTimeString('es-MX', {hour:'2-digit', minute:'2-digit'}), W-M, 26, 8, false, [100,120,150], 'right')

      let y = 38

      // Group by payment method
      const metodos = {}
      pagos.forEach(p => {
        const m = p.metodo_pago || 'Sin método'
        if (!metodos[m]) metodos[m] = { total: 0, pagos: [] }
        metodos[m].total += p.monto_cobrado || 0
        metodos[m].pagos.push(p)
      })

      const totalDia = pagos.reduce((a, p) => a + (p.monto_cobrado || 0), 0)
      const totalEfectivo = metodos['Efectivo']?.total || 0
      const totalTarjeta = metodos['Tarjeta']?.total || 0
      const totalTransferencia = metodos['Transferencia']?.total || 0

      // Summary cards
      const summaryItems = [
        { label: 'Total del día', val: fmt(totalDia), color: [0,229,160] },
        { label: 'Efectivo', val: fmt(totalEfectivo), color: [250,204,21] },
        { label: 'Tarjeta', val: fmt(totalTarjeta), color: [74,148,255] },
        { label: 'Transferencia', val: fmt(totalTransferencia), color: [167,139,250] },
      ]
      const cw = (W-M*2) / 4
      summaryItems.forEach((s, i) => {
        const x = M + i*cw
        doc.setFillColor(20, 26, 42)
        doc.rect(x, y, cw-2, 18, 'F')
        txt(s.val, x + cw/2 - 1, y+9, 12, true, s.color, 'center')
        txt(s.label, x + cw/2 - 1, y+15, 7, false, [90,110,140], 'center')
      })
      y += 24

      // Cobros count
      txt(`${pagos.length} cobro${pagos.length !== 1 ? 's' : ''} registrado${pagos.length !== 1 ? 's' : ''} en el día`, M, y, 8, false, [80,100,130])
      y += 8

      if (pagos.length === 0) {
        doc.setFillColor(20, 26, 42)
        doc.rect(M, y, W-M*2, 20, 'F')
        txt('Sin cobros registrados para esta fecha', W/2, y+11, 10, false, [80,100,130], 'center')
        y += 26
      } else {
        // Table by payment method
        Object.entries(metodos).forEach(([metodo, data]) => {
          if (y > 240) { doc.addPage(); y = M }

          // Method header
          const mColor = metodo === 'Efectivo' ? [250,204,21] : metodo === 'Tarjeta' ? [74,148,255] : metodo === 'Transferencia' ? [167,139,250] : [130,150,180]
          doc.setFillColor(18, 24, 38)
          doc.rect(M, y, W-M*2, 8, 'F')
          doc.setFillColor(...mColor)
          doc.rect(M, y, 3, 8, 'F')
          txt(metodo.toUpperCase(), M+6, y+5, 8, true, mColor)
          txt(fmt(data.total), W-M, y+5, 9, true, mColor, 'right')
          y += 10

          // Table header
          doc.setFillColor(15, 20, 32)
          doc.rect(M, y, W-M*2, 5.5, 'F')
          const cols = [
            { label: 'Jugador', w: 46 },
            { label: 'Coach', w: 30 },
            { label: 'Día', w: 22 },
            { label: 'Horario', w: 18 },
            { label: 'Tipo', w: 22 },
            { label: 'Monto', w: 0 },
          ]
          let cx = M + 2
          cols.forEach((c, i) => {
            txt(c.label, cx, y+4, 7, true, [100,120,150])
            if (i < cols.length - 1) cx += c.w
          })
          txt('Monto', W-M-2, y+4, 7, true, [100,120,150], 'right')
          y += 6

          data.pagos.forEach((p, i) => {
            if (y > 270) { doc.addPage(); y = M }
            const bg = i % 2 === 0 ? [16, 20, 32] : [19, 24, 38]
            doc.setFillColor(...bg)
            doc.rect(M, y, W-M*2, 5.5, 'F')
            cx = M + 2
            txt(String(p.jugadores?.nombre || '—').substring(0,20), cx, y+4, 7.5, false, [200,215,240]); cx += 46
            txt(String(p.clases?.coaches?.nombre || '—').substring(0,14), cx, y+4, 7.5, false, [160,175,200]); cx += 30
            txt(p.clases?.dia || '—', cx, y+4, 7.5, false, [140,160,190]); cx += 22
            txt(p.clases?.hora?.slice(0,5) || '—', cx, y+4, 7.5, false, [140,160,190]); cx += 18
            txt(p.clases?.tipo || '—', cx, y+4, 7.5, false, [140,160,190])
            txt(fmt(p.monto_cobrado), W-M-2, y+4, 8, true, [200,220,255], 'right')
            y += 5.5
          })

          // Subtotal
          doc.setFillColor(18, 24, 38)
          doc.rect(M, y, W-M*2, 6, 'F')
          txt(`Subtotal ${metodo}`, M+4, y+4, 7.5, false, [100,120,150])
          txt(fmt(data.total), W-M-2, y+4, 8, true, mColor, 'right')
          y += 10
        })
      }

      // Grand total
      doc.setFillColor(0, 229, 160)
      doc.rect(M, y, W-M*2, 0.5, 'F')
      y += 5
      txt('TOTAL COBRADO DEL DÍA', M, y, 10, true, [160,180,210])
      txt(fmt(totalDia), W-M, y, 14, true, [0,229,160], 'right')

      // Footer
      const pages = doc.getNumberOfPages()
      for (let i = 1; i <= pages; i++) {
        doc.setPage(i)
        doc.setFontSize(7); doc.setTextColor(60,80,110)
        doc.text(`Padel Camp · Corte de Caja · ${fechaCorte}`, M, 293)
        doc.text(`${i} / ${pages}`, W-M, 293, {align:'right'})
      }

      doc.save(`corte_caja_${fechaCorte}.pdf`)
      setGenerando(false)
      setModalCorte(false)
    }

    cargarJsPDF()
  }

  const fmt = (n) => '$' + (n || 0).toLocaleString('es-MX')

  return (
    <div style={{ maxWidth: 960 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700 }}>Resumen general</h1>
          <p style={{ color: 'var(--text2)', fontSize: 14, marginTop: 4 }}>Vista consolidada de tu academia</p>
          <button className="btn btn-secondary btn-sm" onClick={() => setModalCorte(true)} style={{ marginTop: 8 }}>
            🧾 Corte de caja
          </button>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <label className="form-label" style={{ margin: 0, whiteSpace: 'nowrap' }}>Desde</label>
            <input className="form-input" type="date" value={desde} onChange={e => setDesde(e.target.value)} style={{ maxWidth: 150 }} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <label className="form-label" style={{ margin: 0, whiteSpace: 'nowrap' }}>Hasta</label>
            <input className="form-input" type="date" value={hasta} onChange={e => setHasta(e.target.value)} style={{ maxWidth: 150 }} />
          </div>
          {(desde || hasta) && (
            <button className="btn btn-secondary btn-sm" onClick={() => { setDesde(''); setHasta('') }}>✕</button>
          )}
        </div>
      </div>

      {(desde || hasta) && (
        <div style={{ background: 'rgba(0,229,160,.08)', border: '1px solid rgba(0,229,160,.2)', borderRadius: 8, padding: '8px 14px', fontSize: 13, color: 'var(--accent)', marginBottom: 16 }}>
          📅 Mostrando: {desde || '—'} → {hasta || '—'}
        </div>
      )}

      {stats && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', marginBottom: 28, gap: 14 }}>
          {[
            { label: 'Total programado', value: fmt(stats.total), color: 'var(--text)' },
            { label: 'Total cobrado', value: fmt(stats.cobrado), color: 'var(--accent)' },
            { label: 'Pendiente', value: fmt(stats.pendiente), color: 'var(--warn)' },
            { label: 'Inscripciones', value: stats.clases, color: 'var(--accent2)' },
          ].map(s => (
            <div className="stat-card" key={s.label}>
              <div className="stat-value" style={{ color: s.color, fontSize: 22 }}>{s.value}</div>
              <div className="stat-label">{s.label}</div>
            </div>
          ))}
        </div>
      )}

      <div className="grid-2" style={{ gap: 20 }}>
        <div className="card">
          <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 16 }}>Por mes</h3>
          {porMes.length === 0 ? (
            <p style={{ color: 'var(--text2)', fontSize: 14 }}>Sin datos</p>
          ) : (
            <table className="table">
              <thead><tr><th>Mes</th><th>Programado</th><th>Cobrado</th><th>Pendiente</th></tr></thead>
              <tbody>
                {porMes.map(m => (
                  <tr key={m.mes}>
                    <td style={{ fontWeight: 500, textTransform: 'capitalize' }}>{m.mes}</td>
                    <td style={{ fontFamily: 'var(--mono)', fontSize: 13 }}>{fmt(m.programado)}</td>
                    <td style={{ fontFamily: 'var(--mono)', fontSize: 13, color: 'var(--accent)' }}>{fmt(m.cobrado)}</td>
                    <td style={{ fontFamily: 'var(--mono)', fontSize: 13, color: 'var(--warn)' }}>{fmt(m.pendiente)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="card">
          <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 16 }}>Por coach</h3>
          {porCoach.length === 0 ? (
            <p style={{ color: 'var(--text2)', fontSize: 14 }}>Sin datos</p>
          ) : (
            <table className="table">
              <thead><tr><th>Coach</th><th>Programado</th><th>Cobrado</th><th>Clases</th></tr></thead>
              <tbody>
                {porCoach.map(c => (
                  <tr key={c.nombre}>
                    <td style={{ fontWeight: 500 }}>{c.nombre}</td>
                    <td style={{ fontFamily: 'var(--mono)', fontSize: 13 }}>{fmt(c.programado)}</td>
                    <td style={{ fontFamily: 'var(--mono)', fontSize: 13, color: 'var(--accent)' }}>{fmt(c.cobrado)}</td>
                    <td style={{ fontFamily: 'var(--mono)', fontSize: 13 }}>{c.clases}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Modal corte de caja */}
      {modalCorte && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setModalCorte(false)}>
          <div className="modal" style={{ maxWidth: 420 }}>
            <h2 className="modal-title">🧾 Corte de caja</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

              <div className="form-group">
                <label className="form-label">Fecha del corte</label>
                <input className="form-input" type="date" value={fechaCorte}
                  onChange={e => setFechaCorte(e.target.value)} />
              </div>

              <div style={{ background: 'rgba(0,229,160,.06)', border: '1px solid rgba(0,229,160,.15)', borderRadius: 8, padding: '12px 14px', fontSize: 12, color: 'var(--text2)', lineHeight: 1.7 }}>
                El reporte incluirá:<br />
                • Resumen por método de pago (Efectivo, Tarjeta, Transferencia)<br />
                • Lista detallada de cobros del día<br />
                • Jugador, coach, horario, tipo y monto<br />
                • Total general del día
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
