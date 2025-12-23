

import { getLabelPoints } from '../polygon-labeler.js';
import type { FeatureCollection, Polygon, MultiPolygon } from 'geojson';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const baselineMetrics = {
    meanResponseTimeMs: 2500,
    medianResponseTimeMs: 2500,
    averageMemoryUsageMB: 10
}

// Interface for benchmark results
interface BenchmarkResult {
    name: string;
    executionTime: number; // time in milliseconds
    iterationsPerSecond: number; // operations per second
    memoryUsed?: number; // memory consumption
}

// Statistical benchmark result
interface StatisticalResult extends BenchmarkResult {
    runs: number[];
    mean: number;
    median: number;
    standardDeviation: number;
    min: number;
    max: number;
}

// Memory profiling utilities
interface MemorySnapshot {
    heapUsed: number;
    heapTotal: number;
    external: number;
    timestamp: number;
}

class MemoryProfiler {
    // Take memory snapshot
    takeSnapshot(): MemorySnapshot {
        const memUsage = process.memoryUsage();
        return {
            heapUsed: memUsage.heapUsed,
            heapTotal: memUsage.heapTotal,
            external: memUsage.external,
            timestamp: performance.now()
        };
    }

    // Benchmark with memory profiling
    async profileMemory<T>(
        name: string,
        fn: () => T | Promise<T>,
        iterations: number = 100
    ): Promise<void> {
        console.log(`\nMemory profiling: ${name}`);

        // Force garbage collection if available
        if (global.gc) {
            global.gc();
        }

        const beforeSnapshot = this.takeSnapshot();

        // Run the function
        for (let i = 0; i < iterations; i++) {
            await fn();
        }

        const afterSnapshot = this.takeSnapshot();

        // Calculate memory usage
        const heapDiff = afterSnapshot.heapUsed - beforeSnapshot.heapUsed;
        const timeDiff = afterSnapshot.timestamp - beforeSnapshot.timestamp;

        console.log(`   Heap difference: ${(heapDiff / 1024 / 1024).toFixed(2)}MB`);
        console.log(`   Execution time: ${timeDiff.toFixed(2)}ms`);
        console.log(`   Memory/time ratio: ${(heapDiff / timeDiff).toFixed(2)} bytes/ms`);
        console.log(`   Per iteration: ${(heapDiff / iterations / 1024).toFixed(2)}KB`);
    }
}

class StatisticalBenchmarker {
    // Run multiple benchmark iterations with statistics and memory tracking
    async benchmarkWithStats<T>(
        name: string,
        fn: () => T | Promise<T>,
        iterations: number = 100,
        runs: number = 10
    ): Promise<StatisticalResult> {
        console.log(`Running statistical benchmark: ${name}`);
        const runTimes: number[] = [];
        let totalMemoryUsed = 0;

        // Multiple runs for statistical significance
        for (let run = 0; run < runs; run++) {
            // Clean up memory before test
            if (global.gc) {
                global.gc();
            }

            const startMemory = process.memoryUsage().heapUsed;
            const startTime = performance.now();

            for (let i = 0; i < iterations; i++) {
                await fn();
            }

            const endTime = performance.now();
            const endMemory = process.memoryUsage().heapUsed;

            runTimes.push(endTime - startTime);
            totalMemoryUsed += (endMemory - startMemory);
        }

        // Calculate statistics
        const mean = runTimes.reduce((sum, time) => sum + time, 0) / runs;
        const sortedTimes = [...runTimes].sort((a, b) => a - b);
        const median = sortedTimes[Math.floor(runs / 2)] ?? 0;

        const variance = runTimes.reduce((sum, time) =>
            sum + Math.pow(time - mean, 2), 0) / runs;
        const standardDeviation = Math.sqrt(variance);

        const min = Math.min(...runTimes);
        const max = Math.max(...runTimes);
        const avgMemoryUsed = totalMemoryUsed / runs;

        return {
            name,
            executionTime: mean,
            iterationsPerSecond: (iterations / mean) * 1000,
            memoryUsed: avgMemoryUsed,
            runs: runTimes,
            mean,
            median,
            standardDeviation,
            min,
            max
        };
    }

