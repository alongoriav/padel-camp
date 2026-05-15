import { useState } from 'react'
import { supabase } from '../supabase'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [modo, setModo] = useState('login') // 'login' | 'recovery'
  const [recoveryEmail, setRecoveryEmail] = useState('')
  const [recoveryMsg, setRecoveryMsg] = useState('')
  const [showPass, setShowPass] = useState(false)

  const handleLogin = async (e) => {
    e.preventDefault()
    setLoading(true); setError('')
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) setError('Correo o contraseña incorrectos')
    setLoading(false)
  }

  const handleRecovery = async (e) => {
    e.preventDefault()
    if (!recoveryEmail.trim()) return
    setLoading(true); setRecoveryMsg('')
    const { error } = await supabase.auth.resetPasswordForEmail(recoveryEmail.trim(), {
      redirectTo: window.location.origin
    })
    if (error) setRecoveryMsg('Error: ' + error.message)
    else setRecoveryMsg('✅ Te enviamos un correo con el enlace para restablecer tu contraseña.')
    setLoading(false)
  }

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'var(--bg)', padding: '16px'
    }}>
      <div style={{ width: '100%', maxWidth: '380px' }}>
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <img src="/LOGO FINAL PADEL CAMP.jpg" alt="Padel Camp" style={{ width: 200, display: 'block', margin: '0 auto 16px', borderRadius: 10 }} />
          <p style={{ color: 'var(--text2)', marginTop: 6, fontSize: 14 }}>Gestión de coaches y clases</p>
        </div>

        <div className="card">
          {modo === 'login' ? (
            <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div className="form-group">
                <label className="form-label">Correo electrónico</label>
                <input className="form-input" type="email" value={email}
                  onChange={e => setEmail(e.target.value)} placeholder="tu@correo.com" required />
              </div>
              <div className="form-group">
                <label className="form-label">Contraseña</label>
                <div style={{ position: 'relative' }}>
                  <input className="form-input" type={showPass ? 'text' : 'password'} value={password}
                    onChange={e => setPassword(e.target.value)} placeholder="••••••••" required
                    style={{ paddingRight: 40 }} />
                  <button type="button" onClick={() => setShowPass(p => !p)}
                    style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
                      background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text2)', fontSize: 16 }}>
                    {showPass ? '🙈' : '👁️'}
                  </button>
                </div>
              </div>
              {error && <p style={{ color: 'var(--danger)', fontSize: 13 }}>{error}</p>}
              <button className="btn btn-primary" type="submit" disabled={loading}
                style={{ width: '100%', justifyContent: 'center', marginTop: 4 }}>
                {loading ? 'Entrando...' : 'Entrar'}
              </button>
              <button type="button" onClick={() => { setModo('recovery'); setError('') }}
                style={{ background: 'none', border: 'none', color: 'var(--text2)', fontSize: 13,
                  cursor: 'pointer', textAlign: 'center', textDecoration: 'underline' }}>
                ¿Olvidaste tu contraseña?
              </button>
            </form>
          ) : (
            <form onSubmit={handleRecovery} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>Recuperar contraseña</h2>
              <p style={{ color: 'var(--text2)', fontSize: 13 }}>
                Ingresa tu correo y te enviaremos un enlace para restablecer tu contraseña.
              </p>
              <div className="form-group">
                <label className="form-label">Correo electrónico</label>
                <input className="form-input" type="email" value={recoveryEmail}
                  onChange={e => setRecoveryEmail(e.target.value)} placeholder="tu@correo.com" required />
              </div>
              {recoveryMsg && (
                <p style={{ fontSize: 13, color: recoveryMsg.startsWith('✅') ? 'var(--accent)' : 'var(--danger)' }}>
                  {recoveryMsg}
                </p>
              )}
              <button className="btn btn-primary" type="submit" disabled={loading}
                style={{ width: '100%', justifyContent: 'center' }}>
                {loading ? 'Enviando...' : 'Enviar correo'}
              </button>
              <button type="button" onClick={() => { setModo('login'); setRecoveryMsg('') }}
                style={{ background: 'none', border: 'none', color: 'var(--text2)', fontSize: 13,
                  cursor: 'pointer', textAlign: 'center', textDecoration: 'underline' }}>
                ← Volver al inicio de sesión
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
