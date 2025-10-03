import { performance } from 'perf_hooks';

export interface PerformanceTestConfig {
  name: string;
  description?: string;
  url: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  headers?: Record<string, string>;
  body?: any;
  expectedStatusCode?: number;
  timeout?: number; // milliseconds
  concurrent?: number; // number of concurrent requests
  duration?: number; // test duration in seconds
  rampUp?: number; // ramp up time in seconds
  thresholds?: {
    responseTime?: {
      avg?: number;
      p95?: number;
      p99?: number;
      max?: number;
    };
    throughput?: {
      min?: number; // requests per second
    };
    errorRate?: {
      max?: number; // percentage
    };
  };
}

export interface PerformanceTestResult {
  testName: string;
  duration: number;
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  errorRate: number;
  responseTime: {
    avg: number;
    min: number;
    max: number;
    p50: number;
    p95: number;
    p99: number;
  };
  throughput: {
    requestsPerSecond: number;
    bytesPerSecond: number;
  };
  errors: Array<{
    error: string;
    count: number;
    percentage: number;
  }>;
  timestamps: number[];
  responseTimes: number[];
  passed: boolean;
  failedThresholds: string[];
}

export interface LoadTestScenario {
  name: string;
  description?: string;
  tests: PerformanceTestConfig[];
  globalConfig?: {
    baseUrl?: string;
    headers?: Record<string, string>;
    timeout?: number;
  };
}

/**
 * Performance test runner
 */
export class PerformanceTestRunner {
  private baseUrl: string;
  private globalHeaders: Record<string, string>;
  private globalTimeout: number;

  constructor(options: {
    baseUrl?: string;
    headers?: Record<string, string>;
    timeout?: number;
  } = {}) {
    this.baseUrl = options.baseUrl || 'http://localhost:3000';
    this.globalHeaders = options.headers || {};
    this.globalTimeout = options.timeout || 10000;
  }

  /**
   * Run a single performance test
   */
  async runTest(config: PerformanceTestConfig): Promise<PerformanceTestResult> {
    const startTime = performance.now();
    const responseTimes: number[] = [];
    const timestamps: number[] = [];
    const errors: Map<string, number> = new Map();
    let successfulRequests = 0;
    let failedRequests = 0;

    const url = config.url.startsWith('http') ? config.url : `${this.baseUrl}${config.url}`;
    const headers = { ...this.globalHeaders, ...config.headers };
    const timeout = config.timeout || this.globalTimeout;
    const concurrent = config.concurrent || 1;
    const duration = config.duration || 10; // seconds
    const rampUp = config.rampUp || 0;

    console.log(`Starting performance test: ${config.name}`);
    console.log(`URL: ${url}, Concurrent: ${concurrent}, Duration: ${duration}s`);

    // Calculate request intervals
    const totalDurationMs = duration * 1000;
    const rampUpMs = rampUp * 1000;
    const requestsPerSecond = concurrent;
    const intervalMs = 1000 / requestsPerSecond;

    // Track when to stop
    const endTime = startTime + totalDurationMs + rampUpMs;
    let activeRequests = 0;
    const maxConcurrent = concurrent;

    // Main test loop
    while (performance.now() < endTime) {
      // Ramp up logic
      const elapsed = performance.now() - startTime;
      const currentMaxConcurrent = rampUpMs > 0 && elapsed < rampUpMs
        ? Math.ceil((elapsed / rampUpMs) * maxConcurrent)
        : maxConcurrent;

      // Launch requests up to current concurrent limit
      while (activeRequests < currentMaxConcurrent && performance.now() < endTime) {
        activeRequests++;
        this.makeRequest(url, config, headers, timeout)
          .then(result => {
            activeRequests--;
            if (result.success) {
              successfulRequests++;
              responseTimes.push(result.responseTime);
              timestamps.push(result.timestamp);
            } else {
              failedRequests++;
              const errorKey = result.error || 'Unknown error';
              errors.set(errorKey, (errors.get(errorKey) || 0) + 1);
            }
          })
          .catch(error => {
            activeRequests--;
            failedRequests++;
            const errorKey = error.message || 'Unknown error';
            errors.set(errorKey, (errors.get(errorKey) || 0) + 1);
          });

        // Wait before next request (if not at max concurrent)
        if (activeRequests < currentMaxConcurrent) {
          await this.sleep(intervalMs);
        }
      }

      // Small delay to prevent tight loop
      await this.sleep(10);
    }

    // Wait for remaining requests to complete
    while (activeRequests > 0) {
      await this.sleep(100);
    }

    const actualDuration = (performance.now() - startTime) / 1000;
    const totalRequests = successfulRequests + failedRequests;

    // Calculate statistics
    const result: PerformanceTestResult = {
      testName: config.name,
      duration: actualDuration,
      totalRequests,
      successfulRequests,
      failedRequests,
      errorRate: totalRequests > 0 ? (failedRequests / totalRequests) * 100 : 0,
      responseTime: this.calculateResponseTimeStats(responseTimes),
      throughput: {
        requestsPerSecond: totalRequests / actualDuration,
        bytesPerSecond: 0 // Would need to track response sizes
      },
      errors: Array.from(errors.entries()).map(([error, count]) => ({
        error,
        count,
        percentage: (count / totalRequests) * 100
      })),
      timestamps,
      responseTimes,
      passed: true,
      failedThresholds: []
    };

    // Check thresholds
    result.failedThresholds = this.checkThresholds(result, config.thresholds);
    result.passed = result.failedThresholds.length === 0;

    console.log(`Test completed: ${config.name}`);
    console.log(`Requests: ${totalRequests}, Success: ${successfulRequests}, Failed: ${failedRequests}`);
    console.log(`Avg Response Time: ${result.responseTime.avg.toFixed(2)}ms`);
    console.log(`Throughput: ${result.throughput.requestsPerSecond.toFixed(2)} req/s`);

    return result;
  }

