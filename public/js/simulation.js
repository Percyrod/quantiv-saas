// ─── COLORS ────────────────────────────────────────────────
const COLORS = {
  m1:    '#354A5E',
  m2:    '#6E2F8F',
  m3:    '#E9730C',
  ddmrp: '#107E3E',
  demand:'#0064D9',
};

let charts = {};

// ── Formato numérico uniforme — siempre es-PE ────────────
// Separador de miles: ,  |  Decimal: .
const LOCALE = 'es-PE';
const fmtN  = v => Math.round(v).toLocaleString(LOCALE);           // entero con miles
const fmtS  = v => 'S/ ' + Math.round(v).toLocaleString(LOCALE);   // soles
const fmtPct= v => (typeof v === 'number' ? v : parseFloat(v)).toFixed(1) + '%'; // porcentaje

// ─── STATS ─────────────────────────────────────────────────
function randNorm(mu=0, sig=1) {
  let u=0,v=0;
  while(!u) u=Math.random();
  while(!v) v=Math.random();
  return mu + sig * Math.sqrt(-2*Math.log(u)) * Math.cos(2*Math.PI*v);
}

// ─── DEMAND GENERATION ─────────────────────────────────────
// genVenta — StockIQ version
// quiebre_sem/quiebre_pct: permite que la venta real diverja del historial
// desde la semana indicada (solo aplica en semanas de juego t > 0)
function genVenta(adu, varF, t, comp, quiebre_sem=0, quiebre_pct=0) {
  const sigmas = [0, 0.20, 0.40, 0.65, 1.00];
  const sig = sigmas[varF] || 0.40;

  // Quiebre estructural: solo activa en semanas de juego desde quiebre_sem
  let baseAdu = (quiebre_sem > 0 && t >= quiebre_sem) ? adu * (1 + quiebre_pct / 100) : adu;

  if (comp === 2) {
    baseAdu = baseAdu * (1 + 0.5 * Math.sin(2 * Math.PI * (t - 13) / 52));
  } else if (comp === 3) {
    baseAdu = baseAdu * (1 + 0.005 * t);
  } else if (comp === 4) {
    baseAdu = baseAdu * (1 - 0.005 * t);
  }

  baseAdu = Math.max(0, baseAdu);
  return Math.max(0, Math.round(randNorm(baseAdu, baseAdu * sig)));
}

// ─── MONTECARLO ────────────────────────────────────────────
function montecarlo(hist, lt_w, lt_std, ns, N=30000) {
  // lt_w ya viene en semanas
  const lts_w = lt_std;
  const sims=[];
  for(let i=0;i<N;i++){
    const d = hist[Math.floor(Math.random()*hist.length)];
    const l = Math.max(0.5, lts_w>0 ? randNorm(lt_w,lts_w) : lt_w);
    sims.push(d*l);
  }
  sims.sort((a,b)=>a-b);
  const rop = sims[Math.floor(ns*N)];
  const adu = hist.reduce((a,b)=>a+b,0)/hist.length;
  const ss  = Math.max(0, rop - adu*lt_w);
  return {rop, ss, adu};
}

// ─── FORECAST MOTOR COMPLETO ──────────────────────────────
// Candidatos: SMA-4, SES, Naive + Holt (si hay tendencia) + Holt-Winters (si hay estacionalidad)
// Selección automática por MAD sobre test set (últimas min(6, n/4) semanas)

// ── Detectar autocorrelación en lag k ──────────────────────
function autocorr(hist, lag) {
  const n   = hist.length;
  if(n <= lag) return 0;
  const mu  = hist.reduce((a,b)=>a+b,0)/n;
  let num=0, den=0;
  for(let i=lag; i<n; i++){
    num += (hist[i]-mu)*(hist[i-lag]-mu);
  }
  for(let i=0; i<n; i++) den += (hist[i]-mu)**2;
  return den>0 ? num/den : 0;
}

// ── Holt doble suavización (nivel + tendencia) ─────────────
function forecastHolt(hist, n) {
  let bestA=0.3, bestB=0.1, bestMSE=Infinity;
  for(let a=0.1; a<=0.8; a+=0.15){
    for(let b=0.05; b<=0.4; b+=0.1){
      let l=hist[0], t=(hist.length>1 ? hist[1]-hist[0] : 0), mse=0;
      for(let i=1; i<hist.length; i++){
        mse += (hist[i]-(l+t))**2;
        const ln = a*hist[i]+(1-a)*(l+t);
        t = b*(ln-l)+(1-b)*t;
        l = ln;
      }
      mse /= hist.length-1;
      if(mse<bestMSE){ bestMSE=mse; bestA=a; bestB=b; }
    }
  }
  let l=hist[0], t=(hist.length>1 ? hist[1]-hist[0] : 0);
  for(let i=1; i<hist.length; i++){
    const ln = bestA*hist[i]+(1-bestA)*(l+t);
    t = bestB*(ln-l)+(1-bestB)*t;
    l = ln;
  }
  return Array.from({length:n}, (_,i) => Math.max(0, l+(i+1)*t));
}

// ── Holt-Winters aditivo (nivel + tendencia + estacionalidad) ──
function forecastHW(hist, n, period=13) {
  if(hist.length < period*2) return forecastHolt(hist, n);
  const aH=0.3, bH=0.1, gH=0.2;
  // Inicializar nivel y tendencia
  const initL = hist.slice(0, period).reduce((a,b)=>a+b,0)/period;
  const initT = hist.length >= period*2
    ? (hist.slice(period, period*2).reduce((a,b)=>a+b,0)/period - initL)/period
    : 0;
  // Inicializar índices estacionales
  const S = hist.slice(0, period).map(v => v - initL);
  let l=initL, t=initT, s=[...S];
  for(let i=period; i<hist.length; i++){
    const idx = i % period;
    const lNew = aH*(hist[i]-s[idx])+(1-aH)*(l+t);
    const tNew = bH*(lNew-l)+(1-bH)*t;
    s[idx] = gH*(hist[i]-lNew)+(1-gH)*s[idx];
    l=lNew; t=tNew;
  }
  return Array.from({length:n}, (_,i) => {
    const idx = (hist.length+i) % period;
    return Math.max(0, l+(i+1)*t+s[idx]);
  });
}

// ── MAD sobre test set ──────────────────────────────────────
function calcMAD_fc(hist, fcFn) {
  const testSize = Math.max(2, Math.min(6, Math.floor(hist.length/4)));
  const train = hist.slice(0, hist.length-testSize);
  const test  = hist.slice(hist.length-testSize);
  if(train.length < 4) return Infinity;
  try {
    const preds = fcFn(train, testSize);
    return test.reduce((s,v,i)=>s+Math.abs(v-(preds[i]||0)),0)/testSize;
  } catch(e) { return Infinity; }
}

// ── Motor principal ─────────────────────────────────────────
function forecast(hist_ventas, n, varF_param) {
  const varF = varF_param !== undefined ? varF_param : 2;
  if (!hist_ventas || hist_ventas.length < 5) {
    return { fc: Array(n).fill(50), method: 'Asumido (datos insuficientes)', diag: '', mad: '—' };
  }

  const h   = hist_ventas;
  const adu = h.reduce((a,b)=>a+b,0)/h.length;
  const std = Math.sqrt(h.map(v=>(v-adu)**2).reduce((a,b)=>a+b,0)/h.length);
  const cv  = adu>0 ? std/adu : 0.5;
  const alpha_ses = Math.min(0.45, Math.max(0.10, cv*0.45));

  // ── Diagnóstico ────────────────────────────────────────────
  // Tendencia: regresión OLS
  const xm = (h.length-1)/2;
  let num=0, den=0;
  h.forEach((y,x)=>{ num+=(x-xm)*(y-adu); den+=(x-xm)**2; });
  const slope = den>0 ? num/den : 0;
  const hasTrend = Math.abs(slope*h.length) > adu*0.15;

  // Estacionalidad: autocorrelación en lag 13 (trimestral)
  const acLag13 = autocorr(h, 13);
  const acLag26 = h.length >= 28 ? autocorr(h, 26) : 0;
  const hasSeasonal = h.length >= 26 && (acLag13 > 0.20 || acLag26 > 0.20);
  const period = acLag26 > acLag13 ? 26 : 13;

  // ── Construir candidatos ───────────────────────────────────
  const candidates = [];

  // SMA-4 siempre
  candidates.push({
    name: 'Promedio Móvil (4 sem)',
    mad:  calcMAD_fc(h, (tr,n)=>{
      const last4 = tr.slice(-4);
      const avg = last4.reduce((a,b)=>a+b,0)/last4.length;
      return Array(n).fill(avg);
    }),
    genFc: () => {
      const last4 = h.slice(-4);
      const avg = last4.reduce((a,b)=>a+b,0)/last4.length;
      return Array(n).fill(avg);
    }
  });

  // SES siempre
  let ses_level = h[0];
  for(let i=1; i<h.length; i++) ses_level = alpha_ses*h[i]+(1-alpha_ses)*ses_level;
  const ses_final = ses_level;
  candidates.push({
    name: `SES (α=${alpha_ses.toFixed(2)})`,
    mad:  calcMAD_fc(h, (tr,n)=>{
      let l=tr[0];
      const a=Math.min(0.45,Math.max(0.10,cv*0.45));
      for(let i=1;i<tr.length;i++) l=a*tr[i]+(1-a)*l;
      return Array(n).fill(Math.max(0,l));
    }),
    genFc: () => Array(n).fill(Math.max(0, ses_final))
  });

  // Naive siempre
  candidates.push({
    name: 'Naive (Replicación)',
    mad:  calcMAD_fc(h, (tr,n)=>Array(n).fill(tr[tr.length-1])),
    genFc: () => Array(n).fill(h[h.length-1])
  });

  // Holt si hay tendencia
  if(hasTrend && h.length >= 8) {
    candidates.push({
      name: `Holt (tendencia, slope=${slope.toFixed(1)})`,
      mad:  calcMAD_fc(h, forecastHolt),
      genFc: () => forecastHolt(h, n)
    });
  }

  // Holt-Winters si hay estacionalidad
  if(hasSeasonal && h.length >= period*2) {
    candidates.push({
      name: `Holt-Winters (estacional, período=${period}sem)`,
      mad:  calcMAD_fc(h, (tr,nn)=>forecastHW(tr,nn,period)),
      genFc: () => forecastHW(h, n, period)
    });
  }

  // ── Elegir ganador por MAD ─────────────────────────────────
  let winner = candidates.reduce((best,c) => c.mad < best.mad ? c : best);

  // ── Generar forecast con varianza realista ─────────────────
  const base_fc = winner.genFc();
  const sigmas  = [0, 0.20, 0.40, 0.65, 1.00];
  const sig_real = sigmas[varF] || 0.40;
  const unpred   = [0, 0.50, 0.60, 0.70, 0.80][varF] || 0.60;
  const err_std  = adu * sig_real * unpred;

  const fc = base_fc.map(v =>
    Math.max(1, Math.round((v + randNorm(0, err_std)) * 10) / 10)
  );

  // ── Diagnóstico texto ──────────────────────────────────────
  const diagParts = [`CV=${cv.toFixed(2)}`];
  if(hasTrend)    diagParts.push(`tendencia(slope=${slope.toFixed(1)})`);
  if(hasSeasonal) diagParts.push(`estacional(lag${period} r=${acLag13.toFixed(2)})`);
  diagParts.push(`MAD=${winner.mad.toFixed(1)}`);

  return {
    fc,
    method: winner.name,
    diag:   diagParts.join(' · '),
    mad:    winner.mad.toFixed(1)
  };
}

// ─── VF DINÁMICO DDMRP ─────────────────────────────────────
// Calcula el VF a partir del CV real del historial (rolling 12 sem)
// Umbrales según metodología DDMRP (Ptak & Smith):
//   CV < 0.20  → Baja      → VF = 0.40
//   CV < 0.50  → Media     → VF = 0.60
//   CV < 0.80  → Alta      → VF = 0.80
//   CV ≥ 0.80  → Muy alta  → VF = 1.00
function calcVF(hist) {
  if(!hist || hist.length < 2) return 0.6; // default media si no hay historia
  const n   = hist.length;
  const adu = hist.reduce((a,b)=>a+b,0) / n;
  if(adu === 0) return 0.6;
  const std = Math.sqrt(hist.map(v=>(v-adu)**2).reduce((a,b)=>a+b,0) / n);
  const cv  = std / adu;
  if(cv < 0.20) return 0.40;
  if(cv < 0.50) return 0.60;
  if(cv < 0.80) return 0.80;
  return 1.00;
}

// ─── DDMRP BUFFER — StockIQ version ───────────────────────
// vf se pasa ya calculado desde calcVF() — no depende del param varF
function calcDDMRPBuffer(adu, lt_w, vf, ciclo, lote) {
  const ltf = lt_w <= 1 ? 0.5 : lt_w <= 2 ? 1.0 : 1.5;
  // vf ya viene calculado dinámicamente desde el CV real del historial

  const red_base   = adu * lt_w * ltf;
  const red_safety = red_base * vf;
  const red        = red_base + red_safety;
  const yellow     = adu * lt_w;
  const green      = Math.max(adu * ciclo, red_base, lote);
  const top        = red + yellow + green;

  return {
    red, yellow, green, top,
    top_yellow: red + yellow,
    top_red:    red,
    adu_used:   adu,
  };
}

