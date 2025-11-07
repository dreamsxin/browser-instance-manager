import asyncio
from typing import Callable, Any, Dict, Set, List
import logging

class ConcurrencyController:
    def __init__(self, max_concurrent: int = 3):
        self.max_concurrent = max_concurrent
        self.active_tasks: Set[asyncio.Task] = set()
        self.pending_queue: List[Dict] = []
        self.running = 0
        self._lock = asyncio.Lock()
        self._logger = logging.getLogger(__name__)

    async def execute(self, fn: Callable, *args, **kwargs) -> Any:
        """执行函数，遵守并发限制"""
        return await asyncio.get_event_loop().create_future()

    async def _process_queue(self):
        """处理等待队列"""
        async with self._lock:
            if self.running >= self.max_concurrent or not self.pending_queue:
                return

            while (self.running < self.max_concurrent and 
                   self.pending_queue):
                task_info = self.pending_queue.pop(0)
                self.running += 1
                
                task = asyncio.create_task(self._run_task(task_info))
                self.active_tasks.add(task)
                task.add_done_callback(self._task_completed)

    async def _run_task(self, task_info: Dict) -> Any:
        """运行任务"""
        try:
            fn = task_info['fn']
            args = task_info.get('args', [])
            kwargs = task_info.get('kwargs', {})
            future = task_info['future']
            
            result = await fn(*args, **kwargs)
            future.set_result(result)
            return result
        except Exception as e:
            task_info['future'].set_exception(e)
            raise

    def _task_completed(self, task: asyncio.Task):
        """任务完成回调"""
        self.running -= 1
        self.active_tasks.discard(task)
        asyncio.create_task(self._process_queue())
        self._update_stats()

    def _update_stats(self):
        """更新统计信息"""
        self._logger.info(
            f"Concurrency: {self.running}/{self.max_concurrent}, "
            f"Queued: {len(self.pending_queue)}"
        )

    def get_stats(self) -> Dict[str, Any]:
        """获取统计信息"""
        return {
            'active': self.running,
            'max_concurrent': self.max_concurrent,
            'queued': len(self.pending_queue),
            'available': self.max_concurrent - self.running
        }

    def set_max_concurrent(self, new_max: int):
        """设置最大并发数"""
        self.max_concurrent = new_max
        asyncio.create_task(self._process_queue())

    async def wait_for_all(self):
        """等待所有任务完成"""
        while self.running > 0 or self.pending_queue:
            await asyncio.sleep(0.1)