/**
 * 性能优化工具集
 * 提供流式处理、并发控制、缓存机制等性能优化功能
 */

/**
 * 流式处理器
 * 用于处理大量数据时避免内存溢出
 */
export class StreamProcessor {
  constructor(chunkSize = 1000) {
    this.chunkSize = chunkSize;
    this.stats = {
      totalProcessed: 0,
      chunksProcessed: 0,
      processingTime: 0,
      memoryUsage: []
    };
  }

  /**
   * 流式处理大数据集
   * @param {Array} data - 要处理的数据
   * @param {Function} processor - 处理函数
   * @param {Object} options - 选项
   * @returns {Promise<Array>} 处理结果
   */
  async processLargeDataset(data, processor, options = {}) {
    const {
      enableGC = true,
      memoryThreshold = 100 * 1024 * 1024, // 100MB
      progressCallback = null
    } = options;

    const startTime = Date.now();
    const results = [];
    const totalChunks = Math.ceil(data.length / this.chunkSize);

    console.log(`🔄 开始流式处理，数据量: ${data.length}，分块数: ${totalChunks}`);

    for (let i = 0; i < data.length; i += this.chunkSize) {
      const chunk = data.slice(i, i + this.chunkSize);
      const chunkIndex = Math.floor(i / this.chunkSize) + 1;

      try {
        // 处理当前块
        const processed = await processor(chunk);
        results.push(...processed);

        this.stats.chunksProcessed++;
        this.stats.totalProcessed += chunk.length;

        // 记录内存使用情况
        if (global.process && process.memoryUsage) {
          const memUsage = process.memoryUsage();
          this.stats.memoryUsage.push(memUsage.heapUsed);

          // 内存压力检测
          if (memUsage.heapUsed > memoryThreshold) {
            console.warn(`⚠️ 内存使用过高: ${(memUsage.heapUsed / 1024 / 1024).toFixed(2)}MB`);
          }
        }

        // 进度回调
        if (progressCallback) {
          progressCallback({
            current: chunkIndex,
            total: totalChunks,
            processed: this.stats.totalProcessed,
            percentage: (chunkIndex / totalChunks * 100).toFixed(2)
          });
        }

        // 垃圾回收
        if (enableGC && global.gc && chunkIndex % 10 === 0) {
          global.gc();
        }

        console.log(`✅ 处理块 ${chunkIndex}/${totalChunks} (${chunk.length} 项)`);

      } catch (error) {
        console.error(`❌ 处理块 ${chunkIndex} 失败:`, error.message);
        throw error;
      }
    }

    this.stats.processingTime = Date.now() - startTime;
    console.log(`🎉 流式处理完成，耗时: ${this.stats.processingTime}ms`);

    return results;
  }

  /**
   * 获取统计信息
   * @returns {Object} 统计信息
   */
  getStats() {
    const avgMemory = this.stats.memoryUsage.length > 0 ?
      this.stats.memoryUsage.reduce((a, b) => a + b, 0) / this.stats.memoryUsage.length : 0;

    return {
      ...this.stats,
      averageMemoryUsage: (avgMemory / 1024 / 1024).toFixed(2) + 'MB',
      throughput: this.stats.processingTime > 0 ?
        (this.stats.totalProcessed / this.stats.processingTime * 1000).toFixed(2) + ' items/sec' : '0 items/sec'
    };
  }
}

/**
 * 并发控制器
 * 控制异步操作的并发数量，避免资源耗尽
 */
export class ConcurrencyController {
  constructor(limit = 15) {
    this.limit = limit;
    this.running = 0;
    this.queue = [];
    this.stats = {
      totalTasks: 0,
      completedTasks: 0,
      failedTasks: 0,
      averageWaitTime: 0,
      maxConcurrency: 0
    };
  }

