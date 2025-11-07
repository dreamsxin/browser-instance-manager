import asyncio
import aiohttp
import time
from typing import List, Dict, Any
import random
import string
from tqdm import tqdm

class ConcurrencyTestClient:
    def __init__(self, base_url: str = "http://localhost:3000"):
        self.base_url = base_url
        self.session = None

    async def __aenter__(self):
        self.session = aiohttp.ClientSession()
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        if self.session:
            await self.session.close()

    def generate_test_words(self, count: int = 10) -> List[str]:
        """生成测试关键词"""
        words = []
        for i in range(count):
            # 生成随机关键词
            word = ''.join(random.choices(string.ascii_lowercase, k=8))
            words.append(word)
        return words

    async def single_request(self, word: str, request_id: int) -> Dict[str, Any]:
        """单次请求测试"""
        start_time = time.time()
        
        try:
            async with self.session.post(
                f"{self.base_url}/scrape",
                json={"word": word, "timeout": 30000}
            ) as response:
                
                end_time = time.time()
                response_time = (end_time - start_time) * 1000
                
                if response.status == 200:
                    data = await response.json()
                    return {
                        "id": request_id,
                        "word": word,
                        "success": True,
                        "response_time": response_time,
                        "status": response.status,
                        "data_length": len(data.get("content", "")),
                        "title": data.get("title", "N/A")
                    }
                else:
                    error_data = await response.json()
                    return {
                        "id": request_id,
                        "word": word,
                        "success": False,
                        "response_time": response_time,
                        "error": error_data.get("error", "Unknown error"),
                        "status": response.status
                    }
                    
        except Exception as e:
            end_time = time.time()
            response_time = (end_time - start_time) * 1000
            return {
                "id": request_id,
                "word": word,
                "success": False,
                "response_time": response_time,
                "error": str(e),
                "status": 500
            }

    async def run_concurrency_test(self, options: Dict = None) -> Dict[str, Any]:
        """运行并发测试"""
        options = options or {}
        concurrency = options.get('concurrency', 5)
        total_requests = options.get('total_requests', 20)
        delay_between_batches = options.get('delay_between_batches', 0.5)
        
        print(f"🚀 Starting concurrency test")
        print(f"📊 Config: {concurrency} concurrent, {total_requests} total requests")
        print('─' * 50)
        
        words = self.generate_test_words(total_requests)
        results = []
        batches = []
        
        # 创建批次
        for i in range(0, total_requests, concurrency):
            batch = words[i:i + concurrency]
            batches.append(batch)
        
        start_time = time.time()
        completed_requests = 0
        
        with tqdm(total=total_requests, desc="Progress") as pbar:
            for batch_index, batch in enumerate(batches):
                print(f"\n🔄 Processing batch {batch_index + 1}/{len(batches)}, concurrency: {len(batch)}")
                
                # 执行批次请求
                tasks = []
                for i, word in enumerate(batch):
                    request_id = batch_index * concurrency + i
                    task = self.single_request(word, request_id)
                    tasks.append(task)
                
                batch_results = await asyncio.gather(*tasks)
                results.extend(batch_results)
                
                completed_requests += len(batch)
                pbar.update(len(batch))
                
                # 批次间延迟
                if batch_index < len(batches) - 1:
                    print(f"⏳ Waiting {delay_between_batches}s before next batch...")
                    await asyncio.sleep(delay_between_batches)
        
        total_time = time.time() - start_time
        return self.generate_report(results, total_time)

    def generate_report(self, results: List[Dict], total_time: float) -> Dict[str, Any]:
        """生成测试报告"""
        successful = [r for r in results if r['success']]
        failed = [r for r in results if not r['success']]
        response_times = [r['response_time'] for r in successful]
        
        if response_times:
            avg_response_time = sum(response_times) / len(response_times)
            min_response_time = min(response_times)
            max_response_time = max(response_times)
        else:
            avg_response_time = min_response_time = max_response_time = 0
        
        success_rate = (len(successful) / len(results)) * 100 if results else 0
        qps = len(successful) / total_time if total_time > 0 else 0
        
        print('\n' + '=' * 60)
        print('📊 Test Report')
        print('=' * 60)
        print(f"Total requests: {len(results)}")
        print(f"Total time: {total_time:.2f}s")
        print(f"Successful: {len(successful)}")
        print(f"Failed: {len(failed)}")
        print(f"Success rate: {success_rate:.2f}%")
        print(f"Average response time: {avg_response_time:.2f}ms")
        print(f"Min response time: {min_response_time:.2f}ms")
        print(f"Max response time: {max_response_time:.2f}ms")
        print(f"QPS: {qps:.2f}")
        
        return {
            'total': len(results),
            'successful': len(successful),
            'failed': len(failed),
            'success_rate': success_rate,
            'avg_response_time': avg_response_time,
            'min_response_time': min_response_time,
            'max_response_time': max_response_time,
            'qps': qps,
            'results': results
        }

async def main():
    """主函数"""
    async with ConcurrencyTestClient() as client:
        # 运行并发测试
        report = await client.run_concurrency_test({
            'concurrency': 1,
            'total_requests': 1,
            'delay_between_batches': 0.5
        })

if __name__ == "__main__":
    asyncio.run(main())