import pytest

from anqing import Hand, Rules, make_meld, parse_tiles, score, settle


def H(text, *melds, **kw):
    return Hand(parse_tiles(text), [make_meld(k, t) for k, t in melds], **kw)


def test_parse():
    assert parse_tiles("12m南3z") == ["1m", "2m", "1z", "3z"]
    with pytest.raises(ValueError):
        parse_tiles("中")


def test_basic_dianpao():
    r = score(H("123m456m789p123s55s"))
    assert r.win and r.total == 1
    assert settle(r.total, False) == "点炮：放炮者付 1 花"


def test_not_win():
    assert not score(H("123m456m789p124s55s")).win


def test_zimo_flowers_gang_winds():
    # 暗杠西 + 碰北 + 手里南刻，补花 3 张，自摸
    h = H("123m南南南55p", ("angang", "西"), ("peng", "北"), flowers=3, zimo=True)
    r = score(h)
    # 底1 + 花3 + 自摸1 + 杠1 + 南西北刻3 = 9
    assert r.total == 9
    assert "三家各付 9 花" in settle(r.total, True)


def test_gangkai():
    h = H("123m456m789p123s", ("minggang", "5s"), flowers=1, zimo=True, gangkai=True)
    # 底1 + 花1 + 自摸1 + 杠开1 + 杠1 = 5 ... 手牌只有 12 张不含将 -> 不成牌
    assert not score(h).win
    h = H("123m456m789p55s", ("minggang", "7s"), zimo=True, gangkai=True)
    assert score(h).total == 1 + 1 + 1 + 1


def test_qingyise_configurable():
    h = H("11123456789999m")
    assert score(h).total == 1
    assert score(h, Rules(qingyise_bonus=5)).total == 6


def test_seven_pairs_optional():
    h = H("11223344m5566p南南")
    assert not score(h).win
    assert score(h, Rules(seven_pairs=True)).win


def test_too_many_tiles():
    assert not score(H("11111m2345m789p55s")).win
