// dsh-desktop main — DeepSeek 蓝主题 + 环境检测引导版
const { app, BrowserWindow, ipcMain, shell, screen, Menu, Tray, dialog, nativeImage } = require('electron');

const net = require('node:net');
const { spawn, execFile, execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const PORT = 3080;
const WEB_URL = 'http://127.0.0.1:' + PORT;
const THEME_NAME = 'dsh-theme-mineradio';
const NODE_DL_URL = 'https://nodejs.org/zh-cn/download';

let dshProc = null;
let mainWin = null;   // 主窗口引用（托盘恢复用）
let tray = null;       // 系统托盘
let isQuitting = false; // 真正退出时置 true，跳过关窗拦截

// —— 统一配置存取（userData/settings.json）：关窗偏好 + 开机自启 + 记住窗口大小 ——
function settingsPath() { return path.join(app.getPath('userData'), 'settings.json'); }
function loadSettings() {
  try {
    var p = settingsPath();
    if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (e) {}
  return {};
}
function saveSettings(s) {
  try { fs.writeFileSync(settingsPath(), JSON.stringify(s, null, 2) + '\n', 'utf8'); } catch (e) {}
}
function loadClosePref() {
  var s = loadSettings();
  return (s.closeAction && s.remember) ? s : null;
}
function saveClosePref(action) {
  var s = loadSettings();
  s.closeAction = action; s.remember = true;
  saveSettings(s);
}

function isPortOpen(port, host) {
  return new Promise(function (resolve) {
    var s = net.createConnection({ port: port, host: host });
    s.on('connect', function () { s.destroy(); resolve(true); });
    s.on('error', function () { resolve(false); });
    s.setTimeout(1000, function () { s.destroy(); resolve(false); });
  });
}
function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

// —— 检测本机是否有 node / npm（朋友机器无环境时引导下载）——
function hasNode() {
  return new Promise(function (resolve) {
    execFile('node', ['--version'], { shell: true }, function (err, stdout, stderr) {
      if (err) return resolve(false);
      resolve(/^v\d+/.test(String(stdout || '').trim()));
    });
  });
}
function hasNpm() {
  return new Promise(function (resolve) {
    execFile('npm', ['--version'], { shell: true }, function (err, stdout, stderr) {
      if (err) return resolve(false);
      resolve(/^\d+/.test(String(stdout || '').trim()));
    });
  });
}

// —— 把打包在 asar 里的主题解压到 userData 真实目录（junction 需要真实路径）——
// —— 从 asar 把内置插件解压到 userData 真实目录 ——
function extractBundledPlugin(pluginDir, pluginName) {
  try {
    var src = path.join(app.getAppPath(), pluginDir);
    var dest = path.join(app.getPath('userData'), 'plugins', pluginName);
    var marker = path.join(dest, 'package.json');
    if (fs.existsSync(marker)) return dest;
    fs.mkdirSync(dest, { recursive: true });
    copyDir(src, dest);
    return dest;
  } catch (e) { console.error('[plugin] extract failed', pluginName, e); return null; }
}
function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (var en of fs.readdirSync(src, { withFileTypes: true })) {
    var s2 = path.join(src, en.name), d2 = path.join(dest, en.name);
    if (en.isDirectory()) copyDir(s2, d2);
    else fs.copyFileSync(s2, d2);
  }
}

// —— 复刻 dev_install_package：把主题装配进 profile ——
function ensurePluginInstalled(pluginDir, pluginName) {
  try {
    var dshHome = process.env.DSH_HOME || path.join(os.homedir(), '.dsh');
    var profileDir = path.join(dshHome, 'profiles', 'web');
    var profilePkgPath = path.join(profileDir, 'package.json');
    if (!fs.existsSync(profilePkgPath)) {
      fs.mkdirSync(profileDir, { recursive: true });
      fs.writeFileSync(profilePkgPath, JSON.stringify({
        name: 'dsh-profile-web', private: true, dependencies: {},
        dsh: { profile: { bundles: ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app'] } }
      }, null, 2) + '\n', 'utf8');
      fs.writeFileSync(path.join(profileDir, 'cordis.yml'), '# dsh profile\n[]\n', 'utf8');
      fs.writeFileSync(path.join(profileDir, 'cordis.patch.yml'), '# patch\n[]\n', 'utf8');
    }
    var profilePkg = JSON.parse(fs.readFileSync(profilePkgPath, 'utf8'));
    profilePkg.dependencies = profilePkg.dependencies || {};
    profilePkg.dsh = profilePkg.dsh || {};
    profilePkg.dsh.profile = profilePkg.dsh.profile || {};
    profilePkg.dsh.profile.bundles = profilePkg.dsh.profile.bundles || [];
    if (!profilePkg.dependencies[pluginName]) profilePkg.dependencies[pluginName] = 'link:' + pluginDir;
    if (profilePkg.dsh.profile.bundles.indexOf(pluginName) === -1) profilePkg.dsh.profile.bundles.push(pluginName);
    fs.writeFileSync(profilePkgPath, JSON.stringify(profilePkg, null, 2) + '\n', 'utf8');
    var nodes = path.join(profileDir, 'node_modules');
    var linkPath = path.join(nodes, pluginName);
    if (!fs.existsSync(linkPath)) {
      // scoped 包名（含 /）需要先建中间目录，否则 symlink 到多层路径失败
      fs.mkdirSync(path.dirname(linkPath), { recursive: true });
      fs.symlinkSync(pluginDir, linkPath, 'junction');
    }
    return true;
  } catch (e) { console.error('[plugin] install failed', e); return false; }
}


// —— 无弹窗启动引擎：从 PATH 定位系统 node.exe，用 node 直跑 npx-cli ——
function findNodePath() {
  try {
    // ① 常见安装位置
    var common = [
      'C:\\Program Files\\nodejs\\node.exe',
      'C:\\Program Files (x86)\\nodejs\\node.exe',
      path.join(os.homedir(), 'AppData\\Roaming\\nvm', 'v*'),
      '/usr/local/bin/node', '/usr/bin/node'
    ];
    for (var i = 0; i < common.length; i++) {
      var c = common[i];
      if (c.indexOf('*') < 0) { if (fs.existsSync(c)) return c; }
      else {
        // glob 简单展开（nvm 目录）
        try { var baseDir = c.replace('\\v*', ''); if (fs.existsSync(baseDir)) { var sub = fs.readdirSync(baseDir).find(function (x) { return /^v\d/.test(x); }); if (sub) { var p = path.join(baseDir, sub, 'node.exe'); if (fs.existsSync(p)) return p; } } } catch (e) {}
      }
    }
    // ② PATH 扫描
    var PATH = process.env.PATH || '';
    var dirs = PATH.split(path.delimiter);
    for (var j = 0; j < dirs.length; j++) { if (!dirs[j]) continue; var p2 = path.join(dirs[j], 'node.exe'); if (fs.existsSync(p2)) return p2; }
  } catch (e) {}
  return '';
}

// —— 探测可用的 npm 镜像源（一个连不上自动切换下一个）——
function findWorkableRegistry() {
  var registries = [
    'https://registry.npmmirror.com',
    'https://registry.npmjs.org'
  ];
  return Promise.all(registries.map(function (r) {
    return fetch(r + '/@deepseek-ai%2fdsh', { method: 'GET', signal: AbortSignal.timeout(6000) })
      .then(function (resp) { return { reg: r, ok: resp.ok }; })
      .catch(function () { return { reg: r, ok: false }; });
  })).then(function (results) {
    var hit = results.find(function (x) { return x.ok; });
    return hit ? hit.reg : registries[0];
  });
}

function findNpxCli(nodePath) {
  try {
    // npx-cli.js 位于 <nodejs>/node_modules/npm/bin/npx-cli.js
    var dir = path.dirname(nodePath);
    var p = path.join(dir, 'node_modules', 'npm', 'bin', 'npx-cli.js');
    if (fs.existsSync(p)) return p;
  } catch (e) {}
  return '';
}

function startDsh(nodePath, npxCli, registry) {
  return new Promise(function (resolve) {
    try {
      // 用 node 直接运行 npx-cli.js：不经过 shell，因此不会弹出 cmd/PowerShell 窗口
      // --no-open：不在浏览器自动打开页面（桌面版自己用窗口显示）
      var args = [npxCli, '--yes', '@deepseek-ai/dsh', '--profile', 'web', '--no-open'];
      // 走选定的 npm 镜像源，朋友首次安装 DSH 无需翻墙
      var env = Object.assign({}, process.env, { npm_config_registry: registry });
      var child = spawn(nodePath, args, {
        cwd: os.homedir(), env: env, windowsHide: true,
        stdio: ['ignore', 'ignore', 'ignore']
      });
      dshProc = child;
      child.on('error', function () { resolve(false); });
      child.on('exit', function () { if (child === dshProc) dshProc = null; });
      setTimeout(function () { resolve(true); }, 2500);
    } catch (e) { resolve(false); }
  });
}

// 返回 true=服务就绪 / false=无 Node 环境（走引导）/
// —— 跟随 DSH 引擎自动更新：检测 npm 上 @deepseek-ai/dsh 新版本 ——
var engineInfo = { latest: '', cached: '', updated: false };

function readCachedEngineVersion() {
  try {
    // 尝试读 npx 缓存里的 DSH 版本
    var cacheRoot = process.env.DSH_NPX_CACHE || '';
    var pkgPaths = [];
    var home = path.join(os.homedir(), 'AppData', 'Local', 'npm-cache', '_npx');
    if (fs.existsSync(home)) {
      for (var dir of fs.readdirSync(home)) {
        var p = path.join(home, dir, 'node_modules', '@deepseek-ai', 'dsh', 'package.json');
        if (fs.existsSync(p)) { try { pkgPaths.push(JSON.parse(fs.readFileSync(p, 'utf8')).version); } catch (e) {} }
      }
    }
    return pkgPaths[0] || '';
  } catch (e) { return ''; }
}

function checkEngineUpdate() {
  return new Promise(function (resolve) {
    engineInfo.cached = readCachedEngineVersion();
    try {
      fetch('https://registry.npmjs.org/@deepseek-ai/dsh')
        .then(function (r) { return r.json(); })
        .then(function (j) {
          engineInfo.latest = (j && j['dist-tags']) ? j['dist-tags'].latest : '';
          // 若 cached 存在且 latest != cached => 有更新；cached 为空(暂无缓存)则算首次
          if (engineInfo.cached && engineInfo.latest && engineInfo.latest !== engineInfo.cached) {
            engineInfo.updated = true;
          }
          resolve(true);
        })
        .catch(function () { resolve(false); }); // 离线：跳过更新检查
    } catch (e) { resolve(false); }
  });
}


function startDshShell(cmdline, registry) {
  return new Promise(function (resolve) {
    try {
      var child = spawn(cmdline, { cwd: os.homedir(), env: Object.assign({}, process.env, { npm_config_registry: registry }), windowsHide: true, shell: true, stdio: ['ignore','ignore','ignore'] });
      dshProc = child;
      child.on('error', function () { resolve(false); });
      child.on('exit', function () { if (child === dshProc) dshProc = null; });
      setTimeout(function () { resolve(true); }, 2000);
    } catch (e) { resolve(false); }
  });
}

async function ensureServer() {
  if (await isPortOpen(PORT, '127.0.0.1')) return 'ready';
  var okNode = await hasNode();
  if (!okNode) return 'no-node';
  await checkEngineUpdate();  // 跟随引擎自动更新检测
  // 无更新时提示（engineInfo.updated）由 createWindow 展示
  // 装配主题
  var themeDir = extractBundledPlugin('theme', 'dsh-theme-mineradio');
  if (themeDir) ensurePluginInstalled(themeDir, 'dsh-theme-mineradio');
  var balDir = extractBundledPlugin('plugins/dsh-deepseek-balance', 'dsh-deepseek-balance');
  if (balDir) ensurePluginInstalled(balDir, 'dsh-deepseek-balance');
  var usDir = extractBundledPlugin('plugins/@ychris12138/dsh-usage-stats', '@ychris12138/dsh-usage-stats');
  if (usDir) ensurePluginInstalled(usDir, '@ychris12138/dsh-usage-stats');
  var dsDir = extractBundledPlugin('plugins/dsh-desktop-settings', 'dsh-desktop-settings');
  if (dsDir) ensurePluginInstalled(dsDir, 'dsh-desktop-settings');
  // 探测当前可用的 npm 镜像源（单源连不上自动切换）
  var registry = await findWorkableRegistry();
  // 无弹窗启动：定位系统 node.exe + npx-cli.js，用 node 直接运行 DSH
  var nodePath = findNodePath();
  var npxCli = nodePath ? findNpxCli(nodePath) : '';
  if (nodePath && npxCli) {
    await startDsh(nodePath, npxCli, registry);
  } else {
    // 兜底：找不到 node/npx 时尝试 npx（可能弹窗，但至少尽力）
    var candidates = ['npx --yes @deepseek-ai/dsh --profile web --no-open'];
    for (var i = 0; i < candidates.length; i++) { var ok = await startDshShell(candidates[i], registry); if (ok) break; }
  }
  var deadline = Date.now() + 180000;
  while (Date.now() < deadline) {
    if (await isPortOpen(PORT, '127.0.0.1')) return 'ready';
    await sleep(2000);
  }
  return 'failed';
}

// —— 系统托盘（最小化后后台运行，可恢复/完全退出）——
function ensureTray() {
  if (tray) return;
  try {
    var iconPath = path.join(app.getAppPath(), 'icon.ico');
    var icon = fs.existsSync(iconPath) ? nativeImage.createFromPath(iconPath) : nativeImage.createEmpty();
    tray = new Tray(icon);
    tray.setToolTip('DeepSeek Harness');
    var menu = Menu.buildFromTemplate([
      { label: '打开主界面', click: function () { if (mainWin) { if (mainWin.isMinimized()) mainWin.restore(); mainWin.show(); mainWin.focus(); } } },
      { label: '设置', click: function () { createSettingsWindow(); } },
      { type: 'separator' },
      { label: '完全退出', click: function () { isQuitting = true; app.quit(); } }
    ]);
    tray.setContextMenu(menu);
    tray.on('click', function () { if (mainWin) { if (mainWin.isMinimized()) mainWin.restore(); mainWin.show(); mainWin.focus(); } });
  } catch (e) { tray = null; }
}

// —— 保存窗口大小（记住大小开启时）——
function persistWinSize(win) {
  try {
    var cfg = loadSettings();
    if (!cfg.rememberSize) return;
    var b = win.getBounds();
    cfg.lastSize = { width: b.width, height: b.height };
    saveSettings(cfg);
  } catch (e) {}
}
// —— 应用开机自启设置 ——
function applyAutoLaunch() {
  try {
    var cfg = loadSettings();
    var val = !!cfg.autoLaunch;
    app.setLoginItemSettings({ openAtLogin: val, path: process.execPath });
    return val;
  } catch (e) { return false; }
}

function createWindow() {
  var cfg = loadSettings();
  // 记住窗口大小：若开启且有上次尺寸，用上次，否则用自适应默认尺寸
  var width = 1360, height = 880;
  try {
    var wa = screen.getPrimaryDisplay().workAreaSize;
    var scale = screen.getPrimaryDisplay().scaleFactor || 1;
    width = Math.min(width, Math.round(wa.width / scale * 0.9));
    height = Math.min(height, Math.round(wa.height / scale * 0.88));
    width = Math.max(width, 900); height = Math.max(height, 640);
  } catch (e) {}
  if (cfg.rememberSize && cfg.lastSize && cfg.lastSize.width && cfg.lastSize.height) {
    width = cfg.lastSize.width; height = cfg.lastSize.height;
  }
  // 多屏检测：把窗口放到主屏幕工作区的正中间
  var x = undefined, y = undefined;
  try {
    var wa2 = screen.getPrimaryDisplay().workArea;   // {x,y,width,height}
    x = Math.round(wa2.x + (wa2.width - width) / 2);
    y = Math.round(wa2.y + (wa2.height - height) / 2);
  } catch (e) {}
  var win = new BrowserWindow({
    width: width, height: height, title: 'DSH 桌面版',
    x: x, y: y,
    minWidth: 900, minHeight: 640, resizable: true,
    webPreferences: { contextIsolation: true, nodeIntegration: false, preload: path.join(app.getAppPath(), 'desktop-preload.js') }
  });
  // 保存窗口大小（若开启记住大小）
  win.on('resize', function () { persistWinSize(win); });
  win.on('move', function () { persistWinSize(win); });

  // 防抖：修复统计状态栏（含'缓存命中'）hover 时 window 跳动
  win.webContents.on('did-finish-load', function () {
    var css = [
      // ① StatsLine 统计栏（含'缓存命中'）：固定高度，任何 hover/tooltip 都不改变布局
      '[class*="StatsLine_root"], [class*="FJxK0a_root"] { height: 20px !important; min-height: 20px !important; max-height: 20px !important; overflow: hidden !important; white-space: nowrap !important; transition: none !important; animation: none !important; backdrop-filter: none !important; -webkit-backdrop-filter: none !important; }',
      // ② tooltip：禁用毛玻璃背景 + 固定定位，避免 hover 时重绘抖动
      '[data-tooltip], [class*="Tooltip_root"], [role="tooltip"] { backdrop-filter: none !important; -webkit-backdrop-filter: none !important; background: rgba(255,255,255,0.98) !important; transition: none !important; animation: none !important; }',
      // ③ 全局 hover 不改变统计行容器尺寸
      '[class*="StatsLine_root"] * { transition: none !important; animation: none !important; }'
    ].join('\n');
    win.webContents.insertCSS(css).catch(function(){});
    if (engineInfo.updated) {
                  var bannerVersion = engineInfo.latest || '';
      var bannerJs = "(function(){var b=document.createElement('div');b.style.cssText='position:fixed;top:0;left:0;right:0;z-index:999999;background:#2e43b8;color:#fff;padding:8px 20px;font-size:13px;text-align:center;font-family:sans-serif;';b.textContent='🔁 DeepSeek Harness 引擎已自动更新到 v' + %%VER%% ;document.body.appendChild(b);})()";
      bannerJs = bannerJs.replace("%%VER%%", JSON.stringify(bannerVersion));
      win.webContents.executeJavaScript(bannerJs).catch(function(){});
    }
  });
  win.loadURL(WEB_URL);
  mainWin = win;

  // —— 关窗确认：最小化到托盘 / 完全退出，可勾选下次默认 ——
  win.on('close', function (e) {
    if (isQuitting) return;               // 程序真正退出时放行
    var pref = loadClosePref();
    if (pref) {                            // 已记住偏好，直接按记忆执行
      e.preventDefault();
      if (pref.closeAction === 'minimize') { win.hide(); ensureTray(); }
      else { isQuitting = true; app.quit(); }
      return;
    }
    // 未记住：弹确认框
    e.preventDefault();
    dialog.showMessageBox(win, {
      type: 'question',
      buttons: ['最小化到托盘', '完全退出'],
      defaultId: 0, cancelId: 0,
      title: '关闭 DeepSeek Harness',
      message: '关闭窗口后要如何运行？',
      detail: '「最小化到托盘」会继续在后台运行，可随时点托盘图标恢复；「完全退出」会关闭应用并停止 DSH 服务。',
      checkboxLabel: '下次默认按此操作，不再询问',
      checkboxChecked: false
    }).then(function (result) {
      if (result.checkboxChecked) saveClosePref(result.response === 0 ? 'minimize' : 'quit');
      if (result.response === 0) { win.hide(); ensureTray(); }
      else { isQuitting = true; app.quit(); }
    }).catch(function () { });
  });

  return win;
}
// 把 setup 引导页解压到 userData 真实目录再加载（避免 asar 内 loadFile 显示源码）
function extractSetupGuide() {
  try {
    var src = path.join(app.getAppPath(), 'setup-guide.html');
    var dest = path.join(app.getPath('userData'), 'setup-guide.html');
    if (!fs.existsSync(dest)) fs.copyFileSync(src, dest);
    return dest;
  } catch (e) { return ''; }
}
function createSettingsWindow() {
  var win = new BrowserWindow({
    width: 520, height: 520, title: '设置', resizable: false, autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, nodeIntegration: false, preload: path.join(app.getAppPath(), 'settings-preload.js') }
  });
  win.setMenuBarVisibility(false);
  // 解压到 userData 再 load，避免 asar 内 loadFile 显示源码
  try {
    var dst = path.join(app.getPath('userData'), 'settings.html');
    if (!fs.existsSync(dst)) fs.copyFileSync(path.join(app.getAppPath(), 'settings.html'), dst);
    win.loadFile(dst);
  } catch (e) { win.loadFile(path.join(app.getAppPath(), 'settings.html')); }
  return win;
}
// —— 设置 IPC ——
// —— 桌面级设置 IPC（DSH 页面经 desktop-preload 桥接）——
ipcMain.on('desktop-get', function (e) {
  try { e.returnValue = loadSettings(); } catch (err) { e.returnValue = {}; }
});
ipcMain.on('desktop-set', function (e, key, val) {
  try {
    var s = loadSettings();
    if (key === 'autoLaunch') s.autoLaunch = !!val;
    else if (key === 'rememberSize') s.rememberSize = !!val;
    else return;
    saveSettings(s);
    applyAutoLaunch();
  } catch (err) {}
});

ipcMain.on('settings-get', function (e) {
  try { e.returnValue = loadSettings(); } catch (err) { e.returnValue = {}; }
});
ipcMain.on('settings-set', function (e, key, val) {
  try {
    var s = loadSettings();
    if (key === 'autoLaunch') { s.autoLaunch = !!val; }
    else if (key === 'rememberSize') { s.rememberSize = !!val; }
    else return;
    saveSettings(s);
    applyAutoLaunch();
  } catch (err) {}
});

function createSetupWindow() {
  var html = extractSetupGuide();
  var win = new BrowserWindow({
    width: 620, height: 640, title: 'DeepSeek Harness 安装说明', resizable: false,
    autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, nodeIntegration: false, preload: path.join(app.getAppPath(), 'setup-preload.js') }
  });
  win.loadFile(html || path.join(app.getAppPath(), 'setup-guide.html'));
  win.setMenuBarVisibility(false);
  return win;
}
ipcMain.on('open-node-download', function () { shell.openExternal(NODE_DL_URL); });
ipcMain.on('retry-check', async function (e) {
  var ok = await hasNode();
  if (ok) {
    // 环境已就绪，重启主流程
    app.relaunch(); app.exit(0);
  } else {
    if (e && e.sender) e.sender.send('node-still-missing');
  }
});

// —— 单实例锁：双击多次只保留一个窗口，重复启动会退出并把已有窗口前置 ——
var gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  // 已有实例在运行：本进程直接退出，不创建窗口
  app.quit();
} else {
  app.on('second-instance', function () {
    // 已有实例正在运行：把它的窗口拉到最前
    var wins = BrowserWindow.getAllWindows();
    if (wins.length > 0) {
      var w = wins[0];
      if (w.isMinimized()) w.restore();
      w.show();
      w.focus();
    } else {
      createWindow();
    }
  });

  app.whenReady().then(async function () {
  applyAutoLaunch();
    var state = await ensureServer();
    if (process.env.DSH_FORCE_SETUP === '1') state = 'no-node';
    if (state === 'no-node') {
      createSetupWindow();
    } else if (state === 'ready') {
      createWindow();
    } else {
      // failed: 可能是网络问题，也给出提示窗口
      createSetupWindow();
    }
    app.on('activate', function () { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
  });
}
app.on('window-all-closed', function () { if (tray) { /* 有托盘：后台运行，不退出 */ } else if (process.platform !== 'darwin') app.quit(); });

// —— 完全退出时彻底关闭 DSH：杀外层进程 + 按 3080 端口反查杀掉真正的 DSH 服务进程 ——
function killDshProcesses() {
  // ① 杀掉 main.js 记录的启动进程（外层 npx-cli，若还在）
  if (dshProc) { try { dshProc.kill(); } catch (e) {} dshProc = null; }
  // ② 按 3080 端口反查 DSH 服务进程并同步强杀（用 execFileSync 保证 quit 前执行完，不留孤儿进程占端口）
  try {
    var out = execFileSync('netstat', ['-ano'], { encoding: 'utf8', windowsHide: true });
    var lines = String(out).split(/\r?\n/);
    var pids = {};
    for (var i = 0; i < lines.length; i++) {
      var l = lines[i];
      if (l.indexOf(':' + PORT) < 0) continue;
      var m = l.match(/LISTENING\s+(\d+)\s*$/i);
      if (m) pids[m[1]] = true;
    }
    for (var pid in pids) { try { execFileSync('taskkill', ['/F', '/PID', pid], { windowsHide: true, stdio: 'ignore' }); } catch (e) {} }
  } catch (e) {}
}

app.on('before-quit', function () { isQuitting = true; killDshProcesses(); });
