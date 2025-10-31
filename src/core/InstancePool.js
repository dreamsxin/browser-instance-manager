import { EventEmitter } from 'events';
import { createLogger } from '../utils/logger.js';

export class InstancePool extends EventEmitter {
  constructor(config) {
    super();
    this.config = config;
    this.logger = createLogger(config.logLevel);
    this.instances = new Set();
    this.availableInstances = new Set();
    this.maxInstances = config.maxInstances;
  }

  addInstance(instanceId) {
    if (this.isFull()) {
      throw new Error('Instance pool is full');
    }

    this.instances.add(instanceId);
    this.availableInstances.add(instanceId);
    this.emit('instanceAdded', instanceId);
  }

  removeInstance(instanceId) {
    this.instances.delete(instanceId);
    this.availableInstances.delete(instanceId);
    this.emit('instanceRemoved', instanceId);
  }

  acquireInstance(instanceId) {
    if (this.availableInstances.has(instanceId)) {
      this.availableInstances.delete(instanceId);
      this.emit('instanceAcquired', instanceId);
      return true;
    }
    return false;
  }

  releaseInstance(instanceId) {
    if (this.instances.has(instanceId)) {
      this.availableInstances.add(instanceId);
      this.emit('instanceReleased', instanceId);
      return true;
    }
    return false;
  }

  isFull() {
    return this.instances.size >= this.maxInstances;
  }

  getAvailableCount() {
    return this.availableInstances.size;
  }

  getUtilization() {
    if (this.instances.size === 0) return 0;
    return ((this.instances.size - this.availableInstances.size) / this.instances.size) * 100;
  }

  cleanup() {
    this.instances.clear();
    this.availableInstances.clear();
    this.emit('poolCleaned');
  }

  getStats() {
    return {
      total: this.instances.size,
      available: this.availableInstances.size,
      inUse: this.instances.size - this.availableInstances.size,
      max: this.maxInstances,
      utilization: this.getUtilization()
    };
  }
}

export default InstancePool;