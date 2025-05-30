/**
 * 统一错误处理
 * 提供标准化的错误类型和处理方法
 */

/**
 * 基础错误类
 */
export class BaseError extends Error {
  constructor(message, code = 'UNKNOWN_ERROR', details = null) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.details = details;
    this.timestamp = new Date().toISOString();
    
    // 确保错误堆栈正确
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }
  
  /**
   * 转换为JSON格式
   * @returns {Object} JSON对象
   */
  toJSON() {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      details: this.details,
      timestamp: this.timestamp,
      stack: this.stack
    };
  }
}

/**
 * 文件处理错误
 */
export class FileProcessError extends BaseError {
  constructor(message, filePath = null, details = null) {
    super(message, 'FILE_PROCESS_ERROR', details);
    this.filePath = filePath;
  }
}

/**
 * 解析错误
 */
export class ParseError extends BaseError {
  constructor(message, format = null, details = null) {
    super(message, 'PARSE_ERROR', details);
    this.format = format;
  }
}

/**
 * 转换错误
 */
export class ConvertError extends BaseError {
  constructor(message, fromFormat = null, toFormat = null, details = null) {
    super(message, 'CONVERT_ERROR', details);
    this.fromFormat = fromFormat;
    this.toFormat = toFormat;
  }
}

/**
 * 配置错误
 */
export class ConfigError extends BaseError {
  constructor(message, configKey = null, details = null) {
    super(message, 'CONFIG_ERROR', details);
    this.configKey = configKey;
  }
}

/**
 * 验证错误
 */
export class ValidationError extends BaseError {
  constructor(message, field = null, value = null, details = null) {
    super(message, 'VALIDATION_ERROR', details);
    this.field = field;
    this.value = value;
  }
}

/**
 * 网络错误
 */
export class NetworkError extends BaseError {
  constructor(message, url = null, statusCode = null, details = null) {
    super(message, 'NETWORK_ERROR', details);
    this.url = url;
    this.statusCode = statusCode;
  }
}

/**
 * 错误处理器类
 */
export class ErrorHandler {
  constructor(options = {}) {
    this.logErrors = options.logErrors !== false;
    this.throwOnCritical = options.throwOnCritical !== false;
    this.maxRetries = options.maxRetries || 3;
    this.retryDelay = options.retryDelay || 1000;
  }
  
  /**
   * 处理错误
   * @param {Error} error - 错误对象
   * @param {Object} context - 错误上下文
   * @param {boolean} isCritical - 是否为关键错误
   */
  handle(error, context = {}, isCritical = false) {
    // 记录错误
    if (this.logErrors) {
      this.logError(error, context);
    }
    
    // 关键错误处理
    if (isCritical && this.throwOnCritical) {
      throw error;
    }
    
    return this.createErrorResponse(error, context);
  }
  
  /**
   * 记录错误
   * @param {Error} error - 错误对象
   * @param {Object} context - 错误上下文
   */
  logError(error, context = {}) {
    const errorInfo = {
      message: error.message,
      code: error.code || 'UNKNOWN',
      name: error.name,
      timestamp: new Date().toISOString(),
      context,
      stack: error.stack
    };
    
    if (error instanceof BaseError) {
      errorInfo.details = error.details;
    }
    
    console.error('❌ 错误详情:', JSON.stringify(errorInfo, null, 2));
  }
  
  /**
   * 创建错误响应
   * @param {Error} error - 错误对象
   * @param {Object} context - 错误上下文
   * @returns {Object} 错误响应对象
   */
  createErrorResponse(error, context = {}) {
    return {
      success: false,
      error: {
        message: error.message,
        code: error.code || 'UNKNOWN',
        name: error.name,
        context
      }
    };
  }
  
  /**
   * 重试执行函数
   * @param {Function} fn - 要执行的函数
   * @param {Array} args - 函数参数
   * @param {number} maxRetries - 最大重试次数
   * @returns {Promise} 执行结果
   */
  async retry(fn, args = [], maxRetries = this.maxRetries) {
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
        
        if (this.logErrors) {
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
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * 安全执行函数
 * @param {Function} fn - 要执行的函数
 * @param {*} defaultValue - 默认返回值
 * @param {Object} context - 错误上下文
 * @returns {*} 执行结果或默认值
 */
export async function safeExecute(fn, defaultValue = null, context = {}) {
  try {
    return await fn();
  } catch (error) {
    const handler = new ErrorHandler();
    handler.handle(error, context, false);
    return defaultValue;
  }
}

/**
 * 包装函数，添加错误处理
 * @param {Function} fn - 要包装的函数
 * @param {Object} options - 选项
 * @returns {Function} 包装后的函数
 */
export function withErrorHandling(fn, options = {}) {
  const handler = new ErrorHandler(options);
  
  return async function(...args) {
    try {
      return await fn(...args);
    } catch (error) {
      return handler.handle(error, { function: fn.name, args }, options.isCritical);
    }
  };
}

/**
 * 验证并抛出错误
 * @param {boolean} condition - 验证条件
 * @param {string} message - 错误消息
 * @param {string} code - 错误代码
 * @param {*} details - 错误详情
 */
export function assert(condition, message, code = 'ASSERTION_ERROR', details = null) {
  if (!condition) {
    throw new ValidationError(message, null, null, details);
  }
}

/**
 * 创建默认错误处理器实例
 */
export const defaultErrorHandler = new ErrorHandler();

/**
 * 错误代码常量
 */
export const ERROR_CODES = {
  // 文件相关
  FILE_NOT_FOUND: 'FILE_NOT_FOUND',
  FILE_READ_ERROR: 'FILE_READ_ERROR',
  FILE_WRITE_ERROR: 'FILE_WRITE_ERROR',
  FILE_TOO_LARGE: 'FILE_TOO_LARGE',
  
  // 解析相关
  PARSE_ERROR: 'PARSE_ERROR',
  INVALID_FORMAT: 'INVALID_FORMAT',
  INVALID_YAML: 'INVALID_YAML',
  INVALID_BASE64: 'INVALID_BASE64',
  INVALID_URL: 'INVALID_URL',
  
  // 转换相关
  CONVERT_ERROR: 'CONVERT_ERROR',
  UNSUPPORTED_FORMAT: 'UNSUPPORTED_FORMAT',
  
  // 配置相关
  CONFIG_ERROR: 'CONFIG_ERROR',
  INVALID_CONFIG: 'INVALID_CONFIG',
  
  // 验证相关
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  INVALID_PARAMETER: 'INVALID_PARAMETER',
  MISSING_PARAMETER: 'MISSING_PARAMETER',
  
  // 网络相关
  NETWORK_ERROR: 'NETWORK_ERROR',
  TIMEOUT_ERROR: 'TIMEOUT_ERROR',
  
  // 通用
  UNKNOWN_ERROR: 'UNKNOWN_ERROR',
  RETRY_EXHAUSTED: 'RETRY_EXHAUSTED'
};
