#!/usr/bin/env python3
"""
Bot dengesi deneyleri: config/balance.json'u DEĞİŞTİRMEDEN, geçici kopyalarla `BattleSim bot` çalıştırır ve tek bir tablo yazar.
Kullanım: python tools/bot-deney.py [maç sayısı] [çıktı.md] [eski]
'eski' verilmezse balance.json'un şimdiki değerleriyle son kontrol tablosu (D/B satırları) üretilir.
"""
import os, re, subprocess, sys, tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MATCHES = int(sys.argv[1]) if len(sys.argv) > 1 else 200
OUT = sys.argv[2] if len(sys.argv) > 2 else None
OLD = len(sys.argv) > 3 and sys.argv[3] == 'eski'
BASE = open(os.path.join(ROOT, 'config', 'balance.json'), encoding='utf-8-sig').read()
TMP = tempfile.mkdtemp(prefix='keepfall-bot-')


def scale_gold(text, k):
    """Ormanın altın ödüllerini (sandık, köy, küçük ve büyük kamp) k ile çarpar."""
    def fix(line):
        return re.sub(r'("gold(?:Min|Max)":\s*)(\d+)', lambda m: f'{m.group(1)}{round(int(m.group(2)) * k)}', line)
    return '\n'.join(fix(l) if re.match(r'\s*"(chest|village|camp|bigCamp)":', l) else l for l in text.split('\n'))


def scale_prices(text, k):
    """Paralı asker fiyatlarını k ile çarpar."""
    out, inside = [], False
    for l in text.split('\n'):
        if l.strip().startswith('"mercenary"'):
            inside = True
        elif inside and '}' in l:
            inside = False
        elif inside:
            l = re.sub(r'("\w+":\s*)(\d+)', lambda m: f'{m.group(1)}{round(int(m.group(2)) * k)}', l)
        out.append(l)
    return '\n'.join(out)


def bots(text, **kw):
    """bots bölümündeki tek sayıları değiştirir: anahtar=değer (easy_/medium_ önekiyle seviyeye özel)."""
    lines = text.split('\n')
    for key, value in kw.items():
        level, _, name = key.partition('_') if key.startswith(('easy_', 'medium_')) else ('', '', key)
        done = False
        for i, l in enumerate(lines):
            if level and re.match(rf'\s*"{level}":', l):
                if re.search(rf'"{name}":', l):
                    lines[i] = re.sub(rf'("{name}":\s*)[\d.]+', lambda m: f'{m.group(1)}{value}', l)
                else:  # yeni anahtar ekle
                    lines[i] = re.sub(r'\s*\}\s*,?\s*$', lambda m: f', "{name}": {value} ' + m.group(0).strip(), l)
                done = True
            elif not level and re.match(rf'\s*"{name}":', l):
                lines[i] = re.sub(rf'("{name}":\s*)[^,\n]+', lambda m: f'{m.group(1)}{value}', l)
                done = True
        assert done, key
    return '\n'.join(lines)


def run(name, args, transform=None, level='orta'):
    text = transform(BASE) if transform else BASE
    path = os.path.join(TMP, re.sub(r'\W+', '_', name) + '.json')
    open(path, 'w', encoding='utf-8').write(text)
    cmd = ['dotnet', 'run', '--project', os.path.join(ROOT, 'src', 'BattleSim'), '-c', 'Release', '--no-build', '--',
           'bot', '--config', path, '--mac', str(MATCHES), '--ozet', '1'] + (['--zorluk', level] if level else []) + args
    r = subprocess.run(cmd, capture_output=True, text=True, encoding='utf-8', cwd=ROOT)
    line = next((l for l in r.stdout.split('\n') if l.startswith('ÖZET\t')), None)
    if line is None:
        raise SystemExit(f'{name}: sonuç yok\n{r.stdout[-800:]}{r.stderr[-800:]}')
    return line.split('\t')[1:]


SCORE = ['--puan', 'evet']
rows = []
def add(group, name, what, fields):
    rows.append((group, name, what, fields))
    print(group, name, fields, flush=True)

