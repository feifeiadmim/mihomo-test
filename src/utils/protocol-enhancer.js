/**
 * 协议参数完整性增强模块
 * 确保解析和生成过程中不丢失任何重要参数
 */

import { ProxyTypes } from '../types.js';

/**
 * 协议参数映射表
 * 定义各协议支持的所有参数及其别名
 */
export const ProtocolParameterMap = {
  [ProxyTypes.VMESS]: {
    // 基础参数
    basic: ['server', 'port', 'uuid', 'alterId', 'cipher', 'network'],
    // TLS相关
    tls: ['tls', 'sni', 'servername', 'skip-cert-verify', 'alpn', 'client-fingerprint'],
    // 传输层参数
    transport: {
      ws: ['path', 'headers', 'v2ray-http-upgrade', 'v2ray-http-upgrade-fast-open'],
      h2: ['host', 'path'],
      grpc: ['grpc-service-name', '_grpc-type', '_grpc-authority'],
      kcp: ['_kcp-type', '_kcp-host', '_kcp-path', 'seed', 'headerType'],
      quic: ['_quic-type', '_quic-host', '_quic-path', 'security', 'key'],
      tcp: ['path', 'headers']
    },
    // 高级参数
    advanced: ['reality-opts', 'flow', 'seed', 'headerType', '_mode', '_extra']
  },

  [ProxyTypes.VLESS]: {
    basic: ['server', 'port', 'uuid', 'flow'],
    tls: ['security', 'sni', 'skip-cert-verify', 'alpn', 'client-fingerprint'],
    transport: {
      ws: ['path', 'host', 'headers'],
      h2: ['host', 'path'],
      grpc: ['serviceName', 'authority', 'mode'],
      kcp: ['seed', 'headerType', 'type'],
      quic: ['security', 'key', 'headerType']
    },
    advanced: ['reality-opts', 'public-key', 'short-id', 'spider-x']
  },

  [ProxyTypes.TROJAN]: {
    basic: ['server', 'port', 'password'],
    tls: ['sni', 'skip-cert-verify', 'alpn', 'client-fingerprint'],
    transport: {
      ws: ['path', 'host', 'headers'],
      h2: ['host', 'path'],
      grpc: ['serviceName', 'mode']
    },
    advanced: ['flow']
  },

  [ProxyTypes.HYSTERIA2]: {
    basic: ['server', 'port', 'password'],
    tls: ['sni', 'skip-cert-verify', 'alpn', 'tls-fingerprint'],
    advanced: ['hop-interval', 'keepalive', 'obfs', 'obfs-password', 'ports', 'tfo']
  },

  [ProxyTypes.SHADOWSOCKS]: {
    basic: ['server', 'port', 'cipher', 'password'],
    plugin: ['plugin', 'plugin-opts'],
    advanced: ['udp-over-tcp', 'tfo', 'mptcp']
  }
};

/**
 * 参数别名映射
 * 处理不同客户端使用的不同参数名
 */
export const ParameterAliases = {
  // 服务器地址别名
  server: ['add', 'address', 'hostname', 'host'],
  // 端口别名
  port: ['port'],
  // UUID别名
  uuid: ['id', 'user', 'username'],
  // 密码别名
  password: ['pass', 'passwd', 'pwd'],
  // SNI别名
  sni: ['servername', 'server-name', 'peer'],
  // 跳过证书验证别名
  'skip-cert-verify': ['allowInsecure', 'allow-insecure', 'insecure', 'verify-cert'],
  // ALPN别名
  alpn: ['alpn'],
  // 客户端指纹别名
  'client-fingerprint': ['fp', 'fingerprint', 'client-fp'],
  // 传输协议别名
  network: ['net', 'type', 'transport'],
  // WebSocket路径别名
  path: ['ws-path', 'http-path', 'grpc-service-name'],
  // 主机头别名
  host: ['ws-host', 'http-host', 'h2-host']
};

/**
 * 协议参数增强器
 */
export class ProtocolParameterEnhancer {
  constructor() {
    this.parameterMap = ProtocolParameterMap;
    this.aliases = ParameterAliases;
  }

