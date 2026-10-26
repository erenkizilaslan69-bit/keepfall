#!/usr/bin/env python3
"""
Zor bot ölçümü: config/balance.json'u DEĞİŞTİRMEDEN, geçici kopyalarla `BattleSim bot --zorluk zor-orta` (Zor ve Orta karışık oturur) çalıştırır.
Kullanım: python tools/bot-zor.py [maç sayısı] [çıktı.md] [seed] [varyant,varyant,…]
Varyantlar aşağıdaki VARIANTS içinde (adlarıyla); verilmezse hepsi.
"""
import os, re, subprocess, sys, tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MATCHES = int(sys.argv[1]) if len(sys.argv) > 1 else 200
OUT = sys.argv[2] if len(sys.argv) > 2 and sys.argv[2] != '-' else None
SEED = sys.argv[3] if len(sys.argv) > 3 else '1'
ONLY = sys.argv[4].split(',') if len(sys.argv) > 4 else None
BASE = open(os.path.join(ROOT, 'config', 'balance.json'), encoding='utf-8-sig').read()
TMP = tempfile.mkdtemp(prefix='keepfall-zor-')


def hard(text, **kw):
    """"hard" satırındaki anahtarları değiştirir (satır tek satır olmalı)."""
    lines = text.split('\n')
    i = next(k for k, l in enumerate(lines) if re.match(r'\s*"hard":', l))
    for name, value in kw.items():
        if re.search(rf'"{name}":', lines[i]):
            lines[i] = re.sub(rf'("{name}":\s*)[^,}}\s]+', lambda m: f'{m.group(1)}{value}', lines[i])
        else:
            lines[i] = re.sub(r'\s*\}\s*,?\s*$', lambda m: f', "{name}": {value} ' + m.group(0).strip(), lines[i])
    return '\n'.join(lines)


# ad -> (açıklama, dönüştürücü)
VARIANTS = [
    ('Z0', 'şimdiki Zor ayarı', lambda t: t),
    ('Z1', 'silah depoda tutma KAPALI', lambda t: hard(t, holdWeapons='false')),
    ('Z2', 'karşı birlik üretimi KAPALI', lambda t: hard(t, counterUnits='false')),
    ('Z3', 'fırsat kollama KAPALI', lambda t: hard(t, opportunist='false')),
    ('Z4', 'erken yükseltme + sık gözcü KAPALI', lambda t: hard(t, upgradeEarly='false', scoutFactor='1.0')),
    ('Z5', 'yalnız hız (hepsi KAPALI)', lambda t: hard(t, holdWeapons='false', counterUnits='false', opportunist='false', upgradeEarly='false', scoutFactor='1.0')),
    ('Z6', 'fırsat + erken yükseltme + sık gözcü KAPALI', lambda t: hard(t, opportunist='false', upgradeEarly='false', scoutFactor='1.0')),
    ('Z7', 'fırsat + erken yükseltme KAPALI', lambda t: hard(t, opportunist='false', upgradeEarly='false')),
    ('Z8', 'fırsat + sık gözcü KAPALI', lambda t: hard(t, opportunist='false', scoutFactor='1.0')),
    ('Z9', 'fırsat + karşı birlik KAPALI', lambda t: hard(t, opportunist='false', counterUnits='false')),
    ('Y1', 'fırsat (yeni, yumuşak) AÇIK + sık gözcü KAPALI', lambda t: hard(t, scoutFactor='1.0')),
    ('Y2', 'Y1 + erken yükseltme KAPALI', lambda t: hard(t, scoutFactor='1.0', upgradeEarly='false')),
    ('N1', 'düşünme 0,7–1,2 sn, tepki 1–2 sn', lambda t: hard(t, thinkMin='0.7', thinkMax='1.2', reactMin='1', reactMax='2')),
    ('N2', 'silah sırası 6', lambda t: hard(t, queueDepth='6')),
    ('N3', 'evde bırakma payı %15', lambda t: hard(t, keepHome='0.15')),
    ('N4', 'N1 + N2', lambda t: hard(t, thinkMin='0.7', thinkMax='1.2', reactMin='1', reactMax='2', queueDepth='6')),
]
# Kuşanma süresi (match.armSeconds): Zor vs Orta, silahı depoda tutmakla ve tutmadan, ve Orta vs Orta (saldırısız maç oranı, nüfus için)
for _n in (0, 10, 15, 20):
    VARIANTS.append((f'A{_n}', f'kuşanma {_n} sn: Zor vs Orta', lambda t, n=_n: match(t, armSeconds=n)))
    VARIANTS.append((f'A{_n}h', f'kuşanma {_n} sn: Zor vs Orta, silahı depoda tutma KAPALI', lambda t, n=_n: hard(match(t, armSeconds=n), holdWeapons='false')))
    VARIANTS.append((f'A{_n}o', f'kuşanma {_n} sn: Orta vs Orta', lambda t, n=_n: match(t, armSeconds=n)))
