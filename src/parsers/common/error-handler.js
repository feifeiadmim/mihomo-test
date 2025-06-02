/**
 * 融合优化的统一错误处理器
 * 结合了多个错误处理模块的优点，提供更完善的错误处理功能
 * 包含：标准化错误处理、日志记录、监控、重试机制、调试支持等
 */

/**
 * 错误类型枚举（融合版本）
 */
export const ErrorTypes = {
  // 基础错误类型
  PARSE_ERROR: 'parse_error',
  VALIDATION_ERROR: 'validation_error',
  CONVERSION_ERROR: 'conversion_error',
  NETWORK_ERROR: 'network_error',
  FORMAT_ERROR: 'format_error',
  TIMEOUT_ERROR: 'timeout_error',

  // 扩展错误类型
  INVALID_URL: 'invalid_url',
  INVALID_FORMAT: 'invalid_format',
  MISSING_REQUIRED_FIELD: 'missing_required_field',
  INVALID_FIELD_VALUE: 'invalid_field_value',
  UNSUPPORTED_PROTOCOL: 'unsupported_protocol',
  DECODE_ERROR: 'decode_error',
  JSON_PARSE_ERROR: 'json_parse_error',
  CONFIG_ERROR: 'config_error',
  FILE_ERROR: 'file_error'
};

/**
 * 错误严重级别
 */
export const ErrorSeverity = {
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
  CRITICAL: 'critical'
};

/**
 * 基础错误类（融合版本）
 */
export class BaseError extends Error {
  constructor(message, code = 'UNKNOWN_ERROR', details = null, severity = ErrorSeverity.MEDIUM) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.details = details;
    this.severity = severity;
    this.timestamp = new Date().toISOString();
    this.id = this.generateErrorId();

    // 确保错误堆栈正确
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  /**
   * 生成唯一错误ID
   */
  generateErrorId() {
    return `err_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * 转换为JSON格式
   */
  toJSON() {
    return {
      id: this.id,
      name: this.name,
      message: this.message,
      code: this.code,
      severity: this.severity,
      details: this.details,
      timestamp: this.timestamp,
      stack: this.stack
    };
  }
}

/**
 * 解析错误类
 */
export class ParseError extends BaseError {
  constructor(message, protocol = null, input = null, details = null) {
    super(message, ErrorTypes.PARSE_ERROR, details, ErrorSeverity.MEDIUM);
    this.protocol = protocol;
    this.input = input;
  }
}

/**
 * 验证错误类
 */
export class ValidationError extends BaseError {
  constructor(message, field = null, value = null, details = null) {
    super(message, ErrorTypes.VALIDATION_ERROR, details, ErrorSeverity.LOW);
    this.field = field;
    this.value = value;
  }
}

/**
 * 网络错误类
 */
export class NetworkError extends BaseError {
  constructor(message, url = null, statusCode = null, details = null) {
    super(message, ErrorTypes.NETWORK_ERROR, details, ErrorSeverity.HIGH);
    this.url = url;
    this.statusCode = statusCode;
  }
}

/**
 * 融合优化的统一错误处理器类
 * 结合了多个模块的优点：统计、监控、重试、调试等功能
 */
export class ParserErrorHandler {
  static errorStats = {
    total: 0,
    byType: {},
    byProtocol: {},
    byOperation: {}
  };

  static errorLog = [];
  static maxLogSize = 1000;
  static enableDebug = false;
  static maxRetries = 3;
  static retryDelay = 1000;

  /**
   * 启用调试模式
   */
  static enableDebugMode() {
    this.enableDebug = true;
  }

  /**
   * 禁用调试模式
   */
  static disableDebugMode() {
    this.enableDebug = false;
  }

  /**
   * 创建标准化错误对象（融合版本）
   * @param {string} protocol - 协议名称
   * @param {string} operation - 操作类型
   * @param {string} message - 错误消息
   * @param {Object} context - 上下文信息
   * @param {string} type - 错误类型
   * @param {string} severity - 严重级别
   * @returns {Object} 标准化错误对象
   */
  static createError(protocol, operation, message, context = {}, type = ErrorTypes.PARSE_ERROR, severity = ErrorSeverity.MEDIUM) {
    const error = {
      id: this.generateErrorId(),
      protocol: protocol.toUpperCase(),
      operation,
      type,
      severity,
      message,
      context: {
        timestamp: new Date().toISOString(),
        ...context
      },
      stack: new Error().stack
    };

    // 更新统计信息
    this.updateStats(error);

    // 添加到错误日志
    this.addToErrorLog(error);

    return error;
  }

  /**
   * 添加到错误日志
   * @param {Object} error - 错误对象
   */
  static addToErrorLog(error) {
    this.errorLog.push(error);

    // 限制日志大小
    if (this.errorLog.length > this.maxLogSize) {
      this.errorLog.shift();
    }

    if (this.enableDebug) {
      console.error('Parse Error:', error);
    }
  }

  /**
   * 记录错误日志
   * @param {string} protocol - 协议名称
   * @param {string} operation - 操作类型
   * @param {Error|string} error - 错误对象或消息
   * @param {Object} context - 上下文信息
   * @param {string} type - 错误类型
   * @param {string} severity - 严重级别
   */
  static logError(protocol, operation, error, context = {}, type = ErrorTypes.PARSE_ERROR, severity = ErrorSeverity.MEDIUM) {
    const errorMessage = error instanceof Error ? error.message : error;
    const errorStack = error instanceof Error ? error.stack : undefined;

    const standardError = this.createError(protocol, operation, errorMessage, {
      ...context,
      originalStack: errorStack
    }, type, severity);

    // 根据严重级别选择日志方法
    const logMethod = this.getLogMethod(severity);
    logMethod(`[${protocol}] ${operation} failed:`, {
      id: standardError.id,
      type: standardError.type,
      message: standardError.message,
      context: standardError.context
    });

    // 发送到监控系统（如果可用）
    this.sendToMonitoring(standardError);

    return standardError;
  }

  /**
   * 处理解析错误的便捷方法
   * @param {string} protocol - 协议名称
   * @param {string} input - 输入内容
   * @param {Error} error - 错误对象
   * @returns {null} 始终返回null，符合解析器约定
   */
  static handleParseError(protocol, input, error) {
    const context = {
      inputType: typeof input,
      inputLength: input?.length || 0,
      inputPreview: this.sanitizeInput(input)
    };

    this.logError(protocol, 'parse', error, context, ErrorTypes.PARSE_ERROR, ErrorSeverity.MEDIUM);
    return null;
  }

  /**
   * 处理验证错误的便捷方法
   * @param {string} protocol - 协议名称
   * @param {Object} node - 节点对象
   * @param {Array|string} validationErrors - 验证错误
   * @returns {boolean} 始终返回false，符合验证器约定
   */
  static handleValidationError(protocol, node, validationErrors) {
    const errors = Array.isArray(validationErrors) ? validationErrors : [validationErrors];
    const context = {
      nodeType: node?.type,
      nodeServer: node?.server,
      nodePort: node?.port,
      validationErrors: errors
    };

    this.logError(protocol, 'validate', `Validation failed: ${errors.join(', ')}`, context, ErrorTypes.VALIDATION_ERROR, ErrorSeverity.LOW);
    return false;
  }

  /**
   * 处理转换错误的便捷方法
   * @param {string} protocol - 协议名称
   * @param {string} operation - 转换操作
   * @param {Object} node - 节点对象
   * @param {Error} error - 错误对象
   * @returns {null} 始终返回null，符合转换器约定
   */
  static handleConversionError(protocol, operation, node, error) {
    const context = {
      nodeType: node?.type,
      nodeServer: node?.server,
      nodePort: node?.port,
      hasPassword: !!(node?.password),
      passwordValue: node?.password ? `"${String(node.password).substring(0, 10)}..."` : 'null',
      hasUUID: !!(node?.uuid),
      hasMethod: !!(node?.method),
      methodValue: node?.method || 'null',
      nodeName: node?.name || 'unnamed',
      allFields: Object.keys(node || {}).join(', '),
      operation
    };

    this.logError(protocol, 'convert', error, context, ErrorTypes.CONVERSION_ERROR, ErrorSeverity.MEDIUM);
    return null;
  }

  /**
   * 生成唯一错误ID
   * @returns {string} 错误ID
   */
  static generateErrorId() {
    return `err_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
  }

  /**
   * 重试执行函数
   * @param {Function} fn - 要执行的函数
   * @param {Array} args - 函数参数
   * @param {number} maxRetries - 最大重试次数
   * @returns {Promise} 执行结果
   */
  static async retry(fn, args = [], maxRetries = this.maxRetries) {
    let lastError;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await fn(...args);
      } catch (error) {
        lastError = error;

        if (attempt === maxRetries) {
          break;
        }

        // 等待后重试
        await this.delay(this.retryDelay * attempt);

        if (this.enableDebug) {
          console.warn(`⚠️ 第 ${attempt} 次尝试失败，${this.retryDelay * attempt}ms 后重试...`);
        }
      }
    }

    throw new BaseError(
      `操作失败，已重试 ${maxRetries} 次: ${lastError.message}`,
      'RETRY_EXHAUSTED',
      { originalError: lastError, attempts: maxRetries }
    );
  }

  /**
   * 延迟函数
   * @param {number} ms - 延迟毫秒数
   * @returns {Promise} Promise对象
   */
  static delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * 安全执行包装器
   * @param {Function} fn - 要执行的函数
   * @param {*} defaultValue - 默认返回值
   * @param {Object} context - 错误上下文
   * @returns {*} 执行结果或默认值
   */
  static async safeExecute(fn, defaultValue = null, context = {}) {
    try {
      return await fn();
    } catch (error) {
      this.logError('SAFE_EXECUTE', 'execute', error, context, ErrorTypes.PARSE_ERROR, ErrorSeverity.LOW);
      return defaultValue;
    }
  }

  /**
   * 获取错误统计（融合版本）
   * @returns {Object} 错误统计信息
   */
  static getErrorStats() {
    const typeStats = {};

    for (const entry of this.errorLog) {
      const errorType = entry.type || 'UNKNOWN';
      typeStats[errorType] = (typeStats[errorType] || 0) + 1;
    }

    return {
      totalErrors: this.errorLog.length,
      errorTypes: typeStats,
      recentErrors: this.errorLog.slice(-10),
      byProtocol: { ...this.errorStats.byProtocol },
      byOperation: { ...this.errorStats.byOperation },
      byType: { ...this.errorStats.byType }
    };
  }

  /**
   * 清空错误日志
   */
  static clearErrorLog() {
    this.errorLog = [];
    this.errorStats = {
      total: 0,
      byType: {},
      byProtocol: {},
      byOperation: {}
    };
  }

  /**
   * 更新错误统计信息
   * @param {Object} error - 错误对象
   */
  static updateStats(error) {
    this.errorStats.total++;

    // 按类型统计
    this.errorStats.byType[error.type] = (this.errorStats.byType[error.type] || 0) + 1;

    // 按协议统计
    this.errorStats.byProtocol[error.protocol] = (this.errorStats.byProtocol[error.protocol] || 0) + 1;

    // 按操作统计
    this.errorStats.byOperation[error.operation] = (this.errorStats.byOperation[error.operation] || 0) + 1;
  }

  /**
   * 根据严重级别获取日志方法
   * @param {string} severity - 严重级别
   * @returns {Function} 日志方法
   */
  static getLogMethod(severity) {
    switch (severity) {
      case ErrorSeverity.CRITICAL:
        return console.error;
      case ErrorSeverity.HIGH:
        return console.error;
      case ErrorSeverity.MEDIUM:
        return console.warn;
      case ErrorSeverity.LOW:
        return console.info;
      default:
        return console.log;
    }
  }

  /**
   * 清理输入内容用于日志记录
   * @param {string} input - 输入内容
   * @returns {string} 清理后的内容
   */
  static sanitizeInput(input) {
    if (!input || typeof input !== 'string') {
      return 'undefined';
    }

    // 限制长度并移除敏感信息
    const maxLength = 100;
    let sanitized = input.length > maxLength ? input.substring(0, maxLength) + '...' : input;

    // 移除可能的密码信息
    sanitized = sanitized.replace(/(:\/\/[^:]*:)[^@]*(@)/g, '$1***$2');

    return sanitized;
  }

  /**
   * 发送错误到监控系统
   * @param {Object} error - 错误对象
   */
  static sendToMonitoring(error) {
    try {
      // 检查是否有全局错误监控器
      if (typeof window !== 'undefined' && window.errorTracker) {
        window.errorTracker.track(error);
      } else if (typeof global !== 'undefined' && global.errorTracker) {
        global.errorTracker.track(error);
      }
    } catch (monitoringError) {
      // 静默处理监控错误，避免循环错误
      console.warn('Failed to send error to monitoring system:', monitoringError.message);
    }
  }
}

