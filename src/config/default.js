/**
 * 融合优化的统一配置管理
 * 集中管理所有配置项，消除重复配置，提供环境特定配置
 * 版本: 2.0 - 优化后的统一配置系统
 */

import path from 'path';

/**
 * 配置常量定义
 */
const CONFIG_CONSTANTS = {
  // 内存限制
  MEMORY_LIMITS: {
    SMALL: 50 * 1024 * 1024,   // 50MB
    MEDIUM: 100 * 1024 * 1024, // 100MB
    LARGE: 200 * 1024 * 1024   // 200MB
  },

  // 时间间隔
  TIME_INTERVALS: {
    CACHE_TTL: 300000,      // 5分钟
    CLEANUP: 60000,         // 1分钟
    MEMORY_CHECK: 30000     // 30秒
  },

  // 批处理大小
  BATCH_SIZES: {
    SMALL: 50,
    MEDIUM: 100,
    LARGE: 1000
  }
};

/**
 * 基础处理选项（避免重复定义）
 */
const BASE_PROCESSING_OPTIONS = {
  deduplicate: true,
  rename: true,

  // 去重配置 - 统一使用FULL策略
  deduplicateOptions: {
    strategy: 'full',
    smart: false,
    keepFirst: true,
    caseSensitive: false,
    action: 'delete'
  },

  // 重命名配置
  renameOptions: {
    template: '{flag}{region}{index:3}',
    groupByRegion: true,
    startIndex: 1,
    enableRegionDetection: true,
    fallbackRegion: 'Unknown'
  }
};

/**
 * 基础目录配置（避免重复定义）
 */
const BASE_DIRECTORY_CONFIG = {
  inputDir: './input',        // 输入代理节点文件目录
  outputDir: './output',      // 输出文件目录
  tempDir: './temp',          // 临时文件目录
  logDir: './logs'            // 日志文件目录
};

/**
 * 融合优化的默认配置
 */
export const DEFAULT_CONFIG = {
  // 目录配置（使用基础配置）
  ...BASE_DIRECTORY_CONFIG,

  // 文件处理配置
  maxFileSize: 100 * 1024 * 1024, // 100MB
  supportedExtensions: ['.yaml', '.yml', '.txt', '.json'],
  encoding: 'utf8',
  backupOriginal: false,

  // 默认处理选项（使用基础配置）
  defaultOptions: {
    ...BASE_PROCESSING_OPTIONS
  },

  // 输出格式配置
  outputFormats: {
    clash: {
      extension: 'yaml',
      name: 'Clash YAML'
    },
    base64: {
      extension: 'txt',
      name: 'Base64订阅'
    },
    url: {
      extension: 'txt',
      name: 'URL列表'
    },
    json: {
      extension: 'json',
      name: 'JSON数据'
    }
  },

  // 错误处理配置
  errorHandling: {
    maxRetries: 3,
    retryDelay: 1000,
    logErrors: true,
    throwOnCritical: true,
    enableDebugMode: false
  },

  // 性能配置 - 使用统一常量
  performance: {
    batchSize: CONFIG_CONSTANTS.BATCH_SIZES.MEDIUM,
    maxConcurrency: 5,
    enableCache: true,
    cacheTimeout: CONFIG_CONSTANTS.TIME_INTERVALS.CACHE_TTL,
    enableOptimization: true,
    memoryLimit: CONFIG_CONSTANTS.MEMORY_LIMITS.LARGE
  },

  // 日志配置
  logging: {
    level: 'info', // debug, info, warn, error
    showProgress: true,
    showStats: true,
    showDetails: false,
    enableFileLogging: false
  },

  // 缓存配置 - 使用统一常量
  cache: {
    enabled: true,
    maxSize: 1000,
    ttl: CONFIG_CONSTANTS.TIME_INTERVALS.CACHE_TTL,
    cleanupInterval: CONFIG_CONSTANTS.TIME_INTERVALS.CLEANUP
  },

  // 验证配置
  validation: {
    strictMode: false,
    skipInvalidNodes: true,
    validateBeforeOutput: true
  }
};

