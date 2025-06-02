/**
 * 统一传输层处理器
 * 提供标准化的传输层配置解析、生成和转换功能
 * 消除各协议解析器中的重复代码，提高维护性
 */

import { ParserErrorHandler, ErrorTypes, ErrorSeverity } from './error-handler.js';

/**
 * 支持的传输协议类型
 */
export const TransportTypes = {
  TCP: 'tcp',
  WS: 'ws',
  WEBSOCKET: 'websocket',
  H2: 'h2',
  HTTP: 'http',
  GRPC: 'grpc',
  QUIC: 'quic',
  KCP: 'kcp'
};

/**
 * 传输层配置处理器类
 */
export class TransportHandler {
  static processingStats = {
    total: 0,
    successful: 0,
    failed: 0,
    byType: {}
  };

  /**
   * 解析传输层参数（从URL参数或JSON配置）
   * @param {URLSearchParams|Object} params - 参数对象
   * @param {string} network - 网络类型
   * @param {string} paramSource - 参数来源 ('url' | 'json' | 'clash')
   * @returns {Object} 传输层配置
   */
  static parseTransportParams(params, network, paramSource = 'url') {
    this.processingStats.total++;
    this.processingStats.byType[network] = (this.processingStats.byType[network] || 0) + 1;

    try {
      const transport = {};
      const normalizedNetwork = this.normalizeNetworkType(network);

      switch (normalizedNetwork) {
        case TransportTypes.WS:
          return this.parseWebSocketTransport(params, paramSource);
        case TransportTypes.H2:
          return this.parseHTTP2Transport(params, paramSource);
        case TransportTypes.GRPC:
          return this.parseGRPCTransport(params, paramSource);
        case TransportTypes.TCP:
          return this.parseTCPTransport(params, paramSource);
        case TransportTypes.QUIC:
          return this.parseQUICTransport(params, paramSource);
        case TransportTypes.KCP:
          return this.parseKCPTransport(params, paramSource);
        default:
          return transport;
      }
    } catch (error) {
      this.processingStats.failed++;
      ParserErrorHandler.logError(
        'TRANSPORT',
        'parse',
        error,
        { network, paramSource },
        ErrorTypes.PARSE_ERROR,
        ErrorSeverity.MEDIUM
      );
      return {};
    } finally {
      this.processingStats.successful = this.processingStats.total - this.processingStats.failed;
    }
  }

  /**
   * 解析WebSocket传输配置
   * @param {URLSearchParams|Object} params - 参数对象
   * @param {string} source - 参数来源
   * @returns {Object} WebSocket配置
   */
  static parseWebSocketTransport(params, source) {
    const transport = {};

    if (source === 'url') {
      transport.path = params.get('path') || '/';
      transport.host = params.get('host') || '';

      // 处理WebSocket headers
      const headers = {};
      for (const [key, value] of params.entries()) {
        if (key.startsWith('header-')) {
          headers[key.substring(7)] = value;
        }
      }
      if (Object.keys(headers).length > 0) {
        transport.headers = headers;
      }

      // 处理早期数据
      const earlyData = params.get('ed') || params.get('earlyData');
      if (earlyData) {
        transport.earlyData = parseInt(earlyData) || 0;
      }

    } else if (source === 'json') {
      transport.path = params.path || '/';
      transport.host = params.host || '';
      if (params.headers && typeof params.headers === 'object') {
        transport.headers = { ...params.headers };
      }
      if (params.earlyData !== undefined) {
        transport.earlyData = params.earlyData;
      }

    } else if (source === 'clash') {
      transport.path = params.path || '/';
      if (params.headers && typeof params.headers === 'object') {
        transport.headers = { ...params.headers };
        // 从headers中提取host
        if (params.headers.Host) {
          transport.host = params.headers.Host;
        }
      }
      if (params['early-data-header-name']) {
        transport.earlyDataHeaderName = params['early-data-header-name'];
      }
    }

    return transport;
  }