  /**
   * 执行任务
   * @param {Function} task - 异步任务函数
   * @returns {Promise} 任务结果
   */
  async execute(task) {
    return new Promise((resolve, reject) => {
      const taskInfo = {
        task,
        resolve,
        reject,
        enqueueTime: Date.now()
      };

      this.queue.push(taskInfo);
      this.stats.totalTasks++;
      this.process();
    });
  }

  /**
   * 批量执行任务
   * @param {Function[]} tasks - 任务数组
   * @returns {Promise<Array>} 所有任务结果
   */
  async executeAll(tasks) {
    const promises = tasks.map(task => this.execute(task));
    return Promise.allSettled(promises);
  }

  /**
   * 处理队列
   */
  async process() {
    if (this.running >= this.limit || this.queue.length === 0) {
      return;
    }

    this.running++;
    this.stats.maxConcurrency = Math.max(this.stats.maxConcurrency, this.running);

    const { task, resolve, reject, enqueueTime } = this.queue.shift();
    const waitTime = Date.now() - enqueueTime;

    // 更新平均等待时间
    this.stats.averageWaitTime =
      (this.stats.averageWaitTime * this.stats.completedTasks + waitTime) /
      (this.stats.completedTasks + 1);

    try {
      const result = await task();
      resolve(result);
      this.stats.completedTasks++;
    } catch (error) {
      reject(error);
      this.stats.failedTasks++;
    } finally {
      this.running--;
      this.process(); // 处理下一个任务
    }
  }

  /**
   * 获取统计信息
   * @returns {Object} 统计信息
   */
  getStats() {
    return {
      ...this.stats,
      currentRunning: this.running,
      queueLength: this.queue.length,
      successRate: this.stats.totalTasks > 0 ?
        (this.stats.completedTasks / this.stats.totalTasks * 100).toFixed(2) + '%' : '0%',
      averageWaitTime: this.stats.averageWaitTime.toFixed(2) + 'ms'
    };
  }
}

/**
 * 资源缓存管理器
 * 提供带TTL的缓存机制
 */
export class ResourceCache {
  constructor(maxSize = 1000, ttl = 300000) { // 默认5分钟TTL
    this.cache = new Map();
    this.maxSize = maxSize;
    this.ttl = ttl;
    this.stats = {
      hits: 0,
      misses: 0,
      sets: 0,
      evictions: 0
    };
  }

  /**
   * 设置缓存
   * @param {string} key - 缓存键
   * @param {any} value - 缓存值
   */
  set(key, value) {
    // 检查缓存大小限制
    if (this.cache.size >= this.maxSize) {
      this.evictOldest();
    }

    this.cache.set(key, {
      value,
      timestamp: Date.now(),
      accessCount: 0
    });

    this.stats.sets++;
  }

  /**
   * 获取缓存
   * @param {string} key - 缓存键
   * @returns {any|null} 缓存值
   */
  get(key) {
    const item = this.cache.get(key);

    if (!item) {
      this.stats.misses++;
      return null;
    }

    // 检查TTL
    if (Date.now() - item.timestamp > this.ttl) {
      this.cache.delete(key);
      this.stats.misses++;
      return null;
    }

    // 更新访问信息
    item.accessCount++;
    this.stats.hits++;

    return item.value;
  }

