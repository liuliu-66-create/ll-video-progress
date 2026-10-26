import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

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
  console.log('Passed: occupied port fallback, same-version reuse, stale-version avoidance, existing service preserved.');
} finally {
  for(const child of children)if(child.exitCode===null){const stopped=once(child,'exit');child.kill();await stopped;}
  for(const server of blockers)await new Promise(done=>server.close(done));
}