/**
 * 配置预设（避免重复配置）
 */
export const CONFIG_PRESETS = {
  // 快速处理预设
  fast: {
    performance: {
      batchSize: 1000,
      maxConcurrency: 10,
      enableCache: true
    },
    validation: {
      strictMode: false,
      skipInvalidNodes: true
    },
    logging: {
      level: 'warn',
      showDetails: false
    }
  },

  // 高质量处理预设
  quality: {
    performance: {
      batchSize: 50,
      maxConcurrency: 3,
      enableCache: false
    },
    validation: {
      strictMode: true,
      skipInvalidNodes: false
    },
    logging: {
      level: 'debug',
      showDetails: true
    }
  },

  // 大数据处理预设
  bigdata: {
    performance: {
      batchSize: 5000,
      maxConcurrency: 15,
      enableCache: true,
      enableOptimization: true
    },
    defaultOptions: {
      ...BASE_PROCESSING_OPTIONS,
      deduplicateOptions: {
        ...BASE_PROCESSING_OPTIONS.deduplicateOptions,
        smart: true
      }
    },
    logging: {
      level: 'info',
      showProgress: true
    }
  },

  // 调试模式预设
  debug: {
    errorHandling: {
      enableDebugMode: true,
      logErrors: true
    },
    logging: {
      level: 'debug',
      showDetails: true,
      enableFileLogging: true
    },
    performance: {
      enableCache: false
    }
  }
};

/**
 * 获取配置项
 * @param {string} key - 配置键，支持点号分隔的嵌套键
 * @param {*} defaultValue - 默认值
 * @returns {*} 配置值
 */
export function getConfig(key, defaultValue = null) {
  const keys = key.split('.');
  let value = DEFAULT_CONFIG;

  for (const k of keys) {
    if (value && typeof value === 'object' && k in value) {
      value = value[k];
    } else {
      return defaultValue;
    }
  }

  return value;
}

/**
 * 设置配置项
 * @param {string} key - 配置键
 * @param {*} value - 配置值
 */
export function setConfig(key, value) {
  const keys = key.split('.');
  let target = DEFAULT_CONFIG;

  for (let i = 0; i < keys.length - 1; i++) {
    const k = keys[i];
    if (!(k in target) || typeof target[k] !== 'object') {
      target[k] = {};
    }
    target = target[k];
  }

  target[keys[keys.length - 1]] = value;
}

/**
 * 合并配置
 * @param {Object} customConfig - 自定义配置
 * @param {Object} baseConfig - 基础配置
 * @returns {Object} 合并后的配置
 */
export function mergeConfig(customConfig, baseConfig = DEFAULT_CONFIG) {
  return deepMerge(baseConfig, customConfig);
}

/**
 * 深度合并对象 (基础版本)
 * @param {Object} target - 目标对象
 * @param {Object} source - 源对象
 * @returns {Object} 合并后的对象
 */
function deepMerge(target, source) {
  const result = { ...target };

  for (const key in source) {
    if (source.hasOwnProperty(key)) {
      if (
        typeof source[key] === 'object' &&
        source[key] !== null &&
        !Array.isArray(source[key]) &&
        typeof target[key] === 'object' &&
        target[key] !== null &&
        !Array.isArray(target[key])
      ) {
        result[key] = deepMerge(target[key], source[key]);
      } else {
        result[key] = source[key];
      }
    }
  }

  return result;
}

/**
 * 增强的深度合并对象 (借鉴Sub-Store)
 * 支持特殊语法：+前置追加、后置追加+、强制覆盖!
 * @param {Object} target - 目标对象
 * @param {Object|string} _other - 源对象或JSON字符串
 * @returns {Object} 合并后的对象
 */