  /**
   * 解析HTTP/2传输配置
   * @param {URLSearchParams|Object} params - 参数对象
   * @param {string} source - 参数来源
   * @returns {Object} HTTP/2配置
   */
  static parseHTTP2Transport(params, source) {
    const transport = {};

    if (source === 'url') {
      transport.path = params.get('path') || '/';
      transport.host = params.get('host') || '';
      transport.method = params.get('method') || 'GET';

      // 处理HTTP headers
      const headers = {};
      for (const [key, value] of params.entries()) {
        if (key.startsWith('header-')) {
          headers[key.substring(7)] = value;
        }
      }
      if (Object.keys(headers).length > 0) {
        transport.headers = headers;
      }

    } else if (source === 'json') {
      transport.path = params.path || '/';
      transport.host = params.host || '';
      transport.method = params.method || 'GET';
      if (params.headers && typeof params.headers === 'object') {
        transport.headers = { ...params.headers };
      }

    } else if (source === 'clash') {
      transport.path = params.path || '/';
      transport.method = params.method || 'GET';
      if (Array.isArray(params.host) && params.host.length > 0) {
        transport.host = params.host[0];
      } else if (typeof params.host === 'string') {
        transport.host = params.host;
      }
    }

    return transport;
  }

  /**
   * 解析gRPC传输配置
   * @param {URLSearchParams|Object} params - 参数对象
   * @param {string} source - 参数来源
   * @returns {Object} gRPC配置
   */
  static parseGRPCTransport(params, source) {
    const transport = {};

    if (source === 'url') {
      transport.serviceName = params.get('serviceName') || params.get('servicename') || '';
      transport.mode = params.get('mode') || 'gun';
      transport.authority = params.get('authority') || '';
      transport.multiMode = params.get('multiMode') === 'true';

    } else if (source === 'json') {
      transport.serviceName = params.serviceName || params.servicename || '';
      transport.mode = params.mode || 'gun';
      transport.authority = params.authority || '';
      transport.multiMode = !!params.multiMode;

    } else if (source === 'clash') {
      transport.serviceName = params['grpc-service-name'] || '';
      transport.mode = params['grpc-mode'] || 'gun';
    }

    return transport;
  }

  /**
   * 解析TCP传输配置
   * @param {URLSearchParams|Object} params - 参数对象
   * @param {string} source - 参数来源
   * @returns {Object} TCP配置
   */
  static parseTCPTransport(params, source) {
    const transport = {};

    if (source === 'url') {
      const headerType = params.get('headerType') || params.get('type');
      if (headerType === 'http') {
        transport.headerType = 'http';
        transport.host = params.get('host') || '';
        transport.path = params.get('path') || '/';
        transport.method = params.get('method') || 'GET';
      }

    } else if (source === 'json') {
      if (params.header && params.header.type === 'http') {
        transport.headerType = 'http';
        transport.host = params.header.request?.headers?.Host?.[0] || '';
        transport.path = params.header.request?.path?.[0] || '/';
        transport.method = params.header.request?.method || 'GET';
      }

    } else if (source === 'clash') {
      // Clash中TCP通常不需要额外配置
    }

    return transport;
  }

  /**
   * 解析QUIC传输配置
   * @param {URLSearchParams|Object} params - 参数对象
   * @param {string} source - 参数来源
   * @returns {Object} QUIC配置
   */
  static parseQUICTransport(params, source) {
    const transport = {};

    if (source === 'url') {
      transport.security = params.get('security') || 'none';
      transport.key = params.get('key') || '';
      transport.headerType = params.get('headerType') || 'none';

    } else if (source === 'json') {
      transport.security = params.security || 'none';
      transport.key = params.key || '';
      transport.headerType = params.header?.type || 'none';
    }

    return transport;
  }

  /**
   * 解析KCP传输配置
   * @param {URLSearchParams|Object} params - 参数对象
   * @param {string} source - 参数来源
   * @returns {Object} KCP配置
   */
  static parseKCPTransport(params, source) {
    const transport = {};

    if (source === 'url') {
      transport.mtu = parseInt(params.get('mtu')) || 1350;
      transport.tti = parseInt(params.get('tti')) || 50;
      transport.uplinkCapacity = parseInt(params.get('uplinkCapacity')) || 5;
      transport.downlinkCapacity = parseInt(params.get('downlinkCapacity')) || 20;
      transport.congestion = params.get('congestion') === 'true';
      transport.readBufferSize = parseInt(params.get('readBufferSize')) || 2;
      transport.writeBufferSize = parseInt(params.get('writeBufferSize')) || 2;
      transport.headerType = params.get('headerType') || 'none';

    } else if (source === 'json') {
      transport.mtu = params.mtu || 1350;
      transport.tti = params.tti || 50;
      transport.uplinkCapacity = params.uplinkCapacity || 5;
      transport.downlinkCapacity = params.downlinkCapacity || 20;
      transport.congestion = !!params.congestion;
      transport.readBufferSize = params.readBufferSize || 2;
      transport.writeBufferSize = params.writeBufferSize || 2;
      transport.headerType = params.header?.type || 'none';
    }

    return transport;
  }

