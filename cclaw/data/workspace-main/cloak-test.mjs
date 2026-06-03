import { launch } from '/www/server/nodejs/v22.22.2/lib/node_modules/cloakbrowser/dist/index.js';

const browser = await launch({ headless: true });
const page = await browser.newPage();

await page.goto('https://mp.weixin.qq.com/s/4OJIVFUTOiR5bFikvVXmRA');
console.log('URL:', page.url());
console.log('Title:', await page.title());

// take a screenshot
await page.screenshot({ path: '/opt/cclaw-client/UbuntuClaw/cclaw/data/workspace-main/cloak-screenshot.png', fullPage: true });
console.log('Screenshot saved to cloak-screenshot.png');

await browser.close();