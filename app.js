'use strict';

const { advance, restore } = window.workflow;
const statuses = { open: '신규', held: '점검 보류', review: '해제 승인 대기', closed: '해제' };
const roles = { worker: '김작업', supervisor: '이반장', quality: '박품질' };
const actions = { inspect: '점검 기록', handoff: '교대 인계', release: '해제 승인', compare: '최초 검사 대조' };
const results = { resolved: '조치 완료', pending: '미해결', mismatch: 'LOT 불일치' };
const key = 'dmask-quality-demo-v1';
const role = document.querySelector('#role');
const filter = document.querySelector('#filter');
const queue = document.querySelector('#queue');
const detail = document.querySelector('#detail');
const stats = document.querySelector('#stats');
const notice = document.querySelector('#notice');
const formatDate = new Intl.DateTimeFormat('ko-KR', {
  month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
});
const exampleTime = Date.now() - 3600000;
const initial = [
  ['01', '성형기 2호', 'MAT-2601', 'PKG-2601', '성형 조건 변동 감지 · 현물과 설비 설정을 확인하세요.'],
  ['02', '성형기 1호', 'MAT-2602', '연결 전', '성형 온도 변동 감지 · LOT 라벨과 설비 상태를 확인하세요.'],
  ['03', '성형기 3호', 'MAT-2603', 'PKG-2603', '가동 조건 변동 감지 · 성형 상태를 점검하세요.']
].map(([id, machine, material, packageLot, reason], index) => ({
  id: 'A-' + id, lot: 'LOT-' + id, machine, material, packageLot, reason,
  status: 'open', history: [], createdAt: new Date(exampleTime - index * 600000).toISOString()
}));
initial[1] = advance(initial[1], {
  type: 'inspect', lot: 'LOT-99', result: 'pending', note: '현물 라벨이 경보 LOT와 달라 보류했습니다.'
}, { role: 'worker', name: '김작업' }, new Date(exampleTime + 120000).toISOString());
initial[2] = advance(initial[2], {
  type: 'inspect', lot: 'LOT-03', result: 'resolved', note: '설비 설정 확인 후 현물 재점검을 완료했습니다.'
}, { role: 'worker', name: '김작업' }, new Date(exampleTime + 240000).toISOString());

let alerts;
try {
  alerts = restore(localStorage.getItem(key), initial);
} catch {
  alerts = initial;
}
let selected = alerts[0].id;

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}

function date(value) {
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? formatDate.format(parsed) : '시각 확인 필요';
}

function pill(status) {
  return '<span class="pill ' + status + '">' + statuses[status] + '</span>';
}

