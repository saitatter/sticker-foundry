# StickerFoundry Features To Add

This is the live feature backlog. It should only contain work that still needs to be built or validated.

## Next: Real WhatsApp Validation

- Validate import on a physical Android phone with current WhatsApp.
- Validate import on WhatsApp Business.
- Compare provider columns and URI behavior against WhatsApp's official Android sample.
- Document tested Android/WhatsApp versions.
- Add fixes for any provider compatibility issues discovered during real-device testing.

## Sync And Reliability

- Better conflict handling when the same pack is edited from web and Android.

## Deployment And Ops

- Validate `docker compose up -d --build` on a host with Docker installed.
- Container healthcheck for web.
- Backup verification script for PostgreSQL and `/data`.
- Metrics format option for Prometheus.
- HTTPS-first production checklist.
- Unraid template notes for web + backend + PostgreSQL volumes.

## Release And Quality

- Web lint and format scripts.
- Release notes polish with screenshots or APK install notes.
- Signed Android release builds later, once package identity is finalized.
