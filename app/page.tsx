import Link from 'next/link';

export default function LandingPage() {
  return (
    <>
      {/* NAV */}
      <header className="landing-nav">
        <div className="landing-nav-logo">
          <span className="landing-nav-brand">QSC · Quantiv</span>
          <span className="landing-nav-sub">Quantitative Supply Chain</span>
        </div>
        <div className="landing-nav-links">
          <Link href="/login" style={{ color: 'rgba(255,255,255,.65)', fontSize: 13, textDecoration: 'none' }}>
            Iniciar sesión
          </Link>
          <Link href="/register" className="btn-primary" style={{ padding: '7px 18px', fontSize: 13 }}>
            Comenzar gratis
          </Link>
        </div>
      </header>

      {/* HERO */}
      <section className="hero">
        <div className="hero-tag">Simulador de inventario · Versión 1.0</div>
        <h1>
          Deja de adivinar.<br />
          <span>Simula tu inventario</span> con matemática real.
        </h1>
        <p className="hero-desc">
          Quantiv compara 4 modelos de reposición en paralelo — ROP, ROP+Forecast, ROP Anticipado y DDMRP —
          sobre 52 semanas de demanda simulada con Monte Carlo y selección automática de forecast.
          Toma decisiones de inventario con evidencia, no con intuición.
        </p>
        <div className="hero-btns">
          <Link href="/register" className="btn-primary">Probar gratis ahora</Link>
          <Link href="/login" className="btn-outline">Ya tengo cuenta</Link>
        </div>
        <div className="hero-stats">
          <div className="hero-stat">
            <div className="hero-stat-num">4</div>
            <div className="hero-stat-label">Modelos comparados</div>
          </div>
          <div className="hero-stat">
            <div className="hero-stat-num">52</div>
            <div className="hero-stat-label">Semanas simuladas</div>
          </div>
          <div className="hero-stat">
            <div className="hero-stat-num">50K</div>
            <div className="hero-stat-label">Iteraciones Monte Carlo</div>
          </div>
          <div className="hero-stat">
            <div className="hero-stat-num">16</div>
            <div className="hero-stat-label">KPIs por modelo</div>
          </div>
        </div>
      </section>

      {/* PROBLEMAS */}
      <section className="section">
        <div className="section-tag">El problema</div>
        <div className="section-title">¿Te suena familiar?</div>
        <div className="section-desc">
          Los equipos de supply chain pierden tiempo y dinero porque no tienen una forma
          rápida de comparar estrategias de reposición antes de implementarlas.
        </div>
        <div className="problems-grid">
          <div className="problem-card">
            <div className="problem-card-icon">📦</div>
            <div className="problem-card-title">Quiebres de stock frecuentes</div>
            <div className="problem-card-desc">
              Tu ROP está calibrado con intuición o con datos viejos. Cuando la demanda
              varía, el sistema no responde a tiempo y pierdes ventas.
            </div>
          </div>
          <div className="problem-card">
            <div className="problem-card-icon">🏭</div>
            <div className="problem-card-title">Sobrestock que inmoviliza capital</div>
            <div className="problem-card-desc">
              Para evitar quiebres, compras de más. El resultado: almacenes llenos,
              capital congelado y costos financieros que se comen el margen.
            </div>
          </div>
          <div className="problem-card">
            <div className="problem-card-icon">🎲</div>
            <div className="problem-card-title">Decisiones sin evidencia</div>
            <div className="problem-card-desc">
              ¿Conviene implementar DDMRP? ¿Vale la pena agregar forecast al ROP?
              Sin simulación, nadie puede responder esas preguntas con datos.
            </div>
          </div>
        </div>
      </section>

      {/* FEATURES */}
      <div className="features-section">
        <div className="features-inner">
          <div className="section-tag">La solución</div>
          <div className="section-title">Todo lo que necesitas para decidir con datos</div>
          <div className="section-desc">
            Quantiv corre la simulación en segundos y te entrega resultados comparativos
            con los que puedes justificar cualquier decisión de inventario.
          </div>
          <div className="features-grid2">
            <div className="feature2-card">
              <div className="feature2-icon">🎲</div>
              <div>
                <div className="feature2-title">Monte Carlo con hasta 50,000 iteraciones</div>
                <div className="feature2-desc">
                  El ROP y el Safety Stock no se calculan con fórmulas estáticas — se
                  derivan de la distribución real de la demanda y el lead time, con el
                  nivel de servicio que tú eliges (85% a 99%).
                </div>
              </div>
            </div>
            <div className="feature2-card">
              <div className="feature2-icon">📈</div>
              <div>
                <div className="feature2-title">Forecast automático con selección por MAD</div>
                <div className="feature2-desc">
                  El sistema evalúa SMA, SES, Naive, Holt (tendencia) y Holt-Winters
                  (estacionalidad) y elige el mejor método automáticamente. Tú ves el
                  WMAPE, MAPE, MAD y Bias del modelo ganador.
                </div>
              </div>
            </div>
            <div className="feature2-card">
              <div className="feature2-icon">🔴🟡🟢</div>
              <div>
                <div className="feature2-title">DDMRP con buffer dinámico real</div>
                <div className="feature2-desc">
                  Las zonas Roja, Amarilla y Verde se recalculan cada semana con ADU
                  rolling y VF dinámico desde el CV real. NFP con picos calificados,
                  exactamente como lo define la metodología Ptak & Smith.
                </div>
              </div>
            </div>
            <div className="feature2-card">
              <div className="feature2-icon">💰</div>
              <div>
                <div className="feature2-title">KPIs financieros completos</div>
                <div className="feature2-desc">
                  Nivel de servicio real, Fill Rate, backorders acumulados, costo
                  financiero, almacenaje, órdenes de compra, facturación, margen neto
                  y ratio MN/Facturación — por modelo, para 52 semanas.
                </div>
              </div>
            </div>
            <div className="feature2-card">
              <div className="feature2-icon">🗺️</div>
              <div>
                <div className="feature2-title">Heatmap de zonas · Simulación en vivo</div>
                <div className="feature2-desc">
                  Visualiza en qué zona estuvo el stock cada semana (Roja, Amarilla,
                  Verde, Sobrestock) para los 4 modelos. O mira la simulación
                  reconstruirse semana a semana en tiempo real.
                </div>
              </div>
            </div>
            <div className="feature2-card">
              <div className="feature2-icon">📥</div>
              <div>
                <div className="feature2-title">Export a Excel con fórmulas DDMRP</div>
                <div className="feature2-desc">
                  Descarga las 52 semanas en Excel con 3 hojas: parámetros, detalle
                  semanal de los 4 modelos y el cálculo completo de zonas DDMRP
                  con fórmulas editables.
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* MODELOS */}
      <section className="models-section">
        <div className="section-tag">Los 4 modelos</div>
        <div className="section-title">Un mismo escenario, cuatro estrategias</div>
        <div className="section-desc">
          Quantiv corre los 4 modelos sobre la misma demanda generada, con los mismos
          parámetros, para que la comparación sea justa y directamente accionable.
        </div>
        <div className="models-grid">
          <div className="model-card model-card-m1">
            <div className="model-card-label" style={{ color: '#354A5E' }}>Modo 1</div>
            <div className="model-card-name">ROP Clásico</div>
            <div className="model-card-desc">
              Repone cuando el stock físico cae bajo el ROP calculado por Monte Carlo.
              La cantidad repone hasta el stock máximo estadístico.
            </div>
          </div>
          <div className="model-card model-card-m2">
            <div className="model-card-label" style={{ color: '#6E2F8F' }}>Modo 2</div>
            <div className="model-card-name">ROP + Forecast</div>
            <div className="model-card-desc">
              Mismo gatillo que el ROP clásico, pero la cantidad pedida incorpora
              el forecast del lead time para reducir quiebres en demanda creciente.
            </div>
          </div>
          <div className="model-card model-card-m3">
            <div className="model-card-label" style={{ color: '#C45E08' }}>Modo 3</div>
            <div className="model-card-name">ROP Anticipado</div>
            <div className="model-card-desc">
              Anticipa pedidos cuando el forecast proyecta que la posición neta
              caerá bajo el Safety Stock antes de que llegue el próximo pedido.
            </div>
          </div>
          <div className="model-card model-card-m4">
            <div className="model-card-label" style={{ color: '#107E3E' }}>Modo 4</div>
            <div className="model-card-name">DDMRP</div>
            <div className="model-card-desc">
              Buffer dinámico con zonas Roja, Amarilla y Verde recalculadas
              semanalmente. Repone cuando la Net Flow Position cae bajo el
              Top Amarillo.
            </div>
          </div>
        </div>
      </section>

      {/* EDUCACIÓN */}
      <section className="edu-section">
        <div className="edu-inner">
          <div className="edu-tag">Para instituciones educativas</div>
          <h2 className="edu-title">
            La herramienta que tus estudiantes<br />usarán en su trabajo real
          </h2>
          <p className="edu-desc">
            Quantiv está diseñado para que el aprendizaje de modelos de inventario
            sea concreto, visual y con matemática real — no solo teoría en una pizarra.
            Ideal para cursos de supply chain, logística y operaciones.
          </p>
          <div className="edu-cards">
            <div className="edu-card">
              <div className="edu-card-icon">🎓</div>
              <div className="edu-card-title">Casos de clase interactivos</div>
              <div className="edu-card-desc">
                El docente configura un escenario y los estudiantes experimentan
                en tiempo real cómo cambian los KPIs al modificar parámetros.
              </div>
            </div>
            <div className="edu-card">
              <div className="edu-card-icon">📊</div>
              <div className="edu-card-title">Informes exportables</div>
              <div className="edu-card-desc">
                Los estudiantes exportan sus simulaciones a Excel para entregar
                análisis completos como parte de sus trabajos y proyectos.
              </div>
            </div>
            <div className="edu-card">
              <div className="edu-card-icon">🏆</div>
              <div className="edu-card-title">Comparación de estrategias</div>
              <div className="edu-card-desc">
                Comprender por qué DDMRP gana en alta variabilidad o por qué
                el ROP falla en demanda creciente — con números reales.
              </div>
            </div>
          </div>
          <Link href="/register" className="btn-primary" style={{ display: 'inline-flex' }}>
            Solicitar acceso institucional
          </Link>
        </div>
      </section>

      {/* CTA */}
      <section className="cta-section">
        <div className="cta-title">Empieza a simular hoy</div>
        <p className="cta-desc">
          Crea tu cuenta gratuita y corre tu primera simulación en menos de 2 minutos.
          Sin tarjeta de crédito, sin instalación.
        </p>
        <Link href="/register" className="btn-primary" style={{ display: 'inline-flex', fontSize: 15, padding: '13px 36px' }}>
          Crear cuenta gratuita
        </Link>
      </section>

      {/* FOOTER */}
      <footer className="landing-footer2">
        <div>
          <div className="footer-brand">QSC — Quantitative Supply Chain</div>
          <div className="footer-sub">Quantiv · Simulador de modelos de reposición · {new Date().getFullYear()}</div>
        </div>
        <div className="footer-links">
          <Link href="/login" className="footer-link">Iniciar sesión</Link>
          <Link href="/register" className="footer-link">Registrarse</Link>
        </div>
      </footer>
    </>
  );
}
