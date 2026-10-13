// ==UserScript==
// @name         网页工具箱（Webhook + 随机滚动）
// @namespace    https://github.com/ahao430/TampermonkeyScript
// @version      2.2.0
// @description  全站网页工具箱：Webhook 触发与随机滚动
// @author       wanghao
// @match        *://*/*
// @icon         https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6/svgs/solid/screwdriver-wrench.svg
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_addStyle
// @license      MIT
// @downloadURL https://update.greasyfork.org/scripts/600123/%E7%BD%91%E9%A1%B5%E5%B7%A5%E5%85%B7%E7%AE%B1%EF%BC%88Webhook%20%2B%20%E9%9A%8F%E6%9C%BA%E6%BB%9A%E5%8A%A8%EF%BC%89.user.js
// @updateURL https://update.greasyfork.org/scripts/600123/%E7%BD%91%E9%A1%B5%E5%B7%A5%E5%85%B7%E7%AE%B1%EF%BC%88Webhook%20%2B%20%E9%9A%8F%E6%9C%BA%E6%BB%9A%E5%8A%A8%EF%BC%89.meta.js
// ==/UserScript==

(function () {
  'use strict';

  var STORAGE_BUTTONS = 'webhook_trigger_buttons';
  var STORAGE_GLOBAL = 'webhook_trigger_global';

  // ---- Font Awesome 图标列表 ----
  var FA_ICONS = [
    { l: '火箭', v: 'fa-solid fa-rocket' },
    { l: '同步', v: 'fa-solid fa-rotate' },
    { l: '通知', v: 'fa-solid fa-bell' },
    { l: '发送', v: 'fa-solid fa-paper-plane' },
    { l: '上传', v: 'fa-solid fa-upload' },
    { l: '下载', v: 'fa-solid fa-download' },
    { l: '刷新', v: 'fa-solid fa-arrows-rotate' },
    { l: '播放', v: 'fa-solid fa-play' },
    { l: '停止', v: 'fa-solid fa-stop' },
    { l: '链接', v: 'fa-solid fa-link' },
    { l: '标记', v: 'fa-solid fa-bookmark' },
    { l: '星标', v: 'fa-solid fa-star' },
    { l: '心形', v: 'fa-solid fa-heart' },
    { l: '评论', v: 'fa-solid fa-comment' },
    { l: '分享', v: 'fa-solid fa-share' },
    { l: '保存', v: 'fa-solid fa-floppy-disk' },
    { l: '编辑', v: 'fa-solid fa-pen' },
    { l: '删除', v: 'fa-solid fa-trash' },
    { l: '添加', v: 'fa-solid fa-plus' },
    { l: '勾选', v: 'fa-solid fa-check' },
    { l: '关闭', v: 'fa-solid fa-xmark' },
    { l: '搜索', v: 'fa-solid fa-magnifying-glass' },
    { l: '主页', v: 'fa-solid fa-house' },
    { l: '用户', v: 'fa-solid fa-user' },
    { l: '部署', v: 'fa-solid fa-cloud-arrow-up' },
    { l: '构建', v: 'fa-solid fa-hammer' },
    { l: '代码', v: 'fa-solid fa-code' },
    { l: '终端', v: 'fa-solid fa-terminal' },
    { l: '数据库', v: 'fa-solid fa-database' },
    { l: '锁', v: 'fa-solid fa-lock' },
    { l: '眼睛', v: 'fa-solid fa-eye' },
    { l: '日历', v: 'fa-solid fa-calendar' },
    { l: '时钟', v: 'fa-solid fa-clock' },
    { l: '标签', v: 'fa-solid fa-tag' },
    { l: '旗帜', v: 'fa-solid fa-flag' },
    { l: '火', v: 'fa-solid fa-fire' },
    { l: '闪电', v: 'fa-solid fa-bolt' },
    { l: '扳手', v: 'fa-solid fa-wrench' },
    { l: '复制', v: 'fa-solid fa-copy' },
    { l: '文件夹', v: 'fa-solid fa-folder' },
    { l: '文件', v: 'fa-solid fa-file' },
    { l: '图片', v: 'fa-solid fa-image' },
    { l: '信封', v: 'fa-solid fa-envelope' },
    { l: '购物车', v: 'fa-solid fa-cart-shopping' },
    { l: '齿轮', v: 'fa-solid fa-gear' },
    { l: '瓦片', v: 'fa-solid fa-cubes' },
    { l: '部署2', v: 'fa-solid fa-rocket' },
  ];

  // ---- 全局默认设置 ----
  var DEFAULT_GLOBAL = {
    position: 'bottom-right',
    offsetX: 20,
    offsetY: 20,
  };

  // ---- 存储 ----
  function loadGlobal() {
    var raw = GM_getValue(STORAGE_GLOBAL);
    if (!raw) {
      try { raw = localStorage.getItem(STORAGE_GLOBAL); } catch (e) {}
    }
    if (raw) {
      try { return JSON.parse(raw); } catch (e) {}
    }
    return JSON.parse(JSON.stringify(DEFAULT_GLOBAL));
  }

  function saveGlobal(g) {
    var json = JSON.stringify(g);
    GM_setValue(STORAGE_GLOBAL, json);
    try { localStorage.setItem(STORAGE_GLOBAL, json); } catch (e) {}
  }

  function loadButtons() {
    var raw = GM_getValue(STORAGE_BUTTONS);
    if (!raw) {
      try { raw = localStorage.getItem(STORAGE_BUTTONS); } catch (e) {}
    }
    if (raw) {
      try { return JSON.parse(raw); } catch (e) {}
    }
    return [];
  }

  function saveButtons(buttons) {
    var json = JSON.stringify(buttons);
    GM_setValue(STORAGE_BUTTONS, json);
    try { localStorage.setItem(STORAGE_BUTTONS, json); } catch (e) {}
  }

  function matchPattern(url, pattern) {
    if (!pattern) return true;
    var escaped = pattern
      .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
      .replace(/\*/g, '.*');
    return new RegExp('^' + escaped + '$').test(url);
  }

  function escAttr(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function escText(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  // ---- 注入 Font Awesome ----
  function injectFA() {
    if (document.getElementById('wh-fa-css')) return;

    var link = document.createElement('link');
    link.id = 'wh-fa-css';
    link.rel = 'stylesheet';
    link.href =
      'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css';

    document.head.appendChild(link);
  }

  // ---- 全局容器 ----
  function getContainer() {
    return document.getElementById('wh-container');
  }

  function ensureContainer() {
    var c = getContainer();
    if (c) return c;

    var g = loadGlobal();
    var xProp = g.position.includes('left') ? 'left' : 'right';
    var yProp = g.position.includes('top') ? 'top' : 'bottom';

    c = document.createElement('div');
    c.id = 'wh-container';
    c.style.cssText = [
      'position:fixed',
      yProp + ':' + (g.offsetY || 20) + 'px',
      xProp + ':' + (g.offsetX || 20) + 'px',
      'z-index:99998',
      'display:flex;flex-direction:column;align-items:flex-end;gap:8px',
      'background:transparent',
    ].join(';');

    document.body.appendChild(c);
    return c;
  }

  // ---- 创建 Webhook 按钮 ----
  function createTriggerButton(cfg) {
    var btn = document.createElement('button');
    btn.setAttribute('data-wh-trigger-id', cfg.id);
    btn.className = 'wh-trigger-btn';
    btn.innerHTML =
      '<i class="' + (cfg.icon || 'fa-solid fa-bell') + '"></i> ' +
      escText(cfg.text || 'Trigger');

    btn.style.cssText = [
      'padding:8px 14px',
      'background:' + (cfg.bgColor || '#1a1a2e'),
      'color:' + (cfg.color || '#fff'),
      'border:none;border-radius:8px;cursor:pointer;font-size:13px',
      'box-shadow:0 2px 6px rgba(0,0,0,0.15)',
      'transition:opacity 0.2s;white-space:nowrap',
    ].join(';');

    return btn;
  }

  // ---- 执行 Webhook ----
  function triggerWebhook(cfg, btn) {
    var wh = cfg.webhook;
    var method = wh.method || 'POST';
    var origHTML = btn.innerHTML;

    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> 触发中...';
    btn.disabled = true;

    var headers = {};
    var hkeys = Object.keys(wh.headers || {});

    for (var i = 0; i < hkeys.length; i++) {
      headers[hkeys[i]] = wh.headers[hkeys[i]];
    }

    if (wh.type === 'github' && wh.githubToken) {
      headers.Authorization = 'Bearer ' + wh.githubToken;
    }

    var reqOpts = {
      method: method,
      url: wh.url,
      headers: headers,

      onload: function (r) {
        if (r.status >= 200 && r.status < 300) {
          btn.innerHTML = '<i class="fa-solid fa-check"></i> 已触发';

          setTimeout(function () {
            btn.innerHTML = origHTML;
            btn.disabled = false;
          }, 3000);
        } else {
          btn.innerHTML =
            '<i class="fa-solid fa-xmark"></i> 失败(' + r.status + ')';
          btn.disabled = false;
        }
      },

      onerror: function () {
        btn.innerHTML =
          '<i class="fa-solid fa-triangle-exclamation"></i> 网络错误';
        btn.disabled = false;
      },

      ontimeout: function () {
        btn.innerHTML = '<i class="fa-solid fa-clock"></i> 超时';
        btn.disabled = false;
      },
    };

    if (method !== 'GET' && method !== 'HEAD' && wh.body) {
      reqOpts.data = wh.body;
    }

    if (wh.timeout) {
      reqOpts.timeout = wh.timeout;
    }

    GM_xmlhttpRequest(reqOpts);
  }

  // ---- 工具箱主面板：悬浮按钮 + 功能宫格 ----
  function refreshUI() {
    var old = getContainer();
    if (old) old.remove();

    var c = ensureContainer();

    c.style.cssText +=
      ';display:flex;flex-direction:column;align-items:flex-end;gap:8px;z-index:99998';

    // 悬浮按钮：只显示工具图标
    var launcher = document.createElement('button');
    launcher.id = 'wt-launcher';
    launcher.type = 'button';
    launcher.innerHTML = '<i class="fa-solid fa-screwdriver-wrench"></i>';
    launcher.title = '网页工具箱';
    launcher.setAttribute('aria-label', '打开网页工具箱');

    launcher.style.cssText = [
      'width:46px;height:46px;border:none;border-radius:50%',
      'background:#2563eb;color:#fff;font-size:20px;cursor:pointer',
      'box-shadow:0 3px 12px rgba(0,0,0,.25)',
      'display:flex;align-items:center;justify-content:center',
    ].join(';');

    // 第一级：功能宫格，默认收起
    var grid = document.createElement('div');
    grid.id = 'wt-grid';

    grid.style.cssText = [
      'display:none',
      'grid-template-columns:repeat(2,minmax(112px,1fr))',
      'gap:8px',
      'width:260px;max-width:calc(100vw - 28px);padding:12px',
      'border-radius:14px;background:rgba(20,25,35,.96);color:#fff',
      'box-shadow:0 4px 20px rgba(0,0,0,.28)',
      'backdrop-filter:blur(8px)',
    ].join(';');

    function gridItem(icon, title, desc, onClick, color) {
      var b = document.createElement('button');
      b.type = 'button';

      b.innerHTML =
        '<i class="' + icon + '" style="font-size:21px;color:' + color + '"></i>' +
        '<strong style="display:block;margin-top:7px;font-size:13px">' +
        title +
        '</strong>' +
        '<small style="display:block;margin-top:3px;color:#aebbd0;font-size:11px">' +
        desc +
        '</small>';

      b.style.cssText = [
        'min-height:86px;padding:10px 6px',
        'border:1px solid rgba(255,255,255,.12)',
        'border-radius:10px;background:rgba(255,255,255,.06)',
        'color:#fff;cursor:pointer;text-align:center',
      ].join(';');

      b.addEventListener('mouseenter', function () {
        b.style.background = 'rgba(255,255,255,.13)';
      });

      b.addEventListener('mouseleave', function () {
        b.style.background = 'rgba(255,255,255,.06)';
      });

      b.addEventListener('click', function () {
        grid.style.display = 'none';
        launcher.innerHTML =
          '<i class="fa-solid fa-screwdriver-wrench"></i>';
        onClick();
      });

      grid.appendChild(b);
    }

    gridItem(
      'fa-solid fa-bolt',
      'Webhook 触发',
      '查看可用触发器',
      openWebhookPanel,
      '#fbbf24'
    );

    gridItem(
      'fa-solid fa-arrows-up-down',
      '随机滚动',
      '启动或调整滚动',
      openScrollPanel,
      '#5eead4'
    );

    gridItem(
      'fa-solid fa-gear',
      'Webhook 设置',
      '管理按钮与请求',
      openConfigPanel,
      '#93c5fd'
    );

    gridItem(
      'fa-solid fa-circle-xmark',
      '关闭面板',
      '收起功能宫格',
      function () {},
      '#cbd5e1'
    );

    launcher.addEventListener('click', function () {
      var expanded = grid.style.display !== 'none';
      grid.style.display = expanded ? 'none' : 'grid';
      launcher.title = expanded ? '打开网页工具箱' : '关闭网页工具箱';
    });

    c.appendChild(grid);
    c.appendChild(launcher);
  }

  // ---- 当前网页匹配到的 Webhook 触发器 ----
  function openWebhookPanel() {
    var old = document.getElementById('wt-webhook-panel');
    if (old) {
      old.remove();
      return;
    }

    var panel = document.createElement('div');
    panel.id = 'wt-webhook-panel';

    panel.style.cssText = [
      'position:fixed;right:76px;bottom:20px;z-index:100001',
      'width:320px;max-width:calc(100vw - 100px);max-height:75vh',
      'overflow:auto;padding:14px;background:#17202d;color:#e5edf7',
      'border:1px solid #40516a;border-radius:12px',
      'box-shadow:0 8px 30px rgba(0,0,0,.35)',
      'font:13px/1.5 -apple-system,BlinkMacSystemFont,sans-serif',
      'box-sizing:border-box',
    ].join(';');

    var head = document.createElement('div');
    head.style.cssText = [
      'display:flex;align-items:center;justify-content:space-between',
      'gap:8px;margin-bottom:12px;font-size:15px',
    ].join(';');

    head.innerHTML =
      '<strong><i class="fa-solid fa-bolt"></i> Webhook 触发</strong>';

    var close = document.createElement('button');
    close.type = 'button';
    close.textContent = '关闭';
    close.style.cssText =
      'border:1px solid #526277;border-radius:6px;padding:5px 8px;' +
      'background:#334155;color:#fff;cursor:pointer';

    close.onclick = function () {
      panel.remove();
    };

    head.appendChild(close);
    panel.appendChild(head);

    var buttons = loadButtons();
    var currentUrl = window.location.href;
    var matched = 0;

    for (var i = 0; i < buttons.length; i++) {
      var cfg = buttons[i];

      if (!cfg.enabled || !matchPattern(currentUrl, cfg.matchPattern)) {
        continue;
      }

      matched++;

      var btn = createTriggerButton(cfg);
      btn.style.cssText +=
        ';width:100%;margin:0 0 8px;text-align:left;box-sizing:border-box';

      btn.addEventListener('click', (function (cfig, bel) {
        return function () {
          triggerWebhook(cfig, bel);
        };
      })(cfg, btn));

      panel.appendChild(btn);
    }

    if (!matched) {
      var empty = document.createElement('div');
      empty.textContent =
        '当前网页没有匹配的 Webhook 按钮。可以在「Webhook 设置」中新增或调整网址匹配规则。';
      empty.style.cssText =
        'padding:14px 4px;color:#aebbd0;text-align:center';
      panel.appendChild(empty);
    }

    document.body.appendChild(panel);
  }

  // ---- 配置面板辅助方法 ----
  function findIconLabel(cls) {
    for (var i = 0; i < FA_ICONS.length; i++) {
      if (FA_ICONS[i].v === cls) return FA_ICONS[i].l;
    }
    return cls || '';
  }

  function positionOptions(sel) {
    var list = [
      { v: 'bottom-right', l: '右下' },
      { v: 'bottom-left', l: '左下' },
      { v: 'top-right', l: '右上' },
      { v: 'top-left', l: '左上' },
    ];

    var html = '';

    for (var i = 0; i < list.length; i++) {
      html +=
        '<option value="' + list[i].v + '"' +
        (sel === list[i].v ? ' selected' : '') +
        '>' + list[i].l + '</option>';
    }

    return html;
  }

  function methodOptions(sel) {
    var list = ['POST', 'GET', 'PUT', 'PATCH', 'DELETE'];
    var html = '';

    for (var i = 0; i < list.length; i++) {
      html +=
        '<option value="' + list[i] + '"' +
        (sel === list[i] ? ' selected' : '') +
        '>' + list[i] + '</option>';
    }

    return html;
  }

  function githubExample() {
    return {
      id: 'example-' + Date.now(),
      name: '示例: GitHub Action',
      enabled: true,
      matchPattern: 'https://www.yuque.com/你的用户名/*',
      icon: 'fa-solid fa-rocket',
      text: '触发 Action',
      color: '#ffffff',
      bgColor: '#24292f',

      webhook: {
        type: 'github',
        method: 'POST',
        url: 'https://api.github.com/repos/你的用户名/仓库名/dispatches',

        headers: {
          Accept: 'application/vnd.github+json',
          'Content-Type': 'application/json',
        },

        body: '{"event_type":"my-event"}',
        githubToken: '',
        githubRepo: '你的用户名/仓库名',
        githubEvent: 'my-event',
        timeout: 10000,
      },
    };
  }

  function blankButton() {
    return {
      id: 'btn-' + Date.now(),
      name: '',
      enabled: true,
      matchPattern: '',
      icon: 'fa-solid fa-bell',
      text: 'Trigger',
      color: '#ffffff',
      bgColor: '#1a1a2e',

      webhook: {
        type: 'default',
        method: 'POST',
        url: '',
        headers: {},
        body: '',
        githubToken: '',
        githubRepo: '',
        githubEvent: '',
        timeout: 10000,
      },
    };
  }

  // ---- 配置卡片 ----
  function buildCard(cfg, idx) {
    var wh = cfg.webhook || {};
    var isGithub = wh.type === 'github';

    return [
      '<div class="wh-card" data-idx="' + idx + '">',
      '  <div class="wh-card-bar">',
      '    <strong class="wh-card-title">' +
        escText(cfg.name || '未命名按钮') +
        '</strong>',
      '    <div>',
      '      <label class="wh-inline"><input type="checkbox" class="cfg-enabled" ' +
        (cfg.enabled ? 'checked' : '') + '> 启用</label>',
      '      <button class="wh-btn-sm wh-btn-danger cfg-remove">删除</button>',
      '    </div>',
      '  </div>',

      // 基本信息
      '  <div class="wh-grid wh-grid-2">',
      '    <label class="wh-label">名称<input class="cfg-name" value="' +
        escAttr(cfg.name) + '" placeholder="按钮名称"></label>',
      '    <label class="wh-label">匹配 URL<input class="cfg-match" value="' +
        escAttr(cfg.matchPattern || '') +
        '" placeholder="https://example.com/*"></label>',
      '  </div>',

      // 外观
      '  <div class="wh-grid wh-grid-3">',
      '    <label class="wh-label">图标<button class="cfg-icon-btn" type="button" data-icon="' +
        (cfg.icon || 'fa-solid fa-bell') + '"><i class="' +
        (cfg.icon || 'fa-solid fa-bell') + '"></i> <span>' +
        findIconLabel(cfg.icon || 'fa-solid fa-bell') +
        '</span> <span style="font-size:10px;margin-left:4px">▾</span></button></label>',
      '    <label class="wh-label">按钮文字<input class="cfg-text" value="' +
        escAttr(cfg.text || '') + '"></label>',
      '    <label class="wh-label">颜色<input class="cfg-color" type="color" value="' +
        (cfg.color || '#ffffff') + '"></label>',
      '  </div>',

      '  <div class="wh-grid wh-grid-2">',
      '    <label class="wh-label">背景色<input class="cfg-bgcolor" type="color" value="' +
        (cfg.bgColor || '#1a1a2e') + '"></label>',
      '  </div>',

      // Webhook
      '  <fieldset class="wh-fs">',
      '    <legend>Webhook</legend>',
      '    <div class="wh-grid wh-grid-3">',
      '      <label class="wh-label">类型<select class="cfg-wh-type">',
      '        <option value="default"' +
        (!isGithub ? ' selected' : '') + '>默认</option>',
      '        <option value="github"' +
        (isGithub ? ' selected' : '') + '>GitHub</option>',
      '      </select></label>',
      '      <label class="wh-label">Method<select class="cfg-wh-method">' +
        methodOptions(wh.method || 'POST') + '</select></label>',
      '      <label class="wh-label">超时(ms)<input class="cfg-wh-timeout" type="number" value="' +
        (wh.timeout || 10000) + '"></label>',
      '    </div>',

      // 默认类型字段
      '    <div class="cfg-default-part" style="' +
        (isGithub ? 'display:none' : '') + '">',
      '      <label class="wh-label">URL<input class="cfg-wh-url" value="' +
        escAttr(wh.url || '') + '"></label>',
      '      <div class="wh-grid wh-grid-2" style="margin-top:8px">',
      '        <label class="wh-label">Headers (JSON)<textarea class="cfg-wh-headers" rows="3">' +
        escText(JSON.stringify(wh.headers || {}, null, 2)) +
        '</textarea></label>',
      '        <label class="wh-label">Body<textarea class="cfg-wh-body" rows="3" placeholder="仅非 GET/HEAD 时发送">' +
        escText(wh.body || '') + '</textarea></label>',
      '      </div>',
      '    </div>',

      // GitHub 类型字段
      '    <div class="cfg-github-part" style="' +
        (isGithub ? '' : 'display:none') + '">',
      '      <label class="wh-label" style="margin-top:8px">GitHub Token<input class="cfg-wh-token" type="password" value="' +
        escAttr(wh.githubToken || '') +
        '" placeholder="ghp_... 或 github_pat_..."></label>',
      '      <details style="font-size:12px;color:#666;margin-top:4px">',
      '        <summary>Token 创建步骤</summary>',
      '        <ol style="margin:4px 0;padding-left:16px">',
      '          <li>打开 <a href="https://github.com/settings/tokens" target="_blank">github.com/settings/tokens</a>，点击 Generate new token</li>',
      '          <li><strong>Fine-grained token</strong>：选仓库 → Repository permissions → Contents → Read and write</li>',
      '          <li><strong>Classic token</strong>：勾选 repo scope</li>',
      '          <li>生成后复制 token，粘贴到上方输入框</li>',
      '        </ol>',
      '      </details>',
      '      <div class="wh-grid wh-grid-2" style="margin-top:8px">',
      '        <label class="wh-label">仓库名称<input class="cfg-gh-repo" value="' +
        escAttr(wh.githubRepo || '') + '" placeholder="用户名/仓库名"></label>',
      '        <label class="wh-label">事件名称<input class="cfg-gh-event" value="' +
        escAttr(wh.githubEvent || '') + '" placeholder="my-event"></label>',
      '      </div>',
      '      <div style="font-size:11px;color:#999;margin-top:4px">URL / Headers / Body 自动生成，无需手动填写</div>',
      '    </div>',
      '  </fieldset>',

      // 测试请求
      '  <button class="wh-btn-sm cfg-test" style="margin-top:8px;background:#f5f5f5;color:#333;border:1px solid #ddd">测试请求</button>',
      '  <pre class="wh-test-result" style="display:none;margin-top:8px;padding:10px;background:#f8f8f8;border:1px solid #e0e0e0;border-radius:4px;font-size:11px;line-height:1.5;white-space:pre-wrap;word-break:break-all;max-height:300px;overflow-y:auto"></pre>',
      '</div>',
    ].join('\n');
  }

  // ---- 构建配置面板 HTML ----
  function buildPanelHTML(buttons, globalCfg) {
    var cards = '';

    for (var i = 0; i < buttons.length; i++) {
      cards += buildCard(buttons[i], i);
    }

    var emptyHint = buttons.length === 0
      ? '<div class="wh-empty"><p>暂无触发按钮，点击下方按钮添加。</p><p style="font-size:12px;color:#999">可添加多个按钮，每个按钮独立配置：匹配域名、图标、文字、颜色、Webhook 地址和参数。</p></div>'
      : '';

    return [
      '<div class="wh-panel">',
      '  <div class="wh-panel-hd">',
      '    <h3>Webhook 触发 - 设置</h3>',
      '    <div>',
      '      <button id="cfg-add-example" class="wh-btn-sm" style="background:#f0f0f0;color:#333;margin-right:8px">插入 GitHub 示例</button>',
      '      <button id="cfg-add-btn" class="wh-btn-sm wh-btn-primary">+ 添加按钮</button>',
      '    </div>',
      '  </div>',

      // 全局设置
      '  <details class="wh-global-cfg" style="margin-bottom:16px;border:1px solid #e0e0e0;border-radius:8px;padding:12px">',
      '    <summary style="cursor:pointer;font-weight:bold;font-size:14px">全局位置设置</summary>',
      '    <div class="wh-grid wh-grid-3" style="margin-top:8px">',
      '      <label class="wh-label">位置<select id="cfg-global-pos">' +
        positionOptions(globalCfg.position || 'bottom-right') + '</select></label>',
      '      <label class="wh-label">水平偏移(px)<input id="cfg-global-ox" type="number" value="' +
        (globalCfg.offsetX || 20) + '"></label>',
      '      <label class="wh-label">垂直偏移(px)<input id="cfg-global-oy" type="number" value="' +
        (globalCfg.offsetY || 20) + '"></label>',
      '    </div>',
      '  </details>',

      '  <div id="wh-cards">' + cards + '</div>',
      emptyHint,
      '  <div class="wh-panel-ft">',
      '    <button id="cfg-save-btn" class="wh-btn wh-btn-primary">保存并刷新</button>',
      '  </div>',
      '</div>',
    ].join('\n');
  }

  // ---- 打开配置面板 ----
  function openConfigPanel() {
    var buttons = loadButtons();
    var globalCfg = loadGlobal();

    removeOverlay();

    var overlay = document.createElement('div');
    overlay.id = 'wh-overlay';
    overlay.innerHTML = buildPanelHTML(buttons, globalCfg);

    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) overlay.remove();
    });

    document.body.appendChild(overlay);
    bindPanel(overlay, buttons);
  }

  function removeOverlay() {
    var el = document.getElementById('wh-overlay');
    if (el) el.remove();
  }

  // ---- 图标选择器 ----
  function openIconPicker(btnEl) {
    var existing = document.querySelector('.wh-icon-picker');
    if (existing) existing.remove();

    var picker = document.createElement('div');
    picker.className = 'wh-icon-picker';

    var gridHTML = '';
    var currentIcon = btnEl.getAttribute('data-icon');

    for (var i = 0; i < FA_ICONS.length; i++) {
      var item = FA_ICONS[i];
      var active = item.v === currentIcon ? ' wh-icon-active' : '';

      gridHTML +=
        '<div class="wh-icon-item' + active +
        '" data-icon="' + item.v +
        '" data-label="' + item.l +
        '" title="' + item.l + '">' +
        '<i class="' + item.v + '"></i><span>' + item.l + '</span></div>';
    }

    picker.innerHTML = gridHTML;

    var rect = btnEl.getBoundingClientRect();
    picker.style.top = rect.bottom + 4 + 'px';
    picker.style.left = rect.left + 'px';

    picker.addEventListener('click', function (e) {
      var item = e.target.closest('.wh-icon-item');
      if (!item) return;

      var iconCls = item.getAttribute('data-icon');
      var iconLabel = item.getAttribute('data-label');

      btnEl.setAttribute('data-icon', iconCls);
      btnEl.innerHTML =
        '<i class="' + iconCls + '"></i> <span>' + iconLabel +
        '</span> <span style="font-size:10px;margin-left:4px">▾</span>';

      picker.remove();
    });

    document.body.appendChild(picker);

    setTimeout(function () {
      document.addEventListener('click', function closePicker(e) {
        if (!picker.parentNode) {
          document.removeEventListener('click', closePicker);
          return;
        }

        if (
          !picker.contains(e.target) &&
          e.target !== btnEl &&
          !btnEl.contains(e.target)
        ) {
          picker.remove();
          document.removeEventListener('click', closePicker);
        }
      });
    }, 0);
  }

  // ---- GitHub Action 请求参数 ----
  function githubDerive(repo, event) {
    return {
      url: repo
        ? 'https://api.github.com/repos/' + repo + '/dispatches'
        : '',

      headers: {
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
      },

      body: event ? JSON.stringify({ event_type: event }) : '',
    };
  }

  // ---- 配置面板事件绑定 ----
  function bindPanel(overlay, buttons) {
    overlay.querySelector('#cfg-add-btn').addEventListener('click', function () {
      buttons.push(blankButton());
      saveButtons(buttons);
      removeOverlay();
      openConfigPanel();
    });

    overlay.querySelector('#cfg-add-example').addEventListener('click', function () {
      buttons.push(githubExample());
      saveButtons(buttons);
      removeOverlay();
      openConfigPanel();
    });

    // 图标选择器
    var iconBtns = overlay.querySelectorAll('.cfg-icon-btn');

    for (var ib = 0; ib < iconBtns.length; ib++) {
      iconBtns[ib].addEventListener('click', function (e) {
        e.preventDefault();
        openIconPicker(this);
      });
    }

    // 类型切换
    overlay.addEventListener('change', function (e) {
      if (!e.target.classList.contains('cfg-wh-type')) return;

      var card = e.target.closest('.wh-card');
      var isGh = e.target.value === 'github';

      card.querySelector('.cfg-default-part').style.display =
        isGh ? 'none' : '';

      card.querySelector('.cfg-github-part').style.display =
        isGh ? '' : 'none';
    });

    // 删除按钮
    var removeBtns = overlay.querySelectorAll('.cfg-remove');

    for (var i = 0; i < removeBtns.length; i++) {
      removeBtns[i].addEventListener('click', function () {
        var idx = parseInt(this.closest('.wh-card').dataset.idx, 10);

        buttons.splice(idx, 1);
        saveButtons(buttons);
        removeOverlay();
        openConfigPanel();
      });
    }

    // 测试请求
    var testBtns = overlay.querySelectorAll('.cfg-test');

    for (var t = 0; t < testBtns.length; t++) {
      testBtns[t].addEventListener('click', function () {
        var card = this.closest('.wh-card');
        var resultEl = card.querySelector('.wh-test-result');
        var whType = card.querySelector('.cfg-wh-type').value;
        var method = card.querySelector('.cfg-wh-method').value;
        var timeoutStr = card.querySelector('.cfg-wh-timeout').value;
        var timeout = parseInt(timeoutStr, 10) || 10000;

        var url, headers, body, token;

        if (whType === 'github') {
          var repo = card.querySelector('.cfg-gh-repo').value.trim();
          var evt = card.querySelector('.cfg-gh-event').value.trim();
          token = card.querySelector('.cfg-wh-token').value.trim();

          var d = githubDerive(repo, evt);
          url = d.url;
          headers = d.headers;
          body = d.body;
        } else {
          url = card.querySelector('.cfg-wh-url').value;

          var headersRaw =
            card.querySelector('.cfg-wh-headers').value.trim();

          try {
            headers = headersRaw ? JSON.parse(headersRaw) : {};
          } catch (e) {
            resultEl.style.display = 'block';
            resultEl.textContent =
              'Headers JSON 解析失败: ' + e.message;
            return;
          }

          body = card.querySelector('.cfg-wh-body').value;
          token = '';
        }

        if (token) {
          headers.Authorization = 'Bearer ' + token;
        }

        resultEl.style.display = 'block';
        resultEl.textContent = '⏳ 发送请求中...';

        var reqInfo =
          '>>> REQUEST\n' +
          'Method: ' + method + '\n' +
          'URL: ' + url + '\n' +
          'Timeout: ' + timeout + 'ms\n' +
          'Headers:\n' + JSON.stringify(headers, null, 2) + '\n' +
          'Body:\n' + (body || '(空)');

        var reqOpts = {
          method: method,
          url: url,
          headers: headers,
          timeout: timeout,

          onload: function (r) {
            var respInfo =
              '\n\n<<< RESPONSE\n' +
              'Status: ' + r.status + ' ' + (r.statusText || '') + '\n' +
              'Response Headers:\n' + (r.responseHeaders || '') + '\n' +
              'Body:\n' + (r.responseText || '(空)');

            resultEl.textContent = reqInfo + respInfo;
          },

          onerror: function (r) {
            resultEl.textContent =
              reqInfo +
              '\n\n<<< RESPONSE\nStatus: 网络错误\n' +
              JSON.stringify(r, null, 2);
          },

          ontimeout: function () {
            resultEl.textContent =
              reqInfo +
              '\n\n<<< RESPONSE\nStatus: 请求超时 (' + timeout + 'ms)';
          },
        };

        if (method !== 'GET' && method !== 'HEAD' && body) {
          reqOpts.data = body;
        }

        GM_xmlhttpRequest(reqOpts);
      });
    }

    // 保存
    overlay.querySelector('#cfg-save-btn').addEventListener('click', function () {
      var cards = overlay.querySelectorAll('.wh-card');
      var newButtons = [];

      try {
        for (var i = 0; i < cards.length; i++) {
          var el = cards[i];
          var whType = el.querySelector('.cfg-wh-type').value;

          var wh = {
            type: whType,
            method: el.querySelector('.cfg-wh-method').value,
            timeout:
              parseInt(el.querySelector('.cfg-wh-timeout').value, 10) ||
              10000,
          };

          if (whType === 'github') {
            wh.githubToken = el.querySelector('.cfg-wh-token').value;
            wh.githubRepo =
              el.querySelector('.cfg-gh-repo').value.trim();
            wh.githubEvent =
              el.querySelector('.cfg-gh-event').value.trim();

            var d = githubDerive(wh.githubRepo, wh.githubEvent);
            wh.url = d.url;
            wh.headers = d.headers;
            wh.body = d.body;
          } else {
            wh.url = el.querySelector('.cfg-wh-url').value;

            var headersRaw =
              el.querySelector('.cfg-wh-headers').value.trim();

            wh.headers = headersRaw ? JSON.parse(headersRaw) : {};
            wh.body = el.querySelector('.cfg-wh-body').value;
            wh.githubToken = '';
            wh.githubRepo = '';
            wh.githubEvent = '';
          }

          newButtons.push({
            id: 'btn-' + Date.now() + '-' + i,
            name: el.querySelector('.cfg-name').value,
            enabled: el.querySelector('.cfg-enabled').checked,
            matchPattern: el.querySelector('.cfg-match').value,
            icon:
              el.querySelector('.cfg-icon-btn').getAttribute('data-icon'),
            text: el.querySelector('.cfg-text').value,
            color: el.querySelector('.cfg-color').value,
            bgColor: el.querySelector('.cfg-bgcolor').value,
            webhook: wh,
          });
        }

        // 全局设置
        var globalCfg = {
          position: overlay.querySelector('#cfg-global-pos').value,
          offsetX:
            parseInt(overlay.querySelector('#cfg-global-ox').value, 10) ||
            20,
          offsetY:
            parseInt(overlay.querySelector('#cfg-global-oy').value, 10) ||
            20,
        };

        saveGlobal(globalCfg);
        saveButtons(newButtons);
      } catch (e) {
        alert('Headers JSON 格式错误，请检查。');
        return;
      }

      location.reload();
    });
  }

  // ---- 随机滚动工具 ----
  var SCROLL_STORAGE = 'web_toolbox_scroll_config_v1';

  // 默认速度较快、停顿较短；可在面板里调整
  var SCROLL_DEFAULTS = {
    minDistance: 220,
    maxDistance: 500,
    minDuration: 250,
    maxDuration: 600,
    minPause: 150,
    maxPause: 500,
    longPauseChance: 8,
    longPauseMin: 1500,
    longPauseMax: 3500,
    bottomAction: 'stop',
    bottomThreshold: 5,
    bottomRetries: 3,
    bottomRetryWait: 800,
    autoStart: false,
  };

  var scrollConfig = loadScrollConfig();
  var scrollRunning = false;
  var scrollTimer = null;
  var scrollFrame = null;
  var scrollRunId = 0;
  var scrollPanel = null;

  function loadScrollConfig() {
    var raw = GM_getValue(SCROLL_STORAGE);

    if (!raw) {
      try { raw = localStorage.getItem(SCROLL_STORAGE); } catch (e) {}
    }

    if (raw) {
      try {
        return Object.assign({}, SCROLL_DEFAULTS, JSON.parse(raw));
      } catch (e) {}
    }

    return Object.assign({}, SCROLL_DEFAULTS);
  }

  function saveScrollConfig() {
    var raw = JSON.stringify(scrollConfig);
    GM_setValue(SCROLL_STORAGE, raw);
    try { localStorage.setItem(SCROLL_STORAGE, raw); } catch (e) {}
  }

  function scrollRandom(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  function scrollSleep(ms, id) {
    return new Promise(function (resolve) {
      scrollTimer = setTimeout(function () {
        scrollTimer = null;
        resolve(scrollRunning && id === scrollRunId);
      }, ms);
    });
  }

  function scrollAtBottom() {
    return window.scrollY + window.innerHeight >=
      document.documentElement.scrollHeight - scrollConfig.bottomThreshold;
  }

  function scrollAnimate(distance, duration, id, toTop) {
    return new Promise(function (resolve) {
      var startY = window.scrollY;
      var maxY = Math.max(
        0,
        document.documentElement.scrollHeight - window.innerHeight
      );

      var targetY = toTop ? 0 : Math.min(startY + distance, maxY);

      if (targetY === startY || id !== scrollRunId) {
        resolve(scrollRunning && id === scrollRunId);
        return;
      }

      var startTime = performance.now();

      function step(now) {
        if (!scrollRunning || id !== scrollRunId) {
          scrollFrame = null;
          resolve(false);
          return;
        }

        var p = Math.min((now - startTime) / duration, 1);
        var eased = p < 0.5
          ? 2 * p * p
          : 1 - Math.pow(-2 * p + 2, 2) / 2;

        window.scrollTo(0, startY + (targetY - startY) * eased);

        if (p < 1) {
          scrollFrame = requestAnimationFrame(step);
        } else {
          scrollFrame = null;
          resolve(true);
        }
      }

      scrollFrame = requestAnimationFrame(step);
    });
  }

  function scrollSetStatus(main, detail) {
    if (!scrollPanel) return;

    var a = scrollPanel.querySelector('#wt-scroll-status');
    var b = scrollPanel.querySelector('#wt-scroll-detail');

    if (a) a.textContent = main;
    if (b) b.textContent = detail || '';

    var start = scrollPanel.querySelector('#wt-scroll-start');
    var stop = scrollPanel.querySelector('#wt-scroll-stop');

    if (start) start.disabled = scrollRunning;
    if (stop) stop.disabled = !scrollRunning;
  }

  function stopScroll() {
    scrollRunning = false;
    scrollRunId++;

    if (scrollTimer !== null) {
      clearTimeout(scrollTimer);
      scrollTimer = null;
    }

    if (scrollFrame !== null) {
      cancelAnimationFrame(scrollFrame);
      scrollFrame = null;
    }

    scrollSetStatus('已停止', '可以随时重新开始');
  }

  // 底部确认：下拉加载的页面加载慢，刚到底时新内容还没撑高页面，
  // 会误判已到底。到底后先重试几次（等待 + 上移再回滚探测），
  // 确认不会再触发加载，才认定真正的底部。
  // 返回 true = 确认到底；false = 加载出了新内容，应继续滚动；
  // null = 滚动已被停止或重启。
  async function confirmBottom(id) {
    var retries = Math.max(0, scrollConfig.bottomRetries || 0);
    var wait = Math.max(100, scrollConfig.bottomRetryWait || 800);

    for (var i = 1; i <= retries; i++) {
      scrollSetStatus(
        '正在确认底部',
        '第 ' + i + '/' + retries + ' 次重试，等待新内容加载…'
      );

      if (!await scrollSleep(wait, id)) return null;

      if (!scrollRunning || id !== scrollRunId) return null;

      // 等待期间页面变高了：还有新内容，继续正常滚动
      if (!scrollAtBottom()) return false;

      // 轻微上移再滚回底部，重新触发滚动事件 / 懒加载监听
      scrollSetStatus(
        '正在确认底部',
        '第 ' + i + '/' + retries + ' 次重试，回滚探测…'
      );

      if (!await scrollAnimate(
        -scrollRandom(40, 120),
        scrollRandom(150, 300),
        id,
        false
      )) return null;

      if (!await scrollSleep(scrollRandom(200, 400), id)) return null;

      if (!await scrollAnimate(
        scrollRandom(80, 180),
        scrollRandom(150, 300),
        id,
        false
      )) return null;

      if (!scrollRunning || id !== scrollRunId) return null;

      // 回滚后页面变高了：不再处于底部，说明触发到了加载
      if (!scrollAtBottom()) return false;
    }

    return true;
  }

  async function runScroll(id) {
    while (scrollRunning && id === scrollRunId) {
      if (scrollAtBottom()) {
        var confirmed = await confirmBottom(id);

        if (confirmed === null) return;

        if (!confirmed) continue;

        if (scrollConfig.bottomAction === 'top') {
          scrollSetStatus('正在返回顶部', '回到顶部后继续滚动');

          var back = await scrollAnimate(
            0,
            scrollRandom(1000, 1800),
            id,
            true
          );

          if (!back) return;
          if (!await scrollSleep(1500, id)) return;
          continue;
        }

        stopScroll();
        scrollSetStatus(
          '已到达底部',
          '重试 ' + (scrollConfig.bottomRetries || 0) +
            ' 次确认无新内容，滚动已自动停止'
        );
        return;
      }

      var distance = scrollRandom(
        scrollConfig.minDistance,
        scrollConfig.maxDistance
      );

      var duration = scrollRandom(
        scrollConfig.minDuration,
        scrollConfig.maxDuration
      );

      scrollSetStatus(
        '滚动中',
        '本次 ' + distance + 'px · ' + duration + 'ms'
      );

      if (!await scrollAnimate(distance, duration, id, false)) return;

      var pause = scrollRandom(
        scrollConfig.minPause,
        scrollConfig.maxPause
      );

      var longPause =
        Math.random() < scrollConfig.longPauseChance / 100;

      if (longPause) {
        pause += scrollRandom(
          scrollConfig.longPauseMin,
          scrollConfig.longPauseMax
        );
      }

      scrollSetStatus(
        longPause ? '随机长停顿' : '普通停顿',
        '等待 ' + (pause / 1000).toFixed(1) + ' 秒'
      );

      if (!await scrollSleep(pause, id)) return;
    }
  }

  function startScroll() {
    if (scrollRunning) return;

    scrollRunning = true;
    scrollRunId++;

    scrollSetStatus('运行中', '准备滚动页面');
    runScroll(scrollRunId);
  }

  function scrollField(key, label, min, max, step) {
    return '<label class="wt-field"><span>' + label +
      '</span><input type="number" data-scroll-key="' + key +
      '" min="' + min + '" max="' + max +
      '" step="' + (step || 1) +
      '" value="' + scrollConfig[key] + '"></label>';
  }

  // ---- 随机滚动面板 ----
  function openScrollPanel() {
    if (scrollPanel) {
      scrollPanel.remove();
      scrollPanel = null;
    }

    scrollPanel = document.createElement('div');
    scrollPanel.id = 'wt-scroll-panel';

    scrollPanel.innerHTML =
      '<div class="wt-scroll-head"><strong>随机滚动设置</strong>' +
      '<button id="wt-scroll-close" type="button">关闭</button></div>' +

      '<div class="wt-scroll-section"><b>滚动参数</b>' +
      scrollField('minDistance', '最小滚动距离（px）', 1, 10000, 10) +
      scrollField('maxDistance', '最大滚动距离（px）', 1, 10000, 10) +
      scrollField('minDuration', '最短滚动时间（ms）', 50, 60000, 100) +
      scrollField('maxDuration', '最长滚动时间（ms）', 50, 60000, 100) +
      '</div>' +

      '<div class="wt-scroll-section"><b>停顿参数</b>' +
      scrollField('minPause', '最短普通停顿（ms）', 0, 600000, 100) +
      scrollField('maxPause', '最长普通停顿（ms）', 0, 600000, 100) +
      scrollField('longPauseChance', '长停顿概率（%）', 0, 100, 1) +
      scrollField('longPauseMin', '最短长停顿（ms）', 0, 600000, 100) +
      scrollField('longPauseMax', '最长长停顿（ms）', 0, 600000, 100) +
      '</div>' +

      '<div class="wt-scroll-section"><b>运行行为</b>' +
      '<label class="wt-field"><span>到底后</span>' +
      '<select data-scroll-key="bottomAction">' +
      '<option value="stop">停止</option>' +
      '<option value="top">回顶部继续</option>' +
      '</select></label>' +
      scrollField('bottomThreshold', '底部判断距离（px）', 0, 500, 1) +
      scrollField('bottomRetries', '底部确认重试次数', 0, 20, 1) +
      scrollField('bottomRetryWait', '底部重试等待（ms）', 100, 60000, 100) +
      '<label class="wt-check"><input type="checkbox" data-scroll-key="autoStart" ' +
      (scrollConfig.autoStart ? 'checked' : '') +
      '> 页面加载后自动开始</label></div>' +

      '<div class="wt-scroll-buttons">' +
      '<button id="wt-scroll-start" type="button">开始</button>' +
      '<button id="wt-scroll-stop" type="button">停止</button>' +
      '<button id="wt-scroll-apply" type="button">应用并保存</button>' +
      '<button id="wt-scroll-reset" type="button">恢复默认</button>' +
      '</div>' +

      '<div class="wt-scroll-status">' +
      '<div id="wt-scroll-status">已停止</div>' +
      '<small id="wt-scroll-detail">设置自动保存在本浏览器</small>' +
      '</div>';

    document.body.appendChild(scrollPanel);

    scrollPanel.querySelector(
      '[data-scroll-key="bottomAction"]'
    ).value = scrollConfig.bottomAction;

    scrollPanel.querySelector('#wt-scroll-close').onclick = function () {
      scrollPanel.remove();
      scrollPanel = null;
    };

    scrollPanel.querySelector('#wt-scroll-start').onclick = startScroll;
    scrollPanel.querySelector('#wt-scroll-stop').onclick = stopScroll;

    scrollPanel.querySelector('#wt-scroll-apply').onclick = function () {
      var next = Object.assign({}, scrollConfig);
      var fields = scrollPanel.querySelectorAll('[data-scroll-key]');

      for (var i = 0; i < fields.length; i++) {
        var el = fields[i];
        var key = el.getAttribute('data-scroll-key');

        if (el.type === 'checkbox') {
          next[key] = el.checked;
        } else if (el.tagName === 'SELECT') {
          next[key] = el.value;
        } else {
          var value = Number(el.value);

          if (
            el.value.trim() === '' ||
            !Number.isFinite(value) ||
            value < Number(el.min) ||
            value > Number(el.max)
          ) {
            alert('参数 ' + key + ' 不合法，请检查输入范围。');
            el.focus();
            return;
          }

          next[key] = Math.round(value);
        }
      }

      var pairs = [
        ['minDistance', 'maxDistance'],
        ['minDuration', 'maxDuration'],
        ['minPause', 'maxPause'],
        ['longPauseMin', 'longPauseMax'],
      ];

      for (var j = 0; j < pairs.length; j++) {
        if (next[pairs[j][0]] > next[pairs[j][1]]) {
          alert(pairs[j][0] + ' 不能大于 ' + pairs[j][1]);
          return;
        }
      }

      scrollConfig = next;
      saveScrollConfig();

      scrollSetStatus(
        '参数已应用',
        '已保存；下一轮滚动使用新参数'
      );
    };

    scrollPanel.querySelector('#wt-scroll-reset').onclick = function () {
      if (!confirm('确定恢复随机滚动的默认参数吗？')) return;

      scrollConfig = Object.assign({}, SCROLL_DEFAULTS);
      saveScrollConfig();

      scrollPanel.remove();
      scrollPanel = null;
      openScrollPanel();
    };

    scrollSetStatus(
      scrollRunning ? '运行中' : '已停止',
      '设置自动保存在本浏览器'
    );
  }

  // ---- 样式 ----
  GM_addStyle([
    '#wt-scroll-panel { position:fixed;top:50%;right:76px;transform:translateY(-50%);z-index:100002;width:330px;max-width:calc(100vw - 24px);max-height:85vh;overflow:auto;padding:14px;background:#17202d;color:#e5edf7;border:1px solid #40516a;border-radius:12px;box-shadow:0 8px 30px rgba(0,0,0,.35);font:13px/1.5 -apple-system,BlinkMacSystemFont,sans-serif;box-sizing:border-box; }',
    '#wt-scroll-panel * { box-sizing:border-box; }',
    '.wt-scroll-head { display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;font-size:15px; }',
    '.wt-scroll-section { padding:10px;margin:9px 0;border:1px solid #35465b;border-radius:8px; }',
    '.wt-scroll-section b { display:block;color:#bfdbfe;margin-bottom:7px; }',
    '.wt-field { display:flex;align-items:center;justify-content:space-between;gap:8px;margin:7px 0; }',
    '.wt-field span { flex:1; }',
    '.wt-field input,.wt-field select { width:112px;min-width:0;padding:6px;border:1px solid #475569;border-radius:6px;background:#0f1722;color:#fff;font:inherit; }',
    '.wt-check { display:flex;gap:8px;align-items:center;margin-top:8px; }',
    '.wt-scroll-buttons { display:flex;flex-wrap:wrap;gap:6px; }',
    '.wt-scroll-buttons button,#wt-scroll-panel button { border:1px solid #526277;border-radius:6px;padding:7px 9px;background:#334155;color:#fff;cursor:pointer;font:inherit; }',
    '#wt-scroll-apply { background:#2563eb!important; }',
    '.wt-scroll-status { padding:9px;margin-top:10px;background:#0f1722;border-radius:7px; }',
    '.wt-scroll-status small { color:#a6b6c9; }',

    '#wh-overlay { position:fixed;top:0;left:0;width:100%;height:100%;z-index:99999;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center; }',
    '.wh-panel { background:#fff;color:#333;border-radius:12px;padding:24px;width:760px;max-width:calc(100vw - 24px);max-height:85vh;overflow-y:auto;box-shadow:0 8px 32px rgba(0,0,0,0.3);font-size:14px;line-height:1.6; }',
    '.wh-panel-hd { display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:16px; }',
    '.wh-panel-hd h3 { margin:0; }',
    '.wh-panel-ft { margin-top:16px;display:flex;justify-content:flex-end; }',
    '.wh-empty { text-align:center;color:#999;padding:32px 0; }',
    '.wh-card { border:1px solid #e0e0e0;border-radius:8px;padding:16px;margin-bottom:16px; }',
    '.wh-card-bar { display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;gap:8px; }',
    '.wh-card-title { font-size:14px; }',
    '.wh-inline { margin-right:12px;font-weight:normal;font-size:13px; }',
    '.wh-grid { display:flex;gap:8px;margin-bottom:8px; }',
    '.wh-grid-2 > * { flex:1;min-width:0; }',
    '.wh-grid-3 > * { flex:1;min-width:0; }',
    '.wh-label { display:flex;flex-direction:column;font-size:12px;color:#666;min-width:0; }',
    '.wh-label input,.wh-label select,.wh-label textarea { margin-top:2px;padding:4px 8px;border:1px solid #ddd;border-radius:4px;font-size:13px;box-sizing:border-box;max-width:100%; }',
    '.wh-label textarea { font-family:monospace;font-size:11px;resize:vertical; }',
    '.wh-fs { border:1px dashed #ddd;border-radius:6px;padding:12px;margin-top:4px;min-width:0; }',
    '.wh-fs legend { font-size:13px;font-weight:bold;padding:0 4px; }',
    '.wh-btn { padding:8px 20px;border:none;border-radius:6px;cursor:pointer;font-size:14px; }',
    '.wh-btn-sm { padding:4px 12px;border:none;border-radius:4px;cursor:pointer;font-size:13px; }',
    '.wh-btn-primary { background:#3498db;color:#fff; }',
    '.wh-btn-danger { background:#e74c3c;color:#fff; }',
    '.cfg-icon-btn { display:flex;align-items:center;gap:4px;width:100%;padding:6px 10px;border:1px solid #ddd;border-radius:4px;background:#fff;cursor:pointer;font-size:13px;text-align:left; }',
    '.cfg-icon-btn i { font-size:14px;width:18px;text-align:center; }',
    '.cfg-icon-btn:hover { border-color:#3498db; }',
    '.wh-icon-picker { position:fixed;z-index:100001;background:#fff;border:1px solid #ddd;border-radius:8px;box-shadow:0 4px 16px rgba(0,0,0,0.15);padding:8px;display:grid;grid-template-columns:repeat(6,1fr);gap:4px;max-height:320px;overflow-y:auto;width:432px;max-width:calc(100vw - 24px); }',
    '.wh-icon-picker .wh-icon-item { display:flex;flex-direction:column;align-items:center;justify-content:center;padding:6px 4px;border-radius:6px;cursor:pointer;font-size:11px;color:#666;text-align:center;gap:2px; }',
    '.wh-icon-picker .wh-icon-item i { font-size:18px;color:#333; }',
    '.wh-icon-picker .wh-icon-item:hover { background:#eef5ff; }',
    '.wh-icon-picker .wh-icon-active { background:#3498db;color:#fff; }',
    '.wh-icon-picker .wh-icon-active i { color:#fff; }',
  ].join('\n'));

  // ---- 启动 ----
  function init() {
    injectFA();
    refreshUI();

    if (scrollConfig.autoStart) {
      startScroll();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
