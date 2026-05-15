import { useState, useEffect, useRef } from 'react'
import { supabase } from './supabase'
import Login from './components/Login'
import Dashboard from './components/Dashboard'
import Coaches from './components/Coaches'
import Jugadores from './components/Jugadores'
import Clases from './components/Clases'
import Agenda from './components/Agenda'
import Comisiones from './components/Comisiones'
import Precios from './components/Precios'
import EnVivo from './components/EnVivo'
import Usuarios from './components/Usuarios'
import Sidebar from './components/Sidebar'

const INACTIVITY_TIMEOUT = 120000

export default function App() {
  const [session, setSession] = useState(null)
  const [usuario, setUsuario] = useState(null)
  const [page, setPage] = useState('envivo')
  const [loading, setLoading] = useState(true)
  const timerRef = useRef(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      if (session) fetchUsuario(session.user.id)
      else setLoading(false)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      if (session) fetchUsuario(session.user.id)
      else { setUsuario(null); setLoading(false) }
    })
    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!session) return
    const resetTimer = () => {
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => setPage('envivo'), INACTIVITY_TIMEOUT)
    }
    const events = ['mousedown', 'mousemove', 'keydown', 'scroll', 'touchstart', 'click']
    events.forEach(e => window.addEventListener(e, resetTimer))
    resetTimer()
    return () => {
      events.forEach(e => window.removeEventListener(e, resetTimer))
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [session])

  const fetchUsuario = async (uid) => {
    const { data } = await supabase.from('usuarios').select('*').eq('id', uid).single()
    if (data) {
      setUsuario(data)
    } else {
      // Usuario existe en auth pero no en tabla usuarios — crear registro automáticamente
      const { data: authUser } = await supabase.auth.getUser()
      const email = authUser?.user?.email || ''
      const nombre = authUser?.user?.user_metadata?.nombre || email.split('@')[0]
      const payload = { id: uid, nombre, rol: 'operador', coach_id: null }
      await supabase.from('usuarios').insert(payload)
      setUsuario(payload)
    }
    setLoading(false)
  }

  if (loading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100vh', color:'var(--text2)' }}>
      Cargando...
    </div>
  )

  if (!session) return <Login onLogin={() => {}} />

  const isAdmin = usuario?.rol === 'admin'
  const isOperador = usuario?.rol === 'operador'

  const pages = {
    dashboard: isAdmin ? <Dashboard usuario={usuario} /> : null,
    agenda: <Agenda usuario={usuario} />,
    clases: <Clases usuario={usuario} />,
    jugadores: (isAdmin || isOperador) ? <Jugadores /> : null,
    coaches: isAdmin ? <Coaches /> : null,
    comisiones: isAdmin ? <Comisiones /> : null,
    precios: isAdmin ? <Precios /> : null,
    usuarios: isAdmin ? <Usuarios /> : null,
    envivo: <EnVivo />,
  }

  return (
    <div style={{ display:'flex', minHeight:'100vh' }}>
      <Sidebar page={page} setPage={setPage} isAdmin={isAdmin} isOperador={isOperador} usuario={usuario} />
      <main style={{ flex:1, padding:'24px', overflowY:'auto', maxWidth:'100%' }}>
        {pages[page] || pages.envivo}
      </main>
    </div>
  )
}
