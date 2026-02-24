// scouting.js — Push Back Scout (VEX V5RC 2025-26)
// Scoring per official game manual v3.0
// ─────────────────────────────────────────────────────────────────────────────

// ── Storage keys ──────────────────────────────────────────────────────────────
const KEY_COMPS   = 'pb_comps';
const KEY_DATA    = 'pb_scout_data';
const KEY_PREFS   = 'pb_prefs';
const KEY_WEIGHTS = 'pb_weights';

// ── Scoring constants (game manual v3.0) ──────────────────────────────────────
const PTS_BLOCK          = 3;
const PTS_LONG_ZONE      = 10;
const PTS_CENTER_UPPER   = 8;
const PTS_CENTER_LOWER   = 6;
const PTS_AUTO_BONUS     = 10;
const PTS_PARK_ONE       = 8;
const PTS_PARK_BOTH      = 30;

// ── Ranking formula defaults ───────────────────────────────────────────────────
const DEFAULT_WEIGHTS = {
  avgCalcPoints:   { label: 'Avg Calculated Points',  v: 1.0, max: 2.0 },
  avgDriverBalls:  { label: 'Avg Blocks Scored',       v: 0.8, max: 2.0 },
  awpRate:         { label: 'AWP Rate',                v: 0.6, max: 2.0 },
  autoReliability: { label: 'Auto Reliability',        v: 0.7, max: 2.0 },
  driverSkill:     { label: 'Driver Skill',            v: 0.8, max: 2.0 },
  consistency:     { label: 'Consistency',             v: 0.7, max: 2.0 },
  coordination:    { label: 'Partner Coordination',    v: 0.5, max: 2.0 },
  winRate:         { label: 'Win Rate',                v: 0.7, max: 2.0 },
  descoringAvg:    { label: 'Avg Descoring',           v: 0.4, max: 2.0 },
  penaltyAvoid:    { label: 'Penalty Avoidance',       v: 0.4, max: 2.0 },
  draftPriority:   { label: 'Draft Priority',          v: 0.5, max: 2.0 },
};

// ── Waypoint styles ───────────────────────────────────────────────────────────
const WP_STYLES = {
  score:   { color: '#60a5fa', bg: '#1e3a5f', label: 'S', name: 'Score'   },
  intake:  { color: '#fcd34d', bg: '#78350f', label: 'I', name: 'Intake'  },
  descore: { color: '#fb923c', bg: '#7c2d12', label: 'D', name: 'Descore' },
  fail:    { color: '#f87171', bg: '#7f1d1d', label: 'F', name: 'Failed'  },
};

// ── App state ─────────────────────────────────────────────────────────────────
let activeCompId  = null;
let wizardStep    = 1;
const WSTEPS      = 4;
let wizardEntry   = {};
let compareTeams  = [];
let chartInstances = {};

// Auto route state
let autoRouteData = { path: [], waypoints: [] };
let routeDrawing  = false;
let routeTool     = 'path';
let autoCanvasCtx = null;
let autoCanvasEl  = null;

// Ranking weights (mutable copy)
let rankWeights = null;

// ── Storage helpers ───────────────────────────────────────────────────────────
const getComps   = () => JSON.parse(localStorage.getItem(KEY_COMPS)   || '[]');
const getData    = () => JSON.parse(localStorage.getItem(KEY_DATA)    || '[]');
const getPrefs   = () => JSON.parse(localStorage.getItem(KEY_PREFS)   || '{}');
const getRawW    = () => JSON.parse(localStorage.getItem(KEY_WEIGHTS) || 'null');
const saveComps  = d => localStorage.setItem(KEY_COMPS,  JSON.stringify(d));
const saveData   = d => localStorage.setItem(KEY_DATA,   JSON.stringify(d));
const savePrefs  = d => localStorage.setItem(KEY_PREFS,  JSON.stringify(d));
const saveWeights= d => localStorage.setItem(KEY_WEIGHTS,JSON.stringify(d));

function loadWeights() {
  const stored = getRawW();
  rankWeights = {};
  Object.entries(DEFAULT_WEIGHTS).forEach(([k, def]) => {
    rankWeights[k] = stored ? (stored[k] ?? def.v) : def.v;
  });
}

function addEntry(entry) {
  const data = getData();
  const idx  = data.findIndex(e =>
    e.compId === entry.compId &&
    e.teamNumber === entry.teamNumber &&
    e.matchNumber === entry.matchNumber &&
    e.matchType === entry.matchType);
  if (idx >= 0) data[idx] = entry; else data.push(entry);
  saveData(data);
}
function deleteEntry(id) { saveData(getData().filter(e => e.id !== id)); }
function genId() { return Date.now().toString(36) + Math.random().toString(36).slice(2,6); }

// ── Points calculation (game manual v3.0) ──────────────────────────────────────
function calculatePoints(entry) {
  const blocks    = (entry.autoBalls || 0) + (entry.driverBalls || 0);
  const blockPts  = blocks * PTS_BLOCK;
  const longZone  = (entry.longZonesControlled || 0) * PTS_LONG_ZONE;
  const cUpper    = entry.centerUpperControlled ? PTS_CENTER_UPPER : 0;
  const cLower    = entry.centerLowerControlled ? PTS_CENTER_LOWER : 0;
  const autoBonus = entry.autoBonus ? PTS_AUTO_BONUS : 0;
  const park      = entry.parking === 'both' ? PTS_PARK_BOTH
                  : entry.parking === 'single' ? PTS_PARK_ONE : 0;
  return blockPts + longZone + cUpper + cLower + autoBonus + park;
}

function pointsBreakdown(entry) {
  return {
    blocks:  (entry.autoBalls||0 + entry.driverBalls||0) * PTS_BLOCK,
    zones:   (entry.longZonesControlled||0)*PTS_LONG_ZONE + (entry.centerUpperControlled?PTS_CENTER_UPPER:0) + (entry.centerLowerControlled?PTS_CENTER_LOWER:0),
    auto:    entry.autoBonus ? PTS_AUTO_BONUS : 0,
    park:    entry.parking === 'both' ? PTS_PARK_BOTH : entry.parking === 'single' ? PTS_PARK_ONE : 0,
  };
}

// ── View management ───────────────────────────────────────────────────────────
function showView(name) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));

  const view = document.getElementById(`view-${name}`);
  if (view) view.classList.add('active');
  const order = ['home','scout','teams','compare','rankings'];
  const btnIdx = order.indexOf(name);
  document.querySelectorAll('.nav-link')[btnIdx]?.classList.add('active');

  if (name === 'home')     renderHome();
  if (name === 'scout')    initWizard();
  if (name === 'teams')    renderTeams();
  if (name === 'compare')  renderCompare();
  if (name === 'rankings') renderRankings();
}

// ── Competition management ────────────────────────────────────────────────────
function setActiveComp(id) {
  activeCompId = id || null;
  const prefs = getPrefs(); prefs.lastComp = id; savePrefs(prefs);
  updateCompSelectors();
  renderHome();
}

function updateCompSelectors() {
  const comps = getComps();
  const baseOpts = comps.map(c =>
    `<option value="${c.id}" ${c.id === activeCompId ? 'selected':''}>${c.name}</option>`).join('');
  const selEl = document.getElementById('compSelect');
  if (selEl) selEl.innerHTML = `<option value="">— No Competition —</option>${baseOpts}`;
  const filterEl = document.getElementById('teamCompFilter');
  if (filterEl) filterEl.innerHTML = `<option value="">All Competitions</option>` +
    comps.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
}

function submitAddComp() {
  const name = document.getElementById('newCompName').value.trim();
  if (!name) { showToast('Enter a competition name.', 'error'); return; }
  const comp = { id: genId(), name,
    date: document.getElementById('newCompDate').value,
    location: document.getElementById('newCompLocation').value.trim() };
  const comps = getComps(); comps.push(comp); saveComps(comps);
  activeCompId = comp.id;
  savePrefs({ ...getPrefs(), lastComp: comp.id });
  closeModal('addComp');
  updateCompSelectors();
  renderHome();
  showToast(`✓ "${comp.name}" created.`, 'success');
  ['newCompName','newCompDate','newCompLocation'].forEach(id => { document.getElementById(id).value = ''; });
}

