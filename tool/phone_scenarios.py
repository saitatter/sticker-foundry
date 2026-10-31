"""Reusable physical-phone flows; runtime names and credentials stay outside Git."""


def tap(label, *, instance=None, contains=False, button=False):
    selector = {"descriptionContains" if contains else "label": label}
    if instance is not None or button:
        selector = {"descriptionContains" if contains else "description": label}
        if instance is not None:
            selector["instance"] = instance
        if button:
            selector["className"] = "android.widget.Button"
    return {"action": "tap", "selector": selector, "timeout": 30}


def field(index, *, value=None, env=None):
    return {
        "action": "input",
        "selector": {"className": "android.widget.EditText", "instance": index},
        **({"env": env} if env else {"value": value}),
    }


def check(label, *, contains=False, absent=False, instance=None):
    selector = {"descriptionContains" if contains else "label": label}
    if instance is not None:
        selector["instance"] = instance
    return {"action": "absent" if absent else "assert", "selector": selector, "timeout": 120}


BACK = {"action": "press", "key": "back"}
TOOLS_END = {"action": "swipe", "start": [0.9, 0.92], "end": [0.15, 0.92]}


def nav(name):
    return tap(f"{name}\nTab", contains=True)


def card(name):
    return tap(name + "\n", contains=True)


def count(value):
    return check(f"{value}/30 stickers", contains=True)


def create(name, *, animated=False):
    return [
        tap("Create pack", instance=0, button=True),
        field(0, value=name),
        field(1, value="Phone QA"),
        BACK,
        *([tap("Animated stickers")] if animated else []),
        tap("Save"),
        check(name),
    ]


def choose_files(names, picker):
    def file(name):
        return {"descriptionContains": name + ",", "className": "android.widget.LinearLayout"}

    return [
        tap("Add stickers"),
        tap("Show roots"),
        tap("Downloads"),
        {"action": "tap", "selector": {"text": "Foundry-QA"}, "timeout": 30},
        {"action": "long-tap" if len(names) > 1 else "tap", "selector": file(names[0]), "timeout": 30},
        *[{"action": "tap", "selector": file(name), "timeout": 30} for name in names[1:]],
        *(
            [{"action": "tap", "selector": {"resourceId": f"{picker}:id/action_menu_select"}}]
            if len(names) > 1
            else []
        ),
        check("Edit sticker"),
    ]


def text_layer(text):
    return [tap("Text", button=True), field(0, value=text), tap("Apply")]


