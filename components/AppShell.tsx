'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export default function AppShell({ children, userName }: { children: React.ReactNode; userName: string }) {
  const router = useRouter();

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  }

  return (
    <>
      <header className="shell">
        <div>
          <Link href="/dashboard" style={{ textDecoration: 'none' }}>
            <div className="shell-title">Quantiv</div>
            <div className="shell-sub">M1-ROP · M2-ROP+Forecast · M3-ROP Anticipado · M4-DDMRP</div>
          </Link>
        </div>
        <div className="shell-user">
          <span className="shell-user-name">{userName}</span>
          <Link href="/sim/new" className="btn-run" style={{ padding: '5px 14px', fontSize: 12, textDecoration: 'none' }}>
            + Nueva simulación
          </Link>
          <Link href="/reset-password"
            style={{ color: 'rgba(255,255,255,.55)', fontSize: 11, textDecoration: 'none' }}>
            Cambiar contraseña
          </Link>
          <button className="btn-ghost" onClick={handleLogout}
            style={{ color: 'rgba(255,255,255,.7)', borderColor: 'rgba(255,255,255,.25)', background: 'transparent', padding: '5px 12px', fontSize: 12 }}>
            Salir
          </button>
        </div>
      </header>
      {children}
    </>
  );
}