  /**
   * 删除最旧的缓存项
   */
  evictOldest() {
    let oldestKey = null;
    let oldestTime = Date.now();

    for (const [key, item] of this.cache) {
      if (item.timestamp < oldestTime) {
        oldestTime = item.timestamp;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.cache.delete(oldestKey);
      this.stats.evictions++;
    }
  }

  /**
   * 清理过期缓存
   */
  cleanup() {
    const now = Date.now();
    let cleaned = 0;

    for (const [key, item] of this.cache) {
      if (now - item.timestamp > this.ttl) {
        this.cache.delete(key);
        cleaned++;
      }
    }

    console.log(`🧹 清理了 ${cleaned} 个过期缓存项`);
    return cleaned;
  }

  /**
   * 获取缓存统计信息
   * @returns {Object} 统计信息
   */
  getStats() {
    const totalRequests = this.stats.hits + this.stats.misses;

    return {
      ...this.stats,
      size: this.cache.size,
      hitRate: totalRequests > 0 ?
        (this.stats.hits / totalRequests * 100).toFixed(2) + '%' : '0%',
      memoryUsage: this.getMemoryUsage()
    };
  }

  /**
   * 估算内存使用量
   * @returns {string} 内存使用量
   */
  getMemoryUsage() {
    const sampleSize = Math.min(10, this.cache.size);
    let totalSize = 0;
    let count = 0;

    for (const [key, item] of this.cache) {
      if (count >= sampleSize) break;

      totalSize += JSON.stringify({ key, value: item.value }).length * 2; // 粗略估算
      count++;
    }

    const averageSize = count > 0 ? totalSize / count : 0;
    const estimatedTotal = averageSize * this.cache.size;

    return (estimatedTotal / 1024).toFixed(2) + 'KB';
  }

  /**
   * 清空缓存
   */
  clear() {
    this.cache.clear();
    this.stats = {
      hits: 0,
      misses: 0,
      sets: 0,
      evictions: 0
    };
  }
}

/**
 * 批处理优化器
 * 优化大批量数据处理性能
 */
export class BatchOptimizer {
  constructor(options = {}) {
    this.batchSize = options.batchSize || 5000;
    this.maxMemoryUsage = options.maxMemoryUsage || 200 * 1024 * 1024; // 200MB
    this.enableWorkerThreads = options.enableWorkerThreads || false;
    this.stats = {
      totalBatches: 0,
      totalItems: 0,
      processingTime: 0,
      memoryPeaks: []
    };
  }

  /**
   * 智能批处理
   * 根据内存使用情况动态调整批次大小
   * @param {Array} data - 数据数组
   * @param {Function} processor - 处理函数
   * @param {Object} options - 选项
   * @returns {Promise<Array>} 处理结果
   */
  async smartBatchProcess(data, processor, options = {}) {
    const startTime = Date.now();
    const results = [];
    let currentBatchSize = this.batchSize;
    let processedCount = 0;

    console.log(`🚀 开始智能批处理，数据量: ${data.length}`);

    while (processedCount < data.length) {
      const memBefore = this.getMemoryUsage();

      // 动态调整批次大小
      if (memBefore.heapUsed > this.maxMemoryUsage * 0.8) {
        currentBatchSize = Math.max(100, Math.floor(currentBatchSize * 0.7));
        console.log(`⚠️ 内存压力大，减小批次大小至: ${currentBatchSize}`);
      } else if (memBefore.heapUsed < this.maxMemoryUsage * 0.4) {
        currentBatchSize = Math.min(this.batchSize, Math.floor(currentBatchSize * 1.2));
      }

      const batch = data.slice(processedCount, processedCount + currentBatchSize);

      try {
        const batchResult = await processor(batch);
        results.push(...batchResult);

        processedCount += batch.length;
        this.stats.totalBatches++;
        this.stats.totalItems += batch.length;

        const memAfter = this.getMemoryUsage();
        this.stats.memoryPeaks.push(memAfter.heapUsed);

        // 强制垃圾回收
        if (global.gc && this.stats.totalBatches % 5 === 0) {
          global.gc();
        }

        const progress = (processedCount / data.length * 100).toFixed(1);
        console.log(`✅ 批次 ${this.stats.totalBatches} 完成，进度: ${progress}% (${processedCount}/${data.length})`);

      } catch (error) {
        console.error(`❌ 批次处理失败:`, error.message);
        throw error;
      }
    }

    this.stats.processingTime = Date.now() - startTime;
    console.log(`🎉 智能批处理完成，耗时: ${this.stats.processingTime}ms`);

    return results;
  }

  /**
   * 获取内存使用情况
   */
  getMemoryUsage() {
    if (global.process && process.memoryUsage) {
      return process.memoryUsage();
    }
    return { heapUsed: 0, heapTotal: 0, external: 0 };
  }

