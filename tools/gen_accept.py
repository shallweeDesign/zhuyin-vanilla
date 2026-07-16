#!/usr/bin/env python3
"""Generate tone-insensitive homophone accept-lists for zhuyin game from Unihan.

For each game item's canonical pinyin syllable, collect every Big5-encodable
(i.e. common traditional) character whose Mandarin reading, tone-stripped,
equals that syllable. Union with the existing hand-written lists.
Output: a JS object literal ready to paste into speech.js.
"""
import re
import unicodedata
from collections import defaultdict

# item id -> canonical isolated-reading syllable (same as ACCEPT_PINYIN in speech.js)
TARGETS = {
    "b": "bo", "p": "po", "m": "mo", "f": "fo",
    "d": "de", "t": "te", "n": "ne", "l": "le",
    "g": "ge", "k": "ke", "h": "he",
    "j": "ji", "q": "qi", "x": "xi",
    "zh": "zhi", "ch": "chi", "sh": "shi", "r": "ri",
    "z": "zi", "c": "ci", "s": "si",
    "a": "a", "o": "o", "e": "e", "ê": "ye",
    "ai": "ai", "ei": "ei", "ao": "ao", "ou": "ou",
    "an": "an", "en": "en", "ang": "ang", "eng": "eng", "er": "er",
    "i": "yi", "u": "wu", "ü": "yu",
    "ia": "ya", "io": "yo", "ie": "ye", "ian": "yan", "in": "yin",
    "iang": "yang", "ing": "ying", "iou": "you",
    "ua": "wa", "uo": "wo", "uai": "wai", "uei": "wei",
    "uan": "wan", "uen": "wen", "uang": "wang", "ueng": "weng",
    "yue": "yue", "yuan": "yuan", "yun": "yun", "yung": "yong",
    "ba": "ba", "ma": "ma", "da": "da", "tu": "tu", "gou": "gou",
    "hua": "hua", "mi": "mi", "shu": "shu", "jia": "jia", "qiu": "qiu",
    "xing": "xing", "zhu": "zhu", "chuan": "chuan", "shui": "shui",
    "niao": "niao", "mao": "mao",
}

# existing hand-written lists (kept as guaranteed members)
MANUAL = {
    "b": "波撥玻剝菠播伯博勃薄泊帛柏箔搏膊玻",
    "p": "坡潑婆迫破頗魄粕叵",
    "m": "摸模膜磨魔抹末沒莫墨默摩茉陌漠寞",
    "f": "佛",
    "d": "得德的地嘚",
    "t": "特忑",
    "n": "呢訥哪吶",
    "l": "樂勒了肋垃叻",
    "g": "哥歌戈鴿格閣革各個割葛隔咯胳",
    "k": "科顆棵柯咳蝌殼可克刻課客苛",
    "h": "喝荷河何合和賀鶴盒核呵嚇賀",
    "j": "機雞基積擊肌姬即急集級極幾己擠脊計記濟繼寄季技既紀寂雞",
    "q": "七期欺漆淒戚齊其奇騎旗棋起豈企氣器汽棄泣妻砌",
    "x": "西希吸昔析息習席洗喜戲系細膝溪嘻夕犀錫",
    "zh": "之知支芝隻織汁直值植執侄指紙只止至志致智製治秩擲質",
    "ch": "吃痴持池遲尺齒赤翅斥匙馳恥",
    "sh": "詩施師獅失十時實食石識史使始是事市式室視試世勢士",
    "r": "日",
    "z": "資姿滋茲吱子紫仔字自",
    "c": "疵慈磁瓷詞辭此次刺賜雌",
    "s": "思斯私司絲撕死四寺似飼嘶",
    "a": "啊阿",
    "o": "喔哦噢",
    "e": "額俄餓鵝惡厄婀",
    "ê": "欸誒耶爺也夜葉椰野",
    "ai": "愛哀埃挨矮癌艾唉",
    "ei": "欸誒",
    "ao": "凹熬襖傲奧澳懊嗷",
    "ou": "歐偶嘔鷗毆藕",
    "an": "安按暗案鞍岸",
    "en": "恩嗯摁",
    "ang": "骯昂盎",
    "eng": "鞥嗯",
    "er": "而兒耳爾二餌",
    "i": "一衣依醫以椅乙意義易益移姨壹",
    "u": "屋烏污巫無五午舞武物霧誤悟吳",
    "ü": "淤迂魚漁於余雨語玉遇育浴娛",
    "ia": "牙呀鴨壓芽雅亞崖丫",
    "io": "唷喲",
    "ie": "耶爺也夜葉椰野業頁爺",
    "ian": "煙鹽眼演燕嚥言顏延岩",
    "in": "因音陰銀引飲印隱",
    "iang": "央羊陽楊養癢樣氧洋",
    "ing": "英鷹迎營影硬應嬰螢",
    "iou": "優悠油由游友有右幼柚郵",
    "ua": "挖蛙娃瓦襪哇",
    "uo": "窩我臥握渦蝸沃斡",
    "uai": "歪外",
    "uei": "威微為圍偉尾未味位胃衛偎",
    "uan": "彎灣玩完晚碗萬丸頑",
    "uen": "溫文聞穩問紋蚊吻",
    "uang": "汪王往網忘望旺",
    "ueng": "翁嗡甕",
    "yue": "約月越樂閱悅躍岳",
    "yuan": "冤圓園元原遠院願員猿",
    "yun": "暈雲勻允運韻雲",
    "yung": "用永泳勇擁庸湧傭",
    "ba": "八爸巴拔把霸疤芭",
    "ma": "媽麻馬罵嗎螞",
    "da": "搭答達打大",
    "tu": "突圖徒土吐兔塗禿",
    "gou": "勾溝狗夠購鉤",
    "hua": "花華滑化話畫嘩",
    "mi": "咪迷米密蜜瞇謎",
    "shu": "書梳舒輸熟數樹叔鼠殊",
    "jia": "家加佳夾假價架嘉甲",
    "qiu": "秋丘球求邱",
    "xing": "星興行型形醒姓猩",
    "zhu": "豬珠竹煮主住助朱",
    "chuan": "川穿船傳串",
    "shui": "水誰稅睡",
    "niao": "鳥尿",
    "mao": "貓毛帽冒茅",
}


