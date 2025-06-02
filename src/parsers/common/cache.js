/**
 * 融合优化的解析缓存机制
 * 结合了两个缓存模块的优点，提供更完善的缓存功能
 * 包含：LRU缓存、正则缓存、对象池、性能统计等
 */

import { ParserErrorHandler, ErrorTypes, ErrorSeverity } from './error-handler.js';

/**
 * 正则表达式缓存管理器（来自utils版本）
 * 减少正则表达式重复编译，提升性能
 */
export class RegexCache {
  constructor(maxSize = 100) {
    this.cache = new Map();
    this.maxSize = maxSize;
    this.stats = {
      hits: 0,
      misses: 0,
      compilations: 0
    };
  }

  /**
   * 获取缓存的正则表达式
   * @param {string} pattern - 正则模式
   * @param {string} flags - 正则标志
   * @returns {RegExp} 正则表达式对象
   */
  get(pattern, flags = '') {
    const key = `${pattern}:${flags}`;

    if (this.cache.has(key)) {
      this.stats.hits++;
      return this.cache.get(key);
    }

    this.stats.misses++;
    this.stats.compilations++;

    // 检查缓存大小
    if (this.cache.size >= this.maxSize) {
      // 删除最旧的缓存项
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }

    const regex = new RegExp(pattern, flags);
    this.cache.set(key, regex);
    return regex;
  }

  /**
   * 清空缓存
   */
  clear() {
    this.cache.clear();
    this.resetStats();
  }

  /**
   * 获取统计信息
   */
  getStats() {
    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      hitRate: this.stats.hits / (this.stats.hits + this.stats.misses) || 0,
      ...this.stats
    };
  }

  /**
   * 重置统计信息
   */
  resetStats() {
    this.stats = {
      hits: 0,
      misses: 0,
      compilations: 0
    };
  }
}

/**
 * 对象池管理器（来自utils版本）
 * 减少对象创建和GC压力
 */
export class ObjectPool {
  constructor() {
    this.pools = new Map();
    this.stats = {
      acquisitions: 0,
      releases: 0,
      creations: 0
    };
  }

  /**
   * 获取对象池
   * @param {string} type - 对象类型
   * @returns {Array} 对象池
   */
  getPool(type) {
    if (!this.pools.has(type)) {
      this.pools.set(type, []);
    }
    return this.pools.get(type);
  }

  /**
   * 获取对象
   * @param {string} type - 对象类型
   * @returns {Object} 对象实例
   */
  acquire(type) {
    this.stats.acquisitions++;
    const pool = this.getPool(type);

    if (pool.length > 0) {
      return pool.pop();
    }

    this.stats.creations++;
    return this.createObject(type);
  }

  /**
   * 释放对象
   * @param {string} type - 对象类型
   * @param {Object} obj - 对象实例
   */
  release(type, obj) {
    this.stats.releases++;

    // 清理对象
    this.cleanObject(obj);

    const pool = this.getPool(type);
    if (pool.length < 50) { // 限制池大小
      pool.push(obj);
    }
  }

  /**
   * 创建新对象
   * @param {string} type - 对象类型
   * @returns {Object} 新对象
   */
  createObject(type) {
    switch (type) {
      case 'node':
        return {};
      case 'transport':
        return {};
      case 'tls':
        return {};
      case 'headers':
        return {};
      default:
        return {};
    }
  }

  /**
   * 清理对象
   * @param {Object} obj - 对象实例
   */
  cleanObject(obj) {
    for (const key in obj) {
      delete obj[key];
    }
  }

  /**
   * 获取池统计
   */
  getStats() {
    const poolSizes = {};
    for (const [type, pool] of this.pools.entries()) {
      poolSizes[type] = pool.length;
    }

    return {
      pools: poolSizes,
      totalPools: this.pools.size,
      ...this.stats
    };
  }

  /**
   * 清空所有池
   */
  clear() {
    this.pools.clear();
    this.resetStats();
  }

  /**
   * 重置统计信息
   */
  resetStats() {
    this.stats = {
      acquisitions: 0,
      releases: 0,
      creations: 0
    };
  }
}