# Öngörü (armSeconds = balance.json'daki değer, 15): Zor'un hazırlığı
for _name, _what, _kw in [('F0', 'öngörü KAPALI', dict(foresight='false', garrisonShare='0')),
                          ('F1', 'görüşte kuşanma açık, garnizon yok', dict(foresight='true', garrisonShare='0')),
                          ('F2', 'garnizon %30', dict(foresight='true', garrisonShare='0.3')),
                          ('F3', 'garnizon %50', dict(foresight='true', garrisonShare='0.5')),
                          ('F6', 'garnizon %40', dict(foresight='true', garrisonShare='0.4')),
                          ('F7', 'garnizon %60', dict(foresight='true', garrisonShare='0.6')),
                          ('G1', 'garnizon %20', dict(foresight='true', garrisonShare='0.2')),
                          ('G2', 'garnizon %30, evde bırakma %15', dict(foresight='true', garrisonShare='0.3', keepHome='0.15')),
                          ('G3', 'garnizon yok, evde bırakma %15', dict(foresight='true', garrisonShare='0', keepHome='0.15')),
                          ('G4', 'garnizon %25, evde bırakma %10', dict(foresight='true', garrisonShare='0.25', keepHome='0.1')),
                          ('F4', 'garnizon %70', dict(foresight='true', garrisonShare='0.7')),
                          ('F5', 'garnizon %50, tutma KAPALI', dict(foresight='true', garrisonShare='0.5', holdWeapons='false'))]:
    VARIANTS.append((_name, _what, lambda t, kw=_kw: hard(t, **kw)))
# Sur: öncesi (bonus yok, bot yükseltmez), yalnız okçu bonusu, ve şimdiki (bonus + botlar yükseltir)
_noBonus = lambda t: t.replace('"archerDefenseBonus": 0.25', '"archerDefenseBonus": 0')
_noUpgrade = lambda t: t.replace('"wallUpgrade": true', '"wallUpgrade": false')
for _name, _what, _tf in [('W0', 'sur öncesi: okçu bonusu yok, bot yükseltmez', lambda t: _noUpgrade(_noBonus(t))),
                          ('W1', 'yalnız okçu bonusu, bot yükseltmez', _noUpgrade),
                          ('W2', 'sur şimdiki ayar (bonus + botlar yükseltir)', lambda t: t)]:
    VARIANTS.append((_name, _what + ': Zor vs Orta', _tf))
    VARIANTS.append((_name + 'o', _what + ': Orta vs Orta', _tf))
# Sur canı önerileri (Sv2 / Sv3 canı; Sv1 500 sabit)
def _walls(a, b):
    return lambda t: t.replace('"hp": 1000,', f'"hp": {a},').replace('"hp": 1800,', f'"hp": {b},')
for _name, _a, _b in [('P1', 750, 1100), ('P2', 800, 1300), ('P3', 1000, 1400), ('P4', 700, 900)]:
    VARIANTS.append((_name, f'sur canı Sv2 {_a} / Sv3 {_b}: Zor vs Orta', _walls(_a, _b)))
    VARIANTS.append((_name + 'o', f'sur canı Sv2 {_a} / Sv3 {_b}: Orta vs Orta', _walls(_a, _b)))
VARIANTS.append(('Fz', 'şimdiki Zor ayarı (öngörü + garnizon %20)', lambda t: t))
VARIANTS.append(('Fh', 'öngörü ayarı, depoda tutma KAPALI', lambda t: hard(t, holdWeapons='false')))
VARIANTS.append(('Fo', 'Orta vs Orta (şimdiki ayar)', lambda t: t))


def match(text, **kw):
    """"match" bölümündeki tek sayıları değiştirir."""
    for name, value in kw.items():
        text, n = re.subn(r'("' + name + r'":\s*)[^,\n}]+', lambda m: f'{m.group(1)}{value}', text, count=1)
        assert n == 1, name
    return text


def run(name, transform, level='zor-orta'):
    path = os.path.join(TMP, name + '.json')
    open(path, 'w', encoding='utf-8').write(transform(BASE))
    cmd = ['dotnet', 'run', '--project', os.path.join(ROOT, 'src', 'BattleSim'), '-c', 'Release', '--no-build', '--',
           'bot', '--config', path, '--mac', str(MATCHES), '--ozet', '1', '--zorluk', level, '--seed', SEED, '--oyuncu', os.environ.get('KF_PLAYERS', '2')]
    r = subprocess.run(cmd, capture_output=True, text=True, encoding='utf-8', cwd=ROOT)
    line = next((l for l in r.stdout.split('\n') if l.startswith('ÖZET\t')), None)
    if line is None:
        raise SystemExit(f'{name}: sonuç yok\n{r.stdout[-800:]}{r.stderr[-800:]}')
    return line.split('\t')[1:]


head = ['Deney', 'Değişiklik', 'Zor kazanma', 'Eleme ile biten', 'Saldırısız maç', 'Kale saldırısı/maç', 'Saldırı/koltuk', 'İlk saldırı', 'Paralı savaş başı',
        'Paralı maç sonu', 'Altın/koltuk', 'Nüfus savaş başı', 'Nüfus maç sonu', 'Saldıranın kazanma oranı', 'Eşit olmayan maç', 'İlk eleme (savaştan)']
rows = []
for name, what, tf in VARIANTS:
    if ONLY and name not in ONLY:
        continue
    f = run(name, tf, 'orta' if name.endswith('o') else 'zor-orta')
    rows.append([name, what] + f)
    print(name, what, f, flush=True)
lines = ['| ' + ' | '.join(head) + ' |', '|' + '---|' * len(head)] + ['| ' + ' | '.join(r) + ' |' for r in rows]
print('\n' + '\n'.join(lines))
if OUT:
    open(os.path.join(ROOT, OUT), 'w', encoding='utf-8').write('\n'.join(lines) + '\n')
