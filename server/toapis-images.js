// ToAPIs ordinary Sunburst uses one asynchronous task for both text and reference images.
// Docs: https://docs.toapis.cn/docs/cn/api-reference/images/gpt-image-2.5/generation
export function usesToapisImageTasks(baseURL, model) {
  try {
    const url = new URL(baseURL);
    return url.protocol === 'https:' && url.hostname === 'toapis.cn' &&
      model === 'gpt-image-2.5-sunburst';
  } catch { return false; }
}

export async function generateToapisImage(client, {
  model, prompt, ratio, images = [], moderation, timeoutMs = 170000,
}, {
  now = Date.now,
  sleep = ms => new Promise(resolve => setTimeout(resolve, ms)),
  pollIntervalMs = () => 5000 + Math.floor(Math.random() * 1000),
  onTask = task => console.info('[Image2 task]', JSON.stringify(task)),
} = {}) {
  const deadline = now() + timeoutMs;
  let taskId;
  const options = () => {
    const remaining = deadline - now();
    if (remaining <= 0) throw new Error('Image2 task polling timeout; task may still be running.');
    return { timeout: Math.min(30000, remaining), maxRetries: 0 };
  };
  try {
    const referenceImages = [];
    for (const image of images) {
      const form = new FormData();
      form.append('file', image);
      const upload = await client.post('/uploads/images', { ...options(), body: form });
      if (!upload?.success || !upload.data?.url) throw new Error('Image2 reference image upload failed.');
      if (new URL(upload.data.url).protocol !== 'https:') throw new Error('Image2 reference image URL is not HTTPS.');
      referenceImages.push(upload.data.url);
    }
    let task = await client.images.generate({
      model, prompt, size: ratio === 'bilibili-safe' ? '16:9' : ratio,
      quality: 'high', resolution: '1K', n: 1,
      ...(moderation ? { moderation } : {}),
      ...(referenceImages.length ? { reference_images: referenceImages } : {}),
    }, options());
    // Accept synchronous compatible responses too, without ever submitting a second request.
    if (task.data?.[0]?.url || task.data?.[0]?.b64_json) return task;
    taskId = task.id;
    if (typeof taskId !== 'string' || !/^[A-Za-z0-9_-]{1,200}$/.test(taskId)) {
      taskId = undefined;
      throw new Error('Image2 provider returned neither an image nor a valid task ID.');
    }
    onTask({ id: taskId, model, status: task.status });
    while (true) {
      if (task.status === 'completed') {
        if (!task.result?.data?.[0]?.url && !task.result?.data?.[0]?.b64_json) {
          throw new Error('Image2 completed task returned no image.');
        }
        onTask({ id: taskId, model, status: task.status, billing: task.billing });
        return { ...task, data: task.result.data, quality: 'high' };
      }
      if (task.status === 'failed') {
        const detail = String(task.error?.message || 'provider generation failed')
          .replace(/sk-[\w-]+/g, '[REDACTED]').slice(0, 250);
        throw new Error(`Image2 task failed: ${detail}`);
      }
      if (!['pending', 'queued', 'in_progress'].includes(task.status)) {
        throw new Error('Image2 provider returned an unknown task status.');
      }
      await sleep(Math.min(pollIntervalMs(), Math.max(0, deadline - now())));
      const requestOptions = options();
      try {
        // Always use the configured client origin; never follow a URL in a task response.
        task = await client.get(`/images/generations/${taskId}`, requestOptions);
      } catch (error) {
        // Read-only queries may retry the SAME task, but creation must never retry.
        if (error.status === 429 || error.status >= 500 || !error.status) continue;
        throw error;
      }
    }
  } catch (error) {
    const failure = new Error(`${String(error?.message || error)}${taskId ? ` (task: ${taskId})` : ''}`);
    failure.noRetry = true;
    failure.taskId = taskId;
    throw failure;
  }
}
