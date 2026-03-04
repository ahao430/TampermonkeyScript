// ==UserScript==
// @name         NewAPI 使用日志导出
// @namespace    https://github.com/ahao430/TampermonkeyScript
// @version      2026-03-04
// @description  日志页新增导出按钮，支持 CSV/XLSX/JSON，全量导出（忽略分页）。在下方@match增加匹配页面。
// @author       wanghao
// @match        https://agentrouter.org/console/log
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  const MAX_RANGE_DAYS = 31;
  const MAX_EXPORT_ROWS = 10000;
  const API_PAGE_SIZE = 100;

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

  let exporting = false;

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

    throw lastError || new Error('XLSX 库加载失败，请改用 CSV 导出');
  }

  async function downloadXLSX(filename, headers, rows) {
    const XLSX = await ensureXLSX();
    const sheet = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, sheet, 'logs');
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

    let container = document.getElementById('newapi-export-toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'newapi-export-toast-container';
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
    };

    const userId = getUserIdFromLocalStorage();
    if (userId) {
      headers['new-api-user'] = userId;
    }

    return headers;
  }

  async function fetchAllLogs(params, isAdminUser, onProgress) {
    const headers = buildRequestHeaders();
    const rows = [];
    let page = 1;
    let total = 0;
    let truncated = false;

    while (rows.length < MAX_EXPORT_ROWS) {
      const url = buildApiURL(params, page, isAdminUser);

      let response;
      try {
        response = await fetch(url, {
          method: 'GET',
          credentials: 'include',
          cache: 'no-store',
          headers,
        });
      } catch (error) {
        throw new Error(`第 ${page} 页请求失败：${error.message || error}`);
      }

      if (!response.ok) {
        throw new Error(`第 ${page} 页请求失败：HTTP ${response.status}`);
      }

      let payload;
      try {
        payload = await response.json();
      } catch {
        throw new Error(`第 ${page} 页响应不是 JSON，可能登录已失效`);
      }

      if (!payload || payload.success !== true) {
        throw new Error(payload?.message || `第 ${page} 页接口返回失败`);
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
    const existing = document.querySelector('[data-newapi-export-overlay="1"]');
    if (existing) {
      existing.remove();
    }

    const defaults = readCurrentFilters();
    const role = getUserRoleFromLocalStorage();
    const isAdminUser = isAdminRole(role);

    const overlay = document.createElement('div');
    overlay.setAttribute('data-newapi-export-overlay', '1');
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
            <input data-field="group" type="text" placeholder="group" style="height:32px;padding:0 10px;border:1px solid #d1d5db;border-radius:6px;" />
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
    getField(overlay, 'group').value = defaults.group;
    getField(overlay, 'channel').value = isAdminUser ? defaults.channel : '';
    getField(overlay, 'type').value = defaults.type;
    getField(overlay, 'format').value = defaults.format;

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
    const existed = document.querySelector('button[data-newapi-export-btn="1"]');
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

  function bootstrap() {
    ensureExportButton();

    const observer = new MutationObserver(() => {
      ensureExportButton();
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrap, { once: true });
  } else {
    bootstrap();
  }
})();