// ── HOME VIEW ─────────────────────────────────────────────────────────────────
function renderHome() {
  const comps    = getComps();
  const comp     = comps.find(c => c.id === activeCompId);
  const data     = getData();
  const compData = activeCompId ? data.filter(e => e.compId === activeCompId) : data;

  document.getElementById('homeTitle').textContent     = comp ? comp.name : 'Dashboard';
  document.getElementById('homeSubtitle').textContent  = comp
    ? `${comp.date ? fmtDate(comp.date) + ' · ' : ''}${comp.location || 'No location'}`
    : 'Select or add a competition to start scouting.';

  const teams     = [...new Set(compData.map(e => e.teamNumber))];
  const wins      = compData.filter(e => e.outcome === 'win').length;
  const avgBalls  = compData.length
    ? (compData.reduce((s,e) => s+(e.autoBalls||0)+(e.driverBalls||0),0)/compData.length).toFixed(1) : '—';
  const awpRate   = compData.length
    ? Math.round(compData.filter(e=>e.awp).length/compData.length*100)+'%' : '—';
  const avgPts    = compData.length
    ? (compData.reduce((s,e)=>s+calculatePoints(e),0)/compData.length).toFixed(0) : '—';

  document.getElementById('homeStats').innerHTML = `
    <div class="stat-card"><div class="stat-label">Teams Scouted</div><div class="stat-value">${teams.length}</div><div class="stat-sub">${comps.length} comp${comps.length!==1?'s':''}</div></div>
    <div class="stat-card"><div class="stat-label">Matches Logged</div><div class="stat-value">${compData.length}</div><div class="stat-sub">${data.length} all-time</div></div>
    <div class="stat-card"><div class="stat-label">Avg Score</div><div class="stat-value">${avgPts}</div><div class="stat-sub">calculated pts</div></div>
    <div class="stat-card"><div class="stat-label">Wins Recorded</div><div class="stat-value">${wins}</div><div class="stat-sub">${compData.length?Math.round(wins/compData.length*100)+'% win rate':'—'}</div></div>
    <div class="stat-card"><div class="stat-label">Avg Blocks</div><div class="stat-value">${avgBalls}</div><div class="stat-sub">auto + driver</div></div>
    <div class="stat-card"><div class="stat-label">AWP Rate</div><div class="stat-value">${awpRate}</div><div class="stat-sub">auto win point</div></div>`;

  const recent = [...compData].sort((a,b)=>b.createdAt-a.createdAt).slice(0,8);
  document.getElementById('homeRecent').innerHTML = !compData.length
    ? `<div class="empty-state"><div class="empty-icon">📋</div><p>No data yet. Click <strong>Scout Match</strong> to start.</p></div>`
    : `<div class="section-title" style="margin-bottom:10px;">Recent Entries</div>
       <div class="card" style="padding:0;overflow:auto;">
         <table class="match-history-table"><thead><tr>
           <th>Team</th><th>Match</th><th>Alliance</th><th>Blocks</th><th>Calc Pts</th><th>AWP</th><th>Rating</th><th>Outcome</th><th></th>
         </tr></thead>
         <tbody>${recent.map(e=>`<tr>
           <td><strong>${e.teamNumber}</strong>${e.botType?` <span class="badge badge-purple" style="font-size:9px">${e.botType}</span>`:''}</td>
           <td>${e.matchType==='qual'?'Q':e.matchType==='elim'?'E':'P'}${e.matchNumber}</td>
           <td><span class="alliance-pill ${e.alliance}">${e.alliance}</span></td>
           <td class="mono">${(e.autoBalls||0)+(e.driverBalls||0)}</td>
           <td class="mono" style="color:var(--purple-l)">${calculatePoints(e)}</td>
           <td>${e.awp?'<span style="color:var(--green)">✓</span>':'—'}</td>
           <td>${renderStarsMini(e.overallRating)}</td>
           <td><span class="outcome-pill ${e.outcome||'tie'}">${e.outcome||'—'}</span></td>
           <td><button class="btn btn-icon btn-ghost btn-sm" onclick="confirmDelete('${e.id}')">✕</button></td>
         </tr>`).join('')}</tbody></table>
       </div>`;
}

function renderStarsMini(n) {
  if (!n) return '<span class="text-muted">—</span>';
  return `<span style="color:var(--yellow)">${'★'.repeat(n)}</span><span style="opacity:.2">${'★'.repeat(5-n)}</span>`;
}

// ── SCOUT WIZARD ──────────────────────────────────────────────────────────────
const STEP_LABELS = ['Match Setup','Autonomous','Driver Control','Assessment'];

function initWizard() {
  wizardStep       = 1;
  wizardEntry      = {};
  autoRouteData    = { path: [], waypoints: [] };
  routeTool        = 'path';
  tagValues.strengths = new Set();
  tagValues.concerns  = new Set();
  Object.keys(toggleValues).forEach(k => delete toggleValues[k]);
  Object.keys(starValues).forEach(k   => delete starValues[k]);
  Object.entries(stepperFields).forEach(([k]) => { stepperFields[k] = k==='matchNumber'?1:0; });
  renderWizard();
}

function renderWizard() {
  document.getElementById('progressFill').style.width = (wizardStep/WSTEPS*100)+'%';
  document.getElementById('stepIndicators').innerHTML = STEP_LABELS.map((lbl,i) => {
    const n = i+1, cls = n<wizardStep?'done':n===wizardStep?'active':'';
    return `<div class="step-dot ${cls}"><div class="step-dot-circle">${n<wizardStep?'✓':n}</div><span>${lbl}</span></div>`;
  }).join('');
  document.getElementById('wizardStepLabel').textContent = `Step ${wizardStep} of ${WSTEPS}`;
  document.getElementById('btnPrev').style.visibility = wizardStep===1?'hidden':'visible';
  document.getElementById('btnNext').textContent = wizardStep===WSTEPS?'✓ Submit':'Next →';
  document.getElementById('wizardSteps').innerHTML = buildStepHTML(wizardStep);
  restoreStepValues();
  if (wizardStep === 2) setTimeout(() => initAutoCanvas(), 60);
}

// ── Step HTML builders ────────────────────────────────────────────────────────
function mkToggle(field, vals, labels, _defaultVal) {
  return vals.map((v,i) =>
    `<button class="toggle-btn" onclick="toggleSelect('${field}','${v}',this)"
     data-field="${field}" data-val="${v}">${labels[i]}</button>`).join('');
}
function mkStars(field, defaultVal, max=5) {
  return Array.from({length:max},(_,i) =>
    `<button class="star-btn ${i<defaultVal?'lit':''}" data-field="${field}" data-val="${i+1}"
     onclick="setStar('${field}',${i+1})">★</button>`).join('');
}

