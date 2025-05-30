/**
 * 统一输出文件处理器
 * 消除重复的输出文件生成逻辑，提供统一的输出接口
 */

import path from 'path';
import fs from 'fs';
import { OutputFormats } from '../types.js';
import { ProxyConverter } from '../index.js';
import { generateSafeFileName, validateNodes } from './common.js';
import { FileProcessError, ConvertError, defaultErrorHandler } from './errors.js';
import { getConfig } from '../config/default.js';

/**
 * 输出文件生成器类
 */
export class OutputGenerator {
  constructor(options = {}) {
    this.outputDir = options.outputDir || getConfig('outputDir', './output');
    this.converter = new ProxyConverter();
    this.errorHandler = options.errorHandler || defaultErrorHandler;
  }
  
  /**
   * 生成多种格式的输出文件
   * @param {Object[]} nodes - 节点数组
   * @param {string[]} outputFormats - 输出格式数组
   * @param {string} filePrefix - 文件前缀
   * @param {string} sourceFormat - 源格式
   * @returns {Promise<Object>} 生成结果
   */
  async generateOutputFiles(nodes, outputFormats, filePrefix, sourceFormat = 'unknown') {
    try {
      // 验证输入参数
      validateNodes(nodes);
      
      if (!Array.isArray(outputFormats) || outputFormats.length === 0) {
        throw new ConvertError('输出格式数组不能为空');
      }
      
      console.log('\n💾 生成输出文件...');
      
      const results = {
        success: [],
        failed: [],
        total: outputFormats.length
      };
      
      // 确保输出目录存在
      this.ensureOutputDir();
      
      // 生成每种格式的文件
      for (const format of outputFormats) {
        try {
          const result = await this.generateSingleFormat(nodes, format, filePrefix, sourceFormat);
          results.success.push(result);
          console.log(`✅ ${result.formatName}文件已生成`);
        } catch (error) {
          const errorInfo = {
            format,
            error: error.message,
            formatName: this.getFormatName(format)
          };
          results.failed.push(errorInfo);
          console.error(`❌ 生成${errorInfo.formatName}失败: ${error.message}`);
        }
      }
      
      return results;
    } catch (error) {
      throw new FileProcessError(`输出文件生成失败: ${error.message}`, null, { nodes: nodes.length, formats: outputFormats });
    }
  }
  
  /**
   * 生成单一格式的输出文件
   * @param {Object[]} nodes - 节点数组
   * @param {string} format - 输出格式
   * @param {string} filePrefix - 文件前缀
   * @param {string} sourceFormat - 源格式
   * @returns {Promise<Object>} 生成结果
   */
  async generateSingleFormat(nodes, format, filePrefix, sourceFormat) {
    const formatInfo = this.getFormatInfo(format);
    
    if (!formatInfo) {
      throw new ConvertError(`不支持的输出格式: ${format}`);
    }
    
    // 生成内容
    const content = await this.generateContent(nodes, format, sourceFormat);
    
    // 生成安全的文件名
    const fileName = generateSafeFileName(filePrefix, formatInfo.extension);
    const outputPath = path.join(this.outputDir, fileName);
    
    // 写入文件
    await this.writeFile(outputPath, content);
    
    return {
      format,
      formatName: formatInfo.name,
      fileName,
      outputPath,
      size: Buffer.byteLength(content, 'utf8')
    };
  }
  
  /**
   * 生成指定格式的内容
   * @param {Object[]} nodes - 节点数组
   * @param {string} format - 输出格式
   * @param {string} sourceFormat - 源格式
   * @returns {Promise<string>} 生成的内容
   */
  async generateContent(nodes, format, sourceFormat) {
    switch (format) {
      case OutputFormats.CLASH:
        const { toSimpleClashYaml } = await import('../converters/clash.js');
        return toSimpleClashYaml(nodes, { sourceFormat });
        
      case OutputFormats.BASE64:
        return this.converter.convert(nodes, OutputFormats.BASE64);
        
      case OutputFormats.URL:
        return this.converter.convert(nodes, OutputFormats.URL);
        
      case OutputFormats.JSON:
        const jsonData = this.converter.convert(nodes, OutputFormats.JSON);
        return JSON.stringify(jsonData, null, 2);
        
      default:
        throw new ConvertError(`不支持的输出格式: ${format}`);
    }
  }
  
