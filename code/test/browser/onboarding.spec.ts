import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { Store } from '../../src/citekeel/storage.js';
import { researchWebsite } from '../../src/citekeel/onboarding.js';
import type { ResearchJob } from '../../src/citekeel/research-service.js';

test('URL-first onboarding restores source research and creates a workspace from selected English prompts',async({page})=>{
  const result=await researchWebsite({url:'https://example.com',country:'GB'}, {fetchPage:async url=>({url,contentType:'text/html',text:'<title>Northstar | Product analytics</title><meta name="description" content="Understand how people use your software."><h1>Product analytics</h1>'})});
  const job:ResearchJob={id:`research-${randomUUID()}`,status:result.status,input:{url:result.submittedUrl,language:'en',country:'GB'},result,createdAt:new Date().toISOString()};
  await page.route('**/api/researches',async route=>{
    if(route.request().method()!=='POST')return route.continue();
    const input=route.request().postDataJSON();expect(input.language).toBe('en');expect(input.country).toBe('GB');
    await new Store('data/browser-tests').save('researches',job);await route.fulfill({status:202,json:job});
  });
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/create-workspace');await page.getByLabel('Website URL',{exact:true}).fill('example.com');
  await page.getByLabel('Target market').selectOption('GB');await page.getByRole('button',{name:'Research my website'}).click();
  await expect(page.getByRole('heading',{name:'Review your first questions'})).toBeVisible();
  await page.reload();await expect(page.getByRole('heading',{name:'Review your first questions'})).toBeVisible();
  const checks=page.locator('[data-prompt]');const total=await checks.count();expect(total).toBeGreaterThan(1);
  for(let i=1;i<total;i++)await checks.nth(i).uncheck();
  await page.setViewportSize({width:320,height:780});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.setViewportSize({width:1440,height:1000});await page.screenshot({path:'artifacts/international-mvp/onboarding-review.png',fullPage:true});
  await page.getByRole('button',{name:'Create workspace with selected prompts'}).click();
  await expect(page.getByRole('heading',{name:'Your workspace is ready'})).toBeVisible();
  await expect(page.getByText('Northstar · 1 active prompts')).toBeVisible();
  await page.reload();await expect(page.getByRole('heading',{name:'Your workspace is ready'})).toBeVisible();
  await page.getByRole('link',{name:'Open workspace',exact:false}).click();await expect(page.getByRole('heading',{name:'Your brand, in AI answers'})).toBeVisible();
  expect(errors).toEqual([]);
});
