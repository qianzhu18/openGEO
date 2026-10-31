import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRun, executeRun } from '../src/citekeel/engine.js';
import { reportMarkdown } from '../src/citekeel/report.js';
import { strategyPrompt } from '../src/citekeel/skills.js';
import { Store } from '../src/citekeel/storage.js';
import type { Project } from '../src/citekeel/types.js';

export function internationalFixture(): Project {
  const now=new Date().toISOString();
  return {id:'project-international-test',name:'Northstar',brand:'Northstar',aliases:[],domain:'example.com',industry:'',description:'Product analytics',origin:'manual',market:'international',language:'en',country:'US',goal:'Measure a source-backed baseline.',sources:[{id:'s1',title:'Homepage',url:'https://example.com',text:'Product analytics for software teams.'}],claims:[{id:'c1',label:'Website description',value:'Product analytics for software teams.',status:'unconfirmed',sourceIds:['s1']}],queries:[{id:'prompt-stable',text:'Which product analytics tools should small teams evaluate?',intent:'commercial',branded:false,origin:'Website-derived template',status:'active'}],queryVersion:1,samples:[{id:'answer-1',queryId:'prompt-stable',question:'Which product analytics tools should small teams evaluate?',intent:'commercial',branded:false,origin:'manual',model:'fixture/provider-a',observedAt:now,runGroup:'fixture-measurement-1',protocolId:'manual/v1',collectionStatus:'completed',analysisStatus:'completed',answer:'Consider Northstar, then verify product fit against your requirements.',citations:[]}],createdAt:now,updatedAt:now};
}
test('international diagnosis works before publishing approval and produces an English evidence-linked report',async()=>{
  const root=await mkdtemp(join(tmpdir(),'opengeo-intl-'));
  try {
    const project=internationalFixture(),run=await executeRun(createRun(project,'replay'),new Store(root));
    assert.equal(run.status,'completed');assert.equal(run.draft?.status,'blocked');assert.equal(run.audit?.mention.value,1);
    assert.ok(run.actions.some(a=>a.claimIds.includes('c1')));assert.ok(run.actions.every(a=>!/[\u3400-\u9fff]/.test(a.title)));
    assert.ok(strategyPrompt(run).includes('Respond in English'));
    const report=reportMarkdown(run);assert.ok(report.includes('AI visibility diagnostic'));assert.ok(report.includes('answer-1'));assert.ok(report.includes('API region is not verified'));
    assert.ok(run.limitations.some(l=>l.includes('regional routing')));assert.equal(run.calls.length,0);
  } finally {await rm(root,{recursive:true,force:true});}
});
