// field.js — Robot Localization Field logic
// ─────────────────────────────────────────────────────────────────────────────

// ── Constants ────────────────────────────────────────────────────────────────
const FIELD_UNITS   = 12;      // field spans 0..12 on both axes
const ROBOT_HALF    = 0.45;    // robot "radius" in field units (treated as square half-side)
const SENSOR_RANGE  = 0.32;    // max sensor offset along its side (field units)
const ROT_HANDLE_R  = 8;       // hit radius for rotation handles in canvas px

// Sensor colors: front, right, back, left
const SENSOR_COLORS = ['#facc15', '#4ade80', '#38bdf8', '#fb923c'];

// ── State ────────────────────────────────────────────────────────────────────
let objects = [];       // { id, type, x, y, label, width?, height?, angle? }
let robot   = { x: 6, y: 6, angle: 0 };

// Per-sensor offset in [-1,1], scaled by SENSOR_RANGE
let sensorOffsets = [0, 0, 0, 0];

// Exported sensor distances (global so algorithm code can read them)
let distance1 = 0, distance2 = 0, distance3 = 0, distance4 = 0;

let selectedId = null;          // 'robot' | object id | null
let dragging   = null;          // { mode, id?, offX?, offY? }
let idCounter  = 0;

// ── Canvas setup ─────────────────────────────────────────────────────────────
const canvas = document.getElementById('fieldCanvas');
const ctx    = canvas.getContext('2d');

function resizeCanvas() {
  const area = document.querySelector('.field-area');
  const sz   = Math.max(280, Math.min(area.clientWidth - 36, area.clientHeight - 36));
  canvas.width  = sz;
  canvas.height = sz;
  draw();
}
window.addEventListener('resize', resizeCanvas);

// ── Coordinate helpers ────────────────────────────────────────────────────────
function pad()   { return canvas.width * 0.08; }
function inner() { return canvas.width - pad() * 2; }
function unitPx(){ return inner() / FIELD_UNITS; }

function fieldToCanvas(fx, fy) {
  const p = pad(), i = inner();
  return {
    x: p + (fx / FIELD_UNITS) * i,
    y: p + (1 - fy / FIELD_UNITS) * i
  };
}

function canvasToField(cx, cy) {
  const p = pad(), i = inner();
  return {
    x: parseFloat(((cx - p) / i * FIELD_UNITS).toFixed(3)),
    y: parseFloat(((1 - (cy - p) / i) * FIELD_UNITS).toFixed(3))
  };
}

function insideField(cx, cy) {
  const p = pad(), i = inner();
  return cx >= p && cx <= p + i && cy >= p && cy <= p + i;
}

function clampField(v) { return Math.max(0, Math.min(FIELD_UNITS, v)); }

// ── Drawing ───────────────────────────────────────────────────────────────────
function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawBackground();
  drawGrid();
  drawAxes();
  objects.forEach(drawObject);
  drawRobot();
  drawSensors();
  if (selectedId !== null && selectedId !== 'robot') {
    const o = objects.find(o => o.id === selectedId);
    if (o && o.type === 'obstacle') drawObstacleRotHandle(o);
  }
  if (selectedId === 'robot') drawRobotRotHandle();
}

function drawBackground() {
  const p = pad(), i = inner();
  ctx.shadowColor = 'rgba(139,92,246,0.12)';
  ctx.shadowBlur  = 28;
  ctx.fillStyle   = '#12141f';
  ctx.fillRect(p, p, i, i);
  ctx.shadowBlur  = 0;
  ctx.strokeStyle = '#4c4f8a';
  ctx.lineWidth   = 2;
  ctx.strokeRect(p, p, i, i);
}

function drawGrid() {
  const p = pad(), i = inner();
  ctx.lineWidth = 0.5;
  for (let v = 0; v <= FIELD_UNITS; v++) {
    const t  = v / FIELD_UNITS;
    const px = p + t * i;
    const py = p + t * i;
    ctx.strokeStyle = (v === 0 || v === FIELD_UNITS) ? 'transparent' : '#1b1f35';
    ctx.beginPath(); ctx.moveTo(px, p); ctx.lineTo(px, p + i); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(p, py); ctx.lineTo(p + i, py); ctx.stroke();
  }
}

