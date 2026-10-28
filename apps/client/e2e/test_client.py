import re
from pathlib import Path

from playwright.sync_api import Page, expect

EMAIL = "artist@example.test"
ROOT = Path(__file__).resolve().parents[3]


def accessible(page: Page):
    page.goto("/")
    page.locator("flt-semantics-placeholder").evaluate("element => element.click()")
    expect(page.get_by_role("button", name="Sign in", exact=True)).to_be_visible()
    expect(page.get_by_role("img", name="Sticker Foundry logo", exact=True)).to_be_visible()


def fill(page: Page, label: str, value: str):
    field = page.get_by_role("textbox", name=label, exact=True)
    field.click()
    # Flutter applies focus and selection on the next frame.
    page.wait_for_timeout(250)
    field.press("ControlOrMeta+A")
    field.press_sequentially(value, delay=20)
    field.press("Tab")


def sign_in(page: Page):
    accessible(page)
    fill(page, "Email", EMAIL)
    fill(page, "Password", "correct-password")
    page.get_by_role("button", name="Sign in", exact=True).click()
    expect(page.get_by_text("Your library", exact=True)).to_be_visible()


def test_sign_in_create_and_rename_pack(page: Page):
    sign_in(page)
    expect(page.get_by_role("button", name=re.compile("Little moments"))).to_be_visible()
    page.get_by_role("button", name="Create pack", exact=True).click()
    fill(page, "Name", "New collection")
    fill(page, "Publisher", "Artist")
    page.get_by_role("button", name="Save", exact=True).click()
    expect(page.get_by_text("New collection", exact=True)).to_be_visible()
    page.get_by_role("button", name="Pack actions", exact=True).click()
    page.get_by_role("menuitem", name="Pack settings", exact=True).click()
    expect(page).to_have_url(re.compile(r"app/packs/new-pack/settings"))
    fill(page, "Name", "Renamed collection")
    page.get_by_role("button", name="Save changes", exact=True).click()
    expect(page.get_by_text("Renamed collection", exact=True)).to_be_visible()


def test_public_discovery_at_phone_width(page: Page):
    page.set_viewport_size({"width": 390, "height": 844})
    accessible(page)
    page.get_by_role("button", name="Explore public packs", exact=True).click()
    page.get_by_role("button", name=re.compile("Little moments")).click()
    page.get_by_role("button", name="Back", exact=True).click()
    expect(page).to_have_url(re.compile(r"/discover$"))
    expect(page.get_by_role("button", name=re.compile("Little moments"))).to_be_visible()
    page.get_by_role("button", name=re.compile("Little moments")).click()
    page.get_by_role("button", name="Pack actions", exact=True).click()
    expect(page.get_by_role("menuitem", name="Export ZIP", exact=True)).to_be_visible()
    expect(page.get_by_role("menuitem", name="Delete pack", exact=True)).to_have_count(0)


def test_settings_lists_render_and_activity_can_refresh(page: Page):
    sign_in(page)
    page.get_by_role("button", name="Settings Tab 3 of 3", exact=True).click()
    page.get_by_role("button", name=re.compile(r"^Teams ")).click()
    expect(page.get_by_role("button", name="Create team", exact=True)).to_be_visible()
    expect(page.get_by_text("Nothing here yet", exact=True)).to_be_visible()
    page.get_by_role("button", name="Account settings", exact=True).click()
    page.get_by_role("button", name="Active sessions", exact=True).click()
    expect(page.get_by_role("button", name="Revoke all sessions", exact=True)).to_be_visible()
    page.get_by_role("button", name="Library Tab 1 of 3", exact=True).click()
    page.get_by_role("button", name=re.compile("Little moments")).click()
    page.get_by_role("button", name="Activity", exact=True).click()
    page.get_by_role("button", name="Refresh activity", exact=True).click()
    expect(page.get_by_role("group", name=re.compile("Page 1 of 2"))).to_be_visible()


def test_invalid_credentials_keep_form_usable(page: Page):
    page.route(
        "**/api/auth/login",
        lambda route: route.fulfill(status=401, json={"message": "Invalid email or password"}),
    )
    accessible(page)
    fill(page, "Email", EMAIL)
    fill(page, "Password", "wrong-password")
    page.get_by_role("button", name="Sign in", exact=True).click()
    expect(page.get_by_text("Invalid email or password", exact=True)).to_be_visible()
    expect(page.get_by_role("textbox", name="Email", exact=True)).to_be_visible()


def test_deep_links_refresh_and_history(page: Page):
    sign_in(page)
    page.get_by_role("button", name=re.compile("Little moments")).click()
    expect(page).to_have_url(re.compile(r"app/packs/pack/stickers"))
    page.get_by_role("button", name="Activity", exact=True).click()
    expect(page).to_have_url(re.compile(r"/activity$"))
    # Firefox automation reload adds history; exercise the browser's native reload.
    with page.expect_event("domcontentloaded"):
        page.evaluate("() => location.reload()")
    page.locator("flt-semantics-placeholder").evaluate("element => element.click()")
    expect(page.get_by_role("group", name=re.compile("Page 1 of 2"))).to_be_visible()
    expect(page.get_by_role("textbox", name="Password", exact=True)).to_have_count(0)
    page.go_back()
    expect(page).to_have_url(re.compile(r"/stickers$"))
    expect(page.get_by_role("checkbox", name="Select sticker 1")).to_be_visible()
    page.go_forward()
    expect(page.get_by_role("group", name=re.compile("Page 1 of 2"))).to_be_visible()