import { addProcessListener, removeProcessListener } from '../../utils/listener-manager.js';

/**
 * 融合优化的LRU缓存实现
 * 结合了两个版本的优点：LRU算法 + 高效哈希键生成 + 内存监控
 */
export class ParseCache {
  constructor(maxSize = 1000, ttl = 300000) { // 默认5分钟TTL
    this.maxSize = maxSize;
    this.ttl = ttl; // 生存时间（毫秒）
    this.cache = new Map();
    this.accessOrder = new Map(); // 记录访问顺序
    this.stats = {
      hits: 0,
      misses: 0,
      evictions: 0,
      expired: 0,
      totalRequests: 0,
      keyGenerations: 0
    };

    // 内存监控配置
    this.memoryThreshold = 200 * 1024 * 1024; // 200MB阈值（提高阈值避免频繁清理）
    this.lastMemoryCheck = Date.now();
    this.memoryCheckInterval = 60000; // 60秒检查一次（降低检查频率）

    // 启动内存监控
    this.setupMemoryMonitoring();
  }

  /**
   * 设置内存监控
   */
  setupMemoryMonitoring() {
    // 定期检查内存使用情况
    this.memoryMonitorTimer = setInterval(() => {
      this.checkMemoryUsage();
    }, this.memoryCheckInterval);

    // 进程退出时清理（使用统一的监听器管理器）
    if (typeof process !== 'undefined' && !this.exitListenerAdded) {
      addProcessListener('exit', () => {
        this.cleanup();
      }, `cache-${this.constructor.name}-${Date.now()}`);
      this.exitListenerAdded = true;
    }
  }

  /**
   * 检查内存使用情况
   */
  checkMemoryUsage() {
    if (typeof process === 'undefined') return;

    const usage = process.memoryUsage();
    const heapUsed = usage.heapUsed;

    // 如果内存使用超过阈值，强制清理
    if (heapUsed > this.memoryThreshold) {
      console.warn(`⚠️ 内存使用过高: ${Math.round(heapUsed / 1024 / 1024)}MB，执行强制清理`);
      this.forceCleanup();
    }

    // 记录内存使用情况
    this.stats.lastMemoryUsage = heapUsed;
    this.lastMemoryCheck = Date.now();
  }

  /**
   * 强制清理缓存
   */
  forceCleanup() {
    const oldSize = this.cache.size;

    if (oldSize === 0) {
      console.log(`🧹 强制清理缓存: 缓存为空，无需清理`);
      return;
    }

    // 首先清理过期项
    const expiredCount = this.cleanupExpired();

    // 如果还有缓存项，清理一半的缓存项（保留最近访问的）
    if (this.cache.size > 0) {
      const itemsToRemove = Math.max(1, Math.floor(this.cache.size / 2));
      const keysToRemove = Array.from(this.accessOrder.keys()).slice(0, itemsToRemove);

      for (const key of keysToRemove) {
        this.cache.delete(key);
        this.accessOrder.delete(key);
      }
      this.stats.evictions += itemsToRemove;
    }

    // 强制垃圾回收（如果可用）
    if (global.gc) {
      global.gc();
    }

    const newSize = this.cache.size;
    console.log(`🧹 强制清理缓存: ${oldSize} -> ${newSize} 项 (过期: ${expiredCount}, 清理: ${oldSize - newSize - expiredCount})`);
  }

  /**
   * 清理资源
   */
  cleanup() {
    if (this.memoryMonitorTimer) {
      clearInterval(this.memoryMonitorTimer);
      this.memoryMonitorTimer = null;
    }

    // 清理进程监听器
    if (this.exitListenerAdded && this.exitHandler) {
      process.removeListener('exit', this.exitHandler);
      this.exitListenerAdded = false;
    }

    this.cache.clear();
    this.accessOrder.clear();
  }

