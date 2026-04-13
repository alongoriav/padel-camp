import { useState, useEffect } from 'react'
import { supabase } from '../supabase'

const DIAS = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado']
const MESES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre']

export default function EnVivo() {
  const [clases, setClases] = useState([])
  const [inscripciones, setInscripciones] = useState([])
  const [tiempo, setTiempo] = useState(new Date())
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchData()
    const dataInterval = setInterval(fetchData, 60000)
    const clockInterval = setInterval(() => setTiempo(new Date()), 1000)
    return () => { clearInterval(dataInterval); clearInterval(clockInterval) }
  }, [])

  const fetchData = async () => {
    const today = new Date().toISOString().split('T')[0]
    const dia = DIAS[new Date().getDay()]

    const [{ data: cl }, { data: ins }] = await Promise.all([
      supabase.from('clases')
        .select('*, coaches(nombre)')
        .eq('activo', true)
        .or(`and(modalidad.eq.Semanal,dia.eq.${dia},fecha_inicio.lte.${today},fecha_fin.gte.${today}),and(modalidad.eq.Promo,dia.eq.${dia},fecha_inicio.lte.${today},fecha_fin.gte.${today}),and(modalidad.eq.Cortesía,dia.eq.${dia},fecha_inicio.lte.${today},fecha_fin.gte.${today}),and(modalidad.eq.Clase única,fecha_inicio.eq.${today})`),
      supabase.from('inscripciones').select('*, jugadores(nombre)')
    ])

    setClases((cl || []).sort((a,b) => a.hora?.localeCompare(b.hora)))
    setInscripciones(ins || [])
    setLoading(false)
  }

  const horaActual = tiempo.getHours()
  const horaStr = tiempo.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  const fechaStr = tiempo.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

  const getJugadores = (claseId) => inscripciones.filter(i => i.clase_id === claseId)

  const clasesAhora = clases.filter(c => parseInt(c.hora?.split(':')[0]) === horaActual)
  const clasesProximas = clases.filter(c => parseInt(c.hora?.split(':')[0]) === horaActual + 1)

  const totalJugadoresHoy = new Set(inscripciones.filter(i => clases.find(c => c.id === i.clase_id)).map(i => i.jugador_id)).size
  const totalPendientesHoy = inscripciones.filter(i => !i.pagado && clases.find(c => c.id === i.clase_id)).length
  const coachesHoy = new Set(clases.map(c => c.coaches?.nombre)).size

  const s = {
    screen: {
      background: '#0a0f1a', minHeight: '100vh', padding: '20px 24px',
      fontFamily: "'DM Sans', sans-serif",
    },
    header: {
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      marginBottom: 24, borderBottom: '1px solid rgba(255,255,255,.08)', paddingBottom: 18,
      flexWrap: 'wrap', gap: 12
    },
    logo: { display: 'flex', alignItems: 'center', gap: 12 },
    logoIcon: {
      width: 40, height: 40, background: '#00e5a0', borderRadius: 10,
      display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20
    },
    logoText: { color: '#fff', fontSize: 20, fontWeight: 700 },
    logoSub: { color: 'rgba(255,255,255,.4)', fontSize: 12, marginTop: 2 },
    clock: { textAlign: 'right' },
    clockTime: { fontFamily: 'monospace', fontSize: 30, fontWeight: 700, color: '#00e5a0', letterSpacing: 2 },
    clockDate: { color: 'rgba(255,255,255,.4)', fontSize: 12, marginTop: 2, textTransform: 'capitalize' },
    sectionLabel: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 },
    sectionTitle: { color: 'rgba(255,255,255,.9)', fontSize: 13, fontWeight: 600, letterSpacing: '.05em', textTransform: 'uppercase' },
    sectionCount: { color: 'rgba(255,255,255,.3)', fontSize: 12 },
    courts: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 14, marginBottom: 28 },
    court: {
      background: 'rgba(255,255,255,.04)', border: '1px solid rgba(0,229,160,.25)',
      borderRadius: 14, padding: 18, position: 'relative', overflow: 'hidden'
    },
    courtAccent: {
      position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: '#00e5a0'
    },
    courtCoach: { color: '#00e5a0', fontSize: 16, fontWeight: 700, marginBottom: 4 },
    courtMeta: { color: 'rgba(255,255,255,.35)', fontSize: 12, marginBottom: 14 },
    players: { display: 'flex', flexDirection: 'column', gap: 7 },
    player: {
      display: 'flex', alignItems: 'center', gap: 8,
      background: 'rgba(255,255,255,.06)', borderRadius: 8, padding: '7px 10px'
    },
    playerName: { color: 'rgba(255,255,255,.9)', fontSize: 13, fontWeight: 500, flex: 1 },
    tagPaid: { fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 10, background: 'rgba(0,229,160,.15)', color: '#00e5a0' },
    tagUnpaid: { fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 10, background: 'rgba(255,71,87,.15)', color: '#ff4757' },
    nextCourts: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 10, marginBottom: 28 },
    nextCourt: {
      background: 'rgba(255,255,255,.02)', border: '1px solid rgba(255,255,255,.07)',
      borderRadius: 12, padding: 14, opacity: .75
    },
    nextCoach: { color: 'rgba(255,255,255,.65)', fontSize: 14, fontWeight: 600, marginBottom: 4 },
    nextMeta: { color: 'rgba(255,255,255,.25)', fontSize: 11, marginBottom: 8 },
    nextNames: { color: 'rgba(255,255,255,.45)', fontSize: 12 },
    statsRow: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 },
    stat: {
      background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.07)',
      borderRadius: 12, padding: '14px 16px', textAlign: 'center'
    },
    statVal: { fontFamily: 'monospace', fontSize: 26, fontWeight: 700, color: '#fff' },
    statLbl: { color: 'rgba(255,255,255,.35)', fontSize: 11, marginTop: 4 },
  }

  if (loading) return (
    <div style={{ ...s.screen, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ color: '#00e5a0', fontSize: 16 }}>Cargando...</div>
    </div>
  )

  return (
    <div style={s.screen}>
      {/* Header */}
      <div style={s.header}>
        <div style={s.logo}>
          <div style={s.logoIcon}>🎾</div>
          <div>
            <div style={s.logoText}>Padel Camp</div>
            <div style={s.logoSub}>Vista en vivo</div>
          </div>
        </div>
        <div style={s.clock}>
          <div style={s.clockTime}>{horaStr}</div>
          <div style={s.clockDate}>{fechaStr}</div>
        </div>
      </div>

      {/* Stats */}
      <div style={{ ...s.statsRow, marginBottom: 28 }}>
        <div style={s.stat}>
          <div style={{ ...s.statVal }}>{clases.length}</div>
          <div style={s.statLbl}>Clases hoy</div>
        </div>
        <div style={s.stat}>
          <div style={{ ...s.statVal, color: '#00e5a0' }}>{totalJugadoresHoy}</div>
          <div style={s.statLbl}>Jugadores hoy</div>
        </div>
        <div style={s.stat}>
          <div style={{ ...s.statVal, color: totalPendientesHoy > 0 ? '#ff4757' : '#00e5a0' }}>{totalPendientesHoy}</div>
          <div style={s.statLbl}>Pagos pendientes</div>
        </div>
        <div style={s.stat}>
          <div style={{ ...s.statVal, color: '#4facfe' }}>{coachesHoy}</div>
          <div style={s.statLbl}>Coaches activos</div>
        </div>
      </div>

      {/* En cancha ahora */}
      <div style={s.sectionLabel}>
        <div style={{ width: 8, height: 8, borderRadius: 4, background: '#00e5a0', animation: 'pulse 1.5s infinite' }} />
        <div style={s.sectionTitle}>En cancha ahora — {horaActual.toString().padStart(2,'0')}:00</div>
        <div style={s.sectionCount}>({clasesAhora.length} clase{clasesAhora.length !== 1 ? 's' : ''})</div>
      </div>

      {clasesAhora.length === 0 ? (
        <div style={{ background: 'rgba(255,255,255,.03)', border: '1px dashed rgba(255,255,255,.1)', borderRadius: 12, padding: 32, textAlign: 'center', color: 'rgba(255,255,255,.25)', marginBottom: 28 }}>
          Sin clases en este horario
        </div>
      ) : (
        <div style={s.courts}>
          {clasesAhora.map(c => {
            const jugadores = getJugadores(c.id)
            const pagados = jugadores.filter(j => j.pagado).length
            return (
              <div key={c.id} style={s.court}>
                <div style={s.courtAccent} />
                <div style={s.courtCoach}>{c.coaches?.nombre}</div>
                <div style={s.courtMeta}>{c.tipo} · {c.modalidad} · {c.hora?.slice(0,5)}</div>
                <div style={s.players}>
                  {jugadores.map(j => (
                    <div key={j.id} style={s.player}>
                      <div style={s.playerName}>{j.jugadores?.nombre}</div>
                      <div style={j.pagado ? s.tagPaid : s.tagUnpaid}>
                        {j.pagado ? 'Pagado' : 'Pendiente'}
                      </div>
                    </div>
                  ))}
                </div>
                <div style={{ marginTop: 12, fontSize: 11, color: 'rgba(255,255,255,.25)', display: 'flex', justifyContent: 'space-between' }}>
                  <span>{jugadores.length} jugador{jugadores.length !== 1 ? 'es' : ''}</span>
                  <span style={{ color: pagados === jugadores.length ? '#00e5a0' : '#ff9f43' }}>{pagados}/{jugadores.length} pagados</span>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Próxima hora */}
      {clasesProximas.length > 0 && (
        <>
          <div style={s.sectionLabel}>
            <div style={{ ...s.sectionTitle, color: 'rgba(255,255,255,.4)' }}>
              Próxima hora — {(horaActual + 1).toString().padStart(2,'0')}:00
            </div>
            <div style={s.sectionCount}>({clasesProximas.length} clases)</div>
          </div>
          <div style={s.nextCourts}>
            {clasesProximas.map(c => {
              const jugadores = getJugadores(c.id)
              return (
                <div key={c.id} style={s.nextCourt}>
                  <div style={s.nextCoach}>{c.coaches?.nombre}</div>
                  <div style={s.nextMeta}>{c.tipo} · {c.hora?.slice(0,5)}</div>
                  <div style={s.nextNames}>{jugadores.map(j => j.jugadores?.nombre).join(', ')}</div>
                </div>
              )
            })}
          </div>
        </>
      )}

      {/* Todas las clases hoy */}
      <div style={s.sectionLabel}>
        <div style={{ ...s.sectionTitle, color: 'rgba(255,255,255,.4)' }}>
          Todas las clases de hoy ({clases.length})
        </div>
      </div>
      <div style={{ background: 'rgba(255,255,255,.03)', border: '1px solid rgba(255,255,255,.07)', borderRadius: 12, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid rgba(255,255,255,.08)' }}>
              {['Hora','Coach','Tipo','Jugadores','Pagos'].map(h => (
                <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,.3)', textTransform: 'uppercase', letterSpacing: '.05em' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {clases.length === 0 && (
              <tr><td colSpan={5} style={{ padding: 24, textAlign: 'center', color: 'rgba(255,255,255,.25)', fontSize: 13 }}>Sin clases hoy</td></tr>
            )}
            {clases.map(c => {
              const jugadores = getJugadores(c.id)
              const pagados = jugadores.filter(j => j.pagado).length
              const esAhora = parseInt(c.hora?.split(':')[0]) === horaActual
              return (
                <tr key={c.id} style={{ borderBottom: '1px solid rgba(255,255,255,.05)', background: esAhora ? 'rgba(0,229,160,.05)' : 'transparent' }}>
                  <td style={{ padding: '10px 14px', fontFamily: 'monospace', fontSize: 14, fontWeight: esAhora ? 700 : 400, color: esAhora ? '#00e5a0' : 'rgba(255,255,255,.7)' }}>
                    {c.hora?.slice(0,5)} {esAhora && '●'}
                  </td>
                  <td style={{ padding: '10px 14px', fontWeight: 600, color: 'rgba(255,255,255,.9)', fontSize: 13 }}>{c.coaches?.nombre}</td>
                  <td style={{ padding: '10px 14px' }}>
                    <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 10, background: c.tipo === 'Privada' ? 'rgba(79,172,254,.15)' : 'rgba(255,165,2,.15)', color: c.tipo === 'Privada' ? '#4facfe' : '#ffa502' }}>
                      {c.tipo}
                    </span>
                  </td>
                  <td style={{ padding: '10px 14px', fontSize: 12, color: 'rgba(255,255,255,.5)', maxWidth: 200 }}>
                    {jugadores.map(j => j.jugadores?.nombre).join(', ')}
                  </td>
                  <td style={{ padding: '10px 14px' }}>
                    <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 10, background: pagados === jugadores.length && jugadores.length > 0 ? 'rgba(0,229,160,.15)' : pagados > 0 ? 'rgba(255,165,2,.15)' : 'rgba(255,71,87,.15)', color: pagados === jugadores.length && jugadores.length > 0 ? '#00e5a0' : pagados > 0 ? '#ffa502' : '#ff4757' }}>
                      {pagados}/{jugadores.length}
                    </span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <style>{`@keyframes pulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:.4;transform:scale(1.5)} }`}</style>
    </div>
  )
}
