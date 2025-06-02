/**
 * VMess 协议解析器
 * 已优化：统一错误处理、验证机制、缓存支持、传输层处理统一化
 */

import { ProxyTypes } from '../types.js';
import { safeBtoa, safeAtob } from '../utils/index.js';
import { ParserErrorHandler } from './common/error-handler.js';
import { NodeValidator } from './common/validator.js';
import { wrapWithCache } from './common/cache.js';
import { TransportHandler } from './common/transport-handler.js';

/**
 * VMess输入安全校验函数
 * @param {string} url - VMess URL
 * @returns {Object} 校验结果 {isValid: boolean, error?: string, base64Content?: string}
 */
export function validateVMessInput(url) {
  try {
    // 基础类型检查
    if (!url || typeof url !== 'string') {
      return { isValid: false, error: 'Invalid input: URL must be a non-empty string' };
    }

    // 协议前缀检查
    if (!url.startsWith('vmess://')) {
      return { isValid: false, error: 'Invalid protocol: URL must start with vmess://' };
    }

    // 提取Base64内容
    const base64Content = url.slice(8);
    if (!base64Content) {
      return { isValid: false, error: 'Invalid VMess URL: missing base64 content' };
    }

    // Base64长度限制（≤10KB）
    if (base64Content.length > 10240) {
      return { isValid: false, error: 'VMess URL content too long (max 10KB)' };
    }

    // Base64格式正则验证
    const base64Regex = /^[A-Za-z0-9+/]*={0,2}$/;
    if (!base64Regex.test(base64Content)) {
      return { isValid: false, error: 'Invalid Base64 format' };
    }

    // 尝试解码Base64
    let jsonString;
    try {
      jsonString = safeAtob(base64Content);
    } catch (error) {
      return { isValid: false, error: `Failed to decode base64 content: ${error.message}` };
    }

    // JSON长度检查（解码后）
    if (jsonString.length > 20480) { // 20KB限制
      return { isValid: false, error: 'Decoded JSON content too long (max 20KB)' };
    }

    // JSON结构校验
    let config;
    try {
      config = JSON.parse(jsonString);
    } catch (error) {
      return { isValid: false, error: `Failed to parse JSON config: ${error.message}` };
    }

    // JSON结构完整性检查
    if (!config || typeof config !== 'object') {
      return { isValid: false, error: 'Invalid JSON structure: must be an object' };
    }

    // 必需字段验证
    const requiredFields = ['add', 'port', 'id'];
    for (const field of requiredFields) {
      if (!config[field]) {
        return { isValid: false, error: `Missing required field: ${field}` };
      }
    }

    // 字段类型验证
    if (typeof config.add !== 'string' || config.add.trim().length === 0) {
      return { isValid: false, error: 'Invalid server address (add field)' };
    }

    const port = parseInt(config.port);
    if (isNaN(port) || port < 1 || port > 65535) {
      return { isValid: false, error: 'Invalid port number (1-65535)' };
    }

    if (typeof config.id !== 'string' || config.id.trim().length === 0) {
      return { isValid: false, error: 'Invalid UUID (id field)' };
    }

    // UUID格式验证（简化版）
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(config.id.trim())) {
      return { isValid: false, error: 'Invalid UUID format' };
    }

    return {
      isValid: true,
      base64Content,
      jsonString,
      config
    };
  } catch (error) {
    return { isValid: false, error: `Validation error: ${error.message}` };
  }
}

/**
 * 解析 VMess URL（内部实现，使用安全校验）
 * 支持格式: vmess://base64(json)
 * @param {string} url - VMess URL
 * @returns {Object|null} 解析后的节点信息
 */
