# StickerFoundry Features To Add

This backlog intentionally contains only work that is not implemented yet or cannot be validated in the current environment.

## Next: Real WhatsApp Validation

- Validate import on a physical Android phone with current WhatsApp.
- Validate import on WhatsApp Business.
- Compare provider columns and URI behavior against WhatsApp's official Android sample.
- Document tested Android/WhatsApp versions.
- Add fixes for any provider compatibility issues discovered during real-device testing.

## Sticker Editing / AI

- Choose and package a first-party ONNX background-removal model/runtime for turnkey self-hosted AI mode.
- Add admin/web status for whether `BACKGROUND_REMOVAL_COMMAND` or the packaged AI runtime is available.
- Add Android parity for the advanced web editor tools that are currently web-only.

## Deployment And Ops

- Validate `docker compose up -d --build` on a host with Docker installed. Docker is not available in the current local environment.

## Release And Quality

- Finalize Android package identity before publishing signed release APKs. Signing scaffolding exists, but the starter `applicationId` must be replaced first.
- Add more focused web editor tests for brush, compare, optimizer, server background removal options, and animated option submission.