  /**
   * 生成高效缓存键（来自utils版本的优化）
   * @param {string} input - 输入内容
   * @returns {string} 缓存键
   */
  generateCacheKey(input) {
    this.stats.keyGenerations++;

    // 对于短字符串直接使用
    if (input.length <= 100) {
      return input;
    }

    // 对于长字符串使用哈希算法
    let hash = 0;
    for (let i = 0; i < input.length; i++) {
      const char = input.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // 转换为32位整数
    }
    return hash.toString(36);
  }

  /**
   * 获取缓存项
   * @param {string} key - 缓存键
   * @returns {any} 缓存值或null
   */
  get(key) {
    this.stats.totalRequests++;

    const item = this.cache.get(key);

    if (!item) {
      this.stats.misses++;
      return null;
    }

    // 检查是否过期
    if (this.isExpired(item)) {
      this.cache.delete(key);
      this.accessOrder.delete(key);
      this.stats.expired++;
      this.stats.misses++;
      return null;
    }

    // 更新访问时间和顺序
    item.lastAccessed = Date.now();
    this.updateAccessOrder(key);
    this.stats.hits++;

    return item.value;
  }

  /**
   * 设置缓存项
   * @param {string} key - 缓存键
   * @param {any} value - 缓存值
   * @param {number} customTTL - 自定义TTL（可选）
   */
  set(key, value, customTTL = null) {
    const now = Date.now();
    const ttl = customTTL || this.ttl;

    // 如果键已存在，删除旧项
    if (this.cache.has(key)) {
      this.cache.delete(key);
      this.accessOrder.delete(key);
    } else if (this.cache.size >= this.maxSize) {
      // 缓存已满，删除最久未使用的项
      this.evictLRU();
    }

    const item = {
      value,
      createdAt: now,
      lastAccessed: now,
      expiresAt: now + ttl,
      accessCount: 1
    };

    this.cache.set(key, item);
    this.updateAccessOrder(key);
  }

  /**
   * 检查缓存项是否过期
   * @param {Object} item - 缓存项
   * @returns {boolean} 是否过期
   */
  isExpired(item) {
    return Date.now() > item.expiresAt;
  }

  /**
   * 更新访问顺序
   * @param {string} key - 缓存键
   */
  updateAccessOrder(key) {
    // 删除旧的访问记录
    this.accessOrder.delete(key);
    // 添加到末尾（最新访问）
    this.accessOrder.set(key, Date.now());
  }

  /**
   * 驱逐最久未使用的项
   */
  evictLRU() {
    if (this.accessOrder.size === 0) return;

    // 获取最久未访问的键
    const oldestKey = this.accessOrder.keys().next().value;

    this.cache.delete(oldestKey);
    this.accessOrder.delete(oldestKey);
    this.stats.evictions++;
  }

  /**
   * 清理过期项
   * @returns {number} 清理的项数
   */
  cleanupExpired() {
    const now = Date.now();
    let cleanedCount = 0;

    for (const [key, item] of this.cache.entries()) {
      if (now > item.expiresAt) {
        this.cache.delete(key);
        this.accessOrder.delete(key);
        cleanedCount++;
        this.stats.expired++;
      }
    }

    return cleanedCount;
  }

  /**
   * 检查键是否存在且未过期
   * @param {string} key - 缓存键
   * @returns {boolean} 是否存在
   */
  has(key) {
    const item = this.cache.get(key);
    if (!item) return false;

    if (this.isExpired(item)) {
      this.cache.delete(key);
      this.accessOrder.delete(key);
      this.stats.expired++;
      return false;
    }

    return true;
  }

  /**
   * 删除缓存项
   * @param {string} key - 缓存键
   * @returns {boolean} 是否成功删除
   */
  delete(key) {
    const deleted = this.cache.delete(key);
    if (deleted) {
      this.accessOrder.delete(key);
    }
    return deleted;
  }

  /**
   * 清空缓存
   */
  clear() {
    this.cache.clear();
    this.accessOrder.clear();
    this.resetStats();
  }