  /**
   * 标准化参数名
   * @param {string} paramName - 参数名
   * @returns {string} 标准化后的参数名
   */
  normalizeParameterName(paramName) {
    for (const [standard, aliases] of Object.entries(this.aliases)) {
      if (aliases.includes(paramName) || paramName === standard) {
        return standard;
      }
    }
    return paramName;
  }

  /**
   * 增强节点参数
   * @param {Object} node - 原始节点
   * @returns {Object} 增强后的节点
   */
  enhanceNode(node) {
    if (!node || !node.type) {
      return node;
    }

    const enhanced = { ...node };
    const protocolParams = this.parameterMap[node.type];

    if (!protocolParams) {
      return enhanced;
    }

    // 标准化基础参数
    if (protocolParams.basic) {
      for (const param of protocolParams.basic) {
        this.ensureParameter(enhanced, param);
      }
    }

    // 处理TLS参数
    if (protocolParams.tls) {
      this.enhanceTLSParameters(enhanced, protocolParams.tls);
    }

    // 处理传输层参数
    if (protocolParams.transport && enhanced.network) {
      this.enhanceTransportParameters(enhanced, protocolParams.transport);
    }

    // 处理高级参数
    if (protocolParams.advanced) {
      this.enhanceAdvancedParameters(enhanced, protocolParams.advanced);
    }

    // 处理插件参数
    if (protocolParams.plugin) {
      this.enhancePluginParameters(enhanced, protocolParams.plugin);
    }

    return enhanced;
  }

  /**
   * 确保参数存在
   * @param {Object} node - 节点对象
   * @param {string} param - 参数名
   */
  ensureParameter(node, param) {
    const normalized = this.normalizeParameterName(param);
    
    // 如果标准化参数不存在，尝试从别名中找
    if (!(normalized in node)) {
      const aliases = this.aliases[normalized] || [];
      for (const alias of aliases) {
        if (alias in node) {
          node[normalized] = node[alias];
          break;
        }
      }
    }
  }

  /**
   * 增强TLS参数
   * @param {Object} node - 节点对象
   * @param {Array} tlsParams - TLS参数列表
   */
  enhanceTLSParameters(node, tlsParams) {
    for (const param of tlsParams) {
      this.ensureParameter(node, param);
    }

    // 处理TLS对象结构
    if (node.tls && typeof node.tls === 'object') {
      // 确保TLS对象包含所有必要字段
      if (!('enabled' in node.tls)) {
        node.tls.enabled = !!(node.tls || node['skip-cert-verify'] === false);
      }
      
      if (!('serverName' in node.tls) && node.sni) {
        node.tls.serverName = node.sni;
      }
    }
  }

  /**
   * 增强传输层参数
   * @param {Object} node - 节点对象
   * @param {Object} transportParams - 传输层参数映射
   */
  enhanceTransportParameters(node, transportParams) {
    const networkParams = transportParams[node.network];
    if (!networkParams) return;

    for (const param of networkParams) {
      this.ensureParameter(node, param);
    }

    // 确保传输层配置对象存在
    const transportKey = `${node.network}-opts`;
    if (!node[transportKey] && node.transport) {
      node[transportKey] = { ...node.transport };
    }

    // 处理特殊的传输层参数
    this.handleSpecialTransportParams(node);
  }

  /**
   * 处理特殊的传输层参数
   * @param {Object} node - 节点对象
   */
  handleSpecialTransportParams(node) {
    switch (node.network) {
      case 'ws':
        // 确保WebSocket headers格式正确
        if (node['ws-opts']?.headers && typeof node['ws-opts'].headers === 'string') {
          try {
            node['ws-opts'].headers = JSON.parse(node['ws-opts'].headers);
          } catch {
            // 如果解析失败，转换为Host头
            node['ws-opts'].headers = { Host: node['ws-opts'].headers };
          }
        }
        break;

      case 'h2':
        // 确保HTTP/2 host是数组格式
        if (node['h2-opts']?.host && !Array.isArray(node['h2-opts'].host)) {
          node['h2-opts'].host = [node['h2-opts'].host];
        }
        break;

      case 'grpc':
        // 标准化gRPC参数名
        if (node['grpc-opts']) {
          const grpcOpts = node['grpc-opts'];
          if (grpcOpts.serviceName && !grpcOpts['grpc-service-name']) {
            grpcOpts['grpc-service-name'] = grpcOpts.serviceName;
          }
        }
        break;
    }
  }

