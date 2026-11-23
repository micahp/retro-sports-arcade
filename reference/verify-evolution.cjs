/**
 * Browser audit for the EA visual evolution exhibit. Requires playwright.
 * Runs against the actual repository HTML, serves the source manifest alongside it,
 * and records both source attribution and live remote image load outcomes.
 */
const fs = require('fs');
const path = require('path');
const http = require('http');
const assert = require('assert').strict;
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
const out = path.join(__dirname, 'evidence');
fs.mkdirSync(out, {recursive:true});
const mime={'.html':'text/html; charset=utf-8','.json':'application/json; charset=utf-8','.css':'text/css'};
const server = http.createServer((req,res)=>{
 const p=decodeURIComponent(req.url.split('?')[0]);
 const file=path.resolve(root,'.'+p);
 if(!(file===root||file.startsWith(root+path.sep))){res.writeHead(403);return res.end();}
 fs.readFile(file,(err,buf)=>{if(err){res.writeHead(404);return res.end('404')}res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'text/plain; charset=utf-8'});res.end(buf)});
});
const wait=(ms)=>new Promise(r=>setTimeout(r,ms));
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const port=server.address().port;
 const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 const page=await browser.newPage({viewport:{width:1440,height:900},deviceScaleFactor:1});
 const errors=[];page.on('pageerror',err=>errors.push(err.message));
 await page.goto('http://127.0.0.1:'+port+'/reference/evolution.html',{waitUntil:'domcontentloaded',timeout:30000});
 await page.waitForSelector('.game-card');
 assert.equal(await page.locator('.game-card').count(),33,'all 33 annual games render');
 assert.equal(await page.locator('section.exhibit').count(),3,'three sports');
 assert.equal(await page.locator('#compare-grid .compare-unit').count(),2,'two comparison slots');
 await page.locator('[data-filter-value="nhl"]').first().click();
 assert.equal(await page.locator('.game-card').count(),11,'NHL 11 editions');
 await page.locator('[data-filter-value="nba"]').first().click();
 assert.equal(await page.locator('.game-card').count(),11,'NBA Live 11 editions');
 await page.locator('[data-filter-value="madden"]').first().click();
 assert.equal(await page.locator('.game-card').count(),11,'Madden 11 editions');
 await page.locator('[data-filter-value="all"]').first().click();
 await page.locator('[data-filter-value="16-bit"]').first().click();
 assert((await page.locator('.game-card').count())<33,'era filter works');
 await page.locator('[data-filter-group="era"] [data-filter-value="all"]').click();
 await page.locator('#platform-filter').selectOption('Genesis');
 assert((await page.locator('.game-card').count())>0,'platform filter works');
 await page.locator('#platform-filter').selectOption('all');
 await page.locator('#image-filter').selectOption('missing');
 assert.equal(await page.locator('.game-card').count(),15,'missing-image filter correctly exposes all missing entries');
 await page.locator('#image-filter').selectOption('all');
 await page.locator('#compare-left').selectOption('nba-96');await page.locator('#compare-right').selectOption('nba-2005');
 assert.equal(await page.locator('#compare-grid .compare-unit').count(),2,'comparison selection works');
 await page.locator('#compare-swap').click();
 assert.equal(await page.locator('#compare-left').inputValue(),'nba-2005','comparison swap works');
 // Scroll every image into view so lazy-loaded remote images are requested.
 for (const img of await page.locator('.game-card img').all()){
   await img.scrollIntoViewIfNeeded();await wait(150);
 }
 await wait(6000);
 const capture=await page.evaluate(()=>{
   const manifest=JSON.parse(document.getElementById('manifest').textContent);
   return manifest.games.map(g=>{
     const frame=document.querySelector('#game-'+g.id+' .shot-frame');
     const img=frame?.querySelector('img');
     return {id:g.id,title:g.title,platform:g.screenshots[0]?.platform||g.display_platform,
       source:g.screenshots[0]?.source_page||g.source_gallery,
       image_url:g.screenshots[0]?.image_url||null,
       loaded:!!img&&!!img.naturalWidth&&img.complete,
       blocked:!!img&&(!img.naturalWidth||frame.dataset.load==='failed'),
       has_source:g.screenshots.length>0};
   });
 });
 const report={created:new Date().toISOString(),browser:'Chromium / Playwright',desktop:{width:1440,height:900},
   total_games:capture.length,source_traced:capture.filter(x=>x.has_source).length,
   browser_loaded:capture.filter(x=>x.loaded).length,
   browser_failed_or_blocked:capture.filter(x=>x.has_source&&!x.loaded).length,
   unresolved:capture.filter(x=>!x.has_source).length,page_errors:errors,entries:capture};
 fs.writeFileSync(path.join(out,'browser-report.json'),JSON.stringify(report,null,2)+'\n');
 await page.screenshot({path:path.join(out,'gallery-desktop.png'),fullPage:true});
 await page.locator('#compare').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(out,'comparison-desktop.png')});
 await page.setViewportSize({width:390,height:844});
 await page.locator('#sport-sections').scrollIntoViewIfNeeded();
 await page.screenshot({path:path.join(out,'gallery-mobile.png'),fullPage:true});
 assert.equal(await page.locator('.game-card').count(),33,'mobile retains all 33');
 assert.equal(errors.length,0,'no JavaScript page errors');
 console.log(JSON.stringify({total:report.total_games,source_traced:report.source_traced,browser_loaded:report.browser_loaded,blocked:report.browser_failed_or_blocked,unresolved:report.unresolved,errors},null,2));
 await browser.close();
 // Missing sources are documented research gaps, not automatically a test failure.
 if(report.browser_failed_or_blocked) { console.error('Browser failed to render some traced images. See reference/evidence/browser-report.json');process.exitCode=1; }
})().catch(e=>{console.error(e);process.exitCode=1}).finally(()=>server.close());
