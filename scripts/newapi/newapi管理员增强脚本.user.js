// ==UserScript==
// @name         NewAPI 管理员增强脚本
// @namespace    https://github.com/ahao430/TampermonkeyScript
// @version      2026-05-12
// @description  在 NewAPI 控制台增强日志导出、用户批量添加与额度批量修改能力。
// @author       wanghao
// @match        https://agentrouter.org/console/*
// @grant        none
// @license      MIT
// @downloadURL https://update.greasyfork.org/scripts/569980/NewAPI%20%E7%AE%A1%E7%90%86%E5%91%98%E5%A2%9E%E5%BC%BA%E8%84%9A%E6%9C%AC.user.js
// @updateURL https://update.greasyfork.org/scripts/569980/NewAPI%20%E7%AE%A1%E7%90%86%E5%91%98%E5%A2%9E%E5%BC%BA%E8%84%9A%E6%9C%AC.meta.js
// ==/UserScript==

(function () {
  'use strict';

  const MAX_RANGE_DAYS = 31;
  const MAX_EXPORT_ROWS = 10000;
  const API_PAGE_SIZE = 100;
  const BULK_CONCURRENCY = 4;
  const BULK_BATCH_INTERVAL_MS = 1500;
  const BULK_TEMPLATE_SHEET = 'users';
  const USERNAME_MAX = 20;
  const PASSWORD_MIN = 8;
  const PASSWORD_MAX = 20;
  const DISPLAY_NAME_MAX = 20;
  const REMARK_MAX = 255;
  const ROUTES = {
    LOG: '/console/log',
    USER: '/console/user',
  };

  const UI_IDS = {
    toastContainer: 'newapi-admin-enhancer-toast-container',
    exportOverlay: 'newapi-export-overlay',
    bulkOverlay: 'newapi-bulk-user-overlay',
    quotaOverlay: 'newapi-bulk-quota-overlay',
  };

  const SELECTORS = {
    logButton: 'button[data-newapi-export-btn="1"]',
    bulkButton: 'button[data-newapi-bulk-user-btn="1"]',
    bulkQuotaButton: 'button[data-newapi-bulk-quota-btn="1"]',
  };

  const LOG_TYPE_TEXT_TO_VALUE = {
    全部: '0',
    All: '0',
    充值: '1',
    Topup: '1',
    消费: '2',
    管理: '3',
    系统: '4',
    错误: '5',
    Error: '5',
  };

  const LOG_TYPE_VALUE_TO_TEXT = {
    0: '全部',
    1: '充值',
    2: '消费',
    3: '管理',
    4: '系统',
    5: '错误',
  };

  const BULK_COLUMNS = [
    { key: 'username', label: '用户名', aliases: ['username', '用户名', 'user_name'] },
    {
      key: 'display_name',
      label: '显示名称',
      aliases: ['display_name', '显示名称', 'display name', 'displayname'],
    },
    { key: 'password', label: '密码', aliases: ['password', '密码'] },
    { key: 'remark', label: '备注', aliases: ['remark', '备注'] },
  ];

  const QUOTA_MODES = {
    SET: 'set',
    INCREASE: 'increase',
    DECREASE: 'decrease',
  };

  const QUOTA_MODE_OPTIONS = [
    { value: QUOTA_MODES.SET, label: '统一修改为指定额度' },
    { value: QUOTA_MODES.INCREASE, label: '统一增加指定额度' },
    { value: QUOTA_MODES.DECREASE, label: '统一减少指定额度' },
  ];

  const bulkState = {
    rows: [createEmptyBulkRow()],
    group: 'default',
    amount: '0',
    passwordMode: 'manual',
    groupOptions: [],
    loadingGroups: false,
    submitting: false,
    progressText: '请先填写统一设置与用户列表。',
    resultItems: [],
    successCredentials: [],
    validationErrors: [],
    importedFileName: '',
  };

  const bulkQuotaState = {
    group: '',
    mode: QUOTA_MODES.SET,
    value: '',
    limitValue: '',
    submitting: false,
    progressText: '请先选择分组并填写额度变更规则。',
    resultItems: [],
    validationErrors: [],
  };

  let exporting = false;
  let routeWatcherInstalled = false;
  let domObserver = null;
  let lastPathname = location.pathname;

  function createEmptyBulkRow() {
    return {
      id: `row_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      username: '',
      display_name: '',
      password: '',
      remark: '',
    };
  }

  function escapeHTML(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function pad2(n) {
    return String(n).padStart(2, '0');
  }

  function formatTimestamp(ts) {
    if (ts === null || ts === undefined || ts === '') return '';
    const num = Number(ts);
    if (!Number.isFinite(num) || num <= 0) return '';
    const ms = num > 1e12 ? num : num * 1000;
    const date = new Date(ms);
    if (!Number.isFinite(date.getTime())) return '';

    return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(
      date.getDate(),
    )} ${pad2(date.getHours())}:${pad2(date.getMinutes())}:${pad2(
      date.getSeconds(),
    )}`;
  }

  function formatDateTimeForInput(date) {
    return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(
      date.getDate(),
    )} ${pad2(date.getHours())}:${pad2(date.getMinutes())}:${pad2(
      date.getSeconds(),
    )}`;
  }

  function formatCompactTimestamp(tsSeconds) {
    const text = formatTimestamp(tsSeconds);
    return text.replace(/[-: ]/g, '');
  }

  function parseDateTimeToSeconds(value) {
    if (value === null || value === undefined) return NaN;
    const input = String(value).trim();
    if (!input) return NaN;

    if (/^\d{10}$/.test(input)) {
      return Number(input);
    }
    if (/^\d{13}$/.test(input)) {
      return Math.floor(Number(input) / 1000);
    }

    const normalized = input.replace('T', ' ').replace(/-/g, '/');
    const date = new Date(normalized);
    const ms = date.getTime();
    if (!Number.isFinite(ms)) return NaN;
    return Math.floor(ms / 1000);
  }

  function parseJSONSafe(text) {
    if (!text) return null;
    try {
      return JSON.parse(text);
    } catch {
      return null;
    }
  }

  function parseOther(other) {
    if (!other) return {};
    if (typeof other === 'object') return other;
    const parsed = parseJSONSafe(other);
    return parsed && typeof parsed === 'object' ? parsed : {};
  }

  function getGroupValue(record) {
    if (record.group) return record.group;
    return parseOther(record.other).group || '';
  }

  function getRetryValue(record, other) {
    if (!(record.type === 2 || record.type === 5)) {
      return '';
    }

    const useChannel = other?.admin_info?.use_channel;
    if (Array.isArray(useChannel) && useChannel.length > 0) {
      return `渠道：${useChannel.join('->')}`;
    }

    if (record.channel !== null && record.channel !== undefined && record.channel !== '') {
      return `渠道：${record.channel}`;
    }

    return '';
  }

  function valueToCell(value) {
    if (value === null || value === undefined) return '';
    if (typeof value === 'number' || typeof value === 'boolean') return value;
    if (typeof value === 'object') {
      try {
        return JSON.stringify(value);
      } catch {
        return String(value);
      }
    }
    return String(value);
  }

  function buildRequestConversionText(other) {
    const chain = Array.isArray(other?.request_conversion)
      ? other.request_conversion.filter(Boolean)
      : [];
    if (chain.length <= 1) return '原生格式';
    return chain.join(' -> ');
  }

  function buildBillingModeText(other) {
    return other?.admin_info?.local_count_tokens ? '本地计费' : '上游返回';
  }

  function buildErrorInfoText(other) {
    return [other?.error_type, other?.error_code, other?.status_code]
      .filter((v) => v !== undefined && v !== null && String(v) !== '')
      .join(' / ');
  }

  function toNumberOrNull(value) {
    const num = Number(value);
    return Number.isFinite(num) ? num : null;
  }

  function formatUseTimeAndFirstTokenTag(record, other) {
    if (!(record.type === 2 || record.type === 5)) {
      return '';
    }

    const useTimeNum = toNumberOrNull(record.use_time);
    const useTimeText = useTimeNum === null ? '' : `${useTimeNum} s`;

    if (record.is_stream) {
      const frtNum = toNumberOrNull(other?.frt);
      const frtText = frtNum === null ? '' : `${(frtNum / 1000).toFixed(1)} s`;
      if (useTimeText && frtText) return `${useTimeText} | ${frtText} | 流`;
      if (useTimeText) return `${useTimeText} | 流`;
      if (frtText) return `${frtText} | 流`;
      return '流';
    }

    return useTimeText ? `${useTimeText} | 非流` : '非流';
  }

  function buildChannelInfo(record, other) {
    if (!(record.type === 0 || record.type === 2)) {
      return '';
    }

    const channel = record.channel ?? '';
    const channelName = record.channel_name || other?.channel_name || '[未知]';
    if (channel === '' && !channelName) return '';
    return `${channel} - ${channelName}`;
  }

  function buildLogDetailText(record, other) {
    if (record.type !== 2) {
      return '';
    }
    const modelRatio = other?.model_ratio;
    const cacheRatio = other?.cache_ratio ?? 1;
    const completionRatio = other?.completion_ratio;
    const groupRatio = other?.group_ratio;
    const userGroupRatio = other?.user_group_ratio;

    if (
      modelRatio !== undefined ||
      completionRatio !== undefined ||
      groupRatio !== undefined ||
      userGroupRatio !== undefined
    ) {
      const parts = [];
      if (modelRatio !== undefined) parts.push(`模型倍率 ${modelRatio}`);
      if (cacheRatio !== undefined) parts.push(`缓存倍率 ${cacheRatio}`);
      if (completionRatio !== undefined) parts.push(`输出倍率 ${completionRatio}`);
      if (userGroupRatio !== undefined && userGroupRatio !== -1) {
        parts.push(`用户分组倍率 ${userGroupRatio}`);
      } else if (groupRatio !== undefined) {
        parts.push(`分组倍率 ${groupRatio}`);
      }
      return parts.join('，');
    }

    return '';
  }

  function buildBillingProcessText(record, other) {
    if (record.type !== 2) {
      return '';
    }

    if (other?.error_code || other?.error_type) {
      const err = buildErrorInfoText(other);
      return err ? `请求失败，无有效计费。${err}` : '请求失败，无有效计费。';
    }

    const modelRatio = Number(other?.model_ratio ?? 0);
    const completionRatio = Number(other?.completion_ratio ?? 0);
    const cacheRatio = Number(other?.cache_ratio ?? 1);
    const groupRatio =
      other?.user_group_ratio !== undefined && other?.user_group_ratio !== -1
        ? Number(other.user_group_ratio || 1)
        : Number(other?.group_ratio ?? 1);

    const promptTokens = Number(record.prompt_tokens ?? 0);
    const completionTokens = Number(record.completion_tokens ?? 0);
    const cacheTokens = Number(other?.cache_tokens ?? 0);
    const quota = Number(record.quota ?? 0);

    const inputUnit = (modelRatio * 2).toFixed(6);
    const outputUnit = (modelRatio * 2 * completionRatio).toFixed(6);
    const cacheUnit = (modelRatio * 2 * cacheRatio).toFixed(6);

    const parts = [
      `输入价格：¥${inputUnit} / 1M tokens`,
      `输出价格：¥${(modelRatio * 2).toFixed(6)} * ${completionRatio} = ¥${outputUnit} / 1M tokens (补全倍率: ${completionRatio})`,
    ];

    if (cacheTokens > 0) {
      parts.push(
        `缓存价格：¥${(modelRatio * 2).toFixed(6)} * ${cacheRatio} = ¥${cacheUnit} / 1M tokens (缓存倍率: ${cacheRatio})`,
      );
    }

    const detailExpr = cacheTokens > 0
      ? `(输入 ${promptTokens - cacheTokens} tokens / 1M tokens * ¥${inputUnit} + 缓存 ${cacheTokens} tokens / 1M tokens * ¥${cacheUnit} + 输出 ${completionTokens} tokens / 1M tokens * ¥${outputUnit}) * 分组倍率 ${groupRatio}`
      : `(输入 ${promptTokens} tokens / 1M tokens * ¥${inputUnit} + 输出 ${completionTokens} tokens / 1M tokens * ¥${outputUnit}) * 分组倍率 ${groupRatio}`;

    parts.push(`${detailExpr} = ¥${(quota / 500000).toFixed(6)}`);
    parts.push('仅供参考，以实际扣费为准');

    return parts.join('\n');
  }

  function renderNumber(num) {
    if (num >= 1000000000) {
      return `${(num / 1000000000).toFixed(1)}B`;
    }
    if (num >= 1000000) {
      return `${(num / 1000000).toFixed(1)}M`;
    }
    if (num >= 10000) {
      return `${(num / 1000).toFixed(1)}k`;
    }
    return num;
  }

  function parseStatusConfig() {
    const raw = localStorage.getItem('status');
    const parsed = parseJSONSafe(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  }

  function getQuotaDisplayType() {
    return localStorage.getItem('quota_display_type') || 'USD';
  }

  function getQuotaPerUnit() {
    const raw = Number(localStorage.getItem('quota_per_unit'));
    return Number.isFinite(raw) && raw > 0 ? raw : 500000;
  }

  function formatCostQuota(quota, digits = 6) {
    const displayType = getQuotaDisplayType();
    const quotaNum = Number(quota ?? 0);

    if (displayType === 'TOKENS') {
      return String(renderNumber(quotaNum));
    }

    const resultUSD = quotaNum / getQuotaPerUnit();
    let symbol = '$';
    let value = resultUSD;

    if (displayType === 'CNY') {
      const status = parseStatusConfig();
      const usdRate = Number(status?.usd_exchange_rate);
      value = resultUSD * (Number.isFinite(usdRate) && usdRate > 0 ? usdRate : 1);
      symbol = '¥';
    } else if (displayType === 'CUSTOM') {
      const status = parseStatusConfig();
      const customRate = Number(status?.custom_currency_exchange_rate);
      value = resultUSD * (Number.isFinite(customRate) && customRate > 0 ? customRate : 1);
      symbol = status?.custom_currency_symbol || '¤';
    }

    const fixed = value.toFixed(digits);
    if (parseFloat(fixed) === 0 && quotaNum > 0 && value > 0) {
      const minValue = Math.pow(10, -digits);
      return `${symbol}${minValue.toFixed(digits)}`;
    }

    return `${symbol}${fixed}`;
  }

  function getPromptValue(record) {
    return record.type === 0 || record.type === 2 || record.type === 5
      ? (record.prompt_tokens ?? '')
      : '';
  }

  function getCompletionValue(record) {
    if (!(record.type === 0 || record.type === 2 || record.type === 5)) {
      return '';
    }

    const completion = Number(record.completion_tokens ?? 0);
    return completion > 0 ? completion : '';
  }

  function getCostValue(record) {
    return record.type === 0 || record.type === 2 || record.type === 5
      ? formatCostQuota(record.quota, 6)
      : '';
  }

  function getIpValue(record) {
    return record.type === 2 || record.type === 5 ? (record.ip ?? '') : '';
  }

  function getCacheTokensValue(other) {
    return other?.cache_tokens > 0 ? other.cache_tokens : '';
  }

  function getRequestConversionValue(record, other) {
    return record.type === 2 || record.type === 5 ? buildRequestConversionText(other) : '';
  }

  function getBillingModeValue(record, other) {
    return record.type === 2 || record.type === 5 ? buildBillingModeText(other) : '';
  }

  function getErrorInfoValue(record, other) {
    return record.type === 5 ? buildErrorInfoText(other) : '';
  }

  const FIXED_COLUMNS = [
    { title: '时间', getter: (r) => formatTimestamp(r.created_at) },
    { title: '渠道', getter: (r) => r.channel ?? '' },
    { title: '用户', getter: (r) => r.username ?? '' },
    { title: '令牌', getter: (r) => r.token_name ?? '' },
    { title: '分组', getter: (r) => getGroupValue(r) },
    { title: '类型', getter: (r) => LOG_TYPE_VALUE_TO_TEXT[String(r.type)] || String(r.type ?? '') },
    { title: '模型', getter: (r) => r.model_name ?? '' },
    { title: '用时/首字', getter: (r, o) => formatUseTimeAndFirstTokenTag(r, o) },
    { title: '输入', getter: (r) => getPromptValue(r) },
    { title: '输出', getter: (r) => getCompletionValue(r) },
    { title: '花费', getter: (r) => getCostValue(r) },
    { title: 'IP', getter: (r) => getIpValue(r) },
    { title: '重试', getter: (r, o) => getRetryValue(r, o) },
    { title: '详情(content)', getter: (r) => r.content ?? '' },
    { title: '渠道信息', getter: (r, o) => buildChannelInfo(r, o) },
    { title: '缓存 Tokens', getter: (_, o) => getCacheTokensValue(o) },
    { title: '日志详情', getter: (r, o) => buildLogDetailText(r, o) },
    { title: '计费过程', getter: (r, o) => buildBillingProcessText(r, o) },
    { title: '请求路径', getter: (_, o) => o?.request_path || '' },
    { title: '请求转换', getter: (r, o) => getRequestConversionValue(r, o) },
    { title: '计费模式', getter: (r, o) => getBillingModeValue(r, o) },
    { title: '错误信息', getter: (r, o) => getErrorInfoValue(r, o) },
  ];

  function getUserInfoFromLocalStorage() {
    const raw = localStorage.getItem('user');
    const parsed = parseJSONSafe(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  }

  function getUserIdFromLocalStorage() {
    const user = getUserInfoFromLocalStorage();
    if (!user) return '';
    const id = user.id;
    if (id === null || id === undefined || id === '') return '';
    return String(id);
  }

  function getUserRoleFromLocalStorage() {
    const user = getUserInfoFromLocalStorage();
    const role = Number(user?.role);
    return Number.isFinite(role) ? role : 1;
  }

  function isAdminRole(role) {
    return role >= 10;
  }

  function canUseBulkUserFeature(role) {
    return role === 10 || role === 100;
  }

  function buildExportTable(records) {
    const headers = FIXED_COLUMNS.map((col) => col.title);
    const rows = records.map((record) => {
      const other = parseOther(record.other);
      return FIXED_COLUMNS.map((col) => valueToCell(col.getter(record, other)));
    });
    return { headers, rows };
  }

  function csvEscape(value) {
    const s = value == null ? '' : String(value);
    if (/[",\r\n]/.test(s)) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  }

  function triggerDownload(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  }

  function downloadCSV(filename, headers, rows) {
    const lines = [headers.map(csvEscape).join(',')];
    for (const row of rows) {
      lines.push(row.map(csvEscape).join(','));
    }
    const content = `\uFEFF${lines.join('\r\n')}`;
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
    triggerDownload(blob, filename);
  }

  function loadScript(url) {
    return new Promise((resolve, reject) => {
      const existing = document.querySelector(`script[data-newapi-src="${url}"]`);
      if (existing) {
        if (window.XLSX) {
          resolve();
          return;
        }
        existing.addEventListener('load', () => resolve(), { once: true });
        existing.addEventListener(
          'error',
          () => reject(new Error(`脚本加载失败: ${url}`)),
          { once: true },
        );
        return;
      }

      const script = document.createElement('script');
      script.src = url;
      script.async = true;
      script.setAttribute('data-newapi-src', url);
      script.onload = () => resolve();
      script.onerror = () => reject(new Error(`脚本加载失败: ${url}`));
      document.head.appendChild(script);
    });
  }

  async function ensureXLSX() {
    if (window.XLSX) return window.XLSX;

    const cdnList = [
      'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js',
      'https://unpkg.com/xlsx@0.18.5/dist/xlsx.full.min.js',
    ];

    let lastError = null;
    for (const url of cdnList) {
      try {
        await loadScript(url);
        if (window.XLSX) return window.XLSX;
      } catch (error) {
        lastError = error;
      }
    }

    throw lastError || new Error('XLSX 库加载失败，请改用 CSV');
  }

  async function downloadXLSX(filename, headers, rows, sheetName = 'logs') {
    const XLSX = await ensureXLSX();
    const sheet = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, sheet, sheetName);
    const arrayBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([arrayBuffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    triggerDownload(blob, filename);
  }

  function downloadJSON(filename, records) {
    const content = JSON.stringify(records, null, 2);
    const blob = new Blob([content], {
      type: 'application/json;charset=utf-8',
    });
    triggerDownload(blob, filename);
  }

  function showToast(message, type = 'info', duration = 3500) {
    const colors = {
      info: '#3b82f6',
      success: '#16a34a',
      warning: '#d97706',
      error: '#dc2626',
    };

    let container = document.getElementById(UI_IDS.toastContainer);
    if (!container) {
      container = document.createElement('div');
      container.id = UI_IDS.toastContainer;
      container.style.cssText = [
        'position: fixed',
        'top: 20px',
        'right: 20px',
        'z-index: 1000000',
        'display: flex',
        'flex-direction: column',
        'gap: 8px',
      ].join(';');
      document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.style.cssText = [
      'min-width: 220px',
      'max-width: 460px',
      'padding: 10px 12px',
      'border-radius: 8px',
      'background: #ffffff',
      `border-left: 4px solid ${colors[type] || colors.info}`,
      'box-shadow: 0 8px 24px rgba(0,0,0,.12)',
      'font-size: 13px',
      'color: #1f2937',
      'word-break: break-word',
      'white-space: pre-wrap',
    ].join(';');
    toast.textContent = message;

    container.appendChild(toast);
    setTimeout(() => {
      toast.remove();
      if (container && container.childElementCount === 0) {
        container.remove();
      }
    }, duration);
  }

  function mapLogTypeTextToValue(text) {
    if (!text) return '0';
    const raw = String(text).trim();
    if (raw in LOG_TYPE_TEXT_TO_VALUE) return LOG_TYPE_TEXT_TO_VALUE[raw];
    if (/^\d+$/.test(raw) && LOG_TYPE_VALUE_TO_TEXT[raw] !== undefined) return raw;
    return '0';
  }

  function getDateRangeInputValues() {
    const rangeInputs = Array.from(
      document.querySelectorAll('.semi-datepicker-range-input input'),
    );
    if (rangeInputs.length >= 2) {
      return {
        startTime: rangeInputs[0].value?.trim() || '',
        endTime: rangeInputs[1].value?.trim() || '',
      };
    }

    return {
      startTime: document.querySelector('input[placeholder="开始时间"]')?.value || '',
      endTime: document.querySelector('input[placeholder="结束时间"]')?.value || '',
    };
  }

  function readCurrentFilters() {
    const startDefault = new Date();
    startDefault.setHours(0, 0, 0, 0);

    const logTypeText =
      document.querySelector('#logType .semi-select-selection-text')?.textContent?.trim() ||
      '全部';
    const dateRange = getDateRangeInputValues();

    return {
      startTime: dateRange.startTime || formatDateTimeForInput(startDefault),
      endTime: dateRange.endTime || formatDateTimeForInput(new Date()),
      username: document.getElementById('username')?.value || '',
      token_name: document.getElementById('token_name')?.value || '',
      model_name: document.getElementById('model_name')?.value || '',
      group: document.getElementById('group')?.value || '',
      channel: document.getElementById('channel')?.value || '',
      type: mapLogTypeTextToValue(logTypeText),
      format: 'csv',
    };
  }

  function validateExportConfig(config) {
    if (!config.startTime || !config.endTime) {
      return { ok: false, message: '开始时间和结束时间不能为空' };
    }

    const startTs = parseDateTimeToSeconds(config.startTime);
    const endTs = parseDateTimeToSeconds(config.endTime);

    if (!Number.isFinite(startTs) || !Number.isFinite(endTs)) {
      return {
        ok: false,
        message: '时间格式错误，请使用 YYYY-MM-DD HH:mm:ss 或 Unix 时间戳',
      };
    }

    if (endTs < startTs) {
      return { ok: false, message: '结束时间不能早于开始时间' };
    }

    if (endTs - startTs > MAX_RANGE_DAYS * 24 * 60 * 60) {
      return {
        ok: false,
        message: `导出时间范围不能超过 ${MAX_RANGE_DAYS} 天`,
      };
    }

    return { ok: true, startTs, endTs };
  }

  function buildApiURL(params, page, isAdminUser) {
    const query = new URLSearchParams({
      p: String(page),
      page_size: String(API_PAGE_SIZE),
      type: String(params.type || 0),
      token_name: params.token_name || '',
      model_name: params.model_name || '',
      start_timestamp: String(params.start_timestamp),
      end_timestamp: String(params.end_timestamp),
      group: params.group || '',
    });

    if (isAdminUser) {
      query.set('username', params.username || '');
      query.set('channel', params.channel || '');
      return `/api/log/?${query.toString()}`;
    }

    return `/api/log/self/?${query.toString()}`;
  }

  function buildRequestHeaders() {
    const headers = {
      Accept: 'application/json, text/plain, */*',
      'Content-Type': 'application/json',
    };

    const userId = getUserIdFromLocalStorage();
    if (userId) {
      headers['new-api-user'] = userId;
    }

    return headers;
  }

  async function apiRequest(url, options = {}) {
    const response = await fetch(url, {
      credentials: 'include',
      cache: 'no-store',
      headers: {
        ...buildRequestHeaders(),
        ...(options.headers || {}),
      },
      ...options,
    });

    if (!response.ok) {
      throw new Error(`请求失败：HTTP ${response.status}`);
    }

    let payload;
    try {
      payload = await response.json();
    } catch {
      throw new Error('接口返回不是 JSON，可能登录已失效');
    }

    if (!payload || payload.success !== true) {
      throw new Error(payload?.message || '接口返回失败');
    }

    return payload;
  }

  async function fetchAllLogs(params, isAdminUser, onProgress) {
    const rows = [];
    let page = 1;
    let total = 0;
    let truncated = false;

    while (rows.length < MAX_EXPORT_ROWS) {
      const url = buildApiURL(params, page, isAdminUser);
      let payload;
      try {
        payload = await apiRequest(url, { method: 'GET' });
      } catch (error) {
        throw new Error(`第 ${page} 页请求失败：${error.message || error}`);
      }

      const data = payload.data || {};
      const items = Array.isArray(data.items) ? data.items : [];
      const incomingTotal = Number(data.total);
      if (Number.isFinite(incomingTotal) && incomingTotal >= 0) {
        total = incomingTotal;
      }

      rows.push(...items);

      if (typeof onProgress === 'function') {
        onProgress({
          page,
          fetched: Math.min(rows.length, MAX_EXPORT_ROWS),
          total,
        });
      }

      if (rows.length >= MAX_EXPORT_ROWS) {
        truncated = true;
        break;
      }

      if (items.length === 0) {
        break;
      }

      const currentPage = Number(data.page || page);
      const currentPageSize = Number(data.page_size || API_PAGE_SIZE);
      if (
        Number.isFinite(total) &&
        total > 0 &&
        currentPage * currentPageSize >= total
      ) {
        break;
      }

      page += 1;
    }

    return {
      rows: rows.slice(0, MAX_EXPORT_ROWS),
      truncated,
      total,
    };
  }

  function buildFileName(config, startTs, endTs) {
    const format = ['xlsx', 'json'].includes(config.format) ? config.format : 'csv';
    const startText = formatCompactTimestamp(startTs);
    const endText = formatCompactTimestamp(endTs);
    return `usage_logs_${startText}_${endText}_${Date.now()}.${format}`;
  }

  function getField(overlay, key) {
    return overlay.querySelector(`[data-field="${key}"]`);
  }

  function getFormConfig(overlay) {
    return {
      startTime: getField(overlay, 'startTime').value.trim(),
      endTime: getField(overlay, 'endTime').value.trim(),
      username: getField(overlay, 'username').value.trim(),
      token_name: getField(overlay, 'token_name').value.trim(),
      model_name: getField(overlay, 'model_name').value.trim(),
      group: getField(overlay, 'group').value.trim(),
      channel: getField(overlay, 'channel').value.trim(),
      type: getField(overlay, 'type').value,
      format: getField(overlay, 'format').value,
    };
  }

  function setStatus(overlay, message, type = 'info') {
    const el = overlay.querySelector('[data-role="status"]');
    if (!el) return;

    const colors = {
      info: '#2563eb',
      success: '#16a34a',
      warning: '#d97706',
      error: '#dc2626',
    };

    el.style.color = colors[type] || colors.info;
    el.textContent = message;
  }

  async function runExport(config, overlay) {
    const validation = validateExportConfig(config);
    if (!validation.ok) {
      setStatus(overlay, validation.message, 'error');
      showToast(validation.message, 'error');
      return;
    }

    const role = getUserRoleFromLocalStorage();
    const isAdminUser = isAdminRole(role);

    const userId = getUserIdFromLocalStorage();
    if (!userId) {
      showToast(
        '未从 localStorage.user 读取到用户ID，请确认登录状态；将继续尝试导出。',
        'warning',
      );
    }

    const normalizedConfig = {
      ...config,
      username: isAdminUser ? config.username : '',
      channel: isAdminUser ? config.channel : '',
    };

    const params = {
      type: normalizedConfig.type || '0',
      username: normalizedConfig.username,
      token_name: normalizedConfig.token_name,
      model_name: normalizedConfig.model_name,
      start_timestamp: validation.startTs,
      end_timestamp: validation.endTs,
      channel: normalizedConfig.channel,
      group: normalizedConfig.group,
    };

    setStatus(overlay, '开始请求数据...', 'info');

    const { rows, truncated, total } = await fetchAllLogs(params, isAdminUser, (progress) => {
      const totalText =
        Number.isFinite(progress.total) && progress.total > 0
          ? ` / ${progress.total}`
          : '';
      setStatus(
        overlay,
        `正在请求第 ${progress.page} 页，已获取 ${progress.fetched}${totalText} 条...`,
        'info',
      );
    });

    if (!rows.length) {
      const msg = '无可导出数据';
      setStatus(overlay, msg, 'warning');
      showToast(msg, 'warning');
      return;
    }

    const filename = buildFileName(config, validation.startTs, validation.endTs);

    setStatus(overlay, `正在生成 ${config.format.toUpperCase()} 文件...`, 'info');

    if (config.format === 'json') {
      downloadJSON(filename, rows);
    } else {
      const table = buildExportTable(rows);
      if (config.format === 'xlsx') {
        await downloadXLSX(filename, table.headers, table.rows);
      } else {
        downloadCSV(filename, table.headers, table.rows);
      }
    }

    const totalText = Number.isFinite(total) && total > 0 ? `（总计约 ${total} 条）` : '';
    const suffix = truncated ? `，已截断至 ${MAX_EXPORT_ROWS} 条` : '';
    const successMsg = `导出完成：${rows.length} 条${suffix}${totalText}`;
    setStatus(overlay, successMsg, 'success');
    showToast(successMsg, 'success');
  }

  function openExportModal() {
    const existing = document.querySelector(`[data-${UI_IDS.exportOverlay}="1"]`);
    if (existing) {
      existing.remove();
    }

    const defaults = readCurrentFilters();
    const role = getUserRoleFromLocalStorage();
    const isAdminUser = isAdminRole(role);

    const overlay = document.createElement('div');
    overlay.setAttribute(`data-${UI_IDS.exportOverlay}`, '1');
    overlay.style.cssText = [
      'position: fixed',
      'inset: 0',
      'background: rgba(0,0,0,.35)',
      'z-index: 999999',
      'display: flex',
      'align-items: center',
      'justify-content: center',
      'padding: 16px',
    ].join(';');

    overlay.innerHTML = `
      <div data-role="dialog" style="width:min(880px,96vw);max-height:92vh;overflow:auto;background:#fff;border-radius:12px;padding:16px 16px 14px;box-shadow:0 20px 45px rgba(0,0,0,.2);font-size:14px;color:#111827;">
        <div style="font-size:16px;font-weight:600;margin-bottom:8px;">导出使用日志</div>
        <div style="font-size:12px;line-height:1.6;color:#6b7280;background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:8px 10px;margin-bottom:12px;">
          说明：
          1) 导出会忽略页面分页设置，按筛选条件自动请求全部分页数据；
          2) 日期范围最多 ${MAX_RANGE_DAYS} 天；
          3) 最多请求并导出 ${MAX_EXPORT_ROWS} 条（超出自动截断并提示）。
        </div>

        <div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;">
          <label style="display:flex;flex-direction:column;gap:4px;">
            <span>开始时间</span>
            <input data-field="startTime" type="text" placeholder="YYYY-MM-DD HH:mm:ss 或秒时间戳" style="height:32px;padding:0 10px;border:1px solid #d1d5db;border-radius:6px;" />
          </label>

          <label style="display:flex;flex-direction:column;gap:4px;">
            <span>结束时间</span>
            <input data-field="endTime" type="text" placeholder="YYYY-MM-DD HH:mm:ss 或秒时间戳" style="height:32px;padding:0 10px;border:1px solid #d1d5db;border-radius:6px;" />
          </label>

          <label style="display:flex;flex-direction:column;gap:4px;${isAdminUser ? '' : 'display:none;'}">
            <span>用户名</span>
            <input data-field="username" type="text" placeholder="username" style="height:32px;padding:0 10px;border:1px solid #d1d5db;border-radius:6px;" ${isAdminUser ? '' : 'disabled'} />
          </label>

          <label style="display:flex;flex-direction:column;gap:4px;">
            <span>令牌名称</span>
            <input data-field="token_name" type="text" placeholder="token_name" style="height:32px;padding:0 10px;border:1px solid #d1d5db;border-radius:6px;" />
          </label>

          <label style="display:flex;flex-direction:column;gap:4px;">
            <span>模型名称</span>
            <input data-field="model_name" type="text" placeholder="model_name" style="height:32px;padding:0 10px;border:1px solid #d1d5db;border-radius:6px;" />
          </label>

          <label style="display:flex;flex-direction:column;gap:4px;">
            <span>分组</span>
            <select data-field="group" data-role="group-options" data-allow-empty="1" data-current-value="${escapeHTML(defaults.group || '')}" style="height:32px;padding:0 10px;border:1px solid #d1d5db;border-radius:6px;background:#fff;"></select>
          </label>

          <label style="display:flex;flex-direction:column;gap:4px;${isAdminUser ? '' : 'display:none;'}">
            <span>渠道</span>
            <input data-field="channel" type="text" placeholder="channel" style="height:32px;padding:0 10px;border:1px solid #d1d5db;border-radius:6px;" ${isAdminUser ? '' : 'disabled'} />
          </label>

          <label style="display:flex;flex-direction:column;gap:4px;">
            <span>日志类型</span>
            <select data-field="type" style="height:32px;padding:0 10px;border:1px solid #d1d5db;border-radius:6px;background:#fff;">
              <option value="0">全部</option>
              <option value="1">充值</option>
              <option value="2">消费</option>
              <option value="3">管理</option>
              <option value="4">系统</option>
              <option value="5">错误</option>
            </select>
          </label>

          <label style="display:flex;flex-direction:column;gap:4px;">
            <span>导出格式</span>
            <select data-field="format" style="height:32px;padding:0 10px;border:1px solid #d1d5db;border-radius:6px;background:#fff;">
              <option value="csv">CSV</option>
              <option value="xlsx">XLSX</option>
              <option value="json">JSON</option>
            </select>
          </label>
        </div>

        <div data-role="status" style="margin-top:10px;min-height:20px;font-size:13px;color:#2563eb;">请确认参数后点击“开始导出”。</div>

        <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:10px;">
          <button data-action="cancel" type="button" style="height:32px;padding:0 14px;border:1px solid #d1d5db;border-radius:6px;background:#fff;cursor:pointer;">取消</button>
          <button data-action="submit" type="button" style="height:32px;padding:0 14px;border:none;border-radius:6px;background:#2563eb;color:#fff;cursor:pointer;">开始导出</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    getField(overlay, 'startTime').value = defaults.startTime;
    getField(overlay, 'endTime').value = defaults.endTime;
    getField(overlay, 'username').value = isAdminUser ? defaults.username : '';
    getField(overlay, 'token_name').value = defaults.token_name;
    getField(overlay, 'model_name').value = defaults.model_name;
    getField(overlay, 'channel').value = isAdminUser ? defaults.channel : '';
    getField(overlay, 'type').value = defaults.type;
    getField(overlay, 'format').value = defaults.format;

    fetchGroupOptions(true).catch((error) => {
      showToast(`分组加载失败：${error.message || error}`, 'warning');
    });

    const submitBtn = overlay.querySelector('[data-action="submit"]');
    const cancelBtn = overlay.querySelector('[data-action="cancel"]');

    const onEsc = (evt) => {
      if (evt.key === 'Escape') {
        closeModal();
      }
    };

    const destroyModal = () => {
      document.removeEventListener('keydown', onEsc);
      overlay.remove();
    };

    const closeModal = () => {
      if (exporting) return;
      destroyModal();
    };

    document.addEventListener('keydown', onEsc);

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        closeModal();
      }
    });

    cancelBtn.addEventListener('click', closeModal);

    submitBtn.addEventListener('click', async () => {
      if (exporting) return;

      exporting = true;
      submitBtn.disabled = true;
      submitBtn.style.opacity = '0.7';
      submitBtn.textContent = '导出中...';

      try {
        const config = getFormConfig(overlay);
        await runExport(config, overlay);
      } catch (error) {
        const msg = `导出失败：${error.message || error}`;
        setStatus(overlay, msg, 'error');
        showToast(msg, 'error');
      } finally {
        exporting = false;
        submitBtn.disabled = false;
        submitBtn.style.opacity = '1';
        submitBtn.textContent = '开始导出';
      }
    });
  }

  function findColumnSettingButton() {
    return Array.from(document.querySelectorAll('button')).find((btn) => {
      const text = btn.textContent?.replace(/\s+/g, '').trim();
      return text === '列设置';
    });
  }

  function ensureExportButton() {
    if (location.pathname !== ROUTES.LOG) return;

    const existed = document.querySelector(SELECTORS.logButton);
    if (existed) return;

    const columnButton = findColumnSettingButton();
    if (!columnButton) return;

    const exportButton = columnButton.cloneNode(true);
    exportButton.setAttribute('data-newapi-export-btn', '1');

    const textNode = exportButton.querySelector('.semi-button-content');
    if (textNode) {
      textNode.textContent = '导出';
    } else {
      exportButton.textContent = '导出';
    }

    exportButton.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      openExportModal();
    });

    columnButton.insertAdjacentElement('afterend', exportButton);
  }

  function normalizeString(value) {
    return String(value ?? '').trim();
  }

  function normalizeNullableString(value) {
    const text = normalizeString(value);
    return text || '';
  }

  function normalizeAmountValue(value) {
    const raw = normalizeString(value);
    if (!raw) return 0;
    const num = Number(raw.replace(/,/g, ''));
    return Number.isFinite(num) ? num : NaN;
  }

  function normalizePositiveAmountValue(value) {
    const amount = normalizeAmountValue(value);
    if (!Number.isFinite(amount) || amount <= 0) return NaN;
    return amount;
  }

  function convertAmountToQuota(amount) {
    if (!Number.isFinite(amount) || amount < 0) return NaN;
    return Math.trunc(amount * getQuotaPerUnit());
  }

  function formatQuotaPreview(quota) {
    if (!Number.isFinite(quota)) return '-';
    return `${quota}（${formatCostQuota(quota, 6)}）`;
  }

  function generateRandomPassword(length = 12) {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*';
    let result = '';
    for (let i = 0; i < length; i += 1) {
      const index = Math.floor(Math.random() * alphabet.length);
      result += alphabet[index];
    }
    return result;
  }

  function ensureRowPassword(row) {
    if (bulkState.passwordMode === 'random') {
      return row.password || generateRandomPassword(12);
    }
    return row.password;
  }

  function buildCredentialRows(credentials) {
    return credentials.map((item) => [item.username, item.password]);
  }

  function sleep(ms) {
    return new Promise((resolve) => {
      window.setTimeout(resolve, ms);
    });
  }

  function buildQuotaResultRows(items) {
    return items.map((item) => [
      item.username || '',
      item.id || '',
      item.beforeQuota ?? 0,
      formatCostQuota(item.beforeQuota ?? 0, 6),
      item.afterQuota ?? 0,
      formatCostQuota(item.afterQuota ?? 0, 6),
      item.ok ? '成功' : '失败',
      item.message || '',
    ]);
  }

  async function exportSuccessCredentials() {
    if (!bulkState.successCredentials.length) {
      showToast('当前没有可导出的成功账号密码。', 'warning');
      return;
    }
    await downloadXLSX(
      `newapi_bulk_user_credentials_${Date.now()}.xlsx`,
      ['username', 'password'],
      buildCredentialRows(bulkState.successCredentials),
      'credentials',
    );
    showToast('成功账号密码已导出。', 'success');
  }

  async function copySuccessCredentials() {
    if (!bulkState.successCredentials.length) {
      showToast('当前没有可复制的成功账号密码。', 'warning');
      return;
    }
    const content = bulkState.successCredentials
      .map((item) => `${item.username}\t${item.password}`)
      .join('\n');
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(content);
      showToast('成功账号密码已复制。', 'success');
      return;
    }
    throw new Error('当前环境不支持剪贴板复制');
  }

  async function exportBulkQuotaResults() {
    if (!bulkQuotaState.resultItems.length) {
      showToast('当前没有可导出的额度修改结果。', 'warning');
      return;
    }
    await downloadXLSX(
      `newapi_bulk_quota_results_${Date.now()}.xlsx`,
      ['username', 'id', 'before_quota', 'before_amount', 'after_quota', 'after_amount', 'status', 'message'],
      buildQuotaResultRows(bulkQuotaState.resultItems),
      'quota_results',
    );
    showToast('额度修改结果已导出。', 'success');
  }

  async function copyBulkQuotaResults() {
    if (!bulkQuotaState.resultItems.length) {
      showToast('当前没有可复制的额度修改结果。', 'warning');
      return;
    }
    const content = bulkQuotaState.resultItems
      .map((item) => [
        item.username || '',
        item.id || '',
        item.beforeQuota ?? 0,
        formatCostQuota(item.beforeQuota ?? 0, 6),
        item.afterQuota ?? 0,
        formatCostQuota(item.afterQuota ?? 0, 6),
        item.ok ? '成功' : '失败',
        item.message || '',
      ].join('\t'))
      .join('\n');
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(content);
      showToast('额度修改结果已复制。', 'success');
      return;
    }
    throw new Error('当前环境不支持剪贴板复制');
  }

  function getNonEmptyBulkRows(rows) {
    return rows
      .map((row) => {
        const password = bulkState.passwordMode === 'random'
          ? normalizeNullableString(row.password)
          : normalizeString(row.password);
        return {
          ...row,
          username: normalizeString(row.username),
          display_name: normalizeNullableString(row.display_name),
          password,
          remark: normalizeNullableString(row.remark),
        };
      })
      .filter((row) => row.username || row.display_name || row.password || row.remark);
  }

  function validateBulkRows(rows) {
    const errors = [];
    const usernames = new Map();
    const effectiveRows = getNonEmptyBulkRows(rows);

    if (!effectiveRows.length) {
      errors.push('至少需要 1 行有效用户数据。');
    }

    effectiveRows.forEach((row, index) => {
      const lineNo = index + 1;
      const password = ensureRowPassword(row);
      if (!row.username) {
        errors.push(`第 ${lineNo} 行：username 必填。`);
      }
      if (bulkState.passwordMode === 'manual' && !password) {
        errors.push(`第 ${lineNo} 行：password 必填。`);
      }
      if (row.username.length > USERNAME_MAX) {
        errors.push(`第 ${lineNo} 行：username 长度不能超过 ${USERNAME_MAX}。`);
      }
      if (password && (password.length < PASSWORD_MIN || password.length > PASSWORD_MAX)) {
        errors.push(`第 ${lineNo} 行：password 长度需在 ${PASSWORD_MIN}-${PASSWORD_MAX} 之间。`);
      }
      if (row.display_name.length > DISPLAY_NAME_MAX) {
        errors.push(`第 ${lineNo} 行：display_name 长度不能超过 ${DISPLAY_NAME_MAX}。`);
      }
      if (row.remark.length > REMARK_MAX) {
        errors.push(`第 ${lineNo} 行：remark 长度不能超过 ${REMARK_MAX}。`);
      }

      const key = row.username.toLowerCase();
      if (row.username) {
        if (usernames.has(key)) {
          errors.push(`第 ${lineNo} 行：用户名 ${row.username} 与第 ${usernames.get(key)} 行重复。`);
        } else {
          usernames.set(key, lineNo);
        }
      }
    });

    return {
      rows: effectiveRows.map((row) => ({
        ...row,
        password: ensureRowPassword(row),
      })),
      errors,
    };
  }

  function renderBulkValidationSummary() {
    const root = document.querySelector(`[data-${UI_IDS.bulkOverlay}="1"]`);
    if (!root) return;
    const box = root.querySelector('[data-role="bulk-validation"]');
    if (!box) return;

    const errors = bulkState.validationErrors;
    if (!errors.length) {
      box.innerHTML = '<div style="color:#16a34a;">校验通过，可提交。</div>';
      return;
    }

    box.innerHTML = `
      <div style="color:#dc2626;font-weight:600;margin-bottom:6px;">发现 ${errors.length} 个问题：</div>
      <ul style="margin:0;padding-left:18px;color:#991b1b;line-height:1.6;">
        ${errors.map((item) => `<li>${escapeHTML(item)}</li>`).join('')}
      </ul>
    `;
  }

  function renderBulkResults() {
    const root = document.querySelector(`[data-${UI_IDS.bulkOverlay}="1"]`);
    if (!root) return;
    const box = root.querySelector('[data-role="bulk-results"]');
    const progress = root.querySelector('[data-role="bulk-progress"]');
    const credentialSummary = root.querySelector('[data-role="credential-summary"]');
    const quotaPreview = root.querySelector('[data-role="quota-preview"]');
    const amount = normalizeAmountValue(bulkState.amount);
    const convertedQuota = convertAmountToQuota(amount);

    if (progress) {
      progress.textContent = bulkState.progressText || '待开始';
      progress.style.color = bulkState.submitting ? '#2563eb' : '#374151';
    }
    if (quotaPreview) {
      quotaPreview.innerHTML = Number.isFinite(convertedQuota)
        ? `转换后 quota：<strong>${escapeHTML(formatQuotaPreview(convertedQuota))}</strong>`
        : '<span style="color:#dc2626;">请输入有效金额（>=0）</span>';
    }
    if (credentialSummary) {
      credentialSummary.textContent = bulkState.successCredentials.length
        ? `已记录 ${bulkState.successCredentials.length} 条成功账号密码。`
        : '批量添加完成后，可在这里复制或导出成功账号密码。';
    }
    if (!box) return;

    if (!bulkState.resultItems.length) {
      box.innerHTML = '<div style="color:#6b7280;">提交后将在这里显示每一行的创建/更新结果。</div>';
      return;
    }

    box.innerHTML = `
      <div style="display:flex;flex-direction:column;gap:8px;">
        ${bulkState.resultItems
          .map((item, index) => {
            const color = item.skipped ? '#d97706' : item.ok ? '#16a34a' : '#dc2626';
            const bg = item.skipped ? '#fff7ed' : item.ok ? '#f0fdf4' : '#fef2f2';
            const statusText = item.skipped ? '跳过' : item.ok ? '成功' : '失败';
            return `
              <div style="border:1px solid ${color};background:${bg};border-radius:8px;padding:8px 10px;">
                <div style="font-weight:600;color:${color};">${index + 1}. ${escapeHTML(item.username || '-')} - ${statusText}</div>
                <div style="margin-top:4px;color:#374151;white-space:pre-wrap;line-height:1.5;">${escapeHTML(item.message || '')}</div>
              </div>
            `;
          })
          .join('')}
      </div>
    `;
  }

  function renderBulkRows() {
    const root = document.querySelector(`[data-${UI_IDS.bulkOverlay}="1"]`);
    if (!root) return;
    const tbody = root.querySelector('[data-role="bulk-rows"]');
    const counter = root.querySelector('[data-role="bulk-row-counter"]');
    if (!tbody) return;

    if (counter) {
      counter.textContent = `当前 ${bulkState.rows.length} 行，非空 ${getNonEmptyBulkRows(bulkState.rows).length} 行`;
    }

    const passwordPlaceholder = bulkState.passwordMode === 'random' ? '将自动生成 8-20 位随机密码' : '必填，8-20';
    const passwordReadonly = bulkState.passwordMode === 'random' ? 'readonly' : '';
    const passwordBg = bulkState.passwordMode === 'random' ? 'background:#f3f4f6;' : '';

    tbody.innerHTML = bulkState.rows
      .map((row, index) => {
        return `
          <tr data-row-id="${escapeHTML(row.id)}">
            <td style="padding:8px;border-bottom:1px solid #e5e7eb;color:#6b7280;vertical-align:top;">${index + 1}</td>
            <td style="padding:8px;border-bottom:1px solid #e5e7eb;vertical-align:top;">
              <input data-row-field="username" value="${escapeHTML(row.username)}" placeholder="必填，<=20" style="width:100%;height:32px;border:1px solid #d1d5db;border-radius:6px;padding:0 10px;" />
            </td>
            <td style="padding:8px;border-bottom:1px solid #e5e7eb;vertical-align:top;">
              <input data-row-field="display_name" value="${escapeHTML(row.display_name)}" placeholder="可选，<=20" style="width:100%;height:32px;border:1px solid #d1d5db;border-radius:6px;padding:0 10px;" />
            </td>
            <td style="padding:8px;border-bottom:1px solid #e5e7eb;vertical-align:top;">
              <input data-row-field="password" value="${escapeHTML(row.password)}" placeholder="${escapeHTML(passwordPlaceholder)}" ${passwordReadonly} style="width:100%;height:32px;border:1px solid #d1d5db;border-radius:6px;padding:0 10px;${passwordBg}" />
            </td>
            <td style="padding:8px;border-bottom:1px solid #e5e7eb;vertical-align:top;">
              <input data-row-field="remark" value="${escapeHTML(row.remark)}" placeholder="可选，<=255" style="width:100%;height:32px;border:1px solid #d1d5db;border-radius:6px;padding:0 10px;" />
            </td>
            <td style="padding:8px;border-bottom:1px solid #e5e7eb;vertical-align:top;white-space:nowrap;">
              <button type="button" data-action="delete-row" data-row-id="${escapeHTML(row.id)}" style="height:32px;padding:0 10px;border:1px solid #fecaca;background:#fff;color:#dc2626;border-radius:6px;cursor:pointer;">删除</button>
            </td>
          </tr>
        `;
      })
      .join('');
  }

  function syncBulkStateFromDOM(options = {}) {
    const { renderRows = true } = options;
    const root = document.querySelector(`[data-${UI_IDS.bulkOverlay}="1"]`);
    if (!root) return;

    const groupInput = root.querySelector('[data-field="bulk-group"]');
    const amountInput = root.querySelector('[data-field="bulk-amount"]');
    const passwordModeInput = root.querySelector('[data-field="bulk-password-mode"]:checked');
    if (groupInput) bulkState.group = groupInput.value;
    if (amountInput) bulkState.amount = amountInput.value;
    if (passwordModeInput) bulkState.passwordMode = passwordModeInput.value;

    bulkState.rows = bulkState.rows.map((row) => {
      const rowNode = root.querySelector(`tr[data-row-id="${row.id}"]`);
      if (!rowNode) return row;
      return {
        ...row,
        username: rowNode.querySelector('[data-row-field="username"]')?.value || '',
        display_name: rowNode.querySelector('[data-row-field="display_name"]')?.value || '',
        password: rowNode.querySelector('[data-row-field="password"]')?.value || '',
        remark: rowNode.querySelector('[data-row-field="remark"]')?.value || '',
      };
    });

    bulkState.validationErrors = validateBulkRows(bulkState.rows).errors;
    renderBulkValidationSummary();
    renderBulkResults();
    if (renderRows) {
      renderBulkRows();
    }
  }

  function refreshBulkModal() {
    renderBulkRows();
    renderBulkValidationSummary();
    renderBulkResults();
  }

  function populateGroupOptions() {
    const roots = [
      document.querySelector(`[data-${UI_IDS.exportOverlay}="1"]`),
      document.querySelector(`[data-${UI_IDS.bulkOverlay}="1"]`),
      document.querySelector(`[data-${UI_IDS.quotaOverlay}="1"]`),
    ].filter(Boolean);

    roots.forEach((root) => {
      root.querySelectorAll('[data-role="group-options"]').forEach((node) => {
        if (node.tagName !== 'SELECT') return;
        const includeEmpty = node.getAttribute('data-allow-empty') === '1';
        const options = [
          ...(includeEmpty ? [''] : []),
          ...bulkState.groupOptions,
        ];
        node.innerHTML = options
          .map((group) => {
            const label = group || '全部';
            return `<option value="${escapeHTML(group)}">${escapeHTML(label)}</option>`;
          })
          .join('');

        const fieldName = node.getAttribute('data-field');
        if (fieldName === 'group') {
          node.value = node.getAttribute('data-current-value') || '';
        } else if (fieldName === 'bulk-group') {
          node.value = bulkState.group;
        } else if (fieldName === 'quota-group') {
          node.value = bulkQuotaState.group;
        }
      });
    });
  }

  async function fetchGroupOptions(forceRefresh = false) {
    if (!forceRefresh && bulkState.groupOptions.length) {
      populateGroupOptions();
      return bulkState.groupOptions;
    }
    if (bulkState.loadingGroups) return bulkState.groupOptions;
    bulkState.loadingGroups = true;
    try {
      const payload = await apiRequest('/api/group/', { method: 'GET' });
      const groups = Array.isArray(payload.data) ? payload.data : [];
      bulkState.groupOptions = groups.map((item) => normalizeString(item)).filter(Boolean);
      if (!bulkState.group && bulkState.groupOptions.length) {
        bulkState.group = bulkState.groupOptions[0];
      }
      if (!bulkQuotaState.group && bulkState.groupOptions.length) {
        bulkQuotaState.group = bulkState.groupOptions[0];
      }
      populateGroupOptions();
      return bulkState.groupOptions;
    } finally {
      bulkState.loadingGroups = false;
    }
  }

  function buildBulkTemplateRows() {
    const headers = BULK_COLUMNS.map((column) => column.key);
    const examplePassword = bulkState.passwordMode === 'random' ? '' : 'demoPass01';
    const example = ['demo_user_001', '演示用户', examplePassword, '可选备注'];
    return { headers, rows: [example] };
  }

  async function exportBulkTemplate() {
    const { headers, rows } = buildBulkTemplateRows();
    await downloadXLSX(`newapi_bulk_users_template_${Date.now()}.xlsx`, headers, rows, BULK_TEMPLATE_SHEET);
    showToast('模板已导出。', 'success');
  }

  function findColumnKeyByHeader(header) {
    const normalized = normalizeString(header).toLowerCase().replace(/\s+/g, '');
    const matched = BULK_COLUMNS.find((column) =>
      column.aliases.some(
        (alias) => normalizeString(alias).toLowerCase().replace(/\s+/g, '') === normalized,
      ),
    );
    return matched?.key || '';
  }

  function parseImportRowsFromCSV(text) {
    const rows = [];
    let current = '';
    let row = [];
    let inQuotes = false;

    for (let i = 0; i < text.length; i += 1) {
      const char = text[i];
      const next = text[i + 1];

      if (char === '"') {
        if (inQuotes && next === '"') {
          current += '"';
          i += 1;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        row.push(current);
        current = '';
      } else if ((char === '\n' || char === '\r') && !inQuotes) {
        if (char === '\r' && next === '\n') {
          i += 1;
        }
        row.push(current);
        rows.push(row);
        row = [];
        current = '';
      } else {
        current += char;
      }
    }

    if (current !== '' || row.length) {
      row.push(current);
      rows.push(row);
    }

    return rows;
  }

  async function importBulkTemplate(file) {
    let rows;
    if (/\.csv$/i.test(file.name)) {
      const text = await file.text();
      rows = parseImportRowsFromCSV(text);
    } else {
      const XLSX = await ensureXLSX();
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array' });
      const firstSheetName = workbook.SheetNames[0];
      if (!firstSheetName) {
        throw new Error('未读取到工作表。');
      }

      const sheet = workbook.Sheets[firstSheetName];
      rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: '' });
    }

    if (!rows || !rows.length) {
      throw new Error('导入文件为空。');
    }

    const headerRow = Array.isArray(rows[0]) ? rows[0] : [];
    const keyMap = headerRow.map(findColumnKeyByHeader);
    const requiredKeys = bulkState.passwordMode === 'random' ? ['username'] : ['username', 'password'];
    const missingRequired = requiredKeys.filter((key) => !keyMap.includes(key));
    if (missingRequired.length) {
      throw new Error(`模板缺少必要列：${missingRequired.join(', ')}`);
    }

    const parsedRows = rows.slice(1).map((cells) => {
      const row = createEmptyBulkRow();
      keyMap.forEach((key, index) => {
        if (!key) return;
        row[key] = normalizeNullableString(cells[index]);
      });
      return row;
    });

    const effectiveRows = getNonEmptyBulkRows(parsedRows);
    if (!effectiveRows.length) {
      throw new Error('导入文件中没有有效数据。');
    }

    bulkState.rows = effectiveRows.map((row) => ({ ...createEmptyBulkRow(), ...row }));
    bulkState.importedFileName = file.name;
    bulkState.validationErrors = validateBulkRows(bulkState.rows).errors;
    refreshBulkModal();

    const message = bulkState.validationErrors.length
      ? `已导入 ${effectiveRows.length} 行，发现 ${bulkState.validationErrors.length} 个校验问题。`
      : `已导入 ${effectiveRows.length} 行数据。`;
    showToast(message, bulkState.validationErrors.length ? 'warning' : 'success');
  }

  async function createSingleUser(row) {
    const password = ensureRowPassword(row);
    try {
      await apiRequest('/api/user/', {
        method: 'POST',
        body: JSON.stringify({
          username: row.username,
          display_name: row.display_name,
          password,
          remark: row.remark,
        }),
      });
      return { created: true, password };
    } catch (error) {
      const message = error?.message || String(error);
      if (message.includes('用户名已存在') || message.includes('已注销')) {
        return {
          created: false,
          skipped: true,
          password,
          message: `用户名已存在，已跳过：${row.username}`,
        };
      }
      throw error;
    }
  }

  async function searchUserByUsername(username) {
    const encoded = encodeURIComponent(username);
    const payload = await apiRequest(`/api/user/search?keyword=${encoded}&group=&p=0&page_size=100`, {
      method: 'GET',
    });
    const items = Array.isArray(payload.data?.items) ? payload.data.items : [];
    const exact = items.find(
      (item) => normalizeString(item.username).toLowerCase() === username.toLowerCase(),
    );
    if (!exact || !exact.id) {
      throw new Error(`创建成功，但未能通过用户名 ${username} 精确定位用户 ID。`);
    }
    return exact;
  }

  async function searchUsersByGroup(group) {
    const encodedGroup = encodeURIComponent(group);
    const allItems = [];
    let page = 0;

    while (true) {
      const payload = await apiRequest(`/api/user/search?keyword=&group=${encodedGroup}&p=${page}&page_size=100`, {
        method: 'GET',
      });
      const items = Array.isArray(payload.data?.items) ? payload.data.items : [];
      allItems.push(...items);
      if (!items.length) {
        break;
      }
      const total = Number(payload.data?.total);
      if (Number.isFinite(total) && total >= 0 && allItems.length >= total) {
        break;
      }
      page += 1;
    }

    return allItems;
  }

  async function getUserDetail(userId) {
    const payload = await apiRequest(`/api/user/${userId}`, { method: 'GET' });
    return payload.data || {};
  }

  async function updateSingleUser(userDetail, row, group, quota) {
    const payload = {
      ...userDetail,
      id: userDetail.id,
      username: row.username,
      display_name: row.display_name || userDetail.display_name || row.username,
      password: '',
      group,
      quota,
      remark: row.remark,
    };

    await apiRequest('/api/user/', {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  }

  async function processSingleBulkRow(row, sharedConfig) {
    let created = false;
    let finalPassword = ensureRowPassword(row);
    try {
      const createResult = await createSingleUser(row);
      finalPassword = createResult?.password || finalPassword;
      if (createResult?.skipped) {
        return {
          ok: true,
          skipped: true,
          username: row.username,
          password: finalPassword,
          message: createResult.message,
        };
      }
      created = !!createResult?.created;
      const locatedUser = await searchUserByUsername(row.username);
      const detail = await getUserDetail(locatedUser.id);
      await updateSingleUser(detail, row, sharedConfig.group, sharedConfig.quota);
      return {
        ok: true,
        username: row.username,
        password: finalPassword,
        message: `创建成功，已写入分组 ${sharedConfig.group}、额度 ${sharedConfig.quota}、备注。`,
      };
    } catch (error) {
      const baseMessage = error?.message || String(error);
      if (created) {
        return {
          ok: false,
          username: row.username,
          password: finalPassword,
          message: `创建成功，但补充更新失败：${baseMessage}`,
        };
      }
      return {
        ok: false,
        username: row.username,
        password: finalPassword,
        message: `创建失败：${baseMessage}`,
      };
    }
  }

  async function runWithConcurrency(items, limit, worker, onSettled, options = {}) {
    const { batchIntervalMs = 0 } = options;
    const results = new Array(items.length);

    for (let startIndex = 0; startIndex < items.length; startIndex += limit) {
      const batchItems = items.slice(startIndex, startIndex + limit);
      await Promise.all(
        batchItems.map(async (_, offset) => {
          const index = startIndex + offset;
          let result;
          try {
            result = await worker(items[index], index);
          } catch (error) {
            result = {
              ok: false,
              username: items[index]?.username || '',
              message: error?.message || String(error),
            };
          }
          results[index] = result;
          if (typeof onSettled === 'function') {
            onSettled(result, index);
          }
        }),
      );

      if (startIndex + limit < items.length && batchIntervalMs > 0) {
        await sleep(batchIntervalMs);
      }
    }

    return results;
  }


  function summarizeBulkResults(results) {
    const successCount = results.filter((item) => item?.ok && !item?.skipped).length;
    const skippedCount = results.filter((item) => item?.skipped).length;
    const failCount = results.length - successCount - skippedCount;
    return `批量添加完成：成功 ${successCount}，跳过 ${skippedCount}，失败 ${failCount}。`;
  }

  async function submitBulkUsers() {
    const role = getUserRoleFromLocalStorage();
    if (!canUseBulkUserFeature(role)) {
      bulkState.validationErrors = ['批量添加用户仅允许管理员（role=10）和超级管理员（role=100）使用。'];
      refreshBulkModal();
      showToast('批量添加用户仅允许管理员（role=10）和超级管理员（role=100）使用。', 'error');
      return;
    }

    syncBulkStateFromDOM();

    const amount = normalizeAmountValue(bulkState.amount);
    const quota = convertAmountToQuota(amount);
    if (!bulkState.group.trim()) {
      bulkState.validationErrors = ['统一 group 必填。'];
      refreshBulkModal();
      showToast('统一 group 必填。', 'error');
      return;
    }
    if (!Number.isFinite(amount) || amount < 0) {
      bulkState.validationErrors = ['统一金额必须是大于等于 0 的数字。'];
      refreshBulkModal();
      showToast('统一金额必须是大于等于 0 的数字。', 'error');
      return;
    }
    if (!Number.isFinite(quota)) {
      bulkState.validationErrors = ['金额转换后的 quota 无效。'];
      refreshBulkModal();
      showToast('金额转换后的 quota 无效。', 'error');
      return;
    }

    const checked = validateBulkRows(bulkState.rows);
    bulkState.validationErrors = checked.errors;
    refreshBulkModal();
    if (checked.errors.length) {
      showToast(`提交前校验失败，共 ${checked.errors.length} 个问题。`, 'error');
      return;
    }

    bulkState.submitting = true;
    bulkState.resultItems = [];
    bulkState.successCredentials = [];
    bulkState.progressText = `准备提交 ${checked.rows.length} 行数据...`;
    refreshBulkModal();

    const sharedConfig = {
      group: bulkState.group.trim(),
      quota,
      amount,
    };

    let finished = 0;
    const results = await runWithConcurrency(
      checked.rows,
      BULK_CONCURRENCY,
      async (row) => processSingleBulkRow(row, sharedConfig),
      (result) => {
        finished += 1;
        bulkState.progressText = `处理中 ${finished}/${checked.rows.length}：${result.username || '-'}`;
        bulkState.resultItems = [...bulkState.resultItems, result];
        if (result.ok && !result.skipped && result.username && result.password) {
          bulkState.successCredentials = [
            ...bulkState.successCredentials,
            { username: result.username, password: result.password },
          ];
        }
        renderBulkResults();
      },
      { batchIntervalMs: BULK_BATCH_INTERVAL_MS },
    );

    bulkState.submitting = false;
    bulkState.resultItems = results;
    bulkState.successCredentials = results
      .filter((item) => item?.ok && !item?.skipped && item?.username && item?.password)
      .map((item) => ({ username: item.username, password: item.password }));
    bulkState.progressText = summarizeBulkResults(results);
    refreshBulkModal();
    showToast(bulkState.progressText, results.every((item) => item.ok) ? 'success' : 'warning', 5000);
  }

  function resetBulkQuotaState() {
    bulkQuotaState.group = bulkState.groupOptions[0] || '';
    bulkQuotaState.mode = QUOTA_MODES.SET;
    bulkQuotaState.value = '';
    bulkQuotaState.limitValue = '';
    bulkQuotaState.submitting = false;
    bulkQuotaState.progressText = '请先选择分组并填写额度变更规则。';
    bulkQuotaState.resultItems = [];
    bulkQuotaState.validationErrors = [];
  }

  function validateBulkQuotaState() {
    const errors = [];
    const group = normalizeString(bulkQuotaState.group);
    const valueAmount = normalizePositiveAmountValue(bulkQuotaState.value);
    const limitAmount = normalizeString(bulkQuotaState.limitValue)
      ? normalizePositiveAmountValue(bulkQuotaState.limitValue)
      : '';

    if (!group) {
      errors.push('用户分组必填。');
    }
    if (!Object.values(QUOTA_MODES).includes(bulkQuotaState.mode)) {
      errors.push('请选择有效的修改方式。');
    }
    if (!Number.isFinite(valueAmount)) {
      errors.push('额度数值必须大于 0。');
    }
    if ((bulkQuotaState.mode === QUOTA_MODES.INCREASE || bulkQuotaState.mode === QUOTA_MODES.DECREASE) && limitAmount !== '' && !Number.isFinite(limitAmount)) {
      errors.push(bulkQuotaState.mode === QUOTA_MODES.INCREASE ? '额度上限必须大于 0。' : '额度下限必须大于 0。');
    }

    const valueQuota = convertAmountToQuota(valueAmount);
    if (Number.isFinite(valueAmount) && !Number.isFinite(valueQuota)) {
      errors.push('额度数值转换后的 quota 无效。');
    }

    let limitQuota = null;
    if (limitAmount !== '') {
      limitQuota = convertAmountToQuota(limitAmount);
      if (!Number.isFinite(limitQuota)) {
        errors.push(bulkQuotaState.mode === QUOTA_MODES.INCREASE ? '额度上限转换后的 quota 无效。' : '额度下限转换后的 quota 无效。');
      }
    }

    return {
      errors,
      group,
      valueAmount,
      valueQuota,
      limitAmount,
      limitQuota,
    };
  }

  function computeNextQuota(currentQuota, mode, valueQuota, limitQuota) {
    const safeCurrent = Number.isFinite(Number(currentQuota)) ? Math.trunc(Number(currentQuota)) : 0;
    if (mode === QUOTA_MODES.SET) {
      return valueQuota;
    }
    if (mode === QUOTA_MODES.INCREASE) {
      let next = safeCurrent + valueQuota;
      if (Number.isFinite(limitQuota)) {
        next = Math.min(next, limitQuota);
      }
      return next;
    }
    if (mode === QUOTA_MODES.DECREASE) {
      let next = safeCurrent - valueQuota;
      if (Number.isFinite(limitQuota)) {
        next = Math.max(next, limitQuota);
      }
      return Math.max(next, 0);
    }
    return safeCurrent;
  }

  function renderBulkQuotaValidationSummary() {
    const root = document.querySelector(`[data-${UI_IDS.quotaOverlay}="1"]`);
    if (!root) return;
    const box = root.querySelector('[data-role="quota-validation"]');
    if (!box) return;

    const errors = bulkQuotaState.validationErrors;
    if (!errors.length) {
      box.innerHTML = '<div style="color:#16a34a;">校验通过，可提交。</div>';
      return;
    }

    box.innerHTML = `
      <div style="color:#dc2626;font-weight:600;margin-bottom:6px;">发现 ${errors.length} 个问题：</div>
      <ul style="margin:0;padding-left:18px;color:#991b1b;line-height:1.6;">
        ${errors.map((item) => `<li>${escapeHTML(item)}</li>`).join('')}
      </ul>
    `;
  }

  function renderBulkQuotaResults() {
    const root = document.querySelector(`[data-${UI_IDS.quotaOverlay}="1"]`);
    if (!root) return;
    const box = root.querySelector('[data-role="quota-results"]');
    const progress = root.querySelector('[data-role="quota-progress"]');
    const preview = root.querySelector('[data-role="quota-change-preview"]');
    const summary = root.querySelector('[data-role="quota-result-summary"]');
    const parsed = validateBulkQuotaState();

    if (progress) {
      progress.textContent = bulkQuotaState.progressText || '待开始';
      progress.style.color = bulkQuotaState.submitting ? '#2563eb' : '#374151';
    }

    if (preview) {
      const quotaText = Number.isFinite(parsed.valueQuota)
        ? formatQuotaPreview(parsed.valueQuota)
        : '-';
      const limitText = Number.isFinite(parsed.limitQuota)
        ? formatQuotaPreview(parsed.limitQuota)
        : '未设置';
      if (bulkQuotaState.mode === QUOTA_MODES.SET) {
        preview.innerHTML = Number.isFinite(parsed.valueQuota)
          ? `将统一设置为：<strong>${escapeHTML(quotaText)}</strong>`
          : '<span style="color:#dc2626;">请输入大于 0 的额度数值</span>';
      } else if (bulkQuotaState.mode === QUOTA_MODES.INCREASE) {
        preview.innerHTML = Number.isFinite(parsed.valueQuota)
          ? `将统一增加：<strong>${escapeHTML(quotaText)}</strong>；上限：<strong>${escapeHTML(limitText)}</strong>`
          : '<span style="color:#dc2626;">请输入大于 0 的额度数值</span>';
      } else {
        preview.innerHTML = Number.isFinite(parsed.valueQuota)
          ? `将统一减少：<strong>${escapeHTML(quotaText)}</strong>；下限：<strong>${escapeHTML(limitText)}</strong>`
          : '<span style="color:#dc2626;">请输入大于 0 的额度数值</span>';
      }
    }

    if (summary) {
      summary.textContent = bulkQuotaState.resultItems.length
        ? `已记录 ${bulkQuotaState.resultItems.length} 条额度修改结果。`
        : '批量修改完成后，可在这里复制或导出结果。';
    }

    if (!box) return;
    if (!bulkQuotaState.resultItems.length) {
      box.innerHTML = '<div style="color:#6b7280;">提交后将在这里显示每个用户的额度变更结果。</div>';
      return;
    }

    box.innerHTML = `
      <div style="overflow:auto;">
        <table style="width:100%;border-collapse:collapse;min-width:760px;">
          <thead>
            <tr style="background:#f9fafb;">
              <th style="text-align:left;padding:8px;border-bottom:1px solid #e5e7eb;">用户名</th>
              <th style="text-align:left;padding:8px;border-bottom:1px solid #e5e7eb;">ID</th>
              <th style="text-align:left;padding:8px;border-bottom:1px solid #e5e7eb;">修改前额度</th>
              <th style="text-align:left;padding:8px;border-bottom:1px solid #e5e7eb;">修改后额度</th>
              <th style="text-align:left;padding:8px;border-bottom:1px solid #e5e7eb;">状态</th>
              <th style="text-align:left;padding:8px;border-bottom:1px solid #e5e7eb;">说明</th>
            </tr>
          </thead>
          <tbody>
            ${bulkQuotaState.resultItems
              .map((item) => {
                const color = item.ok ? '#16a34a' : '#dc2626';
                const statusText = item.ok ? '成功' : '失败';
                return `
                  <tr>
                    <td style="padding:8px;border-bottom:1px solid #e5e7eb;">${escapeHTML(item.username || '-')}</td>
                    <td style="padding:8px;border-bottom:1px solid #e5e7eb;">${escapeHTML(item.id || '-')}</td>
                    <td style="padding:8px;border-bottom:1px solid #e5e7eb;">${escapeHTML(formatQuotaPreview(item.beforeQuota ?? 0))}</td>
                    <td style="padding:8px;border-bottom:1px solid #e5e7eb;">${escapeHTML(formatQuotaPreview(item.afterQuota ?? 0))}</td>
                    <td style="padding:8px;border-bottom:1px solid #e5e7eb;color:${color};font-weight:600;">${statusText}</td>
                    <td style="padding:8px;border-bottom:1px solid #e5e7eb;color:#374151;white-space:pre-wrap;line-height:1.5;">${escapeHTML(item.message || '')}</td>
                  </tr>
                `;
              })
              .join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  function refreshBulkQuotaModal() {
    renderBulkQuotaValidationSummary();
    renderBulkQuotaResults();
  }

  function syncBulkQuotaStateFromDOM() {
    const root = document.querySelector(`[data-${UI_IDS.quotaOverlay}="1"]`);
    if (!root) return;

    const groupInput = root.querySelector('[data-field="quota-group"]');
    const modeInput = root.querySelector('[data-field="quota-mode"]');
    const valueInput = root.querySelector('[data-field="quota-value"]');
    const limitInput = root.querySelector('[data-field="quota-limit"]');
    if (groupInput) bulkQuotaState.group = groupInput.value;
    if (modeInput) bulkQuotaState.mode = modeInput.value;
    if (valueInput) bulkQuotaState.value = valueInput.value;
    if (limitInput) bulkQuotaState.limitValue = limitInput.value;

    const limitWrap = root.querySelector('[data-role="quota-limit-wrap"]');
    const label = root.querySelector('[data-role="quota-limit-label"]');
    if (limitWrap && label) {
      const showLimit = bulkQuotaState.mode === QUOTA_MODES.INCREASE || bulkQuotaState.mode === QUOTA_MODES.DECREASE;
      limitWrap.style.display = showLimit ? 'flex' : 'none';
      label.textContent = bulkQuotaState.mode === QUOTA_MODES.INCREASE ? '额度上限（可选）' : '额度下限（可选）';
      limitInput.placeholder = bulkQuotaState.mode === QUOTA_MODES.INCREASE ? '例如：100' : '例如：10';
    }

    bulkQuotaState.validationErrors = validateBulkQuotaState().errors;
    refreshBulkQuotaModal();
  }

  async function processSingleQuotaUser(userSummary, config) {
    const detail = await getUserDetail(userSummary.id);
    const beforeQuota = Number.isFinite(Number(detail.quota)) ? Math.trunc(Number(detail.quota)) : 0;
    const afterQuota = computeNextQuota(beforeQuota, config.mode, config.valueQuota, config.limitQuota);
    await apiRequest('/api/user/', {
      method: 'PUT',
      body: JSON.stringify({
        ...detail,
        id: detail.id,
        quota: afterQuota,
      }),
    });
    return {
      ok: true,
      username: detail.username || userSummary.username || '',
      id: detail.id,
      beforeQuota,
      afterQuota,
      message: `额度已更新为 ${afterQuota}。`,
    };
  }

  async function submitBulkQuotaUpdate() {
    const role = getUserRoleFromLocalStorage();
    if (!canUseBulkUserFeature(role)) {
      bulkQuotaState.validationErrors = ['批量修改用户额度仅允许管理员（role=10）和超级管理员（role=100）使用。'];
      refreshBulkQuotaModal();
      showToast('批量修改用户额度仅允许管理员（role=10）和超级管理员（role=100）使用。', 'error');
      return;
    }

    syncBulkQuotaStateFromDOM();
    const parsed = validateBulkQuotaState();
    bulkQuotaState.validationErrors = parsed.errors;
    refreshBulkQuotaModal();
    if (parsed.errors.length) {
      showToast(`提交前校验失败，共 ${parsed.errors.length} 个问题。`, 'error');
      return;
    }

    bulkQuotaState.submitting = true;
    bulkQuotaState.resultItems = [];
    bulkQuotaState.progressText = `正在查询分组 ${parsed.group} 下的用户...`;
    refreshBulkQuotaModal();

    const users = await searchUsersByGroup(parsed.group);
    if (!users.length) {
      bulkQuotaState.submitting = false;
      bulkQuotaState.progressText = `分组 ${parsed.group} 下未找到用户。`;
      refreshBulkQuotaModal();
      showToast(`分组 ${parsed.group} 下未找到用户。`, 'warning');
      return;
    }

    const config = {
      ...parsed,
      mode: bulkQuotaState.mode,
    };

    let finished = 0;
    const results = await runWithConcurrency(
      users,
      BULK_CONCURRENCY,
      async (user) => {
        try {
          return await processSingleQuotaUser(user, config);
        } catch (error) {
          const message = error?.message || String(error);
          return {
            ok: false,
            username: user.username || '',
            id: user.id || '',
            beforeQuota: user.quota || 0,
            afterQuota: user.quota || 0,
            message,
          };
        }
      },
      (result) => {
        finished += 1;
        bulkQuotaState.progressText = `处理中 ${finished}/${users.length}：${result.username || result.id || '-'}`;
        bulkQuotaState.resultItems = [...bulkQuotaState.resultItems, result];
        renderBulkQuotaResults();
      },
      { batchIntervalMs: BULK_BATCH_INTERVAL_MS },
    );

    bulkQuotaState.submitting = false;
    bulkQuotaState.resultItems = results;
    const successCount = results.filter((item) => item.ok).length;
    const failCount = results.length - successCount;
    bulkQuotaState.progressText = `批量修改额度完成：成功 ${successCount}，失败 ${failCount}。`;
    refreshBulkQuotaModal();
    showToast(bulkQuotaState.progressText, failCount ? 'warning' : 'success', 5000);
  }

  function openBulkQuotaModal() {
    const existing = document.querySelector(`[data-${UI_IDS.quotaOverlay}="1"]`);
    if (existing) {
      existing.remove();
    }

    if (!bulkQuotaState.group) {
      bulkQuotaState.group = bulkState.groupOptions[0] || '';
    }

    const modeOptions = QUOTA_MODE_OPTIONS
      .map((item) => `<option value="${escapeHTML(item.value)}" ${bulkQuotaState.mode === item.value ? 'selected' : ''}>${escapeHTML(item.label)}</option>`)
      .join('');
    const showLimit = bulkQuotaState.mode === QUOTA_MODES.INCREASE || bulkQuotaState.mode === QUOTA_MODES.DECREASE;
    const limitLabelText = bulkQuotaState.mode === QUOTA_MODES.INCREASE ? '额度上限（可选）' : '额度下限（可选）';

    const overlay = document.createElement('div');
    overlay.setAttribute(`data-${UI_IDS.quotaOverlay}`, '1');
    overlay.style.cssText = [
      'position: fixed',
      'inset: 0',
      'background: rgba(0,0,0,.35)',
      'z-index: 999999',
      'display: flex',
      'align-items: center',
      'justify-content: center',
      'padding: 16px',
    ].join(';');

    overlay.innerHTML = `
      <div data-role="dialog" style="width:min(980px,96vw);max-height:92vh;overflow:auto;background:#fff;border-radius:14px;padding:16px;box-shadow:0 20px 45px rgba(0,0,0,.2);font-size:14px;color:#111827;">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;">
          <div>
            <div style="font-size:18px;font-weight:700;">批量修改用户额度</div>
            <div style="font-size:12px;color:#6b7280;margin-top:4px;">按分组查找用户，逐个读取详情并更新额度。</div>
          </div>
          <button type="button" data-action="close" style="height:32px;padding:0 14px;border:1px solid #d1d5db;border-radius:6px;background:#fff;cursor:pointer;">关闭</button>
        </div>

        <div style="margin-top:14px;border:1px solid #e5e7eb;border-radius:10px;padding:12px;background:#f9fafb;">
          <div style="font-weight:600;margin-bottom:10px;">修改设置</div>
          <div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;">
            <label style="display:flex;flex-direction:column;gap:4px;">
              <span>用户分组</span>
              <select data-field="quota-group" data-role="group-options" style="height:34px;border:1px solid #d1d5db;border-radius:6px;padding:0 10px;background:#fff;"></select>
            </label>
            <label style="display:flex;flex-direction:column;gap:4px;">
              <span>修改方式</span>
              <select data-field="quota-mode" style="height:34px;border:1px solid #d1d5db;border-radius:6px;padding:0 10px;background:#fff;">${modeOptions}</select>
            </label>
            <label style="display:flex;flex-direction:column;gap:4px;">
              <span>额度数值</span>
              <input data-field="quota-value" value="${escapeHTML(bulkQuotaState.value)}" placeholder="例如：10" style="height:34px;border:1px solid #d1d5db;border-radius:6px;padding:0 10px;background:#fff;" />
            </label>
          </div>
          <div style="margin-top:12px;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;align-items:end;">
            <label data-role="quota-limit-wrap" style="display:${showLimit ? 'flex' : 'none'};flex-direction:column;gap:4px;">
              <span data-role="quota-limit-label">${escapeHTML(limitLabelText)}</span>
              <input data-field="quota-limit" value="${escapeHTML(bulkQuotaState.limitValue)}" placeholder="例如：100" style="height:34px;border:1px solid #d1d5db;border-radius:6px;padding:0 10px;background:#fff;" />
            </label>
            <div style="display:flex;flex-direction:column;gap:4px;">
              <span>规则预览</span>
              <div data-role="quota-change-preview" style="min-height:34px;border:1px solid #d1d5db;border-radius:6px;padding:7px 10px;background:#fff;color:#374151;"></div>
            </div>
          </div>
        </div>

        <div style="margin-top:14px;border:1px solid #e5e7eb;border-radius:10px;padding:12px;background:#fff8f1;">
          <div style="font-weight:600;margin-bottom:6px;">提交校验</div>
          <div data-role="quota-validation"></div>
        </div>

        <div style="margin-top:14px;border:1px solid #e5e7eb;border-radius:10px;padding:12px;background:#f8fafc;">
          <div style="font-weight:600;margin-bottom:6px;">提交进度</div>
          <div data-role="quota-progress" style="font-size:13px;color:#374151;"></div>
        </div>

        <div style="margin-top:14px;border:1px solid #e5e7eb;border-radius:10px;padding:12px;background:#eff6ff;">
          <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;">
            <div>
              <div style="font-weight:600;margin-bottom:4px;">结果导出</div>
              <div data-role="quota-result-summary" style="font-size:12px;color:#6b7280;">批量修改完成后，可在这里复制或导出结果。</div>
            </div>
            <div style="display:flex;gap:8px;flex-wrap:wrap;">
              <button type="button" data-action="copy-quota-results" style="height:32px;padding:0 12px;border:1px solid #93c5fd;border-radius:6px;background:#fff;cursor:pointer;">复制结果</button>
              <button type="button" data-action="export-quota-results" style="height:32px;padding:0 12px;border:1px solid #93c5fd;border-radius:6px;background:#fff;cursor:pointer;">导出结果</button>
            </div>
          </div>
        </div>

        <div style="margin-top:14px;border:1px solid #e5e7eb;border-radius:10px;padding:12px;background:#fff;">
          <div style="font-weight:600;margin-bottom:8px;">结果面板</div>
          <div data-role="quota-results"></div>
        </div>

        <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:14px;flex-wrap:wrap;">
          <button type="button" data-action="reset" style="height:34px;padding:0 14px;border:1px solid #d1d5db;border-radius:6px;background:#fff;cursor:pointer;">重置</button>
          <button type="button" data-action="submit" style="height:34px;padding:0 16px;border:none;border-radius:6px;background:#2563eb;color:#fff;cursor:pointer;">开始批量修改</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    const closeModal = () => {
      if (bulkQuotaState.submitting) return;
      overlay.remove();
    };

    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) {
        closeModal();
      }
    });

    overlay.querySelector('[data-action="close"]').addEventListener('click', closeModal);
    overlay.querySelector('[data-action="reset"]').addEventListener('click', () => {
      resetBulkQuotaState();
      refreshBulkQuotaModal();
      syncBulkQuotaStateFromDOM();
    });
    overlay.querySelector('[data-action="submit"]').addEventListener('click', async () => {
      const submitButton = overlay.querySelector('[data-action="submit"]');
      submitButton.disabled = true;
      submitButton.style.opacity = '0.7';
      submitButton.textContent = '提交中...';
      try {
        await submitBulkQuotaUpdate();
      } catch (error) {
        showToast(`批量修改额度失败：${error.message || error}`, 'error', 5000);
      } finally {
        submitButton.disabled = false;
        submitButton.style.opacity = '1';
        submitButton.textContent = '开始批量修改';
      }
    });
    overlay.querySelector('[data-action="copy-quota-results"]').addEventListener('click', async () => {
      try {
        await copyBulkQuotaResults();
      } catch (error) {
        showToast(`复制结果失败：${error.message || error}`, 'error');
      }
    });
    overlay.querySelector('[data-action="export-quota-results"]').addEventListener('click', async () => {
      try {
        await exportBulkQuotaResults();
      } catch (error) {
        showToast(`导出结果失败：${error.message || error}`, 'error');
      }
    });

    overlay.addEventListener('input', (event) => {
      if (event.target.matches('[data-field="quota-value"], [data-field="quota-limit"]')) {
        syncBulkQuotaStateFromDOM();
      }
    });

    overlay.addEventListener('change', (event) => {
      if (event.target.matches('[data-field="quota-group"], [data-field="quota-mode"]')) {
        syncBulkQuotaStateFromDOM();
      }
    });

    fetchGroupOptions(true).catch((error) => {
      showToast(`分组加载失败：${error.message || error}`, 'warning');
    }).finally(() => {
      const select = overlay.querySelector('[data-field="quota-group"]');
      if (select) {
        select.value = bulkQuotaState.group;
      }
      syncBulkQuotaStateFromDOM();
    });
  }

  function resetBulkState() {
    bulkState.rows = [createEmptyBulkRow()];
    bulkState.group = bulkState.groupOptions[0] || 'default';
    bulkState.amount = '0';
    bulkState.passwordMode = 'manual';
    bulkState.submitting = false;
    bulkState.progressText = '请先填写统一设置与用户列表。';
    bulkState.resultItems = [];
    bulkState.successCredentials = [];
    bulkState.validationErrors = [];
    bulkState.importedFileName = '';
  }

  function openBulkUserModal() {
    const existing = document.querySelector(`[data-${UI_IDS.bulkOverlay}="1"]`);
    if (existing) {
      existing.remove();
    }

    if (!bulkState.group) {
      bulkState.group = bulkState.groupOptions[0] || 'default';
    }

    const convertedQuota = convertAmountToQuota(normalizeAmountValue(bulkState.amount));
    const overlay = document.createElement('div');
    overlay.setAttribute(`data-${UI_IDS.bulkOverlay}`, '1');
    overlay.style.cssText = [
      'position: fixed',
      'inset: 0',
      'background: rgba(0,0,0,.35)',
      'z-index: 999999',
      'display: flex',
      'align-items: center',
      'justify-content: center',
      'padding: 16px',
    ].join(';');

    overlay.innerHTML = `
      <div data-role="dialog" style="width:min(1180px,96vw);max-height:92vh;overflow:auto;background:#fff;border-radius:14px;padding:16px;box-shadow:0 20px 45px rgba(0,0,0,.2);font-size:14px;color:#111827;">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;">
          <div>
            <div style="font-size:18px;font-weight:700;">批量添加用户</div>
            <div style="font-size:12px;color:#6b7280;margin-top:4px;">先创建用户，再逐个更新 group / quota / remark。</div>
          </div>
          <button type="button" data-action="close" style="height:32px;padding:0 14px;border:1px solid #d1d5db;border-radius:6px;background:#fff;cursor:pointer;">关闭</button>
        </div>

        <div style="margin-top:14px;border:1px solid #e5e7eb;border-radius:10px;padding:12px;background:#f9fafb;">
          <div style="font-weight:600;margin-bottom:10px;">统一设置</div>
          <div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;">
            <label style="display:flex;flex-direction:column;gap:4px;">
              <span>group</span>
              <select data-field="bulk-group" data-role="group-options" style="height:34px;border:1px solid #d1d5db;border-radius:6px;padding:0 10px;background:#fff;"></select>
            </label>
            <label style="display:flex;flex-direction:column;gap:4px;">
              <span>金额</span>
              <input data-field="bulk-amount" value="${escapeHTML(bulkState.amount)}" placeholder="例如：1 或 0.5" style="height:34px;border:1px solid #d1d5db;border-radius:6px;padding:0 10px;background:#fff;" />
            </label>
            <div style="display:flex;flex-direction:column;gap:4px;">
              <span>quota 预览</span>
              <div data-role="quota-preview" style="min-height:34px;border:1px solid #d1d5db;border-radius:6px;padding:7px 10px;background:#fff;color:#374151;">${Number.isFinite(convertedQuota) ? `转换后 quota：<strong>${escapeHTML(formatQuotaPreview(convertedQuota))}</strong>` : '<span style="color:#dc2626;">请输入有效金额（>=0）</span>'}</div>
            </div>
          </div>
          <div style="margin-top:12px;display:flex;flex-direction:column;gap:6px;">
            <span style="font-weight:500;">密码方式</span>
            <div style="display:flex;gap:16px;flex-wrap:wrap;">
              <label style="display:inline-flex;align-items:center;gap:6px;cursor:pointer;">
                <input type="radio" name="bulk-password-mode" data-field="bulk-password-mode" value="manual" ${bulkState.passwordMode === 'manual' ? 'checked' : ''} />
                <span>手动输入密码</span>
              </label>
              <label style="display:inline-flex;align-items:center;gap:6px;cursor:pointer;">
                <input type="radio" name="bulk-password-mode" data-field="bulk-password-mode" value="random" ${bulkState.passwordMode === 'random' ? 'checked' : ''} />
                <span>随机字符串密码</span>
              </label>
            </div>
            <div style="font-size:12px;color:#6b7280;">随机模式下会在提交时为成功创建的用户自动生成密码，并在结果面板中提供复制与导出。</div>
          </div>
        </div>

        <div style="margin-top:14px;border:1px solid #e5e7eb;border-radius:10px;padding:12px;background:#fff;">
          <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;">
            <div>
              <div style="font-weight:600;">Excel 工具</div>
              <div style="font-size:12px;color:#6b7280;margin-top:4px;">模板列固定为 username / display_name / password / remark。</div>
            </div>
            <div style="display:flex;gap:8px;flex-wrap:wrap;">
              <button type="button" data-action="export-template" style="height:32px;padding:0 12px;border:1px solid #d1d5db;border-radius:6px;background:#fff;cursor:pointer;">导出模板</button>
              <label style="height:32px;padding:0 12px;border:1px solid #d1d5db;border-radius:6px;background:#fff;cursor:pointer;display:inline-flex;align-items:center;">
                导入模板
                <input type="file" data-action="import-template" accept=".xlsx,.xls,.csv" style="display:none;" />
              </label>
            </div>
          </div>
          <div data-role="import-info" style="margin-top:8px;font-size:12px;color:#6b7280;">${escapeHTML(bulkState.importedFileName ? `已导入：${bulkState.importedFileName}` : '未导入文件')}</div>
        </div>

        <div style="margin-top:14px;border:1px solid #e5e7eb;border-radius:10px;padding:12px;background:#fff;">
          <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;">
            <div>
              <div style="font-weight:600;">用户列表</div>
              <div data-role="bulk-row-counter" style="font-size:12px;color:#6b7280;margin-top:4px;"></div>
            </div>
            <div style="display:flex;gap:8px;flex-wrap:wrap;">
              <button type="button" data-action="add-row" style="height:32px;padding:0 12px;border:none;border-radius:6px;background:#2563eb;color:#fff;cursor:pointer;">新增一行</button>
              <button type="button" data-action="clear-empty" style="height:32px;padding:0 12px;border:1px solid #d1d5db;border-radius:6px;background:#fff;cursor:pointer;">清空空行</button>
            </div>
          </div>
          <div style="margin-top:10px;overflow:auto;">
            <table style="width:100%;border-collapse:collapse;min-width:900px;">
              <thead>
                <tr style="background:#f9fafb;">
                  <th style="text-align:left;padding:8px;border-bottom:1px solid #e5e7eb;width:56px;">#</th>
                  <th style="text-align:left;padding:8px;border-bottom:1px solid #e5e7eb;">username</th>
                  <th style="text-align:left;padding:8px;border-bottom:1px solid #e5e7eb;">display_name</th>
                  <th style="text-align:left;padding:8px;border-bottom:1px solid #e5e7eb;">password</th>
                  <th style="text-align:left;padding:8px;border-bottom:1px solid #e5e7eb;">remark</th>
                  <th style="text-align:left;padding:8px;border-bottom:1px solid #e5e7eb;width:86px;">操作</th>
                </tr>
              </thead>
              <tbody data-role="bulk-rows"></tbody>
            </table>
          </div>
        </div>

        <div style="margin-top:14px;border:1px solid #e5e7eb;border-radius:10px;padding:12px;background:#fff8f1;">
          <div style="font-weight:600;margin-bottom:6px;">导入/提交校验</div>
          <div data-role="bulk-validation"></div>
        </div>

        <div style="margin-top:14px;border:1px solid #e5e7eb;border-radius:10px;padding:12px;background:#f8fafc;">
          <div style="font-weight:600;margin-bottom:6px;">提交进度</div>
          <div data-role="bulk-progress" style="font-size:13px;color:#374151;"></div>
        </div>

        <div style="margin-top:14px;border:1px solid #e5e7eb;border-radius:10px;padding:12px;background:#eff6ff;">
          <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;">
            <div>
              <div style="font-weight:600;margin-bottom:4px;">成功账号密码</div>
              <div data-role="credential-summary" style="font-size:12px;color:#6b7280;">批量添加完成后，可在这里复制或导出成功账号密码。</div>
            </div>
            <div style="display:flex;gap:8px;flex-wrap:wrap;">
              <button type="button" data-action="copy-success-credentials" style="height:32px;padding:0 12px;border:1px solid #93c5fd;border-radius:6px;background:#fff;cursor:pointer;">复制账号密码</button>
              <button type="button" data-action="export-success-credentials" style="height:32px;padding:0 12px;border:1px solid #93c5fd;border-radius:6px;background:#fff;cursor:pointer;">导出成功账号</button>
            </div>
          </div>
        </div>

        <div style="margin-top:14px;border:1px solid #e5e7eb;border-radius:10px;padding:12px;background:#fff;">
          <div style="font-weight:600;margin-bottom:8px;">结果面板</div>
          <div data-role="bulk-results"></div>
        </div>

        <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:14px;flex-wrap:wrap;">
          <button type="button" data-action="reset" style="height:34px;padding:0 14px;border:1px solid #d1d5db;border-radius:6px;background:#fff;cursor:pointer;">重置</button>
          <button type="button" data-action="submit" style="height:34px;padding:0 16px;border:none;border-radius:6px;background:#16a34a;color:#fff;cursor:pointer;">开始批量添加</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    const importInfo = overlay.querySelector('[data-role="import-info"]');
    const closeModal = () => {
      if (bulkState.submitting) return;
      overlay.remove();
    };

    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) {
        closeModal();
      }
    });

    overlay.querySelector('[data-action="close"]').addEventListener('click', closeModal);
    overlay.querySelector('[data-action="add-row"]').addEventListener('click', () => {
      syncBulkStateFromDOM();
      bulkState.rows.push(createEmptyBulkRow());
      refreshBulkModal();
    });
    overlay.querySelector('[data-action="clear-empty"]').addEventListener('click', () => {
      syncBulkStateFromDOM();
      const effective = getNonEmptyBulkRows(bulkState.rows).map((row) => ({ ...createEmptyBulkRow(), ...row }));
      bulkState.rows = effective.length ? effective : [createEmptyBulkRow()];
      bulkState.validationErrors = validateBulkRows(bulkState.rows).errors;
      refreshBulkModal();
    });
    overlay.querySelector('[data-action="reset"]').addEventListener('click', () => {
      resetBulkState();
      if (importInfo) {
        importInfo.textContent = '未导入文件';
      }
      refreshBulkModal();
    });
    overlay.querySelector('[data-action="submit"]').addEventListener('click', async () => {
      const submitButton = overlay.querySelector('[data-action="submit"]');
      submitButton.disabled = true;
      submitButton.style.opacity = '0.7';
      submitButton.textContent = '提交中...';
      try {
        await submitBulkUsers();
      } catch (error) {
        showToast(`批量添加失败：${error.message || error}`, 'error', 5000);
      } finally {
        submitButton.disabled = false;
        submitButton.style.opacity = '1';
        submitButton.textContent = '开始批量添加';
      }
    });
    overlay.querySelector('[data-action="export-template"]').addEventListener('click', async () => {
      try {
        await exportBulkTemplate();
      } catch (error) {
        showToast(`模板导出失败：${error.message || error}`, 'error');
      }
    });
    overlay.querySelector('[data-action="copy-success-credentials"]').addEventListener('click', async () => {
      try {
        await copySuccessCredentials();
      } catch (error) {
        showToast(`复制失败：${error.message || error}`, 'error');
      }
    });
    overlay.querySelector('[data-action="export-success-credentials"]').addEventListener('click', async () => {
      try {
        await exportSuccessCredentials();
      } catch (error) {
        showToast(`导出成功账号失败：${error.message || error}`, 'error');
      }
    });
    overlay.querySelector('[data-action="import-template"]').addEventListener('change', async (event) => {
      const file = event.target.files?.[0];
      if (!file) return;
      try {
        await importBulkTemplate(file);
        if (importInfo) {
          importInfo.textContent = `已导入：${file.name}`;
        }
      } catch (error) {
        showToast(`模板导入失败：${error.message || error}`, 'error', 5000);
      } finally {
        event.target.value = '';
      }
    });

    overlay.addEventListener('input', (event) => {
      if (event.target.matches('[data-row-field]')) {
        syncBulkStateFromDOM({ renderRows: false });
        return;
      }
      if (event.target.matches('[data-field="bulk-amount"]')) {
        syncBulkStateFromDOM({ renderRows: false });
      }
    });

    overlay.addEventListener('change', (event) => {
      if (event.target.matches('[data-field="bulk-password-mode"], [data-field="bulk-group"]')) {
        syncBulkStateFromDOM();
      }
    });

    overlay.addEventListener('click', (event) => {
      const button = event.target.closest('[data-action="delete-row"]');
      if (!button) return;
      const rowId = button.getAttribute('data-row-id');
      syncBulkStateFromDOM();
      bulkState.rows = bulkState.rows.filter((item) => item.id !== rowId);
      if (!bulkState.rows.length) {
        bulkState.rows = [createEmptyBulkRow()];
      }
      bulkState.validationErrors = validateBulkRows(bulkState.rows).errors;
      refreshBulkModal();
    });

    fetchGroupOptions(true).catch((error) => {
      showToast(`分组加载失败：${error.message || error}`, 'warning');
    }).finally(() => {
      const select = overlay.querySelector('[data-field="bulk-group"]');
      if (select) {
        select.value = bulkState.group;
      }
      refreshBulkModal();
    });
  }

  async function ensureBulkUserButton() {
    if (location.pathname !== ROUTES.USER) return;

    const role = getUserRoleFromLocalStorage();
    if (!canUseBulkUserFeature(role)) return;

    const buttons = Array.from(document.querySelectorAll('button'));
    const addUserButton = buttons.find((button) => {
      const text = button.textContent?.replace(/\s+/g, '').trim();
      if (text !== '添加用户') return false;
      return !!button.closest('div.flex.gap-2');
    });

    if (!addUserButton) return;

    const actionsContainer = addUserButton.parentElement;
    if (!actionsContainer) return;

    if (!actionsContainer.querySelector(SELECTORS.bulkButton)) {
      const bulkButton = addUserButton.cloneNode(true);
      bulkButton.setAttribute('data-newapi-bulk-user-btn', '1');
      const textNode = bulkButton.querySelector('.semi-button-content');
      if (textNode) {
        textNode.textContent = '批量添加用户';
      } else {
        bulkButton.textContent = '批量添加用户';
      }

      bulkButton.addEventListener('click', async (event) => {
        event.preventDefault();
        event.stopPropagation();
        try {
          await fetchGroupOptions(true);
        } catch (error) {
          showToast(`分组加载失败：${error.message || error}`, 'warning');
        }
        openBulkUserModal();
      });

      addUserButton.insertAdjacentElement('afterend', bulkButton);
    }

    if (!actionsContainer.querySelector(SELECTORS.bulkQuotaButton)) {
      const quotaButton = addUserButton.cloneNode(true);
      quotaButton.setAttribute('data-newapi-bulk-quota-btn', '1');
      const textNode = quotaButton.querySelector('.semi-button-content');
      if (textNode) {
        textNode.textContent = '批量修改用户额度';
      } else {
        quotaButton.textContent = '批量修改用户额度';
      }

      quotaButton.addEventListener('click', async (event) => {
        event.preventDefault();
        event.stopPropagation();
        try {
          await fetchGroupOptions(true);
        } catch (error) {
          showToast(`分组加载失败：${error.message || error}`, 'warning');
        }
        openBulkQuotaModal();
      });

      const bulkButton = actionsContainer.querySelector(SELECTORS.bulkButton);
      if (bulkButton) {
        bulkButton.insertAdjacentElement('afterend', quotaButton);
      } else {
        addUserButton.insertAdjacentElement('afterend', quotaButton);
      }
    }
  }

  function cleanupPageArtifacts(pathname) {
    if (pathname !== ROUTES.LOG) {
      document.querySelectorAll(SELECTORS.logButton).forEach((node) => node.remove());
      document.querySelector(`[data-${UI_IDS.exportOverlay}="1"]`)?.remove();
    }
    if (pathname !== ROUTES.USER) {
      document.querySelectorAll(SELECTORS.bulkButton).forEach((node) => node.remove());
      document.querySelectorAll(SELECTORS.bulkQuotaButton).forEach((node) => node.remove());
      document.querySelector(`[data-${UI_IDS.bulkOverlay}="1"]`)?.remove();
      document.querySelector(`[data-${UI_IDS.quotaOverlay}="1"]`)?.remove();
    }
  }

  function initCurrentRoute() {
    const pathname = location.pathname;
    cleanupPageArtifacts(pathname);

    if (pathname === ROUTES.LOG) {
      ensureExportButton();
      return;
    }

    if (pathname === ROUTES.USER) {
      ensureBulkUserButton();
    }
  }

  function handlePossibleRouteChange() {
    if (location.pathname === lastPathname) {
      initCurrentRoute();
      return;
    }
    lastPathname = location.pathname;
    initCurrentRoute();
  }

  function installRouteWatcher() {
    if (routeWatcherInstalled) return;
    routeWatcherInstalled = true;

    const wrapHistoryMethod = (methodName) => {
      const original = history[methodName];
      if (typeof original !== 'function') return;
      history[methodName] = function (...args) {
        const result = original.apply(this, args);
        queueMicrotask(handlePossibleRouteChange);
        return result;
      };
    };

    wrapHistoryMethod('pushState');
    wrapHistoryMethod('replaceState');
    window.addEventListener('popstate', handlePossibleRouteChange);
    window.addEventListener('hashchange', handlePossibleRouteChange);
  }

  function installDomObserver() {
    if (domObserver) return;
    domObserver = new MutationObserver(() => {
      initCurrentRoute();
    });
    domObserver.observe(document.body, {
      childList: true,
      subtree: true,
    });
  }

  function bootstrap() {
    installRouteWatcher();
    installDomObserver();
    initCurrentRoute();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrap, { once: true });
  } else {
    bootstrap();
  }
})();
