import dotenv from 'dotenv';

dotenv.config();

export const config = {
  temporal: {
    address: process.env.TEMPORAL_ADDRESS || 'localhost:7233',
    namespace: process.env.TEMPORAL_NAMESPACE || 'default',
    taskQueue: process.env.TEMPORAL_TASK_QUEUE || 'ai-assistant',
  },
  database: {
    url: process.env.DATABASE_URL || 'postgresql://localhost:5432/ai_assistant',
  },
  google: {
    projectId: process.env.GOOGLE_CLOUD_PROJECT || '',
  },
  kms: {
    keyRing: process.env.KMS_KEY_RING || '',
    keyId: process.env.KMS_KEY_ID || '',
    location: process.env.KMS_LOCATION || 'global',
  },
  gemini: {
    model: process.env.GEMINI_MODEL || 'gemini-1.5-pro',
    location: process.env.GEMINI_LOCATION || 'us-central1',
  },
};
