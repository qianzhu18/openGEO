import test from 'node:test';
import assert from 'node:assert/strict';
import { createRun } from '../src/citekeel/engine.js';
import { analyzeRun } from '../src/citekeel/analytics.js';
import { reportMarkdown, reportHtml } from '../src/citekeel/report.js';
import type { Project, Sample } from '../src/citekeel/types.js';
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
 const md=reportMarkdown(run,{model:'deepseek/test'});assert.match(md,/1\/1/);assert.ok(!md.includes('SHOULD NOT APPEAR'));assert.ok(!md.includes('### other'));const html=reportHtml(run);assert.ok(!html.includes('<script>'));assert.ok(!html.includes('href="javascript:'));assert.ok(!html.includes('<img'));assert.match(html,/&lt;script&gt;/);
});