function buildStepHTML(step) {
  const comps = getComps();

  // ── STEP 1: Match Setup ──────────────────────────────────────────────────────
  if (step === 1) return `
    <div class="wizard-card">
      <h2>Match Setup</h2>
      <p class="wizard-sub">Competition, team, and match details.</p>
      <div class="grid-2">
        <div class="form-group">
          <label class="form-label">Team Number *</label>
          <input class="form-input" id="f_teamNumber" placeholder="e.g. 1234A" autocomplete="off">
        </div>
        <div class="form-group">
          <label class="form-label">Match Number *</label>
          <div class="stepper">
            <button class="stepper-btn" onclick="stepDec('matchNumber',1,200)">−</button>
            <span class="stepper-val" id="val-matchNumber">1</span>
            <button class="stepper-btn" onclick="stepInc('matchNumber',1,200)">+</button>
          </div>
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Match Type</label>
        <div class="toggle-group" id="f_matchType">
          ${mkToggle('matchType',['qual','practice','elim','semifinal','final'],['Qualification','Practice','Elimination','Semifinal','Final'],'qual')}
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Alliance</label>
        <div class="toggle-group" id="f_alliance">
          <button class="toggle-btn red"  data-field="alliance" data-val="red"  onclick="toggleSelect('alliance','red',this)">🔴 Red</button>
          <button class="toggle-btn blue" data-field="alliance" data-val="blue" onclick="toggleSelect('alliance','blue',this)">🔵 Blue</button>
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Bot Type</label>
        <div class="toggle-group" id="f_botType" style="flex-wrap:wrap">
          <button class="toggle-btn" data-field="botType" data-val="S-Bot"      onclick="toggleSelect('botType','S-Bot',this);showBotOther(false)">S-Bot</button>
          <button class="toggle-btn" data-field="botType" data-val="Ruiguan"    onclick="toggleSelect('botType','Ruiguan',this);showBotOther(false)">Ruiguan Bot</button>
          <button class="toggle-btn" data-field="botType" data-val="Lever"      onclick="toggleSelect('botType','Lever',this);showBotOther(false)">Lever Bot</button>
          <button class="toggle-btn" data-field="botType" data-val="other"      onclick="toggleSelect('botType','other',this);showBotOther(true)">Other…</button>
        </div>
        <div id="botTypeOtherWrap" style="display:none;margin-top:8px;">
          <input class="form-input" id="f_botTypeOther" placeholder="Describe bot type…">
        </div>
        <p class="form-hint">S-Bot = horizontal/side-intake, Ruiguan = Liangqiu-style, Lever = catapult/tilter</p>
      </div>
      <div class="form-group">
        <label class="form-label">Competition</label>
        <select class="form-input" id="f_compId">
          ${comps.map(c=>`<option value="${c.id}" ${c.id===activeCompId?'selected':''}>${c.name}</option>`).join('')||'<option value="">Add a competition first</option>'}
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Scouted By</label>
        <input class="form-input" id="f_scoutedBy" placeholder="Your name">
      </div>
    </div>`;

  // ── STEP 2: Autonomous ───────────────────────────────────────────────────────
  if (step === 2) return `
    <div class="wizard-card">
      <h2>Autonomous Period <span style="font-size:12px;color:var(--text2);font-weight:400">(15 seconds)</span></h2>
      <p class="wizard-sub">No driver input — robot runs programmed routine.</p>
      <div class="form-group">
        <label class="form-label">AWP (Autonomous Win Point) Conditions Met?</label>
        <div class="toggle-group" id="f_awp">
          ${mkToggle('awp',['true','partial','false','unknown'],['✓ Yes','Partial','✗ No','Unknown'],'unknown')}
        </div>
        <p class="form-hint">AWP: ≥7 blocks scored, ≥3 goals used, ≥3 loader blocks removed, neither robot in park zone.</p>
      </div>
      <div class="form-group">
        <label class="form-label">Won Auto Period (Auto Bonus +10 pts)?</label>
        <div class="toggle-group" id="f_autoBonus">
          ${mkToggle('autoBonus',['true','false','unknown'],['✓ Won (+10)','✗ Lost','Unknown'],'unknown')}
        </div>
      </div>
      <div class="grid-2">
        <div class="form-group">
          <label class="form-label">Blocks Scored in Auto</label>
          <div class="stepper">
            <button class="stepper-btn" onclick="stepDec('autoBalls',0,44)">−</button>
            <span class="stepper-val" id="val-autoBalls">0</span>
            <button class="stepper-btn" onclick="stepInc('autoBalls',0,44)">+</button>
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Goals Used (≥1 block)</label>
          <div class="stepper">
            <button class="stepper-btn" onclick="stepDec('autoGoalsUsed',0,4)">−</button>
            <span class="stepper-val" id="val-autoGoalsUsed">0</span>
            <button class="stepper-btn" onclick="stepInc('autoGoalsUsed',0,4)">+</button>
          </div>
          <p class="form-hint">4 goals total (2 long, 2 center)</p>
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Crossed Center Barrier?</label>
        <div class="toggle-group" id="f_crossedCenter">
          ${mkToggle('crossedCenter',['true','false'],['Yes','No'],'false')}
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Auto Routine Type</label>
        <div class="toggle-group" id="f_autoRoutine">
          ${mkToggle('autoRoutine',['none','simple','complex','full'],['None','Simple','Complex','Full'],'simple')}
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Auto Reliability</label>
        <div class="star-group" id="f_autoReliability" data-field="autoReliability">${mkStars('autoReliability',3)}</div>
        <p class="form-hint">1=Crashed · 3=Usually works · 5=Flawless every time</p>
      </div>

      <div class="divider"></div>
      <div class="form-group">
        <label class="form-label">Autonomous Route Map</label>
        <div class="route-toolbar" id="routeToolbar">
          <button class="route-tool active" id="tool-path"    onclick="setRouteTool('path',this)">✏️ Draw Path</button>
          <button class="route-tool score"  id="tool-score"   onclick="setRouteTool('score',this)">■ Score</button>
          <button class="route-tool intake" id="tool-intake"  onclick="setRouteTool('intake',this)">● Intake</button>
          <button class="route-tool descore" id="tool-descore" onclick="setRouteTool('descore',this)">◐ Descore</button>
          <button class="route-tool fail"   id="tool-fail"    onclick="setRouteTool('fail',this)">✕ Failed</button>
          <button class="route-tool" style="margin-left:auto" onclick="clearAutoRoute()">↺ Clear</button>
        </div>
        <div class="route-canvas-wrap" id="routeCanvasWrap">
          <canvas id="autoRouteCanvas" width="360" height="340"></canvas>
        </div>
        <div class="waypoint-legend">
          <div class="wl-item"><div class="wl-dot" style="background:#60a5fa"></div>Score block</div>
          <div class="wl-item"><div class="wl-dot" style="background:#fcd34d"></div>Intake</div>
          <div class="wl-item"><div class="wl-dot" style="background:#fb923c"></div>Descore</div>
          <div class="wl-item"><div class="wl-dot" style="background:#f87171"></div>Failed action</div>
        </div>
        <p class="form-hint">In Draw mode: click+drag to trace path. In marker modes: click field to place waypoints. Drag waypoints to reposition.</p>
      </div>
      <div class="form-group">
        <label class="form-label">Auto Notes</label>
        <textarea class="form-input" id="f_autoNotes" placeholder="Describe what the robot did in auto…"></textarea>
      </div>
    </div>`;

  // ── STEP 3: Driver Control ───────────────────────────────────────────────────
  if (step === 3) return `
    <div class="wizard-card">
      <h2>Driver Control Period <span style="font-size:12px;color:var(--text2);font-weight:400">(1:45)</span></h2>
      <p class="wizard-sub">Driver-operated phase scoring and performance.</p>
      <div class="grid-2">
        <div class="form-group">
          <label class="form-label">Blocks Scored (own goals)</label>
          <div class="stepper">
            <button class="stepper-btn" onclick="stepDec('driverBalls',0,88)">−</button>
            <span class="stepper-val" id="val-driverBalls">0</span>
            <button class="stepper-btn" onclick="stepInc('driverBalls',0,88)">+</button>
          </div>
          <p class="form-hint">×3 pts each</p>
        </div>
        <div class="form-group">
          <label class="form-label">Blocks Descored (opponent)</label>
          <div class="stepper">
            <button class="stepper-btn" onclick="stepDec('descored',0,44)">−</button>
            <span class="stepper-val" id="val-descored">0</span>
            <button class="stepper-btn" onclick="stepInc('descored',0,44)">+</button>
          </div>
          <p class="form-hint">Removed from opponent goals</p>
        </div>
      </div>
      <div class="grid-2">
        <div class="form-group">
          <label class="form-label">Blocks Defended Back</label>
          <div class="stepper">
            <button class="stepper-btn" onclick="stepDec('ballsDefended',0,44)">−</button>
            <span class="stepper-val" id="val-ballsDefended">0</span>
            <button class="stepper-btn" onclick="stepInc('ballsDefended',0,44)">+</button>
          </div>
          <p class="form-hint">Pushed back to their side</p>
        </div>
        <div class="form-group">
          <label class="form-label">Penalties / Fouls</label>
          <div class="stepper">
            <button class="stepper-btn" onclick="stepDec('penalties',0,10)">−</button>
            <span class="stepper-val" id="val-penalties">0</span>
            <button class="stepper-btn" onclick="stepInc('penalties',0,10)">+</button>
          </div>
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Driver Skill</label>
        <div class="star-group" id="f_driverSkill">${mkStars('driverSkill',3)}</div>
      </div>
      <div class="form-group">
        <label class="form-label">Consistency / Accuracy</label>
        <div class="star-group" id="f_consistency">${mkStars('consistency',3)}</div>
      </div>
      <div class="form-group">
        <label class="form-label">Partner Coordination</label>
        <div class="star-group" id="f_coordination">${mkStars('coordination',3)}</div>
      </div>
      <div class="form-group">
        <label class="form-label">Play Style</label>
        <div class="toggle-group" id="f_playStyle">
          ${mkToggle('playStyle',['aggressive','balanced','defensive','strategic'],['Aggressive Push','Balanced','Defensive','Strategic'],'balanced')}
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Robot Disabled?</label>
        <div class="toggle-group" id="f_disabled">
          ${mkToggle('disabled',['no','briefly','fully'],['No','Briefly','Fully'],'no')}
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Descoring Strategy Notes</label>
        <textarea class="form-input" id="f_descoringNotes" placeholder="How did they descore? Did they target specific goals? Did they also replace with own blocks? Any disruption tactics?"></textarea>
      </div>
    </div>`;

  // ── STEP 4: Assessment ───────────────────────────────────────────────────────
  if (step === 4) return `
    <div class="wizard-card">
      <h2>Assessment &amp; Match Outcome</h2>
      <p class="wizard-sub">End-game scoring, control zones, and overall evaluation.</p>

      <div class="form-group">
        <label class="form-label">Match Outcome</label>
        <div class="toggle-group" id="f_outcome">
          <button class="toggle-btn green"  data-field="outcome" data-val="win"  onclick="toggleSelect('outcome','win',this)">🏆 Win</button>
          <button class="toggle-btn red"    data-field="outcome" data-val="loss" onclick="toggleSelect('outcome','loss',this)">✗ Loss</button>
          <button class="toggle-btn"        data-field="outcome" data-val="tie"  onclick="toggleSelect('outcome','tie',this)">= Tie</button>
        </div>
      </div>

      <div class="grid-2">
        <div class="form-group">
          <label class="form-label">Alliance Score (total)</label>
          <input class="form-input" id="f_allianceScore" type="number" min="0" max="500" placeholder="e.g. 84">
        </div>
        <div class="form-group">
          <label class="form-label">Robot Final Status</label>
          <div class="toggle-group" id="f_robotStatus">
            ${mkToggle('robotStatus',['working','degraded','down'],['Working','Degraded','Down'],'working')}
          </div>
        </div>
      </div>

      <div class="divider"></div>
      <div style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.8px;color:var(--text3);margin-bottom:10px;">End-game Scoring (at match end)</div>

      <div class="form-group">
        <label class="form-label">Parking <span style="color:var(--text3);font-weight:400">(1 robot = 8pts · both robots = 30pts)</span></label>
        <div class="toggle-group" id="f_parking">
          <button class="toggle-btn"       data-field="parking" data-val="none"   onclick="toggleSelect('parking','none',this)">None (0)</button>
          <button class="toggle-btn green" data-field="parking" data-val="single" onclick="toggleSelect('parking','single',this)">🅿 This Robot (+8)</button>
          <button class="toggle-btn green" data-field="parking" data-val="both"   onclick="toggleSelect('parking','both',this)">🅿🅿 Both Robots (+30)</button>
        </div>
      </div>

      <div class="form-group">
        <label class="form-label">Long Goal Zones Controlled <span style="color:var(--text3);font-weight:400">(+10 pts each)</span></label>
        <div class="stepper">
          <button class="stepper-btn" onclick="stepDec('longZonesControlled',0,2)">−</button>
          <span class="stepper-val" id="val-longZonesControlled">0</span>
          <button class="stepper-btn" onclick="stepInc('longZonesControlled',0,2)">+</button>
        </div>
        <p class="form-hint">Majority of same-color blocks in a Long Goal's control zone (0, 1, or 2 zones)</p>
      </div>

      <div class="grid-2">
        <div class="form-group">
          <label class="form-label">Center Goal Upper Controlled <span style="color:var(--text3)">+8 pts</span></label>
          <div class="toggle-group" id="f_centerUpperControlled">
            ${mkToggle('centerUpperControlled',['true','false'],['✓ Yes (+8)','No'],'false')}
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Center Goal Lower Controlled <span style="color:var(--text3)">+6 pts</span></label>
          <div class="toggle-group" id="f_centerLowerControlled">
            ${mkToggle('centerLowerControlled',['true','false'],['✓ Yes (+6)','No'],'false')}
          </div>
        </div>
      </div>

      <div class="divider"></div>
      <div class="form-group">
        <label class="form-label">Overall Team Rating</label>
        <div class="star-group" id="f_overallRating">${mkStars('overallRating',3)}</div>
      </div>

      <div class="form-group">
        <label class="form-label">Strengths</label>
        <div class="tag-group" id="f_strengths">
          ${['Consistent Auto','Fast Driver','Great Defense','High Accuracy','Strong Push',
             'Partner Sync','Reliable','Efficient Pathing','Good Descoring','Zone Control','Parking'].map(t=>
            `<button class="tag-btn" data-tag="${t}" onclick="toggleTag('strengths',this)">${t}</button>`).join('')}
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Concerns</label>
        <div class="tag-group" id="f_concerns">
          ${['Slow','Inconsistent','Poor Auto','Over-aggressive','Fragile',
             'Coordination Issues','Penalties','Tipping Risk','No Parking','Weak Descore'].map(t=>
            `<button class="tag-btn concern" data-tag="${t}" onclick="toggleTag('concerns',this)">${t}</button>`).join('')}
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Would Draft for Eliminations?</label>
        <div class="toggle-group" id="f_wouldDraft">
          <button class="toggle-btn green"  data-field="wouldDraft" data-val="yes"   onclick="toggleSelect('wouldDraft','yes',this)">✓ Yes</button>
          <button class="toggle-btn yellow" data-field="wouldDraft" data-val="maybe" onclick="toggleSelect('wouldDraft','maybe',this)">? Maybe</button>
          <button class="toggle-btn red"    data-field="wouldDraft" data-val="no"    onclick="toggleSelect('wouldDraft','no',this)">✗ No</button>
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Match Notes</label>
        <textarea class="form-input" id="f_notes" rows="4" placeholder="Observations, strategy notes, anything notable…"></textarea>
      </div>
    </div>`;
}

