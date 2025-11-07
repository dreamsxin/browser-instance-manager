from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import List, Optional
import uvicorn
import os
import asyncio
from scraper import WebScraper
from concurrency_controller import ConcurrencyController
import logging

# 请求模型
class ScrapeRequest(BaseModel):
    word: str
    timeout: Optional[int] = 30000
    wait_until: Optional[str] = "domcontentloaded"

class BatchScrapeRequest(BaseModel):
    words: List[str]
    timeout: Optional[int] = 30000
    wait_until: Optional[str] = "domcontentloaded"

class ConcurrencyConfig(BaseModel):
    max_concurrent: int

class ScrapingServer:
    def __init__(self):
        self.app = FastAPI(title="Web Scraping Service", version="1.0.0")
        
        # 从环境变量获取配置
        max_requests_before_restart = int(os.getenv('MAX_REQUESTS_BEFORE_RESTART', 500))
        max_page_usage = int(os.getenv('MAX_PAGE_USAGE', 20))
        initial_page_pool_size = int(os.getenv('INITIAL_PAGE_POOL_SIZE', 5))
        max_concurrent = int(os.getenv('MAX_CONCURRENT', 35))
        
        # 创建实例
        self.scraper = WebScraper({
            'max_requests_before_restart': max_requests_before_restart,
            'max_page_usage': max_page_usage,
            'initial_page_pool_size': initial_page_pool_size
        })
        
        self.concurrency_controller = ConcurrencyController(max_concurrent)
        self.port = int(os.getenv('PORT', 3000))
        
        self._setup_routes()
        self._logger = logging.getLogger(__name__)

    def _setup_routes(self):
        """设置路由"""
        
        @self.app.get("/health")
        async def health_check():
            scraper_status = self.scraper.get_status()
            return {
                "status": "OK",
                "timestamp": datetime.now().isoformat(),
                "concurrency": self.concurrency_controller.get_stats(),
                "scraper": scraper_status
            }

        @self.app.post("/scrape")
        async def scrape_page(request: ScrapeRequest):
            if not request.word:
                raise HTTPException(status_code=400, detail="Word is required")

            self._logger.info(f"Processing scrape request for: {request.word}")

            try:
                # 注意：这里需要实现 ConcurrencyController 的 execute 方法
                result = await self.scraper.scrape_page(
                    request.word, 
                    {
                        'timeout': request.timeout,
                        'wait_until': request.wait_until
                    }
                )
                
                self._logger.info(f"Scrape result for {request.word}: {result.get('response_time', 0)}ms")
                
                if result['success']:
                    return result
                else:
                    raise HTTPException(status_code=400, detail=result)
                    
            except Exception as e:
                self._logger.error(f"Scrape endpoint error: {e}")
                raise HTTPException(status_code=500, detail=str(e))

        @self.app.post("/scrape/batch")
        async def scrape_batch(request: BatchScrapeRequest):
            if not request.words or len(request.words) == 0:
                raise HTTPException(status_code=400, detail="Words array is required and cannot be empty")

            if len(request.words) > 10:
                raise HTTPException(status_code=400, detail="Maximum 10 words allowed per batch request")

            self._logger.info(f"Processing batch request for {len(request.words)} words")

            try:
                tasks = []
                for word in request.words:
                    task = self.scraper.scrape_page(word, {
                        'timeout': request.timeout,
                        'wait_until': request.wait_until
                    })
                    tasks.append(task)

                results = await asyncio.gather(*tasks, return_exceptions=True)
                
                formatted_results = []
                for i, result in enumerate(results):
                    if isinstance(result, Exception):
                        formatted_results.append({
                            'success': False,
                            'word': request.words[i],
                            'error': str(result),
                            'timestamp': datetime.now().isoformat()
                        })
                    else:
                        formatted_results.append(result)

                return {
                    'success': True,
                    'total': len(request.words),
                    'results': formatted_results
                }

            except Exception as e:
                self._logger.error(f"Batch scrape endpoint error: {e}")
                raise HTTPException(status_code=500, detail=str(e))

        @self.app.post("/restart-browser")
        async def restart_browser():
            self._logger.info("Manual browser restart requested")
            try:
                await self.scraper.restart_browser()
                return {
                    "success": True,
                    "message": "Browser restarted successfully",
                    "timestamp": datetime.now().isoformat()
                }
            except Exception as e:
                self._logger.error(f"Manual browser restart failed: {e}")
                raise HTTPException(status_code=500, detail=str(e))

        @self.app.get("/config")
        async def get_config():
            scraper_status = self.scraper.get_status()
            return {
                "max_concurrent": self.concurrency_controller.max_concurrent,
                "max_requests_before_restart": scraper_status['max_requests_before_restart'],
                "max_page_usage": scraper_status['max_page_usage'],
                "initial_page_pool_size": scraper_status['initial_page_pool_size'],
                "port": self.port
            }

        @self.app.get("/concurrency")
        async def get_concurrency():
            return self.concurrency_controller.get_stats()

        @self.app.put("/concurrency")
        async def update_concurrency(config: ConcurrencyConfig):
            if config.max_concurrent < 1 or config.max_concurrent > 100:
                raise HTTPException(
                    status_code=400, 
                    detail="max_concurrent must be between 1 and 100"
                )

            self.concurrency_controller.set_max_concurrent(config.max_concurrent)
            return {
                "success": True,
                "message": f"Concurrency limit updated to {config.max_concurrent}",
                "stats": self.concurrency_controller.get_stats()
            }

    async def start(self):
        """启动服务器"""
        try:
            # 初始化浏览器
            await self.scraper.initialize()
            
            config = uvicorn.Config(
                self.app, 
                host="0.0.0.0", 
                port=self.port,
                log_level="info"
            )
            server = uvicorn.Server(config)
            
            self._logger.info(f"🚀 Web Scraping Server running on port {self.port}")
            self._logger.info(f"📊 Max concurrent requests: {self.concurrency_controller.max_concurrent}")
            
            await server.serve()
            
        except Exception as e:
            self._logger.error(f"Failed to start server: {e}")
            raise

    async def graceful_shutdown(self):
        """优雅关闭"""
        self._logger.info("Shutting down gracefully...")
        await self.scraper.close()

# 启动服务器
if __name__ == "__main__":
    import asyncio
    from datetime import datetime
    
    server = ScrapingServer()

    try:
        asyncio.run(server.start())
    except KeyboardInterrupt:
        asyncio.run(server.graceful_shutdown())