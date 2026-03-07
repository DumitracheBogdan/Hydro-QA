import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const BASE='https://hydrocert-dev-webapp-fzgveghygfc3enbt.ukwest-01.azurewebsites.net';
const EMAIL = process.env.HYDROCERT_QA_EMAIL || '';
const PASS = process.env.HYDROCERT_QA_PASSWORD || '';
const run='resume-extra-'+new Date().toISOString().replace(/[.:]/g,'-');
const root=path.join('qa-artifacts','evidence',run);
const dir=path.join(root,'screenshots');
fs.mkdirSync(dir,{recursive:true});

const browser=await chromium.launch({headless:true});
const ctx=await browser.newContext({viewport:{width:1536,height:864}});
const page=await ctx.newPage();
const bugs=[];
const wait=async(ms=700)=>{await page.waitForLoadState('domcontentloaded').catch(()=>{});await page.waitForLoadState('networkidle',{timeout:12000}).catch(()=>{});await page.waitForTimeout(ms);} ;

async function login(){
  await page.goto(`${BASE}/dashboard`); await wait(1000);
  if(page.url().includes('/login')){
    await page.fill('input[name="email"]',EMAIL);
    await page.fill('input[name="password"]',PASS);
    await page.getByRole('button',{name:/sign in/i}).first().click();
    await page.waitForURL(u=>!u.toString().includes('/login'),{timeout:20000}).catch(()=>{});
    await wait(1000);
  }
}
async function clearMarks(){
  await page.evaluate(()=>{
    document.querySelectorAll('[data-qa-highlight="1"]').forEach(el=>{el.style.outline='';el.style.outlineOffset='';el.removeAttribute('data-qa-highlight');});
    document.querySelectorAll('.qa-badge-mark').forEach(el=>el.remove());
  }).catch(()=>{});
}
async function mark(locator,num){
  const h=await locator.elementHandle().catch(()=>null); if(!h) return false;
  await h.evaluate((el,n)=>{const r=el.getBoundingClientRect(); el.setAttribute('data-qa-highlight','1'); el.style.outline='4px solid #ef4444'; el.style.outlineOffset='2px'; const d=document.createElement('div'); d.className='qa-badge-mark'; d.textContent=String(n); d.style.position='fixed'; d.style.left=`${Math.max(8,r.left-14)}px`; d.style.top=`${Math.max(8,r.top-20)}px`; d.style.width='28px'; d.style.height='28px'; d.style.borderRadius='999px'; d.style.background='#ef4444'; d.style.color='white'; d.style.font='700 18px/28px Segoe UI,sans-serif'; d.style.textAlign='center'; d.style.zIndex='2147483647'; d.style.boxShadow='0 2px 8px rgba(0,0,0,.25)'; document.body.appendChild(d);},num).catch(()=>{});
  return true;
}
async function shot(name){const p=path.join(dir,name); await page.screenshot({path:p,fullPage:true}); await clearMarks(); return p.replace(/\\/g,'/');}

await login();
await page.goto(`${BASE}/visits/addnewvisit`); await wait(1200);

const personLabel=page.locator('label').filter({hasText:/^Person \*$/}).first();
const personBlock=personLabel.locator('xpath=..');
const personInput=personBlock.locator('input').first();
const personChip=personBlock.locator('button').filter({hasText:/Robert Amatiesei/i}).first();

const engineerLabel=page.locator('label').filter({hasText:/^Engineers \*$/}).first();
const engineerBlock=engineerLabel.locator('xpath=..');
const engineerInput=engineerBlock.locator('input').first();
const engineerChip=engineerBlock.locator('button').filter({hasText:/Robert Amatiesei/i}).first();

if(await personInput.isVisible().catch(()=>false) && await personChip.isVisible().catch(()=>false)){
  const before=((await personInput.inputValue().catch(()=>''))||'').trim();
  await personChip.click().catch(()=>{}); await wait(350);
  const after=((await personInput.inputValue().catch(()=>''))||'').trim();
  if(before===after && after===''){
    await mark(personChip,1); await mark(personInput,2);
    bugs.push({
      id:'NBUG-025', title:'Add Visit Booking Person quick-select does not populate Person input', severity:'HIGH',
      description:'Clicking Booking Person quick-select chip keeps Person field empty.',
      expected:'Person input should be filled with selected employee.', actual:'Person input remains empty after chip click.',
      steps:['Open Add New Visit.','Click Booking Person quick-select chip (e.g., Robert Amatiesei).','Check Person field value.'],
      evidence:[await shot('nbug-025-person-quickselect-not-populate.png')], sample:[`before=${before}`,`after=${after}`]
    });
  }
}

if(await engineerInput.isVisible().catch(()=>false) && await engineerChip.isVisible().catch(()=>false)){
  const before=((await engineerInput.inputValue().catch(()=>''))||'').trim();
  await engineerChip.click().catch(()=>{}); await wait(350);
  const after=((await engineerInput.inputValue().catch(()=>''))||'').trim();
  if(before===after && after===''){
    await mark(engineerChip,1); await mark(engineerInput,2);
    bugs.push({
      id:'NBUG-026', title:'Add Visit Engineer quick-select does not populate Engineers input', severity:'HIGH',
      description:'Clicking Engineer quick-select chip does not set Engineers field.',
      expected:'Engineers input should be filled with selected engineer.', actual:'Engineers input remains empty after chip click.',
      steps:['Open Add New Visit.','Click Engineer quick-select chip (e.g., Robert Amatiesei).','Check Engineers field value.'],
      evidence:[await shot('nbug-026-engineer-quickselect-not-populate.png')], sample:[`before=${before}`,`after=${after}`]
    });
  }
}

await browser.close();
fs.writeFileSync(path.join(root,'summary.json'), JSON.stringify({run,count:bugs.length,bugs},null,2));
console.log(JSON.stringify({run,count:bugs.length,ids:bugs.map(b=>b.id)},null,2));