function drawAxes() {
  const p = pad(), i = inner(), u = unitPx();
  const s = canvas.width;

  // Tick labels
  ctx.fillStyle  = '#3a4060';
  ctx.font       = `${Math.max(8, s * 0.016)}px 'SF Mono', monospace`;
  ctx.textAlign  = 'center';
  for (let v = 0; v <= FIELD_UNITS; v++) {
    const pt = fieldToCanvas(v, 0);
    ctx.fillText(v, pt.x, p + i + p * 0.6);
    const pt2 = fieldToCanvas(0, v);
    ctx.textAlign = 'right';
    ctx.fillText(v, p - 5, pt2.y + 4);
    ctx.textAlign = 'center';
  }

  // Axis labels
  ctx.fillStyle = '#3a4060';
  ctx.font = `bold ${Math.max(9, s * 0.018)}px 'Segoe UI', sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillText('X', p + i + p * 0.55, p + i / 2 + 4);
  ctx.textAlign = 'left';
  ctx.fillText('Y', p + i / 2 + 6, p - 6);
}

function drawObject(o) {
  if (o.type === 'landmark') drawLandmark(o);
  else drawObstacle(o);
}

function drawLandmark(o) {
  const cp  = fieldToCanvas(o.x, o.y);
  const s   = canvas.width;
  const r   = Math.max(7, s * 0.016);
  const sel = selectedId === o.id;

  if (sel) {
    ctx.beginPath();
    ctx.arc(cp.x, cp.y, r + 6, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(96,165,250,0.1)';
    ctx.fill();
  }

  const h = r * 1.9;
  ctx.beginPath();
  ctx.moveTo(cp.x, cp.y - h);
  ctx.lineTo(cp.x + h * 0.85, cp.y + h * 0.5);
  ctx.lineTo(cp.x - h * 0.85, cp.y + h * 0.5);
  ctx.closePath();
  ctx.fillStyle   = sel ? '#93c5fd' : '#3b82f6';
  ctx.fill();
  ctx.strokeStyle = sel ? '#bfdbfe' : '#60a5fa';
  ctx.lineWidth   = 1.5;
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(cp.x, cp.y + h * 0.1, r * 0.28, 0, Math.PI * 2);
  ctx.fillStyle = '#dbeafe';
  ctx.fill();

  ctx.fillStyle  = '#94a3b8';
  ctx.font       = `${Math.max(8, s * 0.015)}px 'Segoe UI', sans-serif`;
  ctx.textAlign  = 'center';
  ctx.fillText(o.label, cp.x, cp.y + h * 0.5 + 13);
}

function drawObstacle(o) {
  const cp  = fieldToCanvas(o.x, o.y);
  const u   = unitPx();
  const pw  = o.width  * u;
  const ph  = o.height * u;
  const sel = selectedId === o.id;
  const rad = o.angle * Math.PI / 180;

  ctx.save();
  ctx.translate(cp.x, cp.y);
  ctx.rotate(-rad);   // negate: field CCW → canvas CW (Y-flip)

  // Shadow glow when selected
  if (sel) {
    ctx.shadowColor = 'rgba(248,113,113,0.4)';
    ctx.shadowBlur  = 14;
  }

  ctx.fillStyle   = sel ? '#fca5a5' : '#dc2626';
  ctx.strokeStyle = sel ? '#fecaca' : '#f87171';
  ctx.lineWidth   = sel ? 2 : 1.5;
  ctx.beginPath();
  ctx.rect(-pw / 2, -ph / 2, pw, ph);
  ctx.fill();
  ctx.stroke();

  ctx.shadowBlur = 0;

  // X mark
  ctx.strokeStyle = 'rgba(0,0,0,0.25)';
  ctx.lineWidth   = 1.2;
  ctx.beginPath();
  ctx.moveTo(-pw * 0.35, -ph * 0.35); ctx.lineTo(pw * 0.35, ph * 0.35);
  ctx.moveTo( pw * 0.35, -ph * 0.35); ctx.lineTo(-pw * 0.35, ph * 0.35);
  ctx.stroke();

  ctx.restore();

  // Label below
  const s = canvas.width;
  ctx.fillStyle  = '#94a3b8';
  ctx.font       = `${Math.max(8, s * 0.015)}px 'Segoe UI', sans-serif`;
  ctx.textAlign  = 'center';
  ctx.fillText(o.label, cp.x, cp.y + ph / 2 + 13);
}

function drawObstacleRotHandle(o) {
  const hp = getObstRotHandleField(o);
  const cp = fieldToCanvas(hp.x, hp.y);
  ctx.beginPath();
  ctx.arc(cp.x, cp.y, 5, 0, Math.PI * 2);
  ctx.fillStyle   = '#fecaca';
  ctx.fill();
  ctx.strokeStyle = '#f87171';
  ctx.lineWidth   = 1.5;
  ctx.stroke();
  // Line from obstacle center to handle
  const oc = fieldToCanvas(o.x, o.y);
  ctx.beginPath();
  ctx.moveTo(oc.x, oc.y);
  ctx.lineTo(cp.x, cp.y);
  ctx.strokeStyle = 'rgba(248,113,113,0.4)';
  ctx.lineWidth   = 1;
  ctx.stroke();
}

function drawRobot() {
  const cp  = fieldToCanvas(robot.x, robot.y);
  const s   = canvas.width;
  const r   = Math.max(9, s * 0.022);
  const sel = selectedId === 'robot';
  const rad = robot.angle * Math.PI / 180;

  ctx.save();
  ctx.translate(cp.x, cp.y);
  ctx.rotate(-rad);   // negate for Y-flip

  if (sel) {
    ctx.beginPath();
    ctx.arc(0, 0, r + 7, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(167,139,250,0.5)';
    ctx.lineWidth   = 1.5;
    ctx.stroke();
  }

  // Glow
  ctx.shadowColor = '#a78bfa';
  ctx.shadowBlur  = 16;

  // Body
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fillStyle   = sel ? '#c4b5fd' : '#8b5cf6';
  ctx.fill();
  ctx.strokeStyle = '#c4b5fd';
  ctx.lineWidth   = 2;
  ctx.stroke();
  ctx.shadowBlur  = 0;

  // Direction arrow
  ctx.strokeStyle = '#fff';
  ctx.lineWidth   = 2;
  ctx.lineCap     = 'round';
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(r * 1.05, 0);
  ctx.stroke();

  // Arrowhead
  ctx.beginPath();
  ctx.moveTo(r * 1.05, 0);
  ctx.lineTo(r * 0.78, -r * 0.3);
  ctx.lineTo(r * 0.78,  r * 0.3);
  ctx.closePath();
  ctx.fillStyle = '#fff';
  ctx.fill();

  // Center dot
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.18, 0, Math.PI * 2);
  ctx.fillStyle = '#ede9fe';
  ctx.fill();

  ctx.restore();

  // Label
  ctx.fillStyle = '#a78bfa';
  ctx.font      = `bold ${Math.max(8, s * 0.015)}px 'Segoe UI', sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillText('Robot', cp.x, cp.y + r + 14);
}