// ── Bot type helper ───────────────────────────────────────────────────────────
function showBotOther(show) {
  const el = document.getElementById('botTypeOtherWrap');
  if (el) el.style.display = show ? 'block' : 'none';
}

// ── Stepper state ─────────────────────────────────────────────────────────────
const stepperFields = {
  matchNumber:1, autoBalls:0, autoGoalsUsed:0,
  driverBalls:0, ballsDefended:0, descored:0, penalties:0,
  longZonesControlled:0
};
function stepInc(f,_min,max){ stepperFields[f]=Math.min(max,(stepperFields[f]||0)+1); const e=document.getElementById(`val-${f}`); if(e)e.textContent=stepperFields[f]; }
function stepDec(f,min,_max){ stepperFields[f]=Math.max(min,(stepperFields[f]||0)-1); const e=document.getElementById(`val-${f}`); if(e)e.textContent=stepperFields[f]; }

// ── Toggle & star state ───────────────────────────────────────────────────────
const toggleValues = {};
function toggleSelect(field,val,btn){
  toggleValues[field]=val;
  const g=btn.closest('.toggle-group');
  if(g) g.querySelectorAll('.toggle-btn').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
}
const starValues = {};
function setStar(field,val){
  starValues[field]=val;
  document.querySelectorAll(`.star-btn[data-field="${field}"]`).forEach(b=>{ b.classList.toggle('lit',parseInt(b.dataset.val)<=val); });
}
const tagValues = { strengths: new Set(), concerns: new Set() };
function toggleTag(field,btn){
  const tag=btn.dataset.tag;
  if(tagValues[field].has(tag)){ tagValues[field].delete(tag); btn.classList.remove('active'); }
  else { tagValues[field].add(tag); btn.classList.add('active'); }
}

// ── Restore form values ───────────────────────────────────────────────────────
function restoreStepValues() {
  Object.entries(stepperFields).forEach(([k,v])=>{ const e=document.getElementById(`val-${k}`); if(e)e.textContent=v; });
  Object.entries(toggleValues).forEach(([field,val])=>{
    const btn=document.querySelector(`.toggle-btn[data-field="${field}"][data-val="${val}"]`);
    if(btn){ const g=btn.closest('.toggle-group'); if(g)g.querySelectorAll('.toggle-btn').forEach(b=>b.classList.remove('active')); btn.classList.add('active'); }
  });
  Object.entries(starValues).forEach(([field,val])=>{
    document.querySelectorAll(`.star-btn[data-field="${field}"]`).forEach(b=>b.classList.toggle('lit',parseInt(b.dataset.val)<=val));
  });
  ['strengths','concerns'].forEach(field=>{
    tagValues[field].forEach(tag=>{ const b=document.querySelector(`[data-tag="${tag}"]`); if(b)b.classList.add('active'); });
  });
  // Text inputs
  const fmap = { f_teamNumber:'teamNumber', f_scoutedBy:'scoutedBy', f_autoNotes:'autoNotes', f_descoringNotes:'descoringNotes', f_notes:'notes', f_allianceScore:'allianceScore', f_botTypeOther:'botTypeOther' };
  Object.entries(fmap).forEach(([id,key])=>{ const e=document.getElementById(id); if(e&&wizardEntry[key]!=null) e.value=wizardEntry[key]; });
  if(!wizardEntry.scoutedBy){ const e=document.getElementById('f_scoutedBy'); if(e)e.value=getPrefs().scoutedBy||''; }
  if(wizardEntry.botType==='other'){ const w=document.getElementById('botTypeOtherWrap'); if(w)w.style.display='block'; }
}

// ── Collect step data ─────────────────────────────────────────────────────────
function collectStep(step) {
  if (step === 1) {
    wizardEntry.teamNumber  = (document.getElementById('f_teamNumber')?.value||'').trim().toUpperCase();
    wizardEntry.matchNumber = stepperFields.matchNumber;
    wizardEntry.matchType   = toggleValues.matchType  || 'qual';
    wizardEntry.alliance    = toggleValues.alliance   || 'red';
    wizardEntry.compId      = document.getElementById('f_compId')?.value || activeCompId;
    wizardEntry.scoutedBy   = document.getElementById('f_scoutedBy')?.value || '';
    const rawBotType        = toggleValues.botType || '';
    wizardEntry.botType     = rawBotType === 'other'
      ? (document.getElementById('f_botTypeOther')?.value||'Other').trim()
      : rawBotType;
    const prefs = getPrefs(); prefs.scoutedBy = wizardEntry.scoutedBy; savePrefs(prefs);
  }
  if (step === 2) {
    wizardEntry.awp            = toggleValues.awp === 'true';
    wizardEntry.autoBonus      = toggleValues.autoBonus === 'true';
    wizardEntry.autoBalls      = stepperFields.autoBalls;
    wizardEntry.autoGoalsUsed  = stepperFields.autoGoalsUsed;
    wizardEntry.crossedCenter  = toggleValues.crossedCenter === 'true';
    wizardEntry.autoRoutine    = toggleValues.autoRoutine  || 'simple';
    wizardEntry.autoReliability= starValues.autoReliability || 3;
    wizardEntry.autoNotes      = document.getElementById('f_autoNotes')?.value || '';
    wizardEntry.autoRoute      = JSON.parse(JSON.stringify(autoRouteData));
  }
  if (step === 3) {
    wizardEntry.driverBalls     = stepperFields.driverBalls;
    wizardEntry.descored        = stepperFields.descored;
    wizardEntry.ballsDefended   = stepperFields.ballsDefended;
    wizardEntry.penalties       = stepperFields.penalties;
    wizardEntry.driverSkill     = starValues.driverSkill     || 3;
    wizardEntry.consistency     = starValues.consistency     || 3;
    wizardEntry.coordination    = starValues.coordination    || 3;
    wizardEntry.playStyle       = toggleValues.playStyle     || 'balanced';
    wizardEntry.disabled        = toggleValues.disabled      || 'no';
    wizardEntry.descoringNotes  = document.getElementById('f_descoringNotes')?.value || '';
  }
  if (step === 4) {
    wizardEntry.outcome              = toggleValues.outcome || 'tie';
    wizardEntry.allianceScore        = parseInt(document.getElementById('f_allianceScore')?.value)||0;
    wizardEntry.robotStatus          = toggleValues.robotStatus || 'working';
    wizardEntry.parking              = toggleValues.parking     || 'none';
    wizardEntry.longZonesControlled  = stepperFields.longZonesControlled;
    wizardEntry.centerUpperControlled= toggleValues.centerUpperControlled === 'true';
    wizardEntry.centerLowerControlled= toggleValues.centerLowerControlled === 'true';
    wizardEntry.overallRating        = starValues.overallRating || 3;
    wizardEntry.strengths            = [...tagValues.strengths];
    wizardEntry.concerns             = [...tagValues.concerns];
    wizardEntry.wouldDraft           = toggleValues.wouldDraft || 'maybe';
    wizardEntry.notes                = document.getElementById('f_notes')?.value || '';
  }
}

