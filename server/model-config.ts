import { ensure } from './errors.js';
export function modelConfig(env: NodeJS.ProcessEnv): {
  provider: 'openai' | 'groq';
  apiKey: string;
  model: string;
} {
  const provider = env.LLM_PROVIDER || 'openai';
  ensure(
    provider === 'openai' || provider === 'groq',
    500,
    'MODEL_PROVIDER',
    'LLM_PROVIDER must be openai or groq.',
  );
  return {
    provider,
    apiKey: provider === 'groq' ? env.GROQ_API_KEY || '' : env.OPENAI_API_KEY || '',
    model:
      env.LLM_MODEL ||
      (provider === 'groq'
        ? env.GROQ_MODEL || 'openai/gpt-oss-20b'
        : env.OPENAI_MODEL || 'gpt-4.1-mini'),
  };
}
