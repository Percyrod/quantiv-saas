import { createClient } from '@/lib/supabase/server';
import Link from 'next/link';
import DeleteSimButton from '@/components/DeleteSimButton';

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: sims } = await supabase
    .from('simulations')
    .select('id, name, created_at, params')
    .eq('user_id', user!.id)
    .order('created_at', { ascending: false });

  const name = user?.user_metadata?.full_name || 'Usuario';

  return (
    <div className="wrap">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 600, color: 'var(--t1)' }}>Hola, {name.split(' ')[0]} 👋</div>
          <div style={{ fontSize: 12, color: 'var(--t2)', marginTop: 2 }}>
            {sims?.length ?? 0} simulación{sims?.length !== 1 ? 'es' : ''} guardada{sims?.length !== 1 ? 's' : ''}
          </div>
        </div>
        <Link href="/sim/new" className="btn-run" style={{ textDecoration: 'none', padding: '8px 20px', fontSize: 13 }}>
          ▶ Nueva simulación
        </Link>
      </div>

      {!sims || sims.length === 0 ? (
        <div className="card">
          <div className="card-body">
            <div className="empty-state">
              <div className="empty-state-icon">📊</div>
              <div className="empty-state-title">Aún no tienes simulaciones</div>
              <div className="empty-state-sub">
                Crea tu primera simulación y compara los 4 modelos de reposición.
              </div>
              <Link href="/sim/new" className="btn-run" style={{ textDecoration: 'none', display: 'inline-flex' }}>
                ▶ Crear primera simulación
              </Link>
            </div>
          </div>
        </div>
      ) : (
        <div className="dash-grid">
          {sims.map(sim => {
            const p = sim.params as Record<string, unknown>;
            const date = new Date(sim.created_at).toLocaleDateString('es-PE', {
              day: '2-digit', month: 'short', year: 'numeric'
            });
            return (
              <div key={sim.id} style={{ position: 'relative' }}>
                <Link href={`/sim/${sim.id}`} style={{ textDecoration: 'none' }}>
                  <div className="sim-card">
                    <div className="sim-card-name">{sim.name}</div>
                    <div className="sim-card-meta">{date}</div>
                    <div className="sim-card-tags">
                      {p?.adu && <span className="sim-card-tag">ADU: {String(p.adu)}</span>}
                      {p?.lt && <span className="sim-card-tag">LT: {String(p.lt)}sem</span>}
                      {p?.ns && <span className="sim-card-tag">NS: {String(Math.round(Number(p.ns) * 100))}%</span>}
                      {p?.comp && (
                        <span className="sim-card-tag">
                          {['', 'Estable', 'Estacional', 'Creciente', 'Decreciente'][Number(p.comp)] || ''}
                        </span>
                      )}
                    </div>
                  </div>
                </Link>
                <DeleteSimButton simId={sim.id} />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
