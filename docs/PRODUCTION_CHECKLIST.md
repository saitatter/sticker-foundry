# Production checklist

- Fresh database and storage, unique secrets, HTTPS and explicit CORS origins.
- Register the initial administrator first; configure registration policy.
- Persist and back up PostgreSQL, Redis and media. Test restoration separately.
- Confirm `/api/health/ready` sees Redis and media/export/email workers.
- Configure SMTP and verify password-reset delivery.
- Set quotas, audit retention and image bounds for available resources.
- Verify private packs, approval filtering, collaboration, sync and exports with test accounts.
- Validate static and animated WhatsApp imports on a physical Android device.
- Pin the API and all workers to the same release.
- Publish through the Release workflow after checks; document breaking installation requirements.
