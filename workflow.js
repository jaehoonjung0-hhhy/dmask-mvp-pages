(function (root) {
  'use strict';

  const roles = { inspect: 'worker', handoff: 'worker', release: 'supervisor', compare: 'quality' };
  const roleNames = { worker: '현장 작업자', supervisor: '해제 승인자', quality: '품질 담당자' };
  const states = ['open', 'held', 'review', 'closed'];

  function required(value, label) {
    if (typeof value !== 'string' || !value.trim()) throw new Error(label + '을(를) 입력해 주세요.');
    return value.trim();
  }

  function advance(alert, action, actor, at) {
    const role = roles[action.type];
    if (!Object.hasOwn(roles, action.type)) throw new Error('지원되지 않는 작업입니다.');
    if (actor.role !== role) throw new Error(roleNames[role] + '만 이 작업을 할 수 있습니다.');
    if (!Number.isFinite(Date.parse(at))) throw new Error('기록 시각을 확인해 주세요.');

    const event = { type: action.type, actor: required(actor.name, '기록 담당자'), at };
    const next = { ...alert };

    switch (action.type) {
      case 'inspect':
        if (!['open', 'held'].includes(alert.status)) throw new Error('신규 또는 보류 상태에서 점검할 수 있습니다.');
        event.lot = required(action.lot, '현장에서 확인한 LOT').toUpperCase();
        if (!['resolved', 'pending'].includes(action.result)) throw new Error('점검 결과를 선택해 주세요.');
        event.result = event.lot === alert.lot ? action.result : 'mismatch';
        event.note = required(action.note, '점검 및 조치 내용');
        next.status = event.result === 'resolved' ? 'review' : 'held';
        next.assignee = event.actor;
        break;
      case 'handoff':
        if (alert.status !== 'held') throw new Error('보류된 건만 인계할 수 있습니다.');
        event.assignee = required(action.assignee, '다음 교대 담당자');
        event.note = required(action.note, '인계 사유');
        next.assignee = event.assignee;
        break;
      case 'release':
        if (alert.status === 'closed') throw new Error('이미 해제된 경보입니다.');
        if (alert.status !== 'review') throw new Error('LOT 일치 및 조치 완료 점검이 필요합니다.');
        event.note = required(action.note, '해제 사유');
        next.status = 'closed';
        break;
      case 'compare': {
        if (alert.inspection) throw new Error('최초 검사 결과가 이미 등록되었습니다.');
        const inspectedAt = action.inspectedAt ?? at;
        const inspectionTime = Date.parse(inspectedAt);
        if (!Number.isFinite(inspectionTime) || inspectionTime < Date.parse(alert.createdAt) || inspectionTime > Date.parse(at)) {
          throw new Error('경보 발생 이후부터 현재까지의 검사 시각을 입력해 주세요.');
        }
        if (!Number.isSafeInteger(action.failed) || !Number.isSafeInteger(action.total) ||
            action.failed < 0 || action.total <= 0 || action.failed > action.total) {
          throw new Error('0 ≤ 최초 불량 수량 ≤ 총생산 수량이어야 하며, 총생산은 1개 이상이어야 합니다.');
        }
        event.failed = action.failed;
        event.total = action.total;
        event.note = required(action.note, '원장 대조 근거');
        next.inspection = { failed: event.failed, total: event.total, at: inspectedAt, actor: event.actor };
        break;
      }
    }
    next.history = [...alert.history, event];
    return next;
  }

  function restore(raw, baseline) {
    try {
      const saved = JSON.parse(raw);
      if (Array.isArray(saved) && saved.length === baseline.length &&
          baseline.every(example => saved.some(item => item?.id === example.id && item.lot === example.lot &&
            states.includes(item.status) && Array.isArray(item.history)))) {
        return baseline.map(example => ({ ...example, ...saved.find(item => item.id === example.id) }));
      }
    } catch {
      return baseline;
    }
    return baseline;
  }

  const workflow = { advance, restore };
  if (typeof module !== 'undefined' && module.exports) module.exports = workflow;
  else root.workflow = workflow;
})(globalThis);