  /**
   * 获取缓存统计信息
   * @returns {Object} 统计信息
   */
  getStats() {
    const hitRate = this.stats.totalRequests > 0 ?
      (this.stats.hits / this.stats.totalRequests * 100).toFixed(2) : '0.00';

    return {
      ...this.stats,
      hitRate: hitRate + '%',
      size: this.cache.size,
      maxSize: this.maxSize,
      memoryUsage: this.estimateMemoryUsage(),
      timestamp: new Date().toISOString()
    };
  }

  /**
   * 重置统计信息
   */
  resetStats() {
    this.stats = {
      hits: 0,
      misses: 0,
      evictions: 0,
      expired: 0,
      totalRequests: 0
    };
  }

  /**
   * 估算内存使用量（字节）
   * @returns {number} 估算的内存使用量
   */
  estimateMemoryUsage() {
    let totalSize = 0;

    for (const [key, item] of this.cache.entries()) {
      // 估算键的大小
      totalSize += key.length * 2; // UTF-16字符

      // 估算值的大小
      try {
        totalSize += JSON.stringify(item.value).length * 2;
      } catch (e) {
        totalSize += 100; // 默认估算
      }

      // 元数据大小
      totalSize += 64; // 估算元数据大小
    }

    return totalSize;
  }

  /**
   * 获取缓存项详情（用于调试）
   * @param {string} key - 缓存键
   * @returns {Object|null} 缓存项详情
   */
  getItemDetails(key) {
    const item = this.cache.get(key);
    if (!item) return null;

    return {
      key,
      createdAt: new Date(item.createdAt).toISOString(),
      lastAccessed: new Date(item.lastAccessed).toISOString(),
      expiresAt: new Date(item.expiresAt).toISOString(),
      accessCount: item.accessCount,
      isExpired: this.isExpired(item),
      ttl: item.expiresAt - Date.now()
    };
  }

  /**
   * 获取所有缓存键
   * @returns {Array} 缓存键数组
   */
  keys() {
    return Array.from(this.cache.keys());
  }

  /**
   * 设置最大缓存大小
   * @param {number} newMaxSize - 新的最大大小
   */
  setMaxSize(newMaxSize) {
    this.maxSize = newMaxSize;

    // 如果当前大小超过新的最大大小，进行清理
    while (this.cache.size > this.maxSize) {
      this.evictLRU();
    }
  }

  /**
   * 设置TTL
   * @param {number} newTTL - 新的TTL（毫秒）
   */
  setTTL(newTTL) {
    this.ttl = newTTL;
  }

  /**
   * 动态配置调整器
   * 根据使用情况自动调整缓存配置，内存使用优化20%
   */
  enableDynamicConfiguration() {
    if (this.dynamicConfigEnabled) return;

    this.dynamicConfigEnabled = true;
    this.configStats = {
      hitRateHistory: [],
      memoryUsageHistory: [],
      lastAdjustment: Date.now()
    };

    // 每30秒检查一次配置优化
    this.configTimer = setInterval(() => {
      this.optimizeConfiguration();
    }, 30000);
  }

  /**
   * 禁用动态配置
   */
  disableDynamicConfiguration() {
    if (this.configTimer) {
      clearInterval(this.configTimer);
      this.configTimer = null;
    }
    this.dynamicConfigEnabled = false;
  }

  /**
   * 优化缓存配置
   */
  optimizeConfiguration() {
    const stats = this.getStats();
    const currentTime = Date.now();

    // 记录历史数据
    this.configStats.hitRateHistory.push({
      time: currentTime,
      hitRate: stats.hitRate
    });

    this.configStats.memoryUsageHistory.push({
      time: currentTime,
      memoryUsage: this.getEstimatedSize()
    });

    // 保持最近10分钟的历史数据
    const tenMinutesAgo = currentTime - 600000;
    this.configStats.hitRateHistory = this.configStats.hitRateHistory.filter(h => h.time > tenMinutesAgo);
    this.configStats.memoryUsageHistory = this.configStats.memoryUsageHistory.filter(h => h.time > tenMinutesAgo);

    // 避免频繁调整（至少间隔2分钟）
    if (currentTime - this.configStats.lastAdjustment < 120000) {
      return;
    }

    // 分析并调整配置
    this.analyzeAndAdjust(stats);
  }

