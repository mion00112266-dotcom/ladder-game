// 사다리타기 게임: HTML의 id를 이용해 화면 요소를 찾습니다.
const canvas = document.getElementById('ladder');
const ctx = canvas.getContext('2d');
const playersBox = document.getElementById('players');
const prizesBox = document.getElementById('prizes');
const resultBox = document.getElementById('result');
const nameInputs = [...document.querySelectorAll('#nameInputs input')];
const prizeInputs = [...document.querySelectorAll('#prizeInputs input')];
const createButton = document.getElementById('createButton');
const resetButton = document.getElementById('resetButton');
const saveButton = document.getElementById('saveButton');
const loadButton = document.getElementById('loadButton');
const apiStatus = document.getElementById('apiStatus');
const recordsBody = document.getElementById('recordsBody');

const COUNT = 5;
const ROWS = 12;
let rungs = [];
let names = [];
let prizes = [];
let animationId = null;
let playing = false;
let selected = -1;
let destination = -1;
let progress = 0;
let route = [];
let lastTime = 0;
let ladderVersion = 0;
let savedVersion = -1;
let apiBusy = false;
// 끝까지 도착한 참가자의 경로와 결과를 현재 사다리에서 보관합니다.
const completedRuns = new Map();
const savedPlayers = new Set();
const PATH_COLORS = ['#e56a2b', '#1673d1', '#1c9861', '#9b55bd', '#cf4269'];

function getValues(inputs, fallback) {
  return inputs.map((input, i) => input.value.trim() || `${fallback}${i + 1}`);
}

// 한 높이에서 서로 겹치는 가로 막대가 생기지 않도록 생성합니다.
function generateRungs() {
  rungs = [];
  for (let row = 0; row < ROWS; row++) {
    const columns = [];
    for (let col = 0; col < COUNT - 1; col++) {
      if (!columns.includes(col - 1) && Math.random() < 0.43) columns.push(col);
    }
    rungs.push(columns);
  }
}

function geometry() {
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  const left = w * 0.10;
  const step = (w * 0.80) / (COUNT - 1);
  const top = 15;
  const bottom = h - 15;
  const rowStep = (bottom - top) / (ROWS + 1);
  return { w, h, left, step, top, bottom, rowStep, x: col => left + col * step };
}

function fitCanvas() {
  const ratio = window.devicePixelRatio || 1;
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  canvas.width = Math.round(w * ratio);
  canvas.height = Math.round(h * ratio);
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  draw();
}

// 사다리의 기본 선과 현재까지 진행한 경로를 그립니다.
function draw() {
  const g = geometry();
  ctx.clearRect(0, 0, g.w, g.h);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = '#8ca4c5';
  ctx.lineWidth = 4;
  for (let col = 0; col < COUNT; col++) {
    ctx.beginPath(); ctx.moveTo(g.x(col), g.top); ctx.lineTo(g.x(col), g.bottom); ctx.stroke();
  }
  for (let row = 0; row < ROWS; row++) {
    const y = g.top + (row + 1) * g.rowStep;
    for (const col of rungs[row]) {
      ctx.beginPath(); ctx.moveTo(g.x(col), y); ctx.lineTo(g.x(col + 1), y); ctx.stroke();
    }
  }
  // 먼저 완료된 모든 경로를 다시 그립니다. (새 참가자를 눌러도 유지)
  for (const [index, run] of completedRuns) {
    paintRoute(run.points, run.points.length - 1, PATH_COLORS[index]);
  }
  // 현재 움직이고 있는 경로는 그 위에 그립니다.
  if (playing && route.length > 1) paintRoute(route, progress, PATH_COLORS[selected]);
}

function paintRoute(points, position, color) {
  if (points.length < 2) return;
  const g = geometry();
  ctx.strokeStyle = color;
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(g.x(points[0].col), points[0].y * g.h);
  const whole = Math.floor(position);
  const fraction = position - whole;
  for (let i = 1; i <= Math.min(whole, points.length - 1); i++) {
    ctx.lineTo(g.x(points[i].col), points[i].y * g.h);
  }
  if (whole < points.length - 1) {
    const a = points[whole], b = points[whole + 1];
    ctx.lineTo(g.x(a.col + (b.col - a.col) * fraction),
               (a.y + (b.y - a.y) * fraction) * g.h);
  }
  ctx.stroke();
}

