import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {readFile} from 'node:fs/promises';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const children=[];
const blockers=[];
const start = port => new Promise((ok,fail)=>{
  const child=spawn(process.execPath,['scripts/playground_server.mjs'],{
    cwd:root,env:{...process.env,LL_VIDEO_PROGRESS_PROJECT:root,LL_VIDEO_PROGRESS_PLAYGROUND_PORT:String(port)},windowsHide:true,
  });
  children.push(child);
  let output='',errors='';
  const timer=setTimeout(()=>{child.kill();fail(new Error('startup timeout: '+errors));},10000);
  child.stderr.on('data',data=>errors+=data);
  child.on('error',error=>{clearTimeout(timer);fail(error);});
  child.stdout.on('data',data=>{
    output+=data;
    try {const ready=JSON.parse(output);clearTimeout(timer);ok({child,ready});} catch {}
  });
  child.on('exit',code=>{if(!output){clearTimeout(timer);fail(new Error('startup failed '+code+': '+errors));}});
});
const blocker=async handler=>{
  const server=createServer(handler);
  blockers.push(server);
  server.listen(0,'127.0.0.1');await once(server,'listening');
  return server.address().port;
};

try {
  // A harmless server occupies the requested port; the launcher must leave it alone.
  const occupied=await blocker((req,res)=>res.end('unrelated app'));
  const first=await start(occupied);
  assert.notEqual(first.ready.port,occupied);
  assert.equal(first.ready.reused,false);
  const health=await (await fetch(`http://127.0.0.1:${first.ready.port}/api/health`)).json();
  assert.equal(health.service,'ll-video-progress');
  const again=await start(first.ready.port);
  assert.equal(again.ready.reused,true);
  assert.equal(again.ready.port,first.ready.port);
  assert.equal(again.ready.version,health.version);
  // Merely claiming the service name is insufficient: a stale version must be skipped.
  const stale=await blocker((req,res)=>{res.setHeader('Content-Type','application/json');res.end(JSON.stringify({service:'ll-video-progress',version:'old'}));});
  const updated=await start(stale);
  assert.notEqual(updated.ready.port,stale);
  assert.equal(updated.ready.version,health.version);
  assert.equal((await fetch(`http://127.0.0.1:${occupied}/`)).status,200);
  const base=`http://127.0.0.1:${first.ready.port}`;
  for (const [styleId,fontSize] of [['soft-white-green',24],['walking-leading',48]]) {
    const response=await fetch(base+'/api/progress-color',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({styleId,fontSize,color:'#acd95d'})});
    const data=await response.json();
    assert.equal(response.status,200,JSON.stringify(data));
    assert.equal(data.fontSize,fontSize);
    const key=data.preview.split('/')[2];
    const out=resolve(root,'outputs/progress-playground-colors',key);
    const plan=JSON.parse(await readFile(resolve(out,'resolved-config.json'),'utf8'));
    const qa=JSON.parse(await readFile(resolve(out,'qa.json'),'utf8'));
    assert.equal(plan.fontSize,fontSize);
    assert.equal(plan.barHeight,64);
    assert.equal(qa.fullDecode,'passed');
    assert.equal(qa.height,styleId==='walking-leading'?96:64);
    assert.equal((await fetch(base+data.download)).status,200);
  }
  for (const fontSize of [17,49,24.5,'24']) {
    const response=await fetch(base+'/api/progress-color',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({styleId:'walking-leading',fontSize,color:'#acd95d'})});
    assert.equal(response.status,400);
  }
  console.log('Passed: occupied port fallback, same-version reuse, stale-version avoidance, existing service preserved.');
  console.log('Passed: both bar styles retain requested font sizes in encoded MOVs; invalid sizes rejected.');
} finally {
  for(const child of children)if(child.exitCode===null){const stopped=once(child,'exit');child.kill();await stopped;}
  for(const server of blockers)await new Promise(done=>server.close(done));
}
