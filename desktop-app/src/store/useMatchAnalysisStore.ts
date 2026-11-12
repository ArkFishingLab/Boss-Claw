import { create } from 'zustand';
import { useDataStore } from './useDataStore';
import { useSettingsStore } from './useSettingsStore';
import { useAppStore } from './useAppStore';
import { useAutoChatStore } from './useAutoChatStore';
import { useRuntimeLogsStore } from './useRuntimeLogsStore';
import { analyzeJob } from '@/lib/bossclaw/matching';
import type { PendingItem } from '@/lib/bossclaw/types';

// Full snapshots stay in memory only; no API keys or duplicate resume text are persisted.
function inputs(item: PendingItem): string {
  const d = useDataStore.getState();
  return JSON.stringify([item.job, d.resumeText, d.profile, d.greetingPrompt, useSettingsStore.getState().config]);
}

interface MatchAnalysisState {
  running: boolean;
  cancelRequested: boolean;
  activeId: string | null;
  total: number;
  completed: number;
  succeeded: number;
  failed: number;
  skipped: number;
  notice: string;
  start: (ids?: string[]) => Promise<void>;
  stop: () => void;
}

export const useMatchAnalysisStore = create<MatchAnalysisState>((set, get) => ({
  running: false, cancelRequested: false, activeId: null,
  total: 0, completed: 0, succeeded: 0, failed: 0, skipped: 0, notice: '',
  stop: () => set({ cancelRequested: true, notice: '正在停止；当前请求返回后不会写入结果，也不会继续下一项。' }),
  start: async (ids) => {
    if (get().running) return;
    const cfg = useSettingsStore.getState().config;
    const chat = useAutoChatStore.getState();
    if (useAppStore.getState().autoAssist || chat.chatRunning || chat.watchRunning) {
      set({ notice: '请先停止投递引擎与自动沟通，再重新分析匹配度。' }); return;
    }
    if (!cfg.model.apiKey || !cfg.model.baseUrl || !cfg.model.model) {
      set({ notice: '请先在设置中配置并测试 LLM 连接。' }); return;
    }
    const selected = ids ? new Set(ids) : null;
    const items = useDataStore.getState().pending.filter(p => p.status === 'pending' && (!selected || selected.has(p.id)));
    if (!items.length) { set({ notice: '没有可重新分析的待确认岗位。' }); return; }
    set({ running: true, cancelRequested: false, activeId: null, total: items.length, completed: 0, succeeded: 0, failed: 0, skipped: 0, notice: '' });
    let consecutiveFailures = 0;
    try {
      for (const selectedItem of items) {
        if (get().cancelRequested) break;
        const item = useDataStore.getState().pending.find(p => p.id === selectedItem.id);
        if (!item || item.status !== 'pending') { set(s => ({ completed: s.completed + 1, skipped: s.skipped + 1 })); continue; }
        set({ activeId: item.id });
        const snapshot = inputs(item);
        const previousAnalysis = item.analysis;
        try {
          if (!item.job.description?.trim()) throw new Error('缺少岗位 JD，请先打开详情并补全岗位信息');
          const d = useDataStore.getState();
          const c = useSettingsStore.getState().config;
          const result = await analyzeJob(item.job, d.profile, d.resumeText, c, c.model, d.greetingPrompt, {
            forceRefresh: true, requireAI: true, scoreOnly: true, skipHardBlockShortCircuit: true,
          });
          if (get().cancelRequested) break;
          const latest = useDataStore.getState().pending.find(p => p.id === item.id);
          if (!latest || latest.status !== 'pending' || inputs(latest) !== snapshot || latest.analysis !== previousAnalysis) {
            set(s => ({ skipped: s.skipped + 1 }));
          } else {
            if (result.scoreSource !== 'ai') throw new Error('未得到有效 AI 评分，旧评分已保留');
            result.greeting = latest.analysis?.greeting || '';
            const at = Date.now();
            useDataStore.getState().updatePending(item.id, {
              analysis: result,
              analysisHistory: [...(latest.analysisHistory || []), ...(latest.analysis ? [{ analysis: latest.analysis, replacedAt: at }] : [])].slice(-5),
              analysisUpdatedAt: at, analysisModel: `${c.model.provider} / ${c.model.model}`, analysisRefreshError: '',
            });
            set(s => ({ succeeded: s.succeeded + 1 }));
          }
          consecutiveFailures = 0;
        } catch (error) {
          if (get().cancelRequested) break;
          const latest = useDataStore.getState().pending.find(p => p.id === item.id);
          const reason = error instanceof Error ? error.message : '重新分析失败，旧评分已保留';
          if (latest?.status === 'pending' && inputs(latest) === snapshot && latest.analysis === previousAnalysis) {
            useDataStore.getState().updatePending(item.id, { analysisRefreshError: reason });
          }
          set(s => ({ failed: s.failed + 1 }));
          consecutiveFailures += 1;
        }
        set(s => ({ completed: s.completed + 1 }));
        if (consecutiveFailures >= 3) { set({ notice: '连续三项失败，已停止。请检查模型连接与岗位资料后重试；旧评分已保留。' }); break; }
      }
    } finally {
      set({ running: false, activeId: null });
      const s = get();
      const summary = `匹配度重评：成功 ${s.succeeded}，失败 ${s.failed}，跳过 ${s.skipped}，未更新 ${s.total - s.completed}；岗位状态与招呼语未改变。`;
      set({ notice: s.cancelRequested ? `已停止分析。${summary}` : s.notice ? `${s.notice} ${summary}` : summary });
      useRuntimeLogsStore.getState().addLog(s.failed ? 'warn' : 'success', summary);
      useDataStore.getState().recomputeStats();
    }
  },
}));