def scenarios(names, picker, *, initial_dark=False):
    static, animated, target = names["static"], names["animated"], names["target"]
    clone = animated + " Copy"
    result = []

    def add(name, covers, steps):
        result.append((name, {"version": 1, "covers": covers, "steps": steps}))

    add(
        "01-login",
        ["auth.login"],
        [
            {"action": "launch", "restart": True},
            check("Sign in"),
            field(0, env="QA_EMAIL"),
            field(1, env="QA_PASSWORD"),
            BACK,
            tap("Sign in"),
            check("Your library"),
        ],
    )
    add("02-create-static", ["library.create"], create(static))
    add(
        "03-static-editor",
        ["media.upload", "editor.crop", "editor.text", "editor.undo-redo"],
        [
            *choose_files(["foundry-qa-1.png"], picker),
            tap("Crop", button=True),
            tap("Rotate right"),
            tap("Undo"),
            tap("Redo"),
            *text_layer("SMOKE"),
            tap("Use image"),
            count(1),
        ],
    )
    add(
        "04-static-batch",
        ["media.bulk-upload", "editor.batch"],
        [
            *choose_files(["foundry-qa-2.png", "foundry-qa-3.png"], picker),
            tap("Apply these edits to all selected images"),
            tap("Use image"),
            count(3),
        ],
    )
    add(
        "05-metadata",
        ["editor.metadata", "editor.metadata-clear"],
        [
            tap("Sticker actions", instance=0, button=True),
            tap("Edit image"),
            TOOLS_END,
            tap("Sticker details", button=True),
            field(0, env="QA_EMOJI"),
            field(1, value="QA smoke caption"),
            BACK,
            tap("Use image"),
            check(static),
            tap("Sticker actions", instance=0, button=True),
            tap("Edit image"),
            TOOLS_END,
            tap("Sticker details", button=True),
            {
                "action": "assert",
                "selector": {"text": "QA smoke caption", "className": "android.widget.EditText"},
            },
            field(1, value=""),
            BACK,
            tap("Use image"),
            check(static),
        ],
    )
    add(
        "06-review-policy",
        ["media.bulk-review", "export.approval"],
        [
            tap("Select sticker 1"),
            tap("Select sticker 2"),
            tap("Bulk actions"),
            tap("Approve selected"),
            check("APPROVED", contains=True, instance=0),
            tap("Clear selection"),
            tap("Overview"),
            check("2 approved"),
            tap("Settings", button=True),
            tap("Require approval before export"),
            tap("Public pack"),
            tap("Save changes"),
            check("Pack settings saved", contains=True),
            tap("Dismiss"),
            tap("Overview"),
            check("Export needs at least 3 eligible stickers", contains=True),
            tap("Pack actions"),
            check("Export ZIP", absent=True),
            BACK,
            tap("Stickers", button=True),
            tap("Select sticker 3"),
            tap("Bulk actions"),
            tap("Approve selected"),
            check("APPROVED", contains=True, instance=0),
            tap("Clear selection"),
            tap("Overview"),
            check("3 approved"),
            check("Ready to export", contains=True),
        ],
    )
    add(
        "07-activity-export",
        ["library.activity", "export.manifest", "export.zip"],
        [
            tap("Activity", button=True),
            tap("Sticker updated\n", contains=True, instance=0),
            check('"before":', contains=True),
            tap("Sticker updated\n", contains=True, instance=0),
            check('"before":', contains=True, absent=True),
            tap("Pack actions"),
            tap("Preview export manifest"),
            check("Export manifest"),
            check('"animated_sticker_pack": false', contains=True),
            tap("Close"),
            tap("Pack actions"),
            tap("Export ZIP"),
            {"action": "tap", "selector": {"resourceId": "android:id/button1"}, "timeout": 60},
            check(static),
        ],
    )
    add(
        "08-public-navigation",
        ["library.public", "library.public-navigation"],
        [
            tap("Back"),
            nav("Discover"),
            card(static),
            check("Add stickers", absent=True),
            tap("Back"),
            check("Discover\nTab", contains=True),
            nav("Library"),
        ],
    )
    add("09-create-animation", ["library.create-animated"], create(animated, animated=True))
    add(
        "10-animation-editor",
        ["animation.preview", "media.animated-upload"],
        [
            *choose_files(["foundry-qa-animated-1.gif"], picker),
            TOOLS_END,
            tap("Animation", button=True),
            tap("Play animation"),
            check("Pause animation"),
            tap("Pause animation"),
            check("Play animation"),
            tap("Use image"),
            count(1),
        ],
    )
    add(
        "11-animation-batch",
        ["media.animated-bulk"],
        [
            *choose_files(["foundry-qa-animated-2.gif", "foundry-qa-animated-3.gif"], picker),
            tap("Apply these edits to all selected images"),
            tap("Use image"),
            count(3),
        ],
    )
    add("12-clone", ["library.clone"], [tap("Pack actions"), tap("Clone pack"), check(clone), count(3)])
    add(
        "13-transfer-target",
        ["library.create-target", "library.rename"],
        [
            tap("Back"),
            *create(target, animated=True),
            tap("Settings", button=True),
            field(0, value=target + " renamed"),
            BACK,
            tap("Save changes"),
            check(target + " renamed"),
            field(0, value=target),
            BACK,
            tap("Save changes"),
            check(target),
            tap("Back"),
            card(clone),
        ],
    )
    add(
        "14-copy-move",
        ["media.copy", "media.move"],
        [
            tap("Select sticker 1"),
            tap("Select sticker 2"),
            tap("Copy"),
            tap(target),
            check("Clear selection", absent=True),
            tap("Select sticker 3"),
            tap("Move"),
            tap(target),
            count(2),
            tap("Back"),
            card(target),
            count(3),
            tap("Back"),
        ],
    )
    add(
        "15-theme",
        ["settings.theme"],
        [
            nav("Settings"),
            {"action": "assert", "selector": {"description": "Dark theme", "checked": initial_dark}},
            tap("Dark theme"),
            {"action": "assert", "selector": {"description": "Dark theme", "checked": not initial_dark}},
            tap("Dark theme"),
            {"action": "assert", "selector": {"description": "Dark theme", "checked": initial_dark}},
            nav("Library"),
        ],
    )
    add(
        "16-library-filters",
        ["library.search", "library.filter", "library.sort"],
        [
            field(0, value=static.rsplit(" ", 1)[0]),
            BACK,
            check(static + "\n", contains=True),
            tap("Filter"),
            tap("Animated"),
            check(animated + "\n", contains=True),
            check(static + "\n", contains=True, absent=True),
            tap("Filter"),
            tap("All"),
            check(static + "\n", contains=True),
            tap("Sort"),
            tap("Name"),
            tap("Sort"),
            {"action": "assert", "selector": {"descriptionContains": "Name", "checked": True}},
            BACK,
        ],
    )
    return result


