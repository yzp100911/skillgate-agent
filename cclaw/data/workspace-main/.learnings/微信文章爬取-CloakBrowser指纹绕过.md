# 微信文章爬取 - CloakBrowser 指纹绕过

## 2026-05-09

### 问题背景

微信公众平台（mp.weixin.qq.com）有严格的风控系统，会检测 headless Chrome 浏览器并弹验证码。

### 测试结论

| 方案 | 结果 | 说明 |
|------|------|------|
| 普通 playwright-cli | ❌ 被拦截 | 显示"环境异常"，需要验证 |
| OpenClaw 内置浏览器 | ❌ 被拦截 | 同上 |
| CloakBrowser | ✅ 成功 | 绕过检测，内容完整 |

### CloakBrowser 使用方法

#### 方法一：Python 直接调用（推荐）

```python
from cloakbrowser import launch

browser = launch(headless=True)
page = browser.new_page()
page.goto('https://mp.weixin.qq.com/s/xxx')
page.wait_for_timeout(3000)

# 获取纯文本
text = page.inner_text('body')

# 获取完整 HTML
html = page.content()

browser.close()
```

#### 方法二：指定 executable_path

```python
from playwright.sync_api import sync_playwright

cloak_chrome = '/root/.cloakbrowser/chromium-146.0.7680.177.3/chrome'

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=cloak_chrome, headless=True)
    page = browser.new_page()
    page.goto('https://...')
    # ...
```

#### 方法三：命令行 cloakbrowser

先通过 Python 调用，因为 cloakbrowser CLI 工具只是管理二进制下载，不提供浏览器操控能力。

### CloakBrowser 简介

- **包名**: cloakbrowser
- **版本**: 0.3.27
- **功能**: Stealth Chromium that passes every bot detection test. Drop-in Playwright replacement with source-level fingerprint patches.
- **作者**: Cloakhq
- **安装**: `pip install cloakbrowser`
- **二进制**: `/root/.cloakbrowser/chromium-146.0.7680.177.3/chrome`
- **版本**: Chromium 146.0.7680.177

### 指纹修复原理

CloakBrowser 从源码级别修复了以下指纹问题：
- `navigator.webdriver = true`
- 浏览器特征值（User-Agent、Chrome 版本等）
- Canvas/WebGL 指纹
- 字体指纹
- TLS 特征

### 适用场景

- 微信公众平台文章爬取 ✅
- 其他高度敏感的风控网站
- 需要模拟真实用户浏览器的场景

### 备选方案（未测试）

如果 CloakBrowser 失效，可以尝试：
1. `profile="user"` 使用真实用户浏览器
2. 手动保持登录态的 session
3. 微信开放平台 API（需申请资质）