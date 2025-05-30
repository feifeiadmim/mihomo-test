/**
 * 增强错误处理机制
 * 提供更好的错误信息、容错能力和调试支持
 */

/**
 * 解析错误类型
 */
export const ParseErrorTypes = {
  INVALID_URL: 'INVALID_URL',
  INVALID_FORMAT: 'INVALID_FORMAT',
  MISSING_REQUIRED_FIELD: 'MISSING_REQUIRED_FIELD',
  INVALID_FIELD_VALUE: 'INVALID_FIELD_VALUE',
  UNSUPPORTED_PROTOCOL: 'UNSUPPORTED_PROTOCOL',
  DECODE_ERROR: 'DECODE_ERROR',
  JSON_PARSE_ERROR: 'JSON_PARSE_ERROR',
  NETWORK_ERROR: 'NETWORK_ERROR',
  TIMEOUT_ERROR: 'TIMEOUT_ERROR'
};

/**
 * 解析错误类
 */
export class ParseError extends Error {
  constructor(type, message, details = {}) {
    super(message);
    this.name = 'ParseError';
    this.type = type;
    this.details = details;
    this.timestamp = new Date().toISOString();
  }

  /**
   * 转换为JSON格式
   */
  toJSON() {
    return {
      name: this.name,
      type: this.type,
      message: this.message,
      details: this.details,
      timestamp: this.timestamp,
      stack: this.stack
    };
  }
}

/**
 * 增强错误处理器
 */
export class ErrorHandler {
  constructor() {
    this.errorLog = [];
    this.maxLogSize = 1000;
    this.enableDebug = false;
  }

  /**
   * 启用调试模式
   */
  enableDebugMode() {
    this.enableDebug = true;
  }

  /**
   * 禁用调试模式
   */
  disableDebugMode() {
    this.enableDebug = false;
  }

  /**
   * 记录错误
   * @param {Error} error - 错误对象
   * @param {Object} context - 上下文信息
   */
  logError(error, context = {}) {
    const errorEntry = {
      error: error instanceof ParseError ? error.toJSON() : {
        name: error.name,
        message: error.message,
        stack: error.stack
      },
      context,
      timestamp: new Date().toISOString()
    };

    this.errorLog.push(errorEntry);

    // 限制日志大小
    if (this.errorLog.length > this.maxLogSize) {
      this.errorLog.shift();
    }

    if (this.enableDebug) {
      console.error('Parse Error:', errorEntry);
    }
  }

  /**
   * 安全解析包装器
   * @param {Function} parseFunction - 解析函数
   * @param {string} input - 输入内容
   * @param {Object} context - 上下文信息
   * @returns {Object|null} 解析结果
   */
  safeParseWrapper(parseFunction, input, context = {}) {
    try {
      return parseFunction(input);
    } catch (error) {
      this.logError(error, { input, context });
      return null;
    }
  }

  /**
   * 验证URL格式
   * @param {string} url - URL字符串
   * @returns {boolean} 是否有效
   */
  validateUrl(url) {
    if (!url || typeof url !== 'string') {
      throw new ParseError(
        ParseErrorTypes.INVALID_URL,
        'URL must be a non-empty string',
        { url }
      );
    }

    if (url.length > 10000) {
      throw new ParseError(
        ParseErrorTypes.INVALID_URL,
        'URL too long (max 10000 characters)',
        { url: url.substring(0, 100) + '...' }
      );
    }

    return true;
  }

  /**
   * 验证必需字段
   * @param {Object} obj - 对象
   * @param {Array} requiredFields - 必需字段列表
   * @param {string} context - 上下文描述
   */
  validateRequiredFields(obj, requiredFields, context = '') {
    for (const field of requiredFields) {
      if (!(field in obj) || obj[field] === undefined || obj[field] === null) {
        throw new ParseError(
          ParseErrorTypes.MISSING_REQUIRED_FIELD,
          `Missing required field: ${field}${context ? ` in ${context}` : ''}`,
          { field, context, obj }
        );
      }
    }
  }

