import { useState, useEffect } from 'react'
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
import Sidebar from './components/Sidebar'

export default function App() {
  const [session, setSession] = useState(null)
  const [usuario, setUsuario] = useState(null)
  const [page, setPage] = useState('dashboard')
  const [loading, setLoading] = useState(true)

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

  const fetchUsuario = async (uid) => {
    const { data } = await supabase.from('usuarios').select('*').eq('id', uid).single()
    setUsuario(data)
    setLoading(false)
  }

  if (loading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100vh', color:'var(--text2)' }}>
      Cargando...
    </div>
  )

  if (!session) return <Login onLogin={() => {}} />

  const isAdmin = usuario?.rol === 'admin'

  const pages = {
    dashboard: <Dashboard usuario={usuario} />,
    agenda: <Agenda usuario={usuario} />,
    clases: <Clases usuario={usuario} />,
    jugadores: isAdmin ? <Jugadores /> : null,
    coaches: isAdmin ? <Coaches /> : null,
    comisiones: isAdmin ? <Comisiones /> : null,
    precios: isAdmin ? <Precios /> : null,
    envivo: <EnVivo />,
  }

  return (
    <div style={{ display:'flex', minHeight:'100vh' }}>
      <Sidebar page={page} setPage={setPage} isAdmin={isAdmin} usuario={usuario} />
      <main style={{ flex:1, padding:'24px', overflowY:'auto', maxWidth:'100%' }}>
        {pages[page] || pages.dashboard}
      </main>
    </div>
  )
}
