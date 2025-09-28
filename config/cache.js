// config/cache.js (CJS)
// Tiny wrapper around Memcached (ElastiCache) using memjs.

const SERVERS = process.env.MEMCACHE_SERVERS || ""; // e.g. "mycluster.cfg.ap-southeast-2.cache.amazonaws.com:11211"
const ENABLED = Boolean(SERVERS);

let client = null;
if (ENABLED) {
  const memjs = require("memjs");
  client = memjs.Client.create(SERVERS, {
    // sensible timeouts for API usage
    timeout: 200,       // ms per op
    keepAlive: true,
    retries: 1,
  });
  console.log(`[cache] Memcached client enabled → ${SERVERS}`);
} else {
  console.warn("[cache] MEMCACHE_SERVERS not set → caching disabled");
}

const cacheEnabled = () => ENABLED;

async function cacheGet(key) {
  if (!ENABLED) return null;
  const { value } = await client.get(key);
  if (!value) return null;
  try { return JSON.parse(value.toString()); } catch { return null; }
}

async function cacheSet(key, obj, ttlSeconds) {
  if (!ENABLED) return;
  const buf = Buffer.from(JSON.stringify(obj));
  await client.set(key, buf, { expires: ttlSeconds || 60 });
}

async function cacheDel(key) {
  if (!ENABLED) return;
  try { await client.delete(key); } catch { /* ignore */ }
}

module.exports = {
  cacheEnabled,
  cacheGet,
  cacheSet,
  cacheDel,
};
