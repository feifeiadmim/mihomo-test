/**
 * 统一节点验证器
 * 提供标准化的节点验证功能，确保数据完整性和一致性
 * 支持基础验证和协议特定验证
 */

import { ProxyTypes } from '../../types.js';
import { ParserErrorHandler, ErrorTypes, ErrorSeverity } from './error-handler.js';

/**
 * 验证结果类型
 */
export const ValidationResult = {
  VALID: 'valid',
  INVALID: 'invalid',
  WARNING: 'warning'
};

/**
 * 统一节点验证器类
 */
export class NodeValidator {
  static validationStats = {
    total: 0,
    passed: 0,
    failed: 0,
    warnings: 0,
    byProtocol: {}
  };

  /**
   * 验证基础节点信息
   * @param {Object} node - 节点对象
   * @param {string} protocol - 协议名称
   * @returns {Object} 验证结果
   */
  static validateBasicNode(node, protocol) {
    const errors = [];
    const warnings = [];

    // 更新统计
    this.validationStats.total++;
    this.validationStats.byProtocol[protocol] = (this.validationStats.byProtocol[protocol] || 0) + 1;

    // 基础字段验证
    if (!node || typeof node !== 'object') {
      errors.push('Node must be a valid object');
      this.validationStats.failed++;
      return this.createValidationResult(false, errors, warnings, protocol);
    }

    // 服务器验证
    const serverValidation = this.validateServer(node.server);
    if (!serverValidation.isValid) {
      errors.push(`Invalid server: ${serverValidation.error}`);
    }

    // 端口验证
    const portValidation = this.validatePort(node.port);
    if (!portValidation.isValid) {
      errors.push(`Invalid port: ${portValidation.error}`);
    }

    // 名称验证
    if (!node.name || typeof node.name !== 'string' || node.name.trim().length === 0) {
      warnings.push('Node name is missing or empty, will use default');
    }

    // 协议类型验证
    if (node.type && !Object.values(ProxyTypes).includes(node.type)) {
      warnings.push(`Unknown protocol type: ${node.type}`);
    }

    const isValid = errors.length === 0;
    if (isValid) {
      this.validationStats.passed++;
    } else {
      this.validationStats.failed++;
    }

    if (warnings.length > 0) {
      this.validationStats.warnings++;
    }

    return this.createValidationResult(isValid, errors, warnings, protocol);
  }

  /**
   * 验证服务器地址
   * @param {string} server - 服务器地址
   * @returns {Object} 验证结果
   */
  static validateServer(server) {
    if (!server || typeof server !== 'string') {
      return { isValid: false, error: 'Server address is required and must be a string' };
    }

    const trimmedServer = server.trim();
    if (trimmedServer.length === 0) {
      return { isValid: false, error: 'Server address cannot be empty' };
    }

    // 域名验证（支持下划线，适应更多实际域名格式）
    const domainRegex = /^[a-zA-Z0-9]([a-zA-Z0-9_-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9_-]{0,61}[a-zA-Z0-9])?)*$/;
    
    // IPv4验证
    const ipv4Regex = /^((25[0-5]|(2[0-4]|1\d|[1-9]|)\d)\.?\b){4}$/;
    
    // IPv6验证（简化版）
    const ipv6Regex = /^(([0-9a-fA-F]{1,4}:){7,7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:)|fe80:(:[0-9a-fA-F]{0,4}){0,4}%[0-9a-zA-Z]{1,}|::(ffff(:0{1,4}){0,1}:){0,1}((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])|([0-9a-fA-F]{1,4}:){1,4}:((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9]))$/;

    if (domainRegex.test(trimmedServer) || ipv4Regex.test(trimmedServer) || ipv6Regex.test(trimmedServer)) {
      return { isValid: true };
    }