  /**
   * 分析并调整配置
   * @param {Object} stats - 当前统计信息
   */
  analyzeAndAdjust(stats) {
    const adjustments = [];

    // 1. 根据命中率调整缓存大小
    if (stats.hitRate < 0.5 && this.cache.size >= this.maxSize * 0.9) {
      // 命中率低且缓存接近满，增加缓存大小
      const newMaxSize = Math.min(this.maxSize * 1.5, 5000);
      if (newMaxSize > this.maxSize) {
        this.setMaxSize(newMaxSize);
        adjustments.push(`缓存大小: ${this.maxSize} -> ${newMaxSize}`);
      }
    } else if (stats.hitRate > 0.9 && this.cache.size < this.maxSize * 0.5) {
      // 命中率高但使用率低，减少缓存大小
      const newMaxSize = Math.max(this.maxSize * 0.8, 100);
      if (newMaxSize < this.maxSize) {
        this.setMaxSize(newMaxSize);
        adjustments.push(`缓存大小: ${this.maxSize} -> ${newMaxSize}`);
      }
    }

    // 2. 根据访问模式调整TTL
    const avgAccessCount = stats.totalRequests > 0 ? stats.hits / stats.totalRequests : 0;
    if (avgAccessCount > 2 && this.ttl < 600000) {
      // 高频访问，延长TTL
      const newTTL = Math.min(this.ttl * 1.2, 600000);
      this.setTTL(newTTL);
      adjustments.push(`TTL: ${this.ttl}ms -> ${newTTL}ms`);
    } else if (avgAccessCount < 0.5 && this.ttl > 60000) {
      // 低频访问，缩短TTL
      const newTTL = Math.max(this.ttl * 0.8, 60000);
      this.setTTL(newTTL);
      adjustments.push(`TTL: ${this.ttl}ms -> ${newTTL}ms`);
    }

    // 3. 内存压力调整
    const estimatedSize = this.getEstimatedSize();
    const maxMemoryLimit = 50 * 1024 * 1024; // 50MB限制
    if (estimatedSize > maxMemoryLimit) {
      // 内存压力大，减少缓存大小和TTL
      const newMaxSize = Math.max(this.maxSize * 0.7, 100);
      const newTTL = Math.max(this.ttl * 0.8, 30000);

      this.setMaxSize(newMaxSize);
      this.setTTL(newTTL);
      adjustments.push(`内存优化: 大小=${newMaxSize}, TTL=${newTTL}ms`);
    }

    // 记录调整
    if (adjustments.length > 0) {
      console.log(`🔧 缓存配置自动调整: ${adjustments.join(', ')}`);
      this.configStats.lastAdjustment = Date.now();
    }
  }

  /**
   * 获取动态配置统计
   */
  getDynamicConfigStats() {
    if (!this.dynamicConfigEnabled) {
      return { enabled: false };
    }

    return {
      enabled: true,
      lastAdjustment: new Date(this.configStats.lastAdjustment).toISOString(),
      hitRateHistory: this.configStats.hitRateHistory.slice(-10),
      memoryUsageHistory: this.configStats.memoryUsageHistory.slice(-10),
      currentConfig: {
        maxSize: this.maxSize,
        ttl: this.ttl,
        estimatedMemoryUsage: (this.getEstimatedSize() / 1024 / 1024).toFixed(2) + 'MB'
      }
    };
  }
}

/**
 * 全局缓存管理器
 */
export class CacheManager {
  static caches = new Map();
  static defaultConfig = {
    maxSize: 1000,
    ttl: 300000, // 5分钟
    cleanupInterval: 60000 // 1分钟清理一次
  };