def test_keyboard_range_and_bulk_review(page: Page):
    sign_in(page)
    page.get_by_role("button", name=re.compile("Little moments")).click()
    page.get_by_role("checkbox", name="Select sticker 1").click()
    page.keyboard.down("Shift")
    page.get_by_role("checkbox", name="Select sticker 3").click()
    page.keyboard.up("Shift")
    expect(page.get_by_role("checkbox", checked=True)).to_have_count(3)
    updates = []
    page.on(
        "request",
        lambda request: (
            updates.append(request.post_data_json["reviewStatus"])
            if request.method == "PATCH" and "/stickers/s" in request.url
            else None
        ),
    )
    page.keyboard.press("n")
    expect(page.get_by_role("group", name=re.compile(r"^Selected stickers updated "))).to_be_visible()
    assert updates == ["NEEDS_WORK"] * 3
    expect(page.get_by_role("button", name="Add stickers", exact=True)).to_be_enabled()
    page.get_by_role("group", name=re.compile(r"^Selected stickers updated ")).press("Escape")
    expect(page.get_by_role("checkbox", checked=True)).to_have_count(0)


def test_activity_pagination(page: Page):
    sign_in(page)
    page.get_by_role("button", name=re.compile("Little moments")).click()
    page.get_by_role("button", name="Activity", exact=True).click()
    expect(page.get_by_role("group", name=re.compile("Page 1 of 2"))).to_be_visible()
    page.get_by_role("button", name="Next page", exact=True).click()
    expect(page.get_by_role("button", name=re.compile(r"^Event 10 "))).to_be_visible()
    page.get_by_role("button", name="10 per page", exact=True).click()
    page.get_by_role("menuitem", name="25 per page", exact=True).click()
    expect(page.get_by_role("group", name=re.compile("Page 1 of 1"))).to_be_visible()


def test_admin_route_and_public_password_reset(page: Page):
    sign_in(page)
    page.goto("/app/settings/instance")
    page.locator("flt-semantics-placeholder").evaluate("element => element.click()")
    expect(page.get_by_role("textbox", name="Instance name", exact=True)).to_be_visible()
    expect(page.get_by_role("button", name="Save settings", exact=True)).to_be_visible()
    page.goto("/reset-password?token=reset-fixture")
    page.locator("flt-semantics-placeholder").evaluate("element => element.click()")
    expect(page.get_by_role("textbox", name="New password", exact=True)).to_be_visible()
    fill(page, "New password", "replacement-password")
    fill(page, "Confirm password", "different-password")
    page.get_by_role("button", name="Reset password", exact=True).click()
    expect(page.locator("flt-semantics span").filter(has_text=re.compile(r"^Passwords do not match$"))).to_be_visible()
    page.route(
        "**/api/auth/password/reset/confirm",
        lambda route: route.fulfill(
            status=400, json={"message": "Password reset token is invalid or expired"}
        ),
    )
    fill(page, "Confirm password", "replacement-password")
    page.get_by_role("button", name="Reset password", exact=True).click()
    expect(page.get_by_text("Password reset token is invalid or expired", exact=True)).to_be_visible()
    expect(page).to_have_url(re.compile(r"reset-password\?token=reset-fixture$"))


def test_one_save_persists_metadata_and_pending_tray(page: Page):
    sign_in(page)
    page.get_by_role("button", name=re.compile("Little moments")).click()
    page.get_by_role("button", name="Settings", exact=True).click()
    fill(page, "Name", "Saved together")
    writes = []

    def record(request):
        if request.method in {"PATCH", "POST"} and "/packs/pack" in request.url:
            from urllib.parse import urlsplit

            writes.append(
                {
                    "path": urlsplit(request.url).path,
                    "version": request.headers.get("if-match"),
                }
            )

    page.on("request", record)
    with page.expect_file_chooser() as chooser:
        page.get_by_role("button", name="Change tray icon", exact=True).click()
    chooser.value.set_files(ROOT / "assets/brand/sticker-foundry-icon.png")
    page.get_by_role("button", name="Use image", exact=True).click()
    expect(page.get_by_role("button", name="Discard pending tray icon", exact=True)).to_be_visible()
    assert writes == []
    page.get_by_role("button", name="Save changes", exact=True).click()
    expect(page.get_by_role("button", name="Discard pending tray icon", exact=True)).to_have_count(0)
    assert len(writes) == 2
    assert writes[0]["path"] == "/api/packs/pack"
    assert writes[1] == {"path": "/api/packs/pack/tray-icon", "version": "1"}
