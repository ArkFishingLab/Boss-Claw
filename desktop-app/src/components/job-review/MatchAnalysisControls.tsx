import { App, Alert, Button, Space, Typography } from 'antd';
import { ReloadOutlined, StopOutlined } from '@ant-design/icons';
import { useDataStore } from '@/store/useDataStore';
import { useSettingsStore } from '@/store/useSettingsStore';
import { useMatchAnalysisStore } from '@/store/useMatchAnalysisStore';
import type { PendingItem } from '@/lib/bossclaw/types';
import './job-review.css';

let refreshDialogOpen = false;

export function MatchAnalysisButton({ id }: { id?: string }) {
  const { modal } = App.useApp();
  const running = useMatchAnalysisStore(s => s.running);
  const activeId = useMatchAnalysisStore(s => s.activeId);
  const pending = useDataStore(s => s.pending);
  const count = pending.filter(p => p.status === 'pending' && (!id || p.id === id)).length;
  const onClick = () => {
    if (refreshDialogOpen || useMatchAnalysisStore.getState().running) return;
    const ids = useDataStore.getState().pending.filter(p => p.status === 'pending' && (!id || p.id === id)).map(p => p.id);
    const model = useSettingsStore.getState().config.model;
    refreshDialogOpen = true;
    modal.confirm({
      title: '重新分析匹配度？',
      content: `使用当前模型 ${model.model || '（尚未配置）'} 分析 ${ids.length} 个待确认岗位，会产生 API 调用费用。保留旧评分、岗位状态和招呼语，不投递、不发送消息。`,
      okText: '开始重新分析', cancelText: '取消', autoFocusButton: 'cancel',
      onOk: () => { void useMatchAnalysisStore.getState().start(ids); },
      afterClose: () => { refreshDialogOpen = false; },
    });
  };
  return <Button className="match-analysis-button" size="small" title={id ? '重新分析匹配度' : undefined} aria-label={id ? '重新分析匹配度' : undefined} icon={<ReloadOutlined />} onClick={onClick} disabled={running || !count} loading={running && !!id && activeId === id}>
    {id ? '分析' : `重新分析匹配度（${count}）`}
  </Button>;
}

export function MatchAnalysisProgress() {
  const s = useMatchAnalysisStore();
  if (!s.running && !s.notice) return null;
  return <div role="status" aria-live="polite" style={{ marginTop: 8 }}>
    <Alert type={s.failed ? 'warning' : 'info'} showIcon message={s.running
      ? <Space wrap>重新分析 {s.completed}/{s.total} · 成功 {s.succeeded} · 失败 {s.failed}
          <Button size="small" icon={<StopOutlined />} disabled={s.cancelRequested} onClick={s.stop}>{s.cancelRequested ? '正在停止' : '停止分析'}</Button>
        </Space>
      : s.notice} description={s.running ? '只更新匹配分析。切换页面可继续查看进度；停止后当前请求结果会丢弃。' : undefined} />
  </div>;
}

export function MatchAnalysisInfo({ item }: { item: PendingItem }) {
  return <div>
    {item.analysisUpdatedAt && <Typography.Text type="secondary" style={{ fontSize: 12 }}>
      最近重评：{new Date(item.analysisUpdatedAt).toLocaleString('zh-CN')} · {item.analysisModel} · 保留旧评分 {item.analysisHistory?.length || 0} 次
    </Typography.Text>}
    {item.analysisRefreshError && <div><Typography.Text type="warning">重评未更新：{item.analysisRefreshError}</Typography.Text></div>}
  </div>;
}