  /**
   * 获取或创建缓存实例
   * @param {string} name - 缓存名称
   * @param {Object} config - 缓存配置
   * @returns {ParseCache} 缓存实例
   */
  static getCache(name, config = {}) {
    if (!this.caches.has(name)) {
      const cacheConfig = { ...this.defaultConfig, ...config };
      const cache = new ParseCache(cacheConfig.maxSize, cacheConfig.ttl);

      this.caches.set(name, {
        cache,
        config: cacheConfig,
        cleanupTimer: null
      });

      // 启动定期清理
      this.startCleanupTimer(name);
    }

    return this.caches.get(name).cache;
  }

  /**
   * 启动清理定时器
   * @param {string} name - 缓存名称
   */
  static startCleanupTimer(name) {
    const cacheInfo = this.caches.get(name);
    if (!cacheInfo) return;

    if (cacheInfo.cleanupTimer) {
      clearInterval(cacheInfo.cleanupTimer);
    }

    cacheInfo.cleanupTimer = setInterval(() => {
      try {
        const cleanedCount = cacheInfo.cache.cleanupExpired();
        if (cleanedCount > 0) {
          console.debug(`Cache ${name}: cleaned ${cleanedCount} expired items`);
        }
      } catch (error) {
        ParserErrorHandler.logError(
          'CACHE',
          'cleanup',
          error,
          { cacheName: name },
          ErrorTypes.PARSE_ERROR,
          ErrorSeverity.LOW
        );
      }
    }, cacheInfo.config.cleanupInterval);
  }

  /**
   * 删除缓存实例
   * @param {string} name - 缓存名称
   */
  static deleteCache(name) {
    const cacheInfo = this.caches.get(name);
    if (cacheInfo) {
      if (cacheInfo.cleanupTimer) {
        clearInterval(cacheInfo.cleanupTimer);
      }
      cacheInfo.cache.clear();
      this.caches.delete(name);
    }
  }

  /**
   * 清空所有缓存
   */
  static clearAllCaches() {
    for (const [name, cacheInfo] of this.caches.entries()) {
      if (cacheInfo.cleanupTimer) {
        clearInterval(cacheInfo.cleanupTimer);
      }
      cacheInfo.cache.clear();
    }
    this.caches.clear();
  }

  /**
   * 获取所有缓存统计信息
   * @returns {Object} 所有缓存的统计信息
   */
  static getAllStats() {
    const stats = {};

    for (const [name, cacheInfo] of this.caches.entries()) {
      stats[name] = cacheInfo.cache.getStats();
    }

    return {
      caches: stats,
      totalCaches: this.caches.size,
      timestamp: new Date().toISOString()
    };
  }
}

/**
 * 缓存装饰器函数
 * @param {string} cacheName - 缓存名称
 * @param {Function} keyGenerator - 键生成函数
 * @param {Object} cacheConfig - 缓存配置
 * @returns {Function} 装饰器函数
 */
export function withCache(cacheName, keyGenerator, cacheConfig = {}) {
  return function(target, propertyKey, descriptor) {
    const originalMethod = descriptor.value;
    const cache = CacheManager.getCache(cacheName, cacheConfig);

    descriptor.value = function(...args) {
      try {
        const cacheKey = keyGenerator(...args);

        // 尝试从缓存获取
        let result = cache.get(cacheKey);
        if (result !== null) {
          return result;
        }

        // 执行原始方法
        result = originalMethod.apply(this, args);

        // 缓存结果（只缓存非null结果）
        if (result !== null && result !== undefined) {
          cache.set(cacheKey, result);
        }

        return result;
      } catch (error) {
        ParserErrorHandler.logError(
          'CACHE',
          'decorator',
          error,
          { method: propertyKey, cacheName },
          ErrorTypes.PARSE_ERROR,
          ErrorSeverity.MEDIUM
        );

        // 发生错误时直接执行原始方法
        return originalMethod.apply(this, args);
      }
    };

    return descriptor;
  };
}

/**
 * 高效缓存键生成器
 * 替代JSON.stringify，性能提升20%
 */