  /**
   * 获取优化统计
   */
  getOptimizationStats() {
    const avgMemory = this.stats.memoryPeaks.length > 0 ?
      this.stats.memoryPeaks.reduce((a, b) => a + b, 0) / this.stats.memoryPeaks.length : 0;

    return {
      ...this.stats,
      averageMemoryUsage: (avgMemory / 1024 / 1024).toFixed(2) + 'MB',
      throughput: this.stats.processingTime > 0 ?
        (this.stats.totalItems / this.stats.processingTime * 1000).toFixed(2) + ' items/sec' : '0 items/sec',
      averageBatchSize: this.stats.totalBatches > 0 ?
        Math.round(this.stats.totalItems / this.stats.totalBatches) : 0
    };
  }
}

/**
 * 性能监控器
 * 监控系统性能指标
 */
export class PerformanceMonitor {
  constructor() {
    this.metrics = {
      startTime: Date.now(),
      operations: [],
      memorySnapshots: []
    };
  }

  /**
   * 开始监控操作
   * @param {string} name - 操作名称
   * @returns {Function} 结束监控的函数
   */
  startOperation(name) {
    const startTime = Date.now();
    const startMemory = this.getMemoryUsage();

    return () => {
      const endTime = Date.now();
      const endMemory = this.getMemoryUsage();

      this.metrics.operations.push({
        name,
        duration: endTime - startTime,
        startMemory,
        endMemory,
        memoryDelta: endMemory.heapUsed - startMemory.heapUsed,
        timestamp: startTime
      });
    };
  }

  /**
   * 获取内存使用情况
   * @returns {Object} 内存使用信息
   */
  getMemoryUsage() {
    if (global.process && process.memoryUsage) {
      return process.memoryUsage();
    }
    return { heapUsed: 0, heapTotal: 0, external: 0 };
  }

  /**
   * 记录内存快照
   */
  takeMemorySnapshot() {
    this.metrics.memorySnapshots.push({
      timestamp: Date.now(),
      memory: this.getMemoryUsage()
    });
  }

  /**
   * 获取性能报告
   * @returns {Object} 性能报告
   */
  getReport() {
    const totalTime = Date.now() - this.metrics.startTime;
    const operations = this.metrics.operations;

    const report = {
      totalRuntime: totalTime + 'ms',
      operationCount: operations.length,
      averageOperationTime: operations.length > 0 ?
        (operations.reduce((sum, op) => sum + op.duration, 0) / operations.length).toFixed(2) + 'ms' : '0ms',
      memorySnapshots: this.metrics.memorySnapshots.length,
      currentMemory: this.formatMemory(this.getMemoryUsage()),
      slowestOperations: operations
        .sort((a, b) => b.duration - a.duration)
        .slice(0, 5)
        .map(op => ({
          name: op.name,
          duration: op.duration + 'ms',
          memoryDelta: this.formatBytes(op.memoryDelta)
        }))
    };

    return report;
  }

  /**
   * 格式化内存信息
   * @param {Object} memory - 内存对象
   * @returns {Object} 格式化的内存信息
   */
  formatMemory(memory) {
    return {
      heapUsed: this.formatBytes(memory.heapUsed),
      heapTotal: this.formatBytes(memory.heapTotal),
      external: this.formatBytes(memory.external)
    };
  }

  /**
   * 格式化字节数
   * @param {number} bytes - 字节数
   * @returns {string} 格式化的字符串
   */
  formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(Math.abs(bytes)) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
}

/**
 * 性能优化管理器
 * 集成所有性能优化工具的统一管理器
 */
export class PerformanceOptimizer {
  constructor(options = {}) {
    this.streamProcessor = new StreamProcessor(options.chunkSize);
    this.concurrencyController = new ConcurrencyController(options.concurrencyLimit);
    this.resourceCache = new ResourceCache(options.cacheSize, options.cacheTTL);
    this.batchOptimizer = new BatchOptimizer(options.batchOptions);
    this.monitor = new PerformanceMonitor();

    this.config = {
      enableCaching: options.enableCaching !== false,
      enableBatching: options.enableBatching !== false,
      enableConcurrency: options.enableConcurrency !== false,
      autoGC: options.autoGC !== false,
      ...options
    };
  }

