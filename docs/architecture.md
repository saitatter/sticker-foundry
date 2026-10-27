# Architecture

Flutter owns all screens and image editing. Android has a Kotlin platform bridge and WhatsApp content provider. The original logo is shared across targets.

FastAPI exposes `/api` with bearer access tokens and rotating, hashed refresh sessions. The first registered user becomes administrator. PostgreSQL stores accounts, teams, packs, stickers, reviews, comments, invitations, audit records and durable jobs. SQLAlchemy defines a fresh baseline initialized by `python -m foundry.db_init`. Unrelated schemas are refused. Development tooling must never change production data or backups.

Pillow, NumPy and SciPy validate and process images. Stickers are 512 x 512 WebP, limited to 100 KB static or 500 KB animated; tray icons are 96 x 96 WebP up to 50 KB. Resource limits apply before decoding or background removal. Optional rembg has a timeout and threshold fallback.

Redis supplies rate limits, Celery delivery and worker heartbeats. Media, export and email have separate workers. Job execution tokens and leases prevent cancelled or recovered attempts from committing stale results. Recovery republishes interrupted jobs. `/api/health` checks the database; `/api/health/ready` also requires Redis and all three queues. `/api/metrics` and `/api/health/metrics` expose operational metrics.

Disk or S3 holds immutable media objects. Commits publish new references; rollback removes staged files and successful commits retire replaced files. All request transactions finish before response headers are sent, so success means committed data; streaming polls use separate sessions. Logical export filenames remain stable. Pack versions and content hashes invalidate downloads and cached ZIPs. Every server operation checks permissions, including public approval filtering.

Offline downloads are scoped by server and account, published atomically and pruned on sign-out or lost access. Android reads only the current cache. There are no old session imports, API aliases or schema adapters.
