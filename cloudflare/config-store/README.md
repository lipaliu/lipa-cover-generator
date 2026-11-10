# BAKABAKA configuration persistence

Dedicated Cloudflare Worker + SQLite-backed Durable Object. Stores only an AES-GCM encrypted profile envelope and an optimistic concurrency revision. No expiration, and Render deployments do not affect it. No public read, no delete endpoint, no request logging.

Production Render is identified by RENDER_EXTERNAL_URL=https://bakabaka.onrender.com; other installations must explicitly set PROVIDER_CONFIG_STORE_URL. Remote authentication uses a purpose-specific SHA-256 derivation of the existing ACCESS_PASSWORD, not the password itself. The Worker secret AUTH_HASH contains the SHA-256 of that token. Optional PROVIDER_CONFIG_STORE_TOKEN overrides this derivation. If the admin password is rotated, update AUTH_HASH and re-encrypt the configuration using the new encryption secret; preserve PROVIDER_CONFIG_SECRET for independent encryption-key rotation.

Deploy with `wrangler deploy --config cloudflare/config-store/wrangler.jsonc`. Keep the same Worker, Durable Object binding/name and migration. Do not delete the namespace. Never commit credentials or decrypted profiles. When moving from disk, copy `/admin/providers/backup` through the authenticated endpoint with revision 0 before deploying the backend. Do not overwrite existing remote data; conflicts return 409. Existing deployment migration is complete.

Rendering and generation are blocked from using fallback credentials when remote profiles cannot be loaded. Backups remain available from the admin console. This storage scope is API/model profiles and the default engine, not user accounts or cover history.
