import test from 'node:test';
import assert from 'node:assert/strict';
import { createRun } from '../src/workbench/engine.js';
import { analyzeRun } from '../src/workbench/analytics.js';
import { evidenceMarkdown, reportMarkdown, reportHtml, reportEvidenceMarkdown, reportEvidenceHtml, exportRun } from '../src/workbench/report.js';
import { diagnoseBusiness } from '../src/workbench/business-diagnosis.js';
import { initializeSamplingQueue } from '../src/workbench/sampling-queue.js';
import type { Project, Sample } from '../src/workbench/types.js';
const project: Project = { id:'analysis-fixture', name:'松灵', brand:'松灵机器人', aliases:['AgileX'], domain:'agilex.ai',industry:'机器人', description:'',origin:'manual',goal:'测量',sources:[],claims:[],queries:[{id:'q1',text:'机器人底盘怎么选？',intent:'选型',branded:false,origin:'manual'}],queryVersion:5,samples:[],createdAt:'2026-11-08T00:00:00Z',updatedAt:'2026-11-08T00:00:00Z' };
const sample = (id:string, patch:Partial<Sample>={}): Sample => ({ id,queryId:'q1',question:'机器人底盘怎么选？',intent:'选型',branded:false,origin:'api',model:'deepseek/test',observedAt:'2026-11-08T00:00:00Z',runGroup:'baseline',protocolId:'api/v1',collectionStatus:'completed',analysisStatus:'completed',answer:'AgileX 可以列入核对范围。',citations:[{url:'https://agilex.ai/page',kind:'provider_citation',source:'provider',integrity:'matched'}],...patch });
test('diagnostic uses adopted units, preserves fallback and separates conditions',()=>{
 const run=createRun(project,'live');run.status='completed';run.samples=[sample('web-failed',{origin:'browser',collectionStatus:'failed',analysisStatus:'unknown',answer:'',selected:false,error:'login wall'}),sample('api-good',{selected:true}),sample('different',{origin:'browser',model:'ChatGPT Web',protocolId:'ui/v2'})];
 run.measurementUnits=[{id:'u1',queryId:'q1',question:'机器人底盘怎么选？',targetId:'chatgpt',platform:'ChatGPT',preferredChannel:'web',status:'completed',selectedSampleId:'api-good',attempts:[{id:'a1',unitId:'u1',targetId:'chatgpt',platform:'ChatGPT',channel:'web',status:'failed',fallback:false,reason:'login wall',startedAt:'',finishedAt:''},{id:'a2',unitId:'u1',targetId:'chatgpt',platform:'ChatGPT',channel:'api',status:'completed',fallback:true,startedAt:'',finishedAt:''}]},{id:'u2',queryId:'q1',question:'机器人底盘怎么选？',targetId:'other',platform:'Other',preferredChannel:'web',status:'completed',selectedSampleId:'different',attempts:[]},{id:'u3',queryId:'q1',question:'机器人底盘怎么选？',targetId:'qwen',platform:'Qwen',preferredChannel:'api',status:'failed',attempts:[]}];
 const a=analyzeRun(run);assert.equal(a.quality.planned,3);assert.equal(a.quality.valid,2);assert.equal(a.quality.attempts,2);assert.equal(a.metrics.brands[0]?.visibility.value,null);assert.equal(a.sources.cohorts.length,2);assert.equal(a.rows[2]?.reason,'not-collected');
 const api=analyzeRun(run,{channel:'api'});assert.equal(api.quality.planned,2);assert.equal(api.quality.valid,1);assert.equal(api.metrics.brands[0]?.visibility.value,1);
});
test('heading contamination and failed analysis remain unknown and out of metrics',()=>{
 const run=createRun(project,'replay');run.status='completed';run.samples=[sample('heading',{question:'## 非点名题'}),sample('bad',{analysisStatus:'failed',error:'analysis failed'}),sample('good')];
 const a=analyzeRun(run);assert.equal(a.quality.contaminated,true);assert.equal(a.quality.valid,1);assert.equal(a.quality.excluded,2);assert.equal(a.metrics.brands[0]?.visibility.denominator,1);assert.equal(a.sources.domains[0]?.citationCount,1);assert.match(reportMarkdown(run),/qa-only/);
});
test('exports share analysis filters, remove strategy noise, and HTML keeps hostile evidence inert',()=>{
 const run=createRun(project,'replay');run.samples=[sample('good',{answer:'AgileX <script>alert(1)</script> [click](javascript:alert(1)) ![image](https://tracker.example/pixel)'}),sample('other',{model:'other/model',answer:'Other'})];run.actions=[{id:'a',title:'SHOULD NOT APPEAR',kind:'content',priority:'P1',rationale:'',queryIds:[],sampleIds:[],claimIds:[],acceptance:'',status:'proposed'}];
 const md=reportMarkdown(run,{model:'deepseek/test'});assert.match(md,/1\/1/);assert.ok(!md.includes('SHOULD NOT APPEAR'));assert.ok(!md.includes('### other'));const html=reportHtml(run);assert.ok(!html.includes('<script>'));assert.ok(!html.includes('href="javascript:'));assert.ok(!html.includes('<img'));const evidence=reportEvidenceMarkdown(run);assert.match(evidence,/回答原文/);assert.match(evidence,/AgileX/);const evidenceHtml=reportEvidenceHtml(run);assert.ok(!evidenceHtml.includes('<script>'));assert.ok(!evidenceHtml.includes('href="javascript:'));assert.ok(!evidenceHtml.includes('<img'));assert.match(evidenceHtml,/&lt;script&gt;/);
});
test('reused local IDs across batches keep independent eligibility, sources and trends', () => {
 const run=createRun(project,'replay');run.samples=[sample('same',{runGroup:'first'}),sample('same',{runGroup:'second',analysisStatus:'failed',answer:'Other'})];
 const a=analyzeRun(run);assert.equal(a.quality.valid,1);assert.equal(a.quality.excluded,1);assert.equal(a.rows[0]?.mentioned,true);assert.equal(a.sources.cohorts.length,1);assert.equal(a.trends.flatMap(t=>t.points).length,1);
});
test('a selected record cannot inflate metrics through two frozen units', () => {
 const run=createRun(project,'replay');run.samples=[sample('one')];run.measurementUnits=['u1','u2'].map(id=>({id,queryId:'q1',question:project.queries[0]!.text,targetId:'api',platform:'API',preferredChannel:'api',status:'completed',selectedSampleId:'one',attempts:[]}));
 const a=analyzeRun(run);assert.equal(a.quality.valid,1);assert.equal(a.metrics.brands[0]?.visibility.denominator,1);assert.equal(a.sources.domains[0]?.citationCount,1);assert.equal(a.rows[1]?.reason,'duplicate-adopted-sample');
});
test('ambiguous frozen references fail explicitly rather than select the last record', () => {
 const run=createRun(project,'replay');run.samples=[sample('same',{runGroup:'a'}),sample('same',{runGroup:'b'})];run.measurementUnits=[{id:'u1',queryId:'q1',question:project.queries[0]!.text,targetId:'api',platform:'API',preferredChannel:'api',status:'completed',selectedSampleId:'same',attempts:[]}];
 const a=analyzeRun(run);assert.equal(a.quality.valid,0);assert.equal(a.rows[0]?.reason,'ambiguous-selected-sample');
});

