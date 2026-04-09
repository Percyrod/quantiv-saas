import Link from 'next/link';

export default function LandingPage() {
  return (
    <>
      <header className="shell">
        <div>
          <div className="shell-title">Quantiv</div>
          <div className="shell-sub">Quantitative Supply Chain Simulator</div>
        </div>
        <div className="shell-user">
          <Link href="/login" className="btn-ghost" style={{ color: 'rgba(255,255,255,.8)', borderColor: 'rgba(255,255,255,.3)', background: 'transparent' }}>
            Iniciar sesión
          </Link>
          <Link href="/register" className="btn-run" style={{ padding: '6px 16px', fontSize: 12 }}>
            Registrarse gratis
          </Link>
        </div>
      </header>

      <section className="landing-hero">
        <h1>Simula y compara modelos de reposición en segundos</h1>
        <p>
          ROP clásico, ROP+Forecast, ROP Anticipado y DDMRP — 52 semanas de simulación,
          Monte Carlo, KPIs financieros y exportación a Excel. Ideal para equipos de
          supply chain y entidades educativas.
        </p>
        <div className="landing-hero-btns">
          <Link href="/register" className="btn-hero-primary">Comenzar gratis</Link>
          <Link href="/login" className="btn-hero-secondary">Ya tengo cuenta</Link>
        </div>
      </section>

      <section className="landing-features">
        <h2>Todo lo que necesitas para analizar tu inventario</h2>
        <p className="landing-features-sub">
          Una herramienta profesional para comparar estrategias de reposición con matemática real.
        </p>
        <div className="features-grid">
          <div className="feature-card">
            <div className="feature-card-icon">📊</div>
            <div className="feature-card-title">4 modelos comparados simultáneamente</div>
            <div className="feature-card-desc">
              ROP clásico, ROP+Forecast, ROP Anticipado y DDMRP corriendo en paralelo
              sobre la misma demanda. Ve quién gana y por qué.
            </div>
          </div>
          <div className="feature-card">
            <div className="feature-card-icon">🎲</div>
            <div className="feature-card-title">Monte Carlo + Forecast automático</div>
            <div className="feature-card-desc">
              ROP y Safety Stock calculados con hasta 50,000 iteraciones. Selección
              automática del mejor método de pronóstico: SMA, SES, Holt o Holt-Winters.
            </div>
          </div>
          <div className="feature-card">
            <div className="feature-card-icon">💰</div>
            <div className="feature-card-title">KPIs financieros completos</div>
            <div className="feature-card-desc">
              Nivel de servicio, fill rate, backorders, costo financiero, almacenaje,
              costo de órdenes, facturación y margen neto por modelo.
            </div>
          </div>
          <div className="feature-card">
            <div className="feature-card-icon">🔴🟡🟢</div>
            <div className="feature-card-title">DDMRP con buffer dinámico</div>
            <div className="feature-card-desc">
              Zonas Roja, Amarilla y Verde recalculadas semanalmente con ADU rolling
              y VF dinámico. Heatmap de zonas para las 52 semanas.
            </div>
          </div>
          <div className="feature-card">
            <div className="feature-card-icon">📥</div>
            <div className="feature-card-title">Exportación a Excel</div>
            <div className="feature-card-desc">
              Descarga las 52 semanas con detalle completo: parámetros, simulación
              semana a semana y cálculo de zonas DDMRP con fórmulas.
            </div>
          </div>
          <div className="feature-card">
            <div className="feature-card-icon">💾</div>
            <div className="feature-card-title">Guarda y comparte simulaciones</div>
            <div className="feature-card-desc">
              Cada simulación queda guardada en tu cuenta. Puedes volver a verla,
              comparar escenarios y compartir resultados con tu equipo.
            </div>
          </div>
        </div>
      </section>

      <section className="landing-cta">
        <h2>Para equipos de supply chain y docentes</h2>
        <p>
          Cuéntanos cómo usas Quantiv en tu organización o institución educativa.
          Planes institucionales disponibles.
        </p>
        <Link href="/register" className="btn-run" style={{ display: 'inline-flex', textDecoration: 'none' }}>
          Crear cuenta gratuita
        </Link>
      </section>

      <footer className="landing-footer">
        Quantiv · Quantitative Supply Chain Simulator · {new Date().getFullYear()}
      </footer>
    </>
  );
}
