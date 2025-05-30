/**
 * 节点重命名工具
 */

import { RegionMap } from '../types.js';

/**
 * 重命名选项
 * @typedef {Object} RenameOptions
 * @property {string} template - 命名模板
 * @property {boolean} autoDetectRegion - 是否自动检测地区
 * @property {Object} customRegionMap - 自定义地区映射
 * @property {boolean} groupByRegion - 是否按地区分组编号
 * @property {number} startIndex - 起始编号
 * @property {number} padLength - 编号补零长度
 */

/**
 * 默认命名模板：国旗Emoji 地区中文名 三位数序号
 */
const DEFAULT_TEMPLATE = '{flag}{region}{index:3}';

/**
 * 重命名节点数组
 * @param {Object[]} nodes - 节点数组
 * @param {RenameOptions} options - 重命名选项
 * @returns {Object[]} 重命名后的节点数组
 */
export function renameNodes(nodes, options = {}) {
  if (!nodes || !Array.isArray(nodes) || nodes.length === 0) {
    return [];
  }

  const {
    template = DEFAULT_TEMPLATE,
    autoDetectRegion = true,
    customRegionMap = {},
    groupByRegion = true,
    startIndex = 1,
    padLength = 3
  } = options;

  // 合并地区映射
  const regionMap = { ...RegionMap, ...customRegionMap };

  // 为每个节点检测地区
  const nodesWithRegion = nodes.map(node => ({
    ...node,
    detectedRegion: autoDetectRegion ? detectRegion(node.name, node.server) : 'OTHER'
  }));

  // 按地区分组或统一编号
  let renamedNodes;
  if (groupByRegion) {
    renamedNodes = renameByRegionGroups(nodesWithRegion, template, regionMap, startIndex, padLength);
  } else {
    renamedNodes = renameSequentially(nodesWithRegion, template, regionMap, startIndex, padLength);
  }

  return renamedNodes;
}

/**
 * 按地区分组重命名
 * @param {Object[]} nodes - 带地区信息的节点数组
 * @param {string} template - 命名模板
 * @param {Object} regionMap - 地区映射
 * @param {number} startIndex - 起始编号
 * @param {number} padLength - 编号补零长度
 * @returns {Object[]} 重命名后的节点数组
 */
function renameByRegionGroups(nodes, template, regionMap, startIndex, padLength) {
  // 按地区分组
  const regionGroups = new Map();
  
  for (const node of nodes) {
    const region = node.detectedRegion;
    if (!regionGroups.has(region)) {
      regionGroups.set(region, []);
    }
    regionGroups.get(region).push(node);
  }

  const renamedNodes = [];

  // 对每个地区分别编号
  for (const [region, regionNodes] of regionGroups.entries()) {
    const regionInfo = regionMap[region] || regionMap.OTHER;
    
    regionNodes.forEach((node, index) => {
      const newName = generateNodeName(template, {
        flag: regionInfo.flag,
        region: regionInfo.name,
        index: startIndex + index,
        padLength,
        originalName: node.name,
        server: node.server,
        port: node.port,
        type: node.type
      });

      renamedNodes.push({
        ...node,
        name: newName,
        originalName: node.name
      });
    });
  }

  return renamedNodes;
}

/**
 * 顺序重命名
 * @param {Object[]} nodes - 带地区信息的节点数组
 * @param {string} template - 命名模板
 * @param {Object} regionMap - 地区映射
 * @param {number} startIndex - 起始编号
 * @param {number} padLength - 编号补零长度
 * @returns {Object[]} 重命名后的节点数组
 */
function renameSequentially(nodes, template, regionMap, startIndex, padLength) {
  return nodes.map((node, index) => {
    const regionInfo = regionMap[node.detectedRegion] || regionMap.OTHER;
    
    const newName = generateNodeName(template, {
      flag: regionInfo.flag,
      region: regionInfo.name,
      index: startIndex + index,
      padLength,
      originalName: node.name,
      server: node.server,
      port: node.port,
      type: node.type
    });

    return {
      ...node,
      name: newName,
      originalName: node.name
    };
  });
}

/**
 * 生成节点名称
 * @param {string} template - 命名模板
 * @param {Object} variables - 变量对象
 * @returns {string} 生成的名称
 */