test('diagnostic report is concise while full evidence remains separately available', () => {
 const run=createRun(project,'replay');run.status='completed';run.samples=[sample('brief',{answer:'AgileX '+ '原文证据 '.repeat(3000)})];
 const brief=reportMarkdown(run), full=evidenceMarkdown(run);
 assert.ok(brief.length < full.length/3);assert.match(brief,/先看业务结论/);assert.match(brief,/优先业务机会/);assert.match(full,/原文证据/);
 assert.ok(!reportMarkdown(run,{model:'absent'}).includes('制作选型问题'));
});

test('diagnostic briefs never reuse counts or evidence outside the selected scope', async()=>{
 const {diagnoseRun}=await import('../src/workbench/diagnosis.js');
 const run=createRun(project,'replay');run.status='completed';run.samples=[sample('good'),sample('bad',{model:'other',analysisStatus:'failed'})];
 run.actions=[{id:'old',kind:'content',title:'UNSCOPED COUNT',priority:'P1',rationale:'2 observations',queryIds:['q1'],sampleIds:['good','bad'],claimIds:[],acceptance:'',status:'proposed'}];
 const d=diagnoseRun(run,{model:'deepseek/test'});assert.ok(!d.actions.some(a=>a.id==='old'));assert.ok(d.actions.every(a=>a.sampleIds.every(id=>id==='good')));
 const derived=d.actions[0]!;run.actionStates={[derived.id]:'skipped'};assert.equal(diagnoseRun(run,{model:'deepseek/test'}).actions[0]?.status,'skipped');
 run.samples=[sample('bad',{analysisStatus:'failed'})];assert.equal(diagnoseRun(run).actions.length,0);
});