    // Display statistical results
    displayStats(result: StatisticalResult): void {
        console.log(`\nStatistical Results for ${result.name}:`);
        console.log(`   Mean: ${result.mean.toFixed(2)}ms`);
        console.log(`   Median: ${result.median.toFixed(2)}ms`);
        console.log(`   Std Dev: ${result.standardDeviation.toFixed(2)}ms`);
        console.log(`   Min: ${result.min.toFixed(2)}ms`);
        console.log(`   Max: ${result.max.toFixed(2)}ms`);
        console.log(`   Ops/sec: ${result.iterationsPerSecond.toFixed(0)}`);
        if (result.memoryUsed) {
            console.log(`   Avg Memory: ${(result.memoryUsed / 1024 / 1024).toFixed(2)}MB`);
        }
    }

    returnStats(result: StatisticalResult): StatisticalResult {
        return result;
    }
}

// Main benchmark runner for getLabelPoints
async function runGetLabelPointsBenchmark(): Promise<void> {
    console.log('Starting getLabelPoints Performance Benchmark\n');
    console.log('='.repeat(60));

    // Load test data
    const fixturesPath = path.join(__dirname, '../__tests__/fixtures/states.geojson');
    const statesData: FeatureCollection<Polygon | MultiPolygon> = JSON.parse(
        fs.readFileSync(fixturesPath, 'utf-8')
    );

    // Define test parameters
    const labelField = 'NAME';
    const uniqueIdentifierField = 'NAME';
    const southWestCorner = { lat: 25.0, lng: -125.0 };
    const northEastCorner = { lat: 50.0, lng: -65.0 };

    // Create test function
    const testGetLabelPoints = () => {
        return getLabelPoints(
            statesData,
            labelField,
            uniqueIdentifierField,
            southWestCorner,
            northEastCorner
        );
    };

    // Run statistical benchmarks
    const benchmarker = new StatisticalBenchmarker();

    // Warm up (run a few times to stabilize JIT compilation)
    for (let i = 0; i < 5; i++) {
        testGetLabelPoints();
    }

    // Run benchmark with different iteration counts
    console.log('\nRunning benchmarks with varying iteration counts...');

    const result10 = await benchmarker.benchmarkWithStats(
        'getLabelPoints (10 iterations)',
        testGetLabelPoints,
        10,
        5
    );
    benchmarker.displayStats(result10);

    // Memory profiling
    const memoryProfiler = new MemoryProfiler();
    await memoryProfiler.profileMemory(
        'getLabelPoints Memory Profile',
        testGetLabelPoints,
        10
    );

    let errors = {}
    console.log('\nComparing against baseline metrics...');
    if (result10.mean > baselineMetrics.meanResponseTimeMs) {
        errors = { ...errors, meanResponseTime: `Mean response time ${result10.mean.toFixed(2)}ms exceeds baseline of ${baselineMetrics.meanResponseTimeMs}ms` };
    }
    if (result10.median > baselineMetrics.medianResponseTimeMs) {
        errors = { ...errors, medianResponseTime: `Median response time ${result10.median.toFixed(2)}ms exceeds baseline of ${baselineMetrics.medianResponseTimeMs}ms` };
    }
    if ((result10.memoryUsed! / 1024 / 1024) > baselineMetrics.averageMemoryUsageMB) {
        errors = { ...errors, averageMemoryUsage: `Average memory usage ${(result10.memoryUsed! / 1024 / 1024).toFixed(2)}MB exceeds baseline of ${baselineMetrics.averageMemoryUsageMB}MB` };
    }

    if (Object.keys(errors).length > 0) {
        console.error('Benchmark failed against baseline metrics:');
        for (const [, message] of Object.entries(errors)) {
            console.error(` - ${message}`);
        }
        throw new Error('Benchmark did not meet baseline performance metrics.');
    }


    // Final summary
    console.log('\n' + '='.repeat(60));
    console.log('Benchmark Complete!');
    console.log('='.repeat(60));

}

// Run the benchmark if this file is executed directly
// Check if this module is being run directly (ESM compatible)
const isMainModule = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];

if (isMainModule) {
    runGetLabelPointsBenchmark()
        .then(() => {
            console.log('\nBenchmark finished successfully!');
            process.exit(0);
        })
        .catch((error) => {
            console.error('Benchmark failed:', error);
            process.exit(1);
        });
}

export { StatisticalBenchmarker, MemoryProfiler, runGetLabelPointsBenchmark };