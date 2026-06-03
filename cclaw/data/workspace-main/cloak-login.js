import { launch } from '/www/server/nodejs/v22.22.2/lib/node_modules/cloakbrowser/dist/index.js';

(async () => {
  console.log('🚀 启动 CloakBrowser...');
  const browser = await launch({ headless: false });
  const page = await browser.newPage();
  
  console.log('🌐 打开登录页面...');
  await page.goto('https://gez.dongguanbank.cn/landlord/#/house/index');
  await page.waitForTimeout(3000);
  
  console.log('📝 等待登录界面...');
  // 等待登录表单出现
  await page.waitForSelector('input[type="text"], input[placeholder*="账"], input[placeholder*="号"]', { timeout: 10000 }).catch(() => console.log('未找到账号输入框，尝试其他方式'));
  
  // 尝试找到并填写账号密码
  const inputs = await page.$$('input');
  console.log(`找到 ${inputs.length} 个输入框`);
  
  // 截取登录页面
  await page.screenshot({ path: '/opt/cclaw-client/UbuntuClaw/cclaw/data/workspace-main/login-page.png' });
  console.log('📸 已保存登录页面截图');
  
  // 尝试填充账号密码
  try {
    // 尝试多种选择器找账号输入框
    const usernameInput = await page.locator('input[placeholder*="账"], input[placeholder*="号"], input[type="text"]').first();
    await usernameInput.fill('18926879306');
    console.log('✅ 已填写账号');
    
    const passwordInput = await page.locator('input[placeholder*="密"], input[type="password"]').first();
    await passwordInput.fill('your_password_here');
    console.log('✅ 已填写密码');
    
    // 点击登录按钮
    const loginBtn = await page.locator('button[type="submit"], button:has-text("登录"), .login-btn').first();
    await loginBtn.click();
    console.log('✅ 已点击登录按钮');
  } catch (e) {
    console.log('❌ 登录填充失败:', e.message);
  }
  
  await page.waitForTimeout(3000);
  
  // 截取登录后页面
  await page.screenshot({ path: '/opt/cclaw-client/UbuntuClaw/cclaw/data/workspace-main/after-login.png' });
  console.log('📸 已保存登录后页面截图');
  
  // 尝试点击左侧"房源"菜单
  try {
    const houseMenu = await page.locator('text="房源", .menu-item:has-text("房源"), [class*="menu"]:has-text("房源")').first();
    await houseMenu.click();
    console.log('✅ 已点击房源菜单');
    await page.waitForTimeout(2000);
  } catch (e) {
    console.log('❌ 点击房源菜单失败:', e.message);
  }
  
  await page.screenshot({ path: '/opt/cclaw-client/UbuntuClaw/cclaw/data/workspace-main/house-page.png' });
  console.log('📸 已保存房源页面截图');
  
  // 获取页面内容
  const content = await page.content();
  console.log('页面HTML长度:', content.length);
  
  // 尝试查找428房间
  try {
    // 查找包含"428"的元素
    const room428 = await page.locator('text="428", [class*="room"]:has-text("428"), [class*="no"]:has-text("428")').first();
    if (room428) {
      await room428.click();
      console.log('✅ 已点击428房间');
      await page.waitForTimeout(2000);
    }
  } catch (e) {
    console.log('未直接在列表中找到428房间');
  }
  
  await page.screenshot({ path: '/opt/cclaw-client/UbuntuClaw/cclaw/data/workspace-main/room-428.png' });
  console.log('📸 已保存428房间页面截图');
  
  // 获取页面文本，查找欠费信息
  const bodyText = await page.locator('body').innerText();
  console.log('\n=== 页面文本内容 ===');
  console.log(bodyText.substring(0, 5000));
  
  // 检查是否有欠费相关字样
  if (bodyText.includes('欠费') || bodyText.includes('欠租') || bodyText.includes('未缴') || bodyText.includes('未付')) {
    console.log('\n⚠️ 发现欠费相关信息!');
  } else {
    console.log('\n✓ 页面文本中未发现明确的欠费相关字样');
  }
  
  console.log('\n✅ 任务完成!');
  await browser.close();
})();