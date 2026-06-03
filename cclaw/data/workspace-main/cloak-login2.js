import { launch } from '/www/server/nodejs/v22.22.2/lib/node_modules/cloakbrowser/dist/index.js';

(async () => {
  console.log('🚀 启动 CloakBrowser (headless模式)...');
  const browser = await launch({ headless: true });
  const page = await browser.newPage();
  
  console.log('🌐 打开登录页面...');
  await page.goto('https://gez.dongguanbank.cn/landlord/#/house/index');
  await page.waitForTimeout(3000);
  
  console.log('📸 已保存登录页面截图');
  
  // 先检查并关闭隐私弹窗
  try {
    const disagreeBtn = await page.locator('text="不同意"').first();
    if (await disagreeBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      console.log('🔍 发现隐私协议弹窗，点击"同意并授权"...');
      const agreeBtn = await page.locator('text="同意并授权"').first();
      await agreeBtn.click();
      console.log('✅ 已同意隐私协议');
      await page.waitForTimeout(1000);
    }
  } catch (e) {
    console.log('隐私弹窗处理:', e.message);
  }
  
  // 填写账号密码
  try {
    await page.locator('input[placeholder*="手机"]').fill('18926879306');
    console.log('✅ 已填写账号');
    
    await page.locator('input[placeholder*="密码"]').fill('100911yzpYZP');
    console.log('✅ 已填写密码');
    
    await page.waitForTimeout(500);
    
    // 点击登录按钮
    await page.locator('button.login-button, button[type="button"]:has-text("登录")').first().click();
    console.log('✅ 已点击登录按钮');
  } catch (e) {
    console.log('❌ 登录填充失败:', e.message);
  }
  
  // 等待登录跳转
  await page.waitForTimeout(5000);
  
  await page.screenshot({ path: '/opt/cclaw-client/UbuntuClaw/cclaw/data/workspace-main/after-login.png' });
  console.log('📸 已保存登录后页面截图');
  
  const bodyTextAfter = await page.locator('body').innerText().catch(() => '');
  console.log('\n=== 登录后页面内容 ===');
  console.log(bodyTextAfter.substring(0, 5000));
  
  // 点击左侧"房源"菜单
  try {
    await page.locator('text="房源"').first().click();
    console.log('✅ 已点击房源菜单');
    await page.waitForTimeout(3000);
  } catch (e) {
    console.log('❌ 点击房源菜单失败:', e.message);
  }
  
  await page.screenshot({ path: '/opt/cclaw-client/UbuntuClaw/cclaw/data/workspace-main/house-page.png' });
  console.log('📸 已保存房源页面截图');
  
  // 获取房源页面内容
  const houseText = await page.locator('body').innerText().catch(() => '');
  console.log('\n=== 房源页面内容 ===');
  console.log(houseText.substring(0, 8000));
  
  // 查找428房间
  if (houseText.includes('428')) {
    console.log('\n✅ 找到428房间!');
    
    // 点击进入428详情
    try {
      // 查找包含428的元素并点击
      const room428Link = await page.locator('text="428房"').first();
      if (await room428Link.isVisible({ timeout: 2000 }).catch(() => false)) {
        await room428Link.click();
        console.log('✅ 已点击428房间链接');
        await page.waitForTimeout(3000);
        await page.screenshot({ path: '/opt/cclaw-client/UbuntuClaw/cclaw/data/workspace-main/room-428-detail.png' });
      } else {
        // 尝试点击包含428的单元格
        const room428Cell = await page.locator('text="428"').first();
        await room428Cell.click();
        console.log('✅ 已点击428单元格');
        await page.waitForTimeout(3000);
        await page.screenshot({ path: '/opt/cclaw-client/UbuntuClaw/cclaw/data/workspace-main/room-428-detail.png' });
      }
    } catch (e) {
      console.log('❌ 点击428房间失败:', e.message);
    }
    
    // 获取428详情页内容
    const detailText = await page.locator('body').innerText().catch(() => '');
    console.log('\n=== 428房间详情 ===');
    console.log(detailText.substring(0, 10000));
    
    // 检查欠费信息
    if (detailText.includes('欠费') || detailText.includes('欠租') || detailText.includes('欠缴') || detailText.includes('未缴')) {
      console.log('\n⚠️ 发现欠费相关信息!');
      // 提取欠费相关行
      const lines = detailText.split('\n');
      for (const line of lines) {
        if (line.includes('欠费') || line.includes('欠租') || line.includes('欠缴') || line.includes('未缴')) {
          console.log('欠费行:', line);
        }
      }
    } else {
      console.log('\n✓ 未发现欠费相关字样');
    }
  } else {
    console.log('\n❌ 未在页面中找到428');
  }
  
  await page.screenshot({ path: '/opt/cclaw-client/UbuntuClaw/cclaw/data/workspace-main/final-page.png' });
  
  console.log('\n✅ 任务完成!');
  await browser.close();
})();