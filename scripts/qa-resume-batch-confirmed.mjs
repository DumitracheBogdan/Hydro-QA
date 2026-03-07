import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const BASE='https://hydrocert-dev-webapp-fzgveghygfc3enbt.ukwest-01.azurewebsites.net';
const EMAIL = process.env.HYDROCERT_QA_EMAIL || '';
const PASS = process.env.HYDROCERT_QA_PASSWORD || '';
const run='resume-batch-'+new Date().toISOString().replace(/[.:]/g,'-');
const root=path.join('qa-artifacts','evidence',run);
const dir=path.join(root,'screenshots');
fs.mkdirSync(dir,{recursive:true});

const browser=await chromium.launch({headless:true});
const ctx=await browser.newContext({viewport:{width:1536,height:864}});
const page=await ctx.newPage();
const bugs=[];

const settled=async(ms=700)=>{await page.waitForLoadState('domcontentloaded').catch(()=>{});await page.waitForLoadState('networkidle',{timeout:12000}).catch(()=>{});await page.waitForTimeout(ms);} ;

async function login(){
  await page.goto(`${BASE}/dashboard`); await settled(900);
  if(page.url().includes('/login')){
    await page.fill('input[name="email"]',EMAIL);
    await page.fill('input[name="password"]',PASS);
    await page.getByRole('button',{name:/sign in/i}).first().click();
    await page.waitForURL(u=>!u.toString().includes('/login'),{timeout:20000}).catch(()=>{});
    await settled(1200);
  }
}

async function clearMarks(){
  await page.evaluate(()=>{
    document.querySelectorAll('[data-qa-highlight="1"]').forEach(el=>{
      el.style.outline='';
      el.style.outlineOffset='';
      el.removeAttribute('data-qa-highlight');
    });
    document.querySelectorAll('.qa-badge-mark').forEach(el=>el.remove());
  }).catch(()=>{});
}

async function mark(locator,num){
  const h=await locator.elementHandle().catch(()=>null);
  if(!h) return false;
  await h.evaluate((el,n)=>{
    const rect=el.getBoundingClientRect();
    el.setAttribute('data-qa-highlight','1');
    el.style.outline='4px solid #ef4444';
    el.style.outlineOffset='2px';
    const d=document.createElement('div');
    d.className='qa-badge-mark';
    d.textContent=String(n);
    d.style.position='fixed';
    d.style.left=`${Math.max(8,rect.left-14)}px`;
    d.style.top=`${Math.max(8,rect.top-20)}px`;
    d.style.width='28px'; d.style.height='28px';
    d.style.borderRadius='999px';
    d.style.background='#ef4444';
    d.style.color='white';
    d.style.font='700 18px/28px Segoe UI,sans-serif';
    d.style.textAlign='center';
    d.style.zIndex='2147483647';
    d.style.boxShadow='0 2px 8px rgba(0,0,0,.25)';
    document.body.appendChild(d);
  },num).catch(()=>{});
  return true;
}

async function shot(name){
  const p=path.join(dir,name);
  await page.screenshot({path:p,fullPage:true});
  await clearMarks();
  return p.replace(/\\/g,'/');
}

function addBug({id,title,severity='HIGH',description,expected,actual,steps,evidence,sample=[]}){
  bugs.push({id,title,severity,description,expected,actual,steps,evidence,sample});
  console.log('BUG',id,title);
}

function rowTexts(sel='table tbody tr',limit=60){
  return (async()=>{
    const loc=page.locator(sel);
    const c=Math.min(await loc.count().catch(()=>0),limit);
    const arr=[];
    for(let i=0;i<c;i++){
      const t=((await loc.nth(i).innerText().catch(()=>''))||'').replace(/\s+/g,' ').trim();
      if(t) arr.push(t);
    }
    return arr;
  })();
}

await login();

