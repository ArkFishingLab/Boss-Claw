// Run only against the isolated QA instance on 17660; never against the user's instance.
// DOM activation avoids Electron child-WebView CDP input focus issues. Native mouse/Escape are checked separately.
import assert from 'node:assert/strict';
import http from 'node:http';
import { chromium } from 'playwright-core';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

let mode = 'success';
let calls = 0;
let delay = 0;
const server = http.createServer(async (req, res) => {
  for await (const chunk of req) { void chunk; }
  calls++;
  if (delay) await new Promise(r => setTimeout(r, delay));
  const content = { score: mode === 'invalid' ? null : 88, fitLevel: 'strong', decision: 'recommend', hardBlocks: [],
    matchedEvidence: ['具有检索与记忆实践'], gaps: [], risks: [], reason: '模拟模型的可解释评分', greeting: '',
    dimensionScores: Object.fromEntries(['skill','direction','education','experience'].map(k => [k,{score:88,evidence:'与岗位要求匹配'}])) };
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ choices: [{message: {role: 'assistant',content: JSON.stringify(content)},finish_reason:'stop'}], usage: {prompt_tokens: 20,completion_tokens: 20} }));
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const port = server.address().port;
const browser = await chromium.connectOverCDP('http://127.0.0.1:17660');
const page = browser.contexts().flatMap(c => c.pages()).find(p => p.url().startsWith('file:'));
page.setDefaultTimeout(8000);
await page.bringToFront();

