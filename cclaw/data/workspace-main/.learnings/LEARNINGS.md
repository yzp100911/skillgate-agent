# Learnings

Corrections, insights, and knowledge gaps captured during development.

**Categories**: correction | insight | knowledge_gap | best_practice

---

## 2026-05-06

### `best_practice` agent-browser 操作 SPA（Vue/React）登录页面的正确姿势

**Context**: 操纵莞e租管理系统（Vue SPA），需要登录后进入房源页查看租约信息。
**What**: 首次操作 SPA 登录页面时踩了几个坑，总结优化方案：

**踩坑记录：**

1. **隐私协议弹窗阻塞登录** — 页面上有"同意并授权"弹窗，必须先点击关闭才能操作登录表单。
2. **agent-browser click 无法触发 Vue 表单提交** — SPA 的按钮可能绑定了自定义事件，`agent-browser --cdp 9222 click @ref` 点击了但没反应。**解决方案**：改用 CDP WebSocket 直连执行 JavaScript（`element.click()` 或 `document.querySelector('button').click()`）。
3. **侧边栏菜单在无障碍快照中不可见** — Vue Element UI 的菜单项文本可能在 i18n 或 CSS 中隐藏，`snapshot -i --json` 看不到。**解决方案**：直接用 CDP JS 扫描 `document.querySelectorAll('*')` 查找 href 或 textContent，或直接导航到已知路由（如 `#/house/index`）。

**优化后的标准流程：**
```
1. open url → wait networkidle
2. 用 CDP JS 关闭弹窗（如有）
3. 用 CDP JS 填充表单 + 触发提交（click 不行换 submit 或 Enter）
4. 导航到目标页面（点菜单 link 或直接改 hash）
5. 获取数据
```

**预期耗时：** 熟悉后类似任务应在 2-3 分钟内完成。

---

### `best_practice` Self-Improving Agent 安装与初始化流程

**Context**: 首次安装 Self-Improving Agent skill，完成了下载、解压、.learnings/ 目录初始化。
**What**: 该 skill 通过 SKILL.md 注入指令，无需外部依赖即可运行。从 ClawHub API 获取 skill 的下载链接并解压到 skills 目录即可完成安装。
**Why better**: 简化了后续类似 skill 的安装流程，不需额外配置。
**Source**: 安装过程记录