// N11 Customers Contract Manager filter leaks non-matching rows
await page.goto(`${BASE}/customers`); await settled(1000);
let cmApplied=false;
try{
  const cmBtn=page.locator('main button').filter({hasText:/Contract Manager/i}).first();
  await cmBtn.click({timeout:4000});
  await page.waitForTimeout(250);
  await page.locator('[role="option"],div,li').filter({hasText:/Joe Woolf/i}).first().click({timeout:4000});
  await settled(900);
  cmApplied=true;
}catch{}
if(cmApplied){
  const rows=await rowTexts();
  const leak=rows.find(t=>!t.includes('Joe Woolf'));
  if(leak){
    const cmBtn=page.locator('main button').filter({hasText:/Joe Woolf|Contract Manager/i}).first();
    const leakRow=page.locator('table tbody tr').filter({hasText:leak.slice(0,30)}).first();
    await mark(cmBtn,1); await mark(leakRow,2);
    addBug({
      id:'NBUG-011',
      title:'Customers Contract Manager filter leaks rows not matching selected manager',
      severity:'HIGH',
      description:'After selecting Contract Manager = Joe Woolf, table still contains rows where Contract Manager is blank or different.',
      expected:'All remaining rows should match Joe Woolf.',
      actual:'At least one visible row does not contain Joe Woolf after filter is applied.',
      steps:['Open Customers.','Select Contract Manager = Joe Woolf.','Inspect remaining rows.'],
      evidence:[await shot('nbug-011-customers-contract-manager-leak.png')],
      sample:[leak]
    });
  }
}

// N12 Team Management link points to current page (self-link)
{
  const cur=new URL(page.url()).pathname;
  const team=page.locator('a').filter({hasText:/^Team Management$/i}).first();
  const href=await team.getAttribute('href').catch(()=>null);
  if(href===cur){
    await mark(team,1);
    addBug({
      id:'NBUG-012',
      title:'Team Management sidebar link is a self-link instead of target page',
      severity:'HIGH',
      description:'Team Management anchor href equals current path, so clicking keeps user on same page.',
      expected:'Team Management should navigate to its dedicated route.',
      actual:`Team Management href="${href}" equals current route "${cur}".`,
      steps:['Open any logged-in page (e.g., Customers).','Inspect Team Management link in sidebar.','Click Team Management.'],
      evidence:[await shot('nbug-012-team-management-self-link.png')],
      sample:[`current=${cur}`,`href=${href}`]
    });
  }
}

// N13 Settings link points to current page (self-link)
{
  const cur=new URL(page.url()).pathname;
  const settings=page.locator('a').filter({hasText:/^Settings$/i}).first();
  const href=await settings.getAttribute('href').catch(()=>null);
  if(href===cur){
    await mark(settings,1);
    addBug({
      id:'NBUG-013',
      title:'Settings sidebar link is a self-link instead of target page',
      severity:'HIGH',
      description:'Settings anchor href equals current path, so navigation does not change page.',
      expected:'Settings should navigate to settings screen.',
      actual:`Settings href="${href}" equals current route "${cur}".`,
      steps:['Open any logged-in page (e.g., Customers).','Inspect Settings link in sidebar.','Click Settings.'],
      evidence:[await shot('nbug-013-settings-self-link.png')],
      sample:[`current=${cur}`,`href=${href}`]
    });
  }
}

// N14 Visits next-day arrow does not change date label
await page.goto(`${BASE}/visits`); await settled(1200);
{
  const dateLabel=page.locator('main').getByText(/Today,|Yesterday,|[A-Za-z]+,\s*[A-Za-z]+\s+\d+/).first();
  const before=((await dateLabel.textContent().catch(()=>''))||'').trim();
  const iconBtns=page.locator('main button').filter({has: page.locator('svg')});
  const n=await iconBtns.count().catch(()=>0);
  if(n>=3){
    await iconBtns.nth(2).click().catch(()=>{});
    await settled(800);
    const after=((await dateLabel.textContent().catch(()=>''))||'').trim();
    if(before===after){
      await mark(dateLabel,1);
      await mark(iconBtns.nth(2),2);
      addBug({
        id:'NBUG-014',
        title:'Visits day navigation arrow click does not update date label',
        severity:'MEDIUM',
        description:'Clicking next-day arrow leaves header label unchanged.',
        expected:'Date label should move to next day.',
        actual:`Label remained "${before}" after arrow click.`,
        steps:['Open Visits (Day view).','Click right arrow near date label.','Observe header date text.'],
        evidence:[await shot('nbug-014-visits-arrow-no-date-change.png')],
        sample:[`before=${before}`,`after=${after}`]
      });
    }
  }
}