function generateNodeName(template, variables) {
  let name = template;

  // 替换变量
  name = name.replace(/\{flag\}/g, variables.flag || '🌐');
  name = name.replace(/\{region\}/g, variables.region || '其他');
  name = name.replace(/\{originalName\}/g, variables.originalName || '');
  name = name.replace(/\{server\}/g, variables.server || '');
  name = name.replace(/\{port\}/g, variables.port || '');
  name = name.replace(/\{type\}/g, variables.type || '');

  // 处理带格式的索引 {index:3} -> 001, 002, 003...
  name = name.replace(/\{index:(\d+)\}/g, (match, padLength) => {
    return String(variables.index).padStart(parseInt(padLength), '0');
  });

  // 处理普通索引 {index} -> 1, 2, 3...
  name = name.replace(/\{index\}/g, String(variables.index));

  return name.trim();
}

/**
 * 从节点名称或服务器地址检测地区
 * @param {string} name - 节点名称
 * @param {string} server - 服务器地址
 * @returns {string} 地区代码
 */
export function detectRegion(name = '', server = '') {
  const text = `${name} ${server}`.toLowerCase();

  // 地区检测规则
  const regionPatterns = {
    'HK': [
      /香港|hk|hong\s*kong|hongkong/i,
      /\.hk$/i,
      /hk\d+/i
    ],
    'TW': [
      /台湾|tw|taiwan|台北|高雄/i,
      /\.tw$/i,
      /tw\d+/i
    ],
    'SG': [
      /新加坡|sg|singapore|狮城/i,
      /\.sg$/i,
      /sg\d+/i
    ],
    'JP': [
      /日本|jp|japan|东京|大阪|名古屋/i,
      /\.jp$/i,
      /jp\d+/i,
      /tokyo|osaka|nagoya/i
    ],
    'KR': [
      /韩国|kr|korea|首尔|釜山/i,
      /\.kr$/i,
      /kr\d+/i,
      /seoul|busan/i
    ],
    'US': [
      /美国|us|usa|united\s*states|america|洛杉矶|纽约|芝加哥|西雅图/i,
      /\.us$/i,
      /us\d+/i,
      /los\s*angeles|new\s*york|chicago|seattle|miami|dallas/i
    ],
    'UK': [
      /英国|uk|united\s*kingdom|britain|伦敦/i,
      /\.uk$/i,
      /uk\d+/i,
      /london|manchester/i
    ],
    'DE': [
      /德国|de|germany|柏林|法兰克福/i,
      /\.de$/i,
      /de\d+/i,
      /berlin|frankfurt|munich/i
    ],
    'FR': [
      /法国|fr|france|巴黎/i,
      /\.fr$/i,
      /fr\d+/i,
      /paris|marseille/i
    ],
    'CA': [
      /加拿大|ca|canada|多伦多|温哥华/i,
      /\.ca$/i,
      /ca\d+/i,
      /toronto|vancouver|montreal/i
    ],
    'AU': [
      /澳大利亚|澳洲|au|australia|悉尼|墨尔本/i,
      /\.au$/i,
      /au\d+/i,
      /sydney|melbourne|brisbane/i
    ],
    'RU': [
      /俄罗斯|ru|russia|莫斯科|圣彼得堡/i,
      /\.ru$/i,
      /ru\d+/i,
      /moscow|petersburg/i
    ],
    'IN': [
      /印度|in|india|孟买|新德里/i,
      /\.in$/i,
      /in\d+/i,
      /mumbai|delhi|bangalore/i
    ],
    'BR': [
      /巴西|br|brazil|圣保罗|里约/i,
      /\.br$/i,
      /br\d+/i,
      /sao\s*paulo|rio/i
    ],
    'NL': [
      /荷兰|nl|netherlands|阿姆斯特丹/i,
      /\.nl$/i,
      /nl\d+/i,
      /amsterdam/i
    ],
    'TR': [
      /土耳其|tr|turkey|伊斯坦布尔/i,
      /\.tr$/i,
      /tr\d+/i,
      /istanbul/i
    ],
    'TH': [
      /泰国|th|thailand|曼谷/i,
      /\.th$/i,
      /th\d+/i,
      /bangkok/i
    ],
    'MY': [
      /马来西亚|my|malaysia|吉隆坡/i,
      /\.my$/i,
      /my\d+/i,
      /kuala\s*lumpur/i
    ],
    'PH': [
      /菲律宾|ph|philippines|马尼拉/i,
      /\.ph$/i,
      /ph\d+/i,
      /manila/i
    ],
    'VN': [
      /越南|vn|vietnam|胡志明|河内/i,
      /\.vn$/i,
      /vn\d+/i,
      /ho\s*chi\s*minh|hanoi/i
    ],
    'ID': [
      /印尼|印度尼西亚|id|indonesia|雅加达/i,
      /\.id$/i,
      /id\d+/i,
      /jakarta/i
    ],
    'AR': [
      /阿根廷|ar|argentina|布宜诺斯艾利斯/i,
      /\.ar$/i,
      /ar\d+/i,
      /buenos\s*aires/i
    ],
    'CL': [
      /智利|cl|chile|圣地亚哥/i,
      /\.cl$/i,
      /cl\d+/i,
      /santiago/i
    ],
    'MX': [
      /墨西哥|mx|mexico|墨西哥城/i,
      /\.mx$/i,
      /mx\d+/i,
      /mexico\s*city/i
    ],
    'ZA': [
      /南非|za|south\s*africa|开普敦|约翰内斯堡/i,
      /\.za$/i,
      /za\d+/i,
      /cape\s*town|johannesburg/i
    ],
    'EG': [
      /埃及|eg|egypt|开罗/i,
      /\.eg$/i,
      /eg\d+/i,
      /cairo/i
    ],
    'AE': [
      /阿联酋|ae|uae|迪拜|阿布扎比/i,
      /\.ae$/i,
      /ae\d+/i,
      /dubai|abu\s*dhabi/i
    ],
    'SA': [
      /沙特|sa|saudi|利雅得/i,
      /\.sa$/i,
      /sa\d+/i,
      /riyadh/i
    ],
    'IL': [
      /以色列|il|israel|特拉维夫/i,
      /\.il$/i,
      /il\d+/i,
      /tel\s*aviv/i
    ],
    'CN': [
      /中国|cn|china|北京|上海|广州|深圳/i,
      /\.cn$/i,
      /cn\d+/i,
      /beijing|shanghai|guangzhou|shenzhen/i
    ]
  };

  // 按优先级检测地区
  for (const [region, patterns] of Object.entries(regionPatterns)) {
    for (const pattern of patterns) {
      if (pattern.test(text)) {
        return region;
      }
    }
  }

  return 'OTHER';
}