  /**
   * Run a load test scenario
   */
  async runScenario(scenario: LoadTestScenario): Promise<{
    scenarioName: string;
    results: PerformanceTestResult[];
    summary: {
      totalTests: number;
      passedTests: number;
      failedTests: number;
      overallPassed: boolean;
    };
  }> {
    console.log(`\n=== Running Scenario: ${scenario.name} ===`);
    if (scenario.description) {
      console.log(scenario.description);
    }

    const results: PerformanceTestResult[] = [];

    // Apply global config
    if (scenario.globalConfig) {
      if (scenario.globalConfig.baseUrl) this.baseUrl = scenario.globalConfig.baseUrl;
      if (scenario.globalConfig.headers) this.globalHeaders = { ...this.globalHeaders, ...scenario.globalConfig.headers };
      if (scenario.globalConfig.timeout) this.globalTimeout = scenario.globalConfig.timeout;
    }

    // Run each test
    for (const testConfig of scenario.tests) {
      try {
        const result = await this.runTest(testConfig);
        results.push(result);
      } catch (error) {
        console.error(`Test failed: ${testConfig.name}`, error);
        results.push({
          testName: testConfig.name,
          duration: 0,
          totalRequests: 0,
          successfulRequests: 0,
          failedRequests: 1,
          errorRate: 100,
          responseTime: { avg: 0, min: 0, max: 0, p50: 0, p95: 0, p99: 0 },
          throughput: { requestsPerSecond: 0, bytesPerSecond: 0 },
          errors: [{ error: error instanceof Error ? error.message : 'Unknown error', count: 1, percentage: 100 }],
          timestamps: [],
          responseTimes: [],
          passed: false,
          failedThresholds: ['Test execution failed']
        });
      }
    }

    const summary = {
      totalTests: results.length,
      passedTests: results.filter(r => r.passed).length,
      failedTests: results.filter(r => !r.passed).length,
      overallPassed: results.every(r => r.passed)
    };

    console.log(`\n=== Scenario Summary ===`);
    console.log(`Total Tests: ${summary.totalTests}`);
    console.log(`Passed: ${summary.passedTests}`);
    console.log(`Failed: ${summary.failedTests}`);
    console.log(`Overall: ${summary.overallPassed ? 'PASSED' : 'FAILED'}`);

    return {
      scenarioName: scenario.name,
      results,
      summary
    };
  }