export function enhancedDeepMerge(target, _other) {
  // 支持字符串自动解析
  const other = typeof _other === 'string' ? JSON.parse(_other) : _other;
  const result = { ...target };

  for (const key in other) {
    if (other.hasOwnProperty(key)) {
      if (Array.isArray(other[key])) {
        // 数组智能合并
        if (key.startsWith('+')) {
          // 前置追加：+key
          const k = key.slice(1);
          result[k] = [...other[key], ...(result[k] || [])];
        } else if (key.endsWith('+')) {
          // 后置追加：key+
          const k = key.slice(0, -1);
          result[k] = [...(result[k] || []), ...other[key]];
        } else {
          // 直接替换
          result[key] = other[key];
        }
      } else if (typeof other[key] === 'object' && other[key] !== null) {
        // 对象处理
        if (key.endsWith('!')) {
          // 强制覆盖：key!
          const k = key.slice(0, -1);
          result[k] = other[key];
        } else {
          // 递归合并
          if (!result[key] || typeof result[key] !== 'object') {
            result[key] = {};
          }
          result[key] = enhancedDeepMerge(result[key], other[key]);
        }
      } else {
        // 基础类型直接赋值
        result[key] = other[key];
      }
    }
  }

  return result;
}

/**
 * 检查对象是否为普通对象
 * @param {any} obj - 要检查的对象
 * @returns {boolean} 是否为普通对象
 */
function isObject(obj) {
  return obj !== null && typeof obj === 'object' && !Array.isArray(obj);
}

/**
 * 通用去重策略验证函数
 * @param {Object} deduplicateOptions - 去重配置
 * @returns {Object} 验证结果
 */
function validateDeduplicationStrategy(deduplicateOptions) {
  const validStrategies = ['full'];
  const errors = [];

  if (deduplicateOptions?.strategy && !validStrategies.includes(deduplicateOptions.strategy)) {
    errors.push(`无效的去重策略 "${deduplicateOptions.strategy}"，只支持: ${validStrategies.join(', ')}`);
  }

  return { errors, validStrategies };
}

/**
 * 验证配置
 * @param {Object} config - 要验证的配置
 * @throws {Error} 配置无效时抛出错误
 */
export function validateConfig(config) {
  // 验证必要的目录配置
  if (!config.inputDir || typeof config.inputDir !== 'string') {
    throw new Error('配置错误: inputDir 必须是有效的字符串路径');
  }

  if (!config.outputDir || typeof config.outputDir !== 'string') {
    throw new Error('配置错误: outputDir 必须是有效的字符串路径');
  }

  // 验证去重配置（使用统一验证函数）
  if (config.defaultOptions?.deduplicateOptions) {
    const validation = validateDeduplicationStrategy(config.defaultOptions.deduplicateOptions);
    if (validation.errors.length > 0) {
      throw new Error(`配置错误: ${validation.errors[0]}`);
    }
  }

  // 验证文件大小限制
  if (config.maxFileSize && (typeof config.maxFileSize !== 'number' || config.maxFileSize <= 0)) {
    throw new Error('配置错误: maxFileSize 必须是正数');
  }
}

/**
 * 应用配置预设
 * @param {string} presetName - 预设名称
 * @param {Object} baseConfig - 基础配置
 * @returns {Object} 应用预设后的配置
 */
export function applyConfigPreset(presetName, baseConfig = DEFAULT_CONFIG) {
  const preset = CONFIG_PRESETS[presetName];
  if (!preset) {
    console.warn(`⚠️ 未找到配置预设: ${presetName}`);
    return baseConfig;
  }

  return mergeConfig(preset, baseConfig);
}

/**
 * 智能配置选择器
 * 根据数据量和处理需求自动选择最佳配置
 * @param {Object} context - 处理上下文
 * @returns {Object} 优化后的配置
 */
export function getSmartConfig(context = {}) {
  const { dataSize = 0, priority = 'balanced', enableDebug = false } = context;

  let selectedPreset = 'fast';

  // 根据数据量选择预设
  if (dataSize > 50000) {
    selectedPreset = 'bigdata';
  } else if (dataSize > 10000) {
    selectedPreset = 'fast';
  } else if (priority === 'quality') {
    selectedPreset = 'quality';
  }

  // 调试模式
  if (enableDebug) {
    selectedPreset = 'debug';
  }

  console.log(`🎯 智能配置选择: ${selectedPreset} (数据量: ${dataSize})`);
  return applyConfigPreset(selectedPreset);
}

