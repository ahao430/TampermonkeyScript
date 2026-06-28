# TampermonkeyScript

油猴脚本集合。

## 脚本列表

| 脚本 | 说明 |
|------|------|
| [Webhook 触发](scripts/webhook/webhook触发.user.js) | 在任意网站注入可配置按钮，点击触发 Webhook |
| [NewAPI 管理员增强](scripts/newapi/newapi管理员增强脚本.js) | NewAPI 控制台日志导出、用户批量添加与额度批量修改 |

## 油猴脚本基本格式

```javascript
// ==UserScript==
// @name         脚本名称
// @namespace    命名空间（通常为你的站点或 GitHub 仓库地址）
// @version      版本号（格式 YYYY-MM-DD）
// @description  脚本描述
// @author       作者
// @match        匹配的 URL 模式（可多个）
// @grant        所需的权限（如 GM_xmlhttpRequest、GM_setValue 等）
// @license      许可证（如 MIT）
// ==/UserScript==

(function () {
  'use strict';
  // 脚本逻辑
})();
```

### 关键 metadata 说明

- **@name** — 脚本名称，安装后在 Tampermonkey 管理面板中显示
- **@namespace** — 与 @name 组合形成唯一标识，避免脚本冲突
- **@match** — 指定脚本在哪些 URL 下运行，支持 `*` 通配符。可写多个 @match
- **@grant** — 声明脚本需要使用的 GM_* API 权限
  - `GM_xmlhttpRequest` — 跨域 HTTP 请求
  - `GM_getValue` / `GM_setValue` — 持久化存储
  - `GM_registerMenuCommand` — 注册菜单命令
  - `none` — 不需要任何特殊权限（直接访问页面 DOM）

## 如何发布

### 方式一：直接安装本地文件

1. 打开 Tampermonkey 管理面板 → 已安装脚本
2. 将 `.user.js` 文件拖入浏览器窗口
3. 点击"安装"

### 方式二：通过 Greasy Fork 发布

1. 注册 [Greasy Fork](https://greasyfork.org) 账号
2. 提交脚本时粘贴完整代码
3. 设置脚本的同步 URL 指向 GitHub 仓库文件，方便后续更新

### 方式三：通过 GitHub Raw 直链分发

1. 将脚本推送到 GitHub 仓库
2. 在 README 中提供 raw 链接：`https://raw.githubusercontent.com/<user>/<repo>/main/scripts/<name>.user.js`
3. 用户点击链接后 Tampermonkey 会自动识别并提示安装

推荐命名以 `.user.js` 结尾，Tampermonkey 会自动识别并弹出安装提示。