  /**
   * 添加传输层参数到URL
   * @param {URLSearchParams} params - URL参数对象
   * @param {Object} node - 节点对象
   */
  static addTransportParams(params, node) {
    if (!node.transport || !node.network) return;

    const normalizedNetwork = this.normalizeNetworkType(node.network);

    try {
      switch (normalizedNetwork) {
        case TransportTypes.WS:
          this.addWebSocketParams(params, node.transport);
          break;
        case TransportTypes.H2:
          this.addHTTP2Params(params, node.transport);
          break;
        case TransportTypes.GRPC:
          this.addGRPCParams(params, node.transport);
          break;
        case TransportTypes.TCP:
          this.addTCPParams(params, node.transport);
          break;
        case TransportTypes.QUIC:
          this.addQUICParams(params, node.transport);
          break;
        case TransportTypes.KCP:
          this.addKCPParams(params, node.transport);
          break;
      }
    } catch (error) {
      ParserErrorHandler.logError(
        'TRANSPORT',
        'addParams',
        error,
        { network: node.network },
        ErrorTypes.CONVERSION_ERROR,
        ErrorSeverity.MEDIUM
      );
    }
  }

  /**
   * 添加WebSocket参数
   * @param {URLSearchParams} params - URL参数
   * @param {Object} transport - 传输配置
   */
  static addWebSocketParams(params, transport) {
    if (transport.path) params.set('path', transport.path);
    if (transport.host) params.set('host', transport.host);

    // 添加headers
    if (transport.headers && typeof transport.headers === 'object') {
      for (const [key, value] of Object.entries(transport.headers)) {
        params.set(`header-${key}`, value);
      }
    }

    if (transport.earlyData !== undefined) {
      params.set('ed', transport.earlyData.toString());
    }
  }

  /**
   * 添加HTTP/2参数
   * @param {URLSearchParams} params - URL参数
   * @param {Object} transport - 传输配置
   */
  static addHTTP2Params(params, transport) {
    if (transport.path) params.set('path', transport.path);
    if (transport.host) params.set('host', transport.host);
    if (transport.method) params.set('method', transport.method);

    // 添加headers
    if (transport.headers && typeof transport.headers === 'object') {
      for (const [key, value] of Object.entries(transport.headers)) {
        params.set(`header-${key}`, value);
      }
    }
  }

  /**
   * 添加gRPC参数
   * @param {URLSearchParams} params - URL参数
   * @param {Object} transport - 传输配置
   */
  static addGRPCParams(params, transport) {
    if (transport.serviceName) params.set('servicename', transport.serviceName);
    if (transport.mode) params.set('mode', transport.mode);
    if (transport.authority) params.set('authority', transport.authority);
    if (transport.multiMode) params.set('multiMode', 'true');
  }

  /**
   * 添加TCP参数
   * @param {URLSearchParams} params - URL参数
   * @param {Object} transport - 传输配置
   */
  static addTCPParams(params, transport) {
    if (transport.headerType === 'http') {
      params.set('headerType', 'http');
      if (transport.host) params.set('host', transport.host);
      if (transport.path) params.set('path', transport.path);
      if (transport.method) params.set('method', transport.method);
    }
  }

  /**
   * 添加QUIC参数
   * @param {URLSearchParams} params - URL参数
   * @param {Object} transport - 传输配置
   */
  static addQUICParams(params, transport) {
    if (transport.security) params.set('security', transport.security);
    if (transport.key) params.set('key', transport.key);
    if (transport.headerType) params.set('headerType', transport.headerType);
  }

