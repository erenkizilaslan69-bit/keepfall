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


def run(name, transform):
    path = os.path.join(TMP, name + '.json')
    open(path, 'w', encoding='utf-8').write(transform(BASE))
    cmd = ['dotnet', 'run', '--project', os.path.join(ROOT, 'src', 'BattleSim'), '-c', 'Release', '--no-build', '--',
           'bot', '--config', path, '--mac', str(MATCHES), '--ozet', '1', '--zorluk', 'zor-orta', '--seed', SEED, '--oyuncu', os.environ.get('KF_PLAYERS', '2')]
    r = subprocess.run(cmd, capture_output=True, text=True, encoding='utf-8', cwd=ROOT)
    line = next((l for l in r.stdout.split('\n') if l.startswith('ÖZET\t')), None)
    if line is None:
        raise SystemExit(f'{name}: sonuç yok\n{r.stdout[-800:]}{r.stderr[-800:]}')
    return line.split('\t')[1:]


head = ['Deney', 'Değişiklik', 'Zor kazanma', 'Eleme ile biten', 'Saldırısız maç', 'Kale saldırısı/maç', 'Saldırı/koltuk', 'İlk saldırı', 'Paralı savaş başı',
        'Paralı maç sonu', 'Altın/koltuk', 'Nüfus savaş başı', 'Nüfus maç sonu', 'Saldıranın kazanma oranı', 'Eşit olmayan maç']
rows = []
for name, what, tf in VARIANTS:
    if ONLY and name not in ONLY:
        continue
    f = run(name, tf)
    rows.append([name, what] + f)
    print(name, what, f, flush=True)
lines = ['| ' + ' | '.join(head) + ' |', '|' + '---|' * len(head)] + ['| ' + ' | '.join(r) + ' |' for r in rows]
print('\n' + '\n'.join(lines))
if OUT:
    open(os.path.join(ROOT, OUT), 'w', encoding='utf-8').write('\n'.join(lines) + '\n')
