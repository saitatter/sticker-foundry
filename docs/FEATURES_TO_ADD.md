# StickerFoundry Features To Add

This backlog intentionally contains only work that is not implemented yet or cannot be validated in the current environment.

## Next: Real WhatsApp Validation

- Validate import on a physical Android phone with current WhatsApp.
- Validate import on WhatsApp Business.
- Compare provider columns and URI behavior against WhatsApp's official Android sample.
- Document tested Android/WhatsApp versions.
- Add fixes for any provider compatibility issues discovered during real-device testing.
- Fill out the validation report in [WHATSAPP_VALIDATION.md](WHATSAPP_VALIDATION.md).

## Sticker Editing / AI

- Choose and package a first-party ONNX background-removal model/runtime for turnkey self-hosted AI mode.
- Add Android parity for the advanced web editor tools that are currently web-only.

## Deployment And Ops

- Validate `docker compose up -d --build` on a host with Docker installed. Docker is not available in the current local environment.
- Fill out the checklist in [DOCKER_VALIDATION.md](DOCKER_VALIDATION.md).

## Release And Quality

- Configure Android signing secrets in CI and test a signed release APK on a physical device.