// N15 Add Visit quick select person does not bind to Person combobox
await page.goto(`${BASE}/visits/addnewvisit`); await settled(1200);
{
  const personCombo=page.locator('main').getByRole('combobox').first();
  const personChip=page.locator('main').getByText(/Robert Amatiesei|Emily Addison|Kayley Baxter/).first();
  if(await personCombo.isVisible().catch(()=>false) && await personChip.isVisible().catch(()=>false)){
    await personChip.click().catch(()=>{});
    await settled(300);
    const txt=((await personCombo.textContent().catch(()=>''))||'').replace(/\s+/g,' ').trim();
    if(/select/i.test(txt)){
      await mark(personChip,1); await mark(personCombo,2);
      addBug({
        id:'NBUG-015',
        title:'Add Visit Booking Person quick-select chip does not populate Person field',
        severity:'HIGH',
        description:'Clicking quick-select chip leaves Person dropdown value as "Select".',
        expected:'Quick-select should set Person value immediately.',
        actual:`Person combobox remains "${txt}" after chip click.`,
        steps:['Open Add New Visit.','Click Booking Person quick-select chip.','Check Person dropdown value.'],
        evidence:[await shot('nbug-015-addvisit-quick-person-not-bound.png')],
        sample:[`combo=${txt}`]
      });
    }
  }
}

// N16 Add Visit engineer quick-select chip does not bind to Engineers combobox
{
  const combos=page.locator('main').getByRole('combobox');
  const engCombo=combos.nth(1);
  const chips=page.locator('main').getByText(/Robert Amatiesei|Emily Addison|Kayley Baxter/);
  const engChip=chips.nth(1);
  if(await engCombo.isVisible().catch(()=>false) && await engChip.isVisible().catch(()=>false)){
    await engChip.click().catch(()=>{});
    await settled(300);
    const txt=((await engCombo.textContent().catch(()=>''))||'').replace(/\s+/g,' ').trim();
    if(/select/i.test(txt)){
      await mark(engChip,1); await mark(engCombo,2);
      addBug({
        id:'NBUG-016',
        title:'Add Visit Engineers quick-select chip does not populate Engineers field',
        severity:'HIGH',
        description:'Clicking engineer quick-select chip does not set Engineers combobox.',
        expected:'Selected engineer should appear in Engineers field.',
        actual:`Engineers combobox remains "${txt}" after chip click.`,
        steps:['Open Add New Visit.','Click Engineer quick-select chip.','Check Engineers dropdown value.'],
        evidence:[await shot('nbug-016-addvisit-quick-engineer-not-bound.png')],
        sample:[`combo=${txt}`]
      });
    }
  }
}

// N17 Planner Status=Cancelled leaks non-cancelled rows
await page.goto(`${BASE}/planner`); await settled(1200);
await page.locator('main button').filter({hasText:/^Events View$/}).first().click().catch(()=>{}); await settled(900);
{
  let applied=false;
  const statusBtn=page.locator('main button').filter({hasText:/^Status$/}).first();
  if(await statusBtn.isVisible().catch(()=>false)){
    await statusBtn.click().catch(()=>{}); await page.waitForTimeout(250);
    const opt=page.locator('[role="option"]').filter({hasText:/Cancelled/i}).first();
    if(await opt.isVisible().catch(()=>false)){await opt.click().catch(()=>{}); applied=true;}
    await settled(900);
  }
  if(applied){
    const rows=await rowTexts('div.border.rounded-xl table tbody tr',80);
    const leak=rows.find(t=>!/cancelled/i.test(t));
    if(leak){
      await mark(statusBtn,1);
      const leakRow=page.locator('div.border.rounded-xl table tbody tr').filter({hasText:leak.slice(0,30)}).first();
      await mark(leakRow,2);
      addBug({
        id:'NBUG-017',
        title:'Planner Status filter (Cancelled) keeps non-cancelled events visible',
        severity:'HIGH',
        description:'After selecting Status=Cancelled, rows with scheduled/confirmed status are still listed.',
        expected:'Only cancelled events should remain.',
        actual:'At least one non-cancelled row remains visible.',
        steps:['Open Planner -> Events View.','Set Status=Cancelled.','Inspect table rows.'],
        evidence:[await shot('nbug-017-planner-status-cancelled-leak.png')],
        sample:[leak]
      });
    }
  }
}

