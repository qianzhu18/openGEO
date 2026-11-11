import {test,expect} from '@playwright/test';
import {createRun} from '../../src/workbench/engine.js';
import {initializeSamplingQueue} from '../../src/workbench/sampling-queue.js';

test('both workspaces show durable task states and require confirmation before uncertain redrive',async({page,request})=>{
 const projects=await(await request.get('/api/projects')).json();
 const summary=projects.find((p:any)=>p.id==='sensor')||projects[0];
 const project=await(await request.get(`/api/projects/${summary.id}`)).json();
 const run=createRun(project,'live');run.id='queue-browser-fixture';run.status='needs_review';run.steps=[];run.queries=project.queries.slice(0,1);
 run.measurementTargets=[{id:'chatgpt',platform:'ChatGPT',preferredChannel:'api',provider:'cloro',model:'chatgpt'}];
 run.measurementUnits=[{id:`${run.queries[0].id}--chatgpt`,queryId:run.queries[0].id,question:run.queries[0].text,targetId:'chatgpt',platform:'ChatGPT',preferredChannel:'api',status:'failed',attempts:[]}];
 initializeSamplingQueue(run);run.samplingQueue!.jobs[0].state='review_required';run.samplingQueue!.jobs[0].reason='请求超时，费用未知';run.samplingQueue!.jobs[0].attempts=1;
 let mutations=0;
 await page.route(`**/api/runs?projectId=${project.id}`,route=>route.fulfill({json:[{id:run.id,projectId:project.id,status:run.status,createdAt:run.createdAt}]}));
 await page.route('**/api/runs/queue-browser-fixture**',route=>route.request().url().includes('/analytics')?route.fulfill({json:project.analytics}):route.fulfill({json:run}));
 await page.route('**/api/runs/queue-browser-fixture/redrive',route=>{mutations++;return route.fulfill({status:202,json:{id:run.id}});});
 for(const [url,title] of [[`/?project=${project.id}&run=${run.id}`,'逐题任务与恢复'],[`/workspace?project=${project.id}&run=${run.id}`,'Jobs and recovery']]) {
  await page.goto(url);await expect(page.locator('.queue-status')).toBeVisible();
  await page.locator('.queue-status summary').click();await expect(page.locator('.queue-job')).toContainText('请求超时，费用未知');
  page.once('dialog',dialog=>dialog.dismiss());await page.locator('[data-queue-action="redrive"]').click();expect(mutations).toBe(0);
  page.once('dialog',dialog=>dialog.accept());await page.locator('[data-queue-action="redrive"]').click();await expect.poll(()=>mutations).toBe(1);mutations=0;
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 }
});

test('both workspaces show remote phase and query the original task without a paid redrive',async({page,request})=>{
 const projects=await(await request.get('/api/projects')).json();
 const summary=projects.find((p:any)=>p.id==='sensor')||projects[0],project=await(await request.get(`/api/projects/${summary.id}`)).json();
 const run=createRun(project,'live');run.id='remote-browser-fixture';run.status='needs_review';run.steps=[];run.queries=project.queries.slice(0,1);
 run.measurementTargets=[{id:'chatgpt',platform:'ChatGPT',preferredChannel:'api',provider:'cloro',model:'chatgpt'}];
 run.measurementUnits=[{id:`${run.queries[0].id}--chatgpt`,queryId:run.queries[0].id,question:run.queries[0].text,targetId:'chatgpt',platform:'ChatGPT',preferredChannel:'api',status:'failed',attempts:[]}];
 initializeSamplingQueue(run,true);const job=run.samplingQueue!.jobs[0];job.state='review_required';job.phase='poll_wait';
 job.remote={idempotencyKey:'saved-key',taskId:'saved-remote-task',status:'PROCESSING',createdAt:run.createdAt,deadlineAt:new Date(Date.now()+100000).toISOString(),pollCount:3,submissionAttempts:1};
 let queries=0;
 await page.route(`**/api/runs?projectId=${project.id}`,route=>route.fulfill({json:[{id:run.id,projectId:project.id,status:run.status,createdAt:run.createdAt}]}));
 await page.route('**/api/runs/remote-browser-fixture**',route=>route.request().url().includes('/analytics')?route.fulfill({json:project.analytics}):route.fulfill({json:run}));
 await page.route('**/api/runs/remote-browser-fixture/reconcile',route=>{expect(route.request().postDataJSON().jobId).toBe(job.id);queries++;return route.fulfill({status:202,json:{id:run.id}});});
 page.on('dialog',()=>{throw new Error('Querying an existing remote task must not use the paid-redrive dialog');});
 for(const [url,title,phase] of [[`/?project=${project.id}&run=${run.id}`,'逐题任务与恢复','等待查询'],[`/workspace?project=${project.id}&run=${run.id}`,'Jobs and recovery','Waiting to poll']]){
  job.state='review_required';job.remote!.status='PROCESSING';job.remote!.creditsCharged=undefined;job.callId=undefined;run.calls=[];
  await page.goto(url);await page.locator('.queue-status summary').click();
  await expect(page.locator('.queue-job')).not.toContainText(phase);await expect(page.locator('.queue-job')).toContainText('PROCESSING');await expect(page.locator('.queue-job')).toContainText('saved-remote-task');
  await expect(page.locator('[data-queue-action="redrive"]')).toHaveCount(0);
  await page.locator('[data-queue-action="reconcile"]').click();await expect.poll(()=>queries).toBe(1);queries=0;
  job.remote!.status='FAILED';job.remote!.creditsCharged=0;job.callId='failed-call';
  run.calls=[{id:'failed-call',purpose:'measurement',provider:'cloro',model:'chatgpt',status:'failed',startedAt:run.createdAt,promptHash:'fixture',response:{task:{status:'FAILED',latencyMs:322421},response:{error:{code:'INTERNAL_SERVER_ERROR'}}}}];
  await page.reload();await page.locator('.queue-status summary').click();
  await expect(page.locator('.queue-job')).toContainText('FAILED');await expect(page.locator('.queue-job')).toContainText('INTERNAL_SERVER_ERROR');
  await expect(page.locator('.queue-job')).toContainText('322.4s');await expect(page.locator('.queue-job')).toContainText('0 credits');
 }
});