// ─── MAIN SIMULATION ───────────────────────────────────────
function runSim() {
  const adu    = +document.getElementById('p_adu').value;
  const comp   = +document.getElementById('p_comp').value;
  const varF   = +document.getElementById('p_var').value;
  const stock0 = +document.getElementById('p_stock').value;
  const lt     = +document.getElementById('p_lt').value;
  const lt_std = +document.getElementById('p_lt_std').value;
  const lote   = +document.getElementById('p_lote').value;
  const ns     = +document.getElementById('p_ns').value;
  const ciclo  = +document.getElementById('p_ciclo').value;
  const N_mc   = +document.getElementById('p_mc').value;
  const precio = +document.getElementById('p_precio').value;
  const costo  = +document.getElementById('p_costo').value;
  const bk_c   = +document.getElementById('p_bk_cost').value;
  const tasa      = +document.getElementById('p_tasa').value/100;
  const pallet    = +document.getElementById('p_pallet').value;
  const alm_cost   = +document.getElementById('p_alm_cost').value;
  const orden_cost = +document.getElementById('p_orden_cost').value;

  const lt_w         = lt;
  const quiebre_sem = +document.getElementById('p_quiebre_sem').value;
  const quiebre_pct = +document.getElementById('p_quiebre_pct').value;

  // Generate 26-week history using comp behavior
  const hist26 = [];
  // Historia: 52 semanas — suficiente para Holt-Winters (4 ciclos de 13 sem)
  for(let i=0;i<52;i++) hist26.push(genVenta(adu, varF, i-52, comp, 0, 0));

  // Initial Montecarlo on history
  let mc = montecarlo(hist26, lt, lt_std, ns, N_mc);

  // Generate 52 weeks of future demand (same comp, continues from t=0)
  const demand52 = [];
  // Demanda real: aplica quiebre estructural si se configuró
  for(let t=0;t<52;t++) demand52.push(genVenta(adu, varF, t, comp, quiebre_sem, quiebre_pct));

  // Initial DDMRP buffer
  let buf = calcDDMRPBuffer(mc.adu, lt, calcVF(hist26), ciclo, lote);

  // Historial compartido para Montecarlo — mismo para M1/M2/M3
  const shared_hist = [...hist26];

  // ── State for each model ──
  const states = {
    m1:    {stock:stock0, bk:0, oc:[], cost_fin:0, cost_bk:0, cost_alm:0, cost_orden:0, bk_total:0, atendido_primera:0, orders:0},
    m2:    {stock:stock0, bk:0, oc:[], cost_fin:0, cost_bk:0, cost_alm:0, cost_orden:0, bk_total:0, atendido_primera:0, orders:0},
    m3:    {stock:stock0, bk:0, oc:[], cost_fin:0, cost_bk:0, cost_alm:0, cost_orden:0, bk_total:0, atendido_primera:0, orders:0},
    ddmrp: {stock:stock0, bk:0, oc:[], hist:[...hist26], cost_fin:0, cost_bk:0, cost_alm:0, cost_orden:0, bk_total:0, atendido_primera:0, orders:0, buf},
  };

  // Weekly time series for charts
  const ts = {
    labels:[],
    demand:[],
    m1_stock:[], m2_stock:[], m3_stock:[], dd_stock:[],
    dd_top_red:[], dd_top_yellow:[], dd_top_green:[], // niveles buffer DDMRP
    sh_rop:[], sh_ss:[], sh_smax:[], // ROP, SS y StockMax compartidos (M1/M2/M3)
    m1_zona:[], m2_zona:[], m3_zona:[], dd_zona:[], // zona por semana para heatmap
    m1_bk:[], m2_bk:[], m3_bk:[], dd_bk:[],
    m1_cost:[], m2_cost:[], m3_cost:[], dd_cost:[],
    m1_ns:[], m2_ns:[], m3_ns:[], dd_ns:[],
    fc_pairs:[], // {fc, real} por semana para calcular métricas al final
  };

  // Detail rows (first 15 weeks)
  const detail = [];

  // ── simWeek: arrow function fuera del loop para evitar hoisting issues ──
  const simWeek = (s, mode, w, dem, sh_mc, sh_fc, sh_smax) => {
    // 1. Receive pending OC
    s.oc = s.oc.filter(o => {
      if(o.llega <= w){ s.stock += o.qty; return false; }
      return true;
    });

    // 2. Use shared MC (same for M1/M2/M3 this week)
    const stock_max = sh_smax;
    const oc_total  = s.oc.reduce((a,o)=>a+o.qty,0);
    const pos_neta  = s.stock - s.bk + oc_total;
    const fc        = sh_fc;

    // 3. Decide replenishment
    let qty = 0;
    let should_order = false;

    if(mode===1){
      should_order = s.stock <= sh_mc.rop;
      if(should_order){
        const bruto = Math.max(0, stock_max - pos_neta);
        qty = bruto > 0 ? Math.max(lote, Math.round(bruto)) : 0;
      }
    } else if(mode===2){
      should_order = s.stock <= sh_mc.rop;
      if(should_order){
        const fc_lt = fc.slice(0, Math.ceil(lt_w)).reduce((a,v)=>a+v,0);
        const bruto = Math.max(0, stock_max - pos_neta + fc_lt);
        qty = bruto > 0 ? Math.max(lote, Math.round(bruto)) : 0;
      }
    } else if(mode===3){
      const fc_lt = fc.slice(0, Math.ceil(lt_w)).reduce((a,v)=>a+v,0);
      const stock_proy = pos_neta - fc_lt;
      const anticipo = stock_proy < sh_mc.ss && s.stock > sh_mc.rop;
      should_order = s.stock <= sh_mc.rop || anticipo;
      if(should_order){
        const bruto = Math.max(0, stock_max - pos_neta + fc_lt);
        qty = bruto > 0 ? Math.max(lote, Math.round(bruto)) : 0;
      }
    }

    if(qty > 0){
      const lt_real = Math.max(1, Math.round(lt_std>0 ? randNorm(lt_w, lt_std) : lt_w)); // variabilidad reservada para fórmulas
      const lt_fijo = Math.max(1, Math.round(lt_w));
      s.oc.push({qty, llega: w + lt_fijo});
      s.orders++;
      s.cost_orden += orden_cost; // costo fijo por OC emitida
    }

    // 4. Attend demand
    const stock_ini = s.stock; // capturar ANTES de atender demanda
    const atendida    = Math.min(s.stock, dem + s.bk);
    const bk_atendido = Math.min(s.bk, atendida);
    const dem_atendida = Math.min(s.stock - bk_atendido, dem);
    const bk_nuevo = Math.max(0, dem - dem_atendida);
    s.bk    = s.bk - bk_atendido + bk_nuevo;
    s.stock = Math.max(0, s.stock - bk_atendido - dem_atendida);
    s.bk_total += bk_nuevo;
    s.atendido_primera += dem_atendida; // unidades atendidas a la primera (sin BK), atendidos o no

    // 5. Costs
    const c_fin = s.stock * costo * (tasa/52);
    const c_alm = (s.stock / pallet) * alm_cost;
    const c_bk  = s.bk * bk_c;
    s.cost_fin += c_fin;
    s.cost_alm += c_alm;
    s.cost_bk  += c_bk;

    return {stock:s.stock, stock_ini, bk:s.bk, qty, rop:Math.round(sh_mc.rop), pos_neta:Math.round(pos_neta), ns_w: dem>0 ? Math.min(1,dem_atendida/dem) : 1};
  };

  // ── Week loop ──────────────────────────────────────────
  for(let w=0;w<52;w++){
    const dem = demand52[w];
    ts.labels.push(`S${w+1}`);
    ts.demand.push(dem);

    // Montecarlo compartido — se calcula UNA VEZ por semana para M1/M2/M3
    const sh_mc   = montecarlo(shared_hist, lt, lt_std, ns, N_mc);
    const sh_fc_obj = forecast(shared_hist, Math.ceil(lt_w)+2, varF);
    const sh_fc     = sh_fc_obj.fc;
    const sh_smax = sh_mc.rop + sh_mc.adu * ciclo;
    // Precisión forecast: comparar fc[0] de semana anterior contra dem real
    // sh_fc[0] es el forecast para la semana actual, dem es la venta real
    const fc_pred_w = sh_fc[0] || sh_mc.adu; // forecast S+1 vs venta real de esta semana

  // ── simDDMRP: arrow function fuera del loop ──────────
  const simDDMRP = (s, w, dem) => {
      // 1. Receive OC
      s.oc = s.oc.filter(o => {
        if(o.llega <= w){ s.stock += o.qty; return false; }
        return true;
      });

      // 2. Recalculate ADU rolling (last 12 weeks)
      const last12 = s.hist.slice(-12);
      const adu_rolling = last12.reduce((a,b)=>a+b,0)/last12.length;
      const vf_din = calcVF(last12); // VF dinámico: CV real → 0.4/0.6/0.8/1.0

      // Recalculate buffer with rolling ADU and dynamic VF
      s.buf = calcDDMRPBuffer(adu_rolling, lt, vf_din, ciclo, lote);

      // 3. Net Flow Position = on-hand + on-order - qualified spikes
      const oc_total = s.oc.reduce((a,o)=>a+o.qty,0);
      // Qualified spike: demand > 50% of top_red — simplified for simulator
      const spike_threshold = s.buf.top_red * 0.5;
      const qualified_spike = dem > spike_threshold ? Math.max(0, dem - spike_threshold) : 0;
      const nfp = s.stock + oc_total - qualified_spike;

      // 4. Replenish if NFP < Top of Yellow (trigger point in DDMRP)
      let qty = 0;
      if(nfp < s.buf.top_yellow){
        const bruto = s.buf.top - nfp;
        qty = bruto > 0 ? Math.max(lote, Math.round(bruto)) : 0;
      }

      if(qty > 0){
        const lt_real = Math.max(1, Math.round(lt_std>0 ? randNorm(lt_w, lt_std) : lt_w)); // variabilidad reservada para fórmulas
        const lt_fijo = Math.max(1, Math.round(lt_w));
        s.oc.push({qty, llega: w + lt_fijo});
        s.orders++;
        s.cost_orden += orden_cost; // costo fijo por OC emitida
      }

      // 5. Attend demand
      const stock_ini = s.stock; // capturar ANTES de atender demanda
      const atendida = Math.min(s.stock, dem + s.bk);
      const bk_atendido = Math.min(s.bk, atendida);
      const dem_atendida = Math.min(s.stock - bk_atendido, dem);
      const bk_nuevo = Math.max(0, dem - dem_atendida);
      s.bk = s.bk - bk_atendido + bk_nuevo;
      s.stock = Math.max(0, s.stock - bk_atendido - dem_atendida);
      s.bk_total += bk_nuevo;
      s.atendido_primera += dem_atendida; // unidades atendidas a la primera (sin BK)

      // 6. Costs
      const c_fin = s.stock * costo * (tasa/52);
      const c_alm = (s.stock / pallet) * alm_cost;
      const c_bk  = s.bk * bk_c;
      s.cost_fin += c_fin;
      s.cost_alm += c_alm;
      s.cost_bk  += c_bk;

      // Buffer zone label
      let zona = 'Verde';
      if(s.stock < s.buf.top_red) zona = 'Roja';
      else if(s.stock < s.buf.top_yellow) zona = 'Amarilla';

      s.hist.push(dem);
      if(s.hist.length > 26) s.hist.shift(); // rolling 26 sem

      return {stock:s.stock, stock_ini, bk:s.bk, qty, zona, nfp: Math.round(nfp), top_yellow: Math.round(s.buf.top_yellow), top_red: Math.round(s.buf.top_red), top_green: Math.round(s.buf.top), adu_rolling: parseFloat(adu_rolling.toFixed(2)), vf_din, ns_w: dem>0 ? Math.min(1,dem_atendida/dem):1};
  };

    const r1 = simWeek(states.m1, 1, w, dem, sh_mc, sh_fc, sh_smax);
    const r2 = simWeek(states.m2, 2, w, dem, sh_mc, sh_fc, sh_smax);
    const r3 = simWeek(states.m3, 3, w, dem, sh_mc, sh_fc, sh_smax);
    // Actualizar historial compartido UNA VEZ por semana
    shared_hist.push(dem);
    if(shared_hist.length > 26) shared_hist.shift(); // rolling 26 sem — más sensible a cambios recientes
    const rd = simDDMRP(states.ddmrp, w, dem);

    ts.m1_stock.push(r1.stock); ts.m2_stock.push(r2.stock); ts.m3_stock.push(r3.stock); ts.dd_stock.push(rd.stock);
    ts.dd_top_red.push(rd.top_red); ts.dd_top_yellow.push(rd.top_yellow); ts.dd_top_green.push(rd.top_green);
    ts.sh_rop.push(Math.round(sh_mc.rop)); ts.sh_ss.push(Math.round(sh_mc.ss)); ts.sh_smax.push(Math.round(sh_smax));
    // Zona de cada modelo esta semana (para heatmap)
    function getZ(stock, ss, rop, smax) {
      if(stock < ss)    return 'R';
      if(stock < rop)   return 'A';
      if(stock <= smax) return 'V';
      return 'S';
    }
    ts.m1_zona.push(getZ(r1.stock, sh_mc.ss, sh_mc.rop, sh_smax));
    ts.m2_zona.push(getZ(r2.stock, sh_mc.ss, sh_mc.rop, sh_smax));
    ts.m3_zona.push(getZ(r3.stock, sh_mc.ss, sh_mc.rop, sh_smax));
    ts.dd_zona.push(rd.stock < rd.top_red ? 'R' : rd.stock < rd.top_yellow ? 'A' : rd.stock <= rd.top_green ? 'V' : 'S');
    ts.m1_bk.push(r1.bk);       ts.m2_bk.push(r2.bk);       ts.m3_bk.push(r3.bk);       ts.dd_bk.push(rd.bk);
    ts.m1_cost.push(states.m1.cost_fin+states.m1.cost_alm+states.m1.cost_bk);
    ts.m2_cost.push(states.m2.cost_fin+states.m2.cost_alm+states.m2.cost_bk);
    ts.m3_cost.push(states.m3.cost_fin+states.m3.cost_alm+states.m3.cost_bk);
    ts.dd_cost.push(states.ddmrp.cost_fin+states.ddmrp.cost_alm+states.ddmrp.cost_bk);
    ts.m1_ns.push((r1.ns_w*100).toFixed(1));
    ts.m2_ns.push((r2.ns_w*100).toFixed(1));
    ts.m3_ns.push((r3.ns_w*100).toFixed(1));
    ts.dd_ns.push((rd.ns_w*100).toFixed(1));
    ts.fc_pairs.push({fc: fc_pred_w, real: dem}); // guardar par para métricas

    detail.push({w:w+1, dem, r1, r2, r3, rd, sh_mc, sh_smax});
  }

  // ── Calcular % de semanas en cada zona por modelo ──────
  function calcZoneStats(stockSeries, ssSeries, ropSeries, smaxSeries) {
    let roja=0, amarilla=0, verde=0, sobre=0;
    stockSeries.forEach((stock, i) => {
      const ss   = ssSeries[i]   || 0;
      const rop  = ropSeries[i]  || 0;
      const smax = smaxSeries[i] || Infinity;
      if      (stock < ss)    roja++;
      else if (stock < rop)   amarilla++;
      else if (stock <= smax) verde++;
      else                    sobre++;
    });
    const n = stockSeries.length || 1;
    return {
      roja:     (roja/n*100).toFixed(0),
      amarilla: (amarilla/n*100).toFixed(0),
      verde:    (verde/n*100).toFixed(0),
      sobre:    (sobre/n*100).toFixed(0),
    };
  }

  // DDMRP usa sus propias zonas (top_red=SS equiv, top_yellow=ROP equiv)
  function calcZoneStatsDDMRP(stockSeries, topRedSeries, topYellowSeries, topGreenSeries) {
    let roja=0, amarilla=0, verde=0, sobre=0;
    stockSeries.forEach((stock, i) => {
      const tr = topRedSeries[i]    || 0;
      const ty = topYellowSeries[i] || 0;
      const tg = topGreenSeries[i]  || Infinity;
      if      (stock < tr)  roja++;
      else if (stock < ty)  amarilla++;
      else if (stock <= tg) verde++;
      else                  sobre++;
    });
    const n = stockSeries.length || 1;
    return {
      roja:     (roja/n*100).toFixed(0),
      amarilla: (amarilla/n*100).toFixed(0),
      verde:    (verde/n*100).toFixed(0),
      sobre:    (sobre/n*100).toFixed(0),
    };
  }

  const zs1 = calcZoneStats(ts.m1_stock, ts.sh_ss, ts.sh_rop, ts.sh_smax);
  const zs2 = calcZoneStats(ts.m2_stock, ts.sh_ss, ts.sh_rop, ts.sh_smax);
  const zs3 = calcZoneStats(ts.m3_stock, ts.sh_ss, ts.sh_rop, ts.sh_smax);
  const zsd = calcZoneStatsDDMRP(ts.dd_stock, ts.dd_top_red, ts.dd_top_yellow, ts.dd_top_green);

  // Guardar globalmente para que toggleBuffer pueda actualizar el panel
  window._zoneStats = {zs1, zs2, zs3, zsd};

  // ── Build summary ──────────────────────────────────────
  const totalDem = demand52.reduce((a,b)=>a+b,0);

  function summary(s, ts_stock) {
    const avg_stock = ts_stock.reduce((a,b)=>a+b,0)/ts_stock.length;
    return {
      bk:       Math.round(s.bk),
      bk_total: Math.round(s.bk_total),
      avg_stock: Math.round(avg_stock),
      orders:   s.orders,
      cost_fin: Math.round(s.cost_fin),
      cost_alm:   Math.round(s.cost_alm),
      cost_bk:    Math.round(s.cost_bk),
      cost_orden:         Math.round(s.cost_orden),
      cost_tot:           Math.round(s.cost_fin + s.cost_alm + s.cost_bk + s.cost_orden),
      atendido_primera:   Math.round(s.atendido_primera),
    };
  }

  // Fill Rate = unidades atendidas a la primera / unidades solicitadas × 100
  // "A la primera" = atendidas en el período, sin contar recuperaciones de BK
  function fillRate(summary_obj) {
    if(!totalDem || totalDem === 0) return '0.0';
    return Math.min(100, (summary_obj.atendido_primera / totalDem * 100)).toFixed(1);
  }

  function nsReal(bk_series) {
    const ok = bk_series.filter(b=>b===0).length;
    return ((ok/52)*100).toFixed(1);
  }

  const s1 = summary(states.m1, ts.m1_stock);
  const s2 = summary(states.m2, ts.m2_stock);
  const s3 = summary(states.m3, ts.m3_stock);
  const sd = summary(states.ddmrp, ts.dd_stock);

  const fr1 = fillRate(s1); const ns1 = nsReal(ts.m1_bk);
  const fr2 = fillRate(s2); const ns2 = nsReal(ts.m2_bk);
  const fr3 = fillRate(s3); const ns3 = nsReal(ts.m3_bk);
  const frd = fillRate(sd); const nsd = nsReal(ts.dd_bk);

  // Facturación = unidades atendidas × precio venta
  function facturacion(bk_series) {
    const total_bk = bk_series[bk_series.length-1];
    const atendido = totalDem - total_bk;
    return Math.round(atendido * precio);
  }
  // Margen bruto = unidades atendidas × (precio - costo)
  function margen(bk_series) {
    const total_bk = bk_series[bk_series.length-1];
    const atendido = totalDem - total_bk;
    return Math.round(atendido * (precio - costo));
  }

  const fac1 = facturacion(ts.m1_bk); const fac2 = facturacion(ts.m2_bk);
  const fac3 = facturacion(ts.m3_bk); const facd = facturacion(ts.dd_bk);
  const mg1 = margen(ts.m1_bk); const mg2 = margen(ts.m2_bk);
  const mg3 = margen(ts.m3_bk); const mgd = margen(ts.dd_bk);
  const mn1 = mg1 - s1.cost_tot; const mn2 = mg2 - s2.cost_tot;
  const mn3 = mg3 - s3.cost_tot; const mnd = mgd - sd.cost_tot;

  // ── Métricas de forecast sobre las 52 semanas ─────────
  // WMAPE = Σ|Real−FC| / ΣReal  (robusto a ceros, pondera por volumen)
  // MAD   = Σ|Real−FC| / n
  // MAPE  = promedio de |Real−FC|/Real (solo semanas con Real>0)
  // Bias  = Σ(FC−Real) / n  (>0 sobreestima, <0 subestima)
  const pairs = ts.fc_pairs;
  const sumReal  = pairs.reduce((s,p)=>s+p.real, 0);
  const sumAbsErr= pairs.reduce((s,p)=>s+Math.abs(p.real-p.fc), 0);
  const sumBias  = pairs.reduce((s,p)=>s+(p.fc-p.real), 0);
  const mapeVals = pairs.filter(p=>p.real>0).map(p=>Math.abs(p.real-p.fc)/p.real*100);

  const wmape = sumReal>0 ? (sumAbsErr/sumReal*100) : 0;
  const mad   = sumAbsErr/pairs.length;
  const mape  = mapeVals.length>0 ? mapeVals.reduce((a,b)=>a+b,0)/mapeVals.length : 0;
  const bias  = sumBias/pairs.length;
  const biasSign = bias > 0.5 ? '▲ sobreestima' : bias < -0.5 ? '▼ subestima' : '≈ neutro';

  // Para tabla: mostrar WMAPE (el más relevante) + Bias
  const fc_wmape_str = wmape.toFixed(1) + '%';
  const fc_bias_str  = (bias>=0?'+':'')+bias.toFixed(1)+' un/sem';
  const fc_prec_avg_str = fc_wmape_str; // backward compat

  // Diagnóstico final sobre historial completo (shared_hist al final del juego)
  const fc_final = forecast(shared_hist, 4, varF);
  const fc_method_final = fc_final.method;
  const fc_diag_final   = fc_final.diag || '';
  const fc_mad_final    = fc_final.mad || '—';

  // Find winner: primero cumplir NS objetivo, luego mejor margen neto
  // Si ninguno cumple NS, gana el de mayor NS real
  const nsObj = ns * 100; // NS objetivo en %
  const rowsNS = [
    {mn:mn1, ns:parseFloat(ns1)},
    {mn:mn2, ns:parseFloat(ns2)},
    {mn:mn3, ns:parseFloat(ns3)},
    {mn:mnd, ns:parseFloat(nsd)},
  ];
  const cumpleNS = rowsNS.filter(r => r.ns >= nsObj);
  let maxMn, winnerNS = null;
  if (cumpleNS.length > 0) {
    maxMn = Math.max(...cumpleNS.map(r => r.mn));
    winnerNS = null; // hay ganador por margen
  } else {
    // Ninguno cumple NS — ganador es el de mayor NS real
    winnerNS = Math.max(...rowsNS.map(r => r.ns));
    maxMn = null;
  }

  // Índice del ganador (0=M1, 1=M2, 2=M3, 3=DDMRP)
  const winnerIdx = maxMn !== null
    ? rowsNS.findIndex(r => r.mn === maxMn && r.ns >= nsObj)
    : rowsNS.findIndex(r => r.ns === winnerNS);

  window._heatmapData = {
    labels: ts.labels,
    winnerIdx,
    models: [
      {name:'M1 — ROP',            color:'#354A5E', zonas: ts.m1_zona},
      {name:'M2 — ROP+Forecast',   color:'#6E2F8F', zonas: ts.m2_zona},
      {name:'M3 — ROP Anticipado', color:'#C45E08', zonas: ts.m3_zona},
      {name:'M4 — DDMRP',          color:'#107E3E', zonas: ts.dd_zona},
    ]
  };

  // ── Render results table ───────────────────────────────
  const rows = [
    {name:'Modo 1 - ROP', color:COLORS.m1, ns:ns1, fr:fr1, s:s1, mn:mn1, fac:fac1, fc_prec:null, fc_bias:null},
    {name:'Modo 2 - ROP+Forecast', color:COLORS.m2, ns:ns2, fr:fr2, s:s2, mn:mn2, fac:fac2, fc_prec:fc_prec_avg_str, fc_bias:fc_bias_str},
    {name:'Modo 3 - ROP Anticipado', color:COLORS.m3, ns:ns3, fr:fr3, s:s3, mn:mn3, fac:fac3, fc_prec:fc_prec_avg_str, fc_bias:fc_bias_str},
    {name:'Modo 4 - DDMRP',  color:COLORS.ddmrp, ns:nsd, fr:frd, s:sd, mn:mnd, fac:facd, fc_prec:null, fc_bias:null},
  ];

  let html = '';
  rows.forEach(r=>{
    const nsNum = parseFloat(r.ns);
    const frNum = parseFloat(r.fr);
    const cumple = nsNum >= nsObj;
    const isWinner = maxMn !== null
      ? (cumple && r.mn === maxMn)
      : (nsNum === winnerNS);
    const nsBadge = cumple ? 'b-pos' : nsNum>=80 ? 'b-crit' : 'b-neg';
    const frBadge = frNum>=95?'b-pos':frNum>=85?'b-crit':'b-neg';
    const discard = !cumple && maxMn !== null; // no cumple NS y hay modelos que sí
    html += `<tr class="${isWinner?'winner-row':''}" style="${discard?'opacity:0.55;':''}">
      <td><div class="model-cell"><span class="dot" style="background:${r.color}"></span>${r.name}${isWinner?' 🏆':''}${discard?' <span style=\"font-size:10px;color:var(--neg);font-weight:400;\">✗ NS insuf.</span>':''}</div></td>
      <td><span class="badge ${nsBadge}">${r.ns}%</span></td>
      <td><span class="badge ${frBadge}">${r.fr}%</span></td>
      <td>${r.s.bk_total}</td>
      <td>${r.s.avg_stock}</td>
      <td>${r.s.orders}</td>
      <td>${fmtS(r.s.cost_fin)}</td>
      <td>${fmtS(r.s.cost_alm)}</td>
      <td>${fmtS(r.s.cost_bk)}</td>
      <td>${fmtS(r.s.cost_orden)}</td>
      <td>${fmtS(r.s.cost_tot)}</td>
      <td style="font-weight:500;">${fmtS(r.fac)}</td>
      <td style="color:${r.mn>=0?'var(--pos)':'var(--neg)'}; font-weight:600;">${fmtS(r.mn)}</td>
      <td style="font-weight:600;color:${(r.mn/r.fac*100)>=10?'var(--pos)':(r.mn/r.fac*100)>=5?'var(--crit)':'var(--neg)'}">${r.fac>0?(r.mn/r.fac*100).toFixed(1):'—'}%</td>
      <td>${r.fc_prec ? `<span class="badge ${parseFloat(r.fc_prec)<=20?'b-pos':parseFloat(r.fc_prec)<=40?'b-crit':'b-neg'}">${r.fc_prec}</span>` : '<span style="color:var(--t3);">—</span>'}</td>
      <td>${r.fc_bias ? `<span style="font-size:11px;font-weight:600;color:${r.fc_bias.includes('neutro')?'var(--pos)':r.fc_bias.includes('sobreestima')?'var(--crit)':'var(--info)'}">${r.fc_bias}</span>` : '<span style="color:var(--t3);">—</span>'}</td>
    </tr>`;
  });
  document.getElementById('rtbl-body').innerHTML = html;
  document.getElementById('result-note').innerHTML =
    `Demanda total simulada: <strong>${fmtN(totalDem)}</strong> un &nbsp;·&nbsp;
     NS objetivo: <strong>${(ns*100).toFixed(0)}%</strong> &nbsp;·&nbsp;
     Criterio: cumplir NS objetivo primero, luego mayor margen neto &nbsp;·&nbsp; 🏆 Ganador
     <br>
     <span style="color:var(--info);font-weight:600;">📊 Forecast — método seleccionado:</span>
     <strong>${fc_method_final}</strong> &nbsp;·&nbsp;
     Perfil detectado: <em>${fc_diag_final||'demanda estable'}</em>
     <br>
     <span style="font-weight:600;">Métricas sobre 52 semanas:</span>
     WMAPE = <strong style="color:${wmape<=20?'var(--pos)':wmape<=40?'var(--crit)':'var(--neg)'}">${wmape.toFixed(1)}%</strong>
     &nbsp;·&nbsp;
     MAPE = <strong>${mape.toFixed(1)}%</strong>
     &nbsp;·&nbsp;
     MAD = <strong>${mad.toFixed(1)} un/sem</strong>
     &nbsp;·&nbsp;
     Bias = <strong style="color:${Math.abs(bias)<0.5?'var(--pos)':bias>0?'var(--crit)':'var(--info)'}">
       ${(bias>=0?'+':'')+bias.toFixed(1)} un/sem (${biasSign})</strong>
     <br>
     <span style="font-size:10px;color:var(--t2);">
       WMAPE: error ponderado por volumen (ideal &lt;20%) · Bias positivo = sobreestima (genera sobrestock) · Bias negativo = subestima (genera quiebres)
     </span>`;

  // ── DDMRP Buffer Display ───────────────────────────────
  const b = states.ddmrp.buf;
  document.getElementById('ddmrp-zones').innerHTML = `
    <div class="zone-tile zone-red">
      <div class="zt-label">Zona Roja — seguridad</div>
      <div class="zt-value" style="font-size:11px;font-family:var(--mono);line-height:1.8;">
        Red_Base = ADU × LT × LTF<br>
        Red_Safety = Red_Base × VF<br>
        <strong>Zona_Roja = Red_Base + Red_Safety</strong>
      </div>
      <div style="font-size:10px;color:var(--t2);margin-top:6px;">
        LTF: ≤1sem→0.5 · ≤2sem→1.0 · >2sem→1.5<br>
        VF: variabilidad baja→0.4 · media→0.6 · alta→0.8
      </div>
    </div>
    <div class="zone-tile zone-yellow">
      <div class="zt-label">Zona Amarilla — cobertura LT</div>
      <div class="zt-value" style="font-size:11px;font-family:var(--mono);line-height:1.8;">
        <strong>Zona_Amarilla = ADU × LT</strong>
      </div>
      <div style="font-size:10px;color:var(--t2);margin-top:6px;">
        Cubre la demanda durante el lead time.<br>
        Trigger de pedido: NFP &lt; Top_Amarillo
      </div>
    </div>
    <div class="zone-tile zone-green">
      <div class="zt-label">Zona Verde — tamaño de pedido</div>
      <div class="zt-value" style="font-size:11px;font-family:var(--mono);line-height:1.8;">
        <strong>Zona_Verde = MAX(ADU×Ciclo, Red_Base, Lote_mín)</strong>
      </div>
      <div style="font-size:10px;color:var(--t2);margin-top:6px;">
        Determina frecuencia y tamaño de reposición.<br>
        Cantidad pedida = Top_Buffer − NFP
      </div>
    </div>
    <div class="zone-tile zone-top">
      <div class="zt-label">Top Buffer y trigger</div>
      <div class="zt-value" style="font-size:11px;font-family:var(--mono);line-height:1.8;">
        Top_Buffer = Roja + Amarilla + Verde<br>
        <strong>NFP = Stock + OC_en_camino − Picos</strong><br>
        Reponer si NFP &lt; Top_Amarillo
      </div>
      <div style="font-size:10px;color:var(--t2);margin-top:6px;">
        ADU rolling: promedio de las últimas 12 semanas.<br>
        Buffer se recalcula cada semana.
      </div>
    </div>
  `;

  // ── Detail table ───────────────────────────────────────
  let dhtml='';
  detail.slice(0,10).forEach(d=>{
    const zcolor = d.rd.zona==='Roja'?'var(--neg)':d.rd.zona==='Amarilla'?'var(--crit)':'var(--pos)';
    dhtml+=`<tr>
      <td>S${d.w}</td><td><strong>${d.dem}</strong></td>
      <td style="color:var(--crit);">${d.r1.rop}</td><td style="color:var(--info);">${d.r1.pos_neta}</td><td>${d.r1.stock}</td><td>${d.r1.bk>0?`<span style="color:var(--neg);font-weight:600;">${d.r1.bk}</span>`:0}</td><td>${d.r1.qty>0?`<span style="color:var(--info);">+${d.r1.qty}</span>`:'-'}</td>
      <td style="color:var(--crit);">${d.r2.rop}</td><td style="color:var(--info);">${d.r2.pos_neta}</td><td>${d.r2.stock}</td><td>${d.r2.bk>0?`<span style="color:var(--neg);font-weight:600;">${d.r2.bk}</span>`:0}</td><td>${d.r2.qty>0?`<span style="color:var(--info);">+${d.r2.qty}</span>`:'-'}</td>
      <td style="color:var(--crit);">${d.r3.rop}</td><td style="color:var(--info);">${d.r3.pos_neta}</td><td>${d.r3.stock}</td><td>${d.r3.bk>0?`<span style="color:var(--neg);font-weight:600;">${d.r3.bk}</span>`:0}</td><td>${d.r3.qty>0?`<span style="color:var(--info);">+${d.r3.qty}</span>`:'-'}</td>
      <td style="color:var(--neg);font-weight:600;">${d.rd.top_red}</td><td style="color:var(--crit);font-weight:600;">${d.rd.top_yellow}</td><td style="color:var(--pos);font-weight:600;">${d.rd.top_green}</td><td>${d.rd.stock}</td><td>${d.rd.bk>0?`<span style="color:var(--neg);font-weight:600;">${d.rd.bk}</span>`:0}</td><td>${d.rd.qty>0?`<span style="color:var(--info);">+${d.rd.qty}</span>`:''}</td>
      <td><span style="font-size:11px;font-weight:600;color:${zcolor};">${d.rd.zona}</span></td>
    </tr>`;
  });
  document.getElementById('dtbl-body').innerHTML = dhtml;

  // ── Charts ─────────────────────────────────────────────
  function makeChart(id, datasets, yLabel, extraOpts={}) {
    if(charts[id]) charts[id].destroy();
    charts[id] = new Chart(document.getElementById(id), {
      type:'line',
      data:{labels: extraOpts.labels || ts.labels, datasets},
      options:{
        responsive:true, maintainAspectRatio:false,
        interaction:{mode:'index', intersect:false},
        plugins:{
          legend:{display:false},
          tooltip:{
            backgroundColor:'rgba(53,74,94,0.95)',
            titleColor:'#fff', bodyColor:'rgba(255,255,255,0.85)',
            padding:10, cornerRadius:4,
            callbacks:{
              title: ctx => ctx[0].label,
              label: ctx => ` ${ctx.dataset.label}: ${ctx.parsed.y !== null ? fmtN(ctx.parsed.y) : '—'} ${yLabel}`
            }
          }
        },
        scales:{
          x:{ticks:{font:{size:10},maxTicksLimit:16},
             grid:{color:'rgba(0,0,0,0.04)'}},
          y:{beginAtZero:true,title:{display:true,text:yLabel,font:{size:10}},
             grid:{color:'rgba(0,0,0,0.04)'}}
        },
        elements:{point:{radius:0, hoverRadius:4, hoverBorderWidth:2}},
        animation:{duration:400},
      }
    });
  }

  // Solo 52 semanas de juego en el gráfico de stock
  const histLabels = ts.labels; // S1..S52 únicamente
  const histVentas = hist26.map(v=>v); // guardamos para chartBK que sí muestra historia
  const pad52 = Array(52).fill(null);
  const pad26 = pad52; // alias para chartBK

  // Áreas de buffer DDMRP — sin padding, solo las 52 sem de juego
  const ddFillGreen  = ts.dd_top_green;
  const ddFillYellow = ts.dd_top_yellow;
  const ddFillRed    = ts.dd_top_red;

  if(charts['chartStock']) charts['chartStock'].destroy();
  charts['chartStock'] = new Chart(document.getElementById('chartStock'), {
    data:{
      labels: histLabels,
      datasets:[
        // ── Áreas buffer DDMRP (índices 0-2) ──
        {type:'line', label:'DDMRP Zona Verde (tope)',
         data: ddFillGreen, hidden:false,
         borderColor:'transparent', borderWidth:0,
         backgroundColor:'rgba(16,126,62,0.10)',
         fill:{target:'+1'}, pointRadius:0, pointHoverRadius:0, order:5},
        {type:'line', label:'DDMRP Zona Amarilla',
         data: ddFillYellow, hidden:false,
         borderColor:'rgba(184,134,11,0.4)', borderWidth:0.5, borderDash:[3,3],
         backgroundColor:'rgba(233,183,12,0.12)',
         fill:{target:'+1'}, pointRadius:0, pointHoverRadius:0, order:5},
        {type:'line', label:'DDMRP Zona Roja',
         data: ddFillRed, hidden:false,
         borderColor:'rgba(187,0,0,0.5)', borderWidth:0.8, borderDash:[3,3],
         backgroundColor:'rgba(220,38,38,0.09)',
         fill:'origin', pointRadius:0, pointHoverRadius:0, order:5},
        // ── Niveles ROP/SS/StockMax compartidos M1-2-3 (índices 3-5, ocultos por defecto) ──
        {type:'line', label:'Stock Máx (M1/2/3)',
         data:[...ts.sh_smax], hidden:true,
         borderColor:'transparent', borderWidth:0,
         backgroundColor:'rgba(16,126,62,0.10)',
         fill:{target:'+1'}, pointRadius:0, pointHoverRadius:0, order:5},
        {type:'line', label:'ROP (M1/2/3)',
         data:[...ts.sh_rop], hidden:true,
         borderColor:'rgba(184,134,11,0.4)', borderWidth:0.5, borderDash:[3,3],
         backgroundColor:'rgba(233,183,12,0.12)',
         fill:{target:'+1'}, pointRadius:0, pointHoverRadius:0, order:5},
        {type:'line', label:'SS (M1/2/3)',
         data:[...ts.sh_ss], hidden:true,
         borderColor:'rgba(187,0,0,0.5)', borderWidth:0.8, borderDash:[3,3],
         backgroundColor:'rgba(220,38,38,0.09)',
         fill:'origin', pointRadius:0, pointHoverRadius:0, order:5},
        // ── Barras de venta real (solo 52 sem de juego) ──
        {type:'bar', label:'Venta real',
         data:[...ts.demand],
         backgroundColor:'rgba(0,100,217,0.22)', borderColor:'rgba(0,100,217,0.45)',
         borderWidth:0.5, barPercentage:0.9, categoryPercentage:0.95, order:3},
        // ── Líneas de stock (solo 52 sem de juego) ──
        {type:'line', label:'Modo 1 - ROP', data:[...ts.m1_stock],
         borderColor:COLORS.m1, borderWidth:2, fill:false, pointRadius:0, pointHoverRadius:4, order:1},
        {type:'line', label:'Modo 2 - ROP+Forecast', data:[...ts.m2_stock],
         borderColor:COLORS.m2, borderWidth:2, fill:false, pointRadius:0, pointHoverRadius:4, order:1},
        {type:'line', label:'Modo 3 - ROP Anticipado', data:[...ts.m3_stock],
         borderColor:COLORS.m3, borderWidth:2, fill:false, pointRadius:0, pointHoverRadius:4, order:1},
        {type:'line', label:'Modo 4 - DDMRP', data:[...ts.dd_stock],
         borderColor:COLORS.ddmrp, borderWidth:2.5, fill:false, pointRadius:0, pointHoverRadius:4, order:1},
      ]
    },
    options:{
      responsive:true, maintainAspectRatio:false,
      interaction:{mode:'index', intersect:false},
      plugins:{
        legend:{display:false},
        tooltip:{
          backgroundColor:'rgba(53,74,94,0.95)',
          titleColor:'#fff', bodyColor:'rgba(255,255,255,0.85)',
          padding:10, cornerRadius:4,
          callbacks:{
            title: ctx => ctx[0].label,
            label: ctx => {
              // Ocultar en tooltip las áreas de buffer (solo mostrar datos útiles)
              const skip = ['DDMRP Zona Verde (tope)','DDMRP Zona Amarilla','DDMRP Zona Roja'];
              if(skip.includes(ctx.dataset.label)) return null;
              return ` ${ctx.dataset.label}: ${ctx.parsed.y !== null ? fmtN(ctx.parsed.y) : '—'} un`;
            }
          }
        }
      },
      scales:{
        x:{ticks:{font:{size:10}, maxTicksLimit:16}, grid:{color:'rgba(0,0,0,0.04)'}},
        y:{beginAtZero:true, title:{display:true, text:'un', font:{size:10}}, grid:{color:'rgba(0,0,0,0.04)'}}
      },
      animation:{duration:400},
    }
  });

  // chartBK: muestra 52 hist + 52 juego — tiene sus propios labels
  const bkLabels = [...Array(52).keys()].map(i=>`S${i+1}`).concat(ts.labels);
  const bkPad    = Array(52).fill(null); // padding historia para series de juego
  makeChart('chartBK',[
    {label:'Demanda histórica', data:[...histVentas, ...bkPad],
     borderColor:'rgba(136,135,128,0.55)', borderWidth:1.5, borderDash:[2,3], fill:false},
    {label:'Demanda real', data:[...bkPad, ...ts.demand],
     borderColor:COLORS.demand, borderWidth:1.5, borderDash:[4,3], fill:false},
    {label:'BK ROP',     data:[...bkPad, ...ts.m1_bk], borderColor:COLORS.m1,    borderWidth:2,   fill:false},
    {label:'BK ROP+FC',  data:[...bkPad, ...ts.m2_bk], borderColor:COLORS.m2,    borderWidth:2,   fill:false},
    {label:'BK ROP Ant.',data:[...bkPad, ...ts.m3_bk], borderColor:COLORS.m3,    borderWidth:2,   fill:false},
    {label:'BK DDMRP',   data:[...bkPad, ...ts.dd_bk], borderColor:COLORS.ddmrp, borderWidth:2.5, fill:false},
  ],'Unidades', {labels: bkLabels});



  // buildLegend es global (declarada fuera de runSim)
  const items = [['Modo 1 - ROP',COLORS.m1],['Modo 2 - ROP+Forecast',COLORS.m2],['Modo 3 - ROP Anticipado',COLORS.m3],['Modo 4 - DDMRP',COLORS.ddmrp]];
  // Renderizar panel de zonas
  renderZoneStats('ddmrp');

  // Leyenda inicial: DDMRP activo por defecto
  buildLegend('stockLegend',[
    ['Venta histórica','rgba(136,135,128,0.7)'],['Venta real',COLORS.demand],
    ...items,
    ['DDMRP Zona Roja','rgba(220,38,38,0.6)'],
    ['DDMRP Zona Amarilla','rgba(184,134,11,0.7)'],
    ['DDMRP Zona Verde','rgba(16,126,62,0.6)'],
  ]);
  buildLegend('bkLegend',[['Dem. histórica','rgba(136,135,128,0.7)'],['Demanda real',COLORS.demand],...items]);

  // Show sections
  ['gaugesCard','radarCard','resultsCard','ddmrpCard','chartsSection','heatmapCard','detailCard'].forEach(id=>{
    document.getElementById(id).style.display='block';
  });
  renderHeatmap();
  window._simDetail = detail;
  // Calcular ADU rolling 12sem para cada semana histórica (52 semanas)
  const hist26_adu = hist26.map((_, i) => {
    const start = Math.max(0, i - 11);
    const slice = hist26.slice(start, i + 1);
    return parseFloat((slice.reduce((a,b)=>a+b,0)/slice.length).toFixed(2));
  });
  window._hist26      = hist26;
  window._hist26_adu  = hist26_adu;
  window._simParams = {adu, comp, varF: +document.getElementById('p_var').value, stock0, lt, lt_std, lote, ns, ciclo, precio, costo, bk_c, tasa, pallet, alm_cost, orden_cost, quiebre_sem, quiebre_pct};
  // Guardar datos para gauges y radar
  window._vizData = {
    ns:    [parseFloat(ns1), parseFloat(ns2), parseFloat(ns3), parseFloat(nsd)],
    fr:    [parseFloat(fr1), parseFloat(fr2), parseFloat(fr3), parseFloat(frd)],
    stock: [s1.avg_stock, s2.avg_stock, s3.avg_stock, sd.avg_stock],
    cost:  [s1.cost_tot,  s2.cost_tot,  s3.cost_tot,  sd.cost_tot],
    orders:[s1.orders,    s2.orders,    s3.orders,    sd.orders],
    mn:    [mn1, mn2, mn3, mnd],
    wmape: wmape,
    ns_obj: ns * 100,
    colors: [COLORS.m1, COLORS.m2, COLORS.m3, COLORS.ddmrp],
    names:  ['M1','M2','M3','M4'],
    full_names: ['Modo 1 - ROP','Modo 2 - ROP+Forecast','Modo 3 - ROP Anticipado','Modo 4 - DDMRP'],
    winnerIdx,
  };
  renderGauges();
  renderRadar();
  document.getElementById('resultsCard').scrollIntoView({behavior:'smooth'});
}