const artifactDir = fileURLToPath(new URL('../tmp/match-review-ui/', import.meta.url));
mkdirSync(artifactDir, { recursive: true });
const checks = [];
const action = async (action, params = {}) => {
  const result = await page.evaluate(({action,params}) => window.__bossclawControl.dispatch({action,params}), {action,params});
  if (action === 'navigate') await page.waitForFunction(({route}) => route === 'workbench'
    ? !!document.querySelector('.workbench-host.is-active')
    : !document.querySelector('.workbench-host.is-active') && !!document.querySelector('.page-route.is-show h1'), params);
  return result;
};
const surface = () => page.locator('.workbench-host.is-active, .page-route.is-show');
const getItems = async () => (await action('appDataFull', {sections:['pending']})).next.sections.pending.items;
const waitItem = async (predicate) => {
  const deadline=Date.now()+30000;
  while (Date.now()<deadline) {
    const item=(await getItems())[0];
    if (predicate(item)) return item;
    await new Promise(r=>setTimeout(r,100));
  }
  throw new Error('Timed out waiting for persisted QA job state');
};
const old = {score:50,scoreSource:'local',greeting:'[QA] 已保存的招呼语，测试不会发送',decision:'cautious',hardBlocks:[],matchedEvidence:[],gaps:[],risks:[],reason:'旧评分'};
const reset = async () => action('dataPendingUpdate', {id:'qa-a',patch:{status:'pending',analysis:old,analysisRefreshError:'',deliveryGreeting:old.greeting}});
const clickRefresh = async () => {
  await surface().getByRole('button', {name:/重新分析匹配度$/}).first().evaluate(el => el.click());
  await page.getByRole('dialog').getByRole('button',{name:'开始重新分析',exact:true}).evaluate(el => el.click());
  await page.getByRole('dialog').waitFor({state:'hidden'});
};
try {
  const existing = await getItems();
  assert(existing.every(p => p.id.startsWith('qa-')), 'Refusing to alter a non-QA queue');
  const resume = await action('appDataFull',{sections:['resume']});
  assert(!resume.next.sections.resume.text || resume.next.sections.resume.text.startsWith('[QA]'), 'Refusing to alter a personal resume');
  await page.evaluate(port => {
    window.dispatchEvent(new Event('pagehide'));
    const data=JSON.parse(localStorage.getItem('bossclaw-settings-v2') || 'null') || {state:{config:window.__bossclawControl.snapshot().settings.config},version:0};
    data.state.config.model={...data.state.config.model,provider:'openai',baseUrl:`http://127.0.0.1:${port}/v1`,model:'qa-model',apiKey:'qa-only'};
    localStorage.setItem('bossclaw-settings-v2',JSON.stringify(data));
  },port);
  await page.reload({waitUntil:'domcontentloaded'});
  await page.waitForFunction(() => !!window.__bossclawControl);
  await action('dataSetResume',{text:'[QA] 硕士，Python/PyTorch，独立开发RAG检索和长期记忆。'});
  await action('dataSetProfile',{profile:{facts:{education:['计算机硕士'],experiences:[],projects:[],skills:['Python','RAG','Agent'],certificates:[],capabilities:[]},primaryDirections:[{name:'Agent算法',confidence:.8,evidence:[]}],secondaryDirections:[],searchKeywords:['Agent'],hardConstraints:{locations:['上海'],employmentTypes:['全职'],salary:'',experience:'2年',degree:'硕士'},excludeDirections:[],summary:'[QA] 检索与记忆开发'}});
  await action('dataPendingAdd',{item:{id:'qa-a',job:{title:'[QA] Agent算法工程师',company:'隔离测试公司',salary:'20-30K',location:'上海',description:'负责RAG和Agent记忆，Python/PyTorch',url:'https://example.invalid/qa-a'},status:'pending',deliveryGreeting:old.greeting,analysis:old,createdAt:1}});
  await reset(); await action('navigate',{route:'workbench'});
  await page.setViewportSize({width:1000,height:760});
  const actions = surface().locator('.job-actions').filter({has:page.locator('.match-analysis-button')}).first();
  await actions.waitFor();
  const layout = await actions.evaluate(el => Array.from(el.querySelectorAll('button')).map(b => ({
    text:b.textContent.trim(), y:b.getBoundingClientRect().y, right:b.getBoundingClientRect().right,
    size:getComputedStyle(b).fontSize, parentRight:el.getBoundingClientRect().right
  })));
  assert.equal(layout.length,5); assert.equal(new Set(layout.map(b=>Math.round(b.y))).size,1);
  assert.equal(layout[0].text,'分析'); assert(layout.every(b=>b.size==='12px' && b.right<=b.parentRight+1));
  checks.push('Five compact actions fit one row at desktop minimum width');
  await page.screenshot({path:resolve(artifactDir,'compact-actions.png')});
  await surface().getByRole('button',{name:/确认沟通$/}).first().evaluate(el => el.click());
  await page.getByRole('dialog').getByRole('button',{name:/取\s*消/}).evaluate(el => el.click());
  await page.getByRole('dialog').waitFor({state:'hidden'});
  assert.equal((await getItems())[0].status,'pending'); checks.push('Workbench cancellation leaves pending unchanged');
  await surface().getByRole('button',{name:/确认沟通$/}).first().evaluate(el => el.click());
  await page.getByRole('dialog').getByRole('button',{name:/取\s*消/}).focus(); await page.getByRole('dialog').dispatchEvent('keydown',{key:'Escape',code:'Escape',keyCode:27}); await page.getByRole('dialog').waitFor({state:'hidden'});
  assert.equal((await getItems())[0].status,'pending'); checks.push('Escape has no side effect');
  await surface().getByRole('button',{name:/确认沟通$/}).first().evaluate(el => el.click());
  await page.getByRole('dialog').getByRole('button',{name:'确认，加入待投递',exact:true}).evaluate(el => el.click());
  await page.getByRole('dialog').waitFor({state:'hidden'});
  assert.equal((await getItems())[0].status,'approved');
  assert.equal((await action('state')).next.app.autoAssist,false); checks.push('Approval only enters approved, never starts engine');
  await action('navigate',{route:'autochat'});
  await surface().locator('.autochat-queue-scroll').getByRole('button',{name:/沟\s*通$/}).first().evaluate(el=>el.click());
  assert((await page.getByRole('dialog').innerText()).includes('发送这条沟通消息'));
  await page.getByRole('dialog').getByRole('button',{name:/取\s*消/}).evaluate(el=>el.click());
  await page.getByRole('dialog').waitFor({state:'hidden'});
  assert.equal((await getItems())[0].status,'approved');
  checks.push('Single AutoChat send requires confirmation; cancel keeps queue unchanged');
  for (const command of ['setAutoAssist','autochatStart','autochatStep','deliverySendNow','pendingPromote']) {
    assert.equal((await action(command, {enabled:true,id:'qa-a'})).applied,false);
  }
  checks.push('Remote control cannot bypass send confirmation');
  await action('navigate',{route:'settings'});
  await surface().getByRole('radio',{name:'全自动投递',exact:true}).evaluate(el=>el.click());
  assert((await page.getByRole('dialog').innerText()).includes('开启全自动投递模式'));
  await page.getByRole('dialog').getByRole('button',{name:/取\s*消/}).evaluate(el=>el.click());
  await page.getByRole('dialog').waitFor({state:'hidden'});
  assert.equal((await action('state')).next.settings.config.executionMode,'review');
  checks.push('Enabling automatic mode requires confirmation; cancel retains manual review');
  await action('navigate',{route:'workbench'});
  await surface().getByRole('button',{name:/一键投递$/}).evaluate(el=>el.click());
  assert((await page.getByRole('dialog').innerText()).includes('开始实际投递'));
  await page.getByRole('dialog').getByRole('button',{name:/取\s*消/}).evaluate(el=>el.click());
  await page.getByRole('dialog').waitFor({state:'hidden'});
  assert.equal((await getItems())[0].status,'approved');assert.equal((await action('state')).next.app.autoAssist,false);
  checks.push('Actual delivery start has a separate cancellable dialog');
  await reset(); await action('navigate',{route:'tasks'});
  await surface().getByRole('button',{name:/确认沟通$/}).first().evaluate(el => el.click());
  await action('dataPendingUpdate',{id:'qa-a',patch:{deliveryGreeting:'[QA] 弹窗打开后修改的招呼语'}});
  await page.getByRole('dialog').getByRole('button',{name:'确认，加入待投递',exact:true}).evaluate(el => el.click());
  assert.equal((await getItems())[0].status,'pending');
  await page.getByRole('dialog').getByRole('button',{name:/取\s*消/}).evaluate(el => el.click());
  await page.getByRole('dialog').waitFor({state:'hidden'}); checks.push('Tasks detects stale greeting and blocks approval');
  await reset(); await action('setTheme',{theme:'dark'});
  await page.setViewportSize({width:1000,height:760});
  await surface().getByRole('button',{name:/确认沟通$/}).first().evaluate(el => el.click());
  await page.getByRole('dialog').waitFor();
  await page.screenshot({path:resolve(artifactDir,'approval-dark-narrow.png')});
  await page.getByRole('dialog').getByRole('button',{name:/取\s*消/}).focus(); await page.getByRole('dialog').dispatchEvent('keydown',{key:'Escape',code:'Escape',keyCode:27}); await page.getByRole('dialog').waitFor({state:'hidden'});
  checks.push('Dark/narrow dialog and keyboard inspected');
  await action('setTheme',{theme:'light'});
  delay=600;
  await clickRefresh(); await action('navigate',{route:'workbench'});
  let item=await waitItem(p => p?.analysis?.scoreSource==='ai');
  assert.equal(item.analysis.scoreSource,'ai');assert.equal(item.status,'pending');assert.equal(item.deliveryGreeting,old.greeting);
  assert.equal(item.analysisHistory.at(-1).analysis.score,50); checks.push('LLM refresh succeeds across navigation and keeps greeting/status/history');
  const firstCalls=calls; const previousAt=item.analysisUpdatedAt; delay=0; await clickRefresh();
  await waitItem(p => p?.analysisUpdatedAt > previousAt);
  assert(calls>firstCalls); checks.push('Explicit repeat refresh bypasses old model cache');
  const preserved=(await getItems())[0].analysis.score;
  mode='invalid'; await clickRefresh();
  item=await waitItem(p => !!p?.analysisRefreshError); assert.equal(item.analysis.score,preserved);assert(item.analysisRefreshError);
  checks.push('Null model score fails visibly and preserves previous result');
  mode='success';delay=5000;await clickRefresh();
  await surface().getByRole('button',{name:/停止分析$/}).evaluate(el => el.click());
  await page.waitForFunction(() => !document.body.innerText.includes('正在停止'),undefined,{timeout:12000});
  await new Promise(r=>setTimeout(r,1400));
  assert.equal((await getItems())[0].analysis.score,preserved); checks.push('Stop discards active response');
  await page.screenshot({path:resolve(artifactDir,'match-refresh-result.png'),fullPage:true});
  await page.reload({waitUntil:'domcontentloaded'});await page.waitForFunction(()=>!!window.__bossclawControl);
  assert.equal((await getItems())[0].analysis.score,preserved); checks.push('Queue roundtrip retains refreshed result');
  assert.equal((await action('state')).next.app.autoAssist,false);
  assert((await getItems()).every(p=>p.status==='pending'));checks.push('No delivery or message action throughout test');
  writeFileSync(resolve(artifactDir,'result.json'),JSON.stringify({passed:checks.length,checks,modelRequests:calls},null,2));
  console.log(JSON.stringify({passed:checks.length,checks,modelRequests:calls},null,2));
} finally {
  await browser.close();
  await new Promise(r=>server.close(r));
}