function _parseVMessUrl(url) {
  // 使用安全校验函数
  const validation = validateVMessInput(url);
  if (!validation.isValid) {
    throw new Error(validation.error);
  }

  const { config } = validation;

  // 构建节点对象
  const node = {
    type: ProxyTypes.VMESS,
    name: config.ps || `${config.add}:${config.port}`,
    server: config.add.trim(),
    port: parseInt(config.port),
    uuid: config.id.trim(),
    alterId: parseInt(config.aid) || 0,
    cipher: config.scy || 'auto',
    network: config.net || 'tcp',
    tls: {
      enabled: config.tls === 'tls' || config.tls === '1' || config.tls === 1 || config.tls === true,
      serverName: config.sni || config.host || ''
    }
  };

  // 添加高级参数支持
  if (config.alpn) {
    node.alpn = config.alpn.split(',').map(s => s.trim());
  }

  if (config.fp) {
    node['client-fingerprint'] = config.fp;
  }

  // 使用统一传输层处理器
  const transport = TransportHandler.parseTransportParams(config, config.net || 'tcp', 'json');
  if (Object.keys(transport).length > 0) {
    node.transport = transport;
    // 同时支持Clash格式
    node[`${node.network}-opts`] = transport;
  }

  // 使用统一验证器验证节点
  const nodeValidation = NodeValidator.validateNode(node, 'VMESS');
  if (!nodeValidation.isValid) {
    throw new Error(`Node validation failed: ${nodeValidation.errors.join(', ')}`);
  }

  return node;
}

/**
 * 解析 VMess URL（带缓存和错误处理）
 * @param {string} url - VMess URL
 * @returns {Object|null} 解析后的节点信息
 */
export const parseVMessUrl = wrapWithCache(
  (url) => {
    try {
      return _parseVMessUrl(url);
    } catch (error) {
      return ParserErrorHandler.handleParseError('VMESS', url, error);
    }
  },
  'vmess',
  { maxSize: 500, ttl: 300000 } // 5分钟缓存
);

/**
 * 生成 VMess URL
 * @param {Object} node - 节点信息
 * @returns {string|null} VMess URL
 */
export function generateVMessUrl(node) {
  try {
    // 验证节点
    const generateValidation = NodeValidator.validateNode(node, 'VMESS');
    if (!generateValidation.isValid) {
      throw new Error(`Invalid node: ${generateValidation.errors.join(', ')}`);
    }

    const config = {
      v: '2',
      ps: node.name || `${node.server}:${node.port}`,
      add: node.server,
      port: node.port.toString(),
      id: node.uuid,
      aid: (node.alterId || 0).toString(),
      scy: node.cipher || 'auto',
      net: node.network || 'tcp',
      type: 'none',
      host: '',
      path: '',
      tls: node.tls?.enabled ? 'tls' : '',
      sni: node.tls?.serverName || ''
    };

    // 添加高级参数支持
    if (node.alpn) {
      config.alpn = Array.isArray(node.alpn) ? node.alpn.join(',') : node.alpn;
    }

    if (node['client-fingerprint']) {
      config.fp = node['client-fingerprint'];
    }

    // 使用统一传输层处理器处理传输配置
    if (node.network && node.network !== 'tcp' && node.transport) {
      const transportOpts = node.transport;

      switch (node.network) {
        case 'ws':
          config.path = transportOpts.path || '/';
          config.host = transportOpts.headers?.Host || transportOpts.host || '';
          // 支持HTTP Upgrade
          if (transportOpts['v2ray-http-upgrade']) {
            config.net = 'httpupgrade';
          }
          break;

        case 'h2':
          config.path = Array.isArray(transportOpts.path) ?
            transportOpts.path[0] : (transportOpts.path || '/');
          config.host = Array.isArray(transportOpts.host) ?
            transportOpts.host[0] : (transportOpts.host || '');
          break;

        case 'grpc':
          config.path = transportOpts.serviceName || '';
          config.type = transportOpts.mode || 'gun';
          if (transportOpts.authority) {
            config.host = transportOpts.authority;
          }
          break;

        case 'kcp':
          config.type = transportOpts.headerType || 'none';
          config.path = transportOpts.path || '';
          config.host = transportOpts.host || '';
          break;

        case 'quic':
          config.type = transportOpts.headerType || 'none';
          config.path = transportOpts.path || '';
          config.host = transportOpts.host || '';
          break;

        case 'http':
          config.net = 'tcp';
          config.type = 'http';
          config.path = Array.isArray(transportOpts.path) ?
            transportOpts.path[0] : (transportOpts.path || '/');
          config.host = transportOpts.headers?.Host || transportOpts.host || '';
          break;
      }
    }

    const jsonString = JSON.stringify(config);
    const base64Content = safeBtoa(jsonString);
    return `vmess://${base64Content}`;
  } catch (error) {
    return ParserErrorHandler.handleConversionError('VMESS', 'generate', node, error);
  }
}

