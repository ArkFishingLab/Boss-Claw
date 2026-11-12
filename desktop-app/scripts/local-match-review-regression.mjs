import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const dir = mkdtempSync(join(tmpdir(), 'bossclaw-match-review-'));
const storage = new Map();
globalThis.localStorage = { getItem: k => storage.get(k) ?? null, setItem: (k, v) => storage.set(k, v), removeItem: k => storage.delete(k) };
globalThis.window = { localStorage: globalThis.localStorage, addEventListener() {} };
globalThis.document = { addEventListener() {} };
try {
  const outfile = join(dir, 'test.cjs');
  await build({
    stdin: { contents: `export {useMatchAnalysisStore as m} from './src/store/useMatchAnalysisStore';
      export {useDataStore as d} from './src/store/useDataStore';
      export {useSettingsStore as c} from './src/store/useSettingsStore';
      export {useAppStore as a} from './src/store/useAppStore';`, resolveDir: root, loader: 'ts' },
    bundle: true, platform: 'node', format: 'cjs', outfile, logLevel: 'silent',
    plugins: [{ name: 'no-external-actions', setup(b) {
      b.onLoad({ filter: /\/matching\.ts$/ }, () => ({ contents: 'export const analyzeJob = (...args) => globalThis.matchStub(...args);', loader: 'ts' }));
      b.onLoad({ filter: /\/useAutoChatStore\.ts$/ }, () => ({ contents: 'export const useAutoChatStore = {getState:()=>({chatRunning:false,watchRunning:false})};', loader: 'ts' }));
    } }],
  });
  const { m, d, c, a } = createRequire(import.meta.url)(outfile);
  const old = { score: 50, scoreSource: 'local', greeting: '原招呼语', decision: 'cautious', hardBlocks: [], matchedEvidence: [], gaps: [], risks: [], reason: '旧结果' };
  const job = id => ({ id, job: { title: 'Agent开发', description: '负责RAG与记忆系统', url: `https://example.invalid/${id}` }, status: 'pending', deliveryGreeting: '用户编辑的招呼语', createdAt: 1, analysis: old });
  const ok = () => ({ ...old, score: 88, scoreSource: 'ai', greeting: '模型擅自改写的招呼语' });
  const reset = (items = [job('a')]) => {
    d.setState({ pending: items, profile: { summary: '当前画像' }, resumeText: '当前简历' });
    c.getState().setConfig({ model: { ...c.getState().config.model, apiKey: 'qa-only', baseUrl: 'http://localhost/v1', model: 'qa-model' } });
    a.setState({ autoAssist: false, engineStatus: 'stopped' });
    m.setState({ running: false, notice: '', cancelRequested: false });
    globalThis.matchStub = async (...args) => {
      assert.deepEqual(args[6], { forceRefresh: true, requireAI: true, scoreOnly: true, skipHardBlockShortCircuit: true });
      return ok();
    };
  };
  let passed = 0;
  const check = (actual, expected) => { assert.deepEqual(actual, expected); passed++; };

  reset(); await m.getState().start(['a', 'a']);
  check(m.getState().succeeded, 1);
  check(d.getState().pending[0].analysis.score, 88);
  check(d.getState().pending[0].status, 'pending');
  check(d.getState().pending[0].deliveryGreeting, '用户编辑的招呼语');
  check(d.getState().pending[0].analysis.greeting, '原招呼语');
  check(d.getState().pending[0].analysisHistory[0].analysis.score, 50);
  check(a.getState().autoAssist, false);

  for (const change of [
    () => d.getState().updatePending('a', { status: 'ignored' }),
    () => d.getState().removePending('a'),
    () => d.getState().updatePending('a', { job: { ...job('a').job, description: '新JD' } }),
    () => d.setState({ resumeText: '修改后的简历' }),
    () => c.getState().setModel({ model: 'different-model' }),
    () => d.getState().updatePending('a', { analysis: { ...old, score: 66 } }),
  ]) {
    reset(); let release;
    globalThis.matchStub = () => new Promise(r => { release = r; });
    const task = m.getState().start();
    change(); release(ok()); await task;
    check(m.getState().succeeded, 0);
    check(m.getState().skipped, 1);
    check(d.getState().pending[0]?.analysis?.score === 88, false);
  }
  reset([job('a'), job('b')]); let release; let calls = 0;
  globalThis.matchStub = () => { calls++; return new Promise(r => { release = r; }); };
  const task = m.getState().start(); await m.getState().start();
  m.getState().stop(); release(ok()); await task;
  check(calls, 1); check(d.getState().pending.map(p => p.analysis.score), [50, 50]);

  reset(); globalThis.matchStub = async () => { throw Error('模型不可用'); }; await m.getState().start();
  check(d.getState().pending[0].analysis, old); check(m.getState().failed, 1);
  reset(); globalThis.matchStub = async () => ({ ...old }); await m.getState().start();
  check(d.getState().pending[0].analysis, old); check(m.getState().failed, 1);

  reset(['a','b','c','d'].map(job)); calls = 0;
  globalThis.matchStub = async () => { calls++; throw Error('模型不可用'); }; await m.getState().start();
  check(calls, 3); check(m.getState().completed, 3); check(d.getState().pending.every(p => p.analysis === old), true);
  reset([{ ...job('a'), job: { title: '无JD' } }]); calls = 0;
  globalThis.matchStub = async () => { calls++; return ok(); }; await m.getState().start();
  check(calls, 0); check(m.getState().failed, 1);
  reset([{ ...job('a'), status: 'sent' }, { ...job('b'), status: 'ignored' }]); await m.getState().start();
  check(m.getState().notice, '没有可重新分析的待确认岗位。');
  reset(); a.setState({ autoAssist: true }); await m.getState().start(); check(d.getState().pending[0].analysis, old);
  reset(); c.getState().setModel({ apiKey: '' }); await m.getState().start(); check(d.getState().pending[0].analysis, old);
  console.log(`local match review: ${passed} checks passed (no network or delivery)`);
} finally {
  rmSync(dir, { recursive: true, force: true });
}