/**
 * 安全解析器包装器
 * 为所有解析器提供统一的异常处理和安全保护
 */
export class SafeParserWrapper {
  /**
   * 包装解析器，添加安全保护
   * @param {Object} parser - 原始解析器
   * @returns {Object} 包装后的安全解析器
   */
  static wrapParser(parser) {
    return {
      ...parser,
      name: `Safe(${parser.name})`,

      // 包装test方法
      test: (content) => {
        try {
          return parser.test ? parser.test(content) : false;
        } catch (error) {
          ParserErrorHandler.logError(parser.name || 'Unknown', 'test', error,
            { contentLength: content?.length || 0 },
            ErrorTypes.VALIDATION_ERROR,
            ErrorSeverity.LOW
          );
          return false;
        }
      },

      // 包装parse方法
      parse: async (content) => {
        try {
          const result = await parser.parse(content);
          return result || null;
        } catch (error) {
          ParserErrorHandler.logError(parser.name || 'Unknown', 'parse', error,
            {
              contentLength: content?.length || 0,
              contentPreview: content?.substring(0, 100) || ''
            },
            ErrorTypes.PARSE_ERROR,
            ErrorSeverity.MEDIUM
          );
          return null; // 安全返回，不中断整个流程
        }
      }
    };
  }

  /**
   * 批量包装解析器数组
   * @param {Array} parsers - 解析器数组
   * @returns {Array} 包装后的解析器数组
   */
  static wrapParsers(parsers) {
    return parsers.map(parser => this.wrapParser(parser));
  }

  /**
   * 创建安全的解析函数
   * @param {Function} parseFunction - 原始解析函数
   * @param {string} parserName - 解析器名称
   * @returns {Function} 安全的解析函数
   */
  static createSafeParseFunction(parseFunction, parserName = 'Unknown') {
    return async (content) => {
      try {
        const result = await parseFunction(content);
        return result;
      } catch (error) {
        ParserErrorHandler.logError(parserName, 'parse', error,
          {
            contentLength: content?.length || 0,
            functionName: parseFunction.name || 'anonymous'
          },
          ErrorTypes.PARSE_ERROR,
          ErrorSeverity.MEDIUM
        );
        return null;
      }
    };
  }
}

// 全局错误处理器实例
export const globalErrorHandler = ParserErrorHandler;

// 导出便捷方法
export const logParseError = (protocol, input, error) =>
  ParserErrorHandler.handleParseError(protocol, input, error);

export const logValidationError = (protocol, node, errors) =>
  ParserErrorHandler.handleValidationError(protocol, node, errors);

// 导出安全包装器
export const wrapParser = SafeParserWrapper.wrapParser;
export const wrapParsers = SafeParserWrapper.wrapParsers;
export const createSafeParseFunction = SafeParserWrapper.createSafeParseFunction;

export const logConversionError = (protocol, operation, node, error) =>
  ParserErrorHandler.handleConversionError(protocol, operation, node, error);

// 断言函数
export function assert(condition, message, code = 'ASSERTION_ERROR', details = null) {
  if (!condition) {
    throw new ValidationError(message, null, null, details);
  }
}

// 默认导出
export default ParserErrorHandler;
