import { useState, useEffect } from 'react'
import { supabase } from '../supabase'

const MONTO_CHECKIN = 200

// Genera las fechas de sesión en un rango para una clase semanal
function generarFechasSesiones(dia, fechaInicio, fechaFin) {
  const DIAS_MAP = { 'Lunes':1,'Martes':2,'Miércoles':3,'Jueves':4,'Viernes':5,'Sábado':6,'Domingo':0 }
  if (!dia || !fechaInicio) return []
  const dSemana = DIAS_MAP[dia]
  if (dSemana === undefined) return []
  const inicio = new Date(fechaInicio + 'T12:00:00')
  const fin = fechaFin ? new Date(fechaFin + 'T12:00:00') : new Date(inicio.getFullYear(), inicio.getMonth() + 1, 0)
  const d = new Date(inicio)
  while (d <= fin && d.getDay() !== dSemana) d.setDate(d.getDate() + 1)
  const fechas = []
  while (d <= fin) {
    fechas.push(d.toISOString().slice(0, 10))
    d.setDate(d.getDate() + 7)
  }
  return fechas
}

// Widget para NUEVO alta: muestra fechas con casillas de check-in esperadas
export function CheckinNuevo({ dia, fechaInicio, fechaFin, modalidad, onChange }) {
  const fechas = modalidad === 'Semanal' || modalidad === 'Promo'
    ? generarFechasSesiones(dia, fechaInicio, fechaFin)
    : fechaInicio ? [fechaInicio] : []

  const [checked, setChecked] = useState({})
  const totalCheckins = Object.values(checked).filter(Boolean).length
  const descuento = fechas.length * MONTO_CHECKIN

  useEffect(() => {
    onChange({ fechas, descuento: fechas.length * MONTO_CHECKIN })
  }, [fechaInicio, fechaFin, dia, modalidad])

  if (fechas.length === 0) return null

  return (
    <div style={{ marginTop: 10, background: 'rgba(0,102,255,.06)', border: '1px solid rgba(0,102,255,.2)', borderRadius: 8, padding: '10px 14px' }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: '#0066cc', marginBottom: 8 }}>
        📋 Check-ins esperados ({fechas.length} sesiones × ${MONTO_CHECKIN} = <strong>${descuento.toLocaleString('es-MX')}</strong> descuento)
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {fechas.map(f => {
          const d = new Date(f + 'T12:00:00')
          const label = d.toLocaleDateString('es-MX', { weekday: 'short', day: 'numeric', month: 'short' })
          return (
            <div key={f} style={{ fontSize: 11, background: 'rgba(0,102,255,.1)', borderRadius: 6, padding: '3px 8px', color: '#0066cc', border: '1px solid rgba(0,102,255,.2)' }}>
              📅 {label}
            </div>
          )
        })}
      </div>
      <div style={{ marginTop: 8, fontSize: 11, color: 'var(--text2)' }}>
        ✅ Los check-ins se registrarán al guardar — podrás marcarlos como realizados desde el detalle de la clase
      </div>
    </div>
  )
}

// Widget para DETALLE: muestra check-ins guardados y permite marcarlos
export function CheckinDetalle({ inscripcionId }) {
  const [checkins, setCheckins] = useState([])
  const [loading, setLoading] = useState(true)

  const fetchCheckins = async () => {
    const { data } = await supabase
      .from('checkins')
      .select('*')
      .eq('inscripcion_id', inscripcionId)
      .order('fecha_esperada')
    setCheckins(data || [])
    setLoading(false)
  }

  useEffect(() => { fetchCheckins() }, [inscripcionId])

  const toggleCheckin = async (c) => {
    const nuevoValor = !c.realizado
    await supabase.from('checkins').update({ realizado: nuevoValor }).eq('id', c.id)
    setCheckins(prev => prev.map(x => x.id === c.id ? { ...x, realizado: nuevoValor } : x))
  }

  if (loading) return null
  if (checkins.length === 0) return null

  const realizados = checkins.filter(c => c.realizado).length
  const pendientes = checkins.length - realizados

  return (
    <div style={{ marginTop: 8, background: 'rgba(0,102,255,.06)', border: '1px solid rgba(0,102,255,.2)', borderRadius: 8, padding: '10px 14px' }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: '#0066cc', marginBottom: 8 }}>
        📋 Check-ins — {realizados}/{checkins.length} realizados
        {pendientes > 0 && <span style={{ color: 'var(--danger)', marginLeft: 8 }}>({pendientes} pendientes × ${MONTO_CHECKIN} = ${(pendientes * MONTO_CHECKIN).toLocaleString('es-MX')})</span>}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {checkins.map(c => {
          const d = new Date(c.fecha_esperada + 'T12:00:00')
          const label = d.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'short' })
          return (
            <div key={c.id} onClick={() => toggleCheckin(c)}
              style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer',
                background: c.realizado ? 'rgba(0,196,138,.1)' : 'rgba(255,59,48,.06)',
                border: `1px solid ${c.realizado ? 'rgba(0,196,138,.3)' : 'rgba(255,59,48,.2)'}`,
                borderRadius: 6, padding: '5px 10px' }}>
              <div style={{ width: 18, height: 18, borderRadius: 4, border: `2px solid ${c.realizado ? '#00c48a' : '#ff3b30'}`,
                background: c.realizado ? '#00c48a' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0 }}>
                {c.realizado && <span style={{ color: '#fff', fontSize: 11, fontWeight: 700 }}>✓</span>}
              </div>
              <span style={{ fontSize: 12, color: c.realizado ? '#00c48a' : 'var(--text)', textTransform: 'capitalize' }}>{label}</span>
              {!c.realizado && <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--danger)' }}>-${MONTO_CHECKIN}</span>}
              {c.realizado && <span style={{ marginLeft: 'auto', fontSize: 11, color: '#00c48a' }}>✅ Realizado</span>}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// Función helper para guardar check-ins después de insertar inscripcion
export async function guardarCheckins(inscripcionId, fechas) {
  if (!fechas || fechas.length === 0) return
  await supabase.from('checkins').insert(
    fechas.map(f => ({ inscripcion_id: inscripcionId, fecha_esperada: f, realizado: false }))
  )
}
