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

// Calcula el % de base según tramos para esquema Bono
// Tramos: 1-20=10%, 21-30=20%, 31-40=40%, 41-50=60%, 51-54=80%, 55+=100%
function pctTramo(clases, clasesBase) {
  const meta = clasesBase || 55
  if (clases >= meta) return 1.0
  if (clases >= 51) return 0.8
  if (clases >= 41) return 0.6
  if (clases >= 31) return 0.4
  if (clases >= 21) return 0.2
  if (clases >= 1)  return 0.1
  return 0
}

// Cuenta las sesiones reales de una clase en un rango de fechas
// (misma lógica que el PDF — no depende de clases_en_rango)
function contarSesiones(clase, desdeDate, hastaDate) {
  if (!clase) return 1
  const DIAS_MAP = { 'Lunes':1, 'Martes':2, 'Miércoles':3, 'Jueves':4, 'Viernes':5, 'Sábado':6, 'Domingo':0 }
  if ((clase.modalidad === 'Semanal' || clase.modalidad === 'Promo' || clase.modalidad === 'Cortesía') && clase.dia) {
    const diaSemana = DIAS_MAP[clase.dia]
    if (diaSemana === undefined) return 1
    const claseInicio = new Date((clase.fecha_inicio || '') + 'T12:00:00')
    const claseFin = clase.fecha_fin ? new Date(clase.fecha_fin + 'T12:00:00') : hastaDate
    const desde = claseInicio > desdeDate ? claseInicio : desdeDate
    const hasta = claseFin < hastaDate ? claseFin : hastaDate
    let count = 0
    const d = new Date(desde)
    while (d <= hasta && d.getDay() !== diaSemana) d.setDate(d.getDate() + 1)
    while (d <= hasta) { count++; d.setDate(d.getDate() + 7) }
    return count || 1
  }
  return 1
}

// Misma función que Clases.js — calcula comisión por inscripción, ya incluye 50% Promo
const MESES_IDX_COM = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre']
function calcComisionPorIns(inscripcion, coach) {
  if (!coach) return 0
  const esPromo = inscripcion.metodo_pago === 'Promo' || inscripcion.clases?.modalidad === 'Promo'
  if (!inscripcion.pagado && !esPromo) return 0
  // Si tiene override manual, usar ese valor directamente
  if (inscripcion.comision_override != null) return inscripcion.comision_override
  // Promo: $300 fijo
  let comision = 0
  const tipo = inscripcion.clases?.tipo
  if (coach.esquema_comision === 'Porcentaje') {
    comision = Math.round((inscripcion.monto_cobrado || 0) * (coach.porcentaje_comision || 0))
  } else if (coach.esquema_comision === 'Bono') {
    comision = coach.pago_extra_clase || 0
  } else if (coach.esquema_comision === 'Mixto') {
    if (tipo === 'Privada') comision = Math.round(coach.tarifa_privada_fija || 0)
    else comision = Math.round((inscripcion.monto_cobrado || 0) * (coach.porcentaje_comision || 0))
  }
  return Math.round(comision)
}

