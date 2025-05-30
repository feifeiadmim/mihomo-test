/**
 * Hysteria2 协议解析器
 */

import { ProxyTypes } from '../types.js';
import { smartUrlDecode } from '../utils/index.js';

// Hysteria2 协议默认配置常量
const HYSTERIA2_DEFAULTS = {
  ALPN: ['h3'],
  CONGESTION: 'bbr',
  TLS_ENABLED: true,
  MIN_PORT: 1,
  MAX_PORT: 65535
};

// 缓存正则表达式以提高性能
const PORT_RANGE_REGEX = /@([^:/?#]+):(\d+)(?:,[\d,-]+)/;

// 错误消息常量
const ERROR_MESSAGES = {
  INVALID_INPUT: '节点信息无效',
  MISSING_FIELDS: '缺少必要字段',
  INVALID_PORT: '端口无效',
  PARSE_FAILED: '解析失败',
  GENERATE_FAILED: '生成失败',
  CONVERT_FAILED: '转换失败',
  VALIDATE_FAILED: '验证失败'
};

/**
 * 验证端口号是否有效
 * @param {string|number} portStr - 端口字符串或数字
 * @returns {number|null} 有效的端口号或null
 */
function validatePort(portStr) {
  const port = parseInt(portStr);
  return !isNaN(port) && port >= HYSTERIA2_DEFAULTS.MIN_PORT && port <= HYSTERIA2_DEFAULTS.MAX_PORT ? port : null;
}

/**
 * 验证节点基本字段
 * @param {Object} node - 节点对象
 * @returns {Object} 验证结果 {isValid, server, port, password, errors}
 */
function validateNodeFields(node) {
  const errors = [];

  if (!node || typeof node !== 'object') {
    return { isValid: false, errors: [ERROR_MESSAGES.INVALID_INPUT] };
  }

  const server = node.server;
  const password = node.password || node.auth;
  const port = validatePort(node.port);

  if (!server || typeof server !== 'string') {
    errors.push('服务器地址无效');
  }

  if (!password || typeof password !== 'string') {
    errors.push('密码无效');
  }

  if (!port) {
    errors.push(`${ERROR_MESSAGES.INVALID_PORT}: ${node.port}`);
  }

  return {
    isValid: errors.length === 0,
    server,
    port,
    password,
    errors
  };
}

/**
 * 统一的错误日志记录
 * @param {string} operation - 操作名称
 * @param {string|Array} errors - 错误信息
 * @param {Object} context - 上下文信息
 */
function logError(operation, errors, context = {}) {
  const errorList = Array.isArray(errors) ? errors : [errors];
  console.error(`Hysteria2 ${operation}:`, {
    errors: errorList,
    ...context
  });
}

/**
 * 处理端口范围格式的URL
 * 支持格式：port,port-port 或 port,port,port
 * @param {string} url - 原始URL
 * @returns {string} 处理后的URL
 */
function processPortRange(url) {
  const match = url.match(PORT_RANGE_REGEX);

  if (match) {
    const [fullMatch, host, mainPort] = match;
    // 验证主端口是否有效
    if (validatePort(mainPort)) {
      return url.replace(fullMatch, `@${host}:${mainPort}`);
    }
  }

  return url;
}

/**
 * 解析 Hysteria2 URL
 * 支持格式: hysteria2://password@server:port?params#name
 * @param {string} url - Hysteria2 URL
 * @returns {Object|null} 解析后的节点信息
 */
export function parseHysteria2Url(url) {
  try {
    // 输入验证
    if (!url || typeof url !== 'string') {
      return null;
    }

    if (!url.startsWith('hysteria2://') && !url.startsWith('hy2://')) {
      return null;
    }

    // 处理端口范围格式，如 32000,32000-33000
    const processedUrl = processPortRange(url);
    const urlObj = new URL(processedUrl);

    // 提取基本信息
    const password = smartUrlDecode(urlObj.username);
    const server = urlObj.hostname;
    const port = validatePort(urlObj.port);

    // 验证必要字段
    const validation = validateNodeFields({ server, port, password });
    if (!validation.isValid) {
      logError(ERROR_MESSAGES.PARSE_FAILED, validation.errors, {
        url: url.substring(0, 50) + '...'
      });
      return null;
    }

    const name = smartUrlDecode(urlObj.hash.slice(1)) || `${server}:${port}`;
    const params = new URLSearchParams(urlObj.search);

    return {
      type: ProxyTypes.HYSTERIA2,
      name,
      server,
      port,
      password,
      auth: password, // Hysteria2 使用 auth 字段
      obfs: {
        type: params.get('obfs') || '',
        password: params.get('obfs-password') || ''
      },
      tls: {
        enabled: HYSTERIA2_DEFAULTS.TLS_ENABLED,
        serverName: params.get('sni') || params.get('peer') || server,
        alpn: params.get('alpn') ? params.get('alpn').split(',') : [...HYSTERIA2_DEFAULTS.ALPN],
        skipCertVerify: params.get('insecure') === '1'
      },
      bandwidth: {
        up: params.get('up') || '',
        down: params.get('down') || ''
      },
      congestion: params.get('congestion') || HYSTERIA2_DEFAULTS.CONGESTION,
      fastOpen: params.get('fastopen') === '1',
      lazy: params.get('lazy') === '1'
    };
  } catch (error) {
    logError(ERROR_MESSAGES.PARSE_FAILED, error.message, {
      url: url ? url.substring(0, 50) + '...' : 'undefined'
    });
    return null;
  }
}

/**
 * 生成 Hysteria2 URL
 * @param {Object} node - 节点信息
 * @returns {string|null} Hysteria2 URL
 */
export function generateHysteria2Url(node) {
  try {
    // 验证必要字段
    const validation = validateNodeFields(node);
    if (!validation.isValid) {
      logError(ERROR_MESSAGES.GENERATE_FAILED, validation.errors, {
        server: node?.server
      });
      return null;
    }

    const { server, port, password } = validation;
    const url = new URL(`hysteria2://${encodeURIComponent(password)}@${server}:${port}`);
    const params = new URLSearchParams();

    // 混淆配置
    if (node.obfs?.type) {
      params.set('obfs', node.obfs.type);
      if (node.obfs.password) {
        params.set('obfs-password', node.obfs.password);
      }
    }

    // TLS 配置
    if (node.tls) {
      if (node.tls.serverName && node.tls.serverName !== server) {
        params.set('sni', node.tls.serverName);
      }
      if (node.tls.alpn?.length && node.tls.alpn.join(',') !== HYSTERIA2_DEFAULTS.ALPN.join(',')) {
        params.set('alpn', node.tls.alpn.join(','));
      }
      if (node.tls.skipCertVerify) {
        params.set('insecure', '1');
      }
    }

    // 带宽配置
    if (node.bandwidth?.up) params.set('up', node.bandwidth.up);
    if (node.bandwidth?.down) params.set('down', node.bandwidth.down);

    // 其他配置
    if (node.congestion && node.congestion !== HYSTERIA2_DEFAULTS.CONGESTION) {
      params.set('congestion', node.congestion);
    }
    if (node.fastOpen) params.set('fastopen', '1');
    if (node.lazy) params.set('lazy', '1');

    if (params.toString()) {
      url.search = params.toString();
    }
    url.hash = encodeURIComponent(node.name || `${server}:${port}`);

    return url.toString();
  } catch (error) {
    logError(ERROR_MESSAGES.GENERATE_FAILED, error.message, {
      server: node?.server
    });
    return null;
  }
}

/**
 * 转换为 Clash 格式
 * @param {Object} node - 节点信息
 * @returns {Object|null} Clash 格式节点
 */
export function toClashFormat(node) {
  try {
    // 验证必要字段
    const validation = validateNodeFields(node);
    if (!validation.isValid) {
      logError(ERROR_MESSAGES.CONVERT_FAILED, validation.errors, {
        server: node?.server
      });
      return null;
    }

    const { server, port, password } = validation;
    const clashNode = {
      name: node.name || `${server}:${port}`,
      type: 'hysteria2',
      server,
      port,
      password
    };

    // 混淆配置
    if (node.obfs?.type) {
      clashNode.obfs = node.obfs.type;
      if (node.obfs.password) {
        clashNode['obfs-password'] = node.obfs.password;
      }
    }

    // TLS 配置
    if (node.tls) {
      if (node.tls.serverName) {
        clashNode.sni = node.tls.serverName;
      }
      if (node.tls.alpn?.length) {
        clashNode.alpn = [...node.tls.alpn]; // 创建副本避免引用问题
      }
      if (node.tls.skipCertVerify) {
        clashNode['skip-cert-verify'] = true;
      }
    }

    // 带宽配置
    if (node.bandwidth?.up) clashNode.up = node.bandwidth.up;
    if (node.bandwidth?.down) clashNode.down = node.bandwidth.down;

    // 其他配置
    if (node.congestion) clashNode.congestion = node.congestion;
    if (node.fastOpen) clashNode['fast-open'] = true;
    if (node.lazy) clashNode.lazy = true;

    return clashNode;
  } catch (error) {
    logError(ERROR_MESSAGES.CONVERT_FAILED, error.message, {
      server: node?.server
    });
    return null;
  }
}

/**
 * 从 Clash 格式解析
 * @param {Object} clashNode - Clash 格式节点
 * @returns {Object|null} 标准节点格式
 */
export function fromClashFormat(clashNode) {
  try {
    // 验证必要字段
    const validation = validateNodeFields({
      server: clashNode?.server,
      port: clashNode?.port,
      password: clashNode?.password
    });

    if (!validation.isValid) {
      logError(ERROR_MESSAGES.CONVERT_FAILED, validation.errors, {
        server: clashNode?.server
      });
      return null;
    }

    const { server, port, password } = validation;

    return {
      type: ProxyTypes.HYSTERIA2,
      name: clashNode.name || `${server}:${port}`,
      server,
      port,
      password,
      auth: password,
      obfs: {
        type: clashNode.obfs || '',
        password: clashNode['obfs-password'] || ''
      },
      tls: {
        enabled: HYSTERIA2_DEFAULTS.TLS_ENABLED,
        serverName: clashNode.sni || server,
        alpn: clashNode.alpn ? [...clashNode.alpn] : [...HYSTERIA2_DEFAULTS.ALPN],
        skipCertVerify: !!clashNode['skip-cert-verify']
      },
      bandwidth: {
        up: clashNode.up || '',
        down: clashNode.down || ''
      },
      congestion: clashNode.congestion || HYSTERIA2_DEFAULTS.CONGESTION,
      fastOpen: !!clashNode['fast-open'],
      lazy: !!clashNode.lazy
    };
  } catch (error) {
    logError(ERROR_MESSAGES.CONVERT_FAILED, error.message, {
      server: clashNode?.server
    });
    return null;
  }
}

/**
 * 验证节点配置
 * @param {Object} node - 节点信息
 * @returns {boolean} 是否有效
 */
export function validateNode(node) {
  try {
    // 使用统一的验证函数
    const validation = validateNodeFields(node);

    // 额外验证协议类型
    if (node?.type && node.type !== ProxyTypes.HYSTERIA2) {
      return false;
    }

    return validation.isValid;
  } catch (error) {
    logError(ERROR_MESSAGES.VALIDATE_FAILED, error.message);
    return false;
  }
}