// 참가자가 가로 막대를 만나면 옆 줄로 이동하는 경로를 계산합니다.
function calculateRoute(start) {
  const g = geometry();
  let col = start;
  const points = [{ col, y: g.top / g.h }];
  for (let row = 0; row < ROWS; row++) {
    const y = (g.top + (row + 1) * g.rowStep) / g.h;
    points.push({ col, y });
    if (rungs[row].includes(col)) col++;
    else if (rungs[row].includes(col - 1)) col--;
    points.push({ col, y });
  }
  points.push({ col, y: g.bottom / g.h });
  return { points, end: col };
}

function renderLabels() {
  playersBox.replaceChildren();
  prizesBox.replaceChildren();
  names.forEach((name, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = name;
    button.disabled = playing;
    button.classList.toggle('active', selected === index);
    button.classList.toggle('completed', completedRuns.has(index));
    button.style.setProperty('--path-color', PATH_COLORS[index]);
    button.addEventListener('click', () => startRun(index));
    playersBox.appendChild(button);
  });
  prizes.forEach((prize, index) => {
    const label = document.createElement('span');
    label.textContent = prize;
    label.classList.toggle('active', !playing && destination === index);
    prizesBox.appendChild(label);
  });
}

function newLadder() {
  ladderVersion++;
  savedVersion = -1;
  completedRuns.clear();
  savedPlayers.clear();
  saveButton.disabled = false;
  if (animationId !== null) cancelAnimationFrame(animationId);
  animationId = null;
  playing = false;
  selected = -1;
  destination = -1;
  route = [];
  progress = 0;
  lastTime = 0;
  names = getValues(nameInputs, '참가자');
  prizes = getValues(prizeInputs, '결과');
  generateRungs();
  renderLabels();
  resultBox.textContent = '참가자를 선택하면 경로가 남습니다. 여러 명을 선택해 보세요!';
  updateSaveButton();
  fitCanvas();
}

function startRun(index) {
  if (playing) return;
  selected = index;
  destination = -1;
  const calculation = calculateRoute(index);
  route = calculation.points;
  progress = 0;
  lastTime = 0;
  playing = true;
  updateSaveButton();
  resultBox.textContent = `${names[index]}의 사다리 경로를 따라가는 중...`;
  renderLabels();
  draw();

  // requestAnimationFrame으로 주황색 선이 조금씩 움직이게 합니다.
  function animate(time) {
    if (!lastTime) lastTime = time;
    const elapsed = Math.min(time - lastTime, 50);
    lastTime = time;
    progress = Math.min(progress + elapsed / 110, route.length - 1);
    draw();
    if (progress < route.length - 1) {
      animationId = requestAnimationFrame(animate);
    } else {
      animationId = null;
      playing = false;
      destination = calculation.end;
      completedRuns.set(index, { points: calculation.points, end: calculation.end });
      updateSaveButton();
      draw();
      resultBox.textContent = `🎉 ${names[index]}의 결과는 '${prizes[destination]}'입니다!`;
      renderLabels();
    }
  }
  animationId = requestAnimationFrame(animate);
}

createButton.addEventListener('click', newLadder);
resetButton.addEventListener('click', newLadder);
window.addEventListener('resize', fitCanvas);
newLadder();


// API 호출은 같은 Pages 주소의 /api/results로 전송합니다.
async function apiRequest(url, options = {}) {
  const response = await fetch(url, options);
  let data;
  try { data = await response.json(); } catch { data = {}; }
  if (!response.ok) throw new Error(data.error || `HTTP ${response.status} 오류`);
  return data;
}

