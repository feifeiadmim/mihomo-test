/**
 * 格式转换器统一入口
 */

import * as clashConverter from './clash.js';
import * as base64Converter from './base64.js';
import { generateProxyUrls, parseProxyUrls } from '../parsers/index.js';
import { OutputFormats } from '../types.js';

/**
 * 主要的格式转换类
 */
export class FormatConverter {
  /**
   * 将节点数组转换为指定格式
   * @param {Object[]} nodes - 节点数组
   * @param {string} format - 输出格式
   * @param {Object} options - 转换选项
   * @returns {string|Object} 转换后的内容
   */
  static convert(nodes, format, options = {}) {
    if (!nodes || !Array.isArray(nodes) || nodes.length === 0) {
      return format === OutputFormats.JSON ? [] : '';
    }

    switch (format) {
      case OutputFormats.CLASH:
        return clashConverter.toClashConfig(nodes, options);

      case OutputFormats.BASE64:
        return base64Converter.toBase64Subscription(nodes, options);

      case OutputFormats.URL:
        return generateProxyUrls(nodes).join('\n');

      case OutputFormats.JSON:
        return nodes;

      default:
        throw new Error(`不支持的输出格式: ${format}`);
    }
  }

  /**
   * 从指定格式解析节点
   * @param {string|Object} content - 输入内容
   * @param {string} format - 输入格式
   * @returns {Object[]} 节点数组
   */
  static parse(content, format) {
    if (!content) {
      return [];
    }

    switch (format) {
      case OutputFormats.CLASH:
        return clashConverter.fromClashConfig(content);

      case OutputFormats.BASE64:
        return base64Converter.fromBase64Subscription(content);

      case OutputFormats.URL:
        return this.parseUrls(content);

      case OutputFormats.JSON:
        return Array.isArray(content) ? content : [];

      default:
        throw new Error(`不支持的输入格式: ${format}`);
    }
  }

  /**
   * 解析 URL 列表
   * @param {string} content - URL 内容
   * @returns {Object[]} 节点数组
   */
  static parseUrls(content) {
    // 动态导入在这里不合适，直接使用已导入的函数
    return parseProxyUrls(content);
  }

  /**
   * 自动检测输入格式
   * @param {string|Object} content - 输入内容
   * @returns {string} 检测到的格式
   */
  static detectFormat(content) {
    if (!content) {
      return null;
    }

    // 如果是对象，检查是否为 Clash 配置
    if (typeof content === 'object') {
      if (content.proxies || content['proxy-groups']) {
        return OutputFormats.CLASH;
      }
      if (Array.isArray(content)) {
        // 检查数组内容是否为代理URL
        if (content.length > 0 && typeof content[0] === 'string') {
          const proxyPrefixes = ['ss://', 'ssr://', 'vmess://', 'vless://', 'trojan://', 'hysteria://', 'hysteria2://', 'hy2://', 'tuic://', 'snell://'];
          const hasProxyUrls = content.some(item =>
            typeof item === 'string' && proxyPrefixes.some(prefix => item.startsWith(prefix))
          );
          if (hasProxyUrls) {
            return OutputFormats.URL;
          }
        }
        return OutputFormats.JSON;
      }
      return null;
    }

    // 如果是字符串
    if (typeof content === 'string') {
      const trimmed = content.trim();

      // 检查是否为 Base64
      if (base64Converter.isValidBase64(trimmed)) {
        return OutputFormats.BASE64;
      }

      // 检查是否为 YAML (Clash 配置)
      if (this.isYamlFormat(trimmed)) {
        return OutputFormats.CLASH;
      }

      // 检查是否为 JSON
      try {
        const parsed = JSON.parse(trimmed);
        if (parsed.proxies || parsed['proxy-groups']) {
          return OutputFormats.CLASH;
        }
        if (Array.isArray(parsed)) {
          return OutputFormats.JSON;
        }
      } catch (e) {
        // 不是 JSON 格式
      }

      // 检查是否为 URL 列表
      if (this.isUrlFormat(trimmed)) {
        return OutputFormats.URL;
      }
    }

    return null;
  }

  /**
   * 检查是否为 YAML 格式
   * @param {string} content - 内容
   * @returns {boolean} 是否为 YAML
   */
  static isYamlFormat(content) {
    // 简单的 YAML 格式检测
    const yamlIndicators = [
      'proxies:',
      'proxy-groups:',
      'rules:',
      'port:',
      'socks-port:'
    ];

    return yamlIndicators.some(indicator => content.includes(indicator));
  }

  /**
   * 检查是否为 URL 格式
   * @param {string} content - 内容
   * @returns {boolean} 是否为 URL 列表
   */
  static isUrlFormat(content) {
    const lines = content.split(/\r?\n/).filter(line => line.trim());
    if (lines.length === 0) return false;

    const proxyPrefixes = ['ss://', 'ssr://', 'vmess://', 'vless://', 'trojan://', 'hysteria://', 'hysteria2://', 'hy2://', 'tuic://', 'snell://'];

    // 至少 50% 的行是代理 URL
    const proxyLines = lines.filter(line =>
      proxyPrefixes.some(prefix => line.trim().startsWith(prefix))
    );

    return proxyLines.length / lines.length >= 0.5;
  }

  /**
   * 转换格式（自动检测输入格式）
   * @param {string|Object} input - 输入内容
   * @param {string} outputFormat - 输出格式
   * @param {Object} options - 转换选项
   * @returns {string|Object} 转换后的内容
   */
  static transform(input, outputFormat, options = {}) {
    // 自动检测输入格式
    const inputFormat = this.detectFormat(input);
    if (!inputFormat) {
      throw new Error('无法检测输入格式');
    }

    // 解析输入内容
    const nodes = this.parse(input, inputFormat);

    // 转换为目标格式
    return this.convert(nodes, outputFormat, options);
  }

  /**
   * 批量转换
   * @param {Array} inputs - 输入数组，每个元素包含 {content, format}
   * @param {string} outputFormat - 输出格式
   * @param {Object} options - 转换选项
   * @returns {string|Object} 合并转换后的内容
   */
  static batchTransform(inputs, outputFormat, options = {}) {
    const allNodes = [];

    for (const input of inputs) {
      const format = input.format || this.detectFormat(input.content);
      if (format) {
        const nodes = this.parse(input.content, format);
        allNodes.push(...nodes);
      }
    }

    return this.convert(allNodes, outputFormat, options);
  }

  /**
   * 获取支持的格式列表
   * @returns {string[]} 支持的格式数组
   */
  static getSupportedFormats() {
    return Object.values(OutputFormats);
  }

  /**
   * 验证格式是否支持
   * @param {string} format - 格式名称
   * @returns {boolean} 是否支持
   */
  static isFormatSupported(format) {
    return Object.values(OutputFormats).includes(format);
  }
}

// 导出便捷函数
export const {
  convert,
  parse,
  detectFormat,
  transform,
  batchTransform,
  getSupportedFormats,
  isFormatSupported
} = FormatConverter;

// 导出子模块
export { clashConverter, base64Converter };