/**
 * 批量重命名（支持不同地区使用不同模板）
 * @param {Object[]} nodes - 节点数组
 * @param {Object} regionTemplates - 地区模板映射
 * @param {RenameOptions} options - 重命名选项
 * @returns {Object[]} 重命名后的节点数组
 */
export function batchRename(nodes, regionTemplates, options = {}) {
  if (!nodes || !Array.isArray(nodes) || nodes.length === 0) {
    return [];
  }

  const {
    autoDetectRegion = true,
    customRegionMap = {},
    startIndex = 1,
    padLength = 3
  } = options;

  const regionMap = { ...RegionMap, ...customRegionMap };

  // 按地区分组
  const regionGroups = new Map();
  
  for (const node of nodes) {
    const region = autoDetectRegion ? detectRegion(node.name, node.server) : 'OTHER';
    if (!regionGroups.has(region)) {
      regionGroups.set(region, []);
    }
    regionGroups.get(region).push(node);
  }

  const renamedNodes = [];

  // 对每个地区使用对应的模板
  for (const [region, regionNodes] of regionGroups.entries()) {
    const template = regionTemplates[region] || regionTemplates.default || DEFAULT_TEMPLATE;
    const regionInfo = regionMap[region] || regionMap.OTHER;
    
    regionNodes.forEach((node, index) => {
      const newName = generateNodeName(template, {
        flag: regionInfo.flag,
        region: regionInfo.name,
        index: startIndex + index,
        padLength,
        originalName: node.name,
        server: node.server,
        port: node.port,
        type: node.type
      });

      renamedNodes.push({
        ...node,
        name: newName,
        originalName: node.name,
        detectedRegion: region
      });
    });
  }

  return renamedNodes;
}

/**
 * 恢复原始名称
 * @param {Object[]} nodes - 重命名后的节点数组
 * @returns {Object[]} 恢复原始名称的节点数组
 */
export function restoreOriginalNames(nodes) {
  return nodes.map(node => ({
    ...node,
    name: node.originalName || node.name
  }));
}

/**
 * 获取重命名统计信息
 * @param {Object[]} originalNodes - 原始节点数组
 * @param {Object[]} renamedNodes - 重命名后的节点数组
 * @returns {Object} 统计信息
 */
export function getRenameStats(originalNodes, renamedNodes) {
  const regionStats = new Map();
  
  for (const node of renamedNodes) {
    const region = node.detectedRegion || 'OTHER';
    regionStats.set(region, (regionStats.get(region) || 0) + 1);
  }

  return {
    total: renamedNodes.length,
    regions: Object.fromEntries(regionStats),
    regionCount: regionStats.size
  };
}
