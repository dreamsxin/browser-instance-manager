class ConcurrencyController {
  constructor(maxConcurrent = 3) {
    this.maxConcurrent = maxConcurrent;
    this.activeTasks = new Set();
    this.pendingQueue = [];
    this.running = 0;
  }

  async execute(fn, ...args) {
    return new Promise((resolve, reject) => {
      const task = async () => {
        try {
          const result = await fn(...args);
          resolve(result);
        } catch (error) {
          reject(error);
        } finally {
          this.running--;
          this.activeTasks.delete(task);
          this.processQueue();
        }
      };

      this.pendingQueue.push({ task, args });
      this.processQueue();
    });
  }

  processQueue() {
    if (this.running >= this.maxConcurrent || this.pendingQueue.length === 0) {
      return;
    }

    while (this.running < this.maxConcurrent && this.pendingQueue.length > 0) {
      const { task } = this.pendingQueue.shift();
      this.running++;
      this.activeTasks.add(task);
      task().catch(error => {
        console.error('Task execution error:', error);
      });
    }

    this.updateStats();
  }

  updateStats() {
    console.log(`Concurrency: ${this.running}/${this.maxConcurrent}, Queued: ${this.pendingQueue.length}`);
  }

  getStats() {
    return {
      active: this.running,
      maxConcurrent: this.maxConcurrent,
      queued: this.pendingQueue.length,
      available: this.maxConcurrent - this.running
    };
  }

  setMaxConcurrent(newMax) {
    this.maxConcurrent = newMax;
    this.processQueue(); // 重新处理队列以应用新的限制
  }

  async waitForAll() {
    while (this.running > 0 || this.pendingQueue.length > 0) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
}

module.exports = ConcurrencyController;