function validateStep(step) {
  if (step === 1) {
    if (!wizardEntry.teamNumber) { showToast('Enter a team number.', 'error'); return false; }
    if (!wizardEntry.compId)     { showToast('Select a competition first.', 'error'); return false; }
  }
  return true;
}

function wizardNext() {
  collectStep(wizardStep);
  if (!validateStep(wizardStep)) return;
  if (wizardStep === WSTEPS) { submitEntry(); return; }
  wizardStep++; renderWizard(); window.scrollTo(0,0);
}
function wizardPrev() {
  collectStep(wizardStep);
  if (wizardStep > 1) { wizardStep--; renderWizard(); }
}

function submitEntry() {
  const entry = { ...wizardEntry, id: genId(), createdAt: Date.now(),
    calculatedPoints: calculatePoints(wizardEntry) };
  addEntry(entry);
  showToast(`✓ Team ${entry.teamNumber} — ${entry.matchType.charAt(0).toUpperCase()}${entry.matchNumber} submitted (${entry.calculatedPoints} pts)`, 'success');
  autoRouteData = { path: [], waypoints: [] };
  tagValues.strengths = new Set(); tagValues.concerns = new Set();
  Object.keys(toggleValues).forEach(k=>delete toggleValues[k]);
  Object.keys(starValues).forEach(k=>delete starValues[k]);
  const nextMatch = stepperFields.matchNumber + 1;
  Object.keys(stepperFields).forEach(k=>{ stepperFields[k] = k==='matchNumber' ? nextMatch : 0; });
  wizardStep = 1; wizardEntry = {};
  renderWizard(); renderHome();
}

// ── AUTO ROUTE CANVAS ─────────────────────────────────────────────────────────
function initAutoCanvas() {
  autoCanvasEl = document.getElementById('autoRouteCanvas');
  if (!autoCanvasEl) return;
  autoCanvasCtx = autoCanvasEl.getContext('2d');

  // Restore stored route if navigating back
  if (wizardEntry.autoRoute) {
    autoRouteData = JSON.parse(JSON.stringify(wizardEntry.autoRoute));
  }

  // Pointer events (works for both mouse and touch)
  autoCanvasEl.addEventListener('pointerdown',  routePointerDown);
  autoCanvasEl.addEventListener('pointermove',  routePointerMove);
  autoCanvasEl.addEventListener('pointerup',    routePointerUp);
  autoCanvasEl.addEventListener('pointercancel',routePointerUp);
  autoCanvasEl.addEventListener('contextmenu', e => e.preventDefault());

  // Drag state for waypoints
  autoCanvasEl._draggingWp = null;

  drawFieldCanvas();
}

function routePointerDown(e) {
  e.preventDefault();
  const {x, y} = routeEventCoords(e);
  // Check if clicking existing waypoint (for drag)
  const hitWp = autoRouteData.waypoints.findIndex(wp => Math.hypot(wp.cx - x, wp.cy - y) < 12);
  if (hitWp >= 0) {
    autoCanvasEl._draggingWp = hitWp;
    autoCanvasEl.setPointerCapture(e.pointerId);
    return;
  }
  if (routeTool === 'path') {
    routeDrawing = true;
    autoRouteData.path.push([x, y]);
    autoCanvasEl.setPointerCapture(e.pointerId);
  } else {
    // Place waypoint
    autoRouteData.waypoints.push({ cx: x, cy: y, type: routeTool });
    drawFieldCanvas();
  }
}

function routePointerMove(e) {
  e.preventDefault();
  const {x, y} = routeEventCoords(e);
  if (autoCanvasEl._draggingWp !== null) {
    const wp = autoRouteData.waypoints[autoCanvasEl._draggingWp];
    if (wp) { wp.cx = x; wp.cy = y; drawFieldCanvas(); }
    return;
  }
  if (routeDrawing && routeTool === 'path') {
    autoRouteData.path.push([x, y]);
    drawFieldCanvas();
  }
}

function routePointerUp(_e) {
  routeDrawing = false;
  autoCanvasEl._draggingWp = null;
}

function routeEventCoords(e) {
  const rect = autoCanvasEl.getBoundingClientRect();
  return {
    x: (e.clientX - rect.left) * (autoCanvasEl.width  / rect.width),
    y: (e.clientY - rect.top)  * (autoCanvasEl.height / rect.height)
  };
}

function setRouteTool(tool, btn) {
  routeTool = tool;
  document.querySelectorAll('.route-tool').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
}

function clearAutoRoute() {
  autoRouteData = { path: [], waypoints: [] };
  drawFieldCanvas();
}

// Field canvas rendering for Push Back (simplified top-down view)
// Field: 12ft x 12ft. Blue alliance = top, Red alliance = bottom.
// Long Goals: left and right side walls, straddling centre line.
// Center Goals: centre of field, one upper (blue-side) one lower (red-side).
// Park Zones: alliance station ends (top = blue, bottom = red).
function drawFieldCanvas() {
  if (!autoCanvasCtx || !autoCanvasEl) return;
  const ctx = autoCanvasCtx;
  const W = autoCanvasEl.width, H = autoCanvasEl.height;
  const px = W / 12, py = H / 12; // pixels per ft

  ctx.clearRect(0, 0, W, H);

  // Field background
  ctx.fillStyle = '#0d0f1a';
  ctx.fillRect(0, 0, W, H);

  // Alliance zones
  ctx.fillStyle = 'rgba(239,68,68,0.06)';
  ctx.fillRect(0, H * 0.5, W, H * 0.5); // Red bottom
  ctx.fillStyle = 'rgba(59,130,246,0.06)';
  ctx.fillRect(0, 0, W, H * 0.5);       // Blue top

  // Park Zones
  ctx.fillStyle = 'rgba(59,130,246,0.15)';
  ctx.fillRect(0, 0, W, py * 1.5);           // Blue Park Zone (top)
  ctx.fillStyle = 'rgba(239,68,68,0.15)';
  ctx.fillRect(0, H - py * 1.5, W, py * 1.5); // Red Park Zone (bottom)
  // Park zone labels
  ctx.fillStyle = 'rgba(147,197,253,0.6)';
  ctx.font = `bold ${Math.max(9,W*0.028)}px 'Segoe UI',sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillText('BLUE PARK ZONE', W/2, py * 0.85);
  ctx.fillStyle = 'rgba(252,165,165,0.6)';
  ctx.fillText('RED PARK ZONE', W/2, H - py * 0.4);

  // Center barrier line
  ctx.strokeStyle = '#3a3f6e';
  ctx.lineWidth = 2;
  ctx.setLineDash([8, 5]);
  ctx.beginPath(); ctx.moveTo(0, H/2); ctx.lineTo(W, H/2); ctx.stroke();
  ctx.setLineDash([]);

  // Long Goals — left and right walls, spanning center
  const lgW = px * 0.55, lgH = py * 3.2;
  const lgY  = H/2 - lgH/2;
  // Left Long Goal
  ctx.fillStyle = '#1e3a5f';
  ctx.strokeStyle = '#3b82f6';
  ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.rect(0, lgY, lgW, lgH); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#60a5fa'; ctx.font = `bold ${Math.max(8,W*0.022)}px 'Segoe UI',sans-serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.save(); ctx.translate(lgW/2, H/2); ctx.rotate(-Math.PI/2); ctx.fillText('LONG GOAL', 0, 0); ctx.restore();

  // Right Long Goal
  ctx.fillStyle = '#1e3a5f'; ctx.strokeStyle = '#3b82f6'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.rect(W - lgW, lgY, lgW, lgH); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#60a5fa';
  ctx.save(); ctx.translate(W - lgW/2, H/2); ctx.rotate(Math.PI/2); ctx.fillText('LONG GOAL', 0, 0); ctx.restore();

  // Center Goals — upper (blue-side) and lower (red-side)
  const cgW = px * 2.2, cgH = py * 1.6;
  const cgX = W/2 - cgW/2;
  // Upper Center Goal (blue-side)
  ctx.fillStyle = '#1e3a5f'; ctx.strokeStyle = '#3b82f6'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.rect(cgX, H/2 - py*0.3 - cgH, cgW, cgH); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#93c5fd'; ctx.font = `${Math.max(7,W*0.02)}px 'Segoe UI',sans-serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('CENTER UPPER (+8)', W/2, H/2 - py*0.3 - cgH/2);

  // Lower Center Goal (red-side)
  ctx.fillStyle = '#3b1f1f'; ctx.strokeStyle = '#ef4444'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.rect(cgX, H/2 + py*0.3, cgW, cgH); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#fca5a5'; ctx.font = `${Math.max(7,W*0.02)}px 'Segoe UI',sans-serif`;
  ctx.fillText('CENTER LOWER (+6)', W/2, H/2 + py*0.3 + cgH/2);

  ctx.textBaseline = 'alphabetic';

  // Side labels
  ctx.font = `${Math.max(8,W*0.022)}px 'Segoe UI',sans-serif`;
  ctx.fillStyle = 'rgba(147,197,253,0.4)'; ctx.textAlign = 'right';
  ctx.fillText('Blue Zone', W - 6, H * 0.35);
  ctx.fillStyle = 'rgba(252,165,165,0.4)'; ctx.textAlign = 'right';
  ctx.fillText('Red Zone', W - 6, H * 0.72);

  // Drawn path
  if (autoRouteData.path.length > 1) {
    ctx.strokeStyle = '#a78bfa';
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    autoRouteData.path.forEach(([x,y],i) => { if(i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y); });
    ctx.stroke();

    // Start dot
    ctx.beginPath(); ctx.arc(autoRouteData.path[0][0], autoRouteData.path[0][1], 5, 0, Math.PI*2);
    ctx.fillStyle = '#10b981'; ctx.fill();
  }

  // Waypoints
  autoRouteData.waypoints.forEach(wp => {
    const style = WP_STYLES[wp.type];
    if (!style) return;
    // Shadow
    ctx.shadowColor = style.color + '66'; ctx.shadowBlur = 10;
    ctx.beginPath(); ctx.arc(wp.cx, wp.cy, 9, 0, Math.PI*2);
    ctx.fillStyle = style.bg; ctx.fill();
    ctx.strokeStyle = style.color; ctx.lineWidth = 2; ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.fillStyle = style.color;
    ctx.font = `bold ${Math.max(8,W*0.025)}px 'Segoe UI',sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(style.label, wp.cx, wp.cy);
    ctx.textBaseline = 'alphabetic';
  });
}

// ── TEAMS VIEW ────────────────────────────────────────────────────────────────
function renderTeams() {
  const search     = (document.getElementById('teamSearch')?.value||'').toLowerCase();
  const compFilter = document.getElementById('teamCompFilter')?.value||'';
  let data = getData();
  if (compFilter) data = data.filter(e => e.compId === compFilter);
  const teamMap = {};
  data.forEach(e => { if(!teamMap[e.teamNumber])teamMap[e.teamNumber]=[]; teamMap[e.teamNumber].push(e); });
  let teams = Object.entries(teamMap);
  if (search) teams = teams.filter(([t,entries]) =>
    t.toLowerCase().includes(search) || entries.some(e=>(e.notes||'').toLowerCase().includes(search)));
  teams.sort((a,b) => b[1].length - a[1].length);
  const content = document.getElementById('teamsContent');
  if (!teams.length) {
    content.innerHTML=`<div class="empty-state"><div class="empty-icon">🤖</div><p>No teams found.<br>Scout some matches to see teams here.</p></div>`;
    return;
  }
  content.innerHTML = `<div class="teams-grid">${teams.map(([t,entries]) => {
    const stats = calcStats(entries);
    return `<div class="team-card" onclick="renderTeamDetail('${t}')">
      <div class="team-number">${t}${entries[0]?.botType?` <span class="badge badge-purple" style="font-size:9px">${entries[0].botType}</span>`:''}
      </div>
      <div class="team-matches">${entries.length} match${entries.length!==1?'es':''}</div>
      <div class="team-avg">Avg score: <span>${stats.avgCalcPoints} pts</span></div>
      <div class="team-avg">AWP rate: <span>${stats.awpRate}%</span></div>
      <div class="team-avg">Rating: <span>${stats.avgRating}/5</span></div>
      ${stats.wins||stats.losses?`<span class="win-badge ${stats.wins>stats.losses?'win':'loss'}">${stats.wins}W ${stats.losses}L</span>`:''}
    </div>`;
  }).join('')}</div>`;
}

// ── TEAM DETAIL ───────────────────────────────────────────────────────────────
function renderTeamDetail(teamNumber) {
  const data    = getData().filter(e => e.teamNumber === teamNumber);
  const stats   = calcStats(data);
  const content = document.getElementById('teamsContent');
  destroyCharts(['teamBallsChart','teamRadarChart']);

  const botTypes = [...new Set(data.map(e=>e.botType).filter(Boolean))];

  content.innerHTML = `
    <button class="back-btn" onclick="renderTeams()">← Back to Teams</button>
    <div class="team-detail-header">
      <div class="team-badge">TEAM<br>${teamNumber}</div>
      <div>
        <div style="font-size:24px;font-weight:800;color:var(--purple-l);font-family:var(--mono)">${teamNumber}</div>
        <div class="text-muted" style="font-size:13px;">${data.length} matches · ${stats.avgCalcPoints} avg pts · AWP ${stats.awpRate}%</div>
        ${botTypes.length?`<div style="margin-top:4px">${botTypes.map(t=>`<span class="badge badge-purple">${t}</span>`).join(' ')}</div>`:''}
        <div style="margin-top:6px;display:flex;gap:5px;flex-wrap:wrap">
          ${stats.topStrengths.map(t=>`<span class="tag tag-strength">${t}</span>`).join('')}
          ${stats.topConcerns.map(t=>`<span class="tag tag-concern">${t}</span>`).join('')}
        </div>
      </div>
    </div>

    <div class="detail-stats-row">
      <div class="detail-stat"><div class="ds-val">${stats.avgCalcPoints}</div><div class="ds-label">Avg Pts</div></div>
      <div class="detail-stat"><div class="ds-val">${stats.avgBalls}</div><div class="ds-label">Avg Blocks</div></div>
      <div class="detail-stat"><div class="ds-val">${stats.avgAutoBalls}</div><div class="ds-label">Auto Blocks</div></div>
      <div class="detail-stat"><div class="ds-val">${stats.avgDescored}</div><div class="ds-label">Avg Descore</div></div>
      <div class="detail-stat"><div class="ds-val">${stats.awpRate}%</div><div class="ds-label">AWP Rate</div></div>
      <div class="detail-stat"><div class="ds-val">${stats.wins}W/${stats.losses}L</div><div class="ds-label">Record</div></div>
    </div>

    <div class="grid-2" style="margin-bottom:20px">
      <div class="card"><div class="section-title">Score per Match</div><div class="chart-container"><canvas id="teamBallsChart"></canvas></div></div>
      <div class="card"><div class="section-title">Skill Radar</div><div class="radar-container"><canvas id="teamRadarChart"></canvas></div></div>
    </div>

    <div class="section-title" style="margin-bottom:8px">Match History</div>
    <div class="card" style="padding:0;overflow:auto;">
      <table class="match-history-table"><thead><tr>
        <th>Match</th><th>Alliance</th><th>Auto</th><th>Driver</th><th>Descore</th><th>Pts</th><th>Parking</th><th>AWP</th><th>Rating</th><th>Outcome</th><th>Auto Route</th>
      </tr></thead>
      <tbody>${data.sort((a,b)=>a.matchNumber-b.matchNumber).map(e=>`<tr>
        <td>${e.matchType==='qual'?'Q':e.matchType==='elim'?'E':'P'}${e.matchNumber}</td>
        <td><span class="alliance-pill ${e.alliance}">${e.alliance}</span></td>
        <td class="mono">${e.autoBalls||0}</td><td class="mono">${e.driverBalls||0}</td>
        <td class="mono">${e.descored||0}</td>
        <td class="mono" style="color:var(--purple-l);font-weight:700">${calculatePoints(e)}</td>
        <td style="font-size:11px">${e.parking||'none'}</td>
        <td>${e.awp?'<span style="color:var(--green)">✓</span>':'—'}</td>
        <td>${renderStarsMini(e.overallRating)}</td>
        <td><span class="outcome-pill ${e.outcome||'tie'}">${e.outcome||'—'}</span></td>
        <td>${e.autoRoute&&e.autoRoute.waypoints.length?`<button class="btn btn-ghost btn-sm" style="font-size:10px" onclick="showRouteModal('${e.id}')">👁 View</button>`:'—'}</td>
      </tr>`).join('')}</tbody></table>
    </div>
    <div id="routeModalInline"></div>`;

  setTimeout(() => buildTeamCharts(data), 50);
}

function showRouteModal(entryId) {
  const entry = getData().find(e => e.id === entryId);
  if (!entry || !entry.autoRoute) return;
  const wrap = document.getElementById('routeModalInline');
  if (!wrap) return;
  wrap.innerHTML = `
    <div class="card" style="margin-top:16px;">
      <div class="flex justify-between items-center" style="margin-bottom:10px">
        <div class="section-title">Auto Route — Q${entry.matchNumber}</div>
        <button class="btn btn-ghost btn-sm" onclick="document.getElementById('routeModalInline').innerHTML=''">Close</button>
      </div>
      <canvas id="routeViewCanvas" width="360" height="340" style="border-radius:6px;"></canvas>
    </div>`;
  setTimeout(() => {
    const canvas = document.getElementById('routeViewCanvas');
    if (!canvas) return;
    const savedEl = autoCanvasEl, savedCtx = autoCanvasCtx, savedData = autoRouteData;
    autoCanvasEl  = canvas;
    autoCanvasCtx = canvas.getContext('2d');
    autoRouteData = entry.autoRoute;
    drawFieldCanvas();
    autoCanvasEl  = savedEl; autoCanvasCtx = savedCtx; autoRouteData = savedData;
  }, 30);
}

function buildTeamCharts(entries) {
  const sorted = [...entries].sort((a,b)=>a.matchNumber-b.matchNumber);
  const bc = document.getElementById('teamBallsChart');
  if (bc) {
    chartInstances['teamBallsChart'] = new Chart(bc, {
      type: 'bar',
      data: {
        labels: sorted.map(e=>`${e.matchType==='qual'?'Q':'E'}${e.matchNumber}`),
        datasets: [
          { label:'Auto Blocks', data:sorted.map(e=>e.autoBalls||0), backgroundColor:'rgba(167,139,250,0.7)', borderRadius:3 },
          { label:'Driver Blocks', data:sorted.map(e=>e.driverBalls||0), backgroundColor:'rgba(59,130,246,0.7)', borderRadius:3 },
          { label:'Zone/Park Pts', data:sorted.map(e=>{const bd=pointsBreakdown(e);return bd.zones+bd.park+bd.auto;}), backgroundColor:'rgba(16,185,129,0.7)', borderRadius:3 },
        ]
      },
      options: chartDefaults({ stacked:true })
    });
  }
  const rc = document.getElementById('teamRadarChart');
  if (rc) {
    const avgF = f => { const v=entries.map(e=>e[f]).filter(Boolean); return v.length?(v.reduce((a,b)=>a+b,0)/v.length):0; };
    chartInstances['teamRadarChart'] = new Chart(rc, {
      type:'radar',
      data:{
        labels:['Driver Skill','Consistency','Coordination','Auto Reliability','Overall'],
        datasets:[{
          label:entries[0]?.teamNumber||'',
          data:[avgF('driverSkill'),avgF('consistency'),avgF('coordination'),avgF('autoReliability'),avgF('overallRating')],
          backgroundColor:'rgba(124,58,237,0.2)', borderColor:'#a78bfa', pointBackgroundColor:'#a78bfa', borderWidth:2
        }]
      },
      options: radarDefaults()
    });
  }
}

// ── COMPARE VIEW ──────────────────────────────────────────────────────────────
function addCompareTeam() {
  const input = document.getElementById('compareInput');
  const t = (input.value||'').trim().toUpperCase();
  if (!t) return;
  if (!getData().some(e=>e.teamNumber===t)){ showToast(`No data for team ${t}.`,'error'); return; }
  if (compareTeams.includes(t)){ showToast(`${t} already added.`,'error'); return; }
  if (compareTeams.length>=4){ showToast('Max 4 teams.','error'); return; }
  compareTeams.push(t); input.value=''; renderCompare();
}
function removeCompareTeam(t){ compareTeams=compareTeams.filter(x=>x!==t); renderCompare(); }

const COMPARE_COLORS = ['#a78bfa','#60a5fa','#34d399','#fb923c'];

function renderCompare() {
  document.getElementById('compareChips').innerHTML = compareTeams.map((t,i)=>
    `<div class="team-chip" style="border-color:${COMPARE_COLORS[i]}55;color:${COMPARE_COLORS[i]}">${t}
     <button class="chip-remove" onclick="removeCompareTeam('${t}')">✕</button></div>`).join('');
  const content = document.getElementById('compareContent');
  if (!compareTeams.length){
    content.innerHTML=`<div class="empty-state"><div class="empty-icon">⚖️</div><p>Add team numbers above to compare.</p></div>`;
    return;
  }
  const statsArr = compareTeams.map(t=>({team:t,...calcStats(getData().filter(e=>e.teamNumber===t))}));
  const ROWS = [
    {key:'avgCalcPoints', label:'Avg Calculated Points', higher:true},
    {key:'avgBalls',      label:'Avg Total Blocks',       higher:true},
    {key:'avgAutoBalls',  label:'Avg Auto Blocks',        higher:true},
    {key:'avgDriverBalls',label:'Avg Driver Blocks',      higher:true},
    {key:'avgDescored',   label:'Avg Descored',           higher:true},
    {key:'awpRate',       label:'AWP Rate (%)',            higher:true},
    {key:'avgRating',     label:'Avg Overall Rating',     higher:true},
    {key:'avgDriverSkill',label:'Avg Driver Skill',       higher:true},
    {key:'avgConsistency',label:'Avg Consistency',        higher:true},
    {key:'avgCoordination',label:'Avg Coordination',     higher:true},
    {key:'avgAutoReliability',label:'Avg Auto Reliability',higher:true},
    {key:'wins',          label:'Wins',                   higher:true},
    {key:'losses',        label:'Losses',                 higher:false},
    {key:'avgPenalties',  label:'Avg Penalties',          higher:false},
    {key:'wouldDraftPct', label:'Would Draft (%)',         higher:true},
    {key:'avgScore',      label:'Avg Alliance Score',     higher:true},
    {key:'matches',       label:'Matches Scouted',        higher:true}
  ];
  const tableRows = ROWS.map(row => {
    const vals = statsArr.map(s=>parseFloat(s[row.key])||0);
    const best = row.higher?Math.max(...vals):Math.min(...vals);
    const worst= row.higher?Math.min(...vals):Math.max(...vals);
    return `<tr><td>${row.label}</td>${statsArr.map((s,_i)=>{
      const v=parseFloat(s[row.key])||0;
      const cls=vals.filter(Boolean).length>1?(v===best?'best':v===worst&&best!==worst?'worst':''):'';
      return `<td style="color:${cls==='best'?'var(--green)':cls==='worst'?'var(--red)':'var(--text2)'};${cls==='best'?'font-weight:700':''}">${s[row.key]}</td>`;
    }).join('')}</tr>`;
  }).join('');

  destroyCharts(['compareRadar']);
  content.innerHTML = `
    <div class="card" style="overflow:auto;margin-bottom:20px;">
      <table class="compare-table"><thead><tr>
        <th>Metric</th>${statsArr.map((s,i)=>`<th style="color:${COMPARE_COLORS[i]}">${s.team}</th>`).join('')}
      </tr></thead><tbody>${tableRows}</tbody></table>
    </div>
    <div class="card" style="max-width:500px;margin:0 auto;">
      <div class="section-title">Skill Radar</div>
      <div class="radar-container"><canvas id="compareRadar"></canvas></div>
    </div>`;
  setTimeout(() => {
    const rc = document.getElementById('compareRadar');
    if (!rc) return;
    const avgFn = (entries,f) => { const v=entries.map(e=>e[f]).filter(Boolean); return v.length?+(v.reduce((a,b)=>a+b,0)/v.length).toFixed(2):0; };
    chartInstances['compareRadar'] = new Chart(rc, {
      type:'radar',
      data:{
        labels:['Driver Skill','Consistency','Coordination','Auto Reliability','Overall Rating'],
        datasets:compareTeams.map((t,i)=>{
          const entries=getData().filter(e=>e.teamNumber===t);
          return {label:t, data:['driverSkill','consistency','coordination','autoReliability','overallRating'].map(f=>avgFn(entries,f)),
            backgroundColor:COMPARE_COLORS[i]+'22', borderColor:COMPARE_COLORS[i],
            pointBackgroundColor:COMPARE_COLORS[i], borderWidth:2};
        })
      },
      options: radarDefaults()
    });
  }, 50);
}

// ── RANKINGS VIEW ─────────────────────────────────────────────────────────────
function renderRankings() {
  loadWeights();
  renderWeightSliders();
  renderRankingsTable();
}

function renderWeightSliders() {
  const el = document.getElementById('weightSliders');
  if (!el) return;
  el.innerHTML = Object.entries(DEFAULT_WEIGHTS).map(([k, def]) => `
    <div class="weight-row">
      <span class="weight-label">${def.label}</span>
      <input type="range" class="weight-slider range-full" min="0" max="${def.max}" step="0.05"
             value="${rankWeights[k]}" id="w_${k}" oninput="updateWeight('${k}',this.value)">
      <span class="weight-val" id="wv_${k}">${rankWeights[k].toFixed(2)}</span>
    </div>`).join('');
}

function updateWeight(key, val) {
  rankWeights[key] = parseFloat(val);
  document.getElementById(`wv_${key}`).textContent = rankWeights[key].toFixed(2);
  saveWeights(rankWeights);
  renderRankingsTable();
}

function resetWeights() {
  loadWeights();
  Object.entries(DEFAULT_WEIGHTS).forEach(([k,def]) => { rankWeights[k] = def.v; });
  saveWeights(rankWeights);
  renderWeightSliders();
  renderRankingsTable();
}

function calcRankScore(stats) {
  const w = rankWeights;
  const winRate = (stats.wins||0) / Math.max(1, (stats.wins||0)+(stats.losses||0));
  const raw = (
    (parseFloat(stats.avgCalcPoints)||0)         * w.avgCalcPoints +
    (parseFloat(stats.avgDriverBalls)||0) * 2     * w.avgDriverBalls +
    (stats.awpRate||0) / 100 * 25                 * w.awpRate +
    (parseFloat(stats.avgAutoReliability)||0) / 5 * 20 * w.autoReliability +
    (parseFloat(stats.avgDriverSkill)||0)   / 5 * 20 * w.driverSkill +
    (parseFloat(stats.avgConsistency)||0)   / 5 * 20 * w.consistency +
    (parseFloat(stats.avgCoordination)||0)  / 5 * 15 * w.coordination +
    winRate * 25                                  * w.winRate +
    (parseFloat(stats.avgDescored)||0) * 3        * w.descoringAvg +
    (1 - Math.min(1,(stats.avgPenalties||0)/5)) * 15 * w.penaltyAvoid +
    (stats.wouldDraftPct||0) / 100 * 20           * w.draftPriority
  );
  return raw;
}

function renderRankingsTable() {
  const data = getData();
  const compFilter = activeCompId;
  let filtered = compFilter ? data.filter(e=>e.compId===compFilter) : data;
  const teamMap = {};
  filtered.forEach(e=>{ if(!teamMap[e.teamNumber])teamMap[e.teamNumber]=[]; teamMap[e.teamNumber].push(e); });
  const teams = Object.entries(teamMap).map(([t,entries])=>{
    const stats = calcStats(entries);
    const score = calcRankScore(stats);
    return { team:t, stats, score, entries };
  }).sort((a,b)=>b.score-a.score);

  const content = document.getElementById('rankingsContent');
  if (!teams.length){
    content.innerHTML=`<div class="empty-state"><div class="empty-icon">🏆</div><p>No data to rank. Scout some matches first.</p></div>`;
    return;
  }
  const maxScore = teams[0].score;
  content.innerHTML = `
    <div class="card" style="padding:0;overflow:auto;">
      <table class="rank-table">
        <thead><tr>
          <th>Rank</th><th>Team</th><th>Bot Type</th><th>Score</th><th>Avg Pts</th><th>Blocks</th><th>AWP%</th><th>Auto</th><th>Driver</th><th>W/L</th><th>Draft?</th>
        </tr></thead>
        <tbody>${teams.map((row,i)=>{
          const rn = i<3 ? `rank-${i+1}` : 'rank-n';
          const pct = maxScore > 0 ? Math.round(row.score/maxScore*100) : 0;
          const botTypes = [...new Set(row.entries.map(e=>e.botType).filter(Boolean))];
          return `<tr>
            <td><span class="rank-num ${rn}">${i+1}</span></td>
            <td><strong style="color:var(--purple-l)">${row.team}</strong></td>
            <td style="font-size:11px;color:var(--text2)">${botTypes.join(', ')||'—'}</td>
            <td>
              <div class="score-bar-wrap">
                <div class="score-bar-bg"><div class="score-bar-fill" style="width:${pct}%"></div></div>
                <span class="score-num">${row.score.toFixed(0)}</span>
              </div>
            </td>
            <td class="mono" style="color:var(--purple-l)">${row.stats.avgCalcPoints}</td>
            <td class="mono">${row.stats.avgBalls}</td>
            <td class="mono">${row.stats.awpRate}%</td>
            <td>${renderStarsMini(Math.round(row.stats.avgAutoReliability))}</td>
            <td>${renderStarsMini(Math.round(row.stats.avgDriverSkill))}</td>
            <td class="mono">${row.stats.wins}W/${row.stats.losses}L</td>
            <td style="font-size:11px;color:${row.stats.wouldDraftPct>=60?'var(--green)':row.stats.wouldDraftPct<=30?'var(--red)':'var(--text2)'}">${row.stats.wouldDraftPct}%</td>
          </tr>`;
        }).join('')}</tbody>
      </table>
    </div>`;
}

// ── Statistics ────────────────────────────────────────────────────────────────
function calcStats(entries) {
  if (!entries.length) return {
    matches:0, avgCalcPoints:'—', avgBalls:'—', avgAutoBalls:'—', avgDriverBalls:'—',
    avgDescored:'—', awpRate:0, avgRating:'—', avgDriverSkill:'—', avgConsistency:'—',
    avgCoordination:'—', avgAutoReliability:'—', wins:0, losses:0, avgPenalties:0,
    wouldDraftPct:0, avgScore:'—', topStrengths:[], topConcerns:[]
  };
  const avg = arr => arr.length ? +(arr.reduce((a,b)=>a+b,0)/arr.length).toFixed(2) : 0;

  const calcPts  = entries.map(e => calculatePoints(e));
  const blocks   = entries.map(e => (e.autoBalls||0)+(e.driverBalls||0));
  const descored = entries.map(e => e.descored||0);
  const wins     = entries.filter(e=>e.outcome==='win').length;
  const losses   = entries.filter(e=>e.outcome==='loss').length;
  const draftYes = entries.filter(e=>e.wouldDraft==='yes').length;

  const strengthCounts={}, concernCounts={};
  entries.forEach(e=>{
    (e.strengths||[]).forEach(t=>strengthCounts[t]=(strengthCounts[t]||0)+1);
    (e.concerns||[]).forEach(t=>concernCounts[t]=(concernCounts[t]||0)+1);
  });

  return {
    matches:           entries.length,
    avgCalcPoints:     avg(calcPts),
    avgBalls:          avg(blocks),
    avgAutoBalls:      avg(entries.map(e=>e.autoBalls||0)),
    avgDriverBalls:    avg(entries.map(e=>e.driverBalls||0)),
    avgDescored:       avg(descored),
    awpRate:           Math.round(entries.filter(e=>e.awp).length/entries.length*100),
    avgRating:         avg(entries.map(e=>e.overallRating||0).filter(Boolean)),
    avgDriverSkill:    avg(entries.map(e=>e.driverSkill||0).filter(Boolean)),
    avgConsistency:    avg(entries.map(e=>e.consistency||0).filter(Boolean)),
    avgCoordination:   avg(entries.map(e=>e.coordination||0).filter(Boolean)),
    avgAutoReliability:avg(entries.map(e=>e.autoReliability||0).filter(Boolean)),
    wins, losses,
    avgPenalties:      avg(entries.map(e=>e.penalties||0)),
    wouldDraftPct:     Math.round(draftYes/entries.length*100),
    avgScore:          avg(entries.map(e=>e.allianceScore||0).filter(Boolean)),
    topStrengths:      Object.entries(strengthCounts).sort((a,b)=>b[1]-a[1]).slice(0,3).map(([t])=>t),
    topConcerns:       Object.entries(concernCounts).sort((a,b)=>b[1]-a[1]).slice(0,2).map(([t])=>t)
  };
}

// ── Chart config ──────────────────────────────────────────────────────────────
function chartDefaults(opts={}) {
  return {
    responsive:true, maintainAspectRatio:false,
    plugins:{ legend:{ labels:{ color:'#94a3b8', font:{size:11} } } },
    scales:{
      x:{ stacked:opts.stacked, ticks:{color:'#64748b',font:{size:10}}, grid:{color:'#1f2037'} },
      y:{ stacked:opts.stacked, ticks:{color:'#64748b',font:{size:10}}, grid:{color:'#1f2037'}, beginAtZero:true }
    }
  };
}
function radarDefaults() {
  return {
    responsive:true, maintainAspectRatio:false,
    plugins:{ legend:{ labels:{ color:'#94a3b8', font:{size:11} } } },
    scales:{ r:{
      min:0, max:5, ticks:{color:'#64748b',stepSize:1,font:{size:9},backdropColor:'transparent'},
      grid:{color:'#1f2037'}, pointLabels:{color:'#94a3b8',font:{size:11}}, angleLines:{color:'#1f2037'}
    }}
  };
}
function destroyCharts(ids) {
  ids.forEach(id=>{ if(chartInstances[id]){ chartInstances[id].destroy(); delete chartInstances[id]; } });
}

// ── Modals ────────────────────────────────────────────────────────────────────
function showModal(name){ document.getElementById(`modal-${name}`)?.classList.remove('hidden'); }
function closeModal(name){ document.getElementById(`modal-${name}`)?.classList.add('hidden'); }

let pendingDeleteId = null;
function confirmDelete(id) {
  pendingDeleteId = id; showModal('confirmDelete');
  document.getElementById('confirmDeleteBtn').onclick = () => {
    deleteEntry(pendingDeleteId); closeModal('confirmDelete');
    renderHome(); showToast('Entry deleted.','success');
  };
}

// ── Toast ─────────────────────────────────────────────────────────────────────
let toastTimer;
function showToast(msg, type='success') {
  const el=document.getElementById('toast');
  el.textContent=msg; el.className=`toast ${type}`;
  clearTimeout(toastTimer); toastTimer=setTimeout(()=>el.classList.add('hidden'),3200);
}

// ── Export ────────────────────────────────────────────────────────────────────
function exportData() {
  const blob=new Blob([JSON.stringify({comps:getComps(),data:getData()},null,2)],{type:'application/json'});
  triggerDownload(blob,`pb-scout-${Date.now()}.json`); showToast('JSON exported.','success');
}
function exportCSV() {
  const data=getData(); if(!data.length){showToast('No data.','error');return;}
  const comps=Object.fromEntries(getComps().map(c=>[c.id,c.name]));
  const cols=['compName','teamNumber','botType','matchType','matchNumber','alliance','autoBalls','autoGoalsUsed','awp','autoBonus','crossedCenter','autoRoutine','autoReliability','driverBalls','descored','ballsDefended','driverSkill','consistency','coordination','playStyle','penalties','disabled','longZonesControlled','centerUpperControlled','centerLowerControlled','parking','outcome','allianceScore','robotStatus','overallRating','wouldDraft','strengths','concerns','notes','descoringNotes','calculatedPoints','scoutedBy'];
  const rows=data.map(e=>cols.map(c=>{
    if(c==='compName') return `"${comps[e.compId]||''}"`;
    const v=e[c]; if(Array.isArray(v))return `"${v.join(';')}"`;
    if(typeof v==='string'&&v.includes(','))return `"${v}"`;
    return v??'';
  }).join(','));
  const csv=[cols.join(','),...rows].join('\n');
  triggerDownload(new Blob([csv],{type:'text/csv'}),`pb-scout-${Date.now()}.csv`);
  showToast('CSV exported.','success');
}
function triggerDownload(blob,filename){
  const url=URL.createObjectURL(blob), a=document.createElement('a');
  a.href=url; a.download=filename; a.click(); URL.revokeObjectURL(url);
}

// ── Utilities ─────────────────────────────────────────────────────────────────
function fmtDate(iso){if(!iso)return'';const d=new Date(iso+'T00:00:00');return d.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'});}
function truncate(str,n){return str.length>n?str.slice(0,n)+'…':str;}

// ── Init ──────────────────────────────────────────────────────────────────────
(function init(){
  const prefs=getPrefs();
  if(prefs.lastComp&&getComps().find(c=>c.id===prefs.lastComp)) activeCompId=prefs.lastComp;
  loadWeights();
  updateCompSelectors();
  renderHome();
})();