  /**
   * 验证字段值
   * @param {*} value - 字段值
   * @param {string} fieldName - 字段名
   * @param {Object} rules - 验证规则
   */
  validateFieldValue(value, fieldName, rules = {}) {
    if (rules.type && typeof value !== rules.type) {
      throw new ParseError(
        ParseErrorTypes.INVALID_FIELD_VALUE,
        `Field ${fieldName} must be of type ${rules.type}, got ${typeof value}`,
        { fieldName, value, expectedType: rules.type }
      );
    }

    if (rules.min !== undefined && value < rules.min) {
      throw new ParseError(
        ParseErrorTypes.INVALID_FIELD_VALUE,
        `Field ${fieldName} must be >= ${rules.min}, got ${value}`,
        { fieldName, value, min: rules.min }
      );
    }

    if (rules.max !== undefined && value > rules.max) {
      throw new ParseError(
        ParseErrorTypes.INVALID_FIELD_VALUE,
        `Field ${fieldName} must be <= ${rules.max}, got ${value}`,
        { fieldName, value, max: rules.max }
      );
    }

    if (rules.pattern && !rules.pattern.test(value)) {
      throw new ParseError(
        ParseErrorTypes.INVALID_FIELD_VALUE,
        `Field ${fieldName} does not match required pattern`,
        { fieldName, value, pattern: rules.pattern.source }
      );
    }

    if (rules.enum && !rules.enum.includes(value)) {
      throw new ParseError(
        ParseErrorTypes.INVALID_FIELD_VALUE,
        `Field ${fieldName} must be one of: ${rules.enum.join(', ')}, got ${value}`,
        { fieldName, value, allowedValues: rules.enum }
      );
    }
  }

  /**
   * 安全Base64解码
   * @param {string} str - Base64字符串
   * @returns {string} 解码结果
   */
  safeBase64Decode(str) {
    try {
      return atob(str);
    } catch (error) {
      throw new ParseError(
        ParseErrorTypes.DECODE_ERROR,
        'Invalid Base64 encoding',
        { input: str.substring(0, 50) + '...' }
      );
    }
  }

  /**
   * 安全JSON解析
   * @param {string} str - JSON字符串
   * @returns {Object} 解析结果
   */
  safeJsonParse(str) {
    try {
      return JSON.parse(str);
    } catch (error) {
      throw new ParseError(
        ParseErrorTypes.JSON_PARSE_ERROR,
        'Invalid JSON format',
        { input: str.substring(0, 100) + '...' }
      );
    }
  }

  /**
   * 智能端口处理
   * @param {*} port - 端口值
   * @param {string} protocol - 协议类型
   * @returns {number} 端口号
   */
  smartPortHandling(port, protocol = '') {
    if (port) {
      const portNum = parseInt(port, 10);
      this.validateFieldValue(portNum, 'port', {
        type: 'number',
        min: 1,
        max: 65535
      });
      return portNum;
    }

    // 默认端口推断
    const defaultPorts = {
      'http': 80,
      'https': 443,
      'socks5': 1080,
      'ss': 8388,
      'vmess': 443,
      'vless': 443,
      'trojan': 443
    };

    const defaultPort = defaultPorts[protocol.toLowerCase()] || 443;
    
    if (this.enableDebug) {
      console.warn(`Port not specified for ${protocol}, using default: ${defaultPort}`);
    }

    return defaultPort;
  }

  /**
   * 获取错误统计
   */
  getErrorStats() {
    const stats = {};
    
    for (const entry of this.errorLog) {
      const errorType = entry.error.type || entry.error.name || 'UNKNOWN';
      stats[errorType] = (stats[errorType] || 0) + 1;
    }

    return {
      totalErrors: this.errorLog.length,
      errorTypes: stats,
      recentErrors: this.errorLog.slice(-10)
    };
  }

  /**
   * 清空错误日志
   */
  clearErrorLog() {
    this.errorLog = [];
  }

  /**
   * 导出错误日志
   */
  exportErrorLog() {
    return JSON.stringify(this.errorLog, null, 2);
  }
}

/**
 * 容错解析器装饰器
 */
export function withErrorHandling(parserClass) {
  return class extends parserClass {
    constructor(...args) {
      super(...args);
      this.errorHandler = new ErrorHandler();
    }

    parse(input) {
      return this.errorHandler.safeParseWrapper(
        (input) => super.parse(input),
        input,
        { parser: this.constructor.name }
      );
    }

    getErrorStats() {
      return this.errorHandler.getErrorStats();
    }

    enableDebug() {
      this.errorHandler.enableDebugMode();
    }

    disableDebug() {
      this.errorHandler.disableDebugMode();
    }
  };
}

// 全局错误处理器实例
export const globalErrorHandler = new ErrorHandler();

// 字段验证规则
export const ValidationRules = {
  port: { type: 'number', min: 1, max: 65535 },
  uuid: { type: 'string', pattern: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i },
  cipher: { type: 'string', enum: ['aes-128-gcm', 'aes-256-gcm', 'chacha20-poly1305', 'auto'] },
  network: { type: 'string', enum: ['tcp', 'ws', 'h2', 'grpc', 'kcp', 'quic'] },
  security: { type: 'string', enum: ['none', 'tls', 'reality'] }
};
