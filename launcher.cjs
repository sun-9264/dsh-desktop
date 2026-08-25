// DeepSeek Harness 桌面启动器（Node 版）
// 作用：确保本地 DSH Web 服务（127.0.0.1:3080）已启动，然后用浏览器/Edge 独立窗口打开界面。
const net = require('node:net');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const PORT = 3080;
const URL = 'http://127.0.0.1:' + PORT;

// 常见浏览器（Chromium --app 独立窗口模式，无地址栏，观感接近桌面应用）
const APP_BROWSERS = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'
];

function isPortOpen(port, host) {
  return new Promise(function (resolve) {
    const s = net.createConnection({ port: port, host: host });
    s.on('connect', function () { s.destroy(); resolve(true); });
    s.on('error', function () { resolve(false); });
    s.setTimeout(800, function () { s.destroy(); resolve(false); });
  });
}

const sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };

// 若服务未运行，用 npx 后台拉起 DSH Web profile
async function ensureServer() {
  if (await isPortOpen(PORT, '127.0.0.1')) return true;
  spawn('npx --yes @deepseek-ai/dsh --profile web', {
    cwd: __dirname,
    shell: true,
    detached: true,
    stdio: 'ignore',
    windowsHide: true
  }).unref();
  console.log('[dsh-desktop] 正在启动 DSH 服务，请稍候…');
  const deadline = Date.now() + 180000;
  while (Date.now() < deadline) {
    if (await isPortOpen(PORT, '127.0.0.1')) return true;
    await sleep(2000);
  }
  return false;
}

// 用 Edge/Chrome 独立窗口打开；找不到则退回默认浏览器
function openWindow() {
  for (let i = 0; i < APP_BROWSERS.length; i++) {
    if (fs.existsSync(APP_BROWSERS[i])) {
      spawn(APP_BROWSERS[i], ['--app=' + URL], { detached: true, stdio: 'ignore', windowsHide: false }).unref();
      return true;
    }
  }
  spawn('cmd', ['/c', 'start', '', URL], { detached: true, stdio: 'ignore', windowsHide: true, shell: true }).unref();
  return false;
}

(async function main() {
  const ok = await ensureServer();
  if (!ok) {
    console.error('[dsh-desktop] 启动 DSH 服务失败或超时，请检查网络后重试。');
    return;
  }
  openWindow();
})();
