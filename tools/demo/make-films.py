"""Step 3 of the README demos: turns the pictures render.cjs took into films.

    python tools/demo/make-films.py artifacts/demo docs/images

Every scene becomes `demo-<scene>.webp`, an animated WebP: full colour, and a third of the size a
GIF of the same pictures would have. Needs Pillow.
"""

import sys
from pathlib import Path

from PIL import Image, ImageChops

FPS = 30  # render.cjs takes this many pictures a second
LAST_FRAME_MS = 1200
# Text stays sharp from about here; the files grow quickly above it.
QUALITY = 88


def same(one: Image.Image, other: Image.Image) -> bool:
    """Whether nothing changed that anyone could see.

    A still moment is not drawn bit for bit the same every time (a shadow comes out one level
    lighter), so the last digits do not count.
    """
    return max(high for _, high in ImageChops.difference(one, other).getextrema()) <= 3


def build(scene_dir: Path, out_dir: Path) -> None:
    paths = sorted(scene_dir.glob("*.png"))
    pictures = [Image.open(path).convert("RGB") for path in paths]

    # Every picture lasts until the next one is due (33, 33, 34 ms: no drift), and pictures in
    # which nothing changed are one longer frame.
    kept, times = [], []
    for index, picture in enumerate(pictures):
        lasts = round((index + 1) * 1000 / FPS) - round(index * 1000 / FPS)
        if kept and same(picture, kept[-1]):
            times[-1] += lasts
        else:
            kept.append(picture)
            times.append(lasts)
    times[-1] = LAST_FRAME_MS

    out_dir.mkdir(parents=True, exist_ok=True)
    target = out_dir / f"demo-{scene_dir.name}.webp"
    kept[0].save(
        target,
        save_all=True,
        append_images=kept[1:],
        duration=times,
        loop=0,
        quality=QUALITY,
        method=4,
    )
    width, height = kept[0].size
    seconds = sum(times) / 1000
    size = target.stat().st_size / 1024
    print(
        f"{target.name}: {width}x{height}, {len(kept)} frames, {seconds:.1f}s, {size:.0f} KB"
    )


def main() -> None:
    source = Path(sys.argv[1] if len(sys.argv) > 1 else "artifacts/demo")
    out_dir = Path(sys.argv[2] if len(sys.argv) > 2 else "docs/images")
    for scene_dir in sorted((source / "rendered").iterdir()):
        if scene_dir.is_dir():
            build(scene_dir, out_dir)


if __name__ == "__main__":
    main()