  /**
   * 添加KCP参数
   * @param {URLSearchParams} params - URL参数
   * @param {Object} transport - 传输配置
   */
  static addKCPParams(params, transport) {
    if (transport.mtu) params.set('mtu', transport.mtu.toString());
    if (transport.tti) params.set('tti', transport.tti.toString());
    if (transport.uplinkCapacity) params.set('uplinkCapacity', transport.uplinkCapacity.toString());
    if (transport.downlinkCapacity) params.set('downlinkCapacity', transport.downlinkCapacity.toString());
    if (transport.congestion) params.set('congestion', 'true');
    if (transport.readBufferSize) params.set('readBufferSize', transport.readBufferSize.toString());
    if (transport.writeBufferSize) params.set('writeBufferSize', transport.writeBufferSize.toString());
    if (transport.headerType) params.set('headerType', transport.headerType);
  }

  /**
   * 转换为Clash格式
   * @param {Object} node - 节点对象
   * @returns {Object} Clash传输配置
   */
  static toClashFormat(node) {
    if (!node.transport || !node.network) return {};

    const normalizedNetwork = this.normalizeNetworkType(node.network);

    try {
      switch (normalizedNetwork) {
        case TransportTypes.WS:
          return {
            'ws-opts': {
              path: node.transport.path || '/',
              headers: node.transport.headers || (node.transport.host ? { Host: node.transport.host } : {}),
              'early-data-header-name': node.transport.earlyDataHeaderName
            }
          };

        case TransportTypes.H2:
          return {
            'h2-opts': {
              host: node.transport.host ? [node.transport.host] : [],
              path: node.transport.path || '/',
              method: node.transport.method || 'GET'
            }
          };

        case TransportTypes.GRPC:
          return {
            'grpc-opts': {
              'grpc-service-name': node.transport.serviceName || '',
              'grpc-mode': node.transport.mode || 'gun'
            }
          };

        default:
          return {};
      }
    } catch (error) {
      ParserErrorHandler.logError(
        'TRANSPORT',
        'toClash',
        error,
        { network: node.network },
        ErrorTypes.CONVERSION_ERROR,
        ErrorSeverity.MEDIUM
      );
      return {};
    }
  }

  /**
   * 从Clash格式解析
   * @param {Object} clashNode - Clash节点配置
   * @param {string} network - 网络类型
   * @returns {Object} 标准传输配置
   */
  static fromClashFormat(clashNode, network) {
    const normalizedNetwork = this.normalizeNetworkType(network);

    try {
      switch (normalizedNetwork) {
        case TransportTypes.WS:
          if (clashNode['ws-opts']) {
            return {
              path: clashNode['ws-opts'].path || '/',
              headers: clashNode['ws-opts'].headers || {},
              host: clashNode['ws-opts'].headers?.Host || '',
              earlyDataHeaderName: clashNode['ws-opts']['early-data-header-name']
            };
          }
          break;

        case TransportTypes.H2:
          if (clashNode['h2-opts']) {
            return {
              host: clashNode['h2-opts'].host?.[0] || '',
              path: clashNode['h2-opts'].path || '/',
              method: clashNode['h2-opts'].method || 'GET'
            };
          }
          break;

        case TransportTypes.GRPC:
          if (clashNode['grpc-opts']) {
            return {
              serviceName: clashNode['grpc-opts']['grpc-service-name'] || '',
              mode: clashNode['grpc-opts']['grpc-mode'] || 'gun'
            };
          }
          break;
      }
    } catch (error) {
      ParserErrorHandler.logError(
        'TRANSPORT',
        'fromClash',
        error,
        { network },
        ErrorTypes.CONVERSION_ERROR,
        ErrorSeverity.MEDIUM
      );
    }

    return {};
  }

  /**
   * 标准化网络类型
   * @param {string} network - 网络类型
   * @returns {string} 标准化后的网络类型
   */
  static normalizeNetworkType(network) {
    if (!network || typeof network !== 'string') {
      return TransportTypes.TCP;
    }

    const normalized = network.toLowerCase().trim();

    switch (normalized) {
      case 'ws':
      case 'websocket':
        return TransportTypes.WS;
      case 'h2':
      case 'http':
        return TransportTypes.H2;
      case 'grpc':
        return TransportTypes.GRPC;
      case 'quic':
        return TransportTypes.QUIC;
      case 'kcp':
        return TransportTypes.KCP;
      case 'tcp':
      default:
        return TransportTypes.TCP;
    }
  }

