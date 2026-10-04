"""Step 3 of the README demos: turns the pictures render.cjs took into GIFs.

    python tools/demo/make-gifs.py artifacts/demo docs/images

Every scene becomes `demo-<scene>.gif`. Needs Pillow.
"""

import math
import sys
from pathlib import Path

from PIL import Image, ImageChops

FRAME_MS = 50  # render.cjs takes 20 pictures a second
LAST_FRAME_MS = 1800
COLOURS = 255
# How many of them are kept for the vivid colours (icons, the ball), and what counts as vivid: the
# difference between the strongest and the weakest of red, green and blue.
VIVID_COLOURS = 64
VIVID_FROM = 40
SAMPLES = 40


def cut(counts: list, colours: int) -> list:
    """Median cut over a list of (count, colour): a colour weighs the root of how often it occurs."""
    data = []
    for count, colour in counts:
        data.extend([colour] * max(1, round(math.sqrt(count))))
    side = math.ceil(math.sqrt(len(data)))
    data.extend([data[-1]] * (side * side - len(data)))
    image = Image.new("RGB", (side, side))
    image.putdata(data)
    flat = image.quantize(colors=colours, method=Image.Quantize.MEDIANCUT).getpalette()
    return [tuple(flat[index : index + 3]) for index in range(0, colours * 3, 3)]


def film_palette(pictures: list) -> Image.Image:
    """One palette for a whole film, taken from pictures spread over it.

    A plain median cut counts pixels, and an interface is mostly greys: the few pixels of an icon or
    of the ball would come out in the nearest grey-blue. So the vivid colours get a share of their
    own.
    """
    width, height = pictures[0].size
    step = max(1, len(pictures) // SAMPLES)
    sample = pictures[::step][:SAMPLES]
    sheet = Image.new("RGB", (width, height * len(sample)))
    for index, picture in enumerate(sample):
        sheet.paste(picture, (0, height * index))
    counts = sheet.getcolors(maxcolors=sheet.width * sheet.height)
    vivid = [entry for entry in counts if max(entry[1]) - min(entry[1]) > VIVID_FROM]
    plain = [entry for entry in counts if max(entry[1]) - min(entry[1]) <= VIVID_FROM]
    if not vivid or not plain:
        colours = cut(counts, COLOURS)
    else:
        colours = cut(plain, COLOURS - VIVID_COLOURS) + cut(vivid, VIVID_COLOURS)
    palette = Image.new("P", (1, 1))
    palette.putpalette([value for colour in dict.fromkeys(colours) for value in colour])
    return palette


def build(scene_dir: Path, out_dir: Path) -> None:
    pictures = [
        Image.open(path).convert("RGB") for path in sorted(scene_dir.glob("*.png"))
    ]

    # Pictures in which nothing changed are one longer frame.
    kept, times = [pictures[0]], [FRAME_MS]
    for picture in pictures[1:]:
        if ImageChops.difference(picture, kept[-1]).getbbox() is None:
            times[-1] += FRAME_MS
        else:
            kept.append(picture)
            times.append(FRAME_MS)
    times[-1] = LAST_FRAME_MS

    # One palette for the whole film: with a palette per frame every frame would be written whole,
    # and the flat colours of the interface would flicker.
    width, height = kept[0].size
    palette = film_palette(kept)
    indexed = [
        picture.quantize(palette=palette, dither=Image.Dither.NONE) for picture in kept
    ]

    out_dir.mkdir(parents=True, exist_ok=True)
    target = out_dir / f"demo-{scene_dir.name}.gif"
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
    print(
        f"{target.name}: {width}x{height}, {len(indexed)} frames, {seconds:.1f}s, {size:.0f} KB"
    )


def main() -> None:
    source = Path(sys.argv[1] if len(sys.argv) > 1 else "artifacts/demo")
    out_dir = Path(sys.argv[2] if len(sys.argv) > 2 else "docs/images")
    for scene_dir in sorted((source / "rendered").iterdir()):
        if scene_dir.is_dir():
            build(scene_dir, out_dir)


if __name__ == "__main__":
    main()