    return { isValid: false, error: 'Invalid server address format (not a valid domain, IPv4, or IPv6)' };
  }

  /**
   * 验证端口号
   * @param {string|number} port - 端口号
   * @returns {Object} 验证结果
   */
  static validatePort(port) {
    if (port === undefined || port === null) {
      return { isValid: false, error: 'Port is required' };
    }

    const portNum = parseInt(port);
    if (isNaN(portNum)) {
      return { isValid: false, error: 'Port must be a valid number' };
    }

    if (portNum < 1 || portNum > 65535) {
      return { isValid: false, error: 'Port must be between 1 and 65535' };
    }

    return { isValid: true, port: portNum };
  }

  /**
   * 验证UUID格式
   * @param {string} uuid - UUID字符串
   * @returns {boolean} 是否有效
   */
  static validateUUID(uuid) {
    if (!uuid || typeof uuid !== 'string') {
      return false;
    }
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(uuid);
  }

  /**
   * 验证协议特定字段
   * @param {Object} node - 节点对象
   * @returns {Object} 验证结果
   */
  static validateProtocolSpecific(node) {
    const errors = [];
    const warnings = [];

    switch (node.type) {
      case ProxyTypes.VLESS:
      case ProxyTypes.VMESS:
        if (!this.validateUUID(node.uuid)) {
          errors.push('Invalid or missing UUID');
        }
        break;

      case ProxyTypes.SHADOWSOCKS:
        // 密码可以是字符串或数字
        if (!node.password && node.password !== 0) {
          errors.push(`Password is required for Shadowsocks (current: ${JSON.stringify(node.password)})`);
        } else if (typeof node.password === 'string' && node.password.trim() === '') {
          errors.push(`Password cannot be empty string for Shadowsocks (current: ${JSON.stringify(node.password)})`);
        }
        if (!node.method || typeof node.method !== 'string') {
          errors.push('Encryption method is required for Shadowsocks');
        }
        break;

      case ProxyTypes.TROJAN:
        // 密码可以是字符串或数字
        if (!node.password && node.password !== 0) {
          errors.push('Password is required for Trojan');
        } else if (typeof node.password === 'string' && node.password.trim() === '') {
          errors.push('Password cannot be empty string for Trojan');
        }
        break;

      case ProxyTypes.HYSTERIA2:
        if (!node.password && !node.auth) {
          errors.push('Password or auth is required for Hysteria2');
        }
        break;

      case ProxyTypes.SHADOWSOCKSR:
        // 密码可以是字符串或数字
        if (!node.password && node.password !== 0) {
          errors.push('Password is required for ShadowsocksR');
        } else if (typeof node.password === 'string' && node.password.trim() === '') {
          errors.push('Password cannot be empty string for ShadowsocksR');
        }
        if (!node.method || typeof node.method !== 'string') {
          errors.push('Encryption method is required for ShadowsocksR');
        }
        if (!node.protocol || typeof node.protocol !== 'string') {
          errors.push('Protocol is required for ShadowsocksR');
        }
        if (!node.obfs || typeof node.obfs !== 'string') {
          errors.push('Obfuscation method is required for ShadowsocksR');
        }
        break;

      default:
        warnings.push(`Unknown protocol type: ${node.type}, skipping protocol-specific validation`);
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * 完整节点验证
   * @param {Object} node - 节点对象
   * @param {string} protocol - 协议名称
   * @returns {Object} 完整验证结果
   */
  static validateNode(node, protocol) {
    // 基础验证
    const basicValidation = this.validateBasicNode(node, protocol);
    if (!basicValidation.isValid) {
      return basicValidation;
    }

    // 协议特定验证
    const protocolValidation = this.validateProtocolSpecific(node);
    
    // 合并结果
    const allErrors = [...basicValidation.errors, ...protocolValidation.errors];
    const allWarnings = [...basicValidation.warnings, ...protocolValidation.warnings];

    const isValid = allErrors.length === 0;
    return this.createValidationResult(isValid, allErrors, allWarnings, protocol);
  }

  /**
   * 创建验证结果对象
   * @param {boolean} isValid - 是否有效
   * @param {Array} errors - 错误列表
   * @param {Array} warnings - 警告列表
   * @param {string} protocol - 协议名称
   * @returns {Object} 验证结果
   */
  static createValidationResult(isValid, errors, warnings, protocol) {
    const result = {
      isValid,
      errors,
      warnings,
      protocol,
      timestamp: new Date().toISOString()
    };

    // 如果有错误，记录到错误处理器
    if (!isValid && errors.length > 0) {
      ParserErrorHandler.logError(
        protocol,
        'validate',
        `Validation failed: ${errors.join(', ')}`,
        { errors, warnings },
        ErrorTypes.VALIDATION_ERROR,
        ErrorSeverity.LOW
      );
    }

    return result;
  }

  /**
   * 获取验证统计信息
   * @returns {Object} 统计信息
   */
  static getValidationStats() {
    return {
      ...this.validationStats,
      successRate: this.validationStats.total > 0 ? 
        (this.validationStats.passed / this.validationStats.total * 100).toFixed(2) + '%' : '0%',
      timestamp: new Date().toISOString()
    };
  }

  /**
   * 清除验证统计信息
   */
  static clearValidationStats() {
    this.validationStats = {
      total: 0,
      passed: 0,
      failed: 0,
      warnings: 0,
      byProtocol: {}
    };
  }

  /**
   * 批量验证节点
   * @param {Array} nodes - 节点数组
   * @param {string} protocol - 协议名称
   * @returns {Object} 批量验证结果
   */
  static validateNodes(nodes, protocol) {
    if (!Array.isArray(nodes)) {
      return {
        isValid: false,
        errors: ['Input must be an array of nodes'],
        validNodes: [],
        invalidNodes: [],
        totalCount: 0,
        validCount: 0,
        invalidCount: 0
      };
    }

    const validNodes = [];
    const invalidNodes = [];

    for (const node of nodes) {
      const validation = this.validateNode(node, protocol);
      if (validation.isValid) {
        validNodes.push(node);
      } else {
        invalidNodes.push({
          node,
          validation
        });
      }
    }

    return {
      isValid: invalidNodes.length === 0,
      validNodes,
      invalidNodes,
      totalCount: nodes.length,
      validCount: validNodes.length,
      invalidCount: invalidNodes.length,
      successRate: nodes.length > 0 ? (validNodes.length / nodes.length * 100).toFixed(2) + '%' : '0%'
    };
  }
}

// 导出便捷验证函数
export const validateNode = (node, protocol) => NodeValidator.validateNode(node, protocol);
export const validateNodes = (nodes, protocol) => NodeValidator.validateNodes(nodes, protocol);
export const isValidServer = (server) => NodeValidator.validateServer(server).isValid;
export const isValidPort = (port) => NodeValidator.validatePort(port).isValid;
export const isValidUUID = (uuid) => NodeValidator.validateUUID(uuid);