/**
 * 转换为 Clash 格式
 * @param {Object} node - 节点信息
 * @returns {Object|null} Clash 格式节点
 */
export function toClashFormat(node) {
  try {
    // 验证节点
    const clashValidation = NodeValidator.validateNode(node, 'VMESS');
    if (!clashValidation.isValid) {
      throw new Error(`Invalid node: ${clashValidation.errors.join(', ')}`);
    }

    const clashNode = {
      name: node.name || `${node.server}:${node.port}`,
      type: 'vmess',
      server: node.server,
      port: node.port,
      uuid: node.uuid,
      alterId: node.alterId || 0,
      cipher: node.cipher || 'auto',
      network: node.network || 'tcp'
    };

    // TLS 配置
    if (node.tls?.enabled) {
      clashNode.tls = true;
      if (node.tls.serverName) {
        clashNode.servername = node.tls.serverName;
      }
    }

    // 使用统一传输层处理器生成Clash配置
    if (node.transport && node.network !== 'tcp') {
      const clashTransport = TransportHandler.toClashFormat(node);
      Object.assign(clashNode, clashTransport);
    }

    return clashNode;
  } catch (error) {
    return ParserErrorHandler.handleConversionError('VMESS', 'toClash', node, error);
  }
}

/**
 * 从 Clash 格式解析
 * @param {Object} clashNode - Clash 格式节点
 * @returns {Object|null} 标准节点格式
 */
export function fromClashFormat(clashNode) {
  try {
    if (!clashNode || typeof clashNode !== 'object') {
      throw new Error('Invalid Clash node: must be an object');
    }

    const node = {
      type: ProxyTypes.VMESS,
      name: clashNode.name || `${clashNode.server}:${clashNode.port}`,
      server: clashNode.server,
      port: clashNode.port,
      uuid: clashNode.uuid,
      alterId: clashNode.alterId || 0,
      cipher: clashNode.cipher || 'auto',
      network: clashNode.network || 'tcp',
      tls: {
        enabled: !!clashNode.tls,
        serverName: clashNode.servername || ''
      }
    };

    // 使用统一传输层处理器解析传输配置
    if (node.network !== 'tcp') {
      const transport = TransportHandler.fromClashFormat(clashNode, node.network);
      if (Object.keys(transport).length > 0) {
        node.transport = transport;
      }
    }

    // 验证解析结果
    const fromClashValidation = NodeValidator.validateNode(node, 'VMESS');
    if (!fromClashValidation.isValid) {
      throw new Error(`Node validation failed: ${fromClashValidation.errors.join(', ')}`);
    }

    return node;
  } catch (error) {
    return ParserErrorHandler.handleConversionError('VMESS', 'fromClash', clashNode, error);
  }
}



/**
 * 验证节点配置（使用统一验证器）
 * @param {Object} node - 节点信息
 * @returns {boolean} 是否有效
 */
export function validateNode(node) {
  try {
    const validateValidation = NodeValidator.validateNode(node, 'VMESS');
    return validateValidation.isValid;
  } catch (error) {
    ParserErrorHandler.handleValidationError('VMESS', node, error.message);
    return false;
  }
}