test('business brief turns an observed unbranded miss into a reviewable content hypothesis', () => {
 const p = { ...project, businessContext: { audiences: ['高校实验室'], priorityProducts: ['移动底盘'], goals: ['进入科研选型 shortlist'], conversionAction: '预约演示' }, queries: [{ ...project.queries[0]!, text: '大学实验室应比较哪些 ROS 2 移动机器人底盘？', intent: '选型', branded: false }] };
 const run = createRun(p, 'replay'); run.status = 'completed'; run.samples = [sample('miss', { question: p.queries[0]!.text, answer: 'Clearpath 和 TurtleBot 可供比较。' })];
 const md = reportMarkdown(run);
 assert.match(md, /先看业务结论/);
 assert.match(md, /移动底盘与导航：验证自然选型中的品牌进入/);
 assert.match(md, /大学实验室/);
 assert.match(md, /原题、同入口和协议复测/);
 assert.equal(diagnoseBusiness(run, analyzeRun(run)).opportunities[0]?.brandRole, 'unknown');
 assert.equal(diagnoseBusiness(run, analyzeRun(run)).opportunities[0]?.confidence, 'low');
});
test('supplied candidates stay separate from natural discovery and branded facts', () => {
 const queries = [
  {id:'natural',text:'哪些平台适合具身智能数据采集？',intent:'natural',branded:false,origin:'manual'},
  {id:'compare',text:'比较 PiPER、Cobot Magic、Pika 的数据采集方案',intent:'candidate_comparison',branded:false,origin:'manual'},
  {id:'fact',text:'AgileX 的具身产品配置是什么？',intent:'branded_fact',branded:true,origin:'manual'},
 ];
 const run=createRun({...project,queries},'replay');
 run.samples=queries.map(q=>sample(q.id,{queryId:q.id,question:q.text,intent:q.intent,branded:q.branded,answer:q.branded?'AgileX has product documentation.':'PiPER and Cobot Magic are candidates.'}));
 const business=diagnoseBusiness(run,analyzeRun(run));
 assert.deepEqual(business.opportunities.map(o=>o.questionKind),['natural','candidate_comparison','branded_fact']);
 assert.ok(business.opportunities.every(o=>o.queryIds.length===1 && o.claimIds.length===0));
 assert.match(business.opportunities[1]!.recommendedAction,/不能计为自然发现/);
 assert.match(business.opportunities[2]!.recommendedAction,/不证明事实错误/);
});
test('QA-only runs do not generate business actions',()=>{
 const run=createRun(project,'replay');run.samples=[sample('heading',{question:'## 非点名题'}),sample('miss',{answer:'Other platforms are available.'})];
 assert.equal(diagnoseBusiness(run,analyzeRun(run)).opportunities.length,0);
});
test('manual comparisons need confirmed candidates and preserve branded validation', () => {
 for (const [text, intent] of [
   ['比较 PiPER、Cobot Magic、Pika 的数据采集方案', '用户问题'],
   ['Compare PiPER, Cobot Magic and Pika for data collection', 'informational'],
   ['PiPER vs Pika for data collection', 'informational'],
 ]) {
   const p = { ...project, queries: [{ ...project.queries[0]!, text: text!, intent: intent! }] };
   const run = createRun(p, 'replay'); run.samples = [sample('candidate', { question: text!, intent: intent!, answer: 'AgileX PiPER is one of the supplied options.' })];
   const business = diagnoseBusiness(run, analyzeRun(run));
   assert.equal(business.scenarios[0]?.questionKind, 'unknown', text);
   assert.equal(business.opportunities.length, 0, text);
   run.projectSnapshot.businessContext = { priorityProducts: ['PiPER', 'Pika'] };
   const confirmed = diagnoseBusiness(run, analyzeRun(run));
   assert.equal(confirmed.scenarios[0]?.questionKind, 'candidate_comparison', text);
   assert.equal(confirmed.opportunities.length, 1, text);
   assert.match(confirmed.opportunities[0]!.recommendedAction, /不能计为自然发现/);
 }
 for (const text of ['Compare support, budget and integration when choosing analytics tools',
   'Compare ROS 1 and ROS 2 support when choosing mobile robot bases',
   '比较 SDK、API 和 ROS 支持情况时应如何选择机器人底盘？']) {
   const run = createRun({ ...project, queries: [{ ...project.queries[0]!, text, intent: 'informational' }] }, 'replay');
   run.samples = [sample('criteria', { question: text, intent: 'informational', answer: 'Other tools may fit.' })];
   assert.equal(diagnoseBusiness(run, analyzeRun(run)).scenarios[0]?.questionKind, 'natural', text);
 }
 const pricing = 'Compare Acme’s US and EU pricing.';
 const branded = createRun({ ...project, queries: [{ ...project.queries[0]!, text: pricing, branded: true, intent: '用户问题' }] }, 'replay');
 branded.samples = [sample('pricing', { question: pricing, branded: true })];
 assert.equal(diagnoseBusiness(branded, analyzeRun(branded)).scenarios[0]?.questionKind, 'branded_fact');
 const criteria = 'Compare Documentation and Support when selecting an analytics tool.';
 const ambiguous = createRun({ ...project, queries: [{ ...project.queries[0]!, text: criteria, intent: 'informational' }] }, 'replay');
 ambiguous.samples = [sample('criteria', { question: criteria })];
 assert.equal(diagnoseBusiness(ambiguous, analyzeRun(ambiguous)).scenarios[0]?.questionKind, 'unknown');
 assert.equal(diagnoseBusiness(ambiguous, analyzeRun(ambiguous)).opportunities.length, 0);
});
test('later purchase questions remain visible after six earlier opportunities',()=>{
 const queries=Array.from({length:8},(_,i)=>({id:`q${i}`,text:i===7?'LIMO PRO 标准配置是否包含机械臂？':`AgileX 第 ${i} 个产品配置是什么？`,intent:'branded_fact',branded:true,origin:'manual'}));
 const run=createRun({...project,queries},'replay');run.samples=queries.map(q=>sample(q.id,{queryId:q.id,question:q.text,branded:true,intent:q.intent}));
 const b=diagnoseBusiness(run,analyzeRun(run));
 assert.equal(b.opportunities.length,8);assert.ok(b.scenarios.every(s=>s.opportunityId));
 assert.match(b.opportunities[7]!.deliverable,/LIMO PRO \/ LIMO COBOT/);
});
test('evidence filters do not leak reused local IDs from another model or batch',()=>{
 const run=createRun(project,'replay');run.samples=[sample('same',{runGroup:'one',answer:'AgileX INCLUDED_EVIDENCE'}),sample('same',{runGroup:'two',model:'other/model',answer:'EXCLUDED_EVIDENCE'})];
 const evidence=reportEvidenceMarkdown(run,{model:'deepseek/test'});
 assert.match(evidence,/INCLUDED_EVIDENCE/);assert.doesNotMatch(evidence,/EXCLUDED_EVIDENCE/);
 assert.doesNotMatch(reportMarkdown(run),/### same/);
});
test('international non-robotics opportunities use English task language',()=>{
 const p={...project,market:'international' as const,industry:'Analytics',description:'Product analytics',domain:'example.com',queries:[{id:'q1',text:'Which analytics tools should teams compare?',intent:'natural',branded:false,origin:'manual'}]};
 const run=createRun(p,'replay');run.samples=[sample('miss',{question:p.queries[0]!.text,answer:'Other tools are available.'})];
 const b=diagnoseBusiness(run,analyzeRun(run));
 assert.doesNotMatch(JSON.stringify(b),/[\u3400-\u9fff]|robot|LIMO/);
});
test('business brief keeps incomplete coverage unknown instead of inventing a content gap', () => {
 const p = { ...project, queries: [{ ...project.queries[0]!, text: '高校实验室如何选择移动机器人底盘？', intent: '选型', branded: false }] };
 const run = createRun(p, 'replay'); run.status = 'completed'; run.measurementUnits = [
   { id: 'u1', queryId: p.queries[0]!.id, question: p.queries[0]!.text, targetId: 'api', platform: 'DeepSeek', preferredChannel: 'api', status: 'completed', selectedSampleId: 'seen', attempts: [] },
   { id: 'u2', queryId: p.queries[0]!.id, question: p.queries[0]!.text, targetId: 'gemini', platform: 'Gemini', preferredChannel: 'api', status: 'failed', attempts: [] },
 ];
 run.samples = [sample('seen', { question: p.queries[0]!.text, answer: 'AgileX 是一个可核对的平台。' })];
 const md = reportMarkdown(run);
 assert.match(md, /没有完整填写目标受众和业务目标/);
 assert.doesNotMatch(md, /没有进入大学实验室与科研教育团队的候选答案/);
});
test('business exports preserve queue recovery, action state and legacy evidence entry points', () => {
 const target = { id: 'fixture', platform: 'Fixture', preferredChannel: 'api' as const, provider: 'openrouter', model: 'deepseek/test' };
 const run = createRun(project, 'live', project.goal, undefined, [target]);
 run.queries = structuredClone(project.queries);
 run.samples = [sample('retained', { answer: 'AgileX COMPATIBILITY_EVIDENCE' })];
 run.measurementUnits = [{ id: 'q1--fixture', queryId: 'q1', question: project.queries[0]!.text, targetId: target.id, platform: target.platform, preferredChannel: 'api', status: 'completed', selectedSampleId: 'retained', attempts: [] }];
 initializeSamplingQueue(run, true);
 run.samplingQueue!.jobs[0]!.state = 'succeeded';
 run.samplingQueue!.jobs[0]!.sampleId = 'retained';
 run.actionStates = { 'retained-action': 'skipped' };
 const exported = JSON.parse(JSON.stringify(exportRun(run)));
 assert.deepEqual(exported.samplingQueue, run.samplingQueue);
 assert.deepEqual(exported.measurementUnits, run.measurementUnits);
 assert.deepEqual(exported.actionStates, run.actionStates);
 assert.equal(exported.apiReceipts.version, 'api-receipt/v1');
 assert.ok(exported.diagnosis.version);
 assert.equal(exported.business.version, 'opengeo-business/v1');
 assert.equal(evidenceMarkdown(run), reportEvidenceMarkdown(run));
 assert.match(reportHtml(run, {}, true), /COMPATIBILITY_EVIDENCE/);
 assert.doesNotMatch(reportHtml(run, { model: 'absent' }, true), /COMPATIBILITY_EVIDENCE/);
});

test('analytics rows expose exact cohorts for citation denominators and day-specific evidence', () => {
 const run=createRun(project,'replay');run.status='completed';
 run.samples=[sample('reused',{origin:'api',intent:'natural',answer:'AgileX API source.'}),sample('reused',{origin:'browser',intent:'natural',citations:[],answer:'AgileX browser answer.'}),sample('comparison',{origin:'api',intent:'candidate_comparison',citations:[],answer:'AgileX supplied comparison.'})];
 const a=analyzeRun(run);assert.equal(a.quality.valid,3);assert.equal(a.metrics.cohorts.length,3);
 for(const cohort of a.metrics.cohorts){const rows=a.rows.filter(row=>row.status==='valid'&&row.cohortKey===cohort.key);assert.equal(rows.length,1);assert.equal(rows[0]!.channel,cohort.origin==='browser'?'web':cohort.origin);assert.equal(rows[0]!.providerCitations,cohort.origin==='api'&&cohort.intent==='natural'?1:0);}
});