  /**
   * Make a single HTTP request
   */
  private async makeRequest(
    url: string,
    config: PerformanceTestConfig,
    headers: Record<string, string>,
    timeout: number
  ): Promise<{
    success: boolean;
    responseTime: number;
    timestamp: number;
    statusCode?: number;
    error?: string;
  }> {
    const startTime = performance.now();
    const timestamp = Date.now();

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      const fetchOptions: RequestInit = {
        method: config.method,
        headers,
        signal: controller.signal
      };

      if (config.body && (config.method === 'POST' || config.method === 'PUT')) {
        fetchOptions.body = typeof config.body === 'string'
          ? config.body
          : JSON.stringify(config.body);

        if (!headers['Content-Type']) {
          headers['Content-Type'] = 'application/json';
        }
      }

      const response = await fetch(url, fetchOptions);
      clearTimeout(timeoutId);

      const responseTime = performance.now() - startTime;
      const expectedStatus = config.expectedStatusCode || 200;

      if (response.status === expectedStatus) {
        return {
          success: true,
          responseTime,
          timestamp,
          statusCode: response.status
        };
      } else {
        return {
          success: false,
          responseTime,
          timestamp,
          statusCode: response.status,
          error: `Unexpected status code: ${response.status}`
        };
      }
    } catch (error) {
      const responseTime = performance.now() - startTime;
      return {
        success: false,
        responseTime,
        timestamp,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Calculate response time statistics
   */
  private calculateResponseTimeStats(responseTimes: number[]): PerformanceTestResult['responseTime'] {
    if (responseTimes.length === 0) {
      return { avg: 0, min: 0, max: 0, p50: 0, p95: 0, p99: 0 };
    }

    const sorted = [...responseTimes].sort((a, b) => a - b);
    const sum = responseTimes.reduce((acc, time) => acc + time, 0);

    return {
      avg: sum / responseTimes.length,
      min: sorted[0],
      max: sorted[sorted.length - 1],
      p50: this.percentile(sorted, 50),
      p95: this.percentile(sorted, 95),
      p99: this.percentile(sorted, 99)
    };
  }

  /**
   * Calculate percentile
   */
  private percentile(sortedArray: number[], p: number): number {
    const index = (p / 100) * (sortedArray.length - 1);
    const lower = Math.floor(index);
    const upper = Math.ceil(index);
    const weight = index % 1;

    if (upper >= sortedArray.length) return sortedArray[sortedArray.length - 1];
    if (lower === upper) return sortedArray[lower];

    return sortedArray[lower] * (1 - weight) + sortedArray[upper] * weight;
  }

  /**
   * Check performance thresholds
   */
  private checkThresholds(
    result: PerformanceTestResult,
    thresholds?: PerformanceTestConfig['thresholds']
  ): string[] {
    const failed: string[] = [];

    if (!thresholds) return failed;

    // Response time thresholds
    if (thresholds.responseTime) {
      if (thresholds.responseTime.avg && result.responseTime.avg > thresholds.responseTime.avg) {
        failed.push(`Average response time ${result.responseTime.avg.toFixed(2)}ms exceeds threshold ${thresholds.responseTime.avg}ms`);
      }
      if (thresholds.responseTime.p95 && result.responseTime.p95 > thresholds.responseTime.p95) {
        failed.push(`95th percentile response time ${result.responseTime.p95.toFixed(2)}ms exceeds threshold ${thresholds.responseTime.p95}ms`);
      }
      if (thresholds.responseTime.p99 && result.responseTime.p99 > thresholds.responseTime.p99) {
        failed.push(`99th percentile response time ${result.responseTime.p99.toFixed(2)}ms exceeds threshold ${thresholds.responseTime.p99}ms`);
      }
      if (thresholds.responseTime.max && result.responseTime.max > thresholds.responseTime.max) {
        failed.push(`Maximum response time ${result.responseTime.max.toFixed(2)}ms exceeds threshold ${thresholds.responseTime.max}ms`);
      }
    }

    // Throughput thresholds
    if (thresholds.throughput?.min && result.throughput.requestsPerSecond < thresholds.throughput.min) {
      failed.push(`Throughput ${result.throughput.requestsPerSecond.toFixed(2)} req/s below minimum threshold ${thresholds.throughput.min} req/s`);
    }

    // Error rate thresholds
    if (thresholds.errorRate?.max && result.errorRate > thresholds.errorRate.max) {
      failed.push(`Error rate ${result.errorRate.toFixed(2)}% exceeds maximum threshold ${thresholds.errorRate.max}%`);
    }

    return failed;
  }

  /**
   * Utility function for delays
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * Predefined test scenarios
 */
export const performanceTestScenarios = {
  // Basic API health check
  apiHealthCheck: {
    name: 'API Health Check',
    description: 'Basic performance test for core API endpoints',
    tests: [
      {
        name: 'Health Endpoint',
        url: '/api/health',
        method: 'GET' as const,
        concurrent: 5,
        duration: 10,
        thresholds: {
          responseTime: { avg: 100, p95: 200 },
          errorRate: { max: 1 }
        }
      },
      {
        name: 'Status Endpoint',
        url: '/api/status',
        method: 'GET' as const,
        concurrent: 3,
        duration: 10,
        thresholds: {
          responseTime: { avg: 150, p95: 300 },
          errorRate: { max: 2 }
        }
      }
    ]
  } as LoadTestScenario,

  // Chatbot API load test
  chatbotLoadTest: {
    name: 'Chatbot API Load Test',
    description: 'Load test for chatbot endpoints with realistic traffic',
    tests: [
      {
        name: 'List Chatbots',
        url: '/api/chatbots',
        method: 'GET' as const,
        concurrent: 10,
        duration: 30,
        rampUp: 10,
        thresholds: {
          responseTime: { avg: 500, p95: 1000, p99: 2000 },
          throughput: { min: 15 },
          errorRate: { max: 3 }
        }
      },
      {
        name: 'Create Conversation',
        url: '/api/conversations',
        method: 'POST' as const,
        body: {
          chatbotId: 'test-chatbot',
          userId: 'test-user'
        },
        concurrent: 8,
        duration: 30,
        rampUp: 10,
        thresholds: {
          responseTime: { avg: 800, p95: 1500, p99: 3000 },
          throughput: { min: 10 },
          errorRate: { max: 5 }
        }
      }
    ]
  } as LoadTestScenario,

  // Static asset performance
  staticAssetTest: {
    name: 'Static Asset Performance',
    description: 'Test performance of static asset delivery',
    tests: [
      {
        name: 'CSS Load Test',
        url: '/static/css/main.css',
        method: 'GET' as const,
        concurrent: 20,
        duration: 15,
        thresholds: {
          responseTime: { avg: 200, p95: 400 },
          errorRate: { max: 1 }
        }
      },
      {
        name: 'JavaScript Load Test',
        url: '/static/js/main.js',
        method: 'GET' as const,
        concurrent: 20,
        duration: 15,
        thresholds: {
          responseTime: { avg: 300, p95: 600 },
          errorRate: { max: 1 }
        }
      }
    ]
  } as LoadTestScenario,

  // Stress test scenario
  stressTest: {
    name: 'System Stress Test',
    description: 'High-load stress test to find system limits',
    tests: [
      {
        name: 'API Stress Test',
        url: '/api/chatbots',
        method: 'GET' as const,
        concurrent: 50,
        duration: 60,
        rampUp: 30,
        thresholds: {
          responseTime: { avg: 1000, p95: 3000, p99: 5000 },
          throughput: { min: 40 },
          errorRate: { max: 10 }
        }
      }
    ]
  } as LoadTestScenario
};

/**
 * Performance test suite runner
 */
export class PerformanceTestSuite {
  private runner: PerformanceTestRunner;

  constructor(baseUrl?: string) {
    this.runner = new PerformanceTestRunner({ baseUrl });
  }

  /**
   * Run all predefined scenarios
   */
  async runAllScenarios(): Promise<void> {
    console.log('🚀 Starting Performance Test Suite');
    console.log('==================================');

    const scenarios = Object.values(performanceTestScenarios);
    const results = [];

    for (const scenario of scenarios) {
      try {
        const result = await this.runner.runScenario(scenario);
        results.push(result);
      } catch (error) {
        console.error(`Scenario failed: ${scenario.name}`, error);
      }
    }

    // Generate summary report
    this.generateSummaryReport(results);
  }

  /**
   * Run specific scenario
   */
  async runScenario(scenarioName: keyof typeof performanceTestScenarios): Promise<void> {
    const scenario = performanceTestScenarios[scenarioName];
    if (!scenario) {
      throw new Error(`Scenario not found: ${scenarioName}`);
    }

    await this.runner.runScenario(scenario);
  }

  /**
   * Generate summary report
   */
  private generateSummaryReport(results: any[]): void {
    console.log('\n📊 Performance Test Suite Summary');
    console.log('================================');

    const totalScenarios = results.length;
    const passedScenarios = results.filter(r => r.summary.overallPassed).length;
    const failedScenarios = totalScenarios - passedScenarios;

    console.log(`Total Scenarios: ${totalScenarios}`);
    console.log(`Passed: ${passedScenarios}`);
    console.log(`Failed: ${failedScenarios}`);
    console.log(`Success Rate: ${((passedScenarios / totalScenarios) * 100).toFixed(1)}%`);

    // Show failed scenarios
    if (failedScenarios > 0) {
      console.log('\n❌ Failed Scenarios:');
      results
        .filter(r => !r.summary.overallPassed)
        .forEach(r => {
          console.log(`  - ${r.scenarioName}`);
          r.results
            .filter((test: any) => !test.passed)
            .forEach((test: any) => {
              console.log(`    • ${test.testName}: ${test.failedThresholds.join(', ')}`);
            });
        });
    }

    console.log(`\n${passedScenarios === totalScenarios ? '✅' : '❌'} Overall Result: ${passedScenarios === totalScenarios ? 'PASSED' : 'FAILED'}`);
  }
}