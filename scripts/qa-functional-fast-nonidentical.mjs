import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const BASE='https://hydrocert-dev-webapp-fzgveghygfc3enbt.ukwest-01.azurewebsites.net';
const EMAIL = process.env.HYDROCERT_QA_EMAIL || '';
const PASS = process.env.HYDROCERT_QA_PASSWORD || '';
const run='functional-fast-nonidentical-'+new Date().toISOString().replace(/[.:]/g,'-');
const dir=path.join('qa-artifacts','evidence',run,'screenshots');
fs.mkdirSync(dir,{recursive:true});

const bugs=[];

const browser=await chromium.launch({headless:true});
const ctx=await browser.newContext({viewport:{width:1536,height:864}});
const page=await ctx.newPage();
const wait=async(ms=550)=>{await page.waitForLoadState('domcontentloaded').catch(()=>{});await page.waitForLoadState('networkidle',{timeout:12000}).catch(()=>{});await page.waitForTimeout(ms);} ;

async function login(){
  await page.goto(`${BASE}/dashboard`); await wait(900);
  if(page.url().includes('/login')){
    await page.fill('input[name="email"]',EMAIL);
    await page.fill('input[name="password"]',PASS);
    await page.click('button:has-text("Sign in")');
    await page.waitForURL(u=>!u.toString().includes('/login'),{timeout:20000}).catch(()=>{});
    await wait(1000);
  }
}
await login();

async function shot(name){
  const p=path.join(dir,name);
  await page.screenshot({path:p,fullPage:true});
  return p.replace(/\\/g,'/');
}

// 1) Customers BookedBy filter returns empty despite visible matching rows
await page.goto(`${BASE}/customers`); await wait(1000);
await page.locator('input').nth(3).click(); await page.waitForTimeout(200);
const beforeRows=page.locator('table tbody tr');
let kayleyBefore=0;
for(let i=0;i<Math.min(await beforeRows.count(),20);i++){
  const t=(await beforeRows.nth(i).innerText()).replace(/\s+/g,' ').trim();
  if(t.includes('Kayley')) kayleyBefore++;
}
await page.locator('div.px-3.py-2.hover\\:bg-zinc-100.cursor-pointer.text-sm',{hasText:'Kayley Baxter'}).first().click().catch(()=>{});
await wait(1000);
const afterRows=page.locator('table tbody tr');
let emptyState=false, totalAfter=0, kayleyAfter=0;
for(let i=0;i<Math.min(await afterRows.count(),20);i++){
  const t=(await afterRows.nth(i).innerText()).replace(/\s+/g,' ').trim();
  if(!t) continue;
  if(/No customers found/i.test(t)) emptyState=true;
  totalAfter++;
  if(t.includes('Kayley')) kayleyAfter++;
}
if(kayleyBefore>0 && emptyState){
  bugs.push({
    id:'NBUG-001',
    title:'Customers Booked By filter returns empty state for Kayley Baxter despite matching records',
    sev:'HIGH',
    detail:'Before filtering there are visible Kayley rows; after selecting Kayley Baxter the table switches to empty state.',
    evidence:[await shot('nbug-001-customers-bookedby-mismatch.png')],
    sample:[`kayleyBefore=${kayleyBefore}`,`totalAfter=${totalAfter}`,`kayleyAfter=${kayleyAfter}`,`emptyState=${emptyState}`]
  });
}

// 2) Customers BookedBy dropdown option click interception (UI blocks selection reliability)
await page.goto(`${BASE}/customers`); await wait(800);
await page.locator('input').nth(3).click(); await page.waitForTimeout(250);
let clickErr='';
try{
  await page.getByText('Kayley',{exact:true}).first().click({timeout:3000});
}catch(e){clickErr=String(e).slice(0,180);
}
if(clickErr){
  bugs.push({
    id:'NBUG-002',
    title:'Customers Booked By dropdown has click interception on overlapping text nodes',
    sev:'MEDIUM',
    detail:'Clicking visible option text can be intercepted by other overlay/dropdown elements, causing timeout.',
    evidence:[await shot('nbug-002-customers-bookedby-click-intercept.png')],
    sample:[clickErr]
  });
}

