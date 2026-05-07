# StickerFoundry Features To Add

This backlog intentionally contains only work that is not implemented yet or cannot be validated in the current environment.

## Next: Real WhatsApp Validation

- Validate import on a physical Android phone with current WhatsApp.
- Validate import on WhatsApp Business.
- Compare provider columns and URI behavior against WhatsApp's official Android sample.
- Document tested Android/WhatsApp versions.
- Add fixes for any provider compatibility issues discovered during real-device testing.

## Sticker Editing

- Add first-party ONNX model packaging/profile docs after choosing the default model and runtime image.

## Deployment And Ops

- Validate `docker compose up -d --build` on a host with Docker installed. Docker is not available in the current local environment.

## Release And Quality

- Finalize Android package identity before publishing signed release APKs. Signing scaffolding exists, but the starter `applicationId` must be replaced first.