  /**
   * 验证传输层配置
   * @param {Object} transport - 传输配置
   * @param {string} network - 网络类型
   * @returns {Object} 验证结果
   */
  static validateTransportConfig(transport, network) {
    const errors = [];
    const warnings = [];
    const normalizedNetwork = this.normalizeNetworkType(network);

    if (!transport || typeof transport !== 'object') {
      return {
        isValid: true, // 传输配置是可选的
        errors: [],
        warnings: ['No transport configuration provided, using defaults']
      };
    }

    switch (normalizedNetwork) {
      case TransportTypes.WS:
        if (transport.path && !transport.path.startsWith('/')) {
          warnings.push('WebSocket path should start with "/"');
        }
        if (transport.headers && typeof transport.headers !== 'object') {
          errors.push('WebSocket headers must be an object');
        }
        break;

      case TransportTypes.H2:
        if (transport.path && !transport.path.startsWith('/')) {
          warnings.push('HTTP/2 path should start with "/"');
        }
        if (transport.method && !['GET', 'POST', 'PUT', 'DELETE', 'HEAD', 'OPTIONS'].includes(transport.method.toUpperCase())) {
          warnings.push(`Unusual HTTP method: ${transport.method}`);
        }
        break;

      case TransportTypes.GRPC:
        if (!transport.serviceName) {
          warnings.push('gRPC service name is recommended');
        }
        if (transport.mode && !['gun', 'multi'].includes(transport.mode)) {
          warnings.push(`Unknown gRPC mode: ${transport.mode}`);
        }
        break;

      case TransportTypes.QUIC:
        if (transport.security && !['none', 'aes-128-gcm', 'chacha20-poly1305'].includes(transport.security)) {
          warnings.push(`Unknown QUIC security method: ${transport.security}`);
        }
        break;

      case TransportTypes.KCP:
        if (transport.mtu && (transport.mtu < 576 || transport.mtu > 1460)) {
          warnings.push('KCP MTU should be between 576 and 1460');
        }
        if (transport.tti && (transport.tti < 10 || transport.tti > 100)) {
          warnings.push('KCP TTI should be between 10 and 100');
        }
        break;
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * 获取传输层处理统计信息
   * @returns {Object} 统计信息
   */
  static getProcessingStats() {
    return {
      ...this.processingStats,
      successRate: this.processingStats.total > 0 ?
        (this.processingStats.successful / this.processingStats.total * 100).toFixed(2) + '%' : '0%',
      timestamp: new Date().toISOString()
    };
  }

  /**
   * 清除处理统计信息
   */
  static clearProcessingStats() {
    this.processingStats = {
      total: 0,
      successful: 0,
      failed: 0,
      byType: {}
    };
  }

  /**
   * 深度克隆传输配置（避免引用问题）
   * @param {Object} transport - 传输配置
   * @returns {Object} 克隆后的配置
   */
  static cloneTransportConfig(transport) {
    if (!transport || typeof transport !== 'object') {
      return {};
    }

    try {
      return JSON.parse(JSON.stringify(transport));
    } catch (error) {
      ParserErrorHandler.logError(
        'TRANSPORT',
        'clone',
        error,
        {},
        ErrorTypes.CONVERSION_ERROR,
        ErrorSeverity.LOW
      );
      return {};
    }
  }

  /**
   * 合并传输配置（用于配置继承）
   * @param {Object} baseConfig - 基础配置
   * @param {Object} overrideConfig - 覆盖配置
   * @returns {Object} 合并后的配置
   */
  static mergeTransportConfig(baseConfig, overrideConfig) {
    const base = this.cloneTransportConfig(baseConfig);
    const override = this.cloneTransportConfig(overrideConfig);

    return {
      ...base,
      ...override,
      // 特殊处理headers合并
      headers: {
        ...(base.headers || {}),
        ...(override.headers || {})
      }
    };
  }

  /**
   * 获取传输类型的默认配置
   * @param {string} network - 网络类型
   * @returns {Object} 默认配置
   */
  static getDefaultConfig(network) {
    const normalizedNetwork = this.normalizeNetworkType(network);

    switch (normalizedNetwork) {
      case TransportTypes.WS:
        return {
          path: '/',
          headers: {}
        };

      case TransportTypes.H2:
        return {
          path: '/',
          method: 'GET',
          headers: {}
        };

      case TransportTypes.GRPC:
        return {
          serviceName: '',
          mode: 'gun'
        };

      case TransportTypes.QUIC:
        return {
          security: 'none',
          headerType: 'none'
        };

      case TransportTypes.KCP:
        return {
          mtu: 1350,
          tti: 50,
          uplinkCapacity: 5,
          downlinkCapacity: 20,
          congestion: false,
          readBufferSize: 2,
          writeBufferSize: 2,
          headerType: 'none'
        };

      case TransportTypes.TCP:
      default:
        return {};
    }
  }

  /**
   * 检查传输配置是否为默认配置
   * @param {Object} transport - 传输配置
   * @param {string} network - 网络类型
   * @returns {boolean} 是否为默认配置
   */
  static isDefaultConfig(transport, network) {
    const defaultConfig = this.getDefaultConfig(network);

    try {
      return JSON.stringify(transport) === JSON.stringify(defaultConfig);
    } catch (error) {
      return false;
    }
  }

  /**
   * 优化传输配置（移除默认值以减少配置大小）
   * @param {Object} transport - 传输配置
   * @param {string} network - 网络类型
   * @returns {Object} 优化后的配置
   */
  static optimizeConfig(transport, network) {
    if (!transport || typeof transport !== 'object') {
      return {};
    }

    const defaultConfig = this.getDefaultConfig(network);
    const optimized = {};

    for (const [key, value] of Object.entries(transport)) {
      // 只保留非默认值
      if (defaultConfig[key] !== value) {
        optimized[key] = value;
      }
    }

    return optimized;
  }
}

/**
 * 传输层配置构建器
 * 提供链式API来构建传输配置
 */
export class TransportConfigBuilder {
  constructor(network) {
    this.network = network;
    this.config = TransportHandler.getDefaultConfig(network);
  }

  /**
   * 设置路径
   * @param {string} path - 路径
   * @returns {TransportConfigBuilder} 构建器实例
   */
  setPath(path) {
    this.config.path = path;
    return this;
  }

  /**
   * 设置主机
   * @param {string} host - 主机
   * @returns {TransportConfigBuilder} 构建器实例
   */
  setHost(host) {
    this.config.host = host;
    return this;
  }

  /**
   * 设置服务名称（gRPC）
   * @param {string} serviceName - 服务名称
   * @returns {TransportConfigBuilder} 构建器实例
   */
  setServiceName(serviceName) {
    this.config.serviceName = serviceName;
    return this;
  }

  /**
   * 设置模式（gRPC）
   * @param {string} mode - 模式
   * @returns {TransportConfigBuilder} 构建器实例
   */
  setMode(mode) {
    this.config.mode = mode;
    return this;
  }

  /**
   * 添加头部
   * @param {string} key - 头部键
   * @param {string} value - 头部值
   * @returns {TransportConfigBuilder} 构建器实例
   */
  addHeader(key, value) {
    if (!this.config.headers) {
      this.config.headers = {};
    }
    this.config.headers[key] = value;
    return this;
  }

  /**
   * 设置头部对象
   * @param {Object} headers - 头部对象
   * @returns {TransportConfigBuilder} 构建器实例
   */
  setHeaders(headers) {
    this.config.headers = { ...headers };
    return this;
  }

  /**
   * 构建配置
   * @returns {Object} 传输配置
   */
  build() {
    return TransportHandler.cloneTransportConfig(this.config);
  }

  /**
   * 验证并构建配置
   * @returns {Object} 包含配置和验证结果的对象
   */
  buildWithValidation() {
    const config = this.build();
    const validation = TransportHandler.validateTransportConfig(config, this.network);

    return {
      config,
      validation,
      isValid: validation.isValid
    };
  }
}

// 导出便捷函数
export const parseTransport = (params, network, source) =>
  TransportHandler.parseTransportParams(params, network, source);

export const addTransportParams = (params, node) =>
  TransportHandler.addTransportParams(params, node);

export const toClashTransport = (node) =>
  TransportHandler.toClashFormat(node);

export const fromClashTransport = (clashNode, network) =>
  TransportHandler.fromClashFormat(clashNode, network);

export const validateTransport = (transport, network) =>
  TransportHandler.validateTransportConfig(transport, network);

export const createTransportBuilder = (network) =>
  new TransportConfigBuilder(network);