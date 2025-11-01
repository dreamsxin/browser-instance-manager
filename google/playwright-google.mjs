import { chromium } from 'playwright';
import { setTimeout } from 'timers/promises';

// 模拟人类随机延迟
const humanDelay = async (min = 1000, max = 3000) => {
  const delay = Math.floor(Math.random() * (max - min + 1)) + min;
  await setTimeout(delay);
};

(async () => {
  const browser = await chromium.launch({
    executablePath: "E:\\soft\\ungoogled-chromium_138.0.7204.183-1.1_windows_x64\\chrome.exe",
    headless: false, // 设置为true则不显示浏览器
    slowMo: 300, // 减慢操作速度
  });

  try {
    const context = await browser.newContext({
    });

    const page = await context.newPage();
    
    // 随机输入速度模拟
    const typeWithRandomSpeed = async (selector, text) => {
      for (const char of text) {
        await page.type(selector, char, { 
          delay: Math.random() * 100
        });
      }
    };

    console.log('访问Google');
    // 访问Google
    page.goto('https://www.google.com');

    console.log('需要添加等待确保页面加载完成');
    // 需要添加等待确保页面加载完成
    await page.waitForLoadState('domcontentloaded');

    await humanDelay();

    console.log('输入搜索词');
    // 输入搜索词
    const keyword = 'Playwright自动化测试';
    //await typeWithRandomSpeed('//*[@id="APjFqb"]', keyword);
    await typeWithRandomSpeed('//form//textarea', keyword);

    await humanDelay(500, 1500);

    console.log('随机移动鼠标');
    // 随机移动鼠标
    await page.mouse.move(
      Math.random() * 800 + 200,
      Math.random() * 400 + 100
    );
    
    // // 点击搜索按钮
    // await page.click('input[name="btnK"]');
    // await page.waitForNavigation();

    console.log('按回车键搜索');
     // 按回车键搜索
    await page.keyboard.press('Enter');
    await page.waitForSelector('body');
    const content = await page.content();
    console.log(content);

    // 随机滚动页面
    await page.evaluate(async () => {
      const scrollHeight = document.body.scrollHeight;
      const scrollStep = scrollHeight / (Math.random() * 10 + 5);
      for (let i = 0; i < scrollHeight; i += scrollStep) {
        window.scrollTo(0, i);
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    });

    // 随机点击结果
    const links = await page.$$('a h3');
    if (links.length > 0) {
      const randomLink = links[Math.floor(Math.random() * links.length)];
      // 滚动到元素所在位置
      await randomLink.scrollIntoViewIfNeeded();

      await humanDelay(1000, 3000);
      await randomLink.click();
      await page.waitForSelector('body');
      await humanDelay(3000, 8000);
    }
    await humanDelay(6000, 8000);

    console.log('搜索模拟完成');
  } finally {
    await browser.close();
  }
})();