async function downloadExcel() {
  if (!window._simDetail || window._simDetail.length === 0) {
    alert('Ejecuta la simulación primero.');
    return;
  }
  const d = window._simDetail;
  const p = window._simParams;

  const wb = new ExcelJS.Workbook();
  wb.creator = 'Quantitative Supply Chain';
  wb.created = new Date();

  // ── Colores por modo ────────────────────────────────────
  const C = {
    base_hdr: '354A5E', base_hdr_txt: 'FFFFFF',
    m1_hdr:   '354A5E', m1_fill1: 'EEF2F7', m1_fill2: 'DDE5EF',
    m2_hdr:   '6E2F8F', m2_fill1: 'F3EEF9', m2_fill2: 'E8E0F4',
    m3_hdr:   'C45E08', m3_fill1: 'FEF4EC', m3_fill2: 'FDEADC',
    dd_hdr:   '107E3E', dd_fill1: 'EFF7F2', dd_fill2: 'DFF0E8',
  };

  const mkFill = (rgb) => ({type:'pattern', pattern:'solid', fgColor:{argb:'FF'+rgb}});
  const mkFont = (rgb, bold=false, sz=10) => ({name:'Calibri', size:sz, bold, color:{argb:'FF'+rgb}});
  const mkBorder = () => ({
    top:{style:'thin',color:{argb:'FFD9DBDD'}},
    bottom:{style:'thin',color:{argb:'FFD9DBDD'}},
    left:{style:'thin',color:{argb:'FFD9DBDD'}},
    right:{style:'thin',color:{argb:'FFD9DBDD'}}
  });
  const mkAlign = (h='center') => ({horizontal:h, vertical:'middle'});

  // ── Hoja 1: Parámetros ──────────────────────────────────
  const wsP = wb.addWorksheet('Parámetros');
  wsP.columns = [{width:28},{width:16}];
  const paramRows = [
    ['Parámetro','Valor'],
    ['ADU base (un/sem)', p.adu],
    ['Stock inicial (un)', p.stock0],
    ['Lead time (semanas)', p.lt],
    ['Lead time std (semanas)', p.lt_std],
    ['Nivel de servicio objetivo', p.ns],
    ['Lote mínimo (un)', p.lote],
    ['Ciclo revisión (sem)', p.ciclo],
    ['Precio venta (S/)', p.precio],
    ['Costo unitario (S/)', p.costo],
    ['Costo backorder (S/)', p.bk_c],
    ['Tasa financiera anual', p.tasa],
    ['Unidades por pallet', p.pallet],
    ['Costo alm S/pallet/sem', p.alm_cost],
    ['Costo por OC emitida (S/)', p.orden_cost],
    ['Quiebre estructural desde sem', p.quiebre_sem],
    ['Quiebre % de demanda', p.quiebre_pct],
  ];
  paramRows.forEach((row, i) => {
    const r = wsP.addRow(row);
    r.height = 16;
    r.eachCell(cell => {
      cell.border = mkBorder();
      cell.alignment = mkAlign(i===0?'center':'left');
      if(i===0) {
        cell.fill = mkFill(C.base_hdr);
        cell.font = mkFont('FFFFFF', true, 10);
      } else {
        cell.fill = mkFill(i%2===0?'F5F6F7':'FFFFFF');
        cell.font = mkFont('32363A', i===0, 10);
      }
    });
  });

  // ── Hoja 2: Simulación 52 semanas ──────────────────────
  // Layout: A=Sem B=Dem C=ROP D=StockMax
  // M1(E-I): PosNeta StockIni Pedido StockFin BK
  // M2(J-N): PosNeta StockIni Pedido StockFin BK
  // M3(O-S): PosNeta StockIni Pedido StockFin BK
  // DD(T-Y): TopAm StockIni Pedido StockFin BK Zona
  const ws = wb.addWorksheet('Simulación 52 semanas');

  // Column widths
  ws.columns = [
    {width:7},  // A Sem
    {width:9},  // B Demanda
    {width:9},  // C ROP
    {width:11}, // D StockMax
    {width:11},{width:11},{width:9},{width:11},{width:10}, // M1 E-I
    {width:11},{width:11},{width:9},{width:11},{width:10}, // M2 J-N
    {width:11},{width:11},{width:9},{width:11},{width:10}, // M3 O-S
    {width:13},{width:11},{width:9},{width:11},{width:10},{width:10}, // DD T-Y
  ];

  // Group headers row 1
  const grpHdrRow = ws.addRow([
    'General','','','',
    'Modo 1 - ROP','','','','',
    'Modo 2 - ROP+Forecast','','','','',
    'Modo 3 - ROP Anticipado','','','','',
    'Modo 4 - DDMRP','','','','','',
  ]);
  grpHdrRow.height = 18;
  // Merge group cells
  ws.mergeCells('A1:D1');
  ws.mergeCells('E1:I1');
  ws.mergeCells('J1:N1');
  ws.mergeCells('O1:S1');
  ws.mergeCells('T1:Y1');
  const grpStyles = [
    {cols:[1,2,3,4],    fill:C.base_hdr},
    {cols:[5,6,7,8,9],  fill:C.m1_hdr},
    {cols:[10,11,12,13,14], fill:C.m2_hdr},
    {cols:[15,16,17,18,19], fill:C.m3_hdr},
    {cols:[20,21,22,23,24,25], fill:C.dd_hdr},
  ];
  grpStyles.forEach(g => {
    g.cols.forEach(col => {
      const cell = grpHdrRow.getCell(col);
      cell.fill = mkFill(g.fill);
      cell.font = mkFont('FFFFFF', true, 11);
      cell.alignment = mkAlign('center');
      cell.border = mkBorder();
    });
  });

  // Column headers row 2
  const colHdrs = [
    'Sem','Demanda','ROP','Stock_Max',
    'Pos_Neta','Stock_Ini','Pedido','Stock_Fin','BK_Acum',
    'Pos_Neta','Stock_Ini','Pedido','Stock_Fin','BK_Acum',
    'Pos_Neta','Stock_Ini','Pedido','Stock_Fin','BK_Acum',
    'Top_Amarillo','Stock_Ini','Pedido','Stock_Fin','BK_Acum','Zona',
  ];
  const colHdrRow = ws.addRow(colHdrs);
  colHdrRow.height = 16;
  const colFills = [C.base_hdr,C.base_hdr,C.base_hdr,C.base_hdr,
    C.m1_hdr,C.m1_hdr,C.m1_hdr,C.m1_hdr,C.m1_hdr,
    C.m2_hdr,C.m2_hdr,C.m2_hdr,C.m2_hdr,C.m2_hdr,
    C.m3_hdr,C.m3_hdr,C.m3_hdr,C.m3_hdr,C.m3_hdr,
    C.dd_hdr,C.dd_hdr,C.dd_hdr,C.dd_hdr,C.dd_hdr,C.dd_hdr,
  ];
  colHdrRow.eachCell((cell, colNum) => {
    cell.fill = mkFill(colFills[colNum-1]);
    cell.font = mkFont('FFFFFF', true, 10);
    cell.alignment = mkAlign('center');
    cell.border = mkBorder();
  });

  // Freeze rows 1+2
  ws.views = [{state:'frozen', xSplit:0, ySplit:2, activeCell:'A3'}];

  // Data rows (start at Excel row 3)
  const p0 = p.stock0;
  d.forEach((r, i) => {
    const exRow = i + 3; // data starts row 3
    const B = `B${exRow}`;

    const dataRow = ws.addRow([
      r.w, r.dem,
      parseFloat(r.sh_mc.rop.toFixed(1)), parseFloat(r.sh_smax.toFixed(1)),
      r.r1.pos_neta, r.r1.stock_ini, r.r1.qty, r.r1.stock, r.r1.bk,
      r.r2.pos_neta, r.r2.stock_ini, r.r2.qty, r.r2.stock, r.r2.bk,
      r.r3.pos_neta, r.r3.stock_ini, r.r3.qty, r.r3.stock, r.r3.bk,
      r.rd.top_yellow, r.rd.stock_ini, r.rd.qty, r.rd.stock, r.rd.bk, r.rd.zona
    ]);
    dataRow.height = 15;


    // Colores alternos por grupo
    const isAlt = i%2!==0;
    const grpFills = [
      ...[1,2,3,4].map(()=>isAlt?'EDEFF0':'F5F6F7'),           // base
      ...[5,6,7,8,9].map(()=>isAlt?C.m1_fill2:C.m1_fill1),     // M1
      ...[10,11,12,13,14].map(()=>isAlt?C.m2_fill2:C.m2_fill1),// M2
      ...[15,16,17,18,19].map(()=>isAlt?C.m3_fill2:C.m3_fill1),// M3
      ...[20,21,22,23,24,25].map(()=>isAlt?C.dd_fill2:C.dd_fill1), // DD
    ];
    dataRow.eachCell({includeEmpty:true}, (cell, colNum) => {
      cell.fill = mkFill(grpFills[colNum-1]);
      cell.font = mkFont('32363A', colNum<=2, 10);
      cell.alignment = mkAlign('center');
      cell.border = mkBorder();
      // BK cells red if >0
      if([9,14,19,24].includes(colNum) && typeof cell.value === 'number' && cell.value > 0){
        cell.font = mkFont('BB0000', true, 10);
      }
    });
  });

  // ── Hoja 3: DDMRP — Cálculo de zonas del buffer ───────
  // Muestra: 26 sem históricas + 52 sem de juego
  // Cada fila: Semana | Venta | ADU_rolling(4sem) | LTF | VF | Red_Base | Red_Safety | Zona_Roja | Zona_Amarilla | Zona_Verde | Top_Buffer | Top_Yellow(trigger) | Stock_DD | Zona_DD
  const wsDd = wb.addWorksheet('DDMRP — Zonas Buffer');
  wsDd.columns = [
    {width:9},{width:9},   // Sem, Venta
    {width:14},             // ADU_Rolling (prom 4 sem)
    {width:10},{width:10}, // LTF, VF
    {width:13},{width:14}, // Red_Base, Red_Safety
    {width:12},{width:14},{width:12}, // Zona_Roja, Zona_Amarilla(=yellow), Zona_Verde
    {width:13},{width:14}, // Top_Buffer, Top_Yellow(trigger)
    {width:11},{width:11}, // Stock_DD, Zona_DD
  ];

  // Grupos de header para la hoja DDMRP
  const ddHdrGrp = wsDd.addRow([
    'Identificación','',
    'ADU_rolling 12sem','Factores','',
    'Zona Roja','','',
    'Zona Amarilla','Zona Verde',
    'Niveles buffer','',
    'Estado DDMRP',''
  ]);
  ddHdrGrp.height = 18;
  wsDd.mergeCells('A1:B1'); wsDd.mergeCells('C1:C1');
  wsDd.mergeCells('D1:E1'); wsDd.mergeCells('F1:H1');
  wsDd.mergeCells('I1:I1'); wsDd.mergeCells('J1:J1');
  wsDd.mergeCells('K1:L1'); wsDd.mergeCells('M1:N1');
  const ddGrpColors = ['354A5E','354A5E','107E3E','107E3E','107E3E','BB0000','BB0000','BB0000','B8860B','107E3E','354A5E','354A5E','354A5E','354A5E'];
  ddHdrGrp.eachCell((cell, cn) => {
    cell.fill = mkFill(ddGrpColors[cn-1]||'354A5E');
    cell.font = mkFont('FFFFFF', true, 11);
    cell.alignment = mkAlign('center');
    cell.border = mkBorder();
  });

  const ddColHdrs = wsDd.addRow([
    'Semana','Venta real',
    'ADU_rolling real (12 sem móviles — valor de simulación)',
    'LT_Factor (cte)','Var_Factor (cte)',
    'Red_Base = ADU×LT×LTF','Red_Safety = Red_Base×VF','Zona_Roja = Red_Base + Red_Safety',
    'Zona_Amarilla = ADU×LT',
    'Zona_Verde = MAX(ADU×Ciclo, Red_Base, Lote_min)',
    'Top_Buffer = Roja+Amarilla+Verde','Top_Yellow (trigger pedido) = Roja+Amarilla',
    'Stock físico DD','Zona DD'
  ]);
  ddColHdrs.height = 30;
  ddColHdrs.eachCell((cell, cn) => {
    const grpC = ['354A5E','354A5E','107E3E','107E3E','107E3E','BB0000','BB0000','BB0000','B8860B','107E3E','354A5E','354A5E','354A5E','354A5E'];
    cell.fill = mkFill(grpC[cn-1]||'354A5E');
    cell.font = mkFont('FFFFFF', true, 10);
    cell.alignment = {horizontal:'center', vertical:'middle', wrapText:true};
    cell.border = mkBorder();
  });
  wsDd.getRow(2).height = 40;

  // Parámetros fijos (se usarán en fórmulas de referencia)
  // Los escribimos en una zona aparte de la hoja para que las fórmulas los referencien
  // Usaremos columnas P-S como zona de parámetros
  // Parámetros como constantes JS — se incrustan directamente en las fórmulas
  // para evitar conflictos con filas de headers de la hoja
  const vfMap2 = [0, 0.4, 0.6, 0.8, 1.0];
  const vfVal  = vfMap2[p.varF] || 0.6;
  const ltfVal = p.lt <= 1 ? 0.5 : p.lt <= 2 ? 1.0 : 1.5;
  const ltVal  = p.lt;
  const cicloVal = p.ciclo;
  const loteVal  = p.lote;
  // Agregar una fila de referencia visible DESPUÉS de los headers (fila 3 en adelante no existe aún)
  // La ponemos en columnas P-Q como fila separada al final, o simplemente como valores incrustados

  // Construir filas: 26 históricas + 52 de juego
  // El ADU_rolling viene calculado directamente de la simulación — sin reconstrucción en Excel
  const hist26data = window._hist26 || [];
  const hist26adu  = window._hist26_adu || hist26data.map(v=>v);
  const ddRows = [
    ...hist26data.map((v, i) => ({sem:`S${i+1}`, venta:v, adu_r:hist26adu[i], vf_r:null, stock_dd:null, zona_dd:'—', isHist:true})),
    ...d.map(r => ({sem:`S${r.w}`, venta:r.dem, adu_r:r.rd.adu_rolling, vf_r:r.rd.vf_din, stock_dd:r.rd.stock, zona_dd:r.rd.zona, isHist:false}))
  ];

  ddRows.forEach((row, i) => {
    const exRow = i + 3;
    const C = `C${exRow}`;  // ADU_rolling (valor real)
    const F = `F${exRow}`;  // Red_Base
    const G = `G${exRow}`;  // Red_Safety
    const H = `H${exRow}`;  // Zona Roja
    const I_col = `I${exRow}`; // Zona Amarilla
    const J = `J${exRow}`;  // Zona Verde
    const K = `K${exRow}`;  // Top Buffer
    const L = `L${exRow}`;  // Top Yellow

    const dataRow = wsDd.addRow([
      row.sem,
      row.venta,
      row.adu_r,    // C: ADU_rolling — valor real de la simulación (12 sem móviles)
      null,         // D: LTF
      row.vf_r,     // E: VF dinámico real de la simulación
      null,         // F: Red_Base
      null,         // G: Red_Safety
      null,         // H: Zona Roja
      null,         // I: Zona Amarilla
      null,         // J: Zona Verde
      null,         // K: Top Buffer
      null,         // L: Top Yellow (trigger)
      row.stock_dd !== null ? row.stock_dd : '',
      row.zona_dd
    ]);
    dataRow.height = 14;

    // Fórmulas con valores de parámetros incrustados directamente
    // LT=${ltVal} | LTF=${ltfVal} | VF=${vfVal} | Ciclo=${cicloVal} | Lote=${loteVal}
    dataRow.getCell(4).value  = ltfVal;                                   // LTF (valor constante)
    dataRow.getCell(5).value  = vfVal;                                    // VF (valor constante)
    dataRow.getCell(6).value  = {formula: `${C}*${ltVal}*${ltfVal}`};    // Red_Base = ADU×LT×LTF
    dataRow.getCell(7).value  = {formula: `${F}*${vfVal}`};              // Red_Safety = Red_Base×VF
    dataRow.getCell(8).value  = {formula: `${F}+${G}`};                  // Zona_Roja = Base+Safety
    dataRow.getCell(9).value  = {formula: `${C}*${ltVal}`};              // Zona_Amarilla = ADU×LT
    dataRow.getCell(10).value = {formula: `MAX(${C}*${cicloVal},${F},${loteVal})`}; // Zona_Verde
    dataRow.getCell(11).value = {formula: `${H}+${I_col}+${J}`};         // Top_Buffer
    dataRow.getCell(12).value = {formula: `${H}+${I_col}`};              // Top_Yellow (trigger)

    // Colores: histórico gris, juego con color por zona
    const isAlt = i%2 !== 0;
    const baseFill = row.isHist
      ? (isAlt ? 'EDEFF0' : 'F5F6F7')
      : (isAlt ? 'E2F0E8' : 'EFF7F2');
    const redFill  = row.isHist ? baseFill : (isAlt ? 'FDEADC' : 'FEF4EC');
    const ambFill  = row.isHist ? baseFill : (isAlt ? 'FAF0DC' : 'FEFBF0');

    dataRow.eachCell({includeEmpty:true}, (cell, cn) => {
      let fill = baseFill;
      if(cn >= 6 && cn <= 8)  fill = redFill;   // Zona Roja cols
      if(cn === 9)             fill = ambFill;   // Zona Amarilla
      cell.fill = mkFill(fill);
      cell.font = mkFont(cn <= 2 ? '32363A' : '32363A', cn <= 2, 10);
      cell.alignment = mkAlign('center');
      cell.border = mkBorder();
      // Zona_DD color
      if(cn === 14) {
        const z = row.zona_dd;
        if(z === 'Roja')    { cell.font = mkFont('BB0000', true, 10); cell.fill = mkFill('FFF2F2'); }
        if(z === 'Amarilla'){ cell.font = mkFont('B8860B', true, 10); cell.fill = mkFill('FEFBF0'); }
        if(z === 'Verde')   { cell.font = mkFont('107E3E', true, 10); cell.fill = mkFill('EFF7F2'); }
      }
    });
    // Números con decimal
    [3,6,7,8,9,10,11,12].forEach(cn => {
      dataRow.getCell(cn).numFmt = '#,##0.0';
    });
  });

  // Fila de referencia de parámetros al final de la hoja
  wsDd.addRow([]); // fila vacía separadora
  const paramRefRow = wsDd.addRow([
    'PARÁMETROS USADOS:', '',
    `ADU: ver col C`,
    `LTF = ${ltfVal}`,
    `VF = ${vfVal}`,
    `Red_Base = ADU×${ltVal}×${ltfVal}`,
    `Red_Safety = Red_Base×${vfVal}`,
    `Zona_Roja = Base+Safety`,
    `Zona_Amarilla = ADU×${ltVal}`,
    `Zona_Verde = MAX(ADU×${cicloVal}, Red_Base, ${loteVal})`,
    `Top_Buffer = Roja+Amarilla+Verde`,
    `Top_Yellow = Roja+Amarilla`,
  ]);
  paramRefRow.eachCell({includeEmpty:false}, cell => {
    cell.fill = mkFill('354A5E');
    cell.font = mkFont('FFFFFF', true, 9);
    cell.alignment = {horizontal:'left', vertical:'middle'};
  });
  paramRefRow.height = 16;

  wsDd.getColumn(16).width = 1; // ocultar col P-Q (ya no se usan)
  wsDd.getColumn(17).width = 1;
  wsDd.views = [{state:'frozen', xSplit:0, ySplit:2, activeCell:'A3'}];

  // ── Download ────────────────────────────────────────────
  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], {type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `QSC_simulacion_${new Date().toISOString().slice(0,10)}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}

// Índices de datasets en chartStock:
// 0=DDMRP Verde, 1=DDMRP Amarilla, 2=DDMRP Roja
// 3=ROP StockMáx, 4=ROP ROP, 5=ROP SS
// 6=Venta histórica, 7=Venta real, 8-11=Líneas stock
// ─── GAUGES — semicírculo 180° correcto ─────────────────────
// Canvas: Y crece hacia abajo. Centro del pivote en cy (base del semicírculo).
// 0%  → ángulo -PI   → punto izquierdo  (cx-R, cy)
// 50% → ángulo -PI/2 → punto superior   (cx, cy-R)
// 100%→ ángulo  0    → punto derecho    (cx+R, cy)
// pctAngle(p) = -PI + p/100 * PI  (de -PI a 0, arco superior)
function drawGauge(canvasId, value, target, color, modelName, isWinner=false) {
  const canvas = document.getElementById(canvasId);
  if(!canvas) return;
  const dpr = window.devicePixelRatio || 1;
  const W   = canvas.parentElement.clientWidth;
  const H   = 165;
  canvas.width  = W * dpr;
  canvas.height = H * dpr;
  canvas.style.width  = W + 'px';
  canvas.style.height = H + 'px';
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);

  const PAD = 28;
  const cx  = W / 2;
  const cy  = H - 38;            // pivote en la base del semicírculo
  const R   = Math.min(cx - PAD, cy - 6);
  const Rin = R * 0.58;

  // Convierte % (0-100) al ángulo en canvas
  // 0% → -PI (izquierda), 100% → 0 (derecha), arco va por ARRIBA
  const pctAngle = p => -Math.PI + (p / 100) * Math.PI;

  const pct = Math.min(100, Math.max(0, value));

  // ── 1. Arco tricolor: zonas basadas en el target ──────────
  // Rojo:  0% → target%   (bajo el objetivo)
  // Verde: target% → 100%  (igual o supera el objetivo)
  const tol = 0; // sin tolerancia — verde exactamente desde el target
  const zones = [
    {from: 0,      to: target, col: 'rgba(220,38,38,0.28)'},
    {from: target, to: 100,    col: 'rgba(22,163,74,0.28)'},
  ];

  zones.forEach(({from, to, col}) => {
    const a1 = pctAngle(from);
    const a2 = pctAngle(to);
    // anticlockwise=false: de a1 a a2 en sentido horario (de -PI hacia 0 = arco superior)
    ctx.beginPath();
    ctx.arc(cx, cy, R,   a1, a2, false);
    ctx.arc(cx, cy, Rin, a2, a1, true);
    ctx.closePath();
    ctx.fillStyle = col;
    ctx.fill();
  });

  // Borde exterior del anillo
  ctx.beginPath();
  ctx.arc(cx, cy, R,   pctAngle(0), pctAngle(100), false);
  ctx.arc(cx, cy, Rin, pctAngle(100), pctAngle(0), true);
  ctx.closePath();
  ctx.strokeStyle = 'rgba(180,183,187,0.8)';
  ctx.lineWidth = 1;
  ctx.stroke();

  // Línea base horizontal (diámetro)
  ctx.beginPath();
  ctx.moveTo(cx - R, cy);
  ctx.lineTo(cx + R, cy);
  ctx.strokeStyle = 'rgba(180,183,187,0.6)';
  ctx.lineWidth = 1;
  ctx.stroke();

  // ── 2. Marcas de escala ───────────────────────────────────
  [0, 20, 40, 60, 80, 100].forEach(m => {
    const a  = pctAngle(m);
    const cosA = Math.cos(a), sinA = Math.sin(a);
    // Ticks fuera del arco
    ctx.beginPath();
    ctx.moveTo(cx + (R+3)*cosA,  cy + (R+3)*sinA);
    ctx.lineTo(cx + (R+11)*cosA, cy + (R+11)*sinA);
    ctx.strokeStyle = '#9CA3AF';
    ctx.lineWidth = 1.5;
    ctx.lineCap = 'round';
    ctx.stroke();
    // Etiqueta
    ctx.font = '500 9px IBM Plex Sans, Arial, sans-serif';
    ctx.fillStyle = '#6B7280';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(m + '%', cx + (R+22)*cosA, cy + (R+22)*sinA);
  });

  // ── 3. Marca de objetivo: línea radial dentro del arco ────
  const ta = pctAngle(target);
  ctx.beginPath();
  ctx.moveTo(cx + (Rin-2)*Math.cos(ta), cy + (Rin-2)*Math.sin(ta));
  ctx.lineTo(cx + (R+2)*Math.cos(ta),   cy + (R+2)*Math.sin(ta));
  ctx.strokeStyle = '#1E3A5F';
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  ctx.stroke();

  // ── 4. Manecilla grande tipo puntero ─────────────────────
  const na     = pctAngle(pct);
  const cosNA  = Math.cos(na), sinNA = Math.sin(na);
  const perpA  = na + Math.PI / 2;
  const cosP   = Math.cos(perpA), sinP = Math.sin(perpA);
  const nLen   = R - 4;    // punta llega al borde interior del arco
  const bW     = 9;        // semiancho en la base
  const cpLen  = R * 0.20; // contrapeso trasero

  const tipX = cx + nLen  * cosNA;
  const tipY = cy + nLen  * sinNA;
  const b1x  = cx + bW   * cosP;
  const b1y  = cy + bW   * sinP;
  const b2x  = cx - bW   * cosP;
  const b2y  = cy - bW   * sinP;
  const cpX  = cx - cpLen * cosNA;
  const cpY  = cy - cpLen * sinNA;

  ctx.save();
  ctx.shadowColor   = 'rgba(0,0,0,0.22)';
  ctx.shadowBlur    = 7;
  ctx.shadowOffsetX = 2;
  ctx.shadowOffsetY = 3;

  const grad = ctx.createLinearGradient(cx, cy, tipX, tipY);
  grad.addColorStop(0, color);
  grad.addColorStop(1, lighten(color, 0.42));

  ctx.beginPath();
  ctx.moveTo(b1x, b1y);
  ctx.lineTo(tipX, tipY);
  ctx.lineTo(b2x, b2y);
  ctx.lineTo(cpX, cpY);
  ctx.closePath();
  ctx.fillStyle   = grad;
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.12)';
  ctx.lineWidth   = 0.5;
  ctx.stroke();
  ctx.restore();

  // ── 5. Pivote central ─────────────────────────────────────
  ctx.beginPath();
  ctx.arc(cx, cy, 11, 0, 2*Math.PI);
  ctx.fillStyle = '#F3F4F6';
  ctx.fill();
  ctx.strokeStyle = '#D1D5DB';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, cy, 6.5, 0, 2*Math.PI);
  ctx.fillStyle = color;
  ctx.fill();

  // ── 6. Valor y objetivo ───────────────────────────────────
  const fc = pct >= target ? '#16A34A' : '#DC2626';
  // Valor: pequeño, centrado justo encima del eje del pivote
  ctx.textBaseline = 'alphabetic';
  ctx.font = `600 ${Math.round(R * 0.22)}px IBM Plex Sans, Arial, sans-serif`;
  ctx.fillStyle = fc;
  ctx.textAlign = 'center';
  ctx.fillText(pct.toFixed(1) + '%', cx, cy - 14);
  // Copa del ganador encima del valor
  if(isWinner) {
    ctx.font = `${Math.round(R * 0.28)}px serif`;
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'center';
    ctx.fillText('🏆', cx, cy - 14 - Math.round(R * 0.22) - 2);
  }
  // Subtítulo debajo del pivote
  ctx.font = '500 9px IBM Plex Sans, Arial, sans-serif';
  ctx.fillStyle = '#89919A';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText('obj ' + target.toFixed(0) + '%', cx, cy + 26);
}

function renderGauges() {
  const d = window._vizData;
  if(!d) return;
  ['gauge1','gauge2','gauge3','gauge4'].forEach((id, i) => {
    drawGauge(id, d.ns[i], d.ns_obj, d.colors[i], d.full_names[i], i === d.winnerIdx);
  });
}

function lighten(hex, t) {
  const r=parseInt(hex.slice(1,3),16), g=parseInt(hex.slice(3,5),16), b=parseInt(hex.slice(5,7),16);
  const lr=Math.round(r+(255-r)*t), lg=Math.round(g+(255-g)*t), lb=Math.round(b+(255-b)*t);
  return '#'+[lr,lg,lb].map(x=>x.toString(16).padStart(2,'0')).join('');
}

// ─── RADAR ───────────────────────────────────────────────
function renderRadar() {
  const d = window._vizData;
  if(!d) return;
  if(charts['radarChart']) charts['radarChart'].destroy();

  // Normalizar cada eje 0-100 para comparación justa
  // NS real: directo (ya es %)
  // Fill Rate: directo
  // Stock promedio: invertido (menos stock = mejor) → (1 - stock/maxStock)*100
  // Costo total: invertido → (1 - cost/maxCost)*100
  // Pedidos: invertido → (1 - orders/maxOrders)*100
  // Margen neto: normalizado → (mn - minMn)/(maxMn - minMn)*100

  // Normaliza 0-100 con piso de 20 para que el radar nunca colapse al centro
  // El peor modelo en cualquier eje queda en 20, el mejor en 100
  const norm = (arr, invert=false) => {
    const mn = Math.min(...arr), mx = Math.max(...arr);
    if(mx === mn) return arr.map(()=>60);
    return arr.map(v => {
      const raw = invert ? (1-(v-mn)/(mx-mn)) : ((v-mn)/(mx-mn));
      return Math.round(20 + raw * 80); // rango 20–100
    });
  };

  // NS y FR: usar valor real pero clampeado entre 20 y 100
  // (un NS de 50% real no debería aparecer como 50 en el radar porque el eje va 0-100
  //  y lo haría ver "mitad de camino" cuando en realidad es malo)
  // Los dejamos como están — son % reales, el radar los muestra directamente

  const nsN    = d.ns.map(v=>v);               // ya en %
  const frN    = d.fr.map(v=>v);               // ya en %
  const stockN = norm(d.stock, true);           // invertido: menos stock = más verde
  const costN  = norm(d.cost,  true);           // invertido: menos costo = más verde
  const ordN   = norm(d.orders,true);           // invertido: menos pedidos = más verde
  const mnN    = norm(d.mn,    false);          // más margen = mejor

  const datasets = d.colors.map((color, i) => ({
    label: d.full_names[i],
    data: [nsN[i], frN[i], stockN[i], costN[i], ordN[i], mnN[i]],
    borderColor: color,
    backgroundColor: color.replace(')', ', 0.08)').replace('rgb','rgba').replace('#', '').length > 9
      ? color + '14'
      : hexToRgba(color, 0.08),
    borderWidth: 2,
    pointRadius: 3,
    pointBackgroundColor: color,
  }));

  function hexToRgba(hex, a) {
    const r=parseInt(hex.slice(1,3),16), g=parseInt(hex.slice(3,5),16), b=parseInt(hex.slice(5,7),16);
    return `rgba(${r},${g},${b},${a})`;
  }

  const radarTitle = document.getElementById('radarTitle');
  if(radarTitle && d.winnerIdx >= 0) {
    radarTitle.textContent = `Comparación multidimensional — KPIs · 🏆 ${d.full_names[d.winnerIdx]}`;
  }
  charts['radarChart'] = new Chart(document.getElementById('radarChart'), {
    type: 'radar',
    data: {
      labels: ['NS real','Fill Rate','Stock bajo','Costo bajo','Pedidos bajos','Margen neto'],
      datasets: datasets.map((ds, i) => ({
        ...ds,
        backgroundColor: hexToRgba(d.colors[i], 0.08),
      }))
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        r: {
          min: 0, max: 100,
          ticks: { display: false, stepSize: 25 },
          grid:  { color: 'rgba(0,0,0,0.06)' },
          angleLines: { color: 'rgba(0,0,0,0.08)' },
          pointLabels: {
            font: { size: 11, family: 'IBM Plex Sans, Arial, sans-serif' },
            color: '#6A6D70',
          }
        }
      },
      elements: { line: { tension: 0.1 } }
    }
  });

  // Leyenda manual con valores reales
  const leg = document.getElementById('radarLegend');
  if(!leg) return;
  leg.innerHTML = '<div style="font-size:10px;font-weight:600;color:var(--t2);text-transform:uppercase;letter-spacing:.4px;margin-bottom:10px;">Valores reales</div>' +
    d.full_names.map((name, i) => `
      <div style="display:flex;align-items:flex-start;gap:8px;margin-bottom:10px;">
        <span style="width:10px;height:10px;border-radius:50%;background:${d.colors[i]};flex-shrink:0;margin-top:2px;"></span>
        <div>
          <div style="font-weight:600;color:${d.colors[i]};margin-bottom:2px;">${i === d.winnerIdx ? '🏆 ' : ''}${name}</div>
          <div style="color:var(--t2);line-height:1.6;">
            NS: <strong>${d.ns[i].toFixed(1)}%</strong> ·
            FR: <strong>${d.fr[i].toFixed(1)}%</strong> ·
            Stock prom: <strong>${fmtN(d.stock[i])} un</strong><br>
            Costo: <strong>${fmtS(d.cost[i])}</strong> ·
            Pedidos: <strong>${d.orders[i]}</strong> ·
            MN: <strong style="color:${d.mn[i]>=0?'var(--pos)':'var(--neg)'}">${fmtS(d.mn[i])}</strong>
          </div>
        </div>
      </div>`
    ).join('');
}

// ─── LEGEND BUILDER (global) ─────────────────────────────
function buildLegend(id, items) {
  const el = document.getElementById(id);
  if(!el) return;
  el.innerHTML = items.map(([label,color])=>
    `<span class="zleg"><span class="zleg-dot" style="background:${color}"></span>${label}</span>`
  ).join('');
}

function renderHeatmap() {
  const data = window._heatmapData;
  if(!data) return;
  const canvas = document.getElementById('heatmapCanvas');
  const tooltip = document.getElementById('heatmapTooltip');
  if(!canvas) return;

  const MODELS = data.models;
  const N = data.labels.length; // 52
  const M = MODELS.length;      // 4

  const COLORS = {R:'#DC2626', A:'#D97706', V:'#16A34A', S:'#2563EB'};
  const ALPHA  = {R:'rgba(220,38,38,0.85)', A:'rgba(217,119,6,0.80)', V:'rgba(22,163,74,0.75)', S:'rgba(37,99,235,0.75)'};
  const LABELS = {R:'Roja', A:'Amarilla', V:'Verde', S:'Sobrestock'};

  const LABEL_W = 148; // px para el nombre del modelo
  const CELL_H  = 26;
  const GAP     = 3;
  const TOP_PAD = 22; // espacio para etiquetas de semana
  const ROW_H   = CELL_H + GAP;

  // Canvas width = container width
  const containerW = canvas.parentElement.clientWidth - 32;
  // cellW como float para que N celdas llenen exactamente el espacio disponible
  const totalCellW = Math.max(N * 6, containerW - LABEL_W);
  const cellW = totalCellW / N; // float — posicionamiento exacto sin celdas extra
  const totalH = TOP_PAD + M * ROW_H + GAP;

  const dpr = window.devicePixelRatio || 1;
  const cssW = Math.round(LABEL_W + totalCellW);
  const cssH = totalH;

  // Escalar canvas por devicePixelRatio para pantallas HiDPI/Retina
  canvas.width  = cssW  * dpr;
  canvas.height = cssH  * dpr;
  canvas.style.width  = cssW  + 'px';
  canvas.style.height = cssH  + 'px';

  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr); // todo lo que se dibuje se escala automáticamente
  ctx.clearRect(0, 0, cssW, cssH);

  // Etiquetas semana (cada 4) — centradas sobre su celda
  ctx.font = '9px IBM Plex Sans, Arial, sans-serif';
  ctx.fillStyle = '#89919A';
  ctx.textAlign = 'center';
  for(let i=0; i<N; i+=4) {
    const x = LABEL_W + (i + 0.5) * cellW;
    ctx.fillText(data.labels[i], x, TOP_PAD - 6);
  }

  // Filas
  MODELS.forEach((model, mi) => {
    const y = TOP_PAD + mi * ROW_H;

    // Nombre del modelo (con copa si es el ganador)
    const isWinnerRow = mi === data.winnerIdx;
    const label = (isWinnerRow ? '🏆 ' : '') + model.name;
    ctx.font = (isWinnerRow ? '600' : '500') + ' 10px IBM Plex Sans, Arial, sans-serif';
    ctx.fillStyle = model.color;
    ctx.textAlign = 'right';
    ctx.fillText(label, LABEL_W - 8, y + CELL_H/2 + 3.5);

    // Separador vertical
    ctx.strokeStyle = 'rgba(217,219,221,0.6)';
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(LABEL_W - 2, y);
    ctx.lineTo(LABEL_W - 2, y + CELL_H);
    ctx.stroke();

    // Celdas
    model.zonas.forEach((zona, wi) => {
      const x  = LABEL_W + wi * cellW;
      const x2 = LABEL_W + (wi + 1) * cellW;
      const cw = x2 - x; // ancho exacto de esta celda (puede variar ±1px por float)
      ctx.fillStyle = ALPHA[zona] || '#888';
      const r = Math.min(3, cw/4);
      ctx.beginPath();
      if(ctx.roundRect) {
        ctx.roundRect(x + 0.5, y + 0.5, cw - 1, CELL_H - 1, r);
      } else {
        ctx.rect(x + 0.5, y + 0.5, cw - 1, CELL_H - 1);
      }
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.25)';
      ctx.lineWidth = 0.5;
      ctx.stroke();
    });
  });

  // Línea separadora horizontal entre modelos
  ctx.strokeStyle = 'rgba(217,219,221,0.4)';
  ctx.lineWidth = 0.5;
  for(let mi=1; mi<M; mi++) {
    const y = TOP_PAD + mi * ROW_H - GAP/2;
    ctx.beginPath();
    ctx.moveTo(LABEL_W, y);
    ctx.lineTo(LABEL_W + totalCellW, y);
    ctx.stroke();
  }

  // ── Tooltip al hover ───────────────────────────────────
  function onMove(e) {
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    if(mx < LABEL_W || my < TOP_PAD) { tooltip.style.display='none'; return; }
    const wi = Math.min(N-1, Math.floor((mx - LABEL_W) / cellW));
    const mi = Math.min(M-1, Math.floor((my - TOP_PAD) / ROW_H));
    if(wi < 0 || mi < 0 || mx < LABEL_W || my < TOP_PAD) { tooltip.style.display='none'; return; }
    const model = MODELS[mi];
    const zona  = model.zonas[wi];
    const sem   = data.labels[wi];
    tooltip.style.display = 'block';
    tooltip.style.left = (e.clientX + 12) + 'px';
    tooltip.style.top  = (e.clientY - 10) + 'px';
    tooltip.innerHTML  = `<strong>${sem}</strong> · ${model.name}<br>Zona: <span style="color:${COLORS[zona]};font-weight:600;">${LABELS[zona]}</span>`;
  }
  function onLeave() { tooltip.style.display='none'; }
  // Remove previous listeners to avoid stacking
  canvas._moveHandler && canvas.removeEventListener('mousemove', canvas._moveHandler);
  canvas._leaveHandler && canvas.removeEventListener('mouseleave', canvas._leaveHandler);
  canvas._moveHandler  = onMove;
  canvas._leaveHandler = onLeave;
  canvas.addEventListener('mousemove',  onMove);
  canvas.addEventListener('mouseleave', onLeave);
}

let _activeBuffer = 'ddmrp';

function renderZoneStats(mode) {
  const panel = document.getElementById('zoneStats');
  const head  = document.getElementById('zoneStatsHead');
  const body  = document.getElementById('zoneStatsBody');
  if(!panel || !window._zoneStats) return;
  const {zs1, zs2, zs3, zsd} = window._zoneStats;
  panel.style.display = 'block';

  // Colores por zona
  const Z = {
    roja:     {bg:'#FFF2F2', color:'#BB0000', label:'🔴 Roja'},
    amarilla: {bg:'#FEFBF0', color:'#B8860B', label:'🟡 Amarilla'},
    verde:    {bg:'#F1FAF0', color:'#107E3E', label:'🟢 Verde'},
    sobre:    {bg:'#EBF8FF', color:'#0064D9', label:'🔵 Sobrestock'},
  };

  const wIdx = window._vizData ? window._vizData.winnerIdx : -1;
  // Modelos según modo activo — idx indica posición global (0=M1,1=M2,2=M3,3=DD)
  const models = mode === 'ddmrp'
    ? [{name:'Modo 4 - DDMRP', color:'#107E3E', zs:zsd, idx:3}]
    : mode === 'rop'
    ? [
        {name:'Modo 1 - ROP',           color:'#354A5E', zs:zs1, idx:0},
        {name:'Modo 2 - ROP+Forecast',  color:'#6E2F8F', zs:zs2, idx:1},
        {name:'Modo 3 - ROP Anticipado',color:'#C45E08', zs:zs3, idx:2},
      ]
    : [
        {name:'Modo 1 - ROP',           color:'#354A5E', zs:zs1, idx:0},
        {name:'Modo 2 - ROP+Forecast',  color:'#6E2F8F', zs:zs2, idx:1},
        {name:'Modo 3 - ROP Anticipado',color:'#C45E08', zs:zs3, idx:2},
        {name:'Modo 4 - DDMRP',         color:'#107E3E', zs:zsd, idx:3},
      ];

  // Header
  head.innerHTML = '<tr>' +
    '<th style="background:var(--group);color:var(--t2);padding:4px 8px;text-align:left;border-bottom:2px solid var(--bdr);font-size:10px;">Modelo</th>' +
    Object.entries(Z).map(([k,z]) =>
      `<th style="background:${z.bg};color:${z.color};padding:4px 8px;text-align:center;border-bottom:2px solid var(--bdr);font-size:10px;">${z.label}</th>`
    ).join('') + '</tr>';

  // Rows
  body.innerHTML = models.map(m => {
    const cells = Object.entries(Z).map(([k,z]) => {
      const pct = m.zs[k];
      const pctN = parseInt(pct);
      // Barra visual proporcional
      const bar = `<div style="height:3px;background:${z.color};width:${Math.min(100,pctN)}%;border-radius:2px;margin-top:2px;opacity:0.6;"></div>`;
      return `<td style="padding:4px 8px;text-align:center;border-bottom:1px solid var(--bdr);background:${pctN>0?z.bg:'transparent'};">
        <span style="font-weight:600;color:${pctN>0?z.color:'var(--t3)'};">${pct}%</span>${bar}
      </td>`;
    }).join('');
    return `<tr>
      <td style="padding:4px 8px;border-bottom:1px solid var(--bdr);">
        <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${m.color};margin-right:4px;"></span>
        <span style="font-size:10px;font-weight:600;">${m.idx === wIdx ? '🏆 ' : ''}${m.name}</span>
      </td>${cells}</tr>`;
  }).join('');
}

function toggleBuffer(mode) {
  const ch = charts['chartStock'];
  if(!ch) return;
  _activeBuffer = mode;
  // DDMRP datasets: 0,1,2
  const showDDMRP = mode === 'ddmrp';
  [0,1,2].forEach(i => {
    ch.data.datasets[i].hidden = !showDDMRP;
  });
  // ROP datasets: 3,4,5
  const showROP = mode === 'rop';
  [3,4,5].forEach(i => {
    ch.data.datasets[i].hidden = !showROP;
  });
  ch.update();
  renderZoneStats(mode);
  // Actualizar botones
  const btnStyles = {
    ddmrp: {id:'btnBufDD',    bg:'#107E3E', color:'#fff', border:'#107E3E'},
    rop:   {id:'btnBufROP',   bg:'#C45E08', color:'#fff', border:'#C45E08'},
    none:  {id:'btnBufNone',  bg:'var(--shell)', color:'#fff', border:'var(--shell)'},
  };
  ['btnBufDD','btnBufROP','btnBufNone'].forEach(id => {
    const btn = document.getElementById(id);
    if(!btn) return;
    btn.style.background = 'var(--group)';
    btn.style.color = 'var(--t2)';
    btn.style.borderColor = 'var(--bdr)';
  });
  const active = btnStyles[mode];
  if(active) {
    const btn = document.getElementById(active.id);
    if(btn){ btn.style.background=active.bg; btn.style.color=active.color; btn.style.borderColor=active.border; }
  }
  // Actualizar leyenda
  if(mode==='ddmrp') {
    buildLegend('stockLegend',[
      ['Venta histórica','rgba(136,135,128,0.7)'],['Venta real',COLORS.demand],
      ['Modo 1 - ROP',COLORS.m1],['Modo 2 - ROP+Forecast',COLORS.m2],
      ['Modo 3 - ROP Anticipado',COLORS.m3],['Modo 4 - DDMRP',COLORS.ddmrp],
      ['DDMRP Zona Roja','rgba(220,38,38,0.6)'],
      ['DDMRP Zona Amarilla','rgba(184,134,11,0.7)'],
      ['DDMRP Zona Verde','rgba(16,126,62,0.6)'],
    ]);
  } else if(mode==='rop') {
    buildLegend('stockLegend',[
      ['Venta histórica','rgba(136,135,128,0.7)'],['Venta real',COLORS.demand],
      ['Modo 1 - ROP',COLORS.m1],['Modo 2 - ROP+Forecast',COLORS.m2],
      ['Modo 3 - ROP Anticipado',COLORS.m3],['Modo 4 - DDMRP',COLORS.ddmrp],
      ['Stock Máx (zona verde)','rgba(16,126,62,0.6)'],
      ['ROP (zona amarilla)','rgba(184,134,11,0.7)'],
      ['Safety Stock (zona roja)','rgba(220,38,38,0.6)'],
    ]);
  } else {
    buildLegend('stockLegend',[
      ['Venta histórica','rgba(136,135,128,0.7)'],['Venta real',COLORS.demand],
      ['Modo 1 - ROP',COLORS.m1],['Modo 2 - ROP+Forecast',COLORS.m2],
      ['Modo 3 - ROP Anticipado',COLORS.m3],['Modo 4 - DDMRP',COLORS.ddmrp],
    ]);
  }
}

// ─── SIMULACIÓN EN VIVO ──────────────────────────────────
let _liveState = null; // {precomp, week, paused, timer}

function runLive() {

  // Usar datos ya calculados — NO recalcula
  const detail = window._simDetail;
  if(!detail || !detail.length) {
    alert('Primero ejecuta la simulación con ▶ Ejecutar');
    return;
  }
  if(_liveState && !_liveState.paused) return; // ya corriendo
  if(_liveState && _liveState.paused) { pauseLive(); return; } // reanudar

  // Mostrar secciones
  ['gaugesCard','radarCard','resultsCard','ddmrpCard','chartsSection','heatmapCard','detailCard'].forEach(id=>{
    document.getElementById(id).style.display='block';
  });

  // Controles
  document.getElementById('liveControls').style.display='flex';
  document.getElementById('btnLive').style.display='none';

  // Solo 52 semanas de juego
  const liveLabels = detail.map(d=>`S${d.w}`);

  // Inicializar chart con mismo orden de datasets que runSim:
  // 0:DDVerde 1:DDAmarilla 2:DDRoja 3:StockMáx(h) 4:ROP(h) 5:SS(h)
  // 6:VentaHist 7:VentaReal 8:M1 9:M2 10:M3 11:M4
  if(charts['chartStock']) charts['chartStock'].destroy();
  charts['chartStock'] = new Chart(document.getElementById('chartStock'), {
    data: { labels: liveLabels, datasets: [
      // 0: DDMRP Zona Verde
      {type:'line', label:'DDMRP Zona Verde (tope)', data:Array(52).fill(null),
       borderColor:'transparent', borderWidth:0, backgroundColor:'rgba(16,126,62,0.10)',
       fill:{target:'+1'}, pointRadius:0, pointHoverRadius:0, order:5},
      // 1: DDMRP Zona Amarilla
      {type:'line', label:'DDMRP Zona Amarilla', data:Array(52).fill(null),
       borderColor:'rgba(184,134,11,0.4)', borderWidth:0.5, borderDash:[3,3],
       backgroundColor:'rgba(233,183,12,0.12)', fill:{target:'+1'}, pointRadius:0, pointHoverRadius:0, order:5},
      // 2: DDMRP Zona Roja
      {type:'line', label:'DDMRP Zona Roja', data:Array(52).fill(null),
       borderColor:'rgba(187,0,0,0.5)', borderWidth:0.8, borderDash:[3,3],
       backgroundColor:'rgba(220,38,38,0.09)', fill:'origin', pointRadius:0, pointHoverRadius:0, order:5},
      // 3: Stock Máx (oculto)
      {type:'line', label:'Stock Máx (M1/2/3)', data:Array(52).fill(null), hidden:true,
       borderColor:'transparent', borderWidth:0, backgroundColor:'rgba(16,126,62,0.10)',
       fill:{target:'+1'}, pointRadius:0, pointHoverRadius:0, order:5},
      // 4: ROP (oculto)
      {type:'line', label:'ROP (M1/2/3)', data:Array(52).fill(null), hidden:true,
       borderColor:'rgba(184,134,11,0.4)', borderWidth:0.5, borderDash:[3,3],
       backgroundColor:'rgba(233,183,12,0.12)', fill:{target:'+1'}, pointRadius:0, pointHoverRadius:0, order:5},
      // 5: SS (oculto)
      {type:'line', label:'SS (M1/2/3)', data:Array(52).fill(null), hidden:true,
       borderColor:'rgba(187,0,0,0.5)', borderWidth:0.8, borderDash:[3,3],
       backgroundColor:'rgba(220,38,38,0.07)', fill:'origin', pointRadius:0, pointHoverRadius:0, order:5},
      // 6 → ahora es Venta real directamente (sin historial)
      // (índice mantenido para compatibilidad con _tickLive)
      {type:'bar', label:'Venta histórica', data:Array(52).fill(null),
       backgroundColor:'rgba(136,135,128,0)', borderWidth:0, order:3},
      // 7: Venta real (se va llenando)
      {type:'bar', label:'Venta real',
       data:Array(52).fill(null),
       backgroundColor:'rgba(0,100,217,0.22)', borderColor:'rgba(0,100,217,0.45)',
       borderWidth:0.5, barPercentage:0.9, categoryPercentage:0.95, order:3},
      // 8-11: Líneas stock (se van llenando)
      {type:'line', label:'Modo 1 - ROP', data:Array(52).fill(null),
       borderColor:COLORS.m1, borderWidth:2, fill:false, pointRadius:0, pointHoverRadius:4, order:1},
      {type:'line', label:'Modo 2 - ROP+Forecast', data:Array(52).fill(null),
       borderColor:COLORS.m2, borderWidth:2, fill:false, pointRadius:0, pointHoverRadius:4, order:1},
      {type:'line', label:'Modo 3 - ROP Anticipado', data:Array(52).fill(null),
       borderColor:COLORS.m3, borderWidth:2, fill:false, pointRadius:0, pointHoverRadius:4, order:1},
      {type:'line', label:'Modo 4 - DDMRP', data:Array(52).fill(null),
       borderColor:COLORS.ddmrp, borderWidth:2.5, fill:false, pointRadius:0, pointHoverRadius:4, order:1},
    ]},
    options:{
      responsive:true, maintainAspectRatio:false,
      animation:{duration:0}, // sin animación para fluidez
      interaction:{mode:'index', intersect:false},
      plugins:{legend:{display:false},
        tooltip:{backgroundColor:'rgba(53,74,94,0.95)', titleColor:'#fff',
          bodyColor:'rgba(255,255,255,0.85)', padding:10, cornerRadius:4,
          callbacks:{
            title: ctx => ctx[0].label,
            label: ctx => {
              const skip=['DDMRP Zona Verde (tope)','DDMRP Zona Amarilla','DDMRP Zona Roja'];
              if(skip.includes(ctx.dataset.label)) return null;
              return ` ${ctx.dataset.label}: ${ctx.parsed.y !== null ? fmtN(ctx.parsed.y) : '—'} un`;
            }
          }
        }
      },
      scales:{
        x:{ticks:{font:{size:10},maxTicksLimit:16},grid:{color:'rgba(0,0,0,0.04)'}},
        y:{beginAtZero:true,title:{display:true,text:'un',font:{size:10}},grid:{color:'rgba(0,0,0,0.04)'}}
      }
    }
  });

  // Sincronizar selector de zonas con el nuevo chart
  _activeBuffer = 'ddmrp'; // reset al estado por defecto
  // Estado de la animación
  _liveState = {detail, week: 0, paused: false, timer: null};
  _tickLive();
}

function _speedMs() {
  // Velocidad: slider 1-5 → ms por semana (30s/52 ≈ 577ms base)
  const v = +document.getElementById('liveSpeed').value;
  const speeds = {1:1200, 2:800, 3:500, 4:250, 5:100};
  return speeds[v] || 500;
}

function _tickLive() {
  const st = _liveState;
  if(!st || st.paused) return;
  if(st.week >= 52) { _finishLive(); return; }

  const w   = st.week;
  const row = st.detail[w];
  const ch  = charts['chartStock'];

  // Actualizar dataset del chart (posición w+26 porque hay 26 de historia)
  const idx = w; // índice directo — sin historia en este chart
  if(ch) {
    // índices alineados con runSim: 0=DDVerde 1=DDAm 2=DDRoja 3=SMáx(h) 4=ROP(h) 5=SS(h)
    // 6=VentaHist 7=VentaReal 8=M1 9=M2 10=M3 11=M4
    ch.data.datasets[0].data[idx] = row.rd.top_green;  // DDMRP zona verde
    ch.data.datasets[1].data[idx] = row.rd.top_yellow; // DDMRP zona amarilla
    ch.data.datasets[2].data[idx] = row.rd.top_red;    // DDMRP zona roja
    ch.data.datasets[3].data[idx] = row.sh_smax;       // Stock Máx
    ch.data.datasets[4].data[idx] = row.sh_mc.rop;     // ROP
    ch.data.datasets[5].data[idx] = row.sh_mc.ss;      // SS
    ch.data.datasets[7].data[idx] = row.dem;           // venta real (idx 7)
    ch.data.datasets[8].data[idx]  = row.r1.stock;     // M1
    ch.data.datasets[9].data[idx]  = row.r2.stock;     // M2
    ch.data.datasets[10].data[idx] = row.r3.stock;     // M3
    ch.data.datasets[11].data[idx] = row.rd.stock;     // M4
    ch.update('none');
  }

  // Etiqueta de semana
  document.getElementById('liveWeekLabel').textContent = `S${w+1}/52`;

  st.week++;
  st.timer = setTimeout(_tickLive, _speedMs());
}

function pauseLive() {
  const st = _liveState;
  if(!st) return;
  const btn = document.getElementById('btnPause');
  if(st.paused) {
    st.paused = false;
    btn.textContent = '⏸';
    btn.style.color = '#107E3E';
    btn.style.borderColor = '#107E3E';
    _tickLive();
  } else {
    st.paused = true;
    clearTimeout(st.timer);
    btn.textContent = '▶';
    btn.style.color = '#C45E08';
    btn.style.borderColor = '#C45E08';
  }
}

function stopLive() {
  if(_liveState) { clearTimeout(_liveState.timer); _liveState = null; }
  document.getElementById('liveControls').style.display = 'none';
  document.getElementById('btnLive').style.display = '';
  document.getElementById('liveWeekLabel').textContent = '';
}

function _finishLive() {
  stopLive();
  document.getElementById('liveWeekLabel').textContent = '✓ S52';
  // runSim ya se ejecutó al inicio de runLive — todos los datos están listos
  // Solo necesitamos redibujar el chartStock correcto y los demás gráficos
  if(charts['chartStock']) { charts['chartStock'].destroy(); delete charts['chartStock']; }
  // Re-ejecutar runSim para reconstruir todos los charts correctamente
  runSim();
}

function toggleParams() {
  const body = document.getElementById('params-body');
  const icon = document.getElementById('params-toggle-icon');
  const hidden = body.style.display === 'none';
  body.style.display = hidden ? '' : 'none';
  icon.textContent = hidden ? '▲ ocultar' : '▼ mostrar';
}
