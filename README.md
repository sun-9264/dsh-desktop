# DeepSeek Harness 桌面版 ✅（DeepSeek 蓝主题）

**双击即启动的桌面应用（Windows 单文件 exe）。**

## 界面
- 基于 DeepSeek Harness 官方 Web UI。
- 内置 **DeepSeek 蓝** 电影感玻璃主题，默认即显示蓝色流体背景 + 冷玻璃面板，浅色/深色可切换。
- 已优化聊天区文字对比度，正文清晰易读。
- 修复：统计状态栏（含『缓存命中』等）鼠标悬停时窗口跳动的问题（禁用 hover 毛玻璃 + 固定高度）。
- **跟随 DSH 引擎自动更新**：每次启动自动检查 npm 上 `@deepseek-ai/dsh` 的最新版本，有新版本就自动使用最新引擎并在页面顶部提示「引擎已更新到 vX」。
- 内置 **DeepSeek 官方余额显示**：会话输入框下方常驻余额 + 本会话消费，悬停可见输入（未命中/命中/写入）、输出 token 明细（每 15 秒刷新）。

- 应用图标为 DeepSeek 鲸娘（蓝色 Q 版）。

## 打开即用 & 环境检测
双击桌面上的 **DeepSeek Harness.exe** 即可：

1. **检测到本机已安装 Node.js** → 自动启动 DeepSeek Harness（需联网拉取服务），并加载蓝色主题。
2. **未检测到 Node.js**（朋友电脑常见情况）→ 弹出**中文安装引导**：点按钮打开 Node.js 官网下载页（Windows 64 位 LTS），按说明安装后点"我已安装，重新检查"，即可自动启动。

> 首次启动需联网（拉取 DSH 服务 + 下载 Node.js）。Node.js 是官方免费、安全的运行时，几十 MB。

## 交付文件
- 主程序（单文件）：`DeepSeek Harness.exe`（发布在 Releases 附件，下载即用）
- 桌面快捷方式 / 开始菜单：DeepSeek Harness

## 项目结构（源码，位于 dsh-desktop）
```
dsh-desktop/
├─ main.js          Electron 主进程（窗口 + 启动 DSH + 环境检测 + 自动装配蓝主题）
├─ setup-guide.html 无 Node.js 时的中文安装引导页
├─ icon.ico         DeepSeek 鲸娘图标
├─ theme/           内置蓝色主题（dsh-theme-mineradio 改色版）
├─ mineradio/       蓝色主题源码（香槟金→DeepSeek 蓝 + 对比度优化）
└─ release/DeepSeek Harness.exe   构建产物（单文件）
```


## 声明（免责）
- 本程序为 **社区自制、非官方** 的 DeepSeek Harness 桌面启动器，**与 DeepSeek 官方及其母公司无关**，非 DeepSeek 官方出品。
- "DeepSeek""DeepSeek Harness"为各自所有者的商标，本程序仅作兼容描述，不代表官方认可或授权。
- 内置第三方组件（主题、余额插件）的许可与署名见 `THIRD-PARTY-NOTICES.md`。
