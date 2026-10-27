# WhatsApp validation

Use a physical Android device with USB debugging enabled and a current WhatsApp installation. Install the current APK and log in to an isolated test server. Forward its port with `adb reverse` when using localhost. Sync one static and one animated pack with at least three exportable stickers each.

For each pack, open its workspace, choose WhatsApp, confirm the import prompt, and verify the pack appears in the sticker picker. Animated previews must play. Repeat with WhatsApp Business if that target is installed. Sending a message requires the user's explicit instruction and a designated test conversation.

Check provider paths `metadata`, `stickers/<pack_id>` and `stickers_asset/<pack_id>/<file_name>` for permission, column and MIME errors. Keep the application ID `com.stickerfoundry.app` and authority `com.stickerfoundry.app.stickercontentprovider` stable.

Verify edits update downloaded packs, offline imports work, account switches hide private downloads, and revoked access removes cached packs after reconnecting. Check signed release installation separately from debug builds, using the same signing key for updates.

Store temporary screenshots and logs under ignored `test-results/`; keep verification results with the relevant change instead of creating dated reports.
