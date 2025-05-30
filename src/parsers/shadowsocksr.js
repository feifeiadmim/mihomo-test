/**
 * ShadowsocksR (SSR) 协议解析器
 */

import { ProxyTypes } from '../types.js';
import { smartUrlDecode, safeBtoa, safeAtob } from '../utils/index.js';

/**
 * 解析 ShadowsocksR URL
 * 支持格式: ssr://base64(server:port:protocol:method:obfs:password_base64/?params)
 * @param {string} url - SSR URL
 * @returns {Object|null} 解析后的节点信息
 */
export function parseShadowsocksRUrl(url) {
  try {
    if (!url.startsWith('ssr://')) {
      return null;
    }

    // 移除协议前缀并解码base64
    const base64Content = url.slice(6);
    const decoded = safeAtob(base64Content);

    // 分离主要部分和参数部分
    const [mainPart, paramsPart] = decoded.split('/?');

    // 解析主要部分: server:port:protocol:method:obfs:password_base64
    // 使用正则表达式来更准确地分割，避免密码中的冒号问题
    const match = mainPart.match(/^([^:]+):(\d+):([^:]+):([^:]+):([^:]+):(.+)$/);
    if (!match) {
      return null;
    }

    const [, server, portStr, protocol, method, obfs, passwordBase64] = match;
    const port = parseInt(portStr);

    // 解码密码
    let password;
    try {
      password = atob(passwordBase64);
    } catch (e) {
      password = Buffer.from(passwordBase64, 'base64').toString('utf8');
    }
    // 对密码进行URL解码
    password = smartUrlDecode(password);

    // 解析参数
    const params = new URLSearchParams(paramsPart || '');

    // 安全解码参数
    const safeDecodeParam = (param) => {
      if (!param) return '';
      try {
        const decoded = atob(param);
        return smartUrlDecode(decoded);
      } catch (e) {
        const decoded = Buffer.from(param, 'base64').toString('utf8');
        return smartUrlDecode(decoded);
      }
    };

    return {
      type: ProxyTypes.SHADOWSOCKSR,
      name: params.get('remarks') ? safeDecodeParam(params.get('remarks')) : `${server}:${port}`,
      server: server,
      port: port,
      password: password,
      method: method,
      protocol: protocol,
      protocolParam: params.get('protoparam') ? safeDecodeParam(params.get('protoparam')) : '',
      obfs: obfs,
      obfsParam: params.get('obfsparam') ? safeDecodeParam(params.get('obfsparam')) : '',
      group: params.get('group') ? safeDecodeParam(params.get('group')) : ''
    };
  } catch (error) {
    console.error('解析 ShadowsocksR URL 失败:', error);
    return null;
  }
}

/**
 * 生成 ShadowsocksR URL
 * @param {Object} node - 节点信息
 * @returns {string} SSR URL
 */
export function generateShadowsocksRUrl(node) {
  try {
    let passwordBase64, base64Content;

    // 安全的base64编码
    passwordBase64 = safeBtoa(node.password);

    const mainPart = `${node.server}:${node.port}:${node.protocol}:${node.method}:${node.obfs}:${passwordBase64}`;

    const params = new URLSearchParams();

    // 安全的参数编码
    if (node.name) {
      params.set('remarks', safeBtoa(node.name));
    }

    if (node.protocolParam) {
      params.set('protoparam', safeBtoa(node.protocolParam));
    }

    if (node.obfsParam) {
      params.set('obfsparam', safeBtoa(node.obfsParam));
    }

    if (node.group) {
      params.set('group', safeBtoa(node.group));
    }

    const fullContent = params.toString() ? `${mainPart}/?${params.toString()}` : mainPart;

    // 安全的最终编码
    base64Content = safeBtoa(fullContent);

    return `ssr://${base64Content}`;
  } catch (error) {
    console.error('生成 ShadowsocksR URL 失败:', error);
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
    type: 'ssr',
    server: node.server,
    port: node.port,
    cipher: node.method,
    password: node.password,
    protocol: node.protocol,
    obfs: node.obfs
  };

  // 添加协议参数
  if (node.protocolParam) {
    clashNode['protocol-param'] = node.protocolParam;
  }

  // 添加混淆参数
  if (node.obfsParam) {
    clashNode['obfs-param'] = node.obfsParam;
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
    type: ProxyTypes.SHADOWSOCKSR,
    name: clashNode.name,
    server: clashNode.server,
    port: clashNode.port,
    password: clashNode.password,
    method: clashNode.cipher,
    protocol: clashNode.protocol,
    protocolParam: clashNode['protocol-param'] || '',
    obfs: clashNode.obfs,
    obfsParam: clashNode['obfs-param'] || '',
    group: ''
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
    node.password &&
    node.method &&
    node.protocol &&
    node.obfs &&
    node.port > 0 &&
    node.port < 65536
  );
}
