'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export default function RegisterPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (password.length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres.');
      return;
    }
    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: name } },
    });
    if (error) {
      setError(error.message);
      setLoading(false);
    } else {
      setDone(true);
    }
  }

  if (done) {
    return (
      <div className="auth-wrap">
        <header className="auth-shell">
          <Link href="/" className="auth-shell-title" style={{ textDecoration: 'none', color: '#fff' }}>
            Quantiv
          </Link>
        </header>
        <div className="auth-center">
          <div className="auth-card" style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>✉️</div>
            <div className="auth-card-title">Revisa tu email</div>
            <div className="auth-card-sub" style={{ marginBottom: 0 }}>
              Te enviamos un enlace de confirmación a <strong>{email}</strong>.
              Haz clic en el enlace para activar tu cuenta y luego inicia sesión.
            </div>
            <hr className="auth-divider" />
            <Link href="/login" className="auth-btn" style={{ display: 'block', textAlign: 'center', textDecoration: 'none', lineHeight: '38px' }}>
              Ir a iniciar sesión
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-wrap">
      <header className="auth-shell">
        <Link href="/" className="auth-shell-title" style={{ textDecoration: 'none', color: '#fff' }}>
          Quantiv
        </Link>
      </header>
      <div className="auth-center">
        <div className="auth-card">
          <div className="auth-card-title">Crear cuenta gratuita</div>
          <div className="auth-card-sub">Empieza a simular en segundos</div>

          {error && <div className="auth-error">{error}</div>}

          <form onSubmit={handleRegister}>
            <div className="auth-field">
              <label>Nombre completo</label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Juan Pérez"
                required
                autoFocus
              />
            </div>
            <div className="auth-field">
              <label>Email</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="tu@email.com"
                required
              />
            </div>
            <div className="auth-field">
              <label>Contraseña</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Mínimo 6 caracteres"
                required
              />
            </div>
            <button className="auth-btn" type="submit" disabled={loading}>
              {loading ? 'Creando cuenta…' : 'Crear cuenta'}
            </button>
          </form>

          <hr className="auth-divider" />
          <div className="auth-link">
            ¿Ya tienes cuenta? <Link href="/login">Iniciar sesión</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
