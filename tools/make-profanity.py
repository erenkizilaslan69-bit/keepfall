# Writes src/Keepfall.Core/Match/Profanity/<lang>.txt: the swear-word lists of the envoy message / name filter for the languages other than Turkish and English (those two keep their
# lists in EnvoyMessage.cs). A CURATED subset of the CC BY 4.0 lists of github.com/LDNOOBW/List-of-Dirty-Naughty-Obscene-and-Otherwise-Bad-Words (see the LICENSE file next to them):
# the raw lists hold ordinary words (Russian "голый", Portuguese "cerveja", Spanish "martillo", Italian "pesce") and sexual vocabulary, so only real swear words and slurs were
# kept; entries that are also everyday words in another language (French "bite", Spanish "pinche", Portuguese "veado", Korean "보지") were left out on purpose.
# Ukrainian has no list in that project: its list is written by hand (docs/kufur-filtresi.md says so).
# Entry forms: `word` = that whole word only; `stem*` = any word that begins with it (inflections); for zh / ja / ko (no spaces between words) every entry matches as a substring of >= 2 characters.
import os

OUT = os.path.join(os.path.dirname(__file__), '..', 'src', 'Keepfall.Core', 'Match', 'Profanity')
os.makedirs(OUT, exist_ok=True)

LISTS = {
  'en': ['arsehole', 'bollocks', 'bullshit*', 'blowjob*', 'clusterfuck*', 'cocksucker*', 'cumshot*', 'dildo*', 'kike', 'kikes', 'spic', 'spics', 'wetback*', 'beaner*', 'raghead*', 'towelhead*', 'tranny', 'jizz', 'tosser', 'bukkake', 'dickhead*', 'douchebag*', 'skank*', 'retard', 'retards', 'retarded'],
  'de': ['arsch*', 'arschloch*', 'fotze*', 'votze*', 'hurensohn*', 'hure', 'huren', 'schlampe*', 'scheiße', 'scheisse', 'scheiß*', 'scheiss*', 'schwanzlutscher*', 'schwuchtel*', 'wichser*', 'wichsen', 'nutte*', 'neger*', 'kanake*', 'ficken', 'fick', 'ficker*', 'verfickt*', 'fickfehler*', 'spast*', 'drecksau*', 'mistkerl*', 'dummficker*'],
  'es': ['mierda*', 'puta', 'putas', 'putada', 'putadas', 'putaria', 'puto', 'putos', 'putada*', 'hijoputa*', 'hijaputa*', 'coño*', 'joder*', 'jodido*', 'cabrón*', 'cabron*', 'gilipollas*', 'jilipollas*', 'gilipuertas', 'pendejo*', 'pendeja*', 'marica*', 'maricón*', 'maricon*', 'mariconazo*', 'verga', 'vergas', 'chingar*', 'chingada*', 'chingado*', 'chingue*', 'culero*', 'follar*', 'soplapollas*', 'cojones', 'carajo*', 'mamón*', 'mamon*', 'puñetero*', 'cagada*', 'culiao*', 'conchetumare*', 'conchesumadre*', 'hdp'],
  'fr': ['merde*', 'putain*', 'pute', 'putes', 'salope*', 'connard*', 'connasse*', 'enculé*', 'encule*', 'enculer*', 'enfoiré*', 'enfoire*', 'niquer*', 'nique', 'nique ta mère', 'pédé*', 'fils de pute', 'fille de pute', 'couilles', 'branleur*', 'branleuse*', 'salaud*', 'pouffiasse*', 'tapette*', 'gouine*', 'nègre*', 'negre*', 'bordel de merde', 'ta gueule', 'ferme ta gueule', 'trou du cul', 'fdp'],
  'it': ['merda*', 'cazzo*', 'cazzate', 'coglione*', 'coglioni', 'stronzo*', 'stronza*', 'stronzata*', 'puttana*', 'troia*', 'vaffanculo*', 'fottiti*', 'minchia*', 'frocio*', 'recchione*', 'zoccola*', 'pompino*', 'mignotta*', 'sborra*', 'figlio di puttana', 'testa di cazzo', 'rompicoglioni', 'incazzato*', 'bastardo*', 'culattone*'],
  'pt': ['merda*', 'caralho*', 'puta', 'putas', 'putaria', 'puto', 'filho da puta', 'filha da puta', 'foda-se', 'foder', 'fodido*', 'porra*', 'cuzão', 'cuzao', 'buceta*', 'boceta*', 'viado', 'viadinho*', 'paneleiro*', 'vai tomar no cu', 'vai-te foder', 'arrombado*', 'puta que pariu', 'puta que te pariu', 'cuzona', 'vagabunda*', 'fdp'],
  'pl': ['kurwa*', 'kurwy', 'kurwić*', 'kurew*', 'chuj*', 'chuja', 'huj*', 'pierdol*', 'pierdal*', 'jebać*', 'jebany*', 'jebie*', 'jebnięty*', 'jebnij*', 'pizda*', 'pizdy', 'pizdę', 'skurwysyn*', 'skurwiel*', 'cipa', 'cipę', 'cipy', 'fiut*', 'kutas*', 'dziwka*', 'dziwki', 'pojeb*', 'zjeb*', 'spierdalaj*', 'wypierdalaj*', 'odpierdol*', 'zapierdal*', 'cwel*', 'ciota*', 'gówno', 'gówna'],
  'ru': ['хуй*', 'хуя', 'хую', 'хуе', 'хуё*', 'хуи', 'нахуй*', 'пизд*', 'блядь*', 'блять*', 'бляд*', 'ебать*', 'ебан*', 'еблан*', 'ебал*', 'ебат*', 'заеб*', 'уебок*', 'уёбок*', 'сука', 'суки', 'сучка*', 'сучар*', 'пидор*', 'пидар*', 'мудак*', 'мудил*', 'гандон*', 'залуп*', 'шлюха*', 'шлюхи', 'манда', 'говно*', 'дрочи*', 'пиздец*', 'ёб*', 'выеб*', 'ёбан*', 'охуе*', 'нахер', 'долбоёб*', 'долбоеб*', 'ублюдок*', 'мразь'],
  'uk': ['хуй*', 'хуя', 'хую', 'хуї', 'нахуй*', 'пизд*', 'пізд*', 'бляд*', 'блят*', 'блять', 'єбан*', 'ебан*', 'їбан*', 'єбат*', 'їбат*', 'їбав*', 'єбав*', 'сука', 'суки', 'сучк*', 'курв*', 'мудак*', 'підар*', 'підор*', 'гандон*', 'залуп*', 'шльонд*', 'шлюх*', 'довбойоб*', 'довбоєб*', 'уйобок*', 'уйобк*', 'підарас*', 'срак*', 'срати', 'гівно*', 'говно*', 'нахер', 'їбись', 'їбать', 'їбло'],
  'zh': ['操你妈', '操你媽', '草泥马', '草泥馬', '他妈的', '他媽的', '妈的', '媽的', '傻逼', '傻屄', '傻B', '煞笔', '沙比', '妈逼', '媽逼', '狗日', '婊子', '贱人', '賤人', '贱货', '賤貨', '王八蛋', '尼玛', '鸡巴', '雞巴', '日你妈', '干你娘', '幹你娘', '傻比', '去你妈', '去你媽', '脑残', '腦殘', '滚你妈', '賤種', '贱种'],
  'ja': ['死ね', 'くそ野郎', 'クソ野郎', 'ちんこ', 'チンコ', 'ちんぽ', 'チンポ', 'まんこ', 'マンコ', 'おまんこ', 'オマンコ', 'ファック', 'ビッチ', 'やりまん', 'ヤリマン', '淫乱', '売女', '糞野郎', 'うんこ野郎', 'くたばれ', 'ぶっ殺す', 'クソババア', 'クソジジイ'],
  'ko': ['씨발', '씨팔', '시발', '씹새끼', '병신', '개새끼', '좆', '존나', '지랄', '염병', '옘병', '엿먹어', '미친놈', '미친년', '창녀', '개년', '쌍놈', '썅', '씨부랄', '좆같', '썅년', '빙신', '닥쳐'],
}
HEADER = '# {lang}: swear words of the envoy message / player name filter (EnvoyMessage.cs). A curated subset of the CC BY 4.0 LDNOOBW list (see LICENSE-LDNOOBW.md){note}.\n# `word` = whole word, `stem*` = any word beginning with it{cjk}. Add a word here and it is filtered; remove one that masks an innocent word.\n'
for lang, words in LISTS.items():
    note = '; hand-written, no list exists for this language in that project' if lang == 'uk' else ''
    cjk = '; for zh/ja/ko every entry is a substring match' if lang in ('zh', 'ja', 'ko') else ''
    seen, out = set(), []
    for w in words:
        k = w.lower()
        if k not in seen:
            seen.add(k); out.append(w)
    with open(os.path.join(OUT, lang + '.txt'), 'w', encoding='utf-8', newline='\n') as f:
        f.write(HEADER.format(lang=lang, note=note, cjk=cjk))
        f.write('\n'.join(out) + '\n')
    print(lang, len(out))
