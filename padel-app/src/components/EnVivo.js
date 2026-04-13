import { useState, useEffect } from 'react'
import { supabase } from '../supabase'

function getNow() {
  const now = new Date()
  const hora = now.getHours().toString().padStart(2,'0') + ':00'
  const dias = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado']
  const dia = dias[now.getDay()]
  return { hora, dia, now }
}

export default function EnVivo() {
  const [clases, setClases] = useState([])
  const [inscripciones, setInscripciones] = useState([])
  const [tiempo, setTiempo] = useState(new Date())
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchData()
    const interval = setInterval(() => {
      fetchData()
      setTiempo(new Date())
    }, 60000)
    const clock = setInterval(() => setTiempo(new Date()), 1000)
    return () => { clearInterval(interval); clearInterval(clock) }
  }, [])

  const fetchData = async () => {
    const today = new Date().toISOString().split('T')[0]
    const { hora, dia } = getNow()

    const [{ data: cl }, { data: ins }] = await Promise.all([
      supabase.from('clases')
        .select('*, coaches(nombre)')
        .eq('activo', true)
        .or(`and(modalidad.eq.Semanal,dia.eq.${dia},fecha_inicio.lte.${today},fecha_fin.gte.${today}),and(modalidad.eq.Clase única,fecha_inicio.eq.${today}),and(modalidad.eq.Promo,dia.eq.${dia},fecha_inicio.lte.${today},fecha_fin.gte.${today}),and(modalidad.eq.Cortesía,dia.eq.${dia},fecha_inicio.lte.${today},fecha_fin.gte.${today})`),
      supabase.from('inscripciones').select('*, jugadores(nombre)')
    ])

    setClases(cl || [])
    setInscripciones(ins || [])
    setLoading(false)
  }

  const { hora, dia } = getNow()

  // Get current hour slot and next hour
  const horaActual = tiempo.getHours()
  const clasesAhora = clases.filter(c => {
    const horaClase = parseInt(c.hora?.split(':')[0])
    return horaClase === horaActual
  })
  const clasesProximas = clases.filter(c => {
    const horaClase = parseInt(c.hora?.split(':')[0])
    return horaClase === horaActual + 1
  })
  const todasHoy = clases

  const horaFmt = tiempo.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  const fechaFmt = tiempo.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' })

  const getJugadores = (claseId) => inscripciones.filter(i => i.clase_id === claseId)

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: 'var(--bg)', color: 'var(--text2)' }}>
      Cargando...
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', padding: '20px 24px' }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 28, flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <span style={{ fontSize: 32 }}>🎾</span>
          <div>
            <div style={{ fontSize: 22, fontWeight: 700 }}>Padel Camp</div>
            <div style={{ fontSize: 14, color: 'var(--text2)', textTransform: 'capitalize' }}>{fechaFmt}</div>
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 32, fontWeight: 700, color: 'var(--accent)', letterSpacing: 2 }}>
            {horaFmt}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 2 }}>
            🔄 Actualiza cada minuto
          </div>
        </div>
      </div>

      {/* Clases ahora */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <div style={{ width: 10, height: 10, borderRadius: 5, background: 'var(--accent)', boxShadow: '0 0 8px var(--accent)', animation: 'pulse 1.5s infinite' }} />
          <h2 style={{ fontSize: 18, fontWeight: 700 }}>En este momento — {hora}</h2>
          <span style={{ fontSize: 13, color: 'var(--text2)' }}>({clasesAhora.length} clase{clasesAhora.length !== 1 ? 's' : ''})</span>
        </div>

        {clasesAhora.length === 0 ? (
          <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12, padding: '32px', textAlign: 'center', color: 'var(--text2)' }}>
            Sin clases en este horario
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
            {clasesAhora.map(c => {
              const jugadores = getJugadores(c.id)
              const pagados = jugadores.filter(j => j.pagado).length
              return (
                <div key={c.id} style={{
                  background: 'var(--bg2)',
                  border: '2px solid var(--accent)',
                  borderRadius: 16, padding: 20,
                  boxShadow: '0 0 20px rgba(0,229,160,.15)'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                    <div>
                      <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--accent)' }}>{c.coaches?.nombre}</div>
                      <div style={{ fontSize: 13, color: 'var(--text2)', marginTop: 2 }}>
                        {c.tipo} · {c.modalidad} · 🕐 {c.hora?.slice(0,5)}
                      </div>
                    </div>
                    <span className={`badge ${c.tipo === 'Privada' ? 'badge-blue' : 'badge-yellow'}`}>{c.tipo}</span>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {jugadores.map(j => (
                      <div key={j.id} style={{
                        display: 'flex', alignItems: 'center', gap: 8,
                        background: 'var(--bg3)', borderRadius: 8, padding: '8px 12px'
                      }}>
                        <span style={{ fontSize: 16 }}>{j.pagado ? '✅' : '❌'}</span>
                        <span style={{ fontSize: 14, fontWeight: 500, flex: 1 }}>{j.jugadores?.nombre}</span>
                        {!j.pagado && (
                          <span style={{ fontSize: 11, color: 'var(--danger)', fontWeight: 600 }}>PENDIENTE</span>
                        )}
                      </div>
                    ))}
                  </div>

                  <div style={{ marginTop: 12, fontSize: 12, color: 'var(--text2)', display: 'flex', justifyContent: 'space-between' }}>
                    <span>{jugadores.length} jugador{jugadores.length !== 1 ? 'es' : ''}</span>
                    <span style={{ color: pagados === jugadores.length ? 'var(--accent)' : 'var(--warn)' }}>
                      {pagados}/{jugadores.length} pagados
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Próximas clases */}
      {clasesProximas.length > 0 && (
        <div style={{ marginBottom: 28 }}>
          <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 14, color: 'var(--text2)' }}>
            ⏰ Próxima hora — {(horaActual + 1).toString().padStart(2,'0')}:00
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12 }}>
            {clasesProximas.map(c => {
              const jugadores = getJugadores(c.id)
              return (
                <div key={c.id} style={{
                  background: 'var(--bg2)', border: '1px solid var(--border)',
                  borderRadius: 12, padding: 16, opacity: 0.85
                }}>
                  <div style={{ fontWeight: 600, marginBottom: 6 }}>{c.coaches?.nombre}</div>
                  <div style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 10 }}>
                    {c.tipo} · {c.hora?.slice(0,5)}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {jugadores.map(j => (
                      <div key={j.id} style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span>{j.pagado ? '✅' : '❌'}</span>
                        <span>{j.jugadores?.nombre}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Resumen del día */}
      <div>
        <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 14, color: 'var(--text2)' }}>
          📋 Todas las clases de hoy ({todasHoy.length})
        </h2>
        <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12, padding: 0, overflowX: 'auto' }}>
          <table className="table">
            <thead><tr>
              <th>Hora</th><th>Coach</th><th>Tipo</th><th>Jugadores</th><th>Pagos</th>
            </tr></thead>
            <tbody>
              {todasHoy.length === 0 && (
                <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--text2)', padding: 24 }}>
                  Sin clases hoy
                </td></tr>
              )}
              {todasHoy.sort((a,b) => a.hora?.localeCompare(b.hora)).map(c => {
                const jugadores = getJugadores(c.id)
                const pagados = jugadores.filter(j => j.pagado).length
                const esAhora = parseInt(c.hora?.split(':')[0]) === horaActual
                return (
                  <tr key={c.id} style={{ background: esAhora ? 'rgba(0,229,160,.05)' : 'transparent' }}>
                    <td style={{ fontFamily: 'var(--mono)', fontWeight: esAhora ? 700 : 400, color: esAhora ? 'var(--accent)' : 'inherit' }}>
                      {c.hora?.slice(0,5)} {esAhora && '●'}
                    </td>
                    <td style={{ fontWeight: 600 }}>{c.coaches?.nombre}</td>
                    <td><span className={`badge ${c.tipo === 'Privada' ? 'badge-blue' : 'badge-yellow'}`}>{c.tipo}</span></td>
                    <td style={{ fontSize: 13 }}>
                      {jugadores.map(j => j.jugadores?.nombre).join(', ')}
                    </td>
                    <td>
                      <span className={`badge ${pagados === jugadores.length && jugadores.length > 0 ? 'badge-green' : pagados > 0 ? 'badge-yellow' : 'badge-red'}`}>
                        {pagados}/{jugadores.length}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.5; transform: scale(1.3); }
        }
      `}</style>
    </div>
  )
}