  /**
   * 优化大数据集处理
   * @param {Array} data - 数据数组
   * @param {Function} processor - 处理函数
   * @param {Object} options - 选项
   * @returns {Promise<Array>} 处理结果
   */
  async optimizeDataProcessing(data, processor, options = {}) {
    const endMonitor = this.monitor.startOperation('DataProcessing');

    try {
      let result;

      if (data.length > 10000 && this.config.enableBatching) {
        // 大数据集使用批处理优化
        console.log('🚀 使用批处理优化模式');
        result = await this.batchOptimizer.smartBatchProcess(data, processor, options);
      } else if (data.length > 1000) {
        // 中等数据集使用流式处理
        console.log('🌊 使用流式处理模式');
        result = await this.streamProcessor.processLargeDataset(data, processor, options);
      } else {
        // 小数据集直接处理
        console.log('⚡ 使用直接处理模式');
        result = await processor(data);
      }

      return result;
    } finally {
      endMonitor();
    }
  }

  /**
   * 优化并发任务执行
   * @param {Function[]} tasks - 任务数组
   * @returns {Promise<Array>} 任务结果
   */
  async optimizeConcurrentTasks(tasks) {
    if (!this.config.enableConcurrency) {
      // 串行执行
      const results = [];
      for (const task of tasks) {
        results.push(await task());
      }
      return results;
    }

    const endMonitor = this.monitor.startOperation('ConcurrentTasks');

    try {
      return await this.concurrencyController.executeAll(tasks);
    } finally {
      endMonitor();
    }
  }

  /**
   * 缓存优化包装器
   * @param {string} key - 缓存键
   * @param {Function} generator - 数据生成函数
   * @returns {Promise<any>} 缓存或生成的数据
   */
  async withCache(key, generator) {
    if (!this.config.enableCaching) {
      return await generator();
    }

    // 尝试从缓存获取
    const cached = this.resourceCache.get(key);
    if (cached !== null) {
      console.log(`💾 缓存命中: ${key}`);
      return cached;
    }

    // 生成新数据并缓存
    const endMonitor = this.monitor.startOperation('CacheGeneration');
    try {
      const data = await generator();
      this.resourceCache.set(key, data);
      console.log(`💾 缓存设置: ${key}`);
      return data;
    } finally {
      endMonitor();
    }
  }

  /**
   * 内存优化清理
   */
  optimizeMemory() {
    const endMonitor = this.monitor.startOperation('MemoryOptimization');

    try {
      // 清理过期缓存
      const cleaned = this.resourceCache.cleanup();

      // 强制垃圾回收
      if (this.config.autoGC && global.gc) {
        global.gc();
        console.log('🧹 执行垃圾回收');
      }

      console.log(`🧹 内存优化完成，清理了 ${cleaned} 个缓存项`);
    } finally {
      endMonitor();
    }
  }

  /**
   * 获取综合性能报告
   * @returns {Object} 性能报告
   */
  getPerformanceReport() {
    return {
      monitor: this.monitor.getReport(),
      cache: this.resourceCache.getStats(),
      concurrency: this.concurrencyController.getStats(),
      batch: this.batchOptimizer.getOptimizationStats(),
      stream: this.streamProcessor.getStats(),
      config: this.config
    };
  }

  /**
   * 重置所有统计信息
   */
  reset() {
    this.resourceCache.clear();
    this.monitor = new PerformanceMonitor();
    this.batchOptimizer = new BatchOptimizer();
    this.streamProcessor = new StreamProcessor();
    this.concurrencyController = new ConcurrencyController();
  }
}

// 导出默认优化器实例
export const defaultOptimizer = new PerformanceOptimizer();