if OLD:  # ilk deney tablosu (A/B/C): çarpanlar balance.json'un o günkü değerlerine göre; A9/C9 uygulandıktan sonra bu satırlar artık aynı sayıları vermez
    # ---- 1. paralı asker payı (Orta vs Orta) ----
    add('1 Paralı', 'A0', 'şimdiki ayar', run('A0', []))
    add('1 Paralı', 'A1', 'orman altını ×0,7', run('A1', [], lambda t: scale_gold(t, 0.7)))
    add('1 Paralı', 'A2', 'orman altını ×0,5', run('A2', [], lambda t: scale_gold(t, 0.5)))
    add('1 Paralı', 'A3', 'paralı fiyatı ×1,5', run('A3', [], lambda t: scale_prices(t, 1.5)))
    add('1 Paralı', 'A4', 'paralı fiyatı ×2', run('A4', [], lambda t: scale_prices(t, 2.0)))
    add('1 Paralı', 'A5', 'altın ×0,7 + fiyat ×1,5', run('A5', [], lambda t: scale_prices(scale_gold(t, 0.7), 1.5)))
    add('1 Paralı', 'A7', 'orman altını ×0,6', run('A7', [], lambda t: scale_gold(t, 0.6)))
    add('1 Paralı', 'A8', 'altın ×0,8 + fiyat ×1,5', run('A8', [], lambda t: scale_prices(scale_gold(t, 0.8), 1.5)))
    add('1 Paralı', 'A9', 'altın ×0,7 + fiyat ×1,25', run('A9', [], lambda t: scale_prices(scale_gold(t, 0.7), 1.25)))
    add('1 Paralı', 'A6', 'altın ×0,5 + fiyat ×1,5', run('A6', [], lambda t: scale_prices(scale_gold(t, 0.5), 1.5)))

    # ---- 2. pasiflik (Orta vs Orta) ----
    add('2 Pasiflik', 'B0', 'şimdiki ayar (nüfus kuralı, eşik 1,2)', run('B0', []))
    add('2 Pasiflik', 'B1', 'zafer puanı, botlar aynı', run('B1', SCORE))
    add('2 Pasiflik', 'B2', 'zafer puanı + puana duyarlı botlar', run('B2', SCORE, lambda t: bots(t, scoreAware='true')))
    add('2 Pasiflik', 'B3', 'eşik 1,3 (nüfus kuralı)', run('B3', [], lambda t: bots(t, attackMargin='1.3')))
    add('2 Pasiflik', 'B4', 'eşik 1,1 (nüfus kuralı)', run('B4', [], lambda t: bots(t, attackMargin='1.1')))
    add('2 Pasiflik', 'B5', 'eşik 1,1 + zafer puanı', run('B5', SCORE, lambda t: bots(t, attackMargin='1.1')))
    add('2 Pasiflik', 'B6', 'zafer puanı + duyarlı, nüfus ağırlıklı (2/0,1/1/2)', run('B6', SCORE + ['--agirlik', '100,0.1,1,2'], lambda t: bots(t, scoreAware='true')))
    add('2 Pasiflik', 'B7', 'zafer puanı + duyarlı, saldırı ağırlıklı (200/0,4/3/0,5)', run('B7', SCORE + ['--agirlik', '200,0.4,3,0.5'], lambda t: bots(t, scoreAware='true')))

    add('2 Pasiflik', 'B8', 'saldırı oranı 0,85 → 0,65 (nüfus kuralı)', run('B8', [], lambda t: bots(t, attackRate='0.65')))
    add('2 Pasiflik', 'B9', 'oran 0,65 + eşik 1,1 + puana duyarlı', run('B9', SCORE, lambda t: bots(t, attackRate='0.65', attackMargin='1.1', scoreAware='true')))

    # ---- 3. Kolay bot (Orta + Kolay karışık) ----
    E = lambda **kw: (lambda t: bots(t, **kw))
    eco = dict(easy_ecoMistake='0.08', easy_slack='1', easy_exploreAll='true', easy_chestsAnywhere='true', easy_scouts='2', easy_mercBatch='3',
               easy_mercThreatBatch='6', easy_saves='true', easy_queueDepth='3')
    add('3 Kolay', 'C0', 'şimdiki ayar', run('C0', [], None, 'karisik'))
    add('3 Kolay', 'C1', 'yalnız ekonomi hatası 0,25→0,08, slack 2→1', run('C1', [], E(easy_ecoMistake='0.08', easy_slack='1'), 'karisik'))
    add('3 Kolay', 'C2', 'C1 + orman/ekonomi yetenekleri (tüm çeyrekleri gez, her sandık, 2 gözcü, paralı 3, birikim, kuyruk 3)', run('C2', [], E(**eco), 'karisik'))
    add('3 Kolay', 'C3', 'C2 + hesaplı saldırı/kamp (taktik hata oranı 0,25 kalır)', run('C3', [], E(**eco, easy_calculates='true'), 'karisik'))
    add('3 Kolay', 'C4', 'C3 + akıllı savunma', run('C4', [], E(**eco, easy_calculates='true', easy_smartDefense='true'), 'karisik'))
    add('3 Kolay', 'C5', 'C3 + düşünme 6–10 → 3–5 sn', run('C5', [], E(**eco, easy_calculates='true', easy_thinkMin='3', easy_thinkMax='5'), 'karisik'))
    add('3 Kolay', 'C6', 'C3 + düşünme 6–10 → 4–6 sn', run('C6', [], E(**eco, easy_calculates='true', easy_thinkMin='4', easy_thinkMax='6'), 'karisik'))
    add('3 Kolay', 'C7', 'C3 + düşünme 6–10 → 4–7 sn', run('C7', [], E(**eco, easy_calculates='true', easy_thinkMin='4', easy_thinkMax='7'), 'karisik'))
    add('3 Kolay', 'C8', 'C3 + düşünme 6–10 → 5–8 sn', run('C8', [], E(**eco, easy_calculates='true', easy_thinkMin='5', easy_thinkMax='8'), 'karisik'))
    add('3 Kolay', 'C9', 'C3 + düşünme 6–10 → 4–8 sn (önerilen)', run('C9', [], E(**eco, easy_calculates='true', easy_thinkMin='4', easy_thinkMax='8'), 'karisik'))

