import {test,expect} from '@playwright/test';
import {syntheticProject} from '../../src/citekeel/cases.js';
import {createRun} from '../../src/citekeel/engine.js';
import {initializeSamplingQueue} from '../../src/citekeel/sampling-queue.js';

test('both workspaces show durable task states and require confirmation before uncertain redrive',async({page,request})=>{
 const projects=await(await request.get('/api/projects')).json();
 const summary=projects.find((p:any)=>!p.example);
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
  await page.getByText(title,{exact:true}).click();await expect(page.locator('.queue-job')).toContainText('请求超时，费用未知');
  page.once('dialog',dialog=>dialog.dismiss());await page.locator('[data-queue-action="redrive"]').click();expect(mutations).toBe(0);
  page.once('dialog',dialog=>dialog.accept());await page.locator('[data-queue-action="redrive"]').click();await expect.poll(()=>mutations).toBe(1);mutations=0;
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 }
});
