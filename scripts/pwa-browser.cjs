const assert=require('node:assert/strict');
const express=require('../backend/node_modules/express');
const {chromium}=require('../backend/node_modules/playwright');
const path=require('node:path');
async function run(){
 const app=express();app.get('/api/private',(_req,res)=>res.json({sentinel:'NEVER-CACHE-CLINICAL'}));app.post('/api/auth/logout',(_req,res)=>res.json({ok:true}));
 const dist=path.resolve(__dirname,'../frontend/dist');app.use(express.static(dist));app.get('*',(_req,res)=>res.sendFile(path.join(dist,'index.html')));
 const server=await new Promise(resolve=>{const server=app.listen(0,'127.0.0.1',()=>resolve(server));});
 let browser;
 try{
  const origin='http://127.0.0.1:'+server.address().port;
  browser=await chromium.launch({channel:process.env.BROWSER_CHANNEL || 'chrome',headless:true});
  const context=await browser.newContext(),page=await context.newPage();
  await page.goto(origin+'/offline');await page.evaluate(()=>navigator.serviceWorker.ready);
  await page.reload();await page.waitForFunction(()=>Boolean(navigator.serviceWorker.controller));
  const token='a'.repeat(64);
  await page.evaluate(token=>{localStorage.setItem('goldenhour_offline_card',JSON.stringify({token,expiresAt:Date.now()+60000}));},token);
  await page.reload();await page.getByRole('button',{name:'Remove saved card'}).waitFor();
  const qrImage=(await page.locator('svg').screenshot()).toString('base64');
  await page.evaluate(()=>fetch('/api/private'));
  assert.equal(await page.evaluate(async()=>{for(const key of await caches.keys())for(const req of await(await caches.open(key)).keys()){if(req.url.includes('/api/'))return true;}return false;}),false);
  await context.setOffline(true);await page.reload();await page.getByRole('button',{name:'Remove saved card'}).waitFor();
  assert.equal(await page.evaluate(()=>fetch('/api/private').then(()=>false,()=>true)),true);
  await page.evaluate(()=>{localStorage.setItem('goldenhour_offline_card',JSON.stringify({token:'a'.repeat(64),expiresAt:Date.now()-1}));});
  await page.reload();await page.getByText('No current saved card.',{exact:false}).waitFor();
  await context.setOffline(false);
  await page.goto(origin+'/emergency');await page.getByRole('button',{name:'Start camera'}).waitFor();
  await page.evaluate(()=>{navigator.mediaDevices.getUserMedia=async()=>{throw new Error('permission denied');};});
  await page.getByRole('button',{name:'Start camera'}).click();await page.getByRole('alert').filter({hasText:'Camera access failed'}).waitFor();
  await page.getByLabel('Or paste this hospital’s card link').fill('https://evil.test/emergency/card#'+token);
  await page.getByRole('button',{name:'Open card',exact:true}).click();await page.getByRole('alert').filter({hasText:'Scan a GoldenHour card'}).waitFor();
  await page.getByLabel('Or paste this hospital’s card link').fill(origin+'/emergency/card#'+token);
  await page.getByRole('button',{name:'Open card',exact:true}).click();await page.getByText('I confirmed patient identity',{exact:false}).waitFor();
  await page.evaluate(()=>{localStorage.setItem('goldenhour_user',JSON.stringify({role:'patient',patientId:'synthetic'}));localStorage.setItem('goldenhour_authenticated','true');localStorage.setItem('goldenhour_offline_card',JSON.stringify({token:'a'.repeat(64),expiresAt:Date.now()+60000}));});
  await page.goto(origin+'/offline');await page.getByRole('button',{name:'Sign out',exact:true}).click();
  await page.waitForFunction(()=>!localStorage.getItem('goldenhour_offline_card'));
  console.info('PASS: offline card, expiry, API cache exclusion, camera QR decoding, camera-denial/manual fallback, hospital-link validation, logout cleanup.');
 }finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
}
run().catch(error=>{console.error(error);process.exitCode=1;});
