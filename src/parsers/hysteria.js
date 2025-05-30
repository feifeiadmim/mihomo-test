/**
 * Hysteria v1 协议解析器
 */

import { ProxyTypes } from '../types.js';
import { smartUrlDecode } from '../utils/index.js';

/**
 * 解析 Hysteria URL
 * @param {string} url - Hysteria URL
 * @returns {Object|null} 解析后的节点信息
 */
export function parseHysteriaUrl(url) {
  try {
    const urlObj = new URL(url);
    
    if (urlObj.protocol !== 'hysteria:') {
      return null;
    }

    const server = urlObj.hostname;
    const port = parseInt(urlObj.port) || 443;
    const password = smartUrlDecode(urlObj.username) || '';
    const name = smartUrlDecode(urlObj.hash.slice(1)) || `${server}:${port}`;
    
    const params = new URLSearchParams(urlObj.search);

    return {
      type: ProxyTypes.HYSTERIA,
      name: name,
      server: server,
      port: port,
      password: password,
      auth: password,
      protocol: params.get('protocol') || 'udp',
      obfs: params.get('obfs') || '',
      tls: {
        enabled: true, // Hysteria v1 默认使用 TLS
        serverName: params.get('peer') || params.get('sni') || server,
        alpn: params.get('alpn') ? params.get('alpn').split(',') : ['h3'],
        skipCertVerify: params.get('insecure') === '1'
      },
      bandwidth: {
        up: params.get('upmbps') || params.get('up') || '',
        down: params.get('downmbps') || params.get('down') || ''
      },
      fastOpen: params.get('fastopen') === '1',
      lazy: params.get('lazy') === '1'
    };
  } catch (error) {
    console.error('解析 Hysteria URL 失败:', error);
    return null;
  }
}

/**
 * 生成 Hysteria URL
 * @param {Object} node - 节点信息
 * @returns {string|null} Hysteria URL
 */
export function generateHysteriaUrl(node) {
  try {
    const params = new URLSearchParams();
    
    if (node.protocol && node.protocol !== 'udp') {
      params.set('protocol', node.protocol);
    }
    
    if (node.obfs) {
      params.set('obfs', node.obfs);
    }
    
    if (node.tls?.serverName && node.tls.serverName !== node.server) {
      params.set('peer', node.tls.serverName);
    }
    
    if (node.tls?.skipCertVerify) {
      params.set('insecure', '1');
    }
    
    if (node.tls?.alpn && node.tls.alpn.length > 0 && node.tls.alpn.join(',') !== 'h3') {
      params.set('alpn', node.tls.alpn.join(','));
    }
    
    if (node.bandwidth?.up) {
      params.set('upmbps', node.bandwidth.up);
    }
    
    if (node.bandwidth?.down) {
      params.set('downmbps', node.bandwidth.down);
    }
    
    if (node.fastOpen) {
      params.set('fastopen', '1');
    }
    
    if (node.lazy) {
      params.set('lazy', '1');
    }

    const queryString = params.toString();
    const auth = encodeURIComponent(node.password || node.auth || '');
    const name = encodeURIComponent(node.name);
    
    return `hysteria://${auth}@${node.server}:${node.port}${queryString ? '?' + queryString : ''}#${name}`;
  } catch (error) {
    console.error('生成 Hysteria URL 失败:', error);
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
    type: 'hysteria',
    server: node.server,
    port: node.port,
    password: node.password || node.auth,
    protocol: node.protocol || 'udp'
  };

  if (node.obfs) {
    clashNode.obfs = node.obfs;
  }

  if (node.tls?.serverName && node.tls.serverName !== node.server) {
    clashNode.sni = node.tls.serverName;
  }

  if (node.tls?.skipCertVerify) {
    clashNode['skip-cert-verify'] = true;
  }

  if (node.tls?.alpn && node.tls.alpn.length > 0) {
    clashNode.alpn = node.tls.alpn;
  }

  if (node.bandwidth?.up) {
    clashNode.up = node.bandwidth.up;
  }

  if (node.bandwidth?.down) {
    clashNode.down = node.bandwidth.down;
  }

  if (node.fastOpen) {
    clashNode['fast-open'] = true;
  }

  if (node.lazy) {
    clashNode.lazy = true;
  }

  return clashNode;
}

/**
 * 从 Clash 格式解析
 * @param {Object} clashNode - Clash 格式节点
 * @returns {Object} 标准节点格式
 */
export function fromClashFormat(clashNode) {
  return {
    type: ProxyTypes.HYSTERIA,
    name: clashNode.name,
    server: clashNode.server,
    port: clashNode.port,
    password: clashNode.password,
    auth: clashNode.password,
    protocol: clashNode.protocol || 'udp',
    obfs: clashNode.obfs || '',
    tls: {
      enabled: true,
      serverName: clashNode.sni || clashNode.server,
      alpn: clashNode.alpn || ['h3'],
      skipCertVerify: !!clashNode['skip-cert-verify']
    },
    bandwidth: {
      up: clashNode.up || '',
      down: clashNode.down || ''
    },
    fastOpen: !!clashNode['fast-open'],
    lazy: !!clashNode.lazy
  };
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
    (node.password || node.auth) &&
    node.port > 0 &&
    node.port < 65536
  );
}
