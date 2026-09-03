// Secrets are resolved only from the process environment. Persisting API keys
// in the application database makes backups and admin-data exports sensitive
// and bypasses the deployment platform's secret-management controls.

const envKey = () => {
  const key = process.env.GEMINI_API_KEY;
  return key && key !== 'your_api_key_here' ? key : null;
};

export function makeGeminiKeyResolver() {
  return async function getGeminiKey() {
    const env = envKey();
    return env
      ? { value: env, source: 'env' }
      : { value: null, source: 'none' };
  };
}