  /**
   * 获取格式信息
   * @param {string} format - 格式名称
   * @returns {Object|null} 格式信息
   */
  getFormatInfo(format) {
    const formatMap = getConfig('outputFormats', {});
    
    // 标准格式映射
    const standardFormats = {
      [OutputFormats.CLASH]: { extension: 'yaml', name: 'Clash YAML' },
      [OutputFormats.BASE64]: { extension: 'txt', name: 'Base64订阅' },
      [OutputFormats.URL]: { extension: 'txt', name: 'URL列表' },
      [OutputFormats.JSON]: { extension: 'json', name: 'JSON数据' }
    };
    
    return standardFormats[format] || formatMap[format] || null;
  }
  
  /**
   * 获取格式名称
   * @param {string} format - 格式
   * @returns {string} 格式名称
   */
  getFormatName(format) {
    const info = this.getFormatInfo(format);
    return info ? info.name : format;
  }
  
  /**
   * 写入文件
   * @param {string} filePath - 文件路径
   * @param {string} content - 文件内容
   * @returns {Promise<void>}
   */
  async writeFile(filePath, content) {
    try {
      await fs.promises.writeFile(filePath, content, 'utf8');
    } catch (error) {
      throw new FileProcessError(`文件写入失败: ${error.message}`, filePath);
    }
  }
  
  /**
   * 确保输出目录存在
   */
  ensureOutputDir() {
    try {
      if (!fs.existsSync(this.outputDir)) {
        fs.mkdirSync(this.outputDir, { recursive: true });
      }
    } catch (error) {
      throw new FileProcessError(`创建输出目录失败: ${error.message}`, this.outputDir);
    }
  }
  
  /**
   * 获取输出文件统计信息
   * @param {string} outputDir - 输出目录
   * @returns {Object} 统计信息
   */
  getOutputStats(outputDir = this.outputDir) {
    try {
      if (!fs.existsSync(outputDir)) {
        return { totalFiles: 0, totalSize: 0, files: [] };
      }
      
      const files = fs.readdirSync(outputDir);
      const stats = {
        totalFiles: files.length,
        totalSize: 0,
        files: []
      };
      
      for (const file of files) {
        const filePath = path.join(outputDir, file);
        const fileStat = fs.statSync(filePath);
        
        stats.files.push({
          name: file,
          size: fileStat.size,
          modified: fileStat.mtime
        });
        
        stats.totalSize += fileStat.size;
      }
      
      return stats;
    } catch (error) {
      this.errorHandler.handle(new FileProcessError(`获取输出统计失败: ${error.message}`, outputDir));
      return { totalFiles: 0, totalSize: 0, files: [] };
    }
  }
  
  /**
   * 清理输出目录
   * @param {string} pattern - 文件名模式（可选）
   * @returns {Promise<number>} 删除的文件数量
   */
  async cleanOutputDir(pattern = null) {
    try {
      if (!fs.existsSync(this.outputDir)) {
        return 0;
      }
      
      const files = fs.readdirSync(this.outputDir);
      let deletedCount = 0;
      
      for (const file of files) {
        if (!pattern || file.includes(pattern)) {
          const filePath = path.join(this.outputDir, file);
          await fs.promises.unlink(filePath);
          deletedCount++;
        }
      }
      
      return deletedCount;
    } catch (error) {
      throw new FileProcessError(`清理输出目录失败: ${error.message}`, this.outputDir);
    }
  }
}

/**
 * 创建默认输出生成器实例
 */
export const defaultOutputGenerator = new OutputGenerator();

/**
 * 便捷函数：生成输出文件
 * @param {Object[]} nodes - 节点数组
 * @param {string[]} outputFormats - 输出格式数组
 * @param {string} filePrefix - 文件前缀
 * @param {string} sourceFormat - 源格式
 * @param {Object} options - 选项
 * @returns {Promise<Object>} 生成结果
 */
export async function generateOutputFiles(nodes, outputFormats, filePrefix, sourceFormat = 'unknown', options = {}) {
  const generator = new OutputGenerator(options);
  return await generator.generateOutputFiles(nodes, outputFormats, filePrefix, sourceFormat);
}

/**
 * 便捷函数：生成单一格式文件
 * @param {Object[]} nodes - 节点数组
 * @param {string} format - 输出格式
 * @param {string} filePrefix - 文件前缀
 * @param {string} sourceFormat - 源格式
 * @param {Object} options - 选项
 * @returns {Promise<Object>} 生成结果
 */
export async function generateSingleFormat(nodes, format, filePrefix, sourceFormat = 'unknown', options = {}) {
  const generator = new OutputGenerator(options);
  return await generator.generateSingleFormat(nodes, format, filePrefix, sourceFormat);
}
