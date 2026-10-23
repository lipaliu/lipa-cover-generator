// Admin-only connectivity checks: no generation, credentials, prompts or response bodies.
export function networkErrorCode(error) {
  for (const candidate of [error?.cause?.code, error?.code, error?.cause?.name, error?.name]) {
    if (typeof candidate === 'string' && /^[A-Za-z0-9_]{1,80}$/.test(candidate)) return candidate;
  }
  return 'NETWORK_ERROR';
}

export async function probeProvider(baseUrl, fetchImpl = fetch) {
  let url;
  try {
    url = new URL(`${String(baseUrl).replace(/\/$/, '')}/models`);
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) throw new Error();
  } catch { return { ok: false, code: 'INVALID_BASE_URL' }; }
  try {
    const response = await fetchImpl(url, { signal: AbortSignal.timeout(10000), redirect: 'error' });
    await response.body?.cancel();
    return { host: url.hostname, connected: true, http: response.status };
  } catch (error) {
    return { host: url.hostname, connected: false, code: networkErrorCode(error) };
  }
}