function localMinute() {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

function form(type, fields, button) {
  return '<form data-action="' + type + '"><h3>' + actions[type] + '</h3>' + fields +
    '<p class="message" role="alert"></p><button class="primary">' + button + '</button></form>';
}

function note(label, example) {
  return '<label>' + label + '<textarea name="note" required maxlength="500" placeholder="' + example + '"></textarea></label>';
}

function renderActions(item) {
  if (role.value === 'worker' && ['open', 'held'].includes(item.status)) {
    const inspect = form('inspect', '<div class="form-grid"><label>현장에서 확인한 생산 LOT' +
      '<input name="lot" required maxlength="40" placeholder="예: LOT-01" autocomplete="off"></label>' +
      '<label>점검 결과<select name="result"><option value="resolved">조치 완료</option>' +
      '<option value="pending">미해결</option></select></label></div>' +
      note('점검 및 조치 내용', '예: 성형 온도와 마스크 외관 확인'), '점검 저장');
    const handoff = item.status === 'held' ? form('handoff',
      '<label>다음 교대 담당자<input name="assignee" maxlength="40" required placeholder="예: 최작업"></label>' +
      note('인계 사유', '예: LOT 라벨을 생산 원장과 재대조'), '인계 저장') : '';
    return inspect + handoff;
  }
  if (role.value === 'supervisor' && item.status === 'review') {
    return form('release', note('해제 사유', '예: LOT 일치와 조치 후 현물 재점검 확인'), '경보 해제');
  }
  if (role.value === 'quality' && !item.inspection) {
    return form('compare', '<div class="form-grid"><label>총생산량<input type="number" name="total" min="1" step="1" required></label>' +
      '<label>최초 불량 수량<input type="number" name="failed" min="0" step="1" required></label></div>' +
      '<label>최초 검사 시각<input type="datetime-local" name="inspectedAt" value="' + localMinute() + '" required></label>' +
      note('원장 대조 근거', '예: LOT-01 최초 검사 원장 확인'), '검사 결과 저장');
  }
  if (role.value === 'supervisor' && ['open', 'held'].includes(item.status)) {
    return '<p class="section-message">대상 LOT가 일치하고 현장 조치가 완료되면 해제할 수 있습니다.</p>';
  }
  if (role.value === 'worker' && item.status === 'review') {
    return '<p class="section-message">해제 승인자가 점검 및 조치 기록을 확인할 차례입니다.</p>';
  }
  return '';
}

function renderHistory(item) {
  const entries = [...item.history].reverse().map(event => {
    const description = event.type === 'inspect' ? event.lot + ' · ' + results[event.result] :
      event.type === 'handoff' ? '다음 담당자 ' + event.assignee :
      event.type === 'compare' ? event.failed.toLocaleString('ko-KR') + ' / ' + event.total.toLocaleString('ko-KR') + '개' : '';
    return '<li><div class="row"><strong>' + actions[event.type] + ' · ' + escapeHtml(event.actor) +
      '</strong><time>' + date(event.at) + '</time></div>' +
      (description ? '<div class="sub">' + escapeHtml(description) + '</div>' : '') +
      '<p>' + escapeHtml(event.note) + '</p></li>';
  });
  return '<section class="history"><h3>처리 이력</h3>' +
    (entries.length ? '<ol>' + entries.join('') + '</ol>' : '<p class="sub history-empty">아직 기록된 조치가 없습니다.</p>') + '</section>';
}

function renderDetail(item) {
  if (!item) {
    detail.innerHTML = '<p class="empty">표시할 경보가 없습니다. 다른 상태를 선택해 주세요.</p>';
    return;
  }
  const fields = [['성형 설비', item.machine], ['투입 자재 LOT', item.material],
    ['포장 LOT', item.packageLot], ['현재 담당', item.assignee || '미지정']];
  const info = fields.map(([label, value]) => '<div><dt>' + label + '</dt><dd>' + escapeHtml(value) + '</dd></div>').join('');
  const inspected = item.inspection;
  const comparison = inspected ? '<p class="summary"><strong>최초 검사 불량률 ' +
    (100 * inspected.failed / inspected.total).toFixed(2) + '%</strong> · ' + date(inspected.at) + '</p>' : '';
  detail.innerHTML = '<div class="detail-header"><div><h2 tabindex="-1">' + escapeHtml(item.lot) +
    '</h2><p class="sub">경보 ' + escapeHtml(item.id) + ' · ' + date(item.createdAt) + '</p></div>' + pill(item.status) + '</div>' +
    '<dl class="asset-grid">' + info + '</dl><p class="summary alert-summary">' + escapeHtml(item.reason) + '</p>' +
    comparison + '<div class="actions">' + renderActions(item) + '</div>' + renderHistory(item);
}

function render() {
  notice.textContent = '';
  const listed = alerts.filter(item => filter.value === 'all' || item.status === filter.value);
  const item = listed.find(alert => alert.id === selected) || listed[0];
  selected = item?.id;
  stats.innerHTML = Object.entries(statuses).map(([status, label]) => '<div class="stat"><span class="stat-label ' + status + '">' + label +
    '</span><strong>' + alerts.filter(alert => alert.status === status).length + '<small>건</small></strong></div>').join('');
  queue.innerHTML = listed.map(alert => '<button class="queue-item" data-id="' + escapeHtml(alert.id) + '" aria-pressed="' +
    (alert.id === selected) + '"><span class="row"><strong>' + escapeHtml(alert.lot) + '</strong>' +
    pill(alert.status) + '</span><span class="sub">' + escapeHtml(alert.machine) + ' · ' + date(alert.createdAt) + '</span></button>').join('') ||
    '<p class="empty">이 상태의 경보가 없습니다.</p>';
  renderDetail(item);
}

function persist(next) {
  localStorage.setItem(key, JSON.stringify(next));
}

queue.addEventListener('click', event => {
  const button = event.target.closest('button[data-id]');
  if (!button) return;
  selected = button.dataset.id;
  render();
  detail.querySelector('h2')?.focus();
});
role.addEventListener('change', render);
filter.addEventListener('change', render);

detail.addEventListener('submit', event => {
  event.preventDefault();
  const formElement = event.target;
  const action = Object.fromEntries(new FormData(formElement));
  action.type = formElement.dataset.action;
  try {
    if (action.type === 'compare') {
      action.total = Number(action.total);
      action.failed = Number(action.failed);
      const inspectionDate = new Date(action.inspectedAt);
      if (!Number.isFinite(inspectionDate.getTime())) throw new Error('최초 검사 시각을 확인해 주세요.');
      action.inspectedAt = inspectionDate.toISOString();
    }
    const item = alerts.find(alert => alert.id === selected);
    const updated = advance(item, action, { role: role.value, name: roles[role.value] }, new Date().toISOString());
    const next = alerts.map(alert => alert.id === item.id ? updated : alert);
    persist(next);
    alerts = next;
    if (filter.value !== 'all' && filter.value !== updated.status) filter.value = 'all';
    render();
    detail.querySelector('h2')?.focus();
    notice.textContent = actions[action.type] + ' 저장 완료';
  } catch (error) {
    formElement.querySelector('.message').textContent = error.name === 'QuotaExceededError' || error.name === 'SecurityError' ?
      '브라우저에 저장할 수 없습니다. 저장 설정을 확인해 주세요.' : error.message;
  }
});

document.querySelector('#reset').addEventListener('click', () => {
  if (!window.confirm('이 브라우저의 시연 기록을 지우고 예시 경보를 복원할까요?')) return;
  try {
    localStorage.removeItem(key);
    alerts = initial;
    selected = initial[0].id;
    role.value = 'worker';
    filter.value = 'all';
    render();
    notice.textContent = '시연 기록을 초기화했습니다.';
  } catch {
    notice.textContent = '브라우저에서 시연 기록을 초기화할 수 없습니다.';
  }
});

render();