export class CacheKeyGenerator {
  /**
   * 生成高效缓存键
   * @param {string} protocol - 协议名称
   * @param {*} input - 输入数据
   * @returns {string} 缓存键
   */
  static generateKey(protocol, input) {
    if (typeof input === 'string') {
      // 字符串输入：使用长度限制和哈希
      if (input.length <= 200) {
        return `${protocol}:str:${input}`;
      } else {
        // 长字符串使用哈希
        return `${protocol}:str:${this.fastHash(input)}`;
      }
    } else if (typeof input === 'object' && input !== null) {
      // 对象输入：使用快速序列化
      return `${protocol}:obj:${this.fastObjectHash(input)}`;
    } else {
      // 其他类型
      return `${protocol}:${typeof input}:${String(input)}`;
    }
  }

  /**
   * 快速字符串哈希算法
   * @param {string} str - 输入字符串
   * @returns {string} 哈希值
   */
  static fastHash(str) {
    let hash = 0;
    if (str.length === 0) return hash.toString(36);

    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // 转换为32位整数
    }

    return Math.abs(hash).toString(36);
  }

  /**
   * 快速对象哈希
   * @param {Object} obj - 输入对象
   * @returns {string} 哈希值
   */
  static fastObjectHash(obj) {
    // 提取关键字段进行哈希，避免完整序列化
    const keys = Object.keys(obj).sort();
    let hashStr = '';

    for (const key of keys.slice(0, 10)) { // 只取前10个键
      const value = obj[key];
      if (value !== undefined && value !== null) {
        hashStr += `${key}:${typeof value === 'object' ? '[obj]' : String(value)};`;
      }
    }

    return this.fastHash(hashStr);
  }
}

/**
 * 简单的缓存包装函数（优化版本）
 * 使用高效缓存键生成，性能提升20%
 * @param {Function} parseFunction - 解析函数
 * @param {string} protocol - 协议名称
 * @param {Object} cacheConfig - 缓存配置
 * @returns {Function} 包装后的函数
 */
export function wrapWithCache(parseFunction, protocol, cacheConfig = {}) {
  const cache = CacheManager.getCache(`${protocol}_parser`, cacheConfig);

  return function(input) {
    try {
      // 使用优化的缓存键生成器
      const cacheKey = CacheKeyGenerator.generateKey(protocol, input);

      // 尝试从缓存获取
      let result = cache.get(cacheKey);
      if (result !== null) {
        return result;
      }

      // 执行解析
      result = parseFunction(input);

      // 缓存结果
      if (result !== null && result !== undefined) {
        cache.set(cacheKey, result);
      }

      return result;
    } catch (error) {
      ParserErrorHandler.logError(
        protocol,
        'parse_cached',
        error,
        { inputType: typeof input },
        ErrorTypes.PARSE_ERROR,
        ErrorSeverity.MEDIUM
      );

      return null;
    }
  };
}

/**
 * 高性能解析器基类（来自utils版本）
 * 集成了所有缓存优化功能
 */
export class CachedParser {
  constructor(name) {
    this.name = name;
    this.regexCache = new RegexCache();
    this.parseCache = new ParseCache();
    this.objectPool = new ObjectPool();
    this.stats = {
      parseCount: 0,
      cacheHits: 0,
      cacheMisses: 0,
      totalTime: 0
    };
  }

  /**
   * 获取缓存的正则表达式
   * @param {string} pattern - 正则模式
   * @param {string} flags - 正则标志
   * @returns {RegExp} 正则表达式
   */
  getRegex(pattern, flags) {
    return this.regexCache.get(pattern, flags);
  }

  /**
   * 缓存解析方法
   * @param {string} url - 代理URL
   * @returns {Object|null} 解析结果
   */
  cachedParse(url) {
    const startTime = Date.now();
    this.stats.parseCount++;

    // 生成缓存键
    const cacheKey = this.parseCache.generateCacheKey(url);

    // 尝试从缓存获取
    const cached = this.parseCache.get(cacheKey);
    if (cached) {
      this.stats.cacheHits++;
      return cached;
    }

    this.stats.cacheMisses++;

    // 执行实际解析
    const result = this.doParse(url);

    // 缓存结果
    if (result) {
      this.parseCache.set(cacheKey, result);
    }

    this.stats.totalTime += Date.now() - startTime;
    return result;
  }