def strip_tone(py: str) -> str:
    # remove tone diacritics; keep base letters (ü -> u is fine for our targets)
    nfd = unicodedata.normalize("NFD", py)
    return "".join(c for c in nfd if not unicodedata.combining(c)).lower()


def is_common_traditional(ch: str) -> bool:
    try:
        ch.encode("big5")
        return True
    except UnicodeEncodeError:
        return False


# char -> set of tone-stripped syllables.
# kMandarin = modern standard reading(s); kHanyuPinlu = frequency-ranked
# spoken readings (covers common polyphones like 樂 lè/yuè). We deliberately
# skip kHanyuPinyin — it includes obsolete literary readings (提 chí, 怕 bó…)
# that would wrongly accept incorrect answers.
readings = defaultdict(set)
line_re = re.compile(r"^U\+([0-9A-F]+)\t(kMandarin|kHanyuPinlu)\t(.+)$")

with open("Unihan_Readings.txt", encoding="utf-8") as f:
    for line in f:
        m = line_re.match(line)
        if not m:
            continue
        cp, field, val = m.groups()
        ch = chr(int(cp, 16))
        if field == "kMandarin":
            sylls = val.split()
        else:  # kHanyuPinlu
            sylls = [re.sub(r"\(\d+\)", "", tok) for tok in val.split()]
        for s in sylls:
            readings[ch].add(strip_tone(s))

# syllable -> chars
by_syll = defaultdict(list)
for ch, sylls in readings.items():
    if not is_common_traditional(ch):
        continue
    for s in sylls:
        by_syll[s].append(ch)

lines = []
total = 0
for item_id, syll in TARGETS.items():
    manual = MANUAL.get(item_id, "")
    gen = by_syll.get(syll, [])
    # manual chars first (dedup preserves order), then generated sorted by codepoint
    seen = set()
    merged = []
    for ch in list(manual) + sorted(gen):
        if ch not in seen:
            seen.add(ch)
            merged.append(ch)
    total += len(merged)
    key = f'"{item_id}"' if item_id in ("ê", "ü") else item_id
    lines.append(f'  {key}: "{"".join(merged)}",')
    print(f"{item_id:6s} {syll:6s} manual={len(set(manual))} merged={len(merged)}")

print(f"\ntotal chars: {total}")
with open("accept_chars.js", "w", encoding="utf-8") as f:
    f.write("const ACCEPT_CHARS = {\n" + "\n".join(lines) + "\n};\n")
print("wrote accept_chars.js")
