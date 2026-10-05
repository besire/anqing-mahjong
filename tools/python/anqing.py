#!/usr/bin/env python3
"""安庆麻将：胡牌判定 + 算花 + 结算.

牌：万(m) 条(s) 筒(p) 各 1-9 ×4，南/西/北 ×4，共 120 张可打牌。
花牌：白、中、发、东 共 16 张，摸到即补，每张 +1 花（不进手牌）。

牌的写法：
    123m 456p 789s       数牌（数字在前，花色字母在后）
    南西北 或 1z 2z 3z   风牌（1z=南 2z=西 3z=北）
"""
from __future__ import annotations

import argparse
import sys
from collections import Counter
from dataclasses import dataclass, field

HONOR_NAMES = {"南": "1z", "西": "2z", "北": "3z"}
HONOR_DISPLAY = {v: k for k, v in HONOR_NAMES.items()}
FLOWER_NAMES = set("白中发發东東")
VALID_TILES = {f"{n}{s}" for s in "mps" for n in range(1, 10)} | set(HONOR_DISPLAY)


def parse_tiles(text: str) -> list[str]:
    """'123m45p南南' -> ['1m','2m','3m','4p','5p','1z','1z']"""
    tiles: list[str] = []
    pending: list[str] = []
    for ch in text.replace(" ", "").replace(",", ""):
        if ch.isdigit():
            pending.append(ch)
        elif ch in "mpsz":
            if not pending:
                raise ValueError(f"花色 {ch!r} 前缺少数字")
            tiles += [d + ch for d in pending]
            pending = []
        elif ch in HONOR_NAMES:
            tiles.append(HONOR_NAMES[ch])
        elif ch in FLOWER_NAMES:
            raise ValueError(f"{ch} 是花牌，不能放进手牌，请用 --flowers 计数")
        else:
            raise ValueError(f"无法识别的字符 {ch!r}")
    if pending:
        raise ValueError(f"数字 {''.join(pending)} 后缺少花色")
    for t in tiles:
        if t not in VALID_TILES:
            raise ValueError(f"无效的牌 {t}")
    return tiles


def show(tiles) -> str:
    return " ".join(HONOR_DISPLAY.get(t, t) for t in tiles)


def is_honor(t: str) -> bool:
    return t.endswith("z")


# ---------------------------------------------------------------- 副露
@dataclass
class Meld:
    kind: str           # chi / peng / minggang / angang
    tiles: list[str]

    @property
    def is_gang(self) -> bool:
        return self.kind in ("minggang", "angang")

    @property
    def is_triplet(self) -> bool:  # 刻子（杠也算刻子）
        return self.kind != "chi"


def make_meld(kind: str, text: str) -> Meld:
    tiles = parse_tiles(text)
    if kind == "chi":
        if len(tiles) != 3 or any(is_honor(t) for t in tiles):
            raise ValueError(f"吃必须是三张同花色数牌: {text}")
        nums = sorted(int(t[0]) for t in tiles)
        if len({t[1] for t in tiles}) != 1 or nums != list(range(nums[0], nums[0] + 3)):
            raise ValueError(f"吃必须是顺子: {text}")
        return Meld(kind, sorted(tiles))
    need = 3 if kind == "peng" else 4
    if len(tiles) == 1:
        tiles = tiles * need
    if len(tiles) != need or len(set(tiles)) != 1:
        raise ValueError(f"{kind} 需要 {need} 张相同的牌: {text}")
    return Meld(kind, tiles)


# ---------------------------------------------------------------- 胡牌判定
def _decompose(counts: Counter) -> list[list[tuple[str, str]]]:
    """把剩余牌拆成若干面子，返回所有拆法。每个面子 (类型, 起始牌)。"""
    keys = sorted(t for t, c in counts.items() if c > 0)
    if not keys:
        return [[]]
    t = keys[0]
    results = []
    if counts[t] >= 3:  # 刻子
        counts[t] -= 3
        results += [[("triplet", t)] + r for r in _decompose(counts)]
        counts[t] += 3
    if not is_honor(t) and int(t[0]) <= 7:  # 顺子
        n, s = int(t[0]), t[1]
        t2, t3 = f"{n + 1}{s}", f"{n + 2}{s}"
        if counts[t2] > 0 and counts[t3] > 0:
            for x in (t, t2, t3):
                counts[x] -= 1
            results += [[("sequence", t)] + r for r in _decompose(counts)]
            for x in (t, t2, t3):
                counts[x] += 1
    return results