function pendingResults() {
  return [...completedRuns.entries()]
    .filter(([index]) => !savedPlayers.has(index))
    .map(([index, run]) => ({ index, name: names[index], result: prizes[run.end] }));
}

function updateSaveButton() {
  const count = pendingResults().length;
  saveButton.textContent = `💾 선택한 ${count}명 결과 저장`;
  saveButton.disabled = playing || apiBusy || count === 0;
}

async function saveSelectedResults() {
  if (playing || apiBusy) return;
  const pending = pendingResults();
  if (!pending.length) {
    apiStatus.textContent = '먼저 참가자를 선택하여 경로를 완료해 주세요.';
    return;
  }
  const version = ladderVersion;
  apiBusy = true;
  updateSaveButton();
  apiStatus.textContent = `${pending.length}명 결과 저장 중...`;
  try {
    const data = await apiRequest('/api/results', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ players: pending.map(({ name, result }) => ({ name, result })) })
    });
    // 저장 도중 새 사다리를 만들었다면 이전 결과를 현재 상태에 섞지 않습니다.
    if (version === ladderVersion) {
      pending.forEach(({ index }) => savedPlayers.add(index));
      apiStatus.textContent = `회차 ${data.round}: ${pending.length}명 결과 저장 완료!`;
    }
    await loadRecords();
  } catch (error) {
    apiStatus.textContent = `저장 실패: ${error.message}`;
  } finally {
    apiBusy = false;
    updateSaveButton();
  }
}

async function loadRecords() {
  try {
    const records = await apiRequest('/api/results');
    renderRecords(records);
    if (records.length === 0) apiStatus.textContent = '저장된 기록이 없습니다.';
  } catch (error) {
    apiStatus.textContent = `조회 실패: ${error.message}`;
  }
}

function renderRecords(records) {
  recordsBody.replaceChildren();
  if (records.length === 0) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = 5;
    td.textContent = '저장된 기록이 없습니다.';
    tr.appendChild(td);
    recordsBody.appendChild(tr);
    return;
  }
  for (const record of records) {
    const tr = document.createElement('tr');
    for (const value of [record.id, record.round, record.name]) {
      const td = document.createElement('td');
      td.textContent = value;
      tr.appendChild(td);
    }
    const resultTd = document.createElement('td');
    const input = document.createElement('input');
    input.value = record.result;
    input.maxLength = 50;
    input.setAttribute('aria-label', `${record.name} 결과 수정`);
    resultTd.appendChild(input);
    tr.appendChild(resultTd);
    const actionTd = document.createElement('td');
    const updateButton = document.createElement('button');
    updateButton.type = 'button';
    updateButton.textContent = '수정';
    updateButton.addEventListener('click', async () => {
      const result = input.value.trim();
      if (!result) { apiStatus.textContent = '결과를 입력해 주세요.'; return; }
      updateButton.disabled = true;
      try {
        await apiRequest(`/api/results/${record.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ result })
        });
        apiStatus.textContent = `ID ${record.id} 수정 완료`;
        await loadRecords();
      } catch (error) { apiStatus.textContent = `수정 실패: ${error.message}`; }
      finally { updateButton.disabled = false; }
    });
    const deleteButton = document.createElement('button');
    deleteButton.type = 'button';
    deleteButton.className = 'delete-button';
    deleteButton.textContent = '삭제';
    deleteButton.addEventListener('click', async () => {
      if (!confirm(`${record.name}의 ID ${record.id} 기록을 삭제할까요?`)) return;
      deleteButton.disabled = true;
      try {
        await apiRequest(`/api/results/${record.id}`, { method: 'DELETE' });
        apiStatus.textContent = `ID ${record.id} 삭제 완료`;
        await loadRecords();
      } catch (error) { apiStatus.textContent = `삭제 실패: ${error.message}`; }
      finally { deleteButton.disabled = false; }
    });
    actionTd.append(updateButton, deleteButton);
    tr.appendChild(actionTd);
    recordsBody.appendChild(tr);
  }
}

saveButton.addEventListener('click', saveSelectedResults);
loadButton.addEventListener('click', loadRecords);
