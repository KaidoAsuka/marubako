"""Turns the recordings of record.cjs into the GIFs of the README.

    python tools/demo/make-gifs.py artifacts/demo docs/images

For every scene of every language it lays the two windows out on a plain backdrop the way they
stood on the screen, draws the pointer, a ring for every click and the keys that were pressed, and
writes `demo-<scene>.gif` (English) or `demo-<scene>.zh-CN.gif`. Needs Pillow.
"""

import json
import sys
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageFont

MARGIN = 28
BACKDROP = (226, 230, 238)
CAPTION_ROOM = 54
MIN_FRAME_MS = 40
MAX_FRAME_MS = 400
SUFFIX = {"en": "", "zh": ".zh-CN"}
FONTS = {
    "en": "C:/Windows/Fonts/segoeuib.ttf",
    "zh": "C:/Windows/Fonts/msyhbd.ttc",
}


def font(lang: str, size: int) -> ImageFont.FreeTypeFont:
    for candidate in (FONTS[lang], "C:/Windows/Fonts/segoeui.ttf"):
        try:
            return ImageFont.truetype(candidate, size)
        except OSError:
            continue
    return ImageFont.load_default()


def region(frames: list) -> tuple[int, int, int, int]:
    """The part of the screen every window of the scene stays in, with a margin."""
    boxes = [
        window["bounds"]
        for frame in frames
        for window in frame["windows"]
        if window["visible"]
    ]
    left = min(box["x"] for box in boxes) - MARGIN
    top = min(box["y"] for box in boxes) - MARGIN
    right = max(box["x"] + box["width"] for box in boxes) + MARGIN
    bottom = max(box["y"] + box["height"] for box in boxes) + MARGIN + CAPTION_ROOM
    return left, top, right - left, bottom - top


def pointer_at(mouse: list, t: float) -> tuple[float, float]:
    """Where the pointer was at `t`, between the two positions written down around it."""
    before = mouse[0]
    for sample in mouse:
        if sample["t"] > t:
            span = sample["t"] - before["t"]
            share = 0 if span <= 0 else (t - before["t"]) / span
            return (
                before["x"] + (sample["x"] - before["x"]) * share,
                before["y"] + (sample["y"] - before["y"]) * share,
            )
        before = sample
    return before["x"], before["y"]


def draw_pointer(canvas: Image.Image, x: float, y: float) -> None:
    """The arrow of Windows, drawn large enough to be followed in a small picture."""
    shape = [(0, 0), (0, 17), (4.5, 13), (7.5, 20), (10.5, 18.5), (7.5, 12), (13, 12)]
    scale = 1.25
    points = [(x + px * scale, y + py * scale) for px, py in shape]
    layer = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(layer)
    shadow = [(px + 1.5, py + 2) for px, py in points]
    draw.polygon(shadow, fill=(0, 0, 0, 60))
    draw.polygon(points, fill=(255, 255, 255, 255), outline=(20, 24, 34, 255))
    draw.line(points + [points[0]], fill=(20, 24, 34, 255), width=2, joint="curve")
    canvas.alpha_composite(layer)


def draw_clicks(canvas: Image.Image, clicks: list, t: float, origin) -> None:
    layer = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(layer)
    for click in clicks:
        age = t - click["t"]
        if not 0 <= age <= 450:
            continue
        share = age / 450
        radius = 7 + 15 * share
        alpha = int(190 * (1 - share))
        x = click["x"] - origin[0]
        y = click["y"] - origin[1]
        draw.ellipse(
            (x - radius, y - radius, x + radius, y + radius),
            outline=(88, 101, 242, alpha),
            width=3,
        )
    canvas.alpha_composite(layer)


def draw_keys(canvas: Image.Image, keys: list, t: float, lang: str) -> None:
    shown = [key for key in keys if key["t"] <= t <= key["t"] + key["duration"]]
    if not shown:
        return
    text = shown[-1]["text"]
    face = font(lang, 17)
    layer = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(layer)
    width = draw.textlength(text, font=face)
    box_width = width + 30
    left = (canvas.width - box_width) / 2
    top = canvas.height - CAPTION_ROOM - MARGIN / 2 + 12
    draw.rounded_rectangle(
        (left, top, left + box_width, top + 36), radius=10, fill=(30, 34, 46, 235)
    )
    draw.text(
        (left + 15, top + 18), text, font=face, fill=(255, 255, 255, 255), anchor="lm"
    )
    canvas.alpha_composite(layer)


