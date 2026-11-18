"""Small raw AMXD exporter for the Pocket Live audio-effect patch.

The ampf/meta/ptch layout and patch defaults come from this project's original
py2max build. Runtime resources live beside the exported device.
"""
import json
import struct


# Max resolves a bare script name beside the AMXD. A relative path with a
# directory component can fail when Live loads the device from its browser.
PORTABLE_NODE_ENTRY = "pocket-live-start.js"


class Patch:
    def __init__(self):
        self.boxes = []
        self.lines = []

    def box(self, text, kind="newobj"):
        i = len(self.boxes)
        key = f"obj-{i+1}"
        self.boxes.append({"box": dict(
            id=key, maxclass=kind, text=text,
            patching_rect=[20. + (i % 4) * 190, 30. + (i // 4) * 65, 180., 22.],
        )})
        return key

    def wire(self, source, destination, outlet=0, inlet=0):
        self.lines.append({"patchline": {
            "source": [source, outlet], "destination": [destination, inlet],
        }})

    def save(self, output, width):
        device_type = b"aaaa"
        document = {"patcher": dict(
            fileversion=1,
            appversion=dict(major=9, minor=0, revision=0, architecture="x64", modernui=1),
            rect=[0., 0., 900., 800.], openinpresentation=1, devicewidth=width,
            boxes=self.boxes, lines=self.lines,
            project={
                "version": 1, "creationdate": 0, "modificationdate": 0,
                "viewrect": [0., 0., 300., 500.], "autoorganize": 1,
                "hideprojectwindow": 1, "showdependencies": 1, "autolocalize": 0,
                "contents": {"patchers": {}}, "layout": {}, "searchpath": {},
                "detailsvisible": 0, "readonly": 0, "devpathtype": 0,
                "devpath": ".", "sortmode": 0, "viewmode": 0, "includepackages": 0,
                "amxdtype": int.from_bytes(device_type, "big"), "name": output.stem,
            },
        )}
        payload = json.dumps(document, indent=4, ensure_ascii=False, allow_nan=False).encode("utf-8") + b"\n\0"
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_bytes(
            b"ampf" + struct.pack("<I", 4) + device_type
            + b"meta" + struct.pack("<II", 4, 0)
            + b"ptch" + struct.pack("<I", len(payload)) + payload
        )
