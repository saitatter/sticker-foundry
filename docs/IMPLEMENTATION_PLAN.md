# Implementation plan

The current release gates and migration gaps are tracked in [Migration audit](MIGRATION_AUDIT.md). This replaces the earlier plan, which described the archived React/Compose clients and listed several completed features as pending.

Work in this order:

1. Complete the dependency/security review and server regression gates.
2. Restore the missing client parity items and cover them with real API tests.
3. Run platform CI, signed Android upgrade/import tests, and WhatsApp Business acceptance.
4. Package desktop distributions, validate a clean Docker deployment and backup restore, then publish a coordinated release.
5. Remove `legacy` after the parity evidence has been captured.

The server stays the source of truth. Flutter owns the active UI; Android retains the WhatsApp provider identity and cache protocol. Keep static and animated packs separate.
