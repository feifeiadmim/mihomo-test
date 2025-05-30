/**
 * TUIC 协议解析器
 */

import { ProxyTypes } from '../types.js';
import { smartUrlDecode } from '../utils/index.js';

/**
 * 解析 TUIC URL
 * @param {string} url - TUIC URL
 * @returns {Object|null} 解析后的节点信息
 */
export function parseTuicUrl(url) {
  try {
    const urlObj = new URL(url);
    
    if (urlObj.protocol !== 'tuic:') {
      return null;
    }

    const server = urlObj.hostname;
    const port = parseInt(urlObj.port) || 443;
    const uuid = smartUrlDecode(urlObj.username) || '';
    const password = smartUrlDecode(urlObj.password) || '';
    const name = smartUrlDecode(urlObj.hash.slice(1)) || `${server}:${port}`;
    
    const params = new URLSearchParams(urlObj.search);

    return {
      type: ProxyTypes.TUIC,
      name: name,
      server: server,
      port: port,
      uuid: uuid,
      password: password,
      version: parseInt(params.get('version')) || 5,
      congestion: params.get('congestion_control') || params.get('congestion') || 'cubic',
      udpRelayMode: params.get('udp_relay_mode') || 'native',
      alpn: params.get('alpn') ? params.get('alpn').split(',') : ['h3'],
      tls: {
        enabled: true, // TUIC 默认使用 TLS
        serverName: params.get('sni') || params.get('peer') || server,
        skipCertVerify: params.get('allow_insecure') === '1' || params.get('insecure') === '1',
        disableSni: params.get('disable_sni') === '1'
      },
      heartbeat: params.get('heartbeat_interval') || '',
      reduceRtt: params.get('reduce_rtt') === '1'
    };
  } catch (error) {
    console.error('解析 TUIC URL 失败:', error);
    return null;
  }
}

/**
 * 生成 TUIC URL
 * @param {Object} node - 节点信息
 * @returns {string|null} TUIC URL
 */
export function generateTuicUrl(node) {
  try {
    const params = new URLSearchParams();
    
    if (node.version && node.version !== 5) {
      params.set('version', node.version.toString());
    }
    
    if (node.congestion && node.congestion !== 'cubic') {
      params.set('congestion_control', node.congestion);
    }
    
    if (node.udpRelayMode && node.udpRelayMode !== 'native') {
      params.set('udp_relay_mode', node.udpRelayMode);
    }
    
    if (node.alpn && node.alpn.length > 0 && node.alpn.join(',') !== 'h3') {
      params.set('alpn', node.alpn.join(','));
    }
    
    if (node.tls?.serverName && node.tls.serverName !== node.server) {
      params.set('sni', node.tls.serverName);
    }
    
    if (node.tls?.skipCertVerify) {
      params.set('allow_insecure', '1');
    }
    
    if (node.tls?.disableSni) {
      params.set('disable_sni', '1');
    }
    
    if (node.heartbeat) {
      params.set('heartbeat_interval', node.heartbeat);
    }
    
    if (node.reduceRtt) {
      params.set('reduce_rtt', '1');
    }

    const queryString = params.toString();
    const auth = `${encodeURIComponent(node.uuid)}:${encodeURIComponent(node.password)}`;
    const name = encodeURIComponent(node.name);
    
    return `tuic://${auth}@${node.server}:${node.port}${queryString ? '?' + queryString : ''}#${name}`;
  } catch (error) {
    console.error('生成 TUIC URL 失败:', error);
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
    type: 'tuic',
    server: node.server,
    port: node.port,
    uuid: node.uuid,
    password: node.password,
    version: node.version || 5
  };

  if (node.congestion && node.congestion !== 'cubic') {
    clashNode['congestion-controller'] = node.congestion;
  }

  if (node.udpRelayMode && node.udpRelayMode !== 'native') {
    clashNode['udp-relay-mode'] = node.udpRelayMode;
  }

  if (node.alpn && node.alpn.length > 0) {
    clashNode.alpn = node.alpn;
  }

  if (node.tls?.serverName && node.tls.serverName !== node.server) {
    clashNode.sni = node.tls.serverName;
  }

  if (node.tls?.skipCertVerify) {
    clashNode['skip-cert-verify'] = true;
  }

  if (node.tls?.disableSni) {
    clashNode['disable-sni'] = true;
  }

  if (node.heartbeat) {
    clashNode['heartbeat-interval'] = node.heartbeat;
  }

  if (node.reduceRtt) {
    clashNode['reduce-rtt'] = true;
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
    type: ProxyTypes.TUIC,
    name: clashNode.name,
    server: clashNode.server,
    port: clashNode.port,
    uuid: clashNode.uuid,
    password: clashNode.password,
    version: clashNode.version || 5,
    congestion: clashNode['congestion-controller'] || 'cubic',
    udpRelayMode: clashNode['udp-relay-mode'] || 'native',
    alpn: clashNode.alpn || ['h3'],
    tls: {
      enabled: true,
      serverName: clashNode.sni || clashNode.server,
      skipCertVerify: !!clashNode['skip-cert-verify'],
      disableSni: !!clashNode['disable-sni']
    },
    heartbeat: clashNode['heartbeat-interval'] || '',
    reduceRtt: !!clashNode['reduce-rtt']
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
    node.uuid &&
    node.password &&
    node.port > 0 &&
    node.port < 65536
  );
}