// 3) Visits List Assigned To filter -> clear filters button non-clickable after selection
await page.goto(`${BASE}/visits-list`); await wait(900);
await page.locator('button',{hasText:'Assigned To'}).click(); await page.waitForTimeout(250);
await page.locator('div[role="button"]',{hasText:'Emily Addison'}).first().click(); await wait(700);
let clearAfterAssigned=true, clearAssignedErr='';
try{ await page.locator('button',{hasText:'Clear Filters'}).click({timeout:3500}); }
catch(e){ clearAfterAssigned=false; clearAssignedErr=String(e).slice(0,180);} 
if(!clearAfterAssigned){
  bugs.push({
    id:'NBUG-003',
    title:'Visits List Clear Filters becomes unclickable after Assigned To selection',
    sev:'HIGH',
    detail:'After selecting Assigned To, Clear Filters click times out due pointer interception.',
    evidence:[await shot('nbug-003-visits-clear-blocked-after-assigned.png')],
    sample:[clearAssignedErr]
  });
}

// 4) Visits List Booked By -> clear filters also blocked
await page.goto(`${BASE}/visits-list`); await wait(900);
await page.locator('button',{hasText:'Booked By'}).click(); await page.waitForTimeout(250);
await page.locator('div[role="button"]',{hasText:'Kayley Baxter'}).first().click().catch(()=>{});
await wait(700);
let clearAfterBooked=true, clearBookedErr='';
try{ await page.locator('button',{hasText:'Clear Filters'}).click({timeout:3500}); }
catch(e){ clearAfterBooked=false; clearBookedErr=String(e).slice(0,180);} 
if(!clearAfterBooked){
  bugs.push({
    id:'NBUG-004',
    title:'Visits List Clear Filters becomes unclickable after Booked By selection',
    sev:'HIGH',
    detail:'Same blocker as Assigned To path, reproduced via Booked By dropdown path.',
    evidence:[await shot('nbug-004-visits-clear-blocked-after-bookedby.png')],
    sample:[clearBookedErr]
  });
}

// 5) Download report no file event
await page.goto(`${BASE}/visits-list`); await wait(900);
await page.locator('table tbody tr').first().click(); await wait(900);
const dl=page.getByRole('button',{name:/download report/i}).first();
let downloadFired=false;
const pdl=page.waitForEvent('download',{timeout:3000}).then(()=>{downloadFired=true;}).catch(()=>{});
await dl.click().catch(()=>{});
await pdl; await wait(300);
if(!downloadFired){
  bugs.push({
    id:'NBUG-005',
    title:'Download Report action does not trigger file download',
    sev:'HIGH',
    detail:'Download button click produced no browser download event.',
    evidence:[await shot('nbug-005-download-no-event.png')],
    sample:[]
  });
}

// 6) Share report no feedback/no clipboard change
const sh=page.getByRole('button',{name:/share report/i}).first();
let clipBefore='', clipAfter='';
try{clipBefore=await page.evaluate(async()=>await navigator.clipboard.readText());}catch{}
await sh.click().catch(()=>{}); await wait(600);
try{clipAfter=await page.evaluate(async()=>await navigator.clipboard.readText());}catch{}
const dialogs=await page.locator('[role="dialog"]').count();
const body=(await page.locator('body').innerText()).toLowerCase();
const hasShareFeedback=/copied|shared|share link|link copied/.test(body);
if(clipBefore===clipAfter && dialogs===0 && !hasShareFeedback){
  bugs.push({
    id:'NBUG-006',
    title:'Share Report action gives no observable result',
    sev:'MEDIUM',
    detail:'No clipboard update, no dialog, no visible share confirmation after click.',
    evidence:[await shot('nbug-006-share-no-feedback.png')],
    sample:[`clipboardBefore=${clipBefore}`,`clipboardAfter=${clipAfter}`]
  });
}

