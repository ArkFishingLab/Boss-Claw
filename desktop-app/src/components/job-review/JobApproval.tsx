import { App, Alert, Typography } from 'antd';
import { useDataStore } from '@/store/useDataStore';
import { useMatchAnalysisStore } from '@/store/useMatchAnalysisStore';
import { useRuntimeLogsStore } from '@/store/useRuntimeLogsStore';
import { useAppStore } from '@/store/useAppStore';
import { useSettingsStore } from '@/store/useSettingsStore';
import { promoteApprovedToQueue } from '@/lib/bossclaw/priority';

let dialogOpen = false;

// Both pages only approve into the non-executing "approved" state. Sending is a separate action.
export function useJobApproval() {
  const { modal, message } = App.useApp();
  return (ids: string[]) => {
    if (dialogOpen) return;
    if (useMatchAnalysisStore.getState().running) { void message.warning('请先完成或停止匹配度分析'); return; }
    const d = useDataStore.getState();
    const selected = new Set(ids);
    const items = d.pending.filter(p => selected.has(p.id) && p.status === 'pending' && !p.riskBlocked);
    if (!items.length) { void message.info('没有可确认的待确认岗位'); return; }
    const previews = items.map(p => ({ id: p.id, job: p.job, analysis: p.analysis, deliveryGreeting: p.deliveryGreeting,
      greeting: String(p.deliveryGreeting || p.analysis?.greeting || '').trim() }));
    if (previews.some(p => !p.greeting)) { void message.warning('所选岗位缺少招呼语，请先补充后再确认'); return; }
    dialogOpen = true;
    modal.confirm({
      title: `确认沟通意向（${previews.length} 个岗位）`,
      width: 620, autoFocusButton: 'cancel', okText: '确认，加入待投递', cancelText: '取消',
      content: <div>
        <Alert type="warning" showIcon message="确认后仅加入待投递，不会立即发送。实际投递仍需另行启动。" />
        <div style={{ maxHeight: '50vh', overflowY: 'auto', marginTop: 12 }}>
          {previews.map(p => <div key={p.id} style={{ marginBottom: 16 }}>
            <Typography.Text strong>{p.job.company || '公司待补全'} · {p.job.title}</Typography.Text>
            <div>{p.job.location} · {p.job.salary}</div>
            <Typography.Paragraph style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{p.greeting}</Typography.Paragraph>
          </div>)}
        </div>
      </div>,
      onOk: () => {
        const latest = useDataStore.getState();
        if (useMatchAnalysisStore.getState().running || previews.some(p => {
          const current = latest.pending.find(x => x.id === p.id);
          return !current || current.status !== 'pending' || current.riskBlocked || current.analysis !== p.analysis
            || JSON.stringify(current.job) !== JSON.stringify(p.job) || current.deliveryGreeting !== p.deliveryGreeting;
        })) {
          void message.warning('岗位信息、评分或状态已变化，请关闭弹窗后重新核对');
          return Promise.reject(new Error('岗位已变化'));
        }
        const approved = new Map(previews.map(p => [p.id, p]));
        latest.setPending(latest.pending.map(p => approved.has(p.id)
          ? { ...p, status: 'approved' as const, approvedAt: Date.now(), deliveryGreeting: approved.get(p.id)!.greeting } : p));
        latest.recomputeStats();
        useRuntimeLogsStore.getState().addLog('info', `已确认 ${previews.length} 个岗位，加入待投递；未启动投递或发送消息`);
        void message.success('已加入待投递；未发送消息');
      },
      afterClose: () => { dialogOpen = false; },
    });
  };
}

export function useDeliveryStart() {
  const { modal, message } = App.useApp();
  return (afterStart?: () => void) => {
    if (dialogOpen || useAppStore.getState().autoAssist) return;
    if (useMatchAnalysisStore.getState().running) { void message.warning('请先完成或停止匹配度分析'); return; }
    const candidates = () => useDataStore.getState().pending.filter(p => p.status === 'approved' || p.status === 'approved_queue');
    const snapshot = JSON.stringify(candidates());
    if (!candidates().length) { void message.info('没有已确认的待投递岗位'); return; }
    dialogOpen = true;
    modal.confirm({
      title: `开始实际投递（${candidates().length} 个岗位）？`,
      content: '此操作会启动投递引擎，可能立即向招聘方发送招呼语和简历。仅查看岗位或更新匹配度时请取消。',
      okText: '确认开始投递', cancelText: '取消', autoFocusButton: 'cancel', okButtonProps: { danger: true },
      onOk: () => {
        if (useMatchAnalysisStore.getState().running || JSON.stringify(candidates()) !== snapshot) {
          void message.warning('队列已变化，请关闭弹窗后重新核对');
          return Promise.reject(new Error('队列已变化'));
        }
        const d = useDataStore.getState();
        const { next } = promoteApprovedToQueue(d.pending, useSettingsStore.getState().config);
        d.setPending(next);
        useAppStore.getState().setAutoAssist(true);
        afterStart?.();
      },
      afterClose: () => { dialogOpen = false; },
    });
  };
}