// N18 Planner Booked By filter leaks rows with different booking person
{
  let applied=false;
  const bookedBtn=page.locator('main button').filter({hasText:/^Booked By$/}).first();
  if(await bookedBtn.isVisible().catch(()=>false)){
    await bookedBtn.click().catch(()=>{}); await page.waitForTimeout(250);
    const opt=page.locator('[role="option"]').filter({hasText:/Yasmin Davidson/i}).first();
    if(await opt.isVisible().catch(()=>false)){await opt.click().catch(()=>{}); applied=true;}
    await settled(900);
  }
  if(applied){
    const rows=await rowTexts('div.border.rounded-xl table tbody tr',80);
    const leak=rows.find(t=>!/Yasmin Davidson/i.test(t));
    if(leak){
      await mark(bookedBtn,1);
      const leakRow=page.locator('div.border.rounded-xl table tbody tr').filter({hasText:leak.slice(0,30)}).first();
      await mark(leakRow,2);
      addBug({
        id:'NBUG-018',
        title:'Planner Booked By filter does not constrain rows to selected person',
        severity:'HIGH',
        description:'Booked By=Yasmin Davidson still shows events booked by other people.',
        expected:'Only Yasmin Davidson events should be visible.',
        actual:'Rows for other booking persons remain.',
        steps:['Open Planner -> Events View.','Set Booked By=Yasmin Davidson.','Inspect rows.'],
        evidence:[await shot('nbug-018-planner-bookedby-leak.png')],
        sample:[leak]
      });
    }
  }
}

// N19 Planner Clear does not reset filter button labels
{
  const clearBtn=page.locator('main button').filter({hasText:/^Clear$/}).first();
  if(await clearBtn.isVisible().catch(()=>false)){
    await clearBtn.click().catch(()=>{}); await settled(900);
    const statusTxt=((await page.locator('main button').filter({hasText:/Status|Cancelled|Confirmed|Scheduled/i}).first().innerText().catch(()=>''))||'').replace(/\s+/g,' ').trim();
    const bookedTxt=((await page.locator('main button').filter({hasText:/Booked By|Yasmin|Alexandra|Michelle|Dave/i}).first().innerText().catch(()=>''))||'').replace(/\s+/g,' ').trim();
    const ok=/^Status$/i.test(statusTxt) && /^Booked By$/i.test(bookedTxt);
    if(!ok){
      const statusBtn=page.locator('main button').filter({hasText:/Status|Cancelled|Confirmed|Scheduled/i}).first();
      const bookedBtn=page.locator('main button').filter({hasText:/Booked By|Yasmin|Alexandra|Michelle|Dave/i}).first();
      await mark(statusBtn,1); await mark(bookedBtn,2); await mark(clearBtn,3);
      addBug({
        id:'NBUG-019',
        title:'Planner Clear button does not reset filter labels to default state',
        severity:'MEDIUM',
        description:'After Clear, one or more filter buttons still show previously selected values.',
        expected:'Buttons should reset to placeholders (Status, Booked By, etc).',
        actual:`After Clear labels are status="${statusTxt}" bookedBy="${bookedTxt}".`,
        steps:['Open Planner -> Events View.','Apply filters (Status/Booked By).','Click Clear.','Check filter labels.'],
        evidence:[await shot('nbug-019-planner-clear-not-reset.png')],
        sample:[`status=${statusTxt}`,`booked=${bookedTxt}`]
      });
    }
  }
}

