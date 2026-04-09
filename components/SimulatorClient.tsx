'use client';
import { useEffect, useRef, useState } from 'react';
import Script from 'next/script';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

interface SimParams {
  adu?: number; comp?: number; varF?: number; stock0?: number; lt?: number;
  lt_std?: number; lote?: number; ns?: number; ciclo?: number; N_mc?: number;
  precio?: number; costo?: number; bk_c?: number; tasa?: number;
  pallet?: number; alm_cost?: number; orden_cost?: number;
  quiebre_sem?: number; quiebre_pct?: number;
}

interface Props {
  initialParams?: SimParams;
  simName?: string;
  simId?: string;
}

export default function SimulatorClient({ initialParams, simName, simId }: Props) {
  const router = useRouter();
  const [scriptsReady, setScriptsReady] = useState(0); // count loaded scripts
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [saveName, setSaveName] = useState(simName || '');
  const [saving, setSaving] = useState(false);
  const initDone = useRef(false);

  // When both scripts are loaded, run the simulation
  useEffect(() => {
    if (scriptsReady < 2) return;
    if (initDone.current) return;
    initDone.current = true;

    // Apply saved params if any
    if (initialParams) {
      const p = initialParams;
      const set = (id: string, val: unknown) => {
        const el = document.getElementById(id) as HTMLInputElement | HTMLSelectElement | null;
        if (el && val !== undefined) el.value = String(val);
      };
      set('p_adu', p.adu); set('p_comp', p.comp); set('p_var', p.varF);
      set('p_stock', p.stock0); set('p_lt', p.lt); set('p_lt_std', p.lt_std);
      set('p_lote', p.lote); set('p_ns', p.ns); set('p_ciclo', p.ciclo);
      set('p_mc', p.N_mc); set('p_precio', p.precio); set('p_costo', p.costo);
      set('p_bk_cost', p.bk_c); set('p_tasa', p.tasa); set('p_pallet', p.pallet);
      set('p_alm_cost', p.alm_cost); set('p_orden_cost', p.orden_cost);
      set('p_quiebre_sem', p.quiebre_sem); set('p_quiebre_pct', p.quiebre_pct);
    }

    // Run simulation (function defined in simulation.js loaded via Script)
    if (typeof (window as any).runSim === 'function') {
      (window as any).runSim();
    }
  }, [scriptsReady, initialParams]);

  function readCurrentParams(): SimParams {
    const g = (id: string) => +(document.getElementById(id) as HTMLInputElement)?.value || 0;
    return {
      adu: g('p_adu'), comp: g('p_comp'), varF: g('p_var'), stock0: g('p_stock'),
      lt: g('p_lt'), lt_std: g('p_lt_std'), lote: g('p_lote'), ns: +((document.getElementById('p_ns') as HTMLSelectElement)?.value || 0.9),
      ciclo: g('p_ciclo'), N_mc: g('p_mc'), precio: g('p_precio'), costo: g('p_costo'),
      bk_c: g('p_bk_cost'), tasa: g('p_tasa'), pallet: g('p_pallet'),
      alm_cost: g('p_alm_cost'), orden_cost: g('p_orden_cost'),
      quiebre_sem: g('p_quiebre_sem'), quiebre_pct: g('p_quiebre_pct'),
    };
  }

  async function handleSave() {
    if (!saveName.trim()) return;
    setSaving(true);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setSaving(false); return; }

    const params = readCurrentParams();

    if (simId) {
      // Update existing
      await supabase.from('simulations').update({ name: saveName, params }).eq('id', simId);
    } else {
      // Insert new
      await supabase.from('simulations').insert({ user_id: user.id, name: saveName, params });
    }

    setSaving(false);
    setShowSaveModal(false);
    router.push('/dashboard');
  }

  return (
    <>
      {/* CDN scripts — loaded once */}
      <Script
        src="https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js"
        strategy="afterInteractive"
        onLoad={() => setScriptsReady(n => n + 1)}
      />
      <Script
        src="https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js"
        strategy="afterInteractive"
        onLoad={() => setScriptsReady(n => n + 1)}
      />
      {/* Simulation logic */}
      <Script src="/js/simulation.js" strategy="afterInteractive" />

      {/* Save modal */}
      {showSaveModal && (
        <div className="modal-overlay" onClick={() => setShowSaveModal(false)}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <div className="modal-title">💾 Guardar simulación</div>
            <div className="auth-field">
              <label>Nombre</label>
              <input
                type="text"
                className="auth-field input"
                value={saveName}
                onChange={e => setSaveName(e.target.value)}
                placeholder="Ej: Escenario base Q2"
                autoFocus
                onKeyDown={e => e.key === 'Enter' && handleSave()}
                style={{ width: '100%', height: 36, padding: '0 10px', border: '1px solid var(--bdr)', borderRadius: 4, fontSize: 13, fontFamily: 'var(--font)' }}
              />
            </div>
            <div className="modal-actions">
              <button className="btn-ghost" onClick={() => setShowSaveModal(false)}>Cancelar</button>
              <button className="btn-run" onClick={handleSave} disabled={saving || !saveName.trim()}
                style={{ padding: '7px 18px', fontSize: 13 }}>
                {saving ? 'Guardando…' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Top bar with save button */}
      <div style={{ background: 'var(--group)', borderBottom: '1px solid var(--bdr)', padding: '6px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 11, color: 'var(--t2)' }}>
          {simId ? `📂 ${simName}` : '▶ Simulación nueva'}
        </span>
        <button
          className="btn-run"
          style={{ padding: '5px 16px', fontSize: 12 }}
          onClick={() => { setSaveName(simName || ''); setShowSaveModal(true); }}
        >
          💾 Guardar simulación
        </button>
      </div>

      {/* ── SIMULATOR HTML — identical to original ── */}
      <div className="wrap">

        {/* PARÁMETROS */}
        <div className="card">
          <div className="card-hdr" style={{ cursor: 'pointer', userSelect: 'none' }}
            onClick={() => (window as any).toggleParams?.()}>
            <span className="card-title">⚙ Parámetros de simulación</span>
            <span id="params-toggle-icon" style={{ fontSize: 11, color: 'var(--t3)' }}>▲ ocultar</span>
          </div>
          <div id="params-body" style={{ padding: '8px 14px 10px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(8,1fr)', gap: '6px 10px', alignItems: 'end', marginBottom: 6 }}>
              <div style={{ gridColumn: 'span 8' }}>
                <span className="param-section" style={{ display: 'inline-block', margin: '4px 0 2px' }}>Demanda &amp; Reposición</span>
              </div>
              <div className="param-group"><label>ADU base (un/sem)</label><input type="number" id="p_adu" defaultValue={50} min={1} /></div>
              <div className="param-group">
                <label>Comportamiento</label>
                <select id="p_comp" defaultValue={1}>
                  <option value={1}>Estable</option>
                  <option value={2}>Estacional</option>
                  <option value={3}>Creciente</option>
                  <option value={4}>Decreciente</option>
                </select>
              </div>
              <div className="param-group">
                <label>Variabilidad (CV)</label>
                <select id="p_var" defaultValue={2}>
                  <option value={1}>Baja ≈0.20</option>
                  <option value={2}>Media ≈0.40</option>
                  <option value={3}>Alta ≈0.65</option>
                  <option value={4}>Muy alta ≈1.00</option>
                </select>
              </div>
              <div className="param-group"><label>Stock inicial (un)</label><input type="number" id="p_stock" defaultValue={200} min={0} /></div>
              <div className="param-group"><label>Lead time (sem)</label><input type="number" id="p_lt" defaultValue={2} min={1} step={0.5} /></div>
              <div className="param-group"><label>Variab. LT (sem ±)</label><input type="number" id="p_lt_std" defaultValue={0} min={0} step={0.5} /></div>
              <div className="param-group"><label>Lote mínimo (un)</label><input type="number" id="p_lote" defaultValue={50} min={1} /></div>
              <div className="param-group"><label>Ciclo revisión (sem)</label><input type="number" id="p_ciclo" defaultValue={1} min={1} /></div>
              <div className="param-group"><label>Quiebre desde sem (0=no)</label><input type="number" id="p_quiebre_sem" defaultValue={0} min={0} max={52} /></div>
              <div className="param-group"><label>Quiebre demanda (%)</label><input type="number" id="p_quiebre_pct" defaultValue={0} min={-80} max={200} /></div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(8,1fr) auto', gap: '6px 10px', alignItems: 'end' }}>
              <div style={{ gridColumn: 'span 9' }}>
                <span className="param-section" style={{ display: 'inline-block', margin: '4px 0 2px' }}>Control &amp; Costos</span>
              </div>
              <div className="param-group">
                <label>Nivel de servicio</label>
                <select id="p_ns" defaultValue={0.90}>
                  <option value={0.85}>85%</option>
                  <option value={0.90}>90%</option>
                  <option value={0.95}>95%</option>
                  <option value={0.99}>99%</option>
                </select>
              </div>
              <div className="param-group">
                <label>Iterac. Montecarlo</label>
                <select id="p_mc" defaultValue={30000}>
                  <option value={10000}>10,000 rápido</option>
                  <option value={30000}>30,000 std</option>
                  <option value={50000}>50,000 preciso</option>
                </select>
              </div>
              <div className="param-group"><label>Precio venta (S/)</label><input type="number" id="p_precio" defaultValue={50} min={1} /></div>
              <div className="param-group"><label>Costo unitario (S/)</label><input type="number" id="p_costo" defaultValue={30} min={1} /></div>
              <div className="param-group"><label>Costo backorder (S/)</label><input type="number" id="p_bk_cost" defaultValue={4} min={0} /></div>
              <div className="param-group"><label>Tasa financiera (%)</label><input type="number" id="p_tasa" defaultValue={5} min={0} /></div>
              <div className="param-group"><label>Un / pallet</label><input type="number" id="p_pallet" defaultValue={100} min={1} /></div>
              <div className="param-group"><label>Alm. S/pallet/sem</label><input type="number" id="p_alm_cost" defaultValue={8} min={0} /></div>
              <div className="param-group"><label>Costo x OC emitida (S/)</label><input type="number" id="p_orden_cost" defaultValue={8} min={0} /></div>
              <div style={{ paddingBottom: 1 }}>
                <button className="btn-run" onClick={() => (window as any).runSim?.()} style={{ whiteSpace: 'nowrap', height: 26, padding: '0 16px', fontSize: 12 }}>
                  ▶ Ejecutar
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* METODOLOGÍA */}
        <div className="card">
          <div className="card-hdr"><span className="card-title">Metodología de cada modelo</span></div>
          <div className="card-body">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12 }}>
              <div className="method-box" style={{ borderColor: '#354A5E' }}>
                <strong style={{ color: '#354A5E' }}>Modo 1 — ROP</strong>
                Repone cuando <em>Stock físico ≤ ROP</em>.<br />
                Cantidad = Stock_max − Pos_neta<br />
                Stock_max = ROP + ADU_hist × ciclo<br />
                <em style={{ color: 'var(--t2)' }}>ROP y ADU: Montecarlo sobre historial completo</em>
              </div>
              <div className="method-box" style={{ borderColor: 'var(--acc5)' }}>
                <strong style={{ color: 'var(--acc5)' }}>Modo 2 — ROP+Forecast</strong>
                Mismo gatillo que Modo 1.<br />
                Cantidad = Stock_max − Pos_neta + Σfc(LT)<br />
                <em style={{ color: 'var(--t2)' }}>Incorpora forecast del lead time en la cantidad pedida</em>
              </div>
              <div className="method-box" style={{ borderColor: 'var(--crit)' }}>
                <strong style={{ color: 'var(--crit)' }}>Modo 3 — ROP Anticipado</strong>
                Gatillo: <em>Stock ≤ ROP</em> ó <em>Pos_neta − Σfc(LT) &lt; SS</em><br />
                Cantidad = Stock_max − Pos_neta + Σfc(LT)<br />
                <em style={{ color: 'var(--t2)' }}>Anticipa pedidos si el forecast proyecta quiebre de SS</em>
              </div>
              <div className="method-box" style={{ borderColor: 'var(--pos)' }}>
                <strong style={{ color: 'var(--pos)' }}>Modo 4 — DDMRP</strong>
                Buffer = Rojo + Amarillo + Verde<br />
                Repone si <em>Pos. de flujo neta &lt; Top Verde</em><br />
                Cantidad = Top Verde − Pos. flujo neta<br />
                <em style={{ color: 'var(--t2)' }}>Buffer dinámico, recalculado con ADU rolling</em>
              </div>
            </div>
          </div>
        </div>

        {/* RESULTADOS */}
        <div className="card" id="resultsCard" style={{ display: 'none' }}>
          <div className="card-hdr"><span className="card-title">Resultados comparativos — 52 semanas</span></div>
          <div className="card-body">
            <div style={{ overflowX: 'auto' }}>
              <table className="rtbl" id="rtbl">
                <thead>
                  <tr>
                    <th style={{ textAlign: 'left', paddingLeft: 14 }}>Modelo</th>
                    <th>NS real</th><th>Fill Rate</th><th>Backorder acumulado</th>
                    <th>Stock prom. (un)</th><th>Pedidos realizados</th>
                    <th>Costo financiero acum.</th><th>Costo almacenaje acum.</th>
                    <th>Costo backorder acum.</th><th>Costo órdenes acum.</th>
                    <th>Costo total gestión</th><th>Facturación</th>
                    <th>Margen neto</th><th>Ratio MN/Fact.</th>
                    <th>WMAPE forecast</th><th>Bias forecast</th>
                  </tr>
                </thead>
                <tbody id="rtbl-body"></tbody>
              </table>
            </div>
            <p className="note" id="result-note"></p>
            <div style={{ marginTop: 12 }}>
              <button className="btn-run" onClick={() => (window as any).runSim?.()}>▶ Nueva simulación</button>
            </div>
          </div>
        </div>

        {/* DDMRP BUFFER */}
        <div className="card" id="ddmrpCard" style={{ display: 'none' }}>
          <div className="card-hdr"><span className="card-title">DDMRP — Zonas del buffer</span></div>
          <div className="card-body">
            <div className="zones-grid" id="ddmrp-zones"></div>
            <p className="note">El buffer se recalcula dinámicamente cada semana con ADU rolling de las últimas 12 semanas. <strong>NFP</strong> (Net Flow Position) = Stock físico + OC en camino − Picos calificados. Se repone cuando NFP &lt; Top_Amarillo.</p>
          </div>
        </div>

        {/* GAUGES */}
        <div className="card" id="gaugesCard" style={{ display: 'none' }}>
          <div className="card-hdr"><span className="card-title">Nivel de servicio real — 52 semanas</span></div>
          <div className="card-body" style={{ padding: '10px 12px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10 }}>
              {['Modo 1 — ROP', 'Modo 2 — ROP+Forecast', 'Modo 3 — ROP Anticipado', 'Modo 4 — DDMRP'].map((label, i) => (
                <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                  <span style={{ fontSize: 10, fontWeight: 600, color: ['#354A5E', '#6E2F8F', '#C45E08', '#107E3E'][i] }}>{label}</span>
                  <canvas id={`gauge${i + 1}`} style={{ width: '100%', display: 'block' }}></canvas>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* RADAR */}
        <div className="card" id="radarCard" style={{ display: 'none' }}>
          <div className="card-hdr"><span className="card-title" id="radarTitle">Comparación multidimensional — KPIs</span></div>
          <div className="card-body" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, alignItems: 'center' }}>
            <div style={{ position: 'relative', height: 300 }}><canvas id="radarChart"></canvas></div>
            <div id="radarLegend" style={{ fontSize: 11 }}></div>
          </div>
        </div>

        {/* GRÁFICOS */}
        <div className="chart-grid" id="chartsSection" style={{ display: 'none' }}>
          <div className="card">
            <div className="card-hdr" style={{ flexWrap: 'wrap', gap: 6 }}>
              <span className="card-title">Evolución de stock y venta</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <button id="btnLive" onClick={() => (window as any).runLive?.()} style={{ fontSize: 10, padding: '2px 10px', height: 24, borderRadius: 3, border: '1px solid #107E3E', background: '#107E3E', color: '#fff', cursor: 'pointer', fontFamily: 'var(--font)' }}>▶ Reconstruir en vivo</button>
                <div id="liveControls" style={{ display: 'none', alignItems: 'center', gap: 5 }}>
                  <button id="btnPause" onClick={() => (window as any).pauseLive?.()} style={{ height: 24, padding: '0 8px', fontSize: 11, border: '1px solid #107E3E', background: '#fff', color: '#107E3E', borderRadius: 3, cursor: 'pointer', fontFamily: 'var(--font)' }}>⏸</button>
                  <input type="range" id="liveSpeed" min={1} max={5} defaultValue={3} style={{ width: 60, accentColor: '#107E3E' }} title="Velocidad" />
                  <button onClick={() => (window as any).stopLive?.()} style={{ height: 24, padding: '0 8px', fontSize: 11, border: '1px solid var(--bdr)', background: 'var(--group)', color: 'var(--t2)', borderRadius: 3, cursor: 'pointer', fontFamily: 'var(--font)' }}>■</button>
                  <span id="liveWeekLabel" style={{ fontSize: 10, fontWeight: 600, color: '#107E3E', minWidth: 36 }}></span>
                </div>
              </div>
              <div id="bufferSelector" style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 10, color: 'var(--t2)', alignSelf: 'center', marginRight: 2 }}>Mostrar zonas:</span>
                <button onClick={() => (window as any).toggleBuffer?.('ddmrp')} id="btnBufDD" style={{ fontSize: 10, padding: '2px 8px', borderRadius: 3, border: '1px solid #107E3E', background: '#107E3E', color: '#fff', cursor: 'pointer', fontFamily: 'var(--font)' }}>DDMRP</button>
                <button onClick={() => (window as any).toggleBuffer?.('rop')} id="btnBufROP" style={{ fontSize: 10, padding: '2px 8px', borderRadius: 3, border: '1px solid var(--bdr)', background: 'var(--group)', color: 'var(--t2)', cursor: 'pointer', fontFamily: 'var(--font)' }}>M1-2-3 (ROP/SS/Máx)</button>
                <button onClick={() => (window as any).toggleBuffer?.('none')} id="btnBufNone" style={{ fontSize: 10, padding: '2px 8px', borderRadius: 3, border: '1px solid var(--bdr)', background: 'var(--group)', color: 'var(--t2)', cursor: 'pointer', fontFamily: 'var(--font)' }}>Sin zonas</button>
              </div>
            </div>
            <div className="card-body">
              <div className="chart-wrap"><canvas id="chartStock"></canvas></div>
              <div id="zoneStats" style={{ display: 'none', marginTop: 8, overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10 }}>
                  <thead id="zoneStatsHead"></thead>
                  <tbody id="zoneStatsBody"></tbody>
                </table>
              </div>
              <div className="zone-legend" id="stockLegend" style={{ marginTop: 6 }}></div>
            </div>
          </div>
          <div className="card">
            <div className="card-hdr"><span className="card-title">Demanda real vs Backorders acumulados</span></div>
            <div className="card-body">
              <div className="chart-wrap"><canvas id="chartBK"></canvas></div>
              <div className="zone-legend" id="bkLegend"></div>
            </div>
          </div>

          {/* HEATMAP */}
          <div className="card" id="heatmapCard" style={{ display: 'none', gridColumn: '1 / -1' }}>
            <div className="card-hdr" style={{ justifyContent: 'space-between' }}>
              <span className="card-title">Perfil de zonas — 52 semanas (heatmap)</span>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', fontSize: 10 }}>
                {[['#DC2626', 'Roja (bajo SS)'], ['#D97706', 'Amarilla (SS–ROP)'], ['#16A34A', 'Verde (ROP–Máx)'], ['#2563EB', 'Sobrestock']].map(([c, l]) => (
                  <span key={l} style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                    <span style={{ width: 12, height: 12, background: c, borderRadius: 2, display: 'inline-block' }}></span> {l}
                  </span>
                ))}
              </div>
            </div>
            <div className="card-body" style={{ padding: '12px 16px 10px' }}>
              <canvas id="heatmapCanvas" style={{ width: '100%', display: 'block' }}></canvas>
              <div id="heatmapTooltip" style={{ position: 'fixed', display: 'none', background: 'rgba(53,74,94,0.95)', color: '#fff', fontSize: 10, padding: '5px 9px', borderRadius: 4, pointerEvents: 'none', zIndex: 100, lineHeight: 1.5 }}></div>
            </div>
          </div>
        </div>

        {/* DETALLE SEMANAL */}
        <div className="card" id="detailCard" style={{ display: 'none' }}>
          <div className="card-hdr">
            <span className="card-title">Detalle semanal — primeras 10 semanas</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ fontSize: 11, color: 'var(--t3)' }}>BK = Backorder acumulado al fin de semana</span>
              <button className="btn-run" style={{ padding: '5px 14px', fontSize: 11 }} onClick={() => (window as any).downloadExcel?.()}>
                ⬇ Descargar Excel 52 semanas
              </button>
            </div>
          </div>
          <div className="card-body" style={{ overflowX: 'auto' }}>
            <table className="dtbl" id="dtbl">
              <thead>
                <tr>
                  <th rowSpan={2} style={{ background: '#4A5568', color: '#fff', verticalAlign: 'middle' }}>Sem</th>
                  <th rowSpan={2} style={{ background: '#4A5568', color: '#fff', verticalAlign: 'middle' }}>Demanda</th>
                  <th colSpan={5} style={{ background: '#354A5E', color: '#fff' }}>Modo 1 — ROP</th>
                  <th colSpan={5} style={{ background: '#6E2F8F', color: '#fff' }}>Modo 2 — ROP+Forecast</th>
                  <th colSpan={5} style={{ background: '#C45E08', color: '#fff' }}>Modo 3 — ROP Anticipado</th>
                  <th colSpan={6} style={{ background: '#107E3E', color: '#fff' }}>Modo 4 — DDMRP</th>
                </tr>
                <tr>
                  {['ROP', 'Pos.Neta', 'Stock', 'BK', 'Pedido'].map(h => <th key={'m1' + h} style={{ background: '#EEF2F7', color: '#354A5E' }}>{h}</th>)}
                  {['ROP', 'Pos.Neta', 'Stock', 'BK', 'Pedido'].map(h => <th key={'m2' + h} style={{ background: '#F3EEF9', color: '#6E2F8F' }}>{h}</th>)}
                  {['ROP', 'Pos.Neta', 'Stock', 'BK', 'Pedido'].map(h => <th key={'m3' + h} style={{ background: '#FEF4EC', color: '#C45E08' }}>{h}</th>)}
                  {['Top Rojo', 'Top Amarillo', 'Top Verde', 'Stock', 'BK', 'Pedido'].map(h => <th key={'dd' + h} style={{ background: '#EFF7F2', color: '#107E3E' }}>{h}</th>)}
                </tr>
              </thead>
              <tbody id="dtbl-body"></tbody>
            </table>
          </div>
        </div>

      </div>{/* /wrap */}
    </>
  );
}