// 7) Planner Assigned To filter mismatch
await page.goto(`${BASE}/planner`); await wait(900);
await page.locator('button',{hasText:'Events View'}).click().catch(()=>{}); await wait(700);
await page.locator('button',{hasText:'Assigned To'}).click(); await page.waitForTimeout(250);
await page.locator('div[role="button"]',{hasText:'Emily Addison'}).first().click(); await wait(1000);
const eventRows=page.locator('div.border.rounded-xl table tbody tr');
const evTexts=[]; for(let i=0;i<Math.min(await eventRows.count(),20);i++) evTexts.push((await eventRows.nth(i).innerText()).replace(/\s+/g,' ').trim());
const mismatchAssigned=evTexts.filter(t=>!t.includes('Emily Addison'));
if(mismatchAssigned.length>0 && evTexts.length>0){
  bugs.push({
    id:'NBUG-007',
    title:'Planner Assigned To filter still shows rows without selected engineer',
    sev:'HIGH',
    detail:`Filtered by Emily Addison but ${mismatchAssigned.length}/${evTexts.length} rows do not contain Emily Addison in row text.`,
    evidence:[await shot('nbug-007-planner-assigned-filter-mismatch.png')],
    sample:mismatchAssigned.slice(0,3)
  });
}

// 8) Visits List row click blocked after Booked By filter
await page.goto(`${BASE}/visits-list`); await wait(900);
await page.locator('button',{hasText:'Booked By'}).click(); await page.waitForTimeout(250);
await page.locator('div[role="button"]',{hasText:'Kayley Baxter'}).first().click().catch(()=>{});
await wait(900);
const firstRow=page.locator('table tbody tr').first();
let rowClickable=true, rowErr='';
try{
  await firstRow.click({timeout:3000});
  await page.waitForURL(/\/visits\//,{timeout:3000});
}catch(e){
  rowClickable=false; rowErr=String(e).slice(0,180);
}
if(!rowClickable){
  bugs.push({
    id:'NBUG-008',
    title:'Visits List row click blocked after Booked By filter selection',
    sev:'HIGH',
    detail:'After selecting Booked By, clicking first row no longer opens visit details.',
    evidence:[await shot('nbug-008-visits-row-click-blocked-after-bookedby.png')],
    sample:[rowErr]
  });
}

// 9) Visits list inverted dates silently yields empty table (missing validation feedback)
await page.goto(`${BASE}/visits-list`); await wait(900);
await page.locator('button',{hasText:'Start Date'}).click(); await page.waitForTimeout(250);
await page.locator('[role="gridcell"]').nth(18).click().catch(()=>{}); await wait(400);
await page.locator('button',{hasText:'End Date'}).click(); await page.waitForTimeout(250);
await page.locator('[role="gridcell"]').nth(8).click().catch(()=>{}); await wait(900);
const rowsAfterDate=await page.locator('table tbody tr').count();
const txt=(await page.locator('body').innerText()).toLowerCase();
const hasDateValidation=/start date|end date|invalid date|date range|must be after/i.test(txt);
if(rowsAfterDate===0 && !hasDateValidation){
  bugs.push({
    id:'NBUG-009',
    title:'Inverted Start/End date range gives silent empty state without validation',
    sev:'MEDIUM',
    detail:'Setting Start Date after End Date empties list without explicit validation message.',
    evidence:[await shot('nbug-009-inverted-date-no-validation.png')],
    sample:[`rowsAfterDate=${rowsAfterDate}`]
  });
}

// 10) Visits List search by existing reference returns zero results
await page.goto(`${BASE}/visits-list`); await wait(900);
const ref=(await page.locator('table tbody tr td').first().innerText()).trim();
const search=page.locator('input[placeholder*="Search visits"]').first();
await search.fill(ref); await page.keyboard.press('Enter'); await wait(900);
const rowsRef=await page.locator('table tbody tr').count();
const partial=ref.slice(0,8);
await search.fill(partial); await page.keyboard.press('Enter'); await wait(900);
const rowsPartial=await page.locator('table tbody tr').count();
if(rowsRef===0 && rowsPartial===0){
  bugs.push({
    id:'NBUG-010',
    title:'Visits List search by exact existing reference returns 0 results',
    sev:'HIGH',
    detail:'Search using a visible existing reference returns no matches for exact and prefix query.',
    evidence:[await shot('nbug-010-search-existing-reference-zero-results.png')],
    sample:[`ref=${ref}`,`rowsRef=${rowsRef}`,`rowsPartial=${rowsPartial}`]
  });
}

const summary={run,bugs};
fs.writeFileSync(path.join('qa-artifacts','evidence',run,'summary.json'),JSON.stringify(summary,null,2));
console.log(JSON.stringify({run,count:bugs.length,ids:bugs.map(b=>b.id)},null,2));

await browser.close();
