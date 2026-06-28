# Webhook 触发

在任意网站注入可配置的按钮，点击触发 Webhook。

## 功能

- **多按钮支持** — 可添加多个按钮，每个按钮独立配置匹配 URL、图标、文字、颜色和 Webhook
- **两种 Webhook 类型** — 默认（通用 HTTP 请求）和 GitHub（填仓库名+事件名自动生成 URL/Headers/Body）
- **Font Awesome 图标** — 内置 40+ 常用图标下拉选择
- **统一位置控制** — 所有按钮水平排列在设置按钮旁，全局控制容器位置
- **可视化配置面板** — 点击悬浮齿轮按钮打开，添加/编辑/删除/测试按钮

## 匹配域名说明

脚本默认全局匹配 `*://*/*`，在所有页面运行。

如果只想在特定页面显示按钮，有两种方式（可组合使用）：

| 方式 | 位置 | 作用 |
|------|------|------|
| Tampermonkey 设置 | 脚本 `@match` | 控制脚本在哪些页面运行，不匹配则不运行 |
| 配置面板 | 每个按钮的"匹配 URL" | 脚本运行后，决定具体哪个按钮在当前页面显示 |

推荐做法：`@match` 保持 `*://*/*`，只在配置面板给每个按钮单独设置匹配 URL，更灵活。

## 使用方式

1. 安装脚本，打开任意网页
2. 页面右下角出现悬浮齿轮按钮 ⚙，点击打开配置面板
3. 在配置面板添加按钮，设置匹配 URL、图标、文字、颜色
4. 配置 Webhook 参数后保存并刷新

## Webhook 类型

### 默认类型

手动填写 Method、URL、Headers、Body，适用于任意 Webhook 服务。

### GitHub 类型

填写三个字段即可，URL / Headers / Body 自动生成：

| 字段 | 说明 | 示例 |
|------|------|------|
| GitHub Token | Personal Access Token | `github_pat_...` |
| 仓库名称 | 用户名/仓库名 | `ahao430/blog` |
| 事件名称 | repository_dispatch event_type | `sync-yuque` |

自动生成结果：
- URL → `https://api.github.com/repos/{仓库名称}/dispatches`
- Headers → `Accept: application/vnd.github+json` + `Content-Type: application/json`
- Body → `{"event_type":"{事件名称}"}`

#### Token 创建步骤

1. 打开 [github.com/settings/tokens](https://github.com/settings/tokens)，点击 Generate new token
2. **Fine-grained token**：选仓库 → Repository permissions → Contents → Read and write
3. **Classic token**：勾选 repo scope
4. 生成后复制 token，粘贴到配置面板

## 测试请求

配置面板中每个按钮卡片下方有"测试请求"按钮，点击后发送实际请求并在下方展示完整的请求和响应信息，方便调试。
