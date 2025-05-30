#!/usr/bin/env node

/**
 * 代理节点文件合并工具
 * 支持合并多个YAML、Base64、URL格式的代理节点文件
 */

import fs from 'fs';
import path from 'path';
import { ProxyConverter } from './src/index.js';
import { OutputFormats } from './src/types.js';

import {
  displayProcessProgress,
  displayMergeStats,
  displayDeduplicationResult,
  validateNodes
} from './src/utils/common.js';
import { generateOutputFiles } from './src/utils/output.js';
import { CONFIG } from './src/config/default.js';
import { FileProcessError, defaultErrorHandler } from './src/utils/errors.js';

// 使用统一配置
const MERGE_CONFIG = CONFIG.mergeConfig;

/**
 * 确保输出目录存在
 */
function ensureOutputDir() {
  if (!fs.existsSync(MERGE_CONFIG.outputDir)) {
    fs.mkdirSync(MERGE_CONFIG.outputDir, { recursive: true });
    console.log(`✅ 创建输出目录: ${MERGE_CONFIG.outputDir}`);
  }
}

/**
 * 读取文件内容
 */
function readFileContent(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch (error) {
    console.error(`❌ 读取文件失败: ${filePath}`, error.message);
    return null;
  }
}



/**
 * 检测文件格式
 */
function detectFileFormat(content, fileName) {
  const ext = path.extname(fileName).toLowerCase();

  if (ext === '.yaml' || ext === '.yml') {
    return 'yaml';
  }

  if (ext === '.txt') {
    // 检查是否为Base64
    if (content.trim().split('\n').length === 1 && content.length > 100) {
      try {
        atob(content.trim());
        return 'base64';
      } catch (e) {
        // 不是Base64，检查是否为URL列表
      }
    }

    // 检查是否为URL列表
    const lines = content.split('\n').filter(line => line.trim());
    const proxyPrefixes = ['ss://', 'ssr://', 'vmess://', 'vless://', 'trojan://', 'hysteria://', 'hysteria2://', 'hy2://', 'tuic://', 'snell://'];
    const hasProxyUrls = lines.some(line =>
      proxyPrefixes.some(prefix => line.trim().startsWith(prefix))
    );

    if (hasProxyUrls) {
      return 'url';
    }
  }

  return 'unknown';
}

/**
 * 扫描并分类文件
 */
function scanAndCategorizeFiles() {
  const categories = {
    yaml: [],
    base64: [],
    url: [],
    unknown: []
  };

  try {
    const files = fs.readdirSync(MERGE_CONFIG.inputDir);

    for (const file of files) {
      if (file === 'test.js') continue;

      const filePath = path.join(MERGE_CONFIG.inputDir, file);
      const stat = fs.statSync(filePath);

      if (stat.isFile()) {
        const content = readFileContent(filePath);
        if (content) {
          const format = detectFileFormat(content, file);
          categories[format].push({ file, path: filePath, content });
        }
      }
    }
  } catch (error) {
    console.error(`❌ 扫描目录失败: ${MERGE_CONFIG.inputDir}`, error.message);
  }

  return categories;
}



/**
 * 合并YAML文件
 */
async function mergeYamlFiles(yamlFiles, customDeduplicationConfig = null, outputFormats = [OutputFormats.CLASH]) {
  displayProcessProgress('YAML文件', '合并');

  if (yamlFiles.length === 0) {
    console.log('⚠️ 没有找到YAML文件');
    return;
  }

  try {
    const converter = new ProxyConverter();
    let allNodes = [];

    for (const fileInfo of yamlFiles) {
      console.log(`📁 处理: ${fileInfo.file}`);
      try {
        const nodes = converter.parse(fileInfo.content, OutputFormats.CLASH);
        console.log(`  ✅ 解析到 ${nodes.length} 个节点`);
        allNodes = allNodes.concat(nodes);
      } catch (error) {
        console.error(`  ❌ 解析失败:`, error.message);
      }
    }

    if (allNodes.length === 0) {
      console.log('⚠️ 没有解析到任何节点');
      return;
    }

    console.log(`\n🔄 处理合并的节点 (总计: ${allNodes.length})`);

    // 验证节点
    validateNodes(allNodes);

    // 去重
    const originalCount = allNodes.length;
    const deduplicationOptions = customDeduplicationConfig || MERGE_CONFIG.defaultOptions.deduplicateOptions;
    allNodes = converter.deduplicate(allNodes, deduplicationOptions);
    displayDeduplicationResult(originalCount, allNodes.length);

    // 重命名
    allNodes = converter.rename(allNodes, MERGE_CONFIG.defaultOptions.renameOptions);
    console.log(`✅ 重命名完成`);

    // 生成统计
    const stats = converter.getStats(allNodes);
    displayMergeStats(stats);

    // 生成输出文件
    await generateOutputFiles(allNodes, outputFormats, 'merged_yaml_nodes', 'yaml');

    console.log(`🎉 YAML文件合并完成！合并了 ${yamlFiles.length} 个文件，共 ${allNodes.length} 个节点`);
  } catch (error) {
    defaultErrorHandler.handle(new FileProcessError(`YAML文件合并失败: ${error.message}`, null, { files: yamlFiles.length }));
  }
}