function drawRobotRotHandle() {
  const hp = getRobotRotHandleField();
  const cp = fieldToCanvas(hp.x, hp.y);
  const rc = fieldToCanvas(robot.x, robot.y);
  // Connecting line
  ctx.beginPath();
  ctx.moveTo(rc.x, rc.y);
  ctx.lineTo(cp.x, cp.y);
  ctx.strokeStyle = 'rgba(167,139,250,0.35)';
  ctx.lineWidth   = 1;
  ctx.stroke();
  // Handle circle
  ctx.beginPath();
  ctx.arc(cp.x, cp.y, 5, 0, Math.PI * 2);
  ctx.fillStyle   = '#ede9fe';
  ctx.fill();
  ctx.strokeStyle = '#a78bfa';
  ctx.lineWidth   = 1.5;
  ctx.stroke();
}

function drawSensors() {
  const info = getSensorInfo();
  info.forEach((s, i) => {
    const sp  = fieldToCanvas(s.pos.x, s.pos.y);
    const ep  = fieldToCanvas(
      s.pos.x + s.dir.x * s.dist,
      s.pos.y + s.dir.y * s.dist
    );
    const col = SENSOR_COLORS[i];

    // Ray line (dashed)
    ctx.save();
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = col + '88';
    ctx.lineWidth   = 1;
    ctx.beginPath();
    ctx.moveTo(sp.x, sp.y);
    ctx.lineTo(ep.x, ep.y);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();

    // Hit marker
    ctx.beginPath();
    ctx.arc(ep.x, ep.y, 3, 0, Math.PI * 2);
    ctx.fillStyle = col;
    ctx.fill();

    // Sensor dot on robot surface
    ctx.beginPath();
    ctx.arc(sp.x, sp.y, 4, 0, Math.PI * 2);
    ctx.fillStyle   = col;
    ctx.fill();
    ctx.strokeStyle = '#0f1117';
    ctx.lineWidth   = 1;
    ctx.stroke();
  });
}

