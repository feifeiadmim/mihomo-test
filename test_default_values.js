/**
 * 测试默认值功能
 * 验证菜单选项的默认值设置是否正常工作
 */

import readline from 'readline';

// 创建readline接口
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

/**
 * 获取用户输入（支持默认值）
 * @param {string} prompt - 提示信息
 * @param {string} defaultValue - 默认值
 * @returns {Promise<string>} 用户输入或默认值
 */
function getUserInput(prompt, defaultValue = '') {
  return new Promise((resolve) => {
    const fullPrompt = defaultValue ? 
      `${prompt} [默认: ${defaultValue}]: ` : 
      `${prompt}: `;
    
    rl.question(fullPrompt, (answer) => {
      const input = answer.trim();
      resolve(input || defaultValue);
    });
  });
}

/**
 * 测试默认值功能
 */
async function testDefaultValues() {
  console.log('🧪 测试默认值功能');
  console.log('=' .repeat(50));
  console.log('');
  
  console.log('📋 测试说明:');
  console.log('  - 直接按回车键将使用默认值');
  console.log('  - 输入其他值将覆盖默认值');
  console.log('  - 输入 "quit" 退出测试');
  console.log('');

  // 测试1: 主菜单选择
  console.log('🔸 测试1: 主菜单选择 (默认: 1)');
  const menuChoice = await getUserInput('请选择菜单选项 (0-6)', '1');
  console.log(`✅ 您选择了: ${menuChoice}`);
  console.log('');

  if (menuChoice.toLowerCase() === 'quit') {
    console.log('👋 测试结束');
    rl.close();
    return;
  }

  // 测试2: 输出格式选择
  console.log('🔸 测试2: 输出格式选择 (默认: 1 - Clash YAML)');
  const formatChoice = await getUserInput('请选择输出格式 (1-5)', '1');
  console.log(`✅ 您选择了: ${formatChoice}`);
  console.log('');

  if (formatChoice.toLowerCase() === 'quit') {
    console.log('👋 测试结束');
    rl.close();
    return;
  }

  // 测试3: 确认操作
  console.log('🔸 测试3: 确认操作 (默认: y - 是)');
  const confirmChoice = await getUserInput('确认执行操作? (Y/n)', 'y');
  console.log(`✅ 您选择了: ${confirmChoice}`);
  console.log('');

  if (confirmChoice.toLowerCase() === 'quit') {
    console.log('👋 测试结束');
    rl.close();
    return;
  }

  // 测试4: 自定义输入
  console.log('🔸 测试4: 自定义输入 (默认: example.txt)');
  const customInput = await getUserInput('请输入文件名', 'example.txt');
  console.log(`✅ 您输入了: ${customInput}`);
  console.log('');

  if (customInput.toLowerCase() === 'quit') {
    console.log('👋 测试结束');
    rl.close();
    return;
  }

  // 测试5: 数字输入
  console.log('🔸 测试5: 数字输入 (默认: 100)');
  const numberInput = await getUserInput('请输入数字', '100');
  console.log(`✅ 您输入了: ${numberInput}`);
  console.log('');

  // 测试结果总结
  console.log('📊 测试结果总结:');
  console.log('=' .repeat(30));
  console.log(`主菜单选择: ${menuChoice}`);
  console.log(`输出格式: ${formatChoice}`);
  console.log(`确认操作: ${confirmChoice}`);
  console.log(`自定义输入: ${customInput}`);
  console.log(`数字输入: ${numberInput}`);
  console.log('');

  // 验证默认值是否正确应用
  const results = [];
  
  if (menuChoice === '1') {
    results.push('✅ 主菜单默认值正确');
  } else {
    results.push(`🔸 主菜单使用自定义值: ${menuChoice}`);
  }

  if (formatChoice === '1') {
    results.push('✅ 输出格式默认值正确');
  } else {
    results.push(`🔸 输出格式使用自定义值: ${formatChoice}`);
  }

  if (confirmChoice.toLowerCase() === 'y' || confirmChoice.toLowerCase() === 'yes') {
    results.push('✅ 确认操作默认值正确');
  } else {
    results.push(`🔸 确认操作使用自定义值: ${confirmChoice}`);
  }

  if (customInput === 'example.txt') {
    results.push('✅ 自定义输入默认值正确');
  } else {
    results.push(`🔸 自定义输入使用自定义值: ${customInput}`);
  }

  if (numberInput === '100') {
    results.push('✅ 数字输入默认值正确');
  } else {
    results.push(`🔸 数字输入使用自定义值: ${numberInput}`);
  }

  console.log('🎯 验证结果:');
  results.forEach(result => console.log(`  ${result}`));
  console.log('');

  console.log('🎉 默认值功能测试完成！');
  console.log('');
  console.log('💡 使用说明:');
  console.log('  - 在实际使用中，直接按回车键即可使用默认值');
  console.log('  - 默认值已设置为最常用的选项');
  console.log('  - 主菜单默认选择: 1 (处理所有文件)');
  console.log('  - 输出格式默认选择: 1 (Clash YAML)');
  console.log('  - 确认操作默认选择: y (是)');
  console.log('');

  rl.close();
}

// 启动测试
console.log('🚀 启动默认值功能测试...\n');
testDefaultValues().catch(error => {
  console.error('❌ 测试失败:', error);
  rl.close();
  process.exit(1);
});
