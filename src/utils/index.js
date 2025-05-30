/**
 * 工具函数统一入口
 */

// Node.js 环境兼容性修复
if (typeof globalThis.atob === 'undefined') {
  globalThis.atob = function(str) {
    return Buffer.from(str, 'base64').toString('utf8');
  };
}

if (typeof globalThis.btoa === 'undefined') {
  globalThis.btoa = function(str) {
    return Buffer.from(str, 'utf8').toString('base64');
  };
}

/**
 * 安全的 btoa 函数，自动处理 Unicode 字符
 * @param {string} str - 要编码的字符串
 * @returns {string} Base64 编码结果
 */
export function safeBtoa(str) {
  try {
    // 先尝试原生 btoa
    return btoa(str);
  } catch (error) {
    // 如果失败（通常是因为 Unicode 字符），使用 Buffer 方式
    return Buffer.from(str, 'utf8').toString('base64');
  }
}

/**
 * 安全的 atob 函数，自动处理 Unicode 字符
 * @param {string} base64 - Base64 字符串
 * @returns {string} 解码结果
 */
export function safeAtob(base64) {
  try {
    // 先尝试原生 atob
    return atob(base64);
  } catch (error) {
    // 如果失败，使用 Buffer 方式
    return Buffer.from(base64, 'base64').toString('utf8');
  }
}

/**
 * 安全的URL解码函数
 * @param {string} str - 需要解码的字符串
 * @returns {string} 解码后的字符串
 */
export function safeDecodeURIComponent(str) {
  if (!str || typeof str !== 'string') {
    return str;
  }

  try {
    // 先尝试标准的decodeURIComponent
    return decodeURIComponent(str);
  } catch (error) {
    console.warn('URL解码失败，使用原始字符串:', error.message);
    return str;
  }
}

/**
 * 检测字符串是否包含URL编码
 * @param {string} str - 要检测的字符串
 * @returns {boolean} 是否包含URL编码
 */
export function hasUrlEncoding(str) {
  if (!str || typeof str !== 'string') {
    return false;
  }

  // 检查是否包含URL编码模式 %XX
  return /%[0-9A-Fa-f]{2}/.test(str);
}

/**
 * 智能URL解码 - 只对包含URL编码的字符串进行解码
 * @param {string} str - 要处理的字符串
 * @returns {string} 处理后的字符串
 */
export function smartUrlDecode(str) {
  if (!str || typeof str !== 'string') {
    return str;
  }

  // 只对包含URL编码的字符串进行解码
  if (hasUrlEncoding(str)) {
    return safeDecodeURIComponent(str);
  }

  return str;
}

export * from './deduplication.js';
export * from './rename.js';

/**
 * 通用工具函数
 */

/**
 * 深度克隆对象
 * @param {any} obj - 要克隆的对象
 * @returns {any} 克隆后的对象
 */
export function deepClone(obj) {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }

  if (obj instanceof Date) {
    return new Date(obj.getTime());
  }

  if (obj instanceof Array) {
    return obj.map(item => deepClone(item));
  }

  if (typeof obj === 'object') {
    const cloned = {};
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        cloned[key] = deepClone(obj[key]);
      }
    }
    return cloned;
  }

  return obj;
}

/**
 * 验证 URL 格式
 * @param {string} url - URL 字符串
 * @returns {boolean} 是否为有效 URL
 */
export function isValidUrl(url) {
  try {
    new URL(url);
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * 验证 IP 地址格式
 * @param {string} ip - IP 地址字符串
 * @returns {boolean} 是否为有效 IP
 */
export function isValidIP(ip) {
  const ipv4Regex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
  const ipv6Regex = /^(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$/;

  return ipv4Regex.test(ip) || ipv6Regex.test(ip);
}

/**
 * 验证端口号
 * @param {number|string} port - 端口号
 * @returns {boolean} 是否为有效端口
 */
export function isValidPort(port) {
  const portNum = parseInt(port);
  return !isNaN(portNum) && portNum > 0 && portNum < 65536;
}

/**
 * 验证 UUID 格式
 * @param {string} uuid - UUID 字符串
 * @returns {boolean} 是否为有效 UUID
 */
export function isValidUUID(uuid) {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(uuid);
}

/**
 * 生成随机 UUID
 * @returns {string} UUID 字符串
 */
export function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

/**
 * 安全的 Base64 编码
 * @param {string} str - 要编码的字符串
 * @returns {string} Base64 编码结果
 */
export function safeBase64Encode(str) {
  try {
    return btoa(unescape(encodeURIComponent(str)));
  } catch (error) {
    console.error('Base64 编码失败:', error);
    return '';
  }
}

/**
 * 安全的 Base64 解码
 * @param {string} base64 - Base64 字符串
 * @returns {string} 解码结果
 */
export function safeBase64Decode(base64) {
  try {
    return decodeURIComponent(escape(atob(base64)));
  } catch (error) {
    console.error('Base64 解码失败:', error);
    return '';
  }
}

/**
 * 格式化文件大小
 * @param {number} bytes - 字节数
 * @returns {string} 格式化后的大小
 */
export function formatFileSize(bytes) {
  if (bytes === 0) return '0 B';

  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * 延迟执行
 * @param {number} ms - 延迟毫秒数
 * @returns {Promise} Promise 对象
 */
export function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 重试执行函数
 * @param {Function} fn - 要执行的函数
 * @param {number} maxRetries - 最大重试次数
 * @param {number} delayMs - 重试间隔
 * @returns {Promise} Promise 对象
 */
export async function retry(fn, maxRetries = 3, delayMs = 1000) {
  let lastError;

  for (let i = 0; i <= maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (i < maxRetries) {
        await delay(delayMs);
      }
    }
  }

  throw lastError;
}

/**
 * 节流函数
 * @param {Function} func - 要节流的函数
 * @param {number} limit - 时间限制（毫秒）
 * @returns {Function} 节流后的函数
 */
export function throttle(func, limit) {
  let inThrottle;
  return function() {
    const args = arguments;
    const context = this;
    if (!inThrottle) {
      func.apply(context, args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
  };
}

/**
 * 防抖函数
 * @param {Function} func - 要防抖的函数
 * @param {number} delay - 延迟时间（毫秒）
 * @returns {Function} 防抖后的函数
 */
export function debounce(func, delay) {
  let timeoutId;
  return function() {
    const args = arguments;
    const context = this;
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => func.apply(context, args), delay);
  };
}

/**
 * 数组去重
 * @param {Array} array - 要去重的数组
 * @param {Function} keyFn - 键提取函数
 * @returns {Array} 去重后的数组
 */
export function uniqueArray(array, keyFn = item => item) {
  const seen = new Set();
  return array.filter(item => {
    const key = keyFn(item);
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

/**
 * 数组分块
 * @param {Array} array - 要分块的数组
 * @param {number} size - 块大小
 * @returns {Array} 分块后的数组
 */
export function chunkArray(array, size) {
  const chunks = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

/**
 * 随机打乱数组
 * @param {Array} array - 要打乱的数组
 * @returns {Array} 打乱后的数组
 */
export function shuffleArray(array) {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

/**
 * 获取随机整数
 * @param {number} min - 最小值
 * @param {number} max - 最大值
 * @returns {number} 随机整数
 */
export function getRandomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * 获取随机字符串
 * @param {number} length - 字符串长度
 * @param {string} chars - 字符集
 * @returns {string} 随机字符串
 */
export function getRandomString(length, chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789') {
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}
