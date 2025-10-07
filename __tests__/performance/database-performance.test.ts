import { testDb, withTestDatabase, setupTestData } from '@/lib/test-utils'
import { DrizzleSettingsService } from '@/lib/db/settings'
import { performance } from 'perf_hooks'

describe('Database Performance Tests', () => {
  beforeAll(async () => {
    await testDb.initializeTestDatabase()
  })

  beforeEach(async () => {
    await testDb.cleanDatabase()
  })

  afterAll(async () => {
    await testDb.closeConnection()
  })

  describe('Query Performance Benchmarks', () => {
    it('should perform admin settings retrieval within acceptable time', async () => {
      await withTestDatabase(async (db) => {
        const { superAdmin } = await setupTestData()

        // Create multiple settings for realistic test
        const settingPromises = []
        for (let i = 0; i < 10; i++) {
          settingPromises.push(
            testDb.createTestSetting({
              key: `test_setting_${i}`,
              value: { data: `value_${i}`, nested: { prop: i } },
              description: `Test setting ${i}`,
              updatedBy: superAdmin.id
            })
          )
        }
        await Promise.all(settingPromises)

        // Benchmark the query
        const startTime = performance.now()
        const settings = await DrizzleSettingsService.getAdminSettings()
        const endTime = performance.now()

        const executionTime = endTime - startTime

        // Assertions
        expect(settings).toHaveLength(10)
        expect(executionTime).toBeLessThan(100) // Should complete within 100ms
        console.log(`Admin settings query took ${executionTime.toFixed(2)}ms`)
      })
    })

    it('should handle concurrent database operations efficiently', async () => {
      await withTestDatabase(async (db) => {
        const { superAdmin } = await setupTestData()

        const concurrentOperations = 5
        const operationsPerBatch = 10

        const startTime = performance.now()

        // Run concurrent batches of operations
        const batchPromises = []
        for (let batch = 0; batch < concurrentOperations; batch++) {
          const batchOps = []
          for (let op = 0; op < operationsPerBatch; op++) {
            batchOps.push(
              DrizzleSettingsService.createOrUpdateSetting(
                `test_concurrent_${batch}_${op}` as any,
                `value_${batch}_${op}`,
                `Concurrent test ${batch}-${op}`,
                false,
                superAdmin.id
              )
            )
          }
          batchPromises.push(Promise.all(batchOps))
        }

        await Promise.all(batchPromises)
        const endTime = performance.now()

        const totalTime = endTime - startTime
        const avgTimePerOperation = totalTime / (concurrentOperations * operationsPerBatch)

        expect(avgTimePerOperation).toBeLessThan(50) // Average should be under 50ms per operation
        console.log(`Concurrent operations: ${totalTime.toFixed(2)}ms total, ${avgTimePerOperation.toFixed(2)}ms average`)
      })
    })

    it('should scale well with increasing data size', async () => {
      await withTestDatabase(async (db) => {
        const { superAdmin } = await setupTestData()

        const dataSizes = [10, 50, 100]
        const results: { size: number; time: number }[] = []

        for (const size of dataSizes) {
          // Clean and setup data
          await testDb.cleanDatabase()
          const freshUser = await testDb.createTestSuperAdmin()

          // Create test data
          const createPromises = []
          for (let i = 0; i < size; i++) {
            createPromises.push(
              testDb.createTestSetting({
                key: `scale_test_${i}`,
                value: {
                  data: `value_${i}`.repeat(10), // Make values larger
                  metadata: Array(5).fill(0).map((_, j) => ({ index: j, data: `meta_${i}_${j}` }))
                },
                description: `Scale test setting ${i}`,
                updatedBy: freshUser.id
              })
            )
          }
          await Promise.all(createPromises)

          // Benchmark retrieval
          const startTime = performance.now()
          const settings = await DrizzleSettingsService.getAdminSettings()
          const endTime = performance.now()

          const executionTime = endTime - startTime
          results.push({ size, time: executionTime })

          expect(settings).toHaveLength(size)
          console.log(`Query with ${size} records took ${executionTime.toFixed(2)}ms`)
        }

        // Verify scaling is reasonable (not exponential)
        const scalingFactor = results[2].time / results[0].time // 100 records vs 10 records
        expect(scalingFactor).toBeLessThan(5) // Should not be more than 5x slower
      })
    })
  })

  describe('Connection Pool Performance', () => {
    it('should handle connection pool efficiently under load', async () => {
      const concurrentQueries = 20
      const queriesPerConnection = 5

      const startTime = performance.now()

      const connectionPromises = []
      for (let i = 0; i < concurrentQueries; i++) {
        connectionPromises.push(
          withTestDatabase(async (db) => {
            const { superAdmin } = await setupTestData()

            const queryPromises = []
            for (let j = 0; j < queriesPerConnection; j++) {
              queryPromises.push(
                testDb.createTestSetting({
                  key: `pool_test_${i}_${j}`,
                  value: `value_${i}_${j}`,
                  updatedBy: superAdmin.id
                })
              )
            }
            return Promise.all(queryPromises)
          })
        )
      }

      await Promise.all(connectionPromises)
      const endTime = performance.now()

      const totalTime = endTime - startTime
      expect(totalTime).toBeLessThan(5000) // Should complete within 5 seconds

      console.log(`Connection pool test: ${concurrentQueries * queriesPerConnection} operations in ${totalTime.toFixed(2)}ms`)
    })

    it('should recover from connection timeouts gracefully', async () => {
      // This test simulates network latency/timeout scenarios
      const timeoutPromise = new Promise(resolve => setTimeout(resolve, 100))

      await withTestDatabase(async (db) => {
        const { superAdmin } = await setupTestData()

        const startTime = performance.now()

        // Simulate slow network by adding delays
        await timeoutPromise

        const setting = await testDb.createTestSetting({
          key: 'timeout_test',
          value: 'test_value',
          updatedBy: superAdmin.id
        })

        const endTime = performance.now()
        const executionTime = endTime - startTime

        expect(setting).toBeDefined()
        expect(executionTime).toBeGreaterThan(100) // Should include the simulated delay
        expect(executionTime).toBeLessThan(1000) // But should complete within reasonable time
      })
    })
  })

  describe('Query Optimization Tests', () => {
    it('should use indexes effectively for common queries', async () => {
      await withTestDatabase(async (db) => {
        const { superAdmin } = await setupTestData()

        // Create test data with known patterns
        await testDb.createTestSetting({
          key: 'mistral_ocr_api_key',
          value: 'test-key',
          updatedBy: superAdmin.id
        })

        await testDb.createTestSetting({
          key: 'aws_bedrock_credentials',
          value: { accessKeyId: 'test', region: 'us-east-1' },
          updatedBy: superAdmin.id
        })

        // Query specific setting (should use primary key index)
        const startTime = performance.now()
        const db = testDb.getDatabase()
        const specificSetting = await db.select()
          .from(schema.systemSettings)
          .where(eq(schema.systemSettings.key, 'mistral_ocr_api_key'))
        const endTime = performance.now()

        expect(specificSetting).toHaveLength(1)
        expect(endTime - startTime).toBeLessThan(10) // Should be very fast with index
      })
    })

    it('should perform JSON queries efficiently', async () => {
      await withTestDatabase(async (db) => {
        const { superAdmin } = await setupTestData()

        // Create setting with complex JSON structure
        const complexValue = {
          level1: {
            level2: {
              level3: {
                data: 'deep-nested-value',
                array: Array(100).fill(0).map((_, i) => ({ id: i, value: `item_${i}` }))
              }
            }
          }
        }

        await testDb.createTestSetting({
          key: 'complex_json_setting',
          value: complexValue,
          updatedBy: superAdmin.id
        })

        const startTime = performance.now()
        const db = testDb.getDatabase()

        // Query using JSONB operators (if supported)
        const jsonQuery = await db.select()
          .from(schema.systemSettings)
          .where(
            sql`${schema.systemSettings.value}->>'level1' IS NOT NULL`
          )

        const endTime = performance.now()

        expect(jsonQuery).toHaveLength(1)
        expect(endTime - startTime).toBeLessThan(50) // JSON queries should be reasonably fast
        console.log(`JSON query took ${(endTime - startTime).toFixed(2)}ms`)
      })
    })
  })

  describe('Memory Usage Tests', () => {
    it('should not cause memory leaks with repeated operations', async () => {
      const iterations = 100
      const initialMemory = process.memoryUsage()

      await withTestDatabase(async (db) => {
        const { superAdmin } = await setupTestData()

        for (let i = 0; i < iterations; i++) {
          // Create and immediately clean up
          const setting = await testDb.createTestSetting({
            key: `memory_test_${i}`,
            value: `large_value_${'x'.repeat(1000)}`, // 1KB value
            updatedBy: superAdmin.id
          })

          // Query the setting
          await DrizzleSettingsService.getAdminSettings()

          // Clean up to avoid accumulation
          if (i % 10 === 0) {
            global.gc && global.gc() // Force garbage collection if available
          }
        }
      })

      const finalMemory = process.memoryUsage()
      const memoryIncrease = finalMemory.heapUsed - initialMemory.heapUsed

      // Memory should not increase by more than 50MB
      expect(memoryIncrease).toBeLessThan(50 * 1024 * 1024)

      console.log(`Memory increase: ${(memoryIncrease / 1024 / 1024).toFixed(2)}MB`)
    })
  })

  describe('Transaction Performance', () => {
    it('should handle transactions efficiently', async () => {
      await withTestDatabase(async (db) => {
        const { superAdmin } = await setupTestData()

        const transactionSize = 20
        const startTime = performance.now()

        // Simulate a transaction with multiple operations
        const db = testDb.getDatabase()
        await db.transaction(async (tx) => {
          for (let i = 0; i < transactionSize; i++) {
            await tx.insert(schema.systemSettings).values({
              key: `transaction_test_${i}`,
              value: { index: i, data: `transaction_data_${i}` },
              description: `Transaction test ${i}`,
              updatedBy: superAdmin.id
            })
          }
        })

        const endTime = performance.now()
        const transactionTime = endTime - startTime

        // Verify all records were created
        const settings = await DrizzleSettingsService.getAdminSettings()
        const transactionSettings = settings.filter(s => s.key.startsWith('transaction_test_'))

        expect(transactionSettings).toHaveLength(transactionSize)
        expect(transactionTime).toBeLessThan(500) // Transaction should complete within 500ms

        console.log(`Transaction with ${transactionSize} operations took ${transactionTime.toFixed(2)}ms`)
      })
    })

    it('should rollback failed transactions without performance impact', async () => {
      await withTestDatabase(async (db) => {
        const { superAdmin } = await setupTestData()

        const startTime = performance.now()

        try {
          const db = testDb.getDatabase()
          await db.transaction(async (tx) => {
            // Insert valid record
            await tx.insert(schema.systemSettings).values({
              key: 'rollback_test_1',
              value: 'valid_value',
              updatedBy: superAdmin.id
            })

            // Insert invalid record (should cause rollback)
            await tx.insert(schema.systemSettings).values({
              key: 'rollback_test_2',
              value: 'invalid_value',
              updatedBy: 'non-existent-user' // This should fail
            })
          })
        } catch (error) {
          // Expected to fail
        }

        const endTime = performance.now()
        const rollbackTime = endTime - startTime

        // Verify rollback worked
        const settings = await DrizzleSettingsService.getAdminSettings()
        const rollbackSettings = settings.filter(s => s.key.startsWith('rollback_test_'))

        expect(rollbackSettings).toHaveLength(0) // Should be rolled back
        expect(rollbackTime).toBeLessThan(100) // Rollback should be fast

        console.log(`Transaction rollback took ${rollbackTime.toFixed(2)}ms`)
      })
    })
  })
})