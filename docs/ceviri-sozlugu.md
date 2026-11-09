# Çeviri sözlüğü (15 dil)

Bu terimler **her dilde sabittir**: çeviri yapılırken ve `docs/ceviri-kaynak.tsv` doldurulurken buradan alınır, kendi başına yeni karşılık uydurulmaz. Tablo İngilizceden okunur (İngilizce, Türkçe anahtarın karşılığıdır). Anadili konuşan biri düzeltirse önce bu tablo, sonra `client/src/i18n/langs/<kod>.ts` güncellenir (`node tools/i18n-check.mjs` yer tutucuları denetler).

**Üslup (her dil için):** oyunun tonu sıcak, kısa ve biraz esprili bir ortaçağ stratejisi; resmî değil. Düğmeler kısa ve emir kipi ("Oda kur" → "Create Room"), açıklamalar tek-iki kısa cümle. Hitap: İngilizce/Almanca/Fransızca/İspanyolca/İtalyanca/Portekizce/Lehçe/Rusça/Ukraynaca'da **sen** (de: du, fr: tu, es: tú / es-419: tú (vos yok), it: tu, pt-BR: você, pl: ty ya da emir kipi, ru/uk: ты ya da emir kipi — "вы" kullanma), Japoncada **です・ます (nazik, kısa)**, Korecede **해요체**, Çincede **你** (nihai, kısa). Sayı biçimleri koddan gelir (`{0}` değişmez). `<b>…</b>` işaretleri ve `{0}`, `{1}` yer tutucuları aynen korunur; çoğul `{0:bir|çok}` biçimi dile göre `{0:tek|çoğul}` ya da (ru/uk/pl) `{0:bir|birkaç|çok}`, zh/ja/ko tek biçim.

**Hiç çevrilmeyenler:** Keepfall (oyun adı, her dilde "Keepfall"), oyuncu adları, oda kodu, "Red Lion Games", Tiny Swords / Pixel Frog / Kenney vb. kredi adları.

| İngilizce | Türkçe | zh-CN | zh-TW | ru | es-ES | es-419 | pt-BR | de | fr | ja | ko | pl | it | uk |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Castle | Kale | 城堡 | 城堡 | Замок | Castillo | Castillo | Castelo | Burg | Château | 城 | 성 | Zamek | Castello | Замок |
| Gate | Kapı | 城门 | 城門 | Ворота | Puerta | Puerta | Portão | Tor | Porte | 城門 | 성문 | Brama | Portone | Ворота |
| Kingdom | Krallık | 王国 | 王國 | Королевство | Reino | Reino | Reino | Königreich | Royaume | 王国 | 왕국 | Królestwo | Regno | Королівство |
| Shadow Kingdom | Gölge Krallığı | 暗影王国 | 暗影王國 | Королевство Теней | Reino de las Sombras | Reino de las Sombras | Reino das Sombras | Schattenreich | Royaume des Ombres | 影の王国 | 그림자 왕국 | Królestwo Cieni | Regno delle Ombre | Королівство Тіней |
| Merchant Republic | Tüccar Cumhuriyeti | 商人共和国 | 商人共和國 | Республика Торговцев | República Mercante | República Mercante | República Mercante | Händlerrepublik | République marchande | 商人共和国 | 상인 공화국 | Republika Kupców | Repubblica dei Mercanti | Республіка Торговців |
| The Oracles | Kâhinler | 先知 | 先知 | Оракулы | Los Oráculos | Los Oráculos | Os Oráculos | Die Orakel | Les Oracles | 神託者 | 예언자 | Wyrocznie | Gli Oracoli | Оракули |
| The Schemers | Entrikacılar | 阴谋家 | 陰謀家 | Интриганы | Los Intrigantes | Los Intrigantes | Os Intrigantes | Die Intriganten | Les Intrigants | 策謀家 | 음모가 | Intryganci | Gli Intriganti | Інтригани |
| Shadow (singular) | Gölge | 暗影 | 暗影 | Тень | Sombra | Sombra | Sombra | Schatten | Ombre | 影 | 그림자 | Cień | Ombra | Тінь |
| Merchant (singular) | Tüccar | 商人 | 商人 | Торговец | Mercante | Mercante | Mercante | Händler | Marchand | 商人 | 상인 | Kupiec | Mercante | Торговець |
| Oracle (singular) | Kâhin | 先知 | 先知 | Оракул | Oráculo | Oráculo | Oráculo | Orakel | Oracle | 神託者 | 예언자 | Wyrocznia | Oracolo | Оракул |
| Schemer (singular) | Entrikacı | 阴谋家 | 陰謀家 | Интриган | Intrigante | Intrigante | Intrigante | Intrigant | Intrigant | 策謀家 | 음모가 | Intrygant | Intrigante | Інтриган |
| Swordsman | Kılıçlı | 剑士 | 劍士 | Мечник | Espadachín | Espadachín | Espadachim | Schwertkämpfer | Épéiste | 剣士 | 검사 | Miecznik | Spadaccino | Мечник |
| Spearman | Mızrakçı | 枪兵 | 槍兵 | Копейщик | Lancero | Lancero | Lanceiro | Speerträger | Lancier | 槍兵 | 창병 | Włócznik | Lanciere | Списник |
| Shieldbearer | Kalkanlı | 盾兵 | 盾兵 | Щитоносец | Escudero | Escudero | Escudeiro | Schildträger | Porte-bouclier | 盾兵 | 방패병 | Tarczownik | Scudiero | Щитоносець |
| Archer | Okçu | 弓箭手 | 弓箭手 | Лучник | Arquero | Arquero | Arqueiro | Bogenschütze | Archer | 弓兵 | 궁수 | Łucznik | Arciere | Лучник |
| Monk | Keşiş | 僧侣 | 僧侶 | Монах | Monje | Monje | Monge | Mönch | Moine | 僧侶 | 수도사 | Mnich | Monaco | Монах |
| Catapult | Mancınık | 投石机 | 投石機 | Катапульта | Catapulta | Catapulta | Catapulta | Katapult | Catapulte | 投石機 | 투석기 | Katapulta | Catapulta | Катапульта |
| Cavalry | Süvari | 骑兵 | 騎兵 | Кавалерия | Caballería | Caballería | Cavalaria | Reiterei | Cavalerie | 騎兵 | 기병 | Kawaleria | Cavalleria | Кавалерія |
| Soldier | Asker | 士兵 | 士兵 | Солдат | Soldado | Soldado | Soldado | Soldat | Soldat | 兵士 | 병사 | Żołnierz | Soldato | Солдат |
| Worker | İşçi | 工人 | 工人 | Рабочий | Trabajador | Trabajador | Trabalhador | Arbeiter | Ouvrier | 労働者 | 일꾼 | Robotnik | Lavoratore | Робітник |
| Farmer | Çiftçi | 农夫 | 農夫 | Земледелец | Granjero | Granjero | Fazendeiro | Bauer | Fermier | 農夫 | 농부 | Rolnik | Contadino | Землероб |
| Woodcutter | Oduncu | 伐木工 | 伐木工 | Дровосек | Leñador | Leñador | Lenhador | Holzfäller | Bûcheron | 木こり | 나무꾼 | Drwal | Boscaiolo | Дроворуб |
| Miner | Madenci | 矿工 | 礦工 | Шахтёр | Minero | Minero | Minerador | Bergmann | Mineur | 鉱夫 | 광부 | Górnik | Minatore | Шахтар |
| Blacksmith | Demirci / Demirhane | 铁匠 / 铁匠铺 | 鐵匠 / 鐵匠鋪 | Кузнец / Кузница | Herrero / Herrería | Herrero / Herrería | Ferreiro / Ferraria | Schmied / Schmiede | Forgeron / Forge | 鍛冶屋 | 대장장이 / 대장간 | Kowal / Kuźnia | Fabbro / Fucina | Коваль / Кузня |
| Farm | Tarla | 农田 | 農田 | Ферма | Granja | Granja | Fazenda | Bauernhof | Ferme | 農場 | 농장 | Farma | Fattoria | Ферма |
| Lumber camp | Oduncu kampı | 伐木场 | 伐木場 | Лесопилка | Aserradero | Aserradero | Serraria | Holzfällerlager | Camp de bûcherons | 伐採所 | 벌목장 | Tartak | Segheria | Лісопильня |
| Mine | Maden | 矿井 | 礦坑 | Шахта | Mina | Mina | Mina | Mine | Mine | 鉱山 | 광산 | Kopalnia | Miniera | Шахта |
| Food | Yemek | 食物 | 食物 | Еда | Comida | Comida | Comida | Nahrung | Nourriture | 食料 | 식량 | Jedzenie | Cibo | Їжа |
| Wood | Odun | 木材 | 木材 | Дерево | Madera | Madera | Madeira | Holz | Bois | 木材 | 목재 | Drewno | Legno | Деревина |
| Iron | Demir | 铁 | 鐵 | Железо | Hierro | Hierro | Ferro | Eisen | Fer | 鉄 | 철 | Żelazo | Ferro | Залізо |
| Gold | Altın | 黄金 | 黃金 | Золото | Oro | Oro | Ouro | Gold | Or | 金 | 금 | Złoto | Oro | Золото |
| Weapon(s) | Silah | 武器 | 武器 | Оружие | Armas | Armas | Armas | Waffen | Armes | 武器 | 무기 | Broń | Armi | Зброя |
| Envoy | Ulak | 信使 | 信使 | Гонец | Emisario | Emisario | Emissário | Bote | Émissaire | 使者 | 사자 | Posłaniec | Emissario | Гонець |
| Scout | Gözcü | 斥候 | 斥候 | Разведчик | Explorador | Explorador | Batedor | Späher | Éclaireur | 斥候 | 정찰병 | Zwiadowca | Esploratore | Розвідник |
| Phantom army | Hayalet ordu | 幻影军 | 幻影軍 | Призрачная армия | Ejército fantasma | Ejército fantasma | Exército fantasma | Phantomheer | Armée fantôme | 幻の軍 | 유령 군대 | Armia widmo | Esercito fantasma | Примарна армія |
| Decoy army | Sahte ordu | 诱饵军 | 誘餌軍 | Ложная армия | Ejército señuelo | Ejército señuelo | Exército isca | Scheinheer | Armée leurre | おとり軍 | 미끼 군대 | Armia-wabik | Esercito esca | Хибна армія |
| Bribe | Rüşvet | 贿赂 | 賄賂 | Подкуп | Soborno | Soborno | Suborno | Bestechung | Pot-de-vin | 買収 | 매수 | Przekupstwo | Corruzione | Підкуп |
| Mercenary | Paralı asker | 雇佣兵 | 傭兵 | Наёмник | Mercenario | Mercenario | Mercenário | Söldner | Mercenaire | 傭兵 | 용병 | Najemnik | Mercenario | Найманець |
| Chest | Sandık | 宝箱 | 寶箱 | Сундук | Cofre | Cofre | Baú | Truhe | Coffre | 宝箱 | 보물상자 | Skrzynia | Forziere | Скриня |
| Village | Köy | 村庄 | 村莊 | Деревня | Aldea | Aldea | Vila | Dorf | Village | 村 | 마을 | Wioska | Villaggio | Село |
| Bandit Camp | Haydut kampı | 强盗营地 | 強盜營地 | Лагерь бандитов | Campamento de bandidos | Campamento de bandidos | Acampamento de bandidos | Banditenlager | Camp de bandits | 山賊の野営地 | 산적 야영지 | Obóz bandytów | Accampamento di banditi | Табір бандитів |
| Forest | Orman | 森林 | 森林 | Лес | Bosque | Bosque | Floresta | Wald | Forêt | 森 | 숲 | Las | Foresta | Ліс |
| Deck | Deste | 兵种组合 | 兵種組合 | Набор | Mazo | Mazo | Baralho | Deck | Deck | デッキ | 덱 | Talia | Mazzo | Набір |
| Row (battle line) | Sıra | 阵列 | 陣列 | Ряд | Fila | Fila | Fileira | Reihe | Rang | 隊列 | 대열 | Szereg | Fila | Ряд |
| Population | Nüfus | 人口 | 人口 | Население | Población | Población | População | Bevölkerung | Population | 人口 | 인구 | Populacja | Popolazione | Населення |
| Prisoners | Esirler | 俘虏 | 俘虜 | Пленные | Prisioneros | Prisioneros | Prisioneiros | Gefangene | Prisonniers | 捕虜 | 포로 | Jeńcy | Prigionieri | Полонені |
| Preparation (phase) | Hazırlık | 准备阶段 | 準備階段 | Подготовка | Preparación | Preparación | Preparação | Vorbereitung | Préparation | 準備フェーズ | 준비 단계 | Przygotowania | Preparazione | Підготовка |
| War (phase) | Savaş | 战争阶段 | 戰爭階段 | Война | Guerra | Guerra | Guerra | Krieg | Guerre | 戦争フェーズ | 전쟁 단계 | Wojna | Guerra | Війна |
| Battle | Savaş / çarpışma | 战斗 | 戰鬥 | Битва | Batalla | Batalla | Batalha | Schlacht | Bataille | 戦闘 | 전투 | Bitwa | Battaglia | Битва |
| Famine | Kıtlık | 饥荒 | 飢荒 | Голод | Hambruna | Hambruna | Fome | Hungersnot | Famine | 飢饉 | 기근 | Głód | Carestia | Голод |
| Fog of war | Savaş sisi | 战争迷雾 | 戰爭迷霧 | Туман войны | Niebla de guerra | Niebla de guerra | Névoa de guerra | Kriegsnebel | Brouillard de guerre | 戦場の霧 | 전장의 안개 | Mgła wojny | Nebbia di guerra | Туман війни |
| Report | Rapor | 报告 | 報告 | Донесение | Informe | Informe | Relatório | Bericht | Rapport | 報告 | 보고서 | Raport | Rapporto | Донесення |
| Spectator | İzleyici | 观战者 | 觀戰者 | Наблюдатель | Espectador | Espectador | Espectador | Zuschauer | Spectateur | 観戦者 | 관전자 | Widz | Spettatore | Глядач |
| Victory | Zafer | 胜利 | 勝利 | Победа | Victoria | Victoria | Vitória | Sieg | Victoire | 勝利 | 승리 | Zwycięstwo | Vittoria | Перемога |
| Defeat | Yenilgi | 失败 | 失敗 | Поражение | Derrota | Derrota | Derrota | Niederlage | Défaite | 敗北 | 패배 | Porażka | Sconfitta | Поразка |
| Challenges (solo mode) | Meydan Okuma | 挑战 | 挑戰 | Испытания | Desafíos | Desafíos | Desafios | Herausforderungen | Défis | チャレンジ | 도전 과제 | Wyzwania | Sfide | Випробування |
| Quick Match | Hızlı oyna | 快速对局 | 快速對局 | Быстрая игра | Partida rápida | Partida rápida | Partida rápida | Schnelles Spiel | Partie rapide | クイックマッチ | 빠른 대전 | Szybka gra | Partita rapida | Швидка гра |
| Create Room | Oda kur | 创建房间 | 建立房間 | Создать комнату | Crear sala | Crear sala | Criar sala | Raum erstellen | Créer un salon | ルームを作る | 방 만들기 | Utwórz pokój | Crea stanza | Створити кімнату |
| Join Room | Odaya katıl | 加入房间 | 加入房間 | Войти в комнату | Unirse a una sala | Unirse a una sala | Entrar na sala | Raum beitreten | Rejoindre un salon | ルームに参加 | 방 참가 | Dołącz do pokoju | Entra in una stanza | Приєднатися до кімнати |
| Room code | Oda kodu | 房间代码 | 房間代碼 | Код комнаты | Código de sala | Código de sala | Código da sala | Raumcode | Code du salon | ルームコード | 방 코드 | Kod pokoju | Codice stanza | Код кімнати |
| Bot (Easy / Medium / Hard) | Bot (Kolay / Orta / Zor) | 机器人（简单 / 中等 / 困难） | 機器人（簡單 / 中等 / 困難） | Бот (Лёгкий / Средний / Сложный) | Bot (Fácil / Medio / Difícil) | Bot (Fácil / Medio / Difícil) | Bot (Fácil / Médio / Difícil) | Bot (Leicht / Mittel / Schwer) | Bot (Facile / Moyen / Difficile) | ボット（かんたん / ふつう / むずかしい） | 봇 (쉬움 / 보통 / 어려움) | Bot (Łatwy / Średni / Trudny) | Bot (Facile / Medio / Difficile) | Бот (Легкий / Середній / Складний) |
| Tutorial / Guide | Rehber | 教程 | 教學 | Обучение | Tutorial | Tutorial | Tutorial | Tutorial | Tutoriel | チュートリアル | 튜토리얼 | Samouczek | Tutorial | Навчання |
| Settings | Ayarlar | 设置 | 設定 | Настройки | Ajustes | Ajustes | Configurações | Einstellungen | Paramètres | 設定 | 설정 | Ustawienia | Impostazioni | Налаштування |

## Notlar

- **İngilizce çoğul ve cinsiyet:** `{0:soldier|soldiers}` gibi kalıplarda her dil kendi kuralını yazar (ru/uk/pl üç biçim: 1 / 2–4 / 5+). Sayı gelmeyen yerde çoğul biçim kullanılır.
- **zh-CN / zh-TW:** iki yazı sistemi ayrı çevrilir (Tayvan kullanımı: 伺服器, 資訊, 軟體…); zh-TW yalnız zh-CN'nin karakter çevirisi değildir.
- **es-ES / es-419:** `vosotros` yok (es-ES de `tú` / emir kipi, "ustedes" yalnız es-419'da çoğul hitapta); es-ES "ordenador, vale, coger", es-419 "computadora, bueno, tomar/agarrar" gibi kullanımları ayırır; "partida", "sala" ortak.
- **Mağaza açıklaması** terimleri aynı tabloyla yazılır (`docs/steam-magaza-diller/`).