if not OLD:
    # ---- son kontrol: balance.json'un şimdiki değerleriyle ----
    add('4 Son', 'D0', 'Orta vs Orta, şimdiki ayar (paralı payı + pasiflik)', run('D0', []))
    add('4 Son', 'D1', 'Orta vs Kolay (karışık), şimdiki ayar', run('D1', [], None, 'karisik'))
    add('4 Son', 'B10', 'puana duyarlı botlar, zafer puanı YOK (nüfus kuralı)', run('B10', [], lambda t: bots(t, scoreAware='true')))
    add('4 Son', 'B2', 'puana duyarlı botlar + zafer puanı (karşılaştırma)', run('B2s', SCORE, lambda t: bots(t, scoreAware='true')))

    E = lambda **kw: (lambda t: bots(t, **kw))
    # Kolay'ın düşünme süresi alternatifleri (yeni paralı/altın ayarıyla); balance.json'a dokunulmaz
    for n, lo, hi in [('E1', 5, 8), ('E2', 6, 10), ('E3', 7, 12), ('E4', 8, 14)]:
        add('4 Son', n, f'Orta vs Kolay, Kolay düşünme {lo}–{hi} sn', run(n, [], E(easy_thinkMin=str(lo), easy_thinkMax=str(hi)), 'karisik'))

head = ['Deney', 'Değişiklik', 'Orta kazanma (karışıkta)', 'Eleme ile biten', 'Saldırısız maç', 'Kale saldırısı/maç', 'Saldırı/koltuk', 'İlk saldırı (savaşın)',
        'Paralı oranı savaş başı', 'Paralı oranı maç sonu', 'Altın/koltuk', 'Nüfus savaş başı', 'Nüfus maç sonu', 'Saldıranın kazanma oranı', 'Eşit olmayan maç']
lines = ['| ' + ' | '.join(head) + ' |', '|' + '---|' * len(head)]
for g, n, what, f in rows:
    lines.append('| ' + ' | '.join([n, what] + [x if i != 0 or g[0] in '34' and n != 'D0' and n[0] != 'B' else '—' for i, x in enumerate(f)]) + ' |')
table = '\n'.join(lines)
print('\n' + table)
if OUT:
    open(OUT, 'w', encoding='utf-8').write(table + '\n')