/**
 * 合并Base64文件
 */
async function mergeBase64Files(base64Files, customDeduplicationConfig = null, outputFormats = [OutputFormats.BASE64]) {
  displayProcessProgress('Base64文件', '合并');

  if (base64Files.length === 0) {
    console.log('⚠️ 没有找到Base64文件');
    return;
  }

  try {
    const converter = new ProxyConverter();
    let allNodes = [];

    for (const fileInfo of base64Files) {
      console.log(`📁 处理: ${fileInfo.file}`);
      try {
        const nodes = converter.parse(fileInfo.content, OutputFormats.BASE64);
        console.log(`  ✅ 解析到 ${nodes.length} 个节点`);
        allNodes = allNodes.concat(nodes);
      } catch (error) {
        console.error(`  ❌ 解析失败:`, error.message);
      }
    }

    if (allNodes.length === 0) {
      console.log('⚠️ 没有解析到任何节点');
      return;
    }

    console.log(`\n🔄 处理合并的节点 (总计: ${allNodes.length})`);

    // 验证节点
    validateNodes(allNodes);

    // 去重
    const originalCount = allNodes.length;
    const deduplicationOptions = customDeduplicationConfig || MERGE_CONFIG.defaultOptions.deduplicateOptions;
    allNodes = converter.deduplicate(allNodes, deduplicationOptions);
    displayDeduplicationResult(originalCount, allNodes.length);

    // 重命名
    allNodes = converter.rename(allNodes, MERGE_CONFIG.defaultOptions.renameOptions);
    console.log(`✅ 重命名完成`);

    // 生成统计
    const stats = converter.getStats(allNodes);
    displayMergeStats(stats);

    // 生成输出文件
    await generateOutputFiles(allNodes, outputFormats, 'merged_base64_nodes', 'base64');

    console.log(`🎉 Base64文件合并完成！合并了 ${base64Files.length} 个文件，共 ${allNodes.length} 个节点`);
  } catch (error) {
    defaultErrorHandler.handle(new FileProcessError(`Base64文件合并失败: ${error.message}`, null, { files: base64Files.length }));
  }
}

/**
 * 合并URL文件
 */
async function mergeUrlFiles(urlFiles, customDeduplicationConfig = null, outputFormats = [OutputFormats.URL]) {
  displayProcessProgress('URL文件', '合并');

  if (urlFiles.length === 0) {
    console.log('⚠️ 没有找到URL文件');
    return;
  }

  try {
    const converter = new ProxyConverter();
    let allNodes = [];

    for (const fileInfo of urlFiles) {
      console.log(`📁 处理: ${fileInfo.file}`);
      try {
        const nodes = converter.parse(fileInfo.content, OutputFormats.URL);
        console.log(`  ✅ 解析到 ${nodes.length} 个节点`);
        allNodes = allNodes.concat(nodes);
      } catch (error) {
        console.error(`  ❌ 解析失败:`, error.message);
      }
    }

    if (allNodes.length === 0) {
      console.log('⚠️ 没有解析到任何节点');
      return;
    }

    console.log(`\n🔄 处理合并的节点 (总计: ${allNodes.length})`);

    // 验证节点
    validateNodes(allNodes);

    // 去重
    const originalCount = allNodes.length;
    const deduplicationOptions = customDeduplicationConfig || MERGE_CONFIG.defaultOptions.deduplicateOptions;
    allNodes = converter.deduplicate(allNodes, deduplicationOptions);
    displayDeduplicationResult(originalCount, allNodes.length);

    // 重命名
    allNodes = converter.rename(allNodes, MERGE_CONFIG.defaultOptions.renameOptions);
    console.log(`✅ 重命名完成`);

    // 生成统计
    const stats = converter.getStats(allNodes);
    displayMergeStats(stats);

    // 生成输出文件
    await generateOutputFiles(allNodes, outputFormats, 'merged_url_nodes', 'url');

    console.log(`🎉 URL文件合并完成！合并了 ${urlFiles.length} 个文件，共 ${allNodes.length} 个节点`);
  } catch (error) {
    defaultErrorHandler.handle(new FileProcessError(`URL文件合并失败: ${error.message}`, null, { files: urlFiles.length }));
  }
}

export { mergeYamlFiles, mergeBase64Files, mergeUrlFiles, scanAndCategorizeFiles, ensureOutputDir };
