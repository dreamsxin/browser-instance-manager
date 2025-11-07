import asyncio
import aiofiles
import os
import random
from datetime import datetime
from typing import Dict, List, Optional, Set
from playwright.async_api import async_playwright, Page, Browser
import logging
from urllib.parse import urlparse


class WebScraper:
    def __init__(self, options: Dict = None):
        options = options or {}

        # 配置参数
        self.max_requests_before_restart = options.get(
            "max_requests_before_restart",
            int(os.getenv("MAX_REQUESTS_BEFORE_RESTART", 500)),
        )
        self.max_page_usage = options.get(
            "max_page_usage", int(os.getenv("MAX_PAGE_USAGE", 20))
        )
        self.initial_page_pool_size = options.get(
            "initial_page_pool_size", int(os.getenv("INITIAL_PAGE_POOL_SIZE", 5))
        )

        # 状态管理
        self.browser: Optional[Browser] = None
        self.is_initialized = False
        self.request_count = 0

        # 页面池管理
        self.page_pool: List[Dict] = []
        self.page_usage_count: Dict[Page, int] = {}
        self.page_status: Dict[Page, str] = {}  # 'available', 'in-use', 'retiring'

        # 队列管理
        self.waiting_queue: List[asyncio.Future] = []
        self.browser_restart_in_progress = False
        self.restart_event = asyncio.Event()

        self._logger = logging.getLogger(__name__)
        self._playwright = None

        self._logger.info(f"""
WebScraper initialized with:
  - max_requests_before_restart: {self.max_requests_before_restart}
  - max_page_usage: {self.max_page_usage}
  - initial_page_pool_size: {self.initial_page_pool_size}
        """)

    async def initialize(self):
        """初始化浏览器和页面池"""
        if self.is_initialized:
            return

        try:
            self._playwright = await async_playwright().start()
            self.browser = await self._playwright.chromium.launch(
                executable_path="E:\\soft\\ungoogled-chromium_138.0.7204.183-1.1_windows_x64\\chrome.exe",
                headless=os.getenv("HEADLESS", "false").lower() == "true",
                args=[
                    "--no-sandbox",
                    "--disable-setuid-sandbox",
                    "--disable-dev-shm-usage",
                    "--disable-accelerated-2d-canvas",
                    "--no-first-run",
                    "--no-zygote",
                    "--disable-gpu",
                ],
            )

            # 初始化页面池
            await self._initialize_page_pool()
            self.is_initialized = True
            self._logger.info("Playwright browser initialized with page pool")

        except Exception as e:
            self._logger.error(f"Failed to initialize browser: {e}")
            raise

    async def _initialize_page_pool(self):
        """初始化页面池"""
        tasks = []
        for i in range(self.initial_page_pool_size):
            tasks.append(self._create_page_with_proxy())

        pages = await asyncio.gather(*tasks, return_exceptions=True)

        for page in pages:
            if isinstance(page, Exception) or page is None:
                continue

            page_obj = {
                "page": page,
                "last_used": datetime.now(),
                "id": f"page-{datetime.now().timestamp()}-{random.randint(10000, 99999)}",
            }
            self.page_pool.append(page_obj)
            self.page_usage_count[page] = 0
            self.page_status[page] = "available"

        self._logger.info(
            f"Page pool initialized with {len(self.page_pool)} pages "
            f"(target: {self.initial_page_pool_size})"
        )

    async def _create_page_with_proxy(self) -> Optional[Page]:
        """创建带代理的页面"""
        context = None
        try:
            # 代理配置（简化版，实际使用时需要配置代理列表）
            proxy_urls = os.getenv(
                "PROXY_LIST",
                '["http://tVr7SpSb6L:7Ghj4j9an6@38.207.101.182:5206"]',
            )
            proxy_list = eval(proxy_urls) if proxy_urls else []

            context_options = {"viewport": None, "ignore_https_errors": True}

            if proxy_list:
                proxy_url = random.choice(proxy_list)
                parsed = urlparse(proxy_url)
                context_options["proxy"] = {
                    "server": f"http://{parsed.hostname}:{parsed.port}",
                    "username": parsed.username,
                    "password": parsed.password,
                }
            context = await self.browser.new_context(**context_options)
            page = await context.new_page()

            # 设置路由拦截
            await self._setup_page_route(page)

            # 初始化页面
            await page.goto(
                url="https://www.google.com",
                wait_until="domcontentloaded",
                timeout=5000,
            )

            return page

        except Exception as e:
            self._logger.error(f"Failed to create page with proxy: {e}")
            if context:
                await context.close()
            return None

    async def _setup_page_route(self, page: Page):
        """设置页面路由拦截"""

        async def route_handler(route):
            url = route.request.url

            # 拦截不必要的资源
            resource_type = route.request.resource_type
            if resource_type in ["image", "font", "media"]:
                await route.abort()
                return

            # 拦截特定域名
            blocked_domains = ["gstatic.com", "google.com/log", "google.com/async"]
            if any(domain in url for domain in blocked_domains):
                await route.abort()
                return

            await route.continue_()

        await page.route("**/*", route_handler)

    async def get_available_page(self):
        """获取可用页面"""
        if self.browser_restart_in_progress:
            self._logger.info("Browser restart in progress, waiting...")
            future = asyncio.Future()
            self.waiting_queue.append(future)
            return await future

        # 清理过度使用的页面
        await self._cleanup_overused_pages()

        # 查找可用页面
        for page_obj in self.page_pool:
            if self.page_status[page_obj["page"]] == "available":
                self.page_status[page_obj["page"]] = "in-use"
                page_obj["last_used"] = datetime.now()
                return page_obj

        # 没有可用页面，等待
        self._logger.info("No available pages, waiting...")
        future = asyncio.Future()
        self.waiting_queue.append(future)
        return await future

    def release_page(self, page_obj: Dict):
        """释放页面回池中"""
        page = page_obj["page"]
        usage_count = self.page_usage_count.get(page, 0)

        if usage_count >= self.max_page_usage:
            # 标记为待退休
            self.page_status[page] = "retiring"
            self._logger.info(f"Page marked for retirement (used {usage_count} times)")
        else:
            # 重置为可用状态
            self.page_status[page] = "available"
            page_obj["last_used"] = datetime.now()

            # 检查等待队列
            if self.waiting_queue:
                future = self.waiting_queue.pop(0)
                if not future.done():
                    future.set_result(page_obj)

    async def _cleanup_overused_pages(self):
        """清理过度使用的页面"""
        # 清理退休页面
        for i in range(len(self.page_pool) - 1, -1, -1):
            page_obj = self.page_pool[i]
            if self.page_status[page_obj["page"]] == "retiring":
                self._logger.info("Closing retired page")
                await page_obj["page"].close()
                page = page_obj["page"]
                self.page_usage_count.pop(page, None)
                self.page_status.pop(page, None)
                self.page_pool.pop(i)

        # 补充新页面
        min_pool_size = self.initial_page_pool_size // 2
        if len(self.page_pool) < min_pool_size and not self.browser_restart_in_progress:
            new_page = await self._create_page_with_proxy()
            if new_page:
                new_page_obj = {
                    "page": new_page,
                    "last_used": datetime.now(),
                    "id": f"page-{datetime.now().timestamp()}-{random.randint(10000, 99999)}",
                }
                self.page_pool.append(new_page_obj)
                self.page_usage_count[new_page] = 0
                self.page_status[new_page] = "available"
                self._logger.info("Added new page to pool")

                # 分配给等待的请求
                if self.waiting_queue:
                    future = self.waiting_queue.pop(0)
                    if not future.done():
                        future.set_result(new_page_obj)

    async def scrape_page(self, word: str, options: Dict = None) -> Dict:
        """抓取页面"""
        options = options or {}
        start_time = datetime.now().timestamp()

        # 处理浏览器重启
        if self.browser_restart_in_progress:
            self._logger.info(f"Waiting for browser restart for: {word}")
            await self.restart_event.wait()

        # 检查是否需要重启
        await self._check_and_restart_browser()

        timeout = options.get("timeout", 2000)
        wait_until = options.get("wait_until", "commit")

        page_obj = None

        try:
            # 获取页面
            page_obj = await self.get_available_page()
            page = page_obj["page"]

            # 更新使用计数
            current_usage = self.page_usage_count.get(page, 0)
            self.page_usage_count[page] = current_usage + 1

            self._logger.info(
                f"Using page (used {current_usage + 1}/{self.max_page_usage} times) for: {word}"
            )

            # 执行搜索
            search_box_selector = 'textarea[name="q"], input[name="q"]'

            try:
                await page.wait_for_selector(search_box_selector, timeout=3000)
                await page.fill(search_box_selector, word)
                await page.keyboard.press("Enter")
            except Exception:
                # 重新加载Google主页
                self._logger.info("Search failed, reloading Google homepage...")
                await page.goto(
                    "https://www.google.com",
                    {"wait_until": "domcontentloaded", "timeout": timeout},
                )
                await page.wait_for_selector(search_box_selector, timeout=timeout)
                await page.fill(search_box_selector, word)
                await page.keyboard.press("Enter")

            # 等待搜索结果
            await page.wait_for_url("**/search*", timeout=timeout)
            await page.wait_for_selector("#search", timeout=timeout, state="attached")
            await asyncio.sleep(0.05)

            # 获取页面内容
            content = await page.content()

            # 保存内容到文件
            output_dir = "scraped-content"
            os.makedirs(output_dir, exist_ok=True)

            async with aiofiles.open(
                f"{output_dir}/{word}.html", "a", encoding="utf-8"
            ) as f:
                await f.write(content + "\r\n")

            # 获取页面信息
            title = await page.title()
            final_url = page.url
            response_time = int((datetime.now().timestamp() - start_time) * 1000)

            success = len(content) > 10000

            return {
                "success": success,
                "word": word,
                "url": final_url,
                "title": title,
                "content": content,
                "response_time": response_time,
                "timestamp": datetime.now().isoformat(),
            }

        except Exception as e:
            self._logger.error(f"Scraping failed for {word}: {e}")
            return {
                "success": False,
                "word": word,
                "url": "",
                "error": str(e),
                "response_time": 0,
                "timestamp": datetime.now().isoformat(),
            }
        finally:
            # 释放页面
            if page_obj:
                self.release_page(page_obj)

    async def _check_and_restart_browser(self):
        """检查并重启浏览器"""
        self.request_count += 1
        self._logger.info(
            f"Request count: {self.request_count}/{self.max_requests_before_restart}"
        )

        if (
            self.request_count >= self.max_requests_before_restart
            and not self.browser_restart_in_progress
        ):
            self._logger.info(
                f"Reached {self.max_requests_before_restart} requests, "
                "queuing browser restart..."
            )
            asyncio.create_task(self.restart_browser())

    async def restart_browser(self):
        """重启浏览器"""
        if self.browser_restart_in_progress:
            self._logger.info("Browser restart already in progress, waiting...")
            return

        self.browser_restart_in_progress = True
        self.restart_event.clear()

        try:
            self._logger.info("Waiting for all pages to complete...")
            await self._wait_for_all_pages_to_complete()

            self._logger.info("Restarting browser...")

            # 关闭所有页面
            for page_obj in self.page_pool:
                await page_obj["page"].close()

            self.page_pool.clear()
            self.page_usage_count.clear()
            self.page_status.clear()

            # 关闭浏览器
            await self.browser.close()
            if self._playwright:
                await self._playwright.stop()

            # 重新初始化
            await self.initialize()

            self.request_count = 0
            self._logger.info("Browser restarted successfully")

        except Exception as e:
            self._logger.error(f"Browser restart failed: {e}")
        finally:
            self.browser_restart_in_progress = False
            self.restart_event.set()

    async def _wait_for_all_pages_to_complete(self, timeout_ms: int = 30000):
        """等待所有页面完成任务"""
        start_time = datetime.now().timestamp()

        while (datetime.now().timestamp() - start_time) * 1000 < timeout_ms:
            in_use_pages = [
                p for p in self.page_pool if self.page_status[p["page"]] == "in-use"
            ]

            if not in_use_pages:
                self._logger.info("All pages have completed their tasks")
                return True

            self._logger.info(f"Waiting for {len(in_use_pages)} pages to complete...")
            await asyncio.sleep(1)

        self._logger.warning("Timeout reached while waiting for pages to complete")
        return False

    async def close(self):
        """关闭资源"""
        # 清空等待队列
        for future in self.waiting_queue:
            if not future.done():
                future.set_exception(Exception("Scraper is closing"))
        self.waiting_queue.clear()

        # 关闭所有页面
        for page_obj in self.page_pool:
            await page_obj["page"].close()

        self.page_pool.clear()
        self.page_usage_count.clear()
        self.page_status.clear()

        # 关闭浏览器
        if self.browser:
            await self.browser.close()
        if self._playwright:
            await self._playwright.stop()

        self.is_initialized = False
        self._logger.info("Browser closed")

    def get_status(self) -> Dict:
        """获取状态信息"""
        available = len(
            [p for p in self.page_pool if self.page_status[p["page"]] == "available"]
        )
        in_use = len(
            [p for p in self.page_pool if self.page_status[p["page"]] == "in-use"]
        )

        return {
            "total_pages": len(self.page_pool),
            "available": available,
            "in_use": in_use,
            "waiting_queue": len(self.waiting_queue),
            "request_count": self.request_count,
            "max_requests_before_restart": self.max_requests_before_restart,
            "max_page_usage": self.max_page_usage,
            "initial_page_pool_size": self.initial_page_pool_size,
            "browser_restart_in_progress": self.browser_restart_in_progress,
        }