def whatsapp_scenarios(names):
    return [
        (
            f"whatsapp-{kind}",
            {
                "version": 1,
                "covers": [f"whatsapp.{kind}"],
                "steps": [
                    card(names[kind]),
                    tap("Pack actions"),
                    tap("Add to WhatsApp"),
                    {
                        "action": "tap",
                        "selector": {"resourceId": "com.whatsapp:id/download_btn"},
                        "timeout": 60,
                    },
                    check("Pack added to WhatsApp", contains=True),
                    tap("Dismiss"),
                    tap("Back"),
                ],
            },
        )
        for kind in ("static", "animated")
    ]


def offline_scenario(names):
    return [
        (
            "offline",
            {
                "version": 1,
                "covers": ["offline.restart", "offline.browse"],
                "steps": [
                    {"action": "launch", "restart": True},
                    check("downloaded packs", contains=True),
                    card(names["static"]),
                    count(3),
                    check("Add stickers", absent=True),
                    tap("Back"),
                ],
            },
        )
    ]


def cleanup_scenarios(names, *, keep_packs=False):
    packs = [names["animated"] + " Copy", names["target"]]
    if not keep_packs:
        packs += [names["static"], names["animated"]]
    return [
        (
            f"cleanup-{index}",
            {
                "version": 1,
                "covers": ["library.delete"],
                "steps": [
                    card(name),
                    tap("Pack actions"),
                    tap("Delete pack"),
                    tap("Confirm"),
                    check("Your library"),
                    check(name + "\n", contains=True, absent=True),
                ],
            },
        )
        for index, name in enumerate(packs)
    ]


def folder_import_scenario(name, folder="Foundry-Import-QA", *, storage):
    return {
        "version": 1,
        "covers": [
            "import.folder",
            "import.cancel",
            "import.duplicates",
            "import.static-animated",
            "import.invalid",
        ],
        "preconditions": "Signed in to an isolated QA server. The named Downloads folder contains the synthetic --import-folder fixtures.",
        "steps": [
            tap("Import stickers"),
            tap("Choose folder"),
            BACK,
            check("No images selected"),
            tap("Choose folder"),
            tap("Show roots"),
            {"action": "tap", "selector": {"text": storage, "resourceId": "android:id/title"}, "timeout": 30},
            tap("Download"),
            {"action": "tap", "selector": {"text": folder}, "timeout": 30},
            {"action": "tap", "selector": {"resourceId": "android:id/button1"}, "timeout": 30},
            {"action": "tap", "selector": {"resourceId": "android:id/button1"}, "timeout": 30},
            check("6 selected", contains=True),
            check("1 duplicate files", contains=True),
            field(0, value=name),
            field(1, value="Phone QA"),
            BACK,
            tap("Import selected"),
            check("6 imported", contains=True),
        ],
    }


def reorder_current_pack(device, from_index=3, to_index=1):
    """Build a drag from the current pack's semantic bounds, never fixed pixels."""
    from tool.phone_qa import APP

    width, height = device.window_size()

    def center(index):
        bounds = device(packageName=APP, descriptionContains=f"Drag sticker {index} to reorder").info[
            "bounds"
        ]
        return [
            (bounds["left"] + bounds["right"]) / (2 * width),
            (bounds["top"] + bounds["bottom"]) / (2 * height),
        ]

    return {
        "version": 1,
        "covers": ["pack.reorder"],
        "preconditions": "An editable QA pack is open and both sticker positions are visible. Assert the server order and persistence after this gesture.",
        "steps": [{"action": "drag", "start": center(from_index), "end": center(to_index), "duration": 1.2}],
    }