// N20 Attachments Upload button click does not open file chooser
await page.goto(`${BASE}/visits-list`); await settled(900);
{
  const first=page.locator('table tbody tr').first();
  if(await first.isVisible().catch(()=>false)){
    await first.click().catch(()=>{}); await settled(900);
    await page.getByText(/^Attachments$/i).first().click().catch(()=>{}); await settled(500);
    const upload=page.getByRole('button',{name:/^Upload$/i}).first();
    if(await upload.isVisible().catch(()=>false)){
      const p=page.waitForEvent('filechooser',{timeout:3500}).catch(()=>null);
      await upload.click().catch(()=>{});
      const chooser=await p;
      if(!chooser){
        await mark(upload,1);
        addBug({
          id:'NBUG-020',
          title:'Visit Attachments Upload action does not open file picker',
          severity:'HIGH',
          description:'Upload button is visible/clickable but no file chooser event is triggered.',
          expected:'Clicking Upload should open OS file picker.',
          actual:'No file chooser opens after click.',
          steps:['Open Visits List.','Open a visit details page.','Go to Attachments tab.','Click Upload.'],
          evidence:[await shot('nbug-020-attachments-upload-no-filechooser.png')],
          sample:[]
        });
      }
    }
  }
}

// N21 Planner month '+' no visible action
await page.goto(`${BASE}/planner`); await settled(1200);
{
  const plus=page.locator('main button').filter({hasText:/^\+$/}).first();
  if(await plus.isVisible().catch(()=>false)){
    const beforeUrl=page.url();
    await plus.click().catch(()=>{}); await settled(700);
    const popupVisible=await page.locator('text=/Events Planned|No visits scheduled/i').first().isVisible().catch(()=>false);
    const afterUrl=page.url();
    if(!popupVisible && beforeUrl===afterUrl){
      await mark(plus,1);
      addBug({
        id:'NBUG-021',
        title:'Planner month "+" action gives no observable outcome',
        severity:'MEDIUM',
        description:'Clicking month-cell plus button does not open popup/dialog or navigate.',
        expected:'Action should open quick-create popup or events dialog.',
        actual:'No popup and no route change after click.',
        steps:['Open Planner (Month View).','Click a visible "+" button.','Observe result.'],
        evidence:[await shot('nbug-021-planner-plus-no-outcome.png')],
        sample:[`before=${beforeUrl}`,`after=${afterUrl}`]
      });
    }
  }
}

// N22 Planner eye buttons inconsistent (some do not navigate)
await page.goto(`${BASE}/planner`); await settled(1200);
await page.locator('main button').filter({hasText:/^Events View$/}).first().click().catch(()=>{}); await settled(900);
{
  const baseEyes=await page.locator('button:has(svg[data-lucide="eye"])').count().catch(()=>0);
  let success=0; const failIdx=[];
  for(let i=0;i<Math.min(baseEyes,12);i++){
    await page.goto(`${BASE}/planner`); await settled(900);
    await page.locator('main button').filter({hasText:/^Events View$/}).first().click().catch(()=>{}); await settled(700);
    const e=page.locator('button:has(svg[data-lucide="eye"])').nth(i);
    if(!(await e.isVisible().catch(()=>false))) continue;
    await e.click().catch(()=>{}); await settled(700);
    const moved=/\/visits\/edit\//i.test(page.url());
    if(moved) success++; else failIdx.push(i);
  }
  if(success>0 && failIdx.length>0){
    await page.goto(`${BASE}/planner`); await settled(900);
    await page.locator('main button').filter({hasText:/^Events View$/}).first().click().catch(()=>{}); await settled(700);
    const e=page.locator('button:has(svg[data-lucide="eye"])').nth(failIdx[0]);
    await mark(e,1);
    addBug({
      id:'NBUG-022',
      title:'Planner eye action is inconsistent across rows (some icons do not open edit)',
      severity:'HIGH',
      description:'In same table, some eye icons navigate to edit page while others do nothing.',
      expected:'Every visible eye icon should open corresponding visit edit page.',
      actual:`Successful opens=${success}, failed indexes=${failIdx.join(',')}.`,
      steps:['Open Planner -> Events View.','Click multiple eye icons row by row.','Compare navigation behavior.'],
      evidence:[await shot('nbug-022-planner-eye-inconsistent.png')],
      sample:[`success=${success}`,`fail=${failIdx.join(',')}`]
    });
  }
}

