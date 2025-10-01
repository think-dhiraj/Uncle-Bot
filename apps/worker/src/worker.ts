import { Worker } from '@temporalio/worker';
import * as activities from './activities';
import { config } from './config';

async function run() {
  console.log('🚀 Starting Temporal Worker...');

  const worker = await Worker.create({
    workflowsPath: require.resolve('./workflows'),
    activities,
    taskQueue: config.temporal.taskQueue,
    namespace: config.temporal.namespace,
  });

  console.log(`✅ Worker connected to Temporal at ${config.temporal.address}`);
  console.log(`📋 Task Queue: ${config.temporal.taskQueue}`);
  console.log(`🏷️  Namespace: ${config.temporal.namespace}`);

  await worker.run();
}

run().catch((err) => {
  console.error('❌ Worker failed to start:', err);
  process.exit(1);
});