// ── Rotation handle positions (field coords) ──────────────────────────────────
function getRobotRotHandleField() {
  const θ    = robot.angle * Math.PI / 180;
  const dist = ROBOT_HALF * 3.0;
  return {
    x: robot.x + dist * Math.cos(θ),
    y: robot.y + dist * Math.sin(θ)
  };
}

function getObstRotHandleField(o) {
  // Handle sits along obstacle's local +Y axis (field coords), above obstacle center
  const θ    = o.angle * Math.PI / 180;
  const dist = o.height / 2 + 0.7;
  // Local +Y in field: (-sinθ, cosθ)
  return {
    x: o.x - dist * Math.sin(θ),
    y: o.y + dist * Math.cos(θ)
  };
}

// ── Sensor math ───────────────────────────────────────────────────────────────
// Returns array of 4 { pos:{x,y}, dir:{x,y}, dist } in field coordinates.
function getSensorInfo() {
  const θ    = robot.angle * Math.PI / 180;
  const cosA = Math.cos(θ), sinA = Math.sin(θ);
  const R    = ROBOT_HALF;

  // frontDir = (cosA, sinA)
  // rightDir = (sinA, -cosA)

  const defs = [
    // Front (d1): sits on front face, slides along rightDir
    {
      px: robot.x + R * cosA + sensorOffsets[0] * SENSOR_RANGE * sinA,
      py: robot.y + R * sinA - sensorOffsets[0] * SENSOR_RANGE * cosA,
      dx: cosA, dy: sinA
    },
    // Right (d2): sits on right face, slides along -frontDir
    {
      px: robot.x + R * sinA - sensorOffsets[1] * SENSOR_RANGE * cosA,
      py: robot.y - R * cosA - sensorOffsets[1] * SENSOR_RANGE * sinA,
      dx: sinA, dy: -cosA
    },
    // Back (d3): sits on back face, slides along -rightDir
    {
      px: robot.x - R * cosA - sensorOffsets[2] * SENSOR_RANGE * sinA,
      py: robot.y - R * sinA + sensorOffsets[2] * SENSOR_RANGE * cosA,
      dx: -cosA, dy: -sinA
    },
    // Left (d4): sits on left face, slides along frontDir
    {
      px: robot.x - R * sinA + sensorOffsets[3] * SENSOR_RANGE * cosA,
      py: robot.y + R * cosA + sensorOffsets[3] * SENSOR_RANGE * sinA,
      dx: -sinA, dy: cosA
    }
  ];

  return defs.map(d => ({
    pos:  { x: d.px, y: d.py },
    dir:  { x: d.dx, y: d.dy },
    dist: castRay(d.px, d.py, d.dx, d.dy)
  }));
}

// Cast a ray from (ox,oy) in direction (dx,dy) – returns distance to nearest surface.
function castRay(ox, oy, dx, dy) {
  let minDist = rayWalls(ox, oy, dx, dy);
  for (const o of objects) {
    if (o.type !== 'obstacle') continue;
    const d = rayObstacle(ox, oy, dx, dy, o);
    if (d > 1e-4 && d < minDist) minDist = d;
  }
  return minDist;
}

function rayWalls(ox, oy, dx, dy) {
  let t = Infinity;
  if (dx >  1e-9) t = Math.min(t, (FIELD_UNITS - ox) / dx);
  else if (dx < -1e-9) t = Math.min(t, (0 - ox) / dx);
  if (dy >  1e-9) t = Math.min(t, (FIELD_UNITS - oy) / dy);
  else if (dy < -1e-9) t = Math.min(t, (0 - oy) / dy);
  return t;
}

function rayObstacle(ox, oy, dx, dy, o) {
  const θ    = -o.angle * Math.PI / 180;  // transform to obstacle local space
  const cosA = Math.cos(θ), sinA = Math.sin(θ);
  const rx   = ox - o.x, ry = oy - o.y;
  const lox  = rx * cosA - ry * sinA;
  const loy  = rx * sinA + ry * cosA;
  const ldx  = dx * cosA - dy * sinA;
  const ldy  = dx * sinA + dy * cosA;
  return rayAABB(lox, loy, ldx, ldy, -o.width / 2, o.width / 2, -o.height / 2, o.height / 2);
}

function rayAABB(ox, oy, dx, dy, minX, maxX, minY, maxY) {
  let tmin = 0, tmax = Infinity;
  if (Math.abs(dx) > 1e-10) {
    const tx1 = (minX - ox) / dx, tx2 = (maxX - ox) / dx;
    tmin = Math.max(tmin, Math.min(tx1, tx2));
    tmax = Math.min(tmax, Math.max(tx1, tx2));
  } else if (ox < minX || ox > maxX) return Infinity;
  if (Math.abs(dy) > 1e-10) {
    const ty1 = (minY - oy) / dy, ty2 = (maxY - oy) / dy;
    tmin = Math.max(tmin, Math.min(ty1, ty2));
    tmax = Math.min(tmax, Math.max(ty1, ty2));
  } else if (oy < minY || oy > maxY) return Infinity;
  return (tmax < tmin) ? Infinity : tmin;
}

function updateSensors() {
  const info = getSensorInfo();
  distance1 = parseFloat(info[0].dist.toFixed(4));
  distance2 = parseFloat(info[1].dist.toFixed(4));
  distance3 = parseFloat(info[2].dist.toFixed(4));
  distance4 = parseFloat(info[3].dist.toFixed(4));
  document.getElementById('dist1').textContent = distance1.toFixed(2);
  document.getElementById('dist2').textContent = distance2.toFixed(2);
  document.getElementById('dist3').textContent = distance3.toFixed(2);
  document.getElementById('dist4').textContent = distance4.toFixed(2);
}

// ── Hit testing ───────────────────────���───────────────────────────────────────
// Returns: 'robot-rotate' | 'robot' | 'obst-rotate-<id>' | <id> | null
function hitTest(cx, cy) {
  const s = canvas.width;
  const hr = Math.max(12, s * 0.026);  // object hit radius px

  // Rotation handle: robot
  if (selectedId === 'robot') {
    const hp = getRobotRotHandleField();
    const hc = fieldToCanvas(hp.x, hp.y);
    if (Math.hypot(cx - hc.x, cy - hc.y) < ROT_HANDLE_R + 2) return 'robot-rotate';
  }

  // Rotation handle: selected obstacle
  if (selectedId !== null && selectedId !== 'robot') {
    const so = objects.find(o => o.id === selectedId);
    if (so && so.type === 'obstacle') {
      const hp = getObstRotHandleField(so);
      const hc = fieldToCanvas(hp.x, hp.y);
      if (Math.hypot(cx - hc.x, cy - hc.y) < ROT_HANDLE_R + 2) return `obst-rotate-${so.id}`;
    }
  }

  // Robot body
  const rc = fieldToCanvas(robot.x, robot.y);
  if (Math.hypot(cx - rc.x, cy - rc.y) < hr) return 'robot';

  // Objects (reverse = drawn-last first)
  for (let i = objects.length - 1; i >= 0; i--) {
    const o  = objects[i];
    const oc = fieldToCanvas(o.x, o.y);
    if (Math.hypot(cx - oc.x, cy - oc.y) < hr) return o.id;
  }
  return null;
}

// ── Mouse events ──────────────────────────────────────────────────────────────
canvas.addEventListener('mousedown', e => {
  if (e.button !== 0) return;
  const { cx, cy } = eventToCanvas(e);
  const hit = hitTest(cx, cy);

  if (!hit) {
    selectedId = null;
    updateSelectedInfo();
    updateObjectList();
    draw();
    return;
  }

  if (hit === 'robot-rotate') {
    selectedId = 'robot';
    dragging = { mode: 'rotate-robot' };
  } else if (typeof hit === 'string' && hit.startsWith('obst-rotate-')) {
    const id = parseInt(hit.replace('obst-rotate-', ''), 10);
    selectedId = id;
    dragging = { mode: 'rotate-obst', id };
  } else if (hit === 'robot') {
    selectedId = 'robot';
    const rc = fieldToCanvas(robot.x, robot.y);
    dragging = { mode: 'move', id: 'robot', offX: cx - rc.x, offY: cy - rc.y };
  } else {
    selectedId = hit;
    const o  = objects.find(o => o.id === hit);
    const oc = fieldToCanvas(o.x, o.y);
    dragging = { mode: 'move', id: hit, offX: cx - oc.x, offY: cy - oc.y };
  }

  updateSelectedInfo();
  updateObjectList();
  draw();
});

canvas.addEventListener('mousemove', e => {
  const { cx, cy } = eventToCanvas(e);

  // Cursor coords
  if (insideField(cx, cy)) {
    const fp = canvasToField(cx, cy);
    document.getElementById('cursorX').textContent = fp.x.toFixed(2);
    document.getElementById('cursorY').textContent = fp.y.toFixed(2);
  } else {
    document.getElementById('cursorX').textContent = '—';
    document.getElementById('cursorY').textContent = '—';
  }

  // Cursor style
  const hit = hitTest(cx, cy);
  canvas.style.cursor = hit
    ? (hit.includes('rotate') ? 'crosshair' : (dragging ? 'grabbing' : 'grab'))
    : 'crosshair';

  if (!dragging) return;

  if (dragging.mode === 'rotate-robot') {
    const fp = canvasToField(cx, cy);
    let angle = Math.atan2(fp.y - robot.y, fp.x - robot.x) * 180 / Math.PI;
    if (angle < 0) angle += 360;
    robot.angle = Math.round(angle * 10) / 10;
    syncRobotAngle();
  } else if (dragging.mode === 'rotate-obst') {
    const o  = objects.find(o => o.id === dragging.id);
    const fp = canvasToField(cx, cy);
    // Handle is at local +Y direction, so atan2 gives field angle of local +Y → subtract 90
    let angle = Math.atan2(fp.y - o.y, fp.x - o.x) * 180 / Math.PI - 90;
    angle = ((angle % 360) + 360) % 360;
    o.angle = Math.round(angle);
    syncObstAngle(o);
  } else if (dragging.mode === 'move') {
    const targetX = cx - dragging.offX;
    const targetY = cy - dragging.offY;
    const fp = canvasToField(targetX, targetY);
    const fx = clampField(fp.x);
    const fy = clampField(fp.y);
    if (dragging.id === 'robot') {
      robot.x = fx; robot.y = fy;
      updateRobotInfo();
    } else {
      const o = objects.find(o => o.id === dragging.id);
      if (o) { o.x = fx; o.y = fy; }
    }
    updateSelectedInfo();
    updateObjectList();
  }

  draw();
  updateSensors();
});

canvas.addEventListener('mouseup', () => { dragging = null; });
canvas.addEventListener('mouseleave', () => {
  dragging = null;
  document.getElementById('cursorX').textContent = '—';
  document.getElementById('cursorY').textContent = '—';
});

function eventToCanvas(e) {
  const rect = canvas.getBoundingClientRect();
  return {
    cx: (e.clientX - rect.left) * (canvas.width  / rect.width),
    cy: (e.clientY - rect.top)  * (canvas.height / rect.height)
  };
}

// ── Object management ─────────────────────────────────────────────────────────
function addObject(type) {
  idCounter++;
  const prefix = type === 'landmark' ? 'L' : 'O';
  const count  = objects.filter(o => o.type === type).length + 1;
  const jitter = () => parseFloat((Math.random() * 8 + 2).toFixed(2));
  objects.push({
    id: idCounter, type,
    x: jitter(), y: jitter(),
    label: `${prefix}${count}`,
    ...(type === 'obstacle' ? { width: 1, height: 1, angle: 0 } : {})
  });
  updateObjectList();
  draw();
  updateSensors();
}

function removeObject(id) {
  objects = objects.filter(o => o.id !== id);
  if (selectedId === id) { selectedId = null; updateSelectedInfo(); }
  updateObjectList();
  draw();
  updateSensors();
}

function clearAll() {
  objects  = [];
  robot    = { x: 6, y: 6, angle: 0 };
  sensorOffsets = [0, 0, 0, 0];
  selectedId   = null;
  idCounter    = 0;
  [0,1,2,3].forEach(i => {
    document.getElementById(`sOffset${i}`).value  = 0;
    document.getElementById(`sOffVal${i}`).textContent = '0.00';
  });
  syncRobotAngle();
  updateRobotInfo();
  updateSelectedInfo();
  updateObjectList();
  draw();
  updateSensors();
}

// ── Angle setters / sync ──────────────────────────────────────────────────────
function setRobotAngle(val) {
  robot.angle = ((parseFloat(val) % 360) + 360) % 360;
  robot.angle = Math.round(robot.angle * 10) / 10;
  syncRobotAngle();
  draw();
  updateSensors();
}

function syncRobotAngle() {
  document.getElementById('robotAngleInput').value  = robot.angle.toFixed(1);
  document.getElementById('robotAngleSlider').value = robot.angle;
  updateRobotInfo();
}

function setObstProp(prop, val) {
  const o = objects.find(o => o.id === selectedId);
  if (!o || o.type !== 'obstacle') return;
  o[prop] = Math.max(0.2, Math.min(6, parseFloat(val)));
  const el = document.getElementById(`obst${prop.charAt(0).toUpperCase() + prop.slice(1)}Val`);
  if (el) el.textContent = o[prop].toFixed(1);
  draw();
  updateSensors();
}

function setObstAngle(val) {
  const o = objects.find(o => o.id === selectedId);
  if (!o) return;
  o.angle = Math.round(((parseFloat(val) % 360) + 360) % 360);
  syncObstAngle(o);
  draw();
  updateSensors();
}

function syncObstAngle(o) {
  const inp = document.getElementById('obstAngleInput');
  const sld = document.getElementById('obstAngleSlider');
  if (inp) inp.value = o.angle;
  if (sld) sld.value = o.angle;
  updateSelectedInfo();
}

function setSensorOffset(idx, val) {
  sensorOffsets[idx] = parseFloat(val);
  document.getElementById(`sOffVal${idx}`).textContent = sensorOffsets[idx].toFixed(2);
  draw();
  updateSensors();
}