function calcComision(coach, clases, ingresoTeorico) {
  if (!coach) return 0
  if (coach.esquema_comision === 'Porcentaje') {
    const base = coach.sueldo_base || 0
    const neto = coach.aplica_iva ? ingresoTeorico / 1.16 : ingresoTeorico
    return base + neto * (coach.porcentaje_comision || 0)
  }
  if (coach.esquema_comision === 'Bono') {
    const clasesBase = coach.clases_base || 55
    const pct = pctTramo(clases, clasesBase)
    const baseProporcional = (coach.sueldo_base || 0) * pct
    const extra = Math.max(0, clases - clasesBase) * (coach.pago_extra_clase || 0)
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
  const [modalReporte, setModalReporte] = useState(false)
  const [reporteModo, setReporteModo] = useState('mes')
  const [reporteMes, setReporteMes] = useState(MESES[new Date().getMonth()])
  const [reporteDesde, setReporteDesde] = useState('')
  const [reporteHasta, setReporteHasta] = useState('')
  const [reporteCoach, setReporteCoach] = useState('todos')
  const [generandoExcel, setGenerandoExcel] = useState(false)

  useEffect(() => { fetchData() }, [])
  useEffect(() => { calcResumen() }, [mesSeleccionado, desde, hasta, modoFiltro, coaches, inscripciones, clases])

  const fetchData = async () => {
    const [{ data: cs }, { data: ins }, { data: cl }] = await Promise.all([
      supabase.from('coaches').select('*').order('nombre'),
      supabase.from('inscripciones').select('*, jugadores(nombre), clases(coach_id, tipo, modalidad, fecha_inicio, fecha_fin, dia, hora)'),
      supabase.from('clases').select('*'),
    ])
    setCoaches(cs || [])
    setInscripciones(ins || [])
    setClases(cl || [])
  }

  const filtrarIns = (ins) => {
    if (modoFiltro === 'mes') return ins.filter(i => i.mes === mesSeleccionado)
    if (modoFiltro === 'rango') {
      const DIAS_MAP_F = { 'Lunes':1,'Martes':2,'Miércoles':3,'Jueves':4,'Viernes':5,'Sábado':6,'Domingo':0 }
      const desdeD = desde ? new Date(desde + 'T12:00:00') : null
      const hastaD = hasta ? new Date(hasta + 'T12:00:00') : null
      return ins.filter(i => {
        const clase = i.clases
        if (!clase?.fecha_inicio) return false
        const fi = new Date(clase.fecha_inicio + 'T12:00:00')
        const ff = clase.fecha_fin ? new Date(clase.fecha_fin + 'T12:00:00') : fi
        // Para clases únicas: la fecha debe caer en el rango
        if (clase.modalidad === 'Clase única') {
          if (desdeD && fi < desdeD) return false
          if (hastaD && fi > hastaD) return false
          return true
        }
        // Para Semanal/Promo: verificar que alguna sesión del día cae en el rango
        const diaSemana = DIAS_MAP_F[clase.dia]
        if (diaSemana !== undefined) {
          // La clase existe si: fecha_inicio <= hasta Y fecha_fin >= desde
          if (hastaD && fi > hastaD) return false
          if (desdeD && ff < desdeD) return false
          // Verificar que el día de la semana cae dentro del rango efectivo
          const rangoInicio = desdeD && fi < desdeD ? desdeD : fi
          const rangoFin = hastaD && ff > hastaD ? hastaD : ff
          const d = new Date(rangoInicio)
          let found = false
          for (let i = 0; i <= 6; i++) {
            if (d.getDay() === diaSemana && d <= rangoFin) { found = true; break }
            d.setDate(d.getDate() + 1)
          }
          return found
        }
        // Sin día definido: usar fecha_inicio
        if (desdeD && fi < desdeD) return false
        if (hastaD && fi > hastaD) return false
        return true
      })
    }
    return ins
  }

  const calcResumen = () => {
    const MESES_LIST = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre']
    // Rango de fechas para contar sesiones reales
    let resumenDesde, resumenHasta
    if (modoFiltro === 'mes') {
      const mesIdx = MESES_LIST.indexOf(mesSeleccionado)
      resumenDesde = new Date(2026, mesIdx, 1)
      resumenHasta = new Date(2026, mesIdx + 1, 0)
    } else {
      resumenDesde = desde ? new Date(desde + 'T00:00:00') : new Date('2026-01-01')
      resumenHasta = hasta ? new Date(hasta + 'T23:59:59') : new Date()
    }
    const res = coaches.map(coach => {
      const insMes = filtrarIns(inscripciones).filter(i => i.clases?.coach_id === coach.id)

      // Inscripciones que generan comisión: pagadas + Promo (modalidad o metodo_pago)
      const insParaComision = insMes.filter(i => {
        const modalidad = i.clases?.modalidad
        if (modalidad === 'Promo' || modalidad === 'Cortesía') return true
        if (i.metodo_pago === 'Promo') return true
        return i.pagado
      })

      // Total sesiones únicas
      const seenAll = new Set()
      let clasesUnicas = 0
      insParaComision.forEach(i => {
        if (!seenAll.has(i.clase_id)) {
          seenAll.add(i.clase_id)
          clasesUnicas += contarSesiones(i.clases, resumenDesde, resumenHasta)
        }
      })

      // Ingreso teórico (para esquemas Porcentaje/Mixto)
      let ingresoTeorico = 0
      insParaComision.forEach(i => {
        const modalidad = i.clases?.modalidad
        const p = insMes.filter(x => x.clase_id === i.clase_id).length
        const esPromo = modalidad === 'Promo' || modalidad === 'Cortesía' || i.metodo_pago === 'Promo'
        const mesIdx = MESES_LIST.indexOf((i.mes || '').toLowerCase())
        const anio = i.anio || 2026
        const factor = esPromo && (anio > 2026 || (anio === 2026 && mesIdx >= 4)) ? 0.5 : 1
        const monto = (modalidad === 'Promo' || modalidad === 'Cortesía')
          ? calcValorTeorico(modalidad, p)
          : (i.monto_cobrado > 0 ? i.monto_cobrado : calcValorTeorico(modalidad, p))
        ingresoTeorico += monto * factor
      })

      const cobrado = insMes.filter(i => i.pagado).reduce((a, i) => a + (i.monto_cobrado || 0), 0)

      // Comisión: normal según esquema + $300 fijo por cada sesión Promo
      const seenPromo = new Set()
      let sesionesPromo = 0
      insParaComision.forEach(i => {
        const esPromo = i.clases?.modalidad === 'Promo' || i.metodo_pago === 'Promo'
        if (!esPromo || seenPromo.has(i.clase_id)) return
        seenPromo.add(i.clase_id)
        sesionesPromo += contarSesiones(i.clases, resumenDesde, resumenHasta)
      })
      const insNormales = insParaComision.filter(i => i.clases?.modalidad !== 'Promo' && i.metodo_pago !== 'Promo')
      const seenNorm = new Set()
      let clasesUnicasNorm = 0
      insNormales.forEach(i => {
        if (!seenNorm.has(i.clase_id)) { seenNorm.add(i.clase_id); clasesUnicasNorm += contarSesiones(i.clases, resumenDesde, resumenHasta) }
      })
      const comisionNormal = calcComision(coach, clasesUnicasNorm, ingresoTeorico)
      const comision = comisionNormal + (sesionesPromo * Math.round(300 / 1.16))

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
      try {
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
          if (i.metodo_pago === 'Promo') return true
          const modalidad = i.clases?.modalidad
          if (modalidad === 'Promo' || modalidad === 'Cortesía') return true
          return i.pagado
        })
        const MESES_IDX_PDF = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre']
        let ingresoTeoricoPDF = 0
        insCoachPDF.forEach(i => {
          const modalidad = i.clases?.modalidad
          const esPromoMetodo = i.metodo_pago === 'Promo'
          const esPromoModalidad = modalidad === 'Promo' || modalidad === 'Cortesía'
          const p = insCoachAll.filter(x => x.clase_id === i.clase_id).length
          let factorP = 1
          if (esPromoModalidad) {
            ingresoTeoricoPDF += calcValorTeorico(modalidad, p) * factorP
          } else if (esPromoMetodo) {
            ingresoTeoricoPDF += calcValorTeorico(modalidad, p) * factorP
          } else {
            const monto = i.monto_cobrado && i.monto_cobrado > 0 ? i.monto_cobrado : calcValorTeorico(modalidad, p)
            ingresoTeoricoPDF += monto
          }
        })

        // Comisión total sobre TODAS las sesiones
        // Rango del período para contar sesiones
        const MESES_N_COM = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre']
        let comDesde, comHasta
        if (modoFiltro === 'mes') {
          const mIdx = MESES_N_COM.indexOf(mesSeleccionado)
          comDesde = new Date(2026, mIdx, 1)
          comHasta = new Date(2026, mIdx + 1, 0)
        } else {
          comDesde = desde ? new Date(desde + 'T00:00:00') : new Date('2026-01-01')
          comHasta = hasta ? new Date(hasta + 'T23:59:59') : new Date()
        }
        // ── PASO 1: Construir sesiones ANTES de dibujar para tener totales correctos ──
        const DIAS_MAP_PRE = { 'Lunes':1,'Martes':2,'Miércoles':3,'Jueves':4,'Viernes':5,'Sábado':6,'Domingo':0 }
        const DIAS_CORTO_PRE = { 0:'Dom',1:'Lun',2:'Mar',3:'Mié',4:'Jue',5:'Vie',6:'Sáb' }
        const MESES_CORTO_PRE = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']
        const MESES_LIST_PRE = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre']

        const calcComisionPorSesionPRE = (inscripciones_clase, clase) => {
          if (!inscripciones_clase || inscripciones_clase.length === 0) return 0
          if (clase?.modalidad === 'Promo' || inscripciones_clase.some(i => i.metodo_pago === 'Promo')) return Math.round(300 / 1.16)
          const montoMensual = inscripciones_clase.reduce((s, i) => s + (i.monto_cobrado || 0), 0)
          if (montoMensual === 0) return 0
          const ins0 = inscripciones_clase[0]
          const mesIdx = MESES_LIST_PRE.indexOf((ins0?.mes || '').toLowerCase())
          const anio = ins0?.anio || 2026
          const mesDesde = mesIdx >= 0 ? new Date(anio, mesIdx, 1) : comDesde
          const mesHasta = mesIdx >= 0 ? new Date(anio, mesIdx + 1, 0) : comHasta
          const sesionesEnMes = contarSesiones(clase, mesDesde, mesHasta)
          const valorPorSesion = sesionesEnMes > 0 ? montoMensual / sesionesEnMes : montoMensual
          if (r.coach.esquema_comision === 'Porcentaje') {
            const neto = r.coach.aplica_iva ? valorPorSesion / 1.16 : valorPorSesion
            return Math.round(neto * (r.coach.porcentaje_comision || 0))
          }
          if (r.coach.esquema_comision === 'Bono') {
            const cb = r.coach.clases_base || 55
            return Math.round((r.coach.sueldo_base || 0) * pctTramo(r.clasesUnicas, cb) / Math.min(r.clasesUnicas, cb))
          }
          if (r.coach.esquema_comision === 'Mixto') {
            const neto = r.coach.aplica_iva ? valorPorSesion / 1.16 : valorPorSesion
            return Math.round((clase?.tipo === 'Privada' ? (r.coach.tarifa_privada_fija || 0) : 0) + neto * (r.coach.porcentaje_comision || 0))
          }
          return 0
        }

        const sesionesPreview = []
        const claseMapPRE = {}
        insCoachPDF.forEach(ins => {
          const cid = ins.clase_id
          if (!claseMapPRE[cid]) claseMapPRE[cid] = { ins, jugadores: [], inscripciones: [] }
          if (ins.jugadores?.nombre) claseMapPRE[cid].jugadores.push(ins.jugadores.nombre)
          claseMapPRE[cid].inscripciones.push(ins)
        })

        Object.values(claseMapPRE).forEach(({ ins, jugadores, inscripciones }) => {
          const clase = ins.clases
          if (!clase) return
          const jugStr = jugadores.join(', ')
          const comSes = calcComisionPorSesionPRE(inscripciones, clase)
          if ((clase.modalidad === 'Semanal' || clase.modalidad === 'Promo') && clase.dia) {
            const dSem = DIAS_MAP_PRE[clase.dia]
            if (dSem === undefined) return
            const fi2 = clase.fecha_inicio ? new Date(clase.fecha_inicio + 'T12:00:00') : new Date()
            const ff2 = clase.fecha_fin ? new Date(clase.fecha_fin + 'T23:59:59') : comHasta
            const rI = comDesde > fi2 ? comDesde : fi2
            const rF = comHasta < ff2 ? comHasta : ff2
            const d2 = new Date(rI)
            while (d2 <= rF && d2.getDay() !== dSem) d2.setDate(d2.getDate() + 1)
            while (d2 <= rF) {
              const dd2 = String(d2.getDate()).padStart(2,'0')
              sesionesPreview.push({ fecha: `${dd2} ${MESES_CORTO_PRE[d2.getMonth()]} ${DIAS_CORTO_PRE[d2.getDay()]}`, hora: clase.hora?.slice(0,5)||'—', tipo: clase.tipo, jugadores: jugStr, comision: comSes, sortKey: d2.getTime(), claseId: ins.clase_id })
              d2.setDate(d2.getDate() + 7)
            }
          } else {
            const fi2 = clase.fecha_inicio ? new Date(clase.fecha_inicio + 'T12:00:00') : null
            let fechaStr = clase.dia || '—'
            if (fi2 && !isNaN(fi2)) { const dd2 = String(fi2.getDate()).padStart(2,'0'); fechaStr = `${dd2} ${MESES_CORTO_PRE[fi2.getMonth()]} ${DIAS_CORTO_PRE[fi2.getDay()]}` }
            sesionesPreview.push({ fecha: fechaStr, hora: clase.hora?.slice(0,5)||'—', tipo: clase.tipo, jugadores: jugStr, comision: comSes, sortKey: fi2 ? fi2.getTime() : 0, claseId: ins.clase_id })
          }
        })
        sesionesPreview.sort((a, b) => a.sortKey - b.sortKey)

        // Totales calculados ANTES de dibujar
        const subTotal = sesionesPreview.reduce((s, ses) => s + (ses.comision || 0), 0)
        const ivaDeducidoTotal = r.coach.aplica_iva ? Math.round(subTotal / (r.coach.porcentaje_comision || 1) * (r.coach.porcentaje_comision || 1) * 0.16 / 1.16 * 0) : 0
        const comisionClases = subTotal
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
          const clasesBase = r.coach.clases_base || 55
          const pct2 = pctTramo(r.clasesUnicas, clasesBase)
          const tramoLabel = r.clasesUnicas >= clasesBase ? `100%+: 100% del base` : r.clasesUnicas >= 51 ? `51-54 clases: 80% del base` : r.clasesUnicas >= 41 ? `41-50 clases: 60% del base` : r.clasesUnicas >= 31 ? `31-40 clases: 40% del base` : r.clasesUnicas >= 21 ? `21-30 clases: 20% del base` : `1-20 clases: 10% del base`
          reglaCorta = `${r.clasesUnicas}/${clasesBase} clases · tramo ${tramoLabel}`
        }
        if (r.coach.esquema_comision === 'Mixto') reglaCorta = `$${r.coach.tarifa_privada_fija}/priv + ${(r.coach.porcentaje_comision*100).toFixed(0)}% comp`
        txt(reglaCorta, M+110, y+14, 7.5, false, [90,110,140])
        txt(fmt2(comisionClases), W-M-6, y+12, 12, true, [200,215,240], 'right')
        y += 26

        // Total line
        doc.setFillColor(0, 229, 160)
        doc.rect(M, y, W-M*2, 0.5, 'F')
        y += 5
        // Subtotal / IVA / Total
        const pctCoach = r.coach.porcentaje_comision || 0
        // SubTotal = suma de comisiones por clase (ya calculado)
        // Para Porcentaje con IVA: cada sesión = (ingreso/1.16)*pct
        // Ingreso bruto = comision / pct * 1.16, IVA = ingreso_bruto - ingreso_neto
        const ingresoNeto = r.coach.aplica_iva && pctCoach > 0 ? Math.round(comisionClases / pctCoach) : 0
        const ingresoBruto = r.coach.aplica_iva && pctCoach > 0 ? Math.round(ingresoNeto * 1.16) : 0
        const ivaDeducido = ingresoBruto - ingresoNeto

        // Fila SubTotal
        doc.setFillColor(20, 26, 40)
        doc.rect(M, y, W-M*2, 8, 'F')
        txt('Subtotal comisiones por clase', M+4, y+5.5, 8, false, [140,155,185])
        txt(fmt2(comisionClases), W-M-2, y+5.5, 9, true, [200,215,240], 'right')
        y += 9

        // Fila IVA (informativa, ya incluido en el subtotal)
        if (r.coach.aplica_iva && ivaDeducido > 0) {
          doc.setFillColor(18, 22, 34)
          doc.rect(M, y, W-M*2, 7, 'F')
          txt('IVA incluido (16%)', M+4, y+5, 7.5, false, [120,135,165])
          txt(fmt2(ivaDeducido), W-M-2, y+5, 7.5, false, [160,175,200], 'right')
          y += 7
        }

        // Fila Total
        doc.setFillColor(0, 229, 160, 0.1)
        doc.setFillColor(15, 30, 25)
        doc.rect(M, y, W-M*2, 9, 'F')
        doc.setDrawColor(0, 229, 160)
        doc.setLineWidth(0.3)
        doc.rect(M, y, W-M*2, 9, 'S')
        txt(`TOTAL A PAGAR (base $${fmt2(baseProporcional)} + clases $${fmt2(comisionClases)})`, M+4, y+6, 8, true, [0,229,160])
        txt(fmt2(totalAPagar), W-M-2, y+6, 11, true, [0,229,160], 'right')
        y += 14

        // Table title
        txt('CLASES DEL PERIODO', M, y, 8, true, [80,100,130])
        y += 5

        // Table header - Fecha | Horario | Tipo | Jugadores | Comisión
        const cols = [
          { label: 'Fecha', w: 36 },
          { label: 'Horario', w: 16 },
          { label: 'Tipo', w: 22 },
          { label: 'Jugadores', w: 76 },
          { label: 'Comisión', w: 28 },
        ]
        doc.setFillColor(20, 26, 42)
        doc.rect(M, y, W-M*2, 6, 'F')
        let cx = M + 2
        cols.forEach(c => {
          txt(c.label, cx, y+4, 7, true, [130,150,180])
          cx += c.w
        })
        y += 7

        // Build sessions grouped by clase_id, then expand to real calendar dates
        const DIAS_MAP_PDF = { 'Lunes':1, 'Martes':2, 'Miércoles':3, 'Jueves':4, 'Viernes':5, 'Sábado':6, 'Domingo':0 }
        const MESES_N_PDF = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre']
        const DIAS_CORTO_PDF = { 0:'Dom', 1:'Lun', 2:'Mar', 3:'Mié', 4:'Jue', 5:'Vie', 6:'Sáb' }
        const MESES_CORTO_PDF = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']

        const insCoach = filtrarIns(inscripciones).filter(i =>
          i.clases?.coach_id === r.coach.id &&
          (i.pagado || i.metodo_pago === 'Promo' || i.clases?.modalidad === 'Promo' || i.clases?.modalidad === 'Cortesía')
        )

        // Group by clase_id
        const claseMapPDF = {}
        insCoach.forEach(ins => {
          const cid = ins.clase_id
          if (!claseMapPDF[cid]) claseMapPDF[cid] = { ins, jugadores: [], inscripciones: [] }
          const nombre = ins.jugadores?.nombre
          if (nombre) claseMapPDF[cid].jugadores.push(nombre)
          claseMapPDF[cid].inscripciones.push(ins)
        })

        // Date range for expansion
        let pdfDesde, pdfHasta
        if (modoFiltro === 'mes') {
          const mesIdx2 = MESES_N_PDF.indexOf(mesSeleccionado)
          const anioN = 2026
          pdfDesde = new Date(anioN, mesIdx2, 1)
          pdfHasta = new Date(anioN, mesIdx2 + 1, 0)
        } else {
          pdfDesde = desde ? new Date(desde + 'T00:00:00') : new Date('2026-01-01T00:00:00')
          pdfHasta = hasta ? new Date(hasta + 'T23:59:59') : new Date()
        }

        // Calcula comisión por sesión:
        // monto_cobrado es el pago MENSUAL del jugador
        // Se divide entre las sesiones totales del mes para obtener el valor por sesión
        // Luego se aplica el porcentaje de comisión solo a las sesiones en el rango
        const MESES_LIST_PDF = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre']

        const calcComisionPorSesion = (inscripciones_clase, clase) => {
          if (!inscripciones_clase || inscripciones_clase.length === 0) return 0
          // Promo: $300 fijo por sesión
          if (clase?.modalidad === 'Promo' || inscripciones_clase.some(i => i.metodo_pago === 'Promo')) return Math.round(300 / 1.16)
          // Sumar monto_cobrado de todas las inscripciones de esta clase
          const montoMensual = inscripciones_clase.reduce((s, i) => s + (i.monto_cobrado || 0), 0)
          if (montoMensual === 0) return 0

          // Calcular cuántas sesiones tiene esta clase en su mes completo
          const ins0 = inscripciones_clase[0]
          const mesIdx = MESES_LIST_PDF.indexOf((ins0?.mes || '').toLowerCase())
          const anio = ins0?.anio || 2026
          let mesDesde, mesHasta
          if (mesIdx >= 0) {
            mesDesde = new Date(anio, mesIdx, 1)
            mesHasta = new Date(anio, mesIdx + 1, 0)
          } else {
            mesDesde = pdfDesde
            mesHasta = pdfHasta
          }
          const sesionesEnMes = contarSesiones(clase, mesDesde, mesHasta)
          const valorPorSesion = sesionesEnMes > 0 ? montoMensual / sesionesEnMes : montoMensual

          // Aplicar esquema de comisión sobre el valor por sesión
          if (r.coach.esquema_comision === 'Porcentaje') {
            const neto = r.coach.aplica_iva ? valorPorSesion / 1.16 : valorPorSesion
            return Math.round(neto * (r.coach.porcentaje_comision || 0))
          }
          if (r.coach.esquema_comision === 'Bono') {
            const clasesBasePDF = r.coach.clases_base || 55
            return Math.round((r.coach.sueldo_base || 0) * pctTramo(r.clasesUnicas, clasesBasePDF) / Math.min(r.clasesUnicas, clasesBasePDF))
          }
          if (r.coach.esquema_comision === 'Mixto') {
            const neto = r.coach.aplica_iva ? valorPorSesion / 1.16 : valorPorSesion
            const esPrivada = clase?.tipo === 'Privada'
            return Math.round((esPrivada ? (r.coach.tarifa_privada_fija || 0) : 0) + neto * (r.coach.porcentaje_comision || 0))
          }
          return 0
        }

        // Usar sesiones ya calculadas (sesionesPreview) para la tabla
        const sesiones = sesionesPreview
        if (false) Object.values(claseMapPDF).forEach(({ ins, jugadores, inscripciones }) => {
          const clase = ins.clases
          if (!clase) return
          const jugStr = jugadores.join(', ')
          const comisionEstaSesion = calcComisionPorSesion(inscripciones, clase)

          if ((clase.modalidad === 'Semanal' || clase.modalidad === 'Promo' || clase.modalidad === 'Cortêsía') && clase.dia) {
            const diaSemana = DIAS_MAP_PDF[clase.dia]
            if (diaSemana === undefined) return
            const claseInicio = clase.fecha_inicio ? new Date(clase.fecha_inicio + 'T12:00:00') : new Date()
            const claseFin = clase.fecha_fin ? new Date(clase.fecha_fin + 'T23:59:59') : pdfHasta
            const rangoInicio = pdfDesde > claseInicio ? pdfDesde : claseInicio
            const rangoFin = pdfHasta < claseFin ? pdfHasta : claseFin
            const d = new Date(rangoInicio)
            while (d <= rangoFin && d.getDay() !== diaSemana) d.setDate(d.getDate() + 1)
            while (d <= rangoFin) {
              const dd = String(d.getDate()).padStart(2,'0')
              sesiones.push({
                fecha: dd + ' ' + MESES_CORTO_PDF[d.getMonth()] + ' ' + DIAS_CORTO_PDF[d.getDay()],
                hora: clase.hora?.slice(0,5) || '—',
                tipo: clase.tipo,
                jugadores: jugStr,
                comision: comisionEstaSesion,
                sortKey: d.getTime(),
                claseId: ins.clase_id
              })
              d.setDate(d.getDate() + 7)
            }
          } else {
            // Clase única o Promo sin día — usar fecha_inicio (T12:00 evita desfase UTC/CST)
            const fi = clase.fecha_inicio ? new Date(clase.fecha_inicio + 'T12:00:00') : null
            let fechaStr = clase.dia || '—'
            if (fi && !isNaN(fi)) {
              const dd = String(fi.getDate()).padStart(2,'0')
              fechaStr = dd + ' ' + MESES_CORTO_PDF[fi.getMonth()] + ' ' + DIAS_CORTO_PDF[fi.getDay()]
            }
            sesiones.push({
              fecha: fechaStr,
              hora: clase.hora?.slice(0,5) || '—',
              tipo: clase.tipo,
              jugadores: jugStr,
              comision: comisionEstaSesion,
              sortKey: fi ? fi.getTime() : 0,
              claseId: ins.clase_id
            })
          }
        })

        }) // cierre del if(false)
        // Sort ya hecho en sesionesPreview

        sesiones.forEach((ses, i) => {
          if (y > 270) { doc.addPage(); y = M }
          const bg = i % 2 === 0 ? [17, 21, 34] : [21, 27, 42]
          doc.setFillColor(...bg)
          doc.rect(M, y, W-M*2, 5.5, 'F')
          cx = M + 2
          const row = [
            { val: ses.fecha, color: [200,215,240] },
            { val: ses.hora, color: [160,175,200] },
            { val: ses.tipo, color: [140,160,190] },
            { val: ses.jugadores.substring(0, 40), color: [200,215,240] },
            { val: fmt2(ses.comision), color: [0,229,160] },
          ]
          row.forEach((cell, j) => {
            txt(String(cell.val), cx, y+4, 7, false, cell.color)
            cx += cols[j].w
          })
          y += 5.5
        })

        if (sesiones.length === 0) {
          txt('Sin clases en este periodo', M+2, y+4, 8, false, [80,100,130])
          y += 8
        }

        // Footer total
        const totalSesiones = sesiones.length
        y += 6
        doc.setFillColor(15, 19, 30)
        doc.rect(M, y, W-M*2, 10, 'F')
        txt('Total sesiones: ' + totalSesiones, M+4, y+6, 8, false, [120,140,170])
        txt('TOTAL A PAGAR: ' + fmt2(totalAPagar), W-M-4, y+6, 10, true, [0,229,160], 'right')
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
      } catch(err) { console.error('PDF error:', err); alert('Error generando PDF: ' + err.message) }
      setExportando(false)
      setModalExport(false)
    }

    cargarJsPDF()
  }

  const generarExcel = () => {
    setGenerandoExcel(true)
    const cargar = () => {
      if (window.XLSX) { ejecutar(); return }
      const s = document.createElement('script')
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js'
      s.onload = ejecutar
      document.head.appendChild(s)
    }

    const ejecutar = () => {
      // Filter inscriptions
      const MESES_IDX = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre']
      const insReporte = inscripciones.filter(i => {
        const coachId = i.clases?.coach_id
        if (reporteCoach !== 'todos' && coachId !== reporteCoach) return false
        if (reporteModo === 'mes') return i.mes === reporteMes
        if (reporteModo === 'rango') {
          // Filter by mes/anio matching the date range
          const mesIdx = MESES_IDX.indexOf(i.mes)
          if (mesIdx < 0) return false
          const anio = i.anio || 2026
          const fechaMes = `${anio}-${String(mesIdx + 1).padStart(2,'0')}-01`
          if (reporteDesde && fechaMes < reporteDesde.slice(0,8) + '01') {
            // Check if month is within range
            const desdeYM = reporteDesde.slice(0,7)
            const hastaYM = reporteHasta ? reporteHasta.slice(0,7) : '9999-12'
            const mesYM = `${anio}-${String(mesIdx + 1).padStart(2,'0')}`
            return mesYM >= desdeYM && mesYM <= hastaYM
          }
          const desdeYM = reporteDesde ? reporteDesde.slice(0,7) : '0000-01'
          const hastaYM = reporteHasta ? reporteHasta.slice(0,7) : '9999-12'
          const mesYM = `${anio}-${String(mesIdx + 1).padStart(2,'0')}`
          return mesYM >= desdeYM && mesYM <= hastaYM
        }
        return true
      })

      // SIMPLE: one row per jugador per coach per mes
      // Only PAID inscriptions (+ Promo) count for commission

      const PRECIOS_T = {1:{S:1000,U:1200},2:{S:550,U:660},3:{S:435,U:555},4:{S:375,U:450}}

      // Step 1: For each coach+mes, calculate total commission on paid classes only
      const comisionCoachMes = {}
      coaches.forEach(coach => {
        const insCoach = insReporte.filter(i => i.clases?.coach_id === coach.id)
        const meses = [...new Set(insCoach.map(i => i.mes))]
        meses.forEach(mes => {
          const insMes = insCoach.filter(i => i.mes === mes)
          // Only paid + promo count
          const insBase = insMes.filter(i => {
            const mod = i.clases?.modalidad
            return mod === 'Promo' || mod === 'Cortesía' || i.pagado
          })
          // Hours
          const seenH = new Set()
          let horas = 0
          insBase.forEach(i => {
            if (!seenH.has(i.clase_id)) {
              seenH.add(i.clase_id)
              // Calcular rango para este mes específico
              const MESES_XLS = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre']
              const mIdxXls = MESES_XLS.indexOf(mes)
              const anioXls = i.anio || 2026
              const xlsDesde = mIdxXls >= 0 ? new Date(anioXls, mIdxXls, 1) : new Date(anioXls, 0, 1)
              const xlsHasta = mIdxXls >= 0 ? new Date(anioXls, mIdxXls + 1, 0) : new Date(anioXls, 11, 31)
              horas += contarSesiones(i.clases, xlsDesde, xlsHasta)
            }
          })
          // Theoretical income
          let ingreso = 0
          insBase.forEach(i => {
            const mod = i.clases?.modalidad
            if (mod === 'Promo' || mod === 'Cortesía') {
              const n = Math.min(insMes.filter(x => x.clase_id === i.clase_id).length, 4)
              ingreso += PRECIOS_T[n]?.S || 0
            } else {
              ingreso += i.monto_cobrado || 0
            }
          })
          // Commission
          // % applies ON total WITH IVA (prices already include IVA)
          let comision = 0, comisionVariable = 0, comisionFija = 0
          if (coach.esquema_comision === 'Porcentaje') {
            // ingreso ya incluye IVA — aplicar % sobre total con IVA
            comisionVariable = ingreso * (coach.porcentaje_comision || 0)
            comisionFija = coach.sueldo_base || 0
            comision = comisionFija + comisionVariable
          } else if (coach.esquema_comision === 'Bono') {
            const horasMin = coach.horas_base_bono || 40
            const pct = horas / horasMin
            const pctBase = pct >= 1 ? (coach.tramo4_pct ?? 1) : pct > 0.6 ? (coach.tramo3_pct ?? 0.7) : pct > 0.3 ? (coach.tramo2_pct ?? 0.5) : (coach.tramo1_pct ?? 0.3)
            comisionFija = (coach.sueldo_base || 0) * pctBase
            comisionVariable = Math.max(0, horas - (coach.clases_base || 0)) * (coach.pago_extra_clase || 0)
            comision = comisionFija + comisionVariable
          } else if (coach.esquema_comision === 'Mixto') {
            // % sobre total con IVA
            comisionFija = coach.sueldo_base || 0
            comisionVariable = horas * (coach.tarifa_privada_fija || 0) + ingreso * (coach.porcentaje_comision || 0)
            comision = comisionFija + comisionVariable
          }
          comisionCoachMes[`${coach.id}||${mes}`] = { comision, comisionVariable, comisionFija, ingreso }
        })
      })

      // Step 2: Group by jugador+coach+mes
      const grupos = {}
      insReporte.forEach(i => {
        const coachId = i.clases?.coach_id
        const key = `${coachId}||${i.jugadores?.nombre}||${i.mes}`
        if (!grupos[key]) {
          grupos[key] = {
            coachId, coachNombre: coaches.find(c => c.id === coachId)?.nombre || '—',
            jugador: i.jugadores?.nombre || '—', mes: i.mes || '—',
            montoPagado: 0, montoPendiente: 0, ingresoBase: 0,
            clases: 0, metodos: new Set(), tipos: new Set(),
            modalidades: new Set(), dias: new Set(), horarios: new Set(),
          }
        }
        const g = grupos[key]
        g.clases++
        if (i.metodo_pago) g.metodos.add(i.metodo_pago)
        if (i.clases?.tipo) g.tipos.add(i.clases.tipo)
        if (i.clases?.modalidad) g.modalidades.add(i.clases.modalidad)
        if (i.clases?.dia) g.dias.add(i.clases.dia)
        if (i.clases?.hora) g.horarios.add(i.clases.hora.slice(0,5))
        if (i.pagado) g.montoPagado += i.monto_cobrado || 0
        else g.montoPendiente += i.monto_cobrado || 0
        // Base for commission proportion (paid + promo)
        const mod = i.clases?.modalidad
        if (mod === 'Promo' || mod === 'Cortesía') {
          const insMes2 = insReporte.filter(x => x.clase_id === i.clase_id)
          const n = Math.min(insMes2.length, 4)
          g.ingresoBase += PRECIOS_T[n]?.S || 0
        } else if (i.pagado) {
          g.ingresoBase += i.monto_cobrado || 0
        }
      })

      // Step 3: Build rows with proportional commission — split fixed vs variable, net vs IVA
      const rows = Object.values(grupos).map(g => {
        const coach = coaches.find(c => c.id === g.coachId)
        const { comision = 0, ingreso: ingresoTotal = 0, comisionVariable = 0, comisionFija = 0 } = comisionCoachMes[`${g.coachId}||${g.mes}`] || {}
        const proporcion = ingresoTotal > 0 ? g.ingresoBase / ingresoTotal : 0

        // ── Ingreso breakdown (prices include IVA) ──
        const totalCobrado = g.montoPagado
        const ingresoNeto = Math.round(totalCobrado / 1.16)
        const ingresoIva = totalCobrado - ingresoNeto

        // ── Commission breakdown — proportional ──
        const comVarProp = Math.round(comisionVariable * proporcion)
        const comFijaProp = Math.round(comisionFija * proporcion)
        const comTotalProp = comVarProp + comFijaProp
        // Commission also desglosed with IVA
        const comTotalNeto = Math.round(comTotalProp / 1.16)
        const comTotalIva = comTotalProp - comTotalNeto

        const comVarNeto = Math.round(comVarProp / 1.16)
        const comVarIva = comVarProp - comVarNeto
        const comFijaNeto = Math.round(comFijaProp / 1.16)
        const comFijaIva = comFijaProp - comFijaNeto

        return {
          'Coach': g.coachNombre,
          'Mes': g.mes,
          'Jugador': g.jugador,
          'Día(s)': [...g.dias].join(', ') || '—',
          'Horario(s)': [...g.horarios].join(', ') || '—',
          'Tipo': [...g.tipos].join(', ') || '—',
          'Modalidad': [...g.modalidades].join(', ') || '—',
          'Clases': g.clases,
          // ── Ingreso ──
          'Ingreso Subtotal ($)': ingresoNeto,
          'Ingreso IVA ($)': ingresoIva,
          'Ingreso Total ($)': totalCobrado,
          'Pendiente ($)': g.montoPendiente,
          'Método(s) pago': [...g.metodos].join(', ') || '—',
          // ── Comisión Variable (% / extras) ──
          'Com. Variable Subtotal ($)': comVarNeto,
          'Com. Variable IVA ($)': comVarIva,
          'Com. Variable Total ($)': comVarProp,
          // ── Sueldo Base Prorrateado ──
          'Base Prorrateado Subtotal ($)': comFijaNeto,
          'Base Prorrateado IVA ($)': comFijaIva,
          'Base Prorrateado Total ($)': comFijaProp,
          // ── Comisión Total ──
          'Comisión Subtotal ($)': comTotalNeto,
          'Comisión IVA ($)': comTotalIva,
          'Comisión Total ($)': comTotalProp,
        }
      }).sort((a, b) => a['Coach'].localeCompare(b['Coach']) || a['Jugador'].localeCompare(b['Jugador']))

            if (rows.length === 0) { alert('Sin datos para el periodo seleccionado'); setGenerandoExcel(false); return }

      const ws = window.XLSX.utils.json_to_sheet(rows)
      // Column widths
      ws['!cols'] = [
        {wch:22},{wch:12},{wch:24},{wch:16},{wch:14},{wch:14},{wch:14},{wch:8},
        {wch:20},{wch:16},{wch:16},{wch:14},{wch:18},
        {wch:22},{wch:18},{wch:22},
        {wch:24},{wch:20},{wch:24},
        {wch:20},{wch:16},{wch:18}
      ]

      const wb = window.XLSX.utils.book_new()
      const periodo = reporteModo === 'mes' ? reporteMes : `${reporteDesde}_${reporteHasta}`
      const coachNombre = reporteCoach === 'todos' ? 'todos' : coaches.find(c => c.id === reporteCoach)?.nombre?.replace(/\s/g,'_') || 'coach'
      window.XLSX.utils.book_append_sheet(wb, ws, 'Reporte')
      window.XLSX.writeFile(wb, `reporte_${coachNombre}_${periodo}.xlsx`)
      setGenerandoExcel(false)
      setModalReporte(false)
    }
    cargar()
  }

  return (
    <div style={{ maxWidth: 960 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700 }}>Comisiones</h1>
          <p style={{ color: 'var(--text2)', fontSize: 14, marginTop: 4 }}>Calculadas sobre ingreso teórico · Promo no castiga al coach</p>
          <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
            <button className="btn btn-secondary btn-sm" onClick={() => setModalExport(true)}>
              📄 Exportar PDF
            </button>
            <button className="btn btn-secondary btn-sm" onClick={() => setModalReporte(true)}>
              📊 Reporte Excel
            </button>
          </div>
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

      {/* Modal reporte Excel */}
      {modalReporte && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setModalReporte(false)}>
          <div className="modal" style={{ maxWidth: 440 }}>
            <h2 className="modal-title">📊 Reporte Excel</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ display: 'flex', gap: 6 }}>
                <button onClick={() => setReporteModo('mes')} style={{ flex: 1, padding: '7px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 13, background: reporteModo === 'mes' ? 'var(--accent)' : 'var(--bg3)', color: reporteModo === 'mes' ? '#000' : 'var(--text2)', fontWeight: reporteModo === 'mes' ? 600 : 400 }}>Por mes</button>
                <button onClick={() => setReporteModo('rango')} style={{ flex: 1, padding: '7px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 13, background: reporteModo === 'rango' ? 'var(--accent)' : 'var(--bg3)', color: reporteModo === 'rango' ? '#000' : 'var(--text2)', fontWeight: reporteModo === 'rango' ? 600 : 400 }}>Rango de fechas</button>
              </div>
              {reporteModo === 'mes' && (
                <div className="form-group">
                  <label className="form-label">Mes</label>
                  <select className="form-input" value={reporteMes} onChange={e => setReporteMes(e.target.value)} style={{ textTransform: 'capitalize' }}>
                    {MESES.map(m => <option key={m} value={m} style={{ textTransform: 'capitalize' }}>{m}</option>)}
                  </select>
                </div>
              )}
              {reporteModo === 'rango' && (
                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <input className="form-input" type="date" value={reporteDesde} onChange={e => setReporteDesde(e.target.value)} />
                  <span style={{ color: 'var(--text2)' }}>→</span>
                  <input className="form-input" type="date" value={reporteHasta} onChange={e => setReporteHasta(e.target.value)} />
                </div>
              )}
              <div className="form-group">
                <label className="form-label">Coach</label>
                <select className="form-input" value={reporteCoach} onChange={e => setReporteCoach(e.target.value)}>
                  <option value="todos">Todos los coaches</option>
                  {coaches.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                </select>
              </div>
              <div style={{ background: 'rgba(0,229,160,.06)', border: '1px solid rgba(0,229,160,.15)', borderRadius: 8, padding: '10px 14px', fontSize: 12, color: 'var(--text2)', lineHeight: 1.7 }}>
                El reporte incluye: Coach · Fecha · Horario · Día · Tipo · Modalidad · Jugador · Mes cobro · Monto · Pagado · Método pago · Comisión coach
              </div>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                <button className="btn btn-secondary" onClick={() => setModalReporte(false)}>Cancelar</button>
                <button className="btn btn-primary" onClick={generarExcel} disabled={generandoExcel}>
                  {generandoExcel ? 'Generando...' : '⬇️ Descargar Excel'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

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
