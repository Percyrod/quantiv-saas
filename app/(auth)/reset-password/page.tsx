'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import Link from 'next/link';

export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  async function handleReset(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (password.length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres.');
      return;
    }
    if (password !== confirm) {
      setError('Las contraseñas no coinciden.');
      return;
    }
    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      setError(error.message);
      setLoading(false);
    } else {
      setDone(true);
      setTimeout(() => router.push('/dashboard'), 2000);
    }
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
          {done ? (
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 36, marginBottom: 12 }}>✅</div>
              <div className="auth-card-title">Contraseña actualizada</div>
              <div className="auth-card-sub" style={{ marginBottom: 0 }}>
                Redirigiendo al dashboard…
              </div>
            </div>
          ) : (
            <>
              <div className="auth-card-title">Nueva contraseña</div>
              <div className="auth-card-sub">Elige una contraseña segura</div>
              {error && <div className="auth-error">{error}</div>}
              <form onSubmit={handleReset}>
                <div className="auth-field">
                  <label>Nueva contraseña</label>
                  <input
                    type="password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="Mínimo 6 caracteres"
                    required
                    autoFocus
                  />
                </div>
                <div className="auth-field">
                  <label>Confirmar contraseña</label>
                  <input
                    type="password"
                    value={confirm}
                    onChange={e => setConfirm(e.target.value)}
                    placeholder="Repite la contraseña"
                    required
                  />
                </div>
                <button className="auth-btn" type="submit" disabled={loading}>
                  {loading ? 'Guardando…' : 'Guardar nueva contraseña'}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
