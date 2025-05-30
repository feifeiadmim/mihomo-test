/**
 * VMess 协议解析器
 */

import { ProxyTypes } from '../types.js';
import { safeBtoa, safeAtob } from '../utils/index.js';
import { CachedParser, globalRegexCache } from '../utils/parser-cache.js';
import {
  globalErrorHandler,
  ParseError,
  ParseErrorTypes,
  ValidationRules
} from '../utils/error-handler.js';

/**
 * 解析 VMess URL
 * 支持格式: vmess://base64(json)
 * @param {string} url - VMess URL
 * @returns {Object|null} 解析后的节点信息
 */
export function parseVMessUrl(url) {
  try {
    if (!url.startsWith('vmess://')) {
      return null;
    }

    // 移除协议前缀并解码base64
    const base64Content = url.slice(8);
    const jsonString = safeAtob(base64Content);
    const config = JSON.parse(jsonString);

    const node = {
      type: ProxyTypes.VMESS,
      name: config.ps || `${config.add}:${config.port}`,
      server: config.add,
      port: parseInt(config.port),
      uuid: config.id,
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

    // 处理传输层配置
    const transport = parseTransport(config);
    if (Object.keys(transport).length > 0) {
      node.transport = transport;
      // 同时支持Clash格式
      node[`${node.network}-opts`] = transport;
    }

    return node;
  } catch (error) {
    console.error('解析 VMess URL 失败:', error);
    return null;
  }
}

/**
 * 生成 VMess URL
 * @param {Object} node - 节点信息
 * @returns {string} VMess URL
 */
export function generateVMessUrl(node) {
  try {
    const config = {
      v: '2',
      ps: node.name,
      add: node.server,
      port: node.port.toString(),
      id: node.uuid,
      aid: node.alterId.toString(),
      scy: node.cipher,
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

    // 处理传输层配置
    if (node.network && node.network !== 'tcp') {
      const transportOpts = node[`${node.network}-opts`] || node.transport;

      switch (node.network) {
        case 'ws':
          config.path = transportOpts?.path || '/';
          config.host = transportOpts?.headers?.Host || '';
          // 支持HTTP Upgrade
          if (transportOpts?.['v2ray-http-upgrade']) {
            config.net = 'httpupgrade';
          }
          break;

        case 'h2':
          config.path = Array.isArray(transportOpts?.path) ?
            transportOpts.path[0] : (transportOpts?.path || '/');
          config.host = Array.isArray(transportOpts?.host) ?
            transportOpts.host[0] : (transportOpts?.host || '');
          break;

        case 'grpc':
          config.path = transportOpts?.['grpc-service-name'] ||
            transportOpts?.serviceName || '';
          config.type = transportOpts?.['_grpc-type'] ||
            transportOpts?.mode || 'gun';
          if (transportOpts?.['_grpc-authority']) {
            config.host = transportOpts['_grpc-authority'];
          }
          break;

        case 'kcp':
          config.type = transportOpts?.['_kcp-type'] ||
            transportOpts?.headerType || 'none';
          config.path = transportOpts?.['_kcp-path'] || '';
          config.host = transportOpts?.['_kcp-host'] || '';
          break;

        case 'quic':
          config.type = transportOpts?.['_quic-type'] ||
            transportOpts?.headerType || 'none';
          config.path = transportOpts?.['_quic-path'] || '';
          config.host = transportOpts?.['_quic-host'] || '';
          break;

        case 'http':
          config.net = 'tcp';
          config.type = 'http';
          config.path = Array.isArray(transportOpts?.path) ?
            transportOpts.path[0] : (transportOpts?.path || '/');
          config.host = Array.isArray(transportOpts?.headers?.Host) ?
            transportOpts.headers.Host[0] : (transportOpts?.headers?.Host || '');
          break;
      }
    }

    const jsonString = JSON.stringify(config);
    const base64Content = safeBtoa(jsonString);
    return `vmess://${base64Content}`;
  } catch (error) {
    console.error('生成 VMess URL 失败:', error);
    return null;
  }
}

/**
 * 转换为 Clash 格式
 * @param {Object} node - 节点信息
 * @returns {Object} Clash 格式节点
 */
export function toClashFormat(node) {
  const clashNode = {
    name: node.name,
    type: 'vmess',
    server: node.server,
    port: node.port,
    uuid: node.uuid,
    alterId: node.alterId,
    cipher: node.cipher,
    network: node.network
  };

  // TLS 配置
  if (node.tls?.enabled) {
    clashNode.tls = true;
    if (node.tls.serverName) {
      clashNode.servername = node.tls.serverName;
    }
  }

  // 传输层配置
  if (node.transport) {
    switch (node.network) {
      case 'ws':
        clashNode['ws-opts'] = {
          path: node.transport.path || '/',
          headers: node.transport.headers || {}
        };
        break;
      case 'h2':
        clashNode['h2-opts'] = {
          host: node.transport.host ? [node.transport.host] : [],
          path: node.transport.path || '/'
        };
        break;
      case 'grpc':
        clashNode['grpc-opts'] = {
          'grpc-service-name': node.transport.serviceName || ''
        };
        break;
    }
  }

  return clashNode;
}

/**
 * 从 Clash 格式解析
 * @param {Object} clashNode - Clash 格式节点
 * @returns {Object} 标准节点格式
 */
export function fromClashFormat(clashNode) {
  const node = {
    type: ProxyTypes.VMESS,
    name: clashNode.name,
    server: clashNode.server,
    port: clashNode.port,
    uuid: clashNode.uuid,
    alterId: clashNode.alterId || 0,
    cipher: clashNode.cipher || 'auto',
    network: clashNode.network || 'tcp',
    tls: {
      enabled: !!clashNode.tls,
      serverName: clashNode.servername || ''
    },
    transport: {}
  };

  // 解析传输层配置
  switch (node.network) {
    case 'ws':
      if (clashNode['ws-opts']) {
        node.transport = {
          path: clashNode['ws-opts'].path || '/',
          headers: clashNode['ws-opts'].headers || {}
        };
      }
      break;
    case 'h2':
      if (clashNode['h2-opts']) {
        node.transport = {
          host: clashNode['h2-opts'].host?.[0] || '',
          path: clashNode['h2-opts'].path || '/'
        };
      }
      break;
    case 'grpc':
      if (clashNode['grpc-opts']) {
        node.transport = {
          serviceName: clashNode['grpc-opts']['grpc-service-name'] || ''
        };
      }
      break;
  }

  return node;
}

/**
 * 解析传输层配置
 * @param {Object} config - VMess 配置
 * @returns {Object} 传输层配置
 */
function parseTransport(config) {
  const transport = {};

  switch (config.net) {
    case 'ws':
      transport.path = config.path || '/';
      transport.headers = {};
      if (config.host) {
        transport.headers.Host = config.host;
      }
      break;

    case 'httpupgrade':
      // HTTP Upgrade 转换为 WebSocket
      transport.path = config.path || '/';
      transport.headers = {};
      if (config.host) {
        transport.headers.Host = config.host;
      }
      transport['v2ray-http-upgrade'] = true;
      transport['v2ray-http-upgrade-fast-open'] = true;
      break;

    case 'h2':
      transport.host = config.host ? [config.host] : [];
      transport.path = config.path || '/';
      break;

    case 'grpc':
      transport['grpc-service-name'] = config.path || '';
      transport['_grpc-type'] = config.type || 'gun';
      if (config.host) {
        transport['_grpc-authority'] = config.host;
      }
      break;

    case 'kcp':
      transport['_kcp-type'] = config.type || 'none';
      transport['_kcp-host'] = config.host || '';
      transport['_kcp-path'] = config.path || '';
      break;

    case 'quic':
      transport['_quic-type'] = config.type || 'none';
      transport['_quic-host'] = config.host || '';
      transport['_quic-path'] = config.path || '';
      break;

    case 'tcp':
      if (config.type === 'http') {
        // TCP + HTTP 伪装
        transport.path = config.path ? [config.path] : ['/'];
        transport.headers = {};
        if (config.host) {
          transport.headers.Host = [config.host];
        }
      }
      break;
  }

  return transport;
}

/**
 * 验证节点配置
 * @param {Object} node - 节点信息
 * @returns {boolean} 是否有效
 */
export function validateNode(node) {
  return !!(
    node.server &&
    node.port &&
    node.uuid &&
    node.port > 0 &&
    node.port < 65536 &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(node.uuid)
  );
}

/**
 * 增强的VMess解析器类
 * 集成缓存和错误处理机制
 */
export class EnhancedVMessParser extends CachedParser {
  constructor() {
    super('Enhanced VMess Parser');
    this.vmessRegex = globalRegexCache.get('^vmess://', 'i');
  }

  /**
   * 测试是否为VMess URL
   */
  test(url) {
    return this.vmessRegex.test(url);
  }

  /**
   * 实际解析方法
   */
  doParse(url) {
    // 验证URL格式
    globalErrorHandler.validateUrl(url);

    if (!this.test(url)) {
      throw new ParseError(
        ParseErrorTypes.INVALID_FORMAT,
        'Not a valid VMess URL',
        { url: url.substring(0, 50) + '...' }
      );
    }

    const base64Content = url.slice(8);
    const jsonString = globalErrorHandler.safeBase64Decode(base64Content);
    const config = globalErrorHandler.safeJsonParse(jsonString);

    return this.parseVMessConfig(config);
  }

  /**
   * 解析VMess配置
   */
  parseVMessConfig(config) {
    // 验证必需字段
    globalErrorHandler.validateRequiredFields(
      config,
      ['add', 'port', 'id'],
      'VMess config'
    );

    // 验证字段值
    const port = globalErrorHandler.smartPortHandling(config.port, 'vmess');
    globalErrorHandler.validateFieldValue(config.id, 'uuid', ValidationRules.uuid);

    const node = this.acquireObject('node');

    // 基础配置
    node.type = ProxyTypes.VMESS;
    node.name = config.ps || `${config.add}:${port}`;
    node.server = config.add;
    node.port = port;
    node.uuid = config.id;
    node.alterId = parseInt(config.aid) || 0;
    node.cipher = config.scy || 'auto';
    node.network = config.net || 'tcp';

    // TLS配置
    const tlsConfig = this.acquireObject('tls');
    tlsConfig.enabled = config.tls === 'tls' || config.tls === '1' || config.tls === 1 || config.tls === true;
    tlsConfig.serverName = config.sni || config.host || '';
    node.tls = tlsConfig;

    // 高级参数
    if (config.alpn) {
      node.alpn = config.alpn.split(',').map(s => s.trim());
    }

    if (config.fp) {
      node['client-fingerprint'] = config.fp;
    }

    // 传输层配置
    const transport = this.parseTransportConfig(config);
    if (Object.keys(transport).length > 0) {
      node.transport = transport;
      node[`${node.network}-opts`] = transport;
    }

    return node;
  }

  /**
   * 解析传输层配置
   */
  parseTransportConfig(config) {
    const transport = this.acquireObject('transport');

    switch (config.net) {
      case 'ws':
        transport.path = config.path || '/';
        transport.headers = {};
        if (config.host) {
          transport.headers.Host = config.host;
        }
        break;

      case 'httpupgrade':
        transport.path = config.path || '/';
        transport.headers = {};
        if (config.host) {
          transport.headers.Host = config.host;
        }
        transport['v2ray-http-upgrade'] = true;
        transport['v2ray-http-upgrade-fast-open'] = true;
        break;

      case 'h2':
        transport.host = config.host ? [config.host] : [];
        transport.path = config.path || '/';
        break;

      case 'grpc':
        transport['grpc-service-name'] = config.path || '';
        transport['_grpc-type'] = config.type || 'gun';
        if (config.host) {
          transport['_grpc-authority'] = config.host;
        }
        break;

      case 'kcp':
        transport['_kcp-type'] = config.type || 'none';
        transport['_kcp-host'] = config.host || '';
        transport['_kcp-path'] = config.path || '';
        break;

      case 'quic':
        transport['_quic-type'] = config.type || 'none';
        transport['_quic-host'] = config.host || '';
        transport['_quic-path'] = config.path || '';
        break;

      case 'tcp':
        if (config.type === 'http') {
          transport.path = config.path ? [config.path] : ['/'];
          transport.headers = {};
          if (config.host) {
            transport.headers.Host = [config.host];
          }
        }
        break;
    }

    return transport;
  }

  /**
   * 解析方法（使用缓存）
   */
  parse(url) {
    return this.cachedParse(url);
  }
}
