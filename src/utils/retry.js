/**
 * Simple retry helper with exponential backoff for async functions.
 * fn: async function returning a value
 * opts: { retries, minDelay }
 */
async function withRetry(fn, opts = {}) {
  const retries = typeof opts.retries === "number" ? opts.retries : 3;
  const minDelay = typeof opts.minDelay === "number" ? opts.minDelay : 250;
  let attempt = 0;
  while (true) {
    try {
      return await fn();
    } catch (err) {
      attempt++;
      if (attempt > retries) throw err;
      const delay = Math.round(minDelay * Math.pow(2, attempt - 1));
      await new Promise((res) => setTimeout(res, delay));
    }
  }
}

module.exports = { withRetry };