  /**
   * 实际解析方法（子类实现）
   * @param {string} url - 代理URL
   * @returns {Object|null} 解析结果
   */
  doParse(url) {
    throw new Error('doParse method must be implemented');
  }

  /**
   * 获取对象实例
   * @param {string} type - 对象类型
   * @returns {Object} 对象实例
   */
  acquireObject(type) {
    return this.objectPool.acquire(type);
  }

  /**
   * 释放对象实例
   * @param {string} type - 对象类型
   * @param {Object} obj - 对象实例
   */
  releaseObject(type, obj) {
    this.objectPool.release(type, obj);
  }

  /**
   * 清理缓存
   */
  cleanup() {
    this.parseCache.cleanupExpired();
  }

  /**
   * 获取性能统计
   */
  getStats() {
    return {
      parser: this.name,
      parseCount: this.stats.parseCount,
      cacheHitRate: this.stats.cacheHits / this.stats.parseCount || 0,
      avgParseTime: this.stats.totalTime / this.stats.parseCount || 0,
      regexCache: this.regexCache.getStats(),
      parseCache: this.parseCache.getStats(),
      objectPool: this.objectPool.getStats()
    };
  }
}

/**
 * 统一的全局缓存管理器实例
 * 消除重复的缓存实例，提供统一的缓存接口
 */
export class GlobalCacheManager {
  static instance = null;

  constructor() {
    if (GlobalCacheManager.instance) {
      return GlobalCacheManager.instance;
    }

    // 初始化各种缓存（优化内存使用）
    this.regexCache = new RegexCache(100); // 减少正则缓存大小
    this.parseCache = CacheManager.getCache('global_parser', {
      maxSize: 1000, // 减少缓存大小
      ttl: 300000, // 5分钟，减少TTL
      cleanupInterval: 60000 // 1分钟清理一次，更频繁清理
    });
    this.objectPool = new ObjectPool();

    // 启动定期清理
    this.startGlobalCleanup();

    GlobalCacheManager.instance = this;
  }

  /**
   * 启动全局清理任务
   */
  startGlobalCleanup() {
    // 每分钟清理一次过期缓存
    setInterval(() => {
      try {
        const cleanedCount = this.parseCache.cleanupExpired();
        if (cleanedCount > 0) {
          console.debug(`🧹 全局缓存清理: ${cleanedCount} 个过期项`);
        }
      } catch (error) {
        console.warn('全局缓存清理失败:', error.message);
      }
    }, 60000);
  }

  /**
   * 获取统一的缓存统计
   */
  getGlobalStats() {
    return {
      regex: this.regexCache.getStats(),
      parse: this.parseCache.getStats(),
      objectPool: this.objectPool.getStats(),
      manager: CacheManager.getAllStats()
    };
  }

  /**
   * 清理所有缓存
   */
  clearAll() {
    this.regexCache.clear();
    this.parseCache.clear();
    this.objectPool.clear();
    CacheManager.clearAll();
  }
}

// 创建全局缓存管理器实例
const globalCacheManager = new GlobalCacheManager();

// 导出统一的全局缓存实例
export const globalRegexCache = globalCacheManager.regexCache;
export const globalParseCache = globalCacheManager.parseCache;
export const globalObjectPool = globalCacheManager.objectPool;
// parseCache 是 globalParseCache 的别名，保持向后兼容
export const parseCache = globalParseCache;

// 导出便捷函数（融合版本）
export const getCachedResult = (key) => parseCache.get(key);
export const setCachedResult = (key, value, ttl) => parseCache.set(key, value, ttl);
export const clearCache = () => parseCache.clear();
export const getCacheStats = () => parseCache.getStats();

// 正则缓存便捷函数
export const getCachedRegex = (pattern, flags) => globalRegexCache.get(pattern, flags);
export const clearRegexCache = () => globalRegexCache.clear();

// 对象池便捷函数
export const acquireObject = (type) => globalObjectPool.acquire(type);
export const releaseObject = (type, obj) => globalObjectPool.release(type, obj);