  /**
   * 增强高级参数
   * @param {Object} node - 节点对象
   * @param {Array} advancedParams - 高级参数列表
   */
  enhanceAdvancedParameters(node, advancedParams) {
    for (const param of advancedParams) {
      this.ensureParameter(node, param);
    }

    // 处理Reality配置
    if (node['reality-opts']) {
      this.enhanceRealityParameters(node);
    }

    // 处理ALPN数组
    if (node.alpn && typeof node.alpn === 'string') {
      node.alpn = node.alpn.split(',').map(s => s.trim());
    }
  }

  /**
   * 增强Reality参数
   * @param {Object} node - 节点对象
   */
  enhanceRealityParameters(node) {
    const reality = node['reality-opts'];
    if (!reality || typeof reality !== 'object') return;

    // 标准化Reality参数名
    const realityAliases = {
      'public-key': ['pbk', 'publicKey'],
      'short-id': ['sid', 'shortId'],
      'spider-x': ['spx', 'spiderX']
    };

    for (const [standard, aliases] of Object.entries(realityAliases)) {
      if (!(standard in reality)) {
        for (const alias of aliases) {
          if (alias in reality) {
            reality[standard] = reality[alias];
            break;
          }
        }
      }
    }
  }

  /**
   * 增强插件参数
   * @param {Object} node - 节点对象
   * @param {Array} pluginParams - 插件参数列表
   */
  enhancePluginParameters(node, pluginParams) {
    for (const param of pluginParams) {
      this.ensureParameter(node, param);
    }

    // 标准化插件配置
    if (node.plugin && node['plugin-opts']) {
      this.normalizePluginOptions(node);
    }
  }

  /**
   * 标准化插件选项
   * @param {Object} node - 节点对象
   */
  normalizePluginOptions(node) {
    const opts = node['plugin-opts'];
    
    switch (node.plugin) {
      case 'obfs':
      case 'simple-obfs':
        // 标准化obfs参数
        if (opts.obfs && !opts.mode) opts.mode = opts.obfs;
        if (opts['obfs-host'] && !opts.host) opts.host = opts['obfs-host'];
        break;

      case 'v2ray-plugin':
        // 标准化v2ray-plugin参数
        if (opts.mode === 'websocket' && !opts.path) opts.path = '/';
        break;

      case 'shadow-tls':
        // 确保shadow-tls版本
        if (!opts.version) opts.version = 3;
        break;
    }
  }

  /**
   * 验证参数完整性
   * @param {Object} node - 节点对象
   * @returns {Object} 验证结果
   */
  validateParameterCompleteness(node) {
    const result = {
      isComplete: true,
      missingRequired: [],
      missingOptional: [],
      warnings: []
    };

    if (!node || !node.type) {
      result.isComplete = false;
      result.missingRequired.push('type');
      return result;
    }

    const protocolParams = this.parameterMap[node.type];
    if (!protocolParams) {
      result.warnings.push(`Unknown protocol: ${node.type}`);
      return result;
    }

    // 检查基础参数
    if (protocolParams.basic) {
      for (const param of protocolParams.basic) {
        if (!(param in node)) {
          result.missingRequired.push(param);
          result.isComplete = false;
        }
      }
    }

    // 检查传输层参数
    if (node.network && protocolParams.transport?.[node.network]) {
      const transportParams = protocolParams.transport[node.network];
      for (const param of transportParams) {
        if (!(param in node) && !(node[`${node.network}-opts`]?.[param])) {
          result.missingOptional.push(`${node.network}.${param}`);
        }
      }
    }

    return result;
  }
}

// 导出默认实例
export const defaultParameterEnhancer = new ProtocolParameterEnhancer();
