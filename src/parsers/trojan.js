/**
 * Trojan 协议解析器
 */

import { ProxyTypes } from '../types.js';
import { smartUrlDecode } from '../utils/index.js';

/**
 * 解析 Trojan URL
 * 支持格式: trojan://password@server:port?params#name
 * @param {string} url - Trojan URL
 * @returns {Object|null} 解析后的节点信息
 */
export function parseTrojanUrl(url) {
  try {
    if (!url.startsWith('trojan://')) {
      return null;
    }

    const urlObj = new URL(url);
    const password = smartUrlDecode(urlObj.username);
    const server = urlObj.hostname;
    const port = parseInt(urlObj.port);
    const name = smartUrlDecode(urlObj.hash.slice(1)) || `${server}:${port}`;

    const params = new URLSearchParams(urlObj.search);

    return {
      type: ProxyTypes.TROJAN,
      name: name,
      server: server,
      port: port,
      password: password,
      network: params.get('type') || 'tcp',
      tls: {
        enabled: true, // Trojan 默认使用 TLS
        serverName: params.get('sni') || server,
        alpn: params.get('alpn') ? params.get('alpn').split(',') : [],
        fingerprint: params.get('fp') || '',
        skipCertVerify: params.get('allowInsecure') === '1'
      },
      transport: parseTransportParams(params)
    };
  } catch (error) {
    console.error('解析 Trojan URL 失败:', error);
    return null;
  }
}

/**
 * 生成 Trojan URL
 * @param {Object} node - 节点信息
 * @returns {string} Trojan URL
 */
export function generateTrojanUrl(node) {
  try {
    const url = new URL(`trojan://${encodeURIComponent(node.password)}@${node.server}:${node.port}`);

    const params = new URLSearchParams();

    if (node.network && node.network !== 'tcp') {
      params.set('type', node.network);
    }

    // TLS 配置
    if (node.tls) {
      if (node.tls.serverName && node.tls.serverName !== node.server) {
        params.set('sni', node.tls.serverName);
      }
      if (node.tls.alpn?.length) {
        params.set('alpn', node.tls.alpn.join(','));
      }
      if (node.tls.fingerprint) {
        params.set('fp', node.tls.fingerprint);
      }
      if (node.tls.skipCertVerify) {
        params.set('allowInsecure', '1');
      }
    }

    // 传输层配置
    addTransportParams(params, node);

    if (params.toString()) {
      url.search = params.toString();
    }
    url.hash = encodeURIComponent(node.name);

    return url.toString();
  } catch (error) {
    console.error('生成 Trojan URL 失败:', error);
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
    type: 'trojan',
    server: node.server,
    port: node.port,
    password: node.password,
    network: node.network || 'tcp'
  };

  // TLS 配置
  if (node.tls) {
    if (node.tls.serverName) {
      clashNode.sni = node.tls.serverName;
    }
    if (node.tls.alpn?.length) {
      clashNode.alpn = node.tls.alpn;
    }
    if (node.tls.skipCertVerify) {
      clashNode['skip-cert-verify'] = true;
    }
  }

  // 传输层配置
  addClashTransportConfig(clashNode, node);

  return clashNode;
}

/**
 * 从 Clash 格式解析
 * @param {Object} clashNode - Clash 格式节点
 * @returns {Object} 标准节点格式
 */
export function fromClashFormat(clashNode) {
  const node = {
    type: ProxyTypes.TROJAN,
    name: clashNode.name,
    server: clashNode.server,
    port: clashNode.port,
    password: clashNode.password,
    network: clashNode.network || 'tcp',
    tls: {
      enabled: true,
      serverName: clashNode.sni || clashNode.server,
      alpn: clashNode.alpn || [],
      fingerprint: '',
      skipCertVerify: !!clashNode['skip-cert-verify']
    },
    transport: {}
  };

  // 解析传输层配置
  parseClashTransportConfig(node, clashNode);

  return node;
}

/**
 * 解析传输层参数
 * @param {URLSearchParams} params - URL参数
 * @returns {Object} 传输层配置
 */
function parseTransportParams(params) {
  const transport = {};
  const network = params.get('type') || 'tcp';

  switch (network) {
    case 'ws':
      transport.path = params.get('path') || '/';
      transport.host = params.get('host') || '';
      break;
    case 'h2':
      transport.path = params.get('path') || '/';
      transport.host = params.get('host') || '';
      break;
    case 'grpc':
      transport.serviceName = params.get('serviceName') || params.get('servicename') || '';
      transport.mode = params.get('mode') || 'gun';
      break;
    case 'tcp':
      if (params.get('headerType') === 'http') {
        transport.headerType = 'http';
        transport.host = params.get('host') || '';
        transport.path = params.get('path') || '/';
      }
      break;
  }

  return transport;
}

/**
 * 添加传输层参数到URL
 * @param {URLSearchParams} params - URL参数
 * @param {Object} node - 节点信息
 */
function addTransportParams(params, node) {
  if (!node.transport) return;

  switch (node.network) {
    case 'ws':
      if (node.transport.path) params.set('path', node.transport.path);
      if (node.transport.host) params.set('host', node.transport.host);
      break;
    case 'h2':
      if (node.transport.path) params.set('path', node.transport.path);
      if (node.transport.host) params.set('host', node.transport.host);
      break;
    case 'grpc':
      if (node.transport.serviceName) params.set('servicename', node.transport.serviceName);
      if (node.transport.mode) params.set('mode', node.transport.mode);
      break;
    case 'tcp':
      if (node.transport.headerType === 'http') {
        params.set('headerType', 'http');
        if (node.transport.host) params.set('host', node.transport.host);
        if (node.transport.path) params.set('path', node.transport.path);
      }
      break;
  }
}

/**
 * 添加 Clash 传输层配置
 * @param {Object} clashNode - Clash 节点
 * @param {Object} node - 标准节点
 */
function addClashTransportConfig(clashNode, node) {
  if (!node.transport) return;

  switch (node.network) {
    case 'ws':
      clashNode['ws-opts'] = {
        path: node.transport.path || '/',
        headers: node.transport.host ? { Host: node.transport.host } : {}
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

/**
 * 解析 Clash 传输层配置
 * @param {Object} node - 标准节点
 * @param {Object} clashNode - Clash 节点
 */
function parseClashTransportConfig(node, clashNode) {
  switch (node.network) {
    case 'ws':
      if (clashNode['ws-opts']) {
        node.transport = {
          path: clashNode['ws-opts'].path || '/',
          host: clashNode['ws-opts'].headers?.Host || ''
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
    node.password &&
    node.port > 0 &&
    node.port < 65536
  );
}
