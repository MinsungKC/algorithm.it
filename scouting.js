// scouting.js — Push Back Scout (VEX 2025-26)
// ─────────────────────────────────────────────────────────────────────────────

// ── Storage keys ──────────────────────────────────────────────────────────────
const KEY_COMPS  = 'pb_comps';
const KEY_DATA   = 'pb_scout_data';
const KEY_PREFS  = 'pb_prefs';

// ── App state ─────────────────────────────────────────────────────────────────
let activeCompId   = null;
let wizardStep     = 1;
const WIZARD_STEPS = 4;
let wizardEntry    = {};          // accumulates form data across steps
let compareTeams   = [];          // team numbers being compared
let chartInstances = {};          // keyed by canvas id

// ── Storage helpers ───────────────────────────────────────────────────────────
const getComps  = () => JSON.parse(localStorage.getItem(KEY_COMPS)  || '[]');
const getData   = () => JSON.parse(localStorage.getItem(KEY_DATA)   || '[]');
const getPrefs  = () => JSON.parse(localStorage.getItem(KEY_PREFS)  || '{}');
const saveComps = d  => localStorage.setItem(KEY_COMPS,  JSON.stringify(d));
const saveData  = d  => localStorage.setItem(KEY_DATA,   JSON.stringify(d));
const savePrefs = d  => localStorage.setItem(KEY_PREFS,  JSON.stringify(d));

function addEntry(entry) {
  const data = getData();
  // Replace if same comp + team + match (re-scout), else push
  const idx = data.findIndex(e => e.compId === entry.compId
    && e.teamNumber === entry.teamNumber
    && e.matchNumber === entry.matchNumber
    && e.matchType === entry.matchType);
  if (idx >= 0) data[idx] = entry; else data.push(entry);
  saveData(data);
}

function deleteEntry(id) {
  saveData(getData().filter(e => e.id !== id));
}

function genId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

// ── View management ───────────────────────────────────────────────────────────
function showView(name) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));

  const view = document.getElementById(`view-${name}`);
  if (view) view.classList.add('active');

  const navBtns = document.querySelectorAll('.nav-link');
  const order = ['home','scout','teams','compare'];
  const idx = order.indexOf(name);
  if (idx >= 0) navBtns[idx].classList.add('active');

  if (name === 'home')    renderHome();
  if (name === 'scout')   initWizard();
  if (name === 'teams')   renderTeams();
  if (name === 'compare') renderCompare();
}

// ── Competition management ────────────────────────────────────────────────────
function setActiveComp(id) {
  activeCompId = id || null;
  const prefs = getPrefs();
  prefs.lastComp = id;
  savePrefs(prefs);
  updateCompSelectors();
  renderHome();
}

function updateCompSelectors() {
  const comps = getComps();
  const opts  = `<option value="">— No Competition —</option>` +
    comps.map(c => `<option value="${c.id}" ${c.id === activeCompId ? 'selected' : ''}>${c.name}</option>`).join('');

  ['compSelect', 'teamCompFilter'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = id === 'teamCompFilter'
      ? `<option value="">All Competitions</option>` + comps.map(c =>
          `<option value="${c.id}">${c.name}</option>`).join('')
      : opts;
  });
}

function submitAddComp() {
  const name = document.getElementById('newCompName').value.trim();
  if (!name) { showToast('Please enter a competition name.', 'error'); return; }
  const comp = {
    id:       genId(),
    name,
    date:     document.getElementById('newCompDate').value,
    location: document.getElementById('newCompLocation').value.trim()
  };
  const comps = getComps();
  comps.push(comp);
  saveComps(comps);
  activeCompId = comp.id;
  savePrefs({ ...getPrefs(), lastComp: comp.id });
  closeModal('addComp');
  updateCompSelectors();
  renderHome();
  showToast(`✓ "${comp.name}" created.`, 'success');
  // clear fields
  ['newCompName','newCompDate','newCompLocation'].forEach(id => { document.getElementById(id).value = ''; });
}

// ── HOME VIEW ─────────────────────────────────────────────────────────────────
function renderHome() {
  const comps = getComps();
  const comp  = comps.find(c => c.id === activeCompId);
  const data  = getData();
  const compData = activeCompId ? data.filter(e => e.compId === activeCompId) : data;

  document.getElementById('homeTitle').textContent = comp ? comp.name : 'Dashboard';
  document.getElementById('homeSubtitle').textContent = comp
    ? `${comp.date ? fmtDate(comp.date) + ' · ' : ''}${comp.location || 'No location set'}`
    : 'Select or add a competition to start scouting.';

  const teams   = [...new Set(compData.map(e => e.teamNumber))];
  const wins    = compData.filter(e => e.outcome === 'win').length;
  const avgBalls = compData.length
    ? (compData.reduce((s, e) => s + (e.driverBalls || 0) + (e.autoBalls || 0), 0) / compData.length).toFixed(1)
    : '—';
  const awpRate = compData.length
    ? Math.round(compData.filter(e => e.awp).length / compData.length * 100) + '%'
    : '—';

  document.getElementById('homeStats').innerHTML = `
    <div class="stat-card">
      <div class="stat-label">Teams Scouted</div>
      <div class="stat-value">${teams.length}</div>
      <div class="stat-sub">${comps.length} competition${comps.length !== 1 ? 's' : ''} total</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Matches Logged</div>
      <div class="stat-value">${compData.length}</div>
      <div class="stat-sub">${data.length} across all comps</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Wins Recorded</div>
      <div class="stat-value">${wins}</div>
      <div class="stat-sub">${compData.length ? Math.round(wins / compData.length * 100) + '% win rate' : 'no data'}</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Avg Balls</div>
      <div class="stat-value">${avgBalls}</div>
      <div class="stat-sub">Auto + Driver total</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">AWP Rate</div>
      <div class="stat-value">${awpRate}</div>
      <div class="stat-sub">Autonomous Win Point</div>
    </div>`;

  // Recent entries
  const recent = [...compData].sort((a, b) => b.createdAt - a.createdAt).slice(0, 8);
  document.getElementById('homeRecent').innerHTML = !compData.length
    ? `<div class="empty-state"><div class="empty-icon">📋</div><p>No scouting data yet.<br>Click <strong>Scout Match</strong> to get started.</p></div>`
    : `<div class="section-title" style="margin-bottom:10px;">Recent Entries</div>
       <div class="card" style="padding:0;overflow:hidden;">
         <table class="match-history-table">
           <thead><tr>
             <th>Team</th><th>Match</th><th>Alliance</th><th>Balls</th><th>AWP</th><th>Rating</th><th>Outcome</th><th></th>
           </tr></thead>
           <tbody>${recent.map(e => `
             <tr>
               <td><strong>${e.teamNumber}</strong></td>
               <td>${e.matchType === 'qual' ? 'Q' : e.matchType === 'elim' ? 'E' : 'P'}${e.matchNumber}</td>
               <td><span class="alliance-pill ${e.alliance}">${e.alliance}</span></td>
               <td class="mono">${(e.autoBalls||0) + (e.driverBalls||0)}</td>
               <td>${e.awp ? '✓' : '—'}</td>
               <td>${renderStarsMini(e.overallRating)}</td>
               <td><span class="outcome-pill ${e.outcome||'tie'}">${e.outcome||'—'}</span></td>
               <td><button class="btn btn-icon btn-ghost btn-sm" style="font-size:11px" onclick="confirmDelete('${e.id}')">✕</button></td>
             </tr>`).join('')}
           </tbody>
         </table>
       </div>`;
}

function renderStarsMini(n) {
  if (!n) return '<span class="text-muted">—</span>';
  return '★'.repeat(n) + '<span style="opacity:.25">★</span>'.repeat(5 - n);
}

// ── SCOUT WIZARD ──────────────────────────────────────────────────────────────
const STEP_LABELS = ['Match Setup', 'Autonomous', 'Driver Control', 'Assessment'];

function initWizard() {
  wizardStep  = 1;
  wizardEntry = {};
  renderWizard();
}

function renderWizard() {
  // Progress
  document.getElementById('progressFill').style.width = (wizardStep / WIZARD_STEPS * 100) + '%';
  document.getElementById('stepIndicators').innerHTML = STEP_LABELS.map((label, i) => {
    const n = i + 1;
    const cls = n < wizardStep ? 'done' : n === wizardStep ? 'active' : '';
    return `<div class="step-dot ${cls}">
      <div class="step-dot-circle">${n < wizardStep ? '✓' : n}</div>
      <span>${label}</span>
    </div>`;
  }).join('');

  document.getElementById('wizardStepLabel').textContent = `Step ${wizardStep} of ${WIZARD_STEPS}`;
  document.getElementById('btnPrev').style.visibility = wizardStep === 1 ? 'hidden' : 'visible';
  document.getElementById('btnNext').textContent = wizardStep === WIZARD_STEPS ? '✓ Submit' : 'Next →';

  document.getElementById('wizardSteps').innerHTML = buildStepHTML(wizardStep);
  restoreStepValues();
}

function buildStepHTML(step) {
  const comps = getComps();
  if (step === 1) return `
    <div class="wizard-card">
      <h2>Match Setup</h2>
      <p class="wizard-sub">Who are you scouting, and in which match?</p>
      <div class="grid-2">
        <div class="form-group">
          <label class="form-label">Team Number *</label>
          <input class="form-input" id="f_teamNumber" placeholder="e.g. 1234A" autocomplete="off">
        </div>
        <div class="form-group">
          <label class="form-label">Match Number *</label>
          <div class="stepper" id="step-matchNumber">
            <button class="stepper-btn" onclick="stepDec('matchNumber',1,99)">−</button>
            <span class="stepper-val" id="val-matchNumber">1</span>
            <button class="stepper-btn" onclick="stepInc('matchNumber',1,99)">+</button>
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
          <button class="toggle-btn red" onclick="toggleSelect('alliance','red',this)">🔴 Red</button>
          <button class="toggle-btn blue" onclick="toggleSelect('alliance','blue',this)">🔵 Blue</button>
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Competition</label>
        <select class="form-input" id="f_compId">
          ${comps.map(c => `<option value="${c.id}" ${c.id === activeCompId ? 'selected' : ''}>${c.name}</option>`).join('') || '<option value="">No competitions — add one first</option>'}
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Scouted By</label>
        <input class="form-input" id="f_scoutedBy" placeholder="Your name (saved for next time)">
      </div>
    </div>`;

  if (step === 2) return `
    <div class="wizard-card">
      <h2>Autonomous Period</h2>
      <p class="wizard-sub">15-second autonomous — no driver control.</p>
      <div class="form-group">
        <label class="form-label">AWP (Autonomous Win Point) Achieved?</label>
        <div class="toggle-group" id="f_awp">
          ${mkToggle('awp',['true','false','unknown'],['✓ Yes','✗ No','Unknown'],'unknown')}
        </div>
        <p class="form-hint">AWP requires both robots to meet the autonomous condition.</p>
      </div>
      <div class="form-group">
        <label class="form-label">Balls Scored in Auto</label>
        <div class="stepper">
          <button class="stepper-btn" onclick="stepDec('autoBalls',0,20)">−</button>
          <span class="stepper-val" id="val-autoBalls">0</span>
          <button class="stepper-btn" onclick="stepInc('autoBalls',0,20)">+</button>
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Crossed Center Line?</label>
        <div class="toggle-group" id="f_crossedCenter">
          ${mkToggle('crossedCenter',['true','false'],['Yes','No'],'false')}
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Auto Routine Type</label>
        <div class="toggle-group" id="f_autoRoutine">
          ${mkToggle('autoRoutine',['none','simple','complex','full'],['None','Simple','Complex','Full Program'],'simple')}
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Auto Reliability</label>
        <div class="star-group" id="f_autoReliability" data-field="autoReliability">
          ${mkStars('autoReliability', 3, 5)}
        </div>
        <p class="form-hint">1 = Crashed · 3 = Usually works · 5 = Flawless</p>
      </div>
      <div class="form-group">
        <label class="form-label">Auto Notes</label>
        <textarea class="form-input" id="f_autoNotes" placeholder="Describe what the robot did in auto..."></textarea>
      </div>
    </div>`;

  if (step === 3) return `
    <div class="wizard-card">
      <h2>Driver Control Period</h2>
      <p class="wizard-sub">1 minute 45 seconds — driver-operated phase.</p>
      <div class="grid-2">
        <div class="form-group">
          <label class="form-label">Balls Scored (own zone)</label>
          <div class="stepper">
            <button class="stepper-btn" onclick="stepDec('driverBalls',0,50)">−</button>
            <span class="stepper-val" id="val-driverBalls">0</span>
            <button class="stepper-btn" onclick="stepInc('driverBalls',0,50)">+</button>
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Balls Defended Back</label>
          <div class="stepper">
            <button class="stepper-btn" onclick="stepDec('ballsDefended',0,30)">−</button>
            <span class="stepper-val" id="val-ballsDefended">0</span>
            <button class="stepper-btn" onclick="stepInc('ballsDefended',0,30)">+</button>
          </div>
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Driver Skill</label>
        <div class="star-group" id="f_driverSkill" data-field="driverSkill">${mkStars('driverSkill', 3, 5)}</div>
        <p class="form-hint">1 = Struggling · 3 = Competent · 5 = Exceptional</p>
      </div>
      <div class="form-group">
        <label class="form-label">Consistency / Accuracy</label>
        <div class="star-group" id="f_consistency" data-field="consistency">${mkStars('consistency', 3, 5)}</div>
      </div>
      <div class="form-group">
        <label class="form-label">Partner Coordination</label>
        <div class="star-group" id="f_coordination" data-field="coordination">${mkStars('coordination', 3, 5)}</div>
        <p class="form-hint">How well did they work with their alliance partner?</p>
      </div>
      <div class="form-group">
        <label class="form-label">Play Style</label>
        <div class="toggle-group" id="f_playStyle">
          ${mkToggle('playStyle',['aggressive','balanced','defensive','strategic'],['Aggressive Push','Balanced','Defensive','Strategic'],'balanced')}
        </div>
      </div>
      <div class="grid-2">
        <div class="form-group">
          <label class="form-label">Penalties / Fouls</label>
          <div class="stepper">
            <button class="stepper-btn" onclick="stepDec('penalties',0,10)">−</button>
            <span class="stepper-val" id="val-penalties">0</span>
            <button class="stepper-btn" onclick="stepInc('penalties',0,10)">+</button>
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Robot Disabled?</label>
          <div class="toggle-group" id="f_disabled">
            ${mkToggle('disabled',['no','briefly','fully'],['No','Briefly','Fully'],'no')}
          </div>
        </div>
      </div>
    </div>`;

  if (step === 4) return `
    <div class="wizard-card">
      <h2>Assessment & Notes</h2>
      <p class="wizard-sub">Overall evaluation of the team's performance.</p>
      <div class="form-group">
        <label class="form-label">Match Outcome</label>
        <div class="toggle-group" id="f_outcome">
          <button class="toggle-btn green" onclick="toggleSelect('outcome','win',this)">🏆 Win</button>
          <button class="toggle-btn red"   onclick="toggleSelect('outcome','loss',this)">✗ Loss</button>
          <button class="toggle-btn" onclick="toggleSelect('outcome','tie',this)">= Tie</button>
        </div>
      </div>
      <div class="grid-2">
        <div class="form-group">
          <label class="form-label">Alliance Score</label>
          <input class="form-input" id="f_allianceScore" type="number" min="0" max="999" placeholder="e.g. 42">
        </div>
        <div class="form-group">
          <label class="form-label">Robot Final Status</label>
          <div class="toggle-group" id="f_robotStatus">
            ${mkToggle('robotStatus',['working','degraded','down'],['Working','Degraded','Down'],'working')}
          </div>
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Overall Team Rating</label>
        <div class="star-group" id="f_overallRating" data-field="overallRating">${mkStars('overallRating', 3, 5)}</div>
        <p class="form-hint">Your overall impression of this team.</p>
      </div>
      <div class="form-group">
        <label class="form-label">Strengths</label>
        <div class="tag-group" id="f_strengths">
          ${['Consistent Auto','Fast Driver','Great Defense','High Accuracy','Strong Push','Partner Sync','Reliable','Efficient Pathing','Good Strategy']
            .map(t => `<button class="tag-btn" data-tag="${t}" onclick="toggleTag('strengths',this)">${t}</button>`).join('')}
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Concerns</label>
        <div class="tag-group" id="f_concerns">
          ${['Slow','Inconsistent','Poor Auto','Over-aggressive','Fragile','Coordination Issues','Penalties','Tipping Risk','Unreliable']
            .map(t => `<button class="tag-btn concern" data-tag="${t}" onclick="toggleTag('concerns',this)">${t}</button>`).join('')}
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Would Draft for Eliminations?</label>
        <div class="toggle-group" id="f_wouldDraft">
          <button class="toggle-btn green"  onclick="toggleSelect('wouldDraft','yes',this)">✓ Yes</button>
          <button class="toggle-btn yellow" onclick="toggleSelect('wouldDraft','maybe',this)">? Maybe</button>
          <button class="toggle-btn red"    onclick="toggleSelect('wouldDraft','no',this)">✗ No</button>
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Match Notes</label>
        <textarea class="form-input" id="f_notes" rows="4" placeholder="Observations, strategy notes, anything notable…"></textarea>
      </div>
    </div>`;
}

// Helpers to build repeatable toggle groups and stars
function mkToggle(field, vals, labels, defaultVal) {
  return vals.map((v, i) =>
    `<button class="toggle-btn" onclick="toggleSelect('${field}','${v}',this)"
     data-field="${field}" data-val="${v}">${labels[i]}</button>`).join('');
}

function mkStars(field, defaultVal, max) {
  return Array.from({length: max}, (_,i) =>
    `<button class="star-btn ${i < defaultVal ? 'lit' : ''}" data-field="${field}" data-val="${i+1}"
     onclick="setStar('${field}', ${i+1})">${'★'}</button>`).join('');
}

// ── Wizard state: stepper values ──────────────────────────────────────────────
const stepperFields = { matchNumber:1, autoBalls:0, driverBalls:0, ballsDefended:0, penalties:0 };

function stepInc(field, min, max) {
  stepperFields[field] = Math.min(max, (stepperFields[field] || 0) + 1);
  const el = document.getElementById(`val-${field}`);
  if (el) el.textContent = stepperFields[field];
}
function stepDec(field, min, max) {
  stepperFields[field] = Math.max(min, (stepperFields[field] || 0) - 1);
  const el = document.getElementById(`val-${field}`);
  if (el) el.textContent = stepperFields[field];
}

// ── Toggle select ─────────────────────────────────────────────────────────────
const toggleValues = {};
function toggleSelect(field, val, btn) {
  toggleValues[field] = val;
  const group = btn.closest('.toggle-group');
  if (group) group.querySelectorAll('.toggle-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
}

// ── Star rating ───────────────────────────────────────────────────────────────
const starValues = {};
function setStar(field, val) {
  starValues[field] = val;
  document.querySelectorAll(`.star-btn[data-field="${field}"]`).forEach(b => {
    b.classList.toggle('lit', parseInt(b.dataset.val) <= val);
  });
}

// ── Tag toggle ────────────────────────────────────────────────────────────────
const tagValues = { strengths: new Set(), concerns: new Set() };
function toggleTag(field, btn) {
  const tag = btn.dataset.tag;
  if (tagValues[field].has(tag)) { tagValues[field].delete(tag); btn.classList.remove('active'); }
  else { tagValues[field].add(tag); btn.classList.add('active'); }
}

// ── Restore values when re-rendering a step ────────────────────────────────────
function restoreStepValues() {
  // Restore steppers
  Object.entries(stepperFields).forEach(([k,v]) => {
    const el = document.getElementById(`val-${k}`);
    if (el) el.textContent = v;
  });
  // Restore toggles
  Object.entries(toggleValues).forEach(([field, val]) => {
    const btn = document.querySelector(`[data-field="${field}"][data-val="${val}"]`);
    if (btn) { btn.classList.add('active'); }
  });
  // Restore stars
  Object.entries(starValues).forEach(([field, val]) => {
    document.querySelectorAll(`.star-btn[data-field="${field}"]`).forEach(b => {
      b.classList.toggle('lit', parseInt(b.dataset.val) <= val);
    });
  });
  // Restore tags
  ['strengths','concerns'].forEach(field => {
    tagValues[field].forEach(tag => {
      const btn = document.querySelector(`[data-tag="${tag}"]`);
      if (btn) btn.classList.add('active');
    });
  });
  // Restore text inputs
  if (wizardEntry.teamNumber && document.getElementById('f_teamNumber'))
    document.getElementById('f_teamNumber').value = wizardEntry.teamNumber;
  if (wizardEntry.scoutedBy && document.getElementById('f_scoutedBy'))
    document.getElementById('f_scoutedBy').value = wizardEntry.scoutedBy || getPrefs().scoutedBy || '';
  // Restore scoutedBy from prefs
  if (!wizardEntry.scoutedBy && document.getElementById('f_scoutedBy'))
    document.getElementById('f_scoutedBy').value = getPrefs().scoutedBy || '';

  if (wizardEntry.allianceScore != null && document.getElementById('f_allianceScore'))
    document.getElementById('f_allianceScore').value = wizardEntry.allianceScore || '';
  if (wizardEntry.autoNotes && document.getElementById('f_autoNotes'))
    document.getElementById('f_autoNotes').value = wizardEntry.autoNotes;
  if (wizardEntry.notes && document.getElementById('f_notes'))
    document.getElementById('f_notes').value = wizardEntry.notes;
}

function collectStep(step) {
  if (step === 1) {
    wizardEntry.teamNumber  = (document.getElementById('f_teamNumber')?.value || '').trim().toUpperCase();
    wizardEntry.matchNumber = stepperFields.matchNumber;
    wizardEntry.matchType   = toggleValues.matchType || 'qual';
    wizardEntry.alliance    = toggleValues.alliance  || 'red';
    wizardEntry.compId      = document.getElementById('f_compId')?.value || activeCompId;
    wizardEntry.scoutedBy   = document.getElementById('f_scoutedBy')?.value || '';
    const prefs = getPrefs(); prefs.scoutedBy = wizardEntry.scoutedBy; savePrefs(prefs);
  }
  if (step === 2) {
    wizardEntry.awp         = toggleValues.awp === 'true';
    wizardEntry.autoBalls   = stepperFields.autoBalls;
    wizardEntry.crossedCenter = toggleValues.crossedCenter === 'true';
    wizardEntry.autoRoutine = toggleValues.autoRoutine || 'simple';
    wizardEntry.autoReliability = starValues.autoReliability || 3;
    wizardEntry.autoNotes   = document.getElementById('f_autoNotes')?.value || '';
  }
  if (step === 3) {
    wizardEntry.driverBalls  = stepperFields.driverBalls;
    wizardEntry.ballsDefended= stepperFields.ballsDefended;
    wizardEntry.driverSkill  = starValues.driverSkill  || 3;
    wizardEntry.consistency  = starValues.consistency  || 3;
    wizardEntry.coordination = starValues.coordination || 3;
    wizardEntry.playStyle    = toggleValues.playStyle  || 'balanced';
    wizardEntry.penalties    = stepperFields.penalties;
    wizardEntry.disabled     = toggleValues.disabled   || 'no';
  }
  if (step === 4) {
    wizardEntry.outcome      = toggleValues.outcome    || 'tie';
    wizardEntry.allianceScore= parseInt(document.getElementById('f_allianceScore')?.value) || 0;
    wizardEntry.robotStatus  = toggleValues.robotStatus || 'working';
    wizardEntry.overallRating= starValues.overallRating || 3;
    wizardEntry.strengths    = [...tagValues.strengths];
    wizardEntry.concerns     = [...tagValues.concerns];
    wizardEntry.wouldDraft   = toggleValues.wouldDraft || 'maybe';
    wizardEntry.notes        = document.getElementById('f_notes')?.value || '';
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
  if (wizardStep === WIZARD_STEPS) {
    submitEntry();
    return;
  }
  wizardStep++;
  renderWizard();
  window.scrollTo(0, 0);
}

function wizardPrev() {
  collectStep(wizardStep);
  if (wizardStep > 1) { wizardStep--; renderWizard(); }
}

function submitEntry() {
  const entry = {
    ...wizardEntry,
    id: genId(),
    createdAt: Date.now()
  };
  addEntry(entry);
  showToast(`✓ Scouted Team ${entry.teamNumber} — ${entry.matchType.charAt(0).toUpperCase()}${entry.matchNumber}`, 'success');
  // Reset wizard state
  wizardEntry = {};
  tagValues.strengths = new Set();
  tagValues.concerns  = new Set();
  Object.keys(toggleValues).forEach(k => delete toggleValues[k]);
  Object.keys(starValues).forEach(k => delete starValues[k]);
  Object.keys(stepperFields).forEach(k => { stepperFields[k] = k === 'matchNumber' ? (stepperFields.matchNumber || 1) + 1 : 0; });
  wizardStep = 1;
  renderWizard();
  renderHome();
}

// ── TEAMS VIEW ────────────────────────────────────────────────────────────────
function renderTeams() {
  const search  = (document.getElementById('teamSearch')?.value || '').toLowerCase();
  const compFilter = document.getElementById('teamCompFilter')?.value || '';
  let   data    = getData();

  if (compFilter) data = data.filter(e => e.compId === compFilter);

  // Group by team
  const teamMap = {};
  data.forEach(e => {
    if (!teamMap[e.teamNumber]) teamMap[e.teamNumber] = [];
    teamMap[e.teamNumber].push(e);
  });

  let teams = Object.entries(teamMap);
  if (search) teams = teams.filter(([t, entries]) =>
    t.toLowerCase().includes(search) ||
    entries.some(e => (e.notes || '').toLowerCase().includes(search)));

  teams.sort((a, b) => b[1].length - a[1].length);

  const content = document.getElementById('teamsContent');
  if (!teams.length) {
    content.innerHTML = `<div class="empty-state"><div class="empty-icon">🤖</div><p>No teams found.<br>Scout some matches to see teams here.</p></div>`;
    return;
  }

  content.innerHTML = `<div class="teams-grid">${teams.map(([t, entries]) => {
    const stats = calcStats(entries);
    return `<div class="team-card" onclick="renderTeamDetail('${t}')">
      <div class="team-number">${t}</div>
      <div class="team-matches">${entries.length} match${entries.length !== 1 ? 'es' : ''} scouted</div>
      <div class="team-avg">Avg balls: <span>${stats.avgBalls}</span></div>
      <div class="team-avg">AWP rate: <span>${stats.awpRate}%</span></div>
      <div class="team-avg">Rating: <span>${stats.avgRating}/5</span></div>
      ${stats.wins || stats.losses
        ? `<span class="win-badge ${stats.wins > stats.losses ? 'win' : 'loss'}">${stats.wins}W ${stats.losses}L</span>`
        : ''}
    </div>`;
  }).join('')}</div>`;
}

// ── TEAM DETAIL ───────────────────────────────────────────────────────────────
function renderTeamDetail(teamNumber) {
  const data    = getData().filter(e => e.teamNumber === teamNumber);
  const stats   = calcStats(data);
  const content = document.getElementById('teamsContent');

  destroyCharts(['teamBallsChart','teamAutoChart']);

  content.innerHTML = `
    <button class="back-btn" onclick="renderTeams()">← Back to Teams</button>
    <div class="team-detail-header">
      <div class="team-badge">TEAM<br>${teamNumber}</div>
      <div>
        <div style="font-size:24px;font-weight:800;color:var(--purple-l);font-family:var(--mono)">${teamNumber}</div>
        <div class="text-muted" style="font-size:13px;">${data.length} matches · AWP ${stats.awpRate}% · Draft: ${stats.wouldDraftPct}% Yes</div>
        <div style="margin-top:6px;display:flex;gap:6px;flex-wrap:wrap">
          ${stats.topStrengths.map(t=>`<span class="tag tag-strength">${t}</span>`).join('')}
          ${stats.topConcerns.map(t=>`<span class="tag tag-concern">${t}</span>`).join('')}
        </div>
      </div>
    </div>

    <div class="detail-stats-row">
      <div class="detail-stat"><div class="ds-val">${stats.avgBalls}</div><div class="ds-label">Avg Balls</div></div>
      <div class="detail-stat"><div class="ds-val">${stats.avgAutoBalls}</div><div class="ds-label">Avg Auto Balls</div></div>
      <div class="detail-stat"><div class="ds-val">${stats.awpRate}%</div><div class="ds-label">AWP Rate</div></div>
      <div class="detail-stat"><div class="ds-val">${stats.wins}W/${stats.losses}L</div><div class="ds-label">Record</div></div>
      <div class="detail-stat"><div class="ds-val">${stats.avgRating}</div><div class="ds-label">Avg Rating</div></div>
      <div class="detail-stat"><div class="ds-val">${stats.avgScore}</div><div class="ds-label">Avg Alliance Score</div></div>
    </div>

    <div class="grid-2" style="margin-bottom:20px">
      <div class="card">
        <div class="section-title">Balls Per Match</div>
        <div class="chart-container"><canvas id="teamBallsChart"></canvas></div>
      </div>
      <div class="card">
        <div class="section-title">Performance Ratings</div>
        <div class="radar-container"><canvas id="teamAutoChart"></canvas></div>
      </div>
    </div>

    <div class="section-title">Match History</div>
    <div class="card" style="padding:0;overflow:hidden;">
      <table class="match-history-table">
        <thead><tr>
          <th>Match</th><th>Alliance</th><th>Auto</th><th>Driver</th><th>AWP</th><th>Rating</th><th>Outcome</th><th>Notes</th>
        </tr></thead>
        <tbody>${data.sort((a,b) => a.matchNumber - b.matchNumber).map(e => `
          <tr>
            <td>${e.matchType === 'qual' ? 'Q' : e.matchType === 'elim' ? 'E' : 'P'}${e.matchNumber}</td>
            <td><span class="alliance-pill ${e.alliance}">${e.alliance}</span></td>
            <td class="mono">${e.autoBalls || 0}</td>
            <td class="mono">${e.driverBalls || 0}</td>
            <td>${e.awp ? '<span style="color:var(--green)">✓</span>' : '—'}</td>
            <td>${renderStarsMini(e.overallRating)}</td>
            <td><span class="outcome-pill ${e.outcome||'tie'}">${e.outcome||'—'}</span></td>
            <td style="max-width:180px;font-size:11px;color:var(--text2)">${e.notes ? truncate(e.notes, 60) : '—'}</td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>`;

  // Build charts after DOM update
  setTimeout(() => buildTeamCharts(data), 50);
}

function buildTeamCharts(entries) {
  const sorted = [...entries].sort((a,b) => a.matchNumber - b.matchNumber);

  // Bar chart: balls per match
  const bc = document.getElementById('teamBallsChart');
  if (bc) {
    chartInstances['teamBallsChart'] = new Chart(bc, {
      type: 'bar',
      data: {
        labels: sorted.map(e => `${e.matchType==='qual'?'Q':'E'}${e.matchNumber}`),
        datasets: [
          { label: 'Auto',   data: sorted.map(e => e.autoBalls||0),   backgroundColor: 'rgba(167,139,250,0.7)', borderRadius: 4 },
          { label: 'Driver', data: sorted.map(e => e.driverBalls||0), backgroundColor: 'rgba(59,130,246,0.7)',  borderRadius: 4 }
        ]
      },
      options: chartDefaults({ stacked: true })
    });
  }

  // Radar chart: ratings
  const rc = document.getElementById('teamAutoChart');
  if (rc) {
    const avg = field => {
      const vals = entries.map(e => e[field]).filter(Boolean);
      return vals.length ? (vals.reduce((a,b)=>a+b,0)/vals.length) : 0;
    };
    chartInstances['teamAutoChart'] = new Chart(rc, {
      type: 'radar',
      data: {
        labels: ['Driver Skill','Consistency','Coordination','Auto Reliability','Overall'],
        datasets: [{
          label: entries[0]?.teamNumber || '',
          data: [avg('driverSkill'), avg('consistency'), avg('coordination'), avg('autoReliability'), avg('overallRating')],
          backgroundColor: 'rgba(124,58,237,0.2)',
          borderColor: '#a78bfa',
          pointBackgroundColor: '#a78bfa',
          borderWidth: 2
        }]
      },
      options: radarDefaults()
    });
  }
}

// ── COMPARE VIEW ──────────────────────────────────────────────────────────────
function addCompareTeam() {
  const input = document.getElementById('compareInput');
  const t = (input.value || '').trim().toUpperCase();
  if (!t) return;
  const data = getData();
  const exists = data.some(e => e.teamNumber === t);
  if (!exists) { showToast(`No data for team ${t}.`, 'error'); return; }
  if (compareTeams.includes(t)) { showToast(`${t} already added.`, 'error'); return; }
  if (compareTeams.length >= 4) { showToast('Max 4 teams for comparison.', 'error'); return; }
  compareTeams.push(t);
  input.value = '';
  renderCompare();
}

function removeCompareTeam(t) {
  compareTeams = compareTeams.filter(x => x !== t);
  renderCompare();
}

const COMPARE_COLORS = ['#a78bfa','#60a5fa','#34d399','#fb923c'];

function renderCompare() {
  const chipsEl = document.getElementById('compareChips');
  chipsEl.innerHTML = compareTeams.map((t, i) =>
    `<div class="team-chip" style="border-color:${COMPARE_COLORS[i]}55;color:${COMPARE_COLORS[i]}">
      ${t}
      <button class="chip-remove" onclick="removeCompareTeam('${t}')">✕</button>
    </div>`).join('');

  const content = document.getElementById('compareContent');
  if (!compareTeams.length) {
    content.innerHTML = `<div class="empty-state"><div class="empty-icon">⚖️</div><p>Add team numbers above to compare.</p></div>`;
    return;
  }

  const statsArr  = compareTeams.map(t => ({ team: t, ...calcStats(getData().filter(e => e.teamNumber === t)) }));

  const ROWS = [
    { key:'avgBalls',      label:'Avg Total Balls', higher:true },
    { key:'avgAutoBalls',  label:'Avg Auto Balls',  higher:true },
    { key:'avgDriverBalls',label:'Avg Driver Balls',higher:true },
    { key:'awpRate',       label:'AWP Rate (%)',     higher:true },
    { key:'avgRating',     label:'Avg Overall Rating',higher:true },
    { key:'avgDriverSkill',label:'Avg Driver Skill', higher:true },
    { key:'avgConsistency',label:'Avg Consistency',  higher:true },
    { key:'avgCoordination',label:'Avg Coordination',higher:true },
    { key:'avgAutoReliability',label:'Avg Auto Reliability',higher:true },
    { key:'wins',          label:'Wins',             higher:true },
    { key:'losses',        label:'Losses',           higher:false },
    { key:'avgPenalties',  label:'Avg Penalties',    higher:false },
    { key:'wouldDraftPct', label:'Would Draft (%)',   higher:true },
    { key:'avgScore',      label:'Avg Alliance Score',higher:true },
    { key:'matches',       label:'Matches Scouted',  higher:true }
  ];

  const tableRows = ROWS.map(row => {
    const vals = statsArr.map(s => parseFloat(s[row.key]) || 0);
    const best  = row.higher ? Math.max(...vals) : Math.min(...vals);
    const worst = row.higher ? Math.min(...vals) : Math.max(...vals);
    const cells = statsArr.map((s, i) => {
      const v = parseFloat(s[row.key]) || 0;
      const cls = vals.filter(Boolean).length > 1
        ? (v === best ? 'best' : v === worst && best !== worst ? 'worst' : '')
        : '';
      return `<td class="${cls}" style="color:${cls==='best' ? 'var(--green)' : cls==='worst' ? 'var(--red)' : 'var(--text2)'}">${s[row.key]}</td>`;
    });
    return `<tr><td>${row.label}</td>${cells.join('')}</tr>`;
  }).join('');

  destroyCharts(['compareRadar']);

  content.innerHTML = `
    <div class="card" style="overflow:auto;margin-bottom:20px;">
      <table class="compare-table">
        <thead><tr>
          <th>Metric</th>
          ${statsArr.map((s, i) => `<th style="color:${COMPARE_COLORS[i]}">${s.team}</th>`).join('')}
        </tr></thead>
        <tbody>${tableRows}</tbody>
      </table>
    </div>
    <div class="card" style="max-width:500px;margin:0 auto;">
      <div class="section-title">Skill Radar</div>
      <div class="radar-container"><canvas id="compareRadar"></canvas></div>
    </div>`;

  setTimeout(() => {
    const rc = document.getElementById('compareRadar');
    if (!rc) return;
    const avgFn = (entries, field) => {
      const vals = entries.map(e => e[field]).filter(Boolean);
      return vals.length ? +(vals.reduce((a,b)=>a+b,0)/vals.length).toFixed(2) : 0;
    };
    chartInstances['compareRadar'] = new Chart(rc, {
      type: 'radar',
      data: {
        labels: ['Driver Skill','Consistency','Coordination','Auto Reliability','Overall Rating'],
        datasets: compareTeams.map((t, i) => {
          const entries = getData().filter(e => e.teamNumber === t);
          return {
            label: t,
            data: ['driverSkill','consistency','coordination','autoReliability','overallRating'].map(f => avgFn(entries, f)),
            backgroundColor: COMPARE_COLORS[i] + '22',
            borderColor: COMPARE_COLORS[i],
            pointBackgroundColor: COMPARE_COLORS[i],
            borderWidth: 2
          };
        })
      },
      options: radarDefaults()
    });
  }, 50);
}

// ── Statistics helper ─────────────────────────────────────────────────────────
function calcStats(entries) {
  if (!entries.length) return { avgBalls:'—', avgAutoBalls:'—', avgDriverBalls:'—', awpRate:0, avgRating:'—', avgDriverSkill:'—', avgConsistency:'—', avgCoordination:'—', avgAutoReliability:'—', wins:0, losses:0, avgPenalties:0, wouldDraftPct:0, avgScore:'—', matches:0, topStrengths:[], topConcerns:[] };

  const avg = (arr) => arr.length ? +(arr.reduce((a,b)=>a+b,0)/arr.length).toFixed(2) : 0;

  const balls       = entries.map(e => (e.autoBalls||0) + (e.driverBalls||0));
  const autoBalls   = entries.map(e => e.autoBalls   || 0);
  const driverBalls = entries.map(e => e.driverBalls || 0);
  const awpCount    = entries.filter(e => e.awp).length;
  const wins        = entries.filter(e => e.outcome === 'win').length;
  const losses      = entries.filter(e => e.outcome === 'loss').length;
  const draftYes    = entries.filter(e => e.wouldDraft === 'yes').length;

  // Tally tags
  const strengthCounts = {}, concernCounts = {};
  entries.forEach(e => {
    (e.strengths || []).forEach(t => strengthCounts[t] = (strengthCounts[t]||0)+1);
    (e.concerns  || []).forEach(t => concernCounts[t]  = (concernCounts[t] ||0)+1);
  });
  const topStrengths = Object.entries(strengthCounts).sort((a,b)=>b[1]-a[1]).slice(0,3).map(([t])=>t);
  const topConcerns  = Object.entries(concernCounts).sort((a,b)=>b[1]-a[1]).slice(0,2).map(([t])=>t);

  return {
    matches:          entries.length,
    avgBalls:         avg(balls),
    avgAutoBalls:     avg(autoBalls),
    avgDriverBalls:   avg(driverBalls),
    awpRate:          Math.round(awpCount / entries.length * 100),
    avgRating:        avg(entries.map(e => e.overallRating || 0).filter(Boolean)),
    avgDriverSkill:   avg(entries.map(e => e.driverSkill || 0).filter(Boolean)),
    avgConsistency:   avg(entries.map(e => e.consistency || 0).filter(Boolean)),
    avgCoordination:  avg(entries.map(e => e.coordination || 0).filter(Boolean)),
    avgAutoReliability: avg(entries.map(e => e.autoReliability || 0).filter(Boolean)),
    wins, losses,
    avgPenalties:     avg(entries.map(e => e.penalties || 0)),
    wouldDraftPct:    Math.round(draftYes / entries.length * 100),
    avgScore:         avg(entries.map(e => e.allianceScore || 0).filter(Boolean)),
    topStrengths, topConcerns
  };
}

// ── Chart config ──────────────────────────────────────────────────────────────
function chartDefaults(opts = {}) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { labels: { color: '#94a3b8', font: { size: 11 } } } },
    scales: {
      x: { stacked: opts.stacked, ticks: { color: '#64748b', font: { size: 10 } }, grid: { color: '#1f2037' } },
      y: { stacked: opts.stacked, ticks: { color: '#64748b', font: { size: 10 } }, grid: { color: '#1f2037' }, beginAtZero: true }
    }
  };
}

function radarDefaults() {
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { labels: { color: '#94a3b8', font: { size: 11 } } } },
    scales: {
      r: {
        min: 0, max: 5,
        ticks: { color: '#64748b', stepSize: 1, font: { size: 9 }, backdropColor: 'transparent' },
        grid:        { color: '#1f2037' },
        pointLabels: { color: '#94a3b8', font: { size: 11 } },
        angleLines:  { color: '#1f2037' }
      }
    }
  };
}

function destroyCharts(ids) {
  ids.forEach(id => {
    if (chartInstances[id]) { chartInstances[id].destroy(); delete chartInstances[id]; }
  });
}

// ── Modals ────────────────────────────────────────────────────────────────────
function showModal(name) {
  document.getElementById(`modal-${name}`)?.classList.remove('hidden');
}
function closeModal(name) {
  document.getElementById(`modal-${name}`)?.classList.add('hidden');
}

let pendingDeleteId = null;
function confirmDelete(id) {
  pendingDeleteId = id;
  showModal('confirmDelete');
  document.getElementById('confirmDeleteBtn').onclick = () => {
    deleteEntry(pendingDeleteId);
    closeModal('confirmDelete');
    renderHome();
    showToast('Entry deleted.', 'success');
  };
}

// ── Toast ─────────────────────────────────────────────────────────────────────
let toastTimer;
function showToast(msg, type = 'success') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = `toast ${type}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add('hidden'), 3000);
}

// ── Export ────────────────────────────────────────────────────────────────────
function exportData() {
  const blob = new Blob([JSON.stringify({ comps: getComps(), data: getData() }, null, 2)], { type: 'application/json' });
  triggerDownload(blob, `pb-scout-${Date.now()}.json`);
  showToast('JSON exported.', 'success');
}

function exportCSV() {
  const data = getData();
  if (!data.length) { showToast('No data to export.', 'error'); return; }
  const comps = Object.fromEntries(getComps().map(c => [c.id, c.name]));
  const cols = ['compName','teamNumber','matchType','matchNumber','alliance','autoBalls','awp','crossedCenter','autoRoutine','autoReliability','driverBalls','ballsDefended','driverSkill','consistency','coordination','playStyle','penalties','disabled','outcome','allianceScore','robotStatus','overallRating','wouldDraft','strengths','concerns','notes','scoutedBy'];
  const rows = data.map(e => cols.map(c => {
    if (c === 'compName') return `"${comps[e.compId] || ''}"`;
    const v = e[c];
    if (Array.isArray(v)) return `"${v.join(';')}"`;
    if (typeof v === 'string' && v.includes(',')) return `"${v}"`;
    return v ?? '';
  }).join(','));
  const csv = [cols.join(','), ...rows].join('\n');
  triggerDownload(new Blob([csv], { type: 'text/csv' }), `pb-scout-${Date.now()}.csv`);
  showToast('CSV exported.', 'success');
}

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a   = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

// ── Utilities ─────────────────────────────────────────────────────────────────
function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
function truncate(str, n) { return str.length > n ? str.slice(0, n) + '…' : str; }

// ── Init ──────────────────────────────────────────────────────────────────────
(function init() {
  const prefs = getPrefs();
  if (prefs.lastComp && getComps().find(c => c.id === prefs.lastComp)) {
    activeCompId = prefs.lastComp;
  }
  updateCompSelectors();
  renderHome();
})();
