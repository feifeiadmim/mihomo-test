/**
 * 统一配置管理
 * 集中管理所有配置项，避免配置分散和重复
 */

import path from 'path';

/**
 * 默认配置
 */
export const DEFAULT_CONFIG = {
  // 目录配置
  inputDir: './tests',
  outputDir: './output',

  // 文件处理配置
  maxFileSize: 100 * 1024 * 1024, // 100MB
  supportedExtensions: ['.yaml', '.yml', '.txt'],

  // 默认处理选项
  defaultOptions: {
    deduplicate: true,
    rename: true,

    // 去重配置
    deduplicateOptions: {
      strategy: 'full',
      smart: false
    },

    // 重命名配置
    renameOptions: {
      template: '{flag}{region}{index:3}',
      groupByRegion: true,
      startIndex: 1
    }
  },

  // 合并配置
  mergeConfig: {
    inputDir: './tests',
    outputDir: './output',

    defaultOptions: {
      deduplicate: true,
      rename: true,

      deduplicateOptions: {
        strategy: 'full',
        smart: false
      },

      renameOptions: {
        template: '{flag}{region}{index:3}',
        groupByRegion: true,
        startIndex: 1
      }
    }
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
    throwOnCritical: true
  },

  // 性能配置
  performance: {
    batchSize: 100,
    maxConcurrency: 5,
    enableCache: true,
    cacheTimeout: 300000 // 5分钟
  },

  // 日志配置
  logging: {
    level: 'info', // debug, info, warn, error
    showProgress: true,
    showStats: true,
    showDetails: false
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

  // 验证去重配置
  if (config.defaultOptions?.deduplicateOptions) {
    const dedup = config.defaultOptions.deduplicateOptions;
    const validStrategies = ['full'];

    if (dedup.strategy && !validStrategies.includes(dedup.strategy)) {
      throw new Error(`配置错误: 无效的去重策略 "${dedup.strategy}"，只支持 'full' 策略`);
    }
  }

  // 验证文件大小限制
  if (config.maxFileSize && (typeof config.maxFileSize !== 'number' || config.maxFileSize <= 0)) {
    throw new Error('配置错误: maxFileSize 必须是正数');
  }
}

/**
 * 获取环境特定的配置
 * @param {string} env - 环境名称 (development, production, test)
 * @returns {Object} 环境配置
 */
export function getEnvironmentConfig(env = 'development') {
  const envConfigs = {
    development: {
      logging: {
        level: 'debug',
        showDetails: true
      },
      performance: {
        enableCache: false
      }
    },

    production: {
      logging: {
        level: 'warn',
        showDetails: false
      },
      performance: {
        enableCache: true,
        maxConcurrency: 10
      },
      errorHandling: {
        throwOnCritical: false
      }
    },

    test: {
      logging: {
        level: 'error',
        showProgress: false,
        showStats: false
      },
      performance: {
        enableCache: false,
        batchSize: 10
      }
    }
  };

  return mergeConfig(envConfigs[env] || {}, DEFAULT_CONFIG);
}

// 导出配置常量
export const CONFIG = DEFAULT_CONFIG;