def win_decompositions(concealed: list[str], seven_pairs: bool = False):
    """手牌（含胡的那张）所有合法拆法: [(将, [面子...])]。"""
    counts = Counter(concealed)
    out = []
    for pair in sorted(counts):
        if counts[pair] >= 2:
            counts[pair] -= 2
            for melds in _decompose(counts):
                out.append((pair, melds))
            counts[pair] += 2
    if seven_pairs and len(concealed) == 14 and all(c % 2 == 0 for c in counts.values()):
        out.append(("七对", []))
    return out


# ---------------------------------------------------------------- 算花
@dataclass
class Rules:
    qingyise_bonus: int = 0     # 清一色加花，房规自定
    seven_pairs: bool = False   # 是否允许七对，房规自定


@dataclass
class Hand:
    concealed: list[str]                 # 手里的牌（含胡的那张）
    melds: list[Meld] = field(default_factory=list)
    flowers: int = 0                     # 补花张数
    zimo: bool = False
    gangkai: bool = False                # 杠上开花（补花摸到胡牌也算）


@dataclass
class Result:
    win: bool
    total: int = 0
    items: list[tuple[str, int]] = field(default_factory=list)
    reason: str = ""


def score(hand: Hand, rules: Rules = Rules()) -> Result:
    all_tiles = hand.concealed + [t for m in hand.melds for t in m.tiles]
    for t, c in Counter(all_tiles).items():
        if c > 4:
            return Result(False, reason=f"{show([t])} 超过 4 张")
    if len(hand.concealed) + 3 * len(hand.melds) != 14:
        return Result(False, reason="牌数不对（手牌 + 3×副露 应为 14，杠按 3 计）")
    if hand.gangkai and not hand.zimo:
        return Result(False, reason="杠上开花必须是自摸")

    decomps = win_decompositions(hand.concealed, rules.seven_pairs)
    if not decomps:
        return Result(False, reason="不成胡牌牌型")

    best: Result | None = None
    for pair, concealed_melds in decomps:
        items = [("底花", 1)]
        if hand.flowers:
            items.append((f"花牌 ×{hand.flowers}", hand.flowers))
        if hand.zimo:
            items.append(("自摸", 1))
        if hand.gangkai:
            items.append(("杠上开花", 1))
        gangs = sum(m.is_gang for m in hand.melds)
        if gangs:
            items.append((f"杠 ×{gangs}", gangs))
        wind_triplets = [m.tiles[0] for m in hand.melds if m.is_triplet and is_honor(m.tiles[0])]
        wind_triplets += [t for k, t in concealed_melds if k == "triplet" and is_honor(t)]
        for t in wind_triplets:
            items.append((f"{show([t])}刻", 1))
        if rules.qingyise_bonus and not any(is_honor(t) for t in all_tiles) \
                and len({t[1] for t in all_tiles}) == 1:
            items.append(("清一色", rules.qingyise_bonus))
        total = sum(v for _, v in items)
        if best is None or total > best.total:
            best = Result(True, total, items)
    return best


def settle(total: int, zimo: bool) -> str:
    if zimo:
        return f"自摸：三家各付 {total} 花，共收 {total * 3} 花"
    return f"点炮：放炮者付 {total} 花"


# ---------------------------------------------------------------- CLI
def main(argv=None) -> int:
    p = argparse.ArgumentParser(description="安庆麻将算花")
    p.add_argument("hand", help="手牌（含胡的那张），如 123m456p789s南南南西西")
    p.add_argument("--chi", action="append", default=[], help="吃，如 123m")
    p.add_argument("--peng", action="append", default=[], help="碰，如 5p 或 北")
    p.add_argument("--minggang", action="append", default=[], help="明杠，如 7s")
    p.add_argument("--angang", action="append", default=[], help="暗杠，如 西")
    p.add_argument("--flowers", type=int, default=0, help="补花张数")
    p.add_argument("--zimo", action="store_true", help="自摸")
    p.add_argument("--gangkai", action="store_true", help="杠上开花（自动视为自摸）")
    p.add_argument("--qingyise", type=int, default=0, help="清一色加花数（默认 0 不计）")
    p.add_argument("--qidui", action="store_true", help="允许七对")
    a = p.parse_args(argv)

    try:
        melds = [make_meld(k, x) for k in ("chi", "peng", "minggang", "angang")
                 for x in getattr(a, k)]
        hand = Hand(parse_tiles(a.hand), melds, a.flowers,
                    zimo=a.zimo or a.gangkai, gangkai=a.gangkai)
    except ValueError as e:
        print(f"输入错误：{e}", file=sys.stderr)
        return 2
    r = score(hand, Rules(a.qingyise, a.qidui))
    if not r.win:
        print(f"不能胡：{r.reason}")
        return 1
    for name, v in r.items:
        print(f"  {name:<10} +{v}")
    print(f"共 {r.total} 花")
    print(settle(r.total, hand.zimo))
    return 0


if __name__ == "__main__":
    sys.exit(main())
