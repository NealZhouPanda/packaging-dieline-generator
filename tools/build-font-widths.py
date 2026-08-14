#!/usr/bin/env python3
"""从子集字体抽出字宽 → src/font-widths.js"""
import json
from pathlib import Path

from fontTools.ttLib import TTFont

ROOT = Path(__file__).resolve().parent.parent
FONT = ROOT / "tools" / "fonts" / "pdf-subset.ttf"
OUT = ROOT / "src" / "font-widths.js"

CHARS = (
    "刀模文件名日期长宽高纸厚说明是否过抛重必须打样确认首次投产前核对注意已超三边和限制比未"
    "单位毫米千克年月日通用开槽纸箱楞图纸内尺寸"
    "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz"
    " .:-/()×≥<>：。，（）！？、；_"
)


def gb2312_level1() -> str:
    chars = []
    for hi in range(0xB0, 0xD8):
        for lo in range(0xA1, 0xFF):
            try:
                c = bytes([hi, lo]).decode("gb2312")
                if len(c) == 1:
                    chars.append(c)
            except UnicodeDecodeError:
                pass
    return "".join(chars)


def main() -> None:
    font = TTFont(FONT)
    cmap = font.getBestCmap()
    hmtx = font["hmtx"].metrics
    units = font["head"].unitsPerEm
    widths = {}
    missing = 0
    for ch in CHARS + gb2312_level1():
        name = cmap.get(ord(ch))
        if name is None or name not in hmtx:
            missing += 1
            continue
        advance = hmtx[name][0]
        widths[ch] = round(advance * 1000 / units)
    OUT.write_text(
        "// 由 tools/build-font-widths.py 生成，勿手改。\nexport const PDF_FONT_WIDTHS = "
        + json.dumps(widths, ensure_ascii=False, separators=(",", ":"))
        + ";\n",
        encoding="utf-8",
    )
    sample = {k: widths[k] for k in "0A刀_ " if k in widths}
    print(f"widths={len(widths)} missing={missing} units={units} sample={sample} → {OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