def compose(frame: dict, scene_dir: Path, box, data: dict) -> Image.Image:
    left, top, width, height = box
    canvas = Image.new("RGBA", (width, height), BACKDROP + (255,))
    # The panel first, the ball on top of it, as on the screen.
    for window in sorted(frame["windows"], key=lambda item: item["role"] != "panel"):
        if not window["file"]:
            continue
        bounds = window["bounds"]
        shot = Image.open(scene_dir / window["file"]).convert("RGBA")
        shot = shot.resize((bounds["width"], bounds["height"]), Image.LANCZOS)
        if window["opacity"] < 1:
            alpha = shot.getchannel("A").point(lambda value: int(value * window["opacity"]))
            shot.putalpha(alpha)
        position = (bounds["x"] - left, bounds["y"] - top)
        if window["role"] == "panel":
            # A soft shadow, taken from what is drawn, so it follows the panel while it springs.
            shade = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
            alpha = shot.getchannel("A").point(lambda value: int(value * 0.28))
            shade.paste((20, 26, 44, 255), (position[0], position[1] + 8), alpha)
            canvas.alpha_composite(shade.filter(ImageFilter.GaussianBlur(14)))
        canvas.alpha_composite(shot, position)
    t = frame["t"]
    draw_clicks(canvas, data["clicks"], t, (left, top))
    draw_keys(canvas, data["keys"], t, data["lang"])
    x, y = pointer_at(data["mouse"], t)
    draw_pointer(canvas, x - left, y - top)
    return canvas.convert("RGB")


def build(scene_dir: Path, out_dir: Path) -> None:
    data = json.loads((scene_dir / "timeline.json").read_text(encoding="utf-8"))
    frames = data["frames"]
    box = region(frames)
    pictures = [compose(frame, scene_dir, box, data) for frame in frames]
    durations = [
        max(MIN_FRAME_MS, min(MAX_FRAME_MS, following["t"] - frame["t"]))
        for frame, following in zip(frames, frames[1:])
    ] + [1600]

    # Frames in which nothing changed are one longer frame.
    kept, times = [pictures[0]], [durations[0]]
    for picture, duration in zip(pictures[1:], durations[1:]):
        if ImageChops.difference(picture, kept[-1]).getbbox() is None:
            times[-1] += duration
        else:
            kept.append(picture)
            times.append(duration)

    # One palette for the whole animation, taken from frames spread over it: without it every frame
    # would be written whole, and the flat colours of the interface would flicker.
    step = max(1, len(kept) // 8)
    sample = kept[::step][:8]
    sheet = Image.new("RGB", (box[2], box[3] * len(sample)))
    for index, picture in enumerate(sample):
        sheet.paste(picture, (0, box[3] * index))
    palette = sheet.quantize(colors=255, method=Image.Quantize.MEDIANCUT)
    indexed = [
        picture.quantize(palette=palette, dither=Image.Dither.NONE) for picture in kept
    ]

    out_dir.mkdir(parents=True, exist_ok=True)
    target = out_dir / f"demo-{data['name']}{SUFFIX[data['lang']]}.gif"
    indexed[0].save(
        target,
        save_all=True,
        append_images=indexed[1:],
        duration=times,
        loop=0,
        optimize=False,
        disposal=1,
    )
    seconds = sum(times) / 1000
    size = target.stat().st_size / 1024
    print(f"{target.name}: {box[2]}x{box[3]}, {len(indexed)} frames, {seconds:.1f}s, {size:.0f} KB")


def main() -> None:
    source = Path(sys.argv[1] if len(sys.argv) > 1 else "artifacts/demo")
    out_dir = Path(sys.argv[2] if len(sys.argv) > 2 else "docs/images")
    for timeline in sorted(source.glob("*/*/timeline.json")):
        build(timeline.parent, out_dir)


if __name__ == "__main__":
    main()
