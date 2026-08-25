# RELEASING — DSH Desktop（桌面启动器）GitHub Release 发布流程

目标：发布 `DeepSeek Harness` 桌面启动器 —— 源码进 GitHub 仓库，`release\DeepSeek Harness.exe`（便携单文件）作为 Release 附件分发。

## 强制前置：发布前 My Codex 小弟隐私/安全审查（不可跳过）
每个版本发布前，**必须先派 My Codex 子代理**（`subagent`，`my-codex` / `claude-opus-5-thinking`）做只读审查，主代理不得自己闷头跳过：
1. **个人信息/密钥/本机路径**：全源码扫描（排除 node_modules / release / dist / .npm-cache / .git），给出文件+行号，标注"必须清理"或"可保留"（作者署名可保留；本机路径如 `C:\Users\<用户名>\`、username、API key/token 必须清）。
2. **发布文件清单**：哪些进仓库、哪些排除、`DeepSeek Harness.exe` 作 Release 附件。
3. **规范/安全整改点**（第三方源路径注释 `dshcss:D:\...` 等是否影响）。
主代理收到报告后**逐条落地整改**，再打包发布。

## 打包（发布前）
- 源码进仓库的文件：`main.js`、`launcher.cjs`、`desktop-preload.js`、`setup-guide.html`、`setup-preload.js`、`settings.html`、`settings-preload.js`、`dom.html`、`icon.ico`、`package.json`、`README.md`、`THIRD-PARTY-NOTICES.md`、`theme/**`、`plugins/**`（参考 `package.json` 的 `build.files`）。
- **排除**：`node_modules`、`release`、`dist`、`.npm-cache`、`.git`、第三方开发源码拷贝（`mineradio`、`balance`、`usage-stats-dl` 等目录本体）。
- 构建产物 `release\DeepSeek Harness.exe`（约 71MB）：**不进仓库**，仅作 Release 附件。重新构建：`npm run dist:portable`（electron-builder portable）。

## 发布（网络到不了 github.com 时走 Contents API，实测可用）
```powershell
$gh="C:\Program Files\GitHub CLI\gh.exe"; $repo="sun-9264/dsh-desktop"; $d="C:\Users\simpl\Desktop\1111\dsh-desktop"
# 1) 只建公开仓库（不带 --source=./--push，避免 git push 超时）
& $gh repo create dsh-desktop --public
# 2) Contents API 逐个上传源码文件（绕开 github.com）
$files=@("main.js","launcher.cjs","desktop-preload.js","setup-guide.html","setup-preload.js","settings.html","settings-preload.js","dom.html","icon.ico","package.json","README.md","THIRD-PARTY-NOTICES.md","theme/lib/client.js","theme/lib/index.js")   # theme/plugins 逐个补全
foreach($f in $files){
  $b64=[Convert]::ToBase64String([IO.File]::ReadAllBytes((Join-Path $d ($f -replace '/','\'))))
  & $gh api --method PUT "repos/$repo/contents/$f" -f "message=init: $f" -f "content=$b64" -f "branch=main" | Out-Null
}
# 3) Release 附 DeepSeek Harness.exe（uploads 通道实测通；空仓库需先传内容）
& $gh release create v1.0.0 "release/DeepSeek Harness.exe" -R $repo --title "v1.0.0" --notes "DSH Desktop 桌面启动器（详细说明见仓库 README）"
# 4) 验证
& $gh release view v1.0.0 -R $repo --json tagName,assets
```

## 版本升级
改代码 → 更新 `package.json` version → `npm run dist:portable` 重出 `release\DeepSeek Harness.exe` → 更新源码文件（Contents API / git push）→ 打 `vX.Y.Z` 新 Release 附新 exe。

## 说明
- 本机网络对 `github.com`（git 端点）常不可达，但 `api.github.com` / `uploads.github.com` 可用 → 用 Contents API + `gh release create`（多次实测成功）。
- 作者署名（`simple_sun 和 胖🐋`）为公开署名可保留；本机路径需清（如 README 里的 `C:\Users\...`）。