/**
 * 获取环境特定的配置（融合版本）
 * @param {string} env - 环境名称 (development, production, test)
 * @returns {Object} 环境配置
 */
export function getEnvironmentConfig(env = 'development') {
  const envConfigs = {
    development: {
      ...CONFIG_PRESETS.debug,
      performance: {
        ...CONFIG_PRESETS.debug.performance,
        enableCache: false,
        batchSize: 50
      }
    },

    production: {
      ...CONFIG_PRESETS.fast,
      logging: {
        level: 'warn',
        showDetails: false,
        enableFileLogging: true
      },
      performance: {
        enableCache: true,
        maxConcurrency: 10,
        enableOptimization: true
      },
      errorHandling: {
        throwOnCritical: false,
        enableDebugMode: false
      }
    },

    test: {
      logging: {
        level: 'error',
        showProgress: false,
        showStats: false,
        enableFileLogging: false
      },
      performance: {
        enableCache: false,
        batchSize: 10,
        maxConcurrency: 1
      },
      validation: {
        strictMode: true
      }
    }
  };

  return mergeConfig(envConfigs[env] || {}, DEFAULT_CONFIG);
}

/**
 * 配置验证器
 * @param {Object} config - 要验证的配置
 * @returns {Object} 验证结果
 */
export function validateConfigAdvanced(config) {
  const errors = [];
  const warnings = [];

  // 验证必要的目录配置
  if (!config.inputDir || typeof config.inputDir !== 'string') {
    errors.push('inputDir 必须是有效的字符串路径');
  }

  if (!config.outputDir || typeof config.outputDir !== 'string') {
    errors.push('outputDir 必须是有效的字符串路径');
  }

  // 验证性能配置
  if (config.performance) {
    const perf = config.performance;

    if (perf.batchSize && (perf.batchSize < 1 || perf.batchSize > 10000)) {
      warnings.push('batchSize 建议在 1-10000 之间');
    }

    if (perf.maxConcurrency && (perf.maxConcurrency < 1 || perf.maxConcurrency > 20)) {
      warnings.push('maxConcurrency 建议在 1-20 之间');
    }
  }

  // 验证去重配置（使用统一验证函数）
  if (config.defaultOptions?.deduplicateOptions) {
    const validation = validateDeduplicationStrategy(config.defaultOptions.deduplicateOptions);
    errors.push(...validation.errors);
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings
  };
}

// 导出配置常量和便捷函数
export const CONFIG = DEFAULT_CONFIG;

// 便捷导出
export {
  CONFIG_CONSTANTS,
  BASE_PROCESSING_OPTIONS,
  BASE_DIRECTORY_CONFIG
};

// 全局配置管理器
export class ConfigManager {
  static currentConfig = DEFAULT_CONFIG;
  static appliedPresets = [];

  /**
   * 设置当前配置
   * @param {Object} config - 新配置
   */
  static setConfig(config) {
    this.currentConfig = mergeConfig(config, DEFAULT_CONFIG);
  }

  /**
   * 获取当前配置
   * @returns {Object} 当前配置
   */
  static getConfig() {
    return this.currentConfig;
  }

  /**
   * 应用预设
   * @param {string} presetName - 预设名称
   */
  static applyPreset(presetName) {
    this.currentConfig = applyConfigPreset(presetName, this.currentConfig);
    this.appliedPresets.push(presetName);
  }

  /**
   * 重置配置
   */
  static reset() {
    this.currentConfig = DEFAULT_CONFIG;
    this.appliedPresets = [];
  }

  /**
   * 获取配置摘要
   * @returns {Object} 配置摘要
   */
  static getSummary() {
    return {
      appliedPresets: this.appliedPresets,
      performance: this.currentConfig.performance,
      logging: this.currentConfig.logging,
      validation: this.currentConfig.validation
    };
  }
}

// 全局配置实例
export const globalConfig = ConfigManager;