// N23 Dashboard Status filter leaks non-matching statuses
await page.goto(`${BASE}/dashboard`); await settled(1000);
{
  const statusBtn=page.locator('main button').filter({hasText:/^Status$/}).first();
  let applied=false;
  if(await statusBtn.isVisible().catch(()=>false)){
    await statusBtn.click().catch(()=>{}); await page.waitForTimeout(250);
    const opt=page.locator('[role="option"]').filter({hasText:/In Progress/i}).first();
    if(await opt.isVisible().catch(()=>false)){await opt.click().catch(()=>{}); applied=true;}
    await settled(800);
  }
  if(applied){
    const statusCells=page.locator('table tbody tr td:last-child');
    const c=Math.min(await statusCells.count().catch(()=>0),20);
    const vals=[];
    for(let i=0;i<c;i++) vals.push(((await statusCells.nth(i).innerText().catch(()=>''))||'').replace(/\s+/g,' ').trim());
    const leak=vals.find(v=>v && !/in progress/i.test(v));
    if(leak){
      await mark(statusBtn,1);
      const leakCell=page.locator('table tbody tr td:last-child').filter({hasText:leak}).first();
      await mark(leakCell,2);
      addBug({
        id:'NBUG-023',
        title:'Dashboard Status filter (In Progress) still shows rows with other statuses',
        severity:'HIGH',
        description:'After selecting In Progress, table still displays rows labeled Not Started/Completed/Needs Attention.',
        expected:'Only In Progress rows should remain.',
        actual:`Detected non-matching status "${leak}" in filtered result set.`,
        steps:['Open Dashboard.','Set Status=In Progress.','Inspect Status column values.'],
        evidence:[await shot('nbug-023-dashboard-status-leak.png')],
        sample:vals
      });
    }
  }
}

// N24 Dashboard Contract date filter does not constrain dates to selected day
{
  const dateBtn=page.locator('main button').filter({hasText:/Contract date|\d{2}\/\d{2}\/\d{4}/i}).first();
  let selected='';
  if(await dateBtn.isVisible().catch(()=>false)){
    await dateBtn.click().catch(()=>{}); await page.waitForTimeout(250);
    const cells=page.getByRole('gridcell');
    const cc=await cells.count().catch(()=>0);
    if(cc>0){
      await cells.nth(Math.min(10,cc-1)).click().catch(()=>{});
      await settled(900);
      selected=((await dateBtn.innerText().catch(()=>''))||'').replace(/\s+/g,' ').trim();
    }
  }
  if(selected && /\d{2}\/\d{2}\/\d{4}/.test(selected)){
    const target=selected.match(/\d{2}\/\d{2}\/\d{4}/)[0];
    const dateCells=page.locator('table tbody tr td:nth-child(5)');
    const c=Math.min(await dateCells.count().catch(()=>0),20);
    const vals=[]; for(let i=0;i<c;i++) vals.push(((await dateCells.nth(i).innerText().catch(()=>''))||'').trim());
    const leak=vals.find(v=>v && v!==target);
    if(leak){
      await mark(dateBtn,1);
      const leakCell=page.locator('table tbody tr td:nth-child(5)').filter({hasText:leak}).first();
      await mark(leakCell,2);
      addBug({
        id:'NBUG-024',
        title:'Dashboard Contract date filter leaves rows from other dates',
        severity:'MEDIUM',
        description:'Selected contract date is not strictly enforced in table results.',
        expected:`All rows should have Contract Date = ${target}.`,
        actual:`Found row with Contract Date ${leak} while filter shows ${target}.`,
        steps:['Open Dashboard.','Pick a specific Contract date.','Inspect Contract Date column.'],
        evidence:[await shot('nbug-024-dashboard-contractdate-leak.png')],
        sample:vals
      });
    }
  }
}

await browser.close();
fs.writeFileSync(path.join(root,'summary.json'), JSON.stringify({run,count:bugs.length,bugs},null,2));
console.log(JSON.stringify({run,count:bugs.length,ids:bugs.map(b=>b.id)},null,2));
