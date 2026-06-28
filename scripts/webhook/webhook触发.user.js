// ==UserScript==
// @name         Webhook 触发
// @namespace    https://github.com/ahao430/TampermonkeyScript
// @version      2026-06-28
// @description  在任意网站注入可配置的按钮，点击触发 Webhook。通过悬浮设置按钮管理多个按钮，每个按钮独立配置匹配 URL、样式和 Webhook 参数。
// @author       wanghao
// @match        *://*/*
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_addStyle
// @license      MIT
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
    if (!raw) { try { raw = localStorage.getItem(STORAGE_GLOBAL); } catch (e) {} }
    if (raw) { try { return JSON.parse(raw); } catch (e) {} }
    return JSON.parse(JSON.stringify(DEFAULT_GLOBAL));
  }

  function saveGlobal(g) {
    var json = JSON.stringify(g);
    GM_setValue(STORAGE_GLOBAL, json);
    try { localStorage.setItem(STORAGE_GLOBAL, json); } catch (e) {}
  }

  function loadButtons() {
    var raw = GM_getValue(STORAGE_BUTTONS);
    if (!raw) { try { raw = localStorage.getItem(STORAGE_BUTTONS); } catch (e) {} }
    if (raw) { try { return JSON.parse(raw); } catch (e) {} }
    return [];
  }

  function saveButtons(buttons) {
    var json = JSON.stringify(buttons);
    GM_setValue(STORAGE_BUTTONS, json);
    try { localStorage.setItem(STORAGE_BUTTONS, json); } catch (e) {}
  }

  function matchPattern(url, pattern) {
    if (!pattern) return true;
    var escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
    return new RegExp('^' + escaped + '$').test(url);
  }

  function escAttr(s) {
    return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function escText(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // ---- 注入 Font Awesome ----
  function injectFA() {
    if (document.getElementById('wh-fa-css')) return;
    var link = document.createElement('link');
    link.id = 'wh-fa-css';
    link.rel = 'stylesheet';
    link.href = 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css';
    document.head.appendChild(link);
  }

  // ---- 全局容器 + 触发按钮 + 设置按钮 ----
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
      'z-index:9999',
      'display:flex;align-items:center;gap:6px',
      'background:transparent',
    ].join(';');
    document.body.appendChild(c);
    return c;
  }

  function createTriggerButton(cfg) {
    var btn = document.createElement('button');
    btn.setAttribute('data-wh-trigger-id', cfg.id);
    btn.className = 'wh-trigger-btn';
    btn.innerHTML = '<i class="' + (cfg.icon || 'fa-solid fa-bell') + '"></i> ' + escText(cfg.text || 'Trigger');
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
      headers['Authorization'] = 'Bearer ' + wh.githubToken;
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
          btn.innerHTML = '<i class="fa-solid fa-xmark"></i> 失败(' + r.status + ')';
          btn.disabled = false;
        }
      },
      onerror: function () {
        btn.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i> 网络错误';
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

  function refreshUI() {
    var c = getContainer();
    if (c) c.remove();

    c = ensureContainer();

    // 设置按钮
    var settingsBtn = document.createElement('button');
    settingsBtn.id = 'wh-settings-btn';
    settingsBtn.innerHTML = '<i class="fa-solid fa-gear"></i>';
    settingsBtn.title = 'Webhook 设置';
    settingsBtn.style.cssText = [
      'width:36px;height:36px;padding:0;border:none;border-radius:50%',
      'background:rgba(0,0,0,0.45);color:#fff;font-size:16px;line-height:36px',
      'cursor:pointer;box-shadow:0 2px 6px rgba(0,0,0,0.15);flex-shrink:0',
      'transition:background 0.2s,transform 0.2s',
    ].join(';');
    settingsBtn.addEventListener('mouseenter', function () {
      settingsBtn.style.background = 'rgba(0,0,0,0.7)';
      settingsBtn.style.transform = 'scale(1.1)';
    });
    settingsBtn.addEventListener('mouseleave', function () {
      settingsBtn.style.background = 'rgba(0,0,0,0.45)';
      settingsBtn.style.transform = 'scale(1)';
    });
    settingsBtn.addEventListener('click', openConfigPanel);
    c.appendChild(settingsBtn);

    // 触发按钮（插在设置按钮前面）
    var buttons = loadButtons();
    var currentUrl = window.location.href;
    for (var i = 0; i < buttons.length; i++) {
      var cfg = buttons[i];
      if (!cfg.enabled) continue;
      if (!matchPattern(currentUrl, cfg.matchPattern)) continue;
      var btn = createTriggerButton(cfg);
      btn.addEventListener('click', (function (cfig, bel) {
        return function () { triggerWebhook(cfig, bel); };
      })(cfg, btn));
      c.insertBefore(btn, settingsBtn);
    }
  }

  // ---- 配置面板 ----
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
      html += '<option value="' + list[i].v + '"' + (sel === list[i].v ? ' selected' : '') + '>' + list[i].l + '</option>';
    }
    return html;
  }

  function methodOptions(sel) {
    var list = ['POST', 'GET', 'PUT', 'PATCH', 'DELETE'];
    var html = '';
    for (var i = 0; i < list.length; i++) {
      html += '<option value="' + list[i] + '"' + (sel === list[i] ? ' selected' : '') + '>' + list[i] + '</option>';
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

  function buildCard(cfg, idx) {
    var wh = cfg.webhook || {};
    var isGithub = wh.type === 'github';

    return [
      '<div class="wh-card" data-idx="' + idx + '">',
      '  <div class="wh-card-bar">',
      '    <strong class="wh-card-title">' + escText(cfg.name || '未命名按钮') + '</strong>',
      '    <div>',
      '      <label class="wh-inline"><input type="checkbox" class="cfg-enabled" ' + (cfg.enabled ? 'checked' : '') + '> 启用</label>',
      '      <button class="wh-btn-sm wh-btn-danger cfg-remove">删除</button>',
      '    </div>',
      '  </div>',

      // 基本信息
      '  <div class="wh-grid wh-grid-2">',
      '    <label class="wh-label">名称<input class="cfg-name" value="' + escAttr(cfg.name) + '" placeholder="按钮名称"></label>',
      '    <label class="wh-label">匹配 URL<input class="cfg-match" value="' + escAttr(cfg.matchPattern || '') + '" placeholder="https://example.com/*"></label>',
      '  </div>',

      // 外观
      '  <div class="wh-grid wh-grid-3">',
      '    <label class="wh-label">图标<button class="cfg-icon-btn" type="button" data-icon="' + (cfg.icon || 'fa-solid fa-bell') + '"><i class="' + (cfg.icon || 'fa-solid fa-bell') + '"></i> <span>' + findIconLabel(cfg.icon || 'fa-solid fa-bell') + '</span> <span style="font-size:10px;margin-left:4px">▾</span></button></label>',
      '    <label class="wh-label">按钮文字<input class="cfg-text" value="' + escAttr(cfg.text || '') + '"></label>',
      '    <label class="wh-label">颜色<input class="cfg-color" type="color" value="' + (cfg.color || '#ffffff') + '"></label>',
      '  </div>',
      '  <div class="wh-grid wh-grid-2">',
      '    <label class="wh-label">背景色<input class="cfg-bgcolor" type="color" value="' + (cfg.bgColor || '#1a1a2e') + '"></label>',
      '  </div>',

      // Webhook
      '  <fieldset class="wh-fs">',
      '    <legend>Webhook</legend>',
      '    <div class="wh-grid wh-grid-3">',
      '      <label class="wh-label">类型<select class="cfg-wh-type">',
      '        <option value="default"' + (!isGithub ? ' selected' : '') + '>默认</option>',
      '        <option value="github"' + (isGithub ? ' selected' : '') + '>GitHub</option>',
      '      </select></label>',
      '      <label class="wh-label">Method<select class="cfg-wh-method">' + methodOptions(wh.method || 'POST') + '</select></label>',
      '      <label class="wh-label">超时(ms)<input class="cfg-wh-timeout" type="number" value="' + (wh.timeout || 10000) + '"></label>',
      '    </div>',

      // 默认类型的字段
      '    <div class="cfg-default-part" style="' + (isGithub ? 'display:none' : '') + '">',
      '      <label class="wh-label">URL<input class="cfg-wh-url" value="' + escAttr(wh.url || '') + '"></label>',
      '      <div class="wh-grid wh-grid-2" style="margin-top:8px">',
      '        <label class="wh-label">Headers (JSON)<textarea class="cfg-wh-headers" rows="3">' + escText(JSON.stringify(wh.headers || {}, null, 2)) + '</textarea></label>',
      '        <label class="wh-label">Body<textarea class="cfg-wh-body" rows="3" placeholder="仅非 GET/HEAD 时发送">' + escText(wh.body || '') + '</textarea></label>',
      '      </div>',
      '    </div>',

      // GitHub 类型的字段
      '    <div class="cfg-github-part" style="' + (isGithub ? '' : 'display:none') + '">',
      '      <label class="wh-label" style="margin-top:8px">GitHub Token<input class="cfg-wh-token" type="password" value="' + escAttr(wh.githubToken || '') + '" placeholder="ghp_... 或 github_pat_..."></label>',
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
      '        <label class="wh-label">仓库名称<input class="cfg-gh-repo" value="' + escAttr(wh.githubRepo || '') + '" placeholder="用户名/仓库名"></label>',
      '        <label class="wh-label">事件名称<input class="cfg-gh-event" value="' + escAttr(wh.githubEvent || '') + '" placeholder="my-event"></label>',
      '      </div>',
      '      <div style="font-size:11px;color:#999;margin-top:4px">URL / Headers / Body 自动生成，无需手动填写</div>',
      '    </div>',
      '  </fieldset>',

      // 测试
      '  <button class="wh-btn-sm cfg-test" style="margin-top:8px;background:#f5f5f5;color:#333;border:1px solid #ddd">测试请求</button>',
      '  <pre class="wh-test-result" style="display:none;margin-top:8px;padding:10px;background:#f8f8f8;border:1px solid #e0e0e0;border-radius:4px;font-size:11px;line-height:1.5;white-space:pre-wrap;word-break:break-all;max-height:300px;overflow-y:auto"></pre>',
      '</div>',
    ].join('\n');
  }

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
      '      <label class="wh-label">位置<select id="cfg-global-pos">' + positionOptions(globalCfg.position || 'bottom-right') + '</select></label>',
      '      <label class="wh-label">水平偏移(px)<input id="cfg-global-ox" type="number" value="' + (globalCfg.offsetX || 20) + '"></label>',
      '      <label class="wh-label">垂直偏移(px)<input id="cfg-global-oy" type="number" value="' + (globalCfg.offsetY || 20) + '"></label>',
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

  function openIconPicker(btnEl) {
    // 移除已有 picker
    var existing = document.querySelector('.wh-icon-picker');
    if (existing) existing.remove();

    var picker = document.createElement('div');
    picker.className = 'wh-icon-picker';
    var gridHTML = '';
    var currentIcon = btnEl.getAttribute('data-icon');
    for (var i = 0; i < FA_ICONS.length; i++) {
      var item = FA_ICONS[i];
      var active = item.v === currentIcon ? ' wh-icon-active' : '';
      gridHTML += '<div class="wh-icon-item' + active + '" data-icon="' + item.v + '" data-label="' + item.l + '" title="' + item.l + '"><i class="' + item.v + '"></i><span>' + item.l + '</span></div>';
    }
    picker.innerHTML = gridHTML;

    // 定位在按钮下方
    var rect = btnEl.getBoundingClientRect();
    picker.style.top = rect.bottom + 4 + 'px';
    picker.style.left = rect.left + 'px';

    picker.addEventListener('click', function (e) {
      var item = e.target.closest('.wh-icon-item');
      if (!item) return;
      var iconCls = item.getAttribute('data-icon');
      var iconLabel = item.getAttribute('data-label');
      btnEl.setAttribute('data-icon', iconCls);
      btnEl.innerHTML = '<i class="' + iconCls + '"></i> <span>' + iconLabel + '</span> <span style="font-size:10px;margin-left:4px">▾</span>';
      picker.remove();
    });

    document.body.appendChild(picker);

    // 点击外部关闭
    setTimeout(function () {
      document.addEventListener('click', function closePicker(e) {
        if (!picker.parentNode) {
          document.removeEventListener('click', closePicker);
          return;
        }
        if (!picker.contains(e.target) && e.target !== btnEl && !btnEl.contains(e.target)) {
          picker.remove();
          document.removeEventListener('click', closePicker);
        }
      });
    }, 0);
  }

  // 根据 GitHub repo/event 生成 url/headers/body
  function githubDerive(repo, event) {
    return {
      url: repo ? 'https://api.github.com/repos/' + repo + '/dispatches' : '',
      headers: {
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
      },
      body: event ? JSON.stringify({ event_type: event }) : '',
    };
  }

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
      if (e.target.classList.contains('cfg-wh-type')) {
        var card = e.target.closest('.wh-card');
        var isGh = e.target.value === 'github';
        card.querySelector('.cfg-default-part').style.display = isGh ? 'none' : '';
        card.querySelector('.cfg-github-part').style.display = isGh ? '' : 'none';
      }
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

    // 测试按钮
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
          var headersRaw = card.querySelector('.cfg-wh-headers').value.trim();
          try { headers = headersRaw ? JSON.parse(headersRaw) : {}; } catch (e) {
            resultEl.style.display = 'block';
            resultEl.textContent = 'Headers JSON 解析失败: ' + e.message;
            return;
          }
          body = card.querySelector('.cfg-wh-body').value;
          token = '';
        }

        if (token) {
          headers['Authorization'] = 'Bearer ' + token;
        }

        resultEl.style.display = 'block';
        resultEl.textContent = '⏳ 发送请求中...';

        var reqInfo = '>>> REQUEST\n' +
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
            var respInfo = '\n\n<<< RESPONSE\n' +
              'Status: ' + r.status + ' ' + (r.statusText || '') + '\n' +
              'Response Headers:\n' + (r.responseHeaders || '') + '\n' +
              'Body:\n' + (r.responseText || '(空)');
            resultEl.textContent = reqInfo + respInfo;
          },
          onerror: function (r) {
            resultEl.textContent = reqInfo + '\n\n<<< RESPONSE\nStatus: 网络错误\n' + JSON.stringify(r, null, 2);
          },
          ontimeout: function () {
            resultEl.textContent = reqInfo + '\n\n<<< RESPONSE\nStatus: 请求超时 (' + timeout + 'ms)';
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
            timeout: parseInt(el.querySelector('.cfg-wh-timeout').value, 10) || 10000,
          };

          if (whType === 'github') {
            wh.githubToken = el.querySelector('.cfg-wh-token').value;
            wh.githubRepo = el.querySelector('.cfg-gh-repo').value.trim();
            wh.githubEvent = el.querySelector('.cfg-gh-event').value.trim();
            var d = githubDerive(wh.githubRepo, wh.githubEvent);
            wh.url = d.url;
            wh.headers = d.headers;
            wh.body = d.body;
          } else {
            wh.url = el.querySelector('.cfg-wh-url').value;
            var headersRaw = el.querySelector('.cfg-wh-headers').value.trim();
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
            icon: el.querySelector('.cfg-icon-btn').getAttribute('data-icon'),
            text: el.querySelector('.cfg-text').value,
            color: el.querySelector('.cfg-color').value,
            bgColor: el.querySelector('.cfg-bgcolor').value,
            webhook: wh,
          });
        }

        // 全局设置
        var globalCfg = {
          position: overlay.querySelector('#cfg-global-pos').value,
          offsetX: parseInt(overlay.querySelector('#cfg-global-ox').value, 10) || 20,
          offsetY: parseInt(overlay.querySelector('#cfg-global-oy').value, 10) || 20,
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

  // ---- 样式 ----
  GM_addStyle([
    '#wh-overlay { position:fixed;top:0;left:0;width:100%;height:100%;z-index:99999;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center; }',
    '.wh-panel { background:#fff;color:#333;border-radius:12px;padding:24px;width:760px;max-height:85vh;overflow-y:auto;box-shadow:0 8px 32px rgba(0,0,0,0.3);font-size:14px;line-height:1.6; }',
    '.wh-panel-hd { display:flex;justify-content:space-between;align-items:center;margin-bottom:16px; }',
    '.wh-panel-hd h3 { margin:0; }',
    '.wh-panel-ft { margin-top:16px;display:flex;justify-content:flex-end; }',
    '.wh-empty { text-align:center;color:#999;padding:32px 0; }',
    '.wh-card { border:1px solid #e0e0e0;border-radius:8px;padding:16px;margin-bottom:16px; }',
    '.wh-card-bar { display:flex;justify-content:space-between;align-items:center;margin-bottom:12px; }',
    '.wh-card-title { font-size:14px; }',
    '.wh-inline { margin-right:12px;font-weight:normal;font-size:13px; }',
    '.wh-grid { display:flex;gap:8px;margin-bottom:8px; }',
    '.wh-grid-2 > * { flex:1; }',
    '.wh-grid-3 > * { flex:1; }',
    '.wh-label { display:flex;flex-direction:column;font-size:12px;color:#666; }',
    '.wh-label input, .wh-label select, .wh-label textarea { margin-top:2px;padding:4px 8px;border:1px solid #ddd;border-radius:4px;font-size:13px;box-sizing:border-box; }',
    '.wh-label textarea { font-family:monospace;font-size:11px;resize:vertical; }',
    '.wh-fs { border:1px dashed #ddd;border-radius:6px;padding:12px;margin-top:4px; }',
    '.wh-fs legend { font-size:13px;font-weight:bold;padding:0 4px; }',
    '.wh-btn { padding:8px 20px;border:none;border-radius:6px;cursor:pointer;font-size:14px; }',
    '.wh-btn-sm { padding:4px 12px;border:none;border-radius:4px;cursor:pointer;font-size:13px; }',
    '.wh-btn-primary { background:#3498db;color:#fff; }',
    '.wh-btn-danger { background:#e74c3c;color:#fff; }',
    '.cfg-icon-btn { display:flex;align-items:center;gap:4px;width:100%;padding:6px 10px;border:1px solid #ddd;border-radius:4px;background:#fff;cursor:pointer;font-size:13px;text-align:left; }',
    '.cfg-icon-btn i { font-size:14px;width:18px;text-align:center; }',
    '.cfg-icon-btn:hover { border-color:#3498db; }',
    '.wh-icon-picker { position:fixed;z-index:100001;background:#fff;border:1px solid #ddd;border-radius:8px;box-shadow:0 4px 16px rgba(0,0,0,0.15);padding:8px;display:grid;grid-template-columns:repeat(6,1fr);gap:4px;max-height:320px;overflow-y:auto;width:432px; }',
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
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
