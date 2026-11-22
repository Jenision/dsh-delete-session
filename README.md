# DeepSeek Harness 永久删除对话插件（dsh-delete-session）

[中文](README.md) | [English](README.en.md)

为 **DeepSeek Harness (DSH)** 提供「永久删除对话」功能的插件（基于 Cordis 插件架构，已在 DSH `0.2.2-rc.5` 接口下通过类型检查与构建）。

## 功能特性

- **侧边栏菜单入口**：在每个对话行的右键菜单 / `…` 菜单中增加红色危险操作 **「永久删除对话…」**（位于归档选项之后）。
- **二次确认弹窗**：点击后弹出确认对话框，显示对话标题与会话 ID，防止误删。
- **安全校验**：
  - 严格校验 `sessionId` 格式（`^[A-Za-z0-9][A-Za-z0-9._-]{0,199}$`），防止路径穿越。
  - 若对话正在运行中（存在活跃 Agent 或后台任务），拒绝删除并返回 `409`（`SESSION_RUNNING`）本地化提示。
- **彻底清理**：
  1. 释放内存中空闲的会话句柄。
  2. 删除磁盘上的 JSONL 会话日志目录（`~/.dsh/sessions/<project>/<sessionId>/`）。
  3. 删除投影缓存（`~/.dsh/storages/session_projcache/sessions/<sessionId>.json`）。
  4. 从工作区列表、置顶列表和归档列表中移除该会话，并通知前端实时刷新。

## 构建

```bash
npm install
npm run build
```

## 安装与启用（以 `desktop` profile 为例）

本插件已通过 `package.json` 中的 `dsh.bundle` 声明自动挂载 `cordis.patch.yml`：

1. 将本地插件安装到 DSH 的 `desktop` profile：

```powershell
& "C:\Users\Jenision\AppData\Local\Programs\DeepSeek Harness\resources\runtime\cli\bin\dsh.cmd" plugin --profile desktop add "C:\Users\Jenision\.gemini\antigravity\scratch\dsh-delete-session"
```

2. 重启 DeepSeek Harness 即可生效。
