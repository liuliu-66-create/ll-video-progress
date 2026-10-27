import {createReadStream, existsSync, readFileSync} from 'node:fs';
import {createServer, get} from 'node:http';
import {createHash} from 'node:crypto';
import {extname, resolve, sep} from 'node:path';
import {stat, mkdir, mkdtemp} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {dirname} from 'node:path';
import {fileURLToPath} from 'node:url';


const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const playgroundRoot = resolve(projectRoot, 'playground');
const preferredPort = Number(process.env.LL_VIDEO_PROGRESS_PLAYGROUND_PORT || 4174);
if (!Number.isInteger(preferredPort) || preferredPort < 1 || preferredPort > 65535) {
  throw new Error('LL_VIDEO_PROGRESS_PLAYGROUND_PORT 应为 1–65535 的整数');
}
let port = preferredPort;
const service = 'll-video-progress';
// Updated code must not silently reuse an older process left running by another Agent.
const signature = createHash('sha256');
for (const file of ['playground/index.html','assets/progress/styles.json',
  ...['playground_server.mjs','playground_service.mjs','runtime.mjs','progress_preview.py','progress.py','chapter_styles.py','export_progress.py','personal_characters.py'].map(name=>'scripts/'+name)]) {
  signature.update(file); signature.update(readFileSync(resolve(projectRoot,file)));
}
const version = signature.digest('hex');
const printReady = (reused) => {
  const progressUrl = `http://127.0.0.1:${port}/index.html?category=progress`;
  process.stdout.write(JSON.stringify({ok:true,service,version,reused,port,baseUrl:progressUrl,chooseUrl:progressUrl,progressUrl,
    instruction:'请观看真实动态样片，回复样式名称；可调整进度颜色。'},null,2)+'\n');
};
const isCurrentService = () => new Promise(ok => {
  const request = get(`http://127.0.0.1:${port}/api/health`, response => {
    let body='';
    response.setEncoding('utf8');
    response.on('data', chunk => {body+=chunk;if(body.length>16384){request.destroy();ok(false);}});
    response.on('end', () => {
      try {const data=JSON.parse(body);ok(response.statusCode===200&&data.service===service&&data.version===version);}
      catch {ok(false);}
    });
    response.on('error',()=>ok(false));
  });
  request.setTimeout(800,()=>{request.destroy();ok(false);});
  request.on('error',()=>ok(false));
});
const generatedRoot = resolve(projectRoot, 'outputs', 'progress-playground-colors');
const scriptDir = resolve(projectRoot, 'scripts');
const renders = new Map();
let renderQueue = Promise.resolve();
const jsonResponse = (res, status, data) => {
  res.writeHead(status, {'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});
  res.end(JSON.stringify(data));
};
const renderColor = (hex, styleId, fontSize) => {
  const cacheKey = styleId + ':' + hex + ':' + (fontSize || 'default');
  if (renders.has(cacheKey)) return renders.get(cacheKey);
  const job = renderQueue.then(async () => {
    await mkdir(generatedRoot, {recursive:true});
    const out = await mkdtemp(resolve(generatedRoot, hex + '-'));
    await new Promise((ok, fail) => {
      const args = ['-B','-X','utf8',resolve(scriptDir,'progress_preview.py'),'--color','#'+hex,'--style',styleId,'--out',out];
      if (fontSize !== undefined) args.push('--font-size',String(fontSize));
      const p = spawn(process.platform === 'win32' ? 'py' : 'python3', args, {windowsHide:true,stdio:['ignore','ignore','pipe']});
      let stderr = '';
      p.stderr.on('data', c => { stderr = (stderr + c).slice(-2000); });
      const timer = setTimeout(() => {p.kill(); fail(new Error('生成超时，请重试'));}, 60000);
      p.on('error', error => {clearTimeout(timer); fail(error);});
      p.on('close', code => {clearTimeout(timer); code === 0 ? ok() : fail(new Error(stderr || '生成失败'));});
    });
    const key = out.slice(generatedRoot.length + 1);
    return {preview:`/progress-generated/${key}/preview.webm`,poster:`/progress-generated/${key}/preview-alpha.png`,thumbnail:`/progress-generated/${key}/preview.png`,download:`/progress-generated/${key}/progress-strip.mov`,color:'#'+hex,styleId,fontSize};
  });
  renderQueue = job.catch(() => {});
  renders.set(cacheKey,job);
  job.catch(() => renders.delete(cacheKey));
  return job;
};

if (!existsSync(resolve(playgroundRoot, 'index.html'))) {
  throw new Error(`没有找到 Playground：${playgroundRoot}`);
}

const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime',
  '.svg': 'image/svg+xml',
};

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url || '/', `http://${req.headers.host || `127.0.0.1:${port}`}`);
    if (url.pathname === '/api/health') return jsonResponse(res,200,{service,version});
    if (url.pathname === '/api/progress-color') {
      if (req.method !== 'POST') return jsonResponse(res,405,{error:'请使用 POST'});
      if (req.headers.origin && new URL(req.headers.origin).host !== req.headers.host) return jsonResponse(res,403,{error:'来源不匹配'});
      let body = '';
      for await (const chunk of req) {
        body += chunk;
        if (body.length > 512) return jsonResponse(res,413,{error:'请求过大'});
      }
      let data;
      try {data = JSON.parse(body);} catch {return jsonResponse(res,400,{error:'无效请求'});}
      if (typeof data?.color !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(data.color)) return jsonResponse(res,400,{error:'请输入 #RRGGBB 色号'});
      const styleId = data.styleId || 'soft-white-green';
      if (!['soft-white-green','walking-leading','dot-line','short-segments','text-leading'].includes(styleId)) return jsonResponse(res,400,{error:'未知进度条样式'});
      const barStyle = ['soft-white-green','walking-leading'].includes(styleId);
      const fontMax = barStyle ? 48 : 72;
      const fontSize = data.fontSize ?? { 'soft-white-green':38,'walking-leading':38,'dot-line':24,'short-segments':26,'text-leading':25 }[styleId];
      if (!Number.isInteger(fontSize) || fontSize < 18 || fontSize > fontMax) return jsonResponse(res,400,{error:`字号请输入 18–${fontMax} 之间的整数`});
      try {return jsonResponse(res,200,await renderColor(data.color.slice(1).toLowerCase(),styleId,fontSize));}
      catch (error) {return jsonResponse(res,500,{error:error.message});}
    }
    const requested = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
    const generated = requested.match(/^\/progress-generated\/([0-9a-f]{6}-[A-Za-z0-9]+)\/(preview\.webm|preview\.png|preview-alpha\.png|poster\.png|progress-strip\.mov)$/);
    const root = generated ? generatedRoot : playgroundRoot;
    const filePath = generated ? resolve(root,generated[1],generated[2]) : resolve(root, `.${requested}`);
    if (filePath !== root && !filePath.startsWith(root + sep)) {
      res.writeHead(403);
      res.end('Forbidden');
      return;
    }
    if (!existsSync(filePath)) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    const info = await stat(filePath);
    if (!info.isFile()) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    res.writeHead(200, {
      'Content-Type': mime[extname(filePath).toLowerCase()] || 'application/octet-stream',
      'Content-Length': info.size,
      'Cache-Control': 'no-store',
    });
    createReadStream(filePath).pipe(res);
  } catch (error) {
    res.writeHead(500, {'Content-Type': 'text/plain; charset=utf-8'});
    res.end(error instanceof Error ? error.message : 'Playground 启动失败');
  }
});

server.on('error', async (error) => {
  if (error && error.code === 'EADDRINUSE') {
    if (await isCurrentService()) {printReady(true);return;}
    if (port < Math.min(preferredPort+20,65535)) {
      port++;
      server.listen(port,'127.0.0.1');
      return;
    }
    process.stderr.write(`未找到可用端口，可设置 LL_VIDEO_PROGRESS_PLAYGROUND_PORT 后重试。\n`);
    process.exitCode=1;
    return;
  }
  throw error;
});

server.on('listening',()=>printReady(false));
server.listen(port, '127.0.0.1');