// ── UI updates ────────────────────────────────────────────────────────────────
function updateRobotInfo() {
  document.getElementById('robotX').textContent = robot.x.toFixed(2);
  document.getElementById('robotY').textContent = robot.y.toFixed(2);
}

function updateSelectedInfo() {
  const el = document.getElementById('selectedProps');
  if (!selectedId) { el.innerHTML = '<p class="dim-text">Nothing selected</p>'; return; }

  if (selectedId === 'robot') {
    el.innerHTML = `<p class="dim-text">Drag rotation handle to orient<br>or use Angle input above.</p>`;
    return;
  }

  const o = objects.find(o => o.id === selectedId);
  if (!o) { el.innerHTML = '<p class="dim-text">Nothing selected</p>'; return; }

  const color = o.type === 'landmark' ? '#60a5fa' : '#f87171';
  let html = `
    <div class="sel-header">
      <span class="sel-name" style="color:${color}">${o.label}</span>
      <span class="sel-type">${o.type}</span>
    </div>
    <div class="prop-row">
      <span class="prop-label">X</span>
      <span class="prop-value mono">${o.x.toFixed(2)}</span>
    </div>
    <div class="prop-row">
      <span class="prop-label">Y</span>
      <span class="prop-value mono">${o.y.toFixed(2)}</span>
    </div>`;

  if (o.type === 'obstacle') {
    html += `
    <div class="prop-row" style="margin-top:6px;">
      <span class="prop-label">W</span>
      <input type="range" class="range-prop" id="obstWidth"
             min="0.2" max="6" step="0.1" value="${o.width}"
             oninput="setObstProp('width', this.value)">
      <span class="prop-unit" id="obstWidthVal">${o.width.toFixed(1)}</span>
    </div>
    <div class="prop-row">
      <span class="prop-label">H</span>
      <input type="range" class="range-prop" id="obstHeight"
             min="0.2" max="6" step="0.1" value="${o.height}"
             oninput="setObstProp('height', this.value)">
      <span class="prop-unit" id="obstHeightVal">${o.height.toFixed(1)}</span>
    </div>
    <div class="prop-row" style="margin-top:4px;">
      <span class="prop-label">Ang</span>
      <input type="number" class="angle-input" id="obstAngleInput"
             min="0" max="359" step="1" value="${Math.round(o.angle)}"
             oninput="setObstAngle(this.value)">
      <span class="prop-unit">°</span>
    </div>
    <input type="range" class="range-full" id="obstAngleSlider"
           min="0" max="359" step="1" value="${Math.round(o.angle)}"
           oninput="setObstAngle(this.value)">
    <p class="dim-text" style="margin-top:5px;">Drag orange handle to rotate</p>`;
  }

  el.innerHTML = html;
}

function updateObjectList() {
  const el = document.getElementById('objectList');
  if (!objects.length) {
    el.innerHTML = '<p class="dim-text" style="padding:14px 0;text-align:center;">No objects placed</p>';
    return;
  }
  el.innerHTML = objects.map(o => {
    const color = o.type === 'landmark' ? '#3b82f6' : '#ef4444';
    const sel   = selectedId === o.id;
    return `<div class="obj-item${sel ? ' selected' : ''}" onclick="selectObject(${o.id})">
      <div class="obj-dot" style="background:${color}"></div>
      <span class="obj-name">${o.label}</span>
      <span class="obj-coords">(${o.x.toFixed(1)}, ${o.y.toFixed(1)})</span>
      <button class="obj-delete" onclick="event.stopPropagation();removeObject(${o.id})" title="Remove">✕</button>
    </div>`;
  }).join('');
}

function selectObject(id) {
  selectedId = id;
  updateSelectedInfo();
  updateObjectList();
  draw();
}

// ── Init ──────────────────────────────────────────────────────────────────────
resizeCanvas();
updateRobotInfo();
syncRobotAngle();
updateObjectList();
updateSelectedInfo();
updateSensors();

// Pre-place three landmarks as an example
addObject('landmark');
addObject('landmark');
addObject('landmark');
