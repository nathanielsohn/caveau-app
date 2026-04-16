import {
  PrismaClient,
  Role,
  Tier,
  AlertType,
  Severity,
  FacilityEventType,
  DispositionType,
  WineStatus,
} from '@prisma/client';
import { createHmac } from 'crypto';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

// ── Wine catalog ──────────────────────────────────────────────────────

const wines = [
  // Caveau Private Label (5) — matches pitch deck
  { name: 'Caveau Russian River Valley Pinot Noir', vintage: 2022, region: 'Russian River Valley', varietal: 'Pinot Noir', producer: 'Caveau Wines', purchasePrice: 75, currentValue: 85, tastingNotes: 'Bright cherry and raspberry with earthy undertones, rose petal, and subtle baking spice. Sourced from Gary Farrell and Moshin Vineyards. Blind-tested against 3 Sticks before release.', drinkWindowStart: 2024, drinkWindowEnd: 2030 },
  { name: 'Caveau Napa Valley Cabernet Sauvignon', vintage: 2021, region: 'Napa Valley', varietal: 'Cabernet Sauvignon', producer: 'Caveau Wines', purchasePrice: 85, currentValue: 95, tastingNotes: 'Dense blackcurrant and cassis with cedar, tobacco, and a hint of dark chocolate. Rutherford/Oakville AVA fruit, 18+ months in oak. Winemaker collaboration with Mark Schmidt.', drinkWindowStart: 2024, drinkWindowEnd: 2035 },
  { name: 'Caveau Reserve Cabernet Sauvignon', vintage: 2020, region: 'Napa Valley', varietal: 'Cabernet Sauvignon', producer: 'Caveau Wines', purchasePrice: 110, currentValue: 125, tastingNotes: 'Limited allocation only. Barrel-selected from the finest lots. Extraordinary depth of cassis, graphite, and espresso with velvety tannins and a long, persistent finish.', drinkWindowStart: 2025, drinkWindowEnd: 2038 },
  { name: 'Caveau Sonoma Coast Chardonnay', vintage: 2022, region: 'Sonoma Coast', varietal: 'Chardonnay', producer: 'Caveau Wines', purchasePrice: 55, currentValue: 60, tastingNotes: 'Crisp green apple and citrus with toasted almond, vanilla, and a mineral finish. Elegant and well-structured. A showcase of Sonoma Coast terroir.', drinkWindowStart: 2024, drinkWindowEnd: 2028 },
  { name: 'Caveau Paso Robles Syrah', vintage: 2021, region: 'Paso Robles', varietal: 'Syrah', producer: 'Caveau Wines', purchasePrice: 65, currentValue: 72, tastingNotes: 'Smoky blackberry and blueberry with cracked pepper, cured meat, and violet. Dense and concentrated with a savory finish. Only available at Caveau.', drinkWindowStart: 2024, drinkWindowEnd: 2034 },

  // Investment Grade (10) — matches Rob Saenz's 10-bottle portfolio (Caveau_10_Bottles.pdf)
  { name: 'Pétrus', vintage: 2018, region: 'Bordeaux', varietal: 'Merlot', producer: 'Pétrus', purchasePrice: 5800, currentValue: 6413, tastingNotes: 'Opulent truffle, black cherry, and iron minerality. Liquid velvet with an architectural structure that defies the varietal. The room\'s conversation piece — rarest Merlot on earth.', drinkWindowStart: 2028, drinkWindowEnd: 2060 },
  { name: 'Screaming Eagle Cabernet Sauvignon', vintage: 2019, region: 'Napa Valley', varietal: 'Cabernet Sauvignon', producer: 'Screaming Eagle', purchasePrice: 3200, currentValue: 3515, tastingNotes: 'Pure cassis and blackberry with graphite, espresso, and crushed violets. Extraordinary density yet weightless on the palate. 100 pts from Vinous — Liv-ex\'s best-performing California estate.', drinkWindowStart: 2026, drinkWindowEnd: 2055 },
  { name: 'Harlan Estate', vintage: 2018, region: 'Napa Valley', varietal: 'Cabernet Sauvignon', producer: 'Harlan Estate', purchasePrice: 1500, currentValue: 1711, tastingNotes: 'Crème de cassis, graphite, and incense with espresso, dark chocolate, and crushed violets. California\'s "First Growth" — arguably the finest Harlan in a generation.', drinkWindowStart: 2025, drinkWindowEnd: 2050 },
  { name: 'Château Latour', vintage: 2015, region: 'Bordeaux', varietal: 'Cabernet Sauvignon', producer: 'Château Latour', purchasePrice: 1200, currentValue: 1500, tastingNotes: 'Dense cassis, graphite, and cigar box with extraordinary precision. First Growth Pauillac — a landmark 2015 vintage built to age 40+ years. Latour consistently appreciates.', drinkWindowStart: 2025, drinkWindowEnd: 2060 },
  { name: 'Masseto', vintage: 2018, region: 'Tuscany', varietal: 'Merlot', producer: 'Masseto', purchasePrice: 750, currentValue: 900, tastingNotes: 'Dark cherry, blackberry, and Mediterranean herbs with chocolate and sweet tobacco. Italy\'s Pétrus equivalent — limited production of ~3,000 cases. 100-point scores for 2015 and 2016 vintages.', drinkWindowStart: 2026, drinkWindowEnd: 2050 },
  { name: 'Domaine de la Romanée-Conti Nuits-Saint-Georges', vintage: 2019, region: 'Burgundy', varietal: 'Pinot Noir', producer: 'Domaine de la Romanée-Conti', purchasePrice: 480, currentValue: 550, tastingNotes: 'Red cherry, wild strawberry, and exotic spice with layers of earth, truffle, and silk. Entry point into the DRC portfolio — the only DRC under $1K that still carries the name. Burgundy premiums compound steadily.', drinkWindowStart: 2025, drinkWindowEnd: 2045 },
  { name: 'Château Palmer', vintage: 2015, region: 'Bordeaux', varietal: 'Merlot', producer: 'Château Palmer', purchasePrice: 320, currentValue: 380, tastingNotes: 'Exotic spice, violet, and dark plum with a velvety Margaux texture. Punches well above its Third Growth classification — often outperforms First Growths at auction.', drinkWindowStart: 2025, drinkWindowEnd: 2045 },
  { name: 'Opus One', vintage: 2019, region: 'Napa Valley', varietal: 'Cabernet Sauvignon', producer: 'Opus One Winery', purchasePrice: 420, currentValue: 471, tastingNotes: 'Cassis and dark plum with espresso, cocoa, and subtle floral notes. Robert Mondavi + Rothschild — the accessible entry point for Napa trophy collecting. Reliable secondary market and instant name recognition.', drinkWindowStart: 2025, drinkWindowEnd: 2045 },
  { name: 'Ridge Monte Bello', vintage: 2018, region: 'Santa Cruz Mountains', varietal: 'Cabernet Sauvignon', producer: 'Ridge Vineyards', purchasePrice: 165, currentValue: 195, tastingNotes: 'Dark cherry and iron minerality with dried sage, crushed rock, and cedar. California\'s most age-worthy Cabernet by consensus — best value in the room per critical score vs. price.', drinkWindowStart: 2026, drinkWindowEnd: 2048 },
  { name: 'Caymus Special Selection', vintage: 2019, region: 'Napa Valley', varietal: 'Cabernet Sauvignon', producer: 'Caymus Vineyards', purchasePrice: 185, currentValue: 220, tastingNotes: 'Rich dark fruit, cocoa, and vanilla with hints of tobacco. The bridge wine — collectors know it, non-collectors want it. Opens the conversation for guests not yet in the investment mindset.', drinkWindowStart: 2023, drinkWindowEnd: 2035 },

  // Mid-Range (10)
  { name: 'Silver Oak Alexander Valley', vintage: 2018, region: 'Alexander Valley', varietal: 'Cabernet Sauvignon', producer: 'Silver Oak', purchasePrice: 95, currentValue: 115, tastingNotes: 'Ripe blackberry and cassis with sweet vanilla from American oak. Plush and generous with a lingering finish.', drinkWindowStart: 2023, drinkWindowEnd: 2032 },
  { name: 'Jordan Cabernet Sauvignon', vintage: 2019, region: 'Alexander Valley', varietal: 'Cabernet Sauvignon', producer: 'Jordan Vineyard & Winery', purchasePrice: 65, currentValue: 78, tastingNotes: 'Elegant cassis and cherry with dried herbs and gentle oak. Bordeaux-inspired restraint with California warmth.', drinkWindowStart: 2023, drinkWindowEnd: 2030 },
  { name: 'Duckhorn Merlot', vintage: 2020, region: 'Napa Valley', varietal: 'Merlot', producer: 'Duckhorn Vineyards', purchasePrice: 58, currentValue: 65, tastingNotes: 'Plum and boysenberry with cola, mocha, and baking spice. Lush mid-palate with polished tannins.', drinkWindowStart: 2023, drinkWindowEnd: 2029 },
  { name: "Stag's Leap Cask 23", vintage: 2018, region: 'Napa Valley', varietal: 'Cabernet Sauvignon', producer: "Stag's Leap Wine Cellars", purchasePrice: 250, currentValue: 310, tastingNotes: 'Black cherry, currant, and olive tapenade with cedar and dark earth. Structured yet graceful with a savory core.', drinkWindowStart: 2024, drinkWindowEnd: 2038 },
  { name: 'Robert Mondavi Reserve', vintage: 2019, region: 'Napa Valley', varietal: 'Cabernet Sauvignon', producer: 'Robert Mondavi Winery', purchasePrice: 175, currentValue: 195, tastingNotes: 'Classic Napa cab: dark fruit, espresso, and toasty oak with mineral depth. Balanced and age-worthy.', drinkWindowStart: 2024, drinkWindowEnd: 2035 },
  { name: 'Far Niente Chardonnay', vintage: 2021, region: 'Napa Valley', varietal: 'Chardonnay', producer: 'Far Niente', purchasePrice: 68, currentValue: 72, tastingNotes: 'Meyer lemon and ripe pear with honeysuckle and crème brûlée. Rich and creamy with bright acidity.', drinkWindowStart: 2023, drinkWindowEnd: 2027 },
  { name: 'Cakebread Cellars Sauvignon Blanc', vintage: 2022, region: 'Napa Valley', varietal: 'Sauvignon Blanc', producer: 'Cakebread Cellars', purchasePrice: 32, currentValue: 35, tastingNotes: 'Crisp grapefruit and passion fruit with fresh-cut grass and flinty minerality. Zesty and refreshing.', drinkWindowStart: 2023, drinkWindowEnd: 2026 },
  { name: 'Shafer Hillside Select', vintage: 2017, region: 'Napa Valley', varietal: 'Cabernet Sauvignon', producer: 'Shafer Vineyards', purchasePrice: 310, currentValue: 395, tastingNotes: 'Blackberry, blueberry compote, and dark chocolate with espresso and charred oak. Massively concentrated yet refined.', drinkWindowStart: 2025, drinkWindowEnd: 2045 },
  { name: 'Beringer Private Reserve', vintage: 2019, region: 'Napa Valley', varietal: 'Cabernet Sauvignon', producer: 'Beringer Vineyards', purchasePrice: 170, currentValue: 195, tastingNotes: 'Ripe black cherry and cassis with sweet oak, vanilla bean, and dark cocoa. Generous and full-bodied.', drinkWindowStart: 2024, drinkWindowEnd: 2035 },
  { name: 'Pine Ridge Fortis', vintage: 2018, region: 'Napa Valley', varietal: 'Cabernet Sauvignon', producer: 'Pine Ridge Vineyards', purchasePrice: 125, currentValue: 150, tastingNotes: 'Black fruit and wild herb with graphite and a dusting of cocoa. Muscular and structured with fine tannins.', drinkWindowStart: 2024, drinkWindowEnd: 2036 },

  // French Classics (10)
  { name: 'Château Mouton Rothschild', vintage: 2016, region: 'Bordeaux', varietal: 'Cabernet Sauvignon', producer: 'Château Mouton Rothschild', purchasePrice: 680, currentValue: 850, tastingNotes: 'Blackcurrant, graphite, and cigar box with extraordinary depth. The artist label belies the seriousness within.', drinkWindowStart: 2026, drinkWindowEnd: 2055 },
  { name: 'Louis Jadot Gevrey-Chambertin', vintage: 2019, region: 'Burgundy', varietal: 'Pinot Noir', producer: 'Maison Louis Jadot', purchasePrice: 85, currentValue: 105, tastingNotes: 'Red cherry and wild raspberry with forest floor, licorice, and subtle spice. Medium-bodied with silky tannins.', drinkWindowStart: 2024, drinkWindowEnd: 2034 },
  { name: 'Domaine Leflaive Puligny-Montrachet', vintage: 2020, region: 'Burgundy', varietal: 'Chardonnay', producer: 'Domaine Leflaive', purchasePrice: 180, currentValue: 220, tastingNotes: 'Citrus blossom, white peach, and crushed chalk with hazelnut and saline minerality. Pure and precise.', drinkWindowStart: 2024, drinkWindowEnd: 2035 },
  { name: "Château d'Yquem", vintage: 2015, region: 'Bordeaux', varietal: 'Sémillon', producer: "Château d'Yquem", purchasePrice: 450, currentValue: 580, tastingNotes: 'Liquid gold: apricot, saffron, and crème brûlée with honeycomb and orange blossom. Impossibly rich yet perfectly balanced.', drinkWindowStart: 2023, drinkWindowEnd: 2065 },
  { name: 'Château Haut-Brion', vintage: 2017, region: 'Bordeaux', varietal: 'Cabernet Sauvignon', producer: 'Château Haut-Brion', purchasePrice: 520, currentValue: 680, tastingNotes: 'Smoke, warm brick, and red currant with cigar tobacco and earthy complexity. The most unique first growth.', drinkWindowStart: 2025, drinkWindowEnd: 2050 },
  { name: 'E. Guigal Côte-Rôtie La Landonne', vintage: 2016, region: 'Rhône Valley', varietal: 'Syrah', producer: 'E. Guigal', purchasePrice: 380, currentValue: 480, tastingNotes: 'Black olive, smoked meat, and iron with dark fruit and crushed granite. Brooding intensity with remarkable longevity.', drinkWindowStart: 2026, drinkWindowEnd: 2050 },
  { name: 'Château Pichon Baron', vintage: 2018, region: 'Bordeaux', varietal: 'Cabernet Sauvignon', producer: 'Château Pichon Baron', purchasePrice: 140, currentValue: 185, tastingNotes: 'Powerful blackcurrant and plum with cedar, graphite, and espresso. Classic Pauillac muscle with modern polish.', drinkWindowStart: 2025, drinkWindowEnd: 2045 },
  { name: 'Domaine Weinbach Riesling Grand Cru', vintage: 2020, region: 'Alsace', varietal: 'Riesling', producer: 'Domaine Weinbach', purchasePrice: 75, currentValue: 95, tastingNotes: 'Crystalline lime and white flowers with petrol and wet stone minerality. Racy acidity with a bone-dry finish.', drinkWindowStart: 2024, drinkWindowEnd: 2040 },
  { name: 'Château Léoville-Las Cases', vintage: 2016, region: 'Bordeaux', varietal: 'Cabernet Sauvignon', producer: 'Château Léoville-Las Cases', purchasePrice: 200, currentValue: 270, tastingNotes: 'Intense cassis and blackberry with cedar, graphite, and iron. Often called the "Latour of Saint-Julien" for its structure.', drinkWindowStart: 2026, drinkWindowEnd: 2055 },

  // Italian Icons (9)
  { name: 'Giacomo Conterno Monfortino Barolo', vintage: 2015, region: 'Piedmont', varietal: 'Nebbiolo', producer: 'Giacomo Conterno', purchasePrice: 1100, currentValue: 1450, tastingNotes: 'Tar, roses, dried cherry, and truffle with extraordinary depth. A monument of Barolo with decades of evolution ahead.', drinkWindowStart: 2030, drinkWindowEnd: 2065 },
  { name: 'Gaja Barbaresco', vintage: 2018, region: 'Piedmont', varietal: 'Nebbiolo', producer: 'Gaja', purchasePrice: 320, currentValue: 410, tastingNotes: 'Wild cherry, rose hip, and white truffle with licorice, tar, and balsamic notes. Powerful yet graceful with firm, refined tannins.', drinkWindowStart: 2026, drinkWindowEnd: 2045 },
  { name: 'Tignanello', vintage: 2019, region: 'Tuscany', varietal: 'Sangiovese', producer: 'Marchesi Antinori', purchasePrice: 130, currentValue: 165, tastingNotes: 'Bright cherry, plum, and violet with leather, sweet spice, and a touch of vanilla. The original Super Tuscan — elegant and complex.', drinkWindowStart: 2024, drinkWindowEnd: 2038 },
  { name: 'Ornellaia', vintage: 2018, region: 'Tuscany', varietal: 'Cabernet Sauvignon', producer: 'Tenuta dell\'Ornellaia', purchasePrice: 280, currentValue: 350, tastingNotes: 'Blackcurrant, dark plum, and graphite with Mediterranean herbs, chocolate, and cedar. Structured and polished with a long finish.', drinkWindowStart: 2025, drinkWindowEnd: 2042 },
  { name: 'Brunello di Montalcino Biondi-Santi Riserva', vintage: 2015, region: 'Tuscany', varietal: 'Sangiovese', producer: 'Biondi-Santi', purchasePrice: 550, currentValue: 720, tastingNotes: 'Dried cherry, leather, and tobacco with iron, dried herbs, and earthy complexity. The benchmark Brunello — austere, timeless, profound.', drinkWindowStart: 2028, drinkWindowEnd: 2055 },
  { name: 'Vietti Barolo Ravera', vintage: 2017, region: 'Piedmont', varietal: 'Nebbiolo', producer: 'Vietti', purchasePrice: 120, currentValue: 155, tastingNotes: 'Rose petal, ripe cherry, and crushed stone with cinnamon and dried orange peel. Fine-grained tannins with a mineral-driven finish.', drinkWindowStart: 2025, drinkWindowEnd: 2040 },
  { name: 'Solaia', vintage: 2018, region: 'Tuscany', varietal: 'Cabernet Sauvignon', producer: 'Marchesi Antinori', purchasePrice: 350, currentValue: 430, tastingNotes: 'Intense blackberry, cassis, and dark chocolate with cedar, tobacco, and espresso. Powerful and concentrated with a velvety texture.', drinkWindowStart: 2026, drinkWindowEnd: 2045 },
  { name: 'Barolo Cannubi Marchesi di Barolo', vintage: 2016, region: 'Piedmont', varietal: 'Nebbiolo', producer: 'Marchesi di Barolo', purchasePrice: 80, currentValue: 105, tastingNotes: 'Classic tar and roses with cherry, dried herbs, and a touch of menthol. Medium-bodied with firm tannins and bright acidity.', drinkWindowStart: 2024, drinkWindowEnd: 2036 },
  { name: 'Amarone della Valpolicella Bertani', vintage: 2012, region: 'Veneto', varietal: 'Corvina', producer: 'Bertani', purchasePrice: 140, currentValue: 195, tastingNotes: 'Dried fig, raisin, and dark chocolate with balsamic, coffee, and sweet spice. Rich and velvety with remarkable freshness for the style.', drinkWindowStart: 2023, drinkWindowEnd: 2040 },

  // Spanish & Portuguese (6)
  { name: 'Vega Sicilia Único', vintage: 2012, region: 'Ribera del Duero', varietal: 'Tempranillo', producer: 'Vega Sicilia', purchasePrice: 480, currentValue: 620, tastingNotes: 'Dark fruit, leather, and balsamic with cedar, tobacco, and earthy complexity. Spain\'s greatest wine — dense yet ethereal.', drinkWindowStart: 2025, drinkWindowEnd: 2055 },
  { name: 'Pingus', vintage: 2018, region: 'Ribera del Duero', varietal: 'Tempranillo', producer: 'Dominio de Pingus', purchasePrice: 850, currentValue: 1050, tastingNotes: 'Concentrated black fruit, graphite, and wild herbs with extraordinary mineral depth. Cult status for a reason — pure intensity.', drinkWindowStart: 2026, drinkWindowEnd: 2050 },
  { name: 'La Rioja Alta Gran Reserva 904', vintage: 2015, region: 'Rioja', varietal: 'Tempranillo', producer: 'La Rioja Alta', purchasePrice: 55, currentValue: 72, tastingNotes: 'Mature cherry, leather, and dried herbs with vanilla, coconut, and sweet tobacco from American oak. Traditional Rioja at its finest.', drinkWindowStart: 2023, drinkWindowEnd: 2035 },
  { name: 'Álvaro Palacios L\'Ermita', vintage: 2019, region: 'Priorat', varietal: 'Garnacha', producer: 'Álvaro Palacios', purchasePrice: 650, currentValue: 780, tastingNotes: 'Ethereal red fruit, garrigue, and crushed slate with exotic spice and floral lift. Transcendent Garnacha from ancient terraces.', drinkWindowStart: 2025, drinkWindowEnd: 2045 },
  { name: 'Barca Velha', vintage: 2011, region: 'Douro Valley', varietal: 'Touriga Nacional', producer: 'Casa Ferreirinha', purchasePrice: 380, currentValue: 500, tastingNotes: 'Dark plum, violet, and graphite with balsamic, dark chocolate, and wild herbs. Portugal\'s most prestigious red — only made in exceptional years.', drinkWindowStart: 2025, drinkWindowEnd: 2045 },
  { name: 'Clos Mogador', vintage: 2019, region: 'Priorat', varietal: 'Garnacha', producer: 'Clos Mogador', purchasePrice: 95, currentValue: 120, tastingNotes: 'Wild strawberry, kirsch, and garrigue with mineral depth and smoky complexity. A Priorat pioneer — old-vine concentration with Mediterranean soul.', drinkWindowStart: 2024, drinkWindowEnd: 2038 },

  // New World Gems (9)
  { name: 'Catena Zapata Malbec Argentino', vintage: 2019, region: 'Mendoza', varietal: 'Malbec', producer: 'Catena Zapata', purchasePrice: 180, currentValue: 220, tastingNotes: 'Intense violet, blackberry, and plum with dark chocolate, espresso, and crushed stone. High-altitude power with remarkable freshness.', drinkWindowStart: 2024, drinkWindowEnd: 2038 },
  { name: 'Almaviva', vintage: 2019, region: 'Maipo Valley', varietal: 'Cabernet Sauvignon', producer: 'Viña Almaviva', purchasePrice: 110, currentValue: 140, tastingNotes: 'Cassis, dark cherry, and graphite with tobacco, eucalyptus, and spice. Chile\'s first growth — Bordeaux precision with Andean intensity.', drinkWindowStart: 2024, drinkWindowEnd: 2038 },
  { name: 'Cloudy Bay Te Wahi Pinot Noir', vintage: 2019, region: 'Central Otago', varietal: 'Pinot Noir', producer: 'Cloudy Bay', purchasePrice: 65, currentValue: 78, tastingNotes: 'Dark cherry, wild thyme, and earthy notes with silky tannins and bright acidity. New Zealand elegance with Central Otago depth.', drinkWindowStart: 2023, drinkWindowEnd: 2030 },
  { name: 'Torbreck RunRig', vintage: 2018, region: 'Barossa Valley', varietal: 'Shiraz', producer: 'Torbreck Vintners', purchasePrice: 180, currentValue: 230, tastingNotes: 'Blackberry, dark chocolate, and smoked meat with pepper, licorice, and sweet oak. Barossa power with old-vine complexity.', drinkWindowStart: 2025, drinkWindowEnd: 2042 },
  { name: 'Sine Qua Non Eleven Confessions Syrah', vintage: 2018, region: 'Santa Barbara', varietal: 'Syrah', producer: 'Sine Qua Non', purchasePrice: 450, currentValue: 580, tastingNotes: 'Blueberry, bacon fat, and crushed lavender with graphite, espresso, and smoked earth. One-of-a-kind bottlings that defy convention.', drinkWindowStart: 2025, drinkWindowEnd: 2045 },
  { name: 'Henschke Hill of Grace', vintage: 2017, region: 'Eden Valley', varietal: 'Shiraz', producer: 'Henschke', purchasePrice: 650, currentValue: 820, tastingNotes: 'Dark plum, blackberry, and star anise with charcoal, iron, and wild sage. Single-vineyard planted in 1860 — Australia\'s grand cru.', drinkWindowStart: 2027, drinkWindowEnd: 2055 },
  { name: 'Felton Road Block 5 Pinot Noir', vintage: 2020, region: 'Central Otago', varietal: 'Pinot Noir', producer: 'Felton Road', purchasePrice: 75, currentValue: 92, tastingNotes: 'Dark cherry, plum, and earthy complexity with subtle oak and fine tannins. Biodynamic farming shines through in the purity.', drinkWindowStart: 2024, drinkWindowEnd: 2032 },
  { name: 'Kanonkop Paul Sauer', vintage: 2018, region: 'Stellenbosch', varietal: 'Cabernet Sauvignon', producer: 'Kanonkop', purchasePrice: 55, currentValue: 70, tastingNotes: 'Ripe cassis, mulberry, and cedar with fynbos, dark chocolate, and tobacco. South Africa\'s flagship Bordeaux blend — age-worthy and distinctive.', drinkWindowStart: 2024, drinkWindowEnd: 2036 },
  { name: 'Dominus Estate', vintage: 2018, region: 'Napa Valley', varietal: 'Cabernet Sauvignon', producer: 'Dominus Estate', purchasePrice: 280, currentValue: 350, tastingNotes: 'Dark fruit, iron, and dried herbs with graphite, espresso, and a Bordeaux-like restraint rare in Napa. Christian Moueix\'s California masterwork.', drinkWindowStart: 2025, drinkWindowEnd: 2045 },

  // Champagne & Sparkling (5)
  { name: 'Dom Pérignon', vintage: 2013, region: 'Champagne', varietal: 'Chardonnay', producer: 'Moët & Chandon', purchasePrice: 250, currentValue: 310, tastingNotes: 'Toasted brioche, white flowers, and citrus with chalky minerality and a persistent mousse. The benchmark prestige cuvée.', drinkWindowStart: 2023, drinkWindowEnd: 2035 },
  { name: 'Krug Grande Cuvée', vintage: 2015, region: 'Champagne', varietal: 'Chardonnay', producer: 'Krug', purchasePrice: 280, currentValue: 340, tastingNotes: 'Roasted hazelnut, dried fruit, and brioche with marzipan, honey, and a long toasty finish. Multi-vintage mastery at its peak.', drinkWindowStart: 2023, drinkWindowEnd: 2032 },
  { name: 'Louis Roederer Cristal', vintage: 2014, region: 'Champagne', varietal: 'Chardonnay', producer: 'Louis Roederer', purchasePrice: 320, currentValue: 395, tastingNotes: 'White peach, chalk, and lemon curd with a laser-focused mineral backbone. Biodynamic since 2021 — the future of grand Champagne.', drinkWindowStart: 2024, drinkWindowEnd: 2036 },
  { name: 'Salon Le Mesnil Blanc de Blancs', vintage: 2012, region: 'Champagne', varietal: 'Chardonnay', producer: 'Salon', purchasePrice: 650, currentValue: 850, tastingNotes: 'Intense chalk, green apple, and sea spray with extraordinary tension and length. Only made in exceptional years — pure Le Mesnil terroir.', drinkWindowStart: 2025, drinkWindowEnd: 2045 },
  { name: 'Bollinger La Grande Année', vintage: 2014, region: 'Champagne', varietal: 'Pinot Noir', producer: 'Bollinger', purchasePrice: 140, currentValue: 175, tastingNotes: 'Ripe apple, walnut, and toasted bread with spice and a powerful, vinous structure. Bollinger\'s signature richness and depth.', drinkWindowStart: 2023, drinkWindowEnd: 2032 },
];

// ── Alerts ─────────────────────────────────────────────────────────────

function daysAgo(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(Math.floor(Math.random() * 24), Math.floor(Math.random() * 60));
  return d;
}

const alertData: { type: AlertType; severity: Severity; message: string; timestamp: Date; resolved: boolean }[] = [
  { type: AlertType.temperature, severity: Severity.warning, message: 'Temperature elevated: 59.8°F (threshold 59°F)', timestamp: daysAgo(28), resolved: true },
  { type: AlertType.humidity, severity: Severity.warning, message: 'Humidity low: 53.2% (threshold 55%)', timestamp: daysAgo(27), resolved: true },
  { type: AlertType.vibration, severity: Severity.warning, message: 'Vibration spike detected: 0.62 mm/s (threshold 0.5 mm/s)', timestamp: daysAgo(23), resolved: true },
  { type: AlertType.temperature, severity: Severity.critical, message: 'Temperature critical: 62.4°F (threshold 59°F)', timestamp: daysAgo(20), resolved: true },
  { type: AlertType.humidity, severity: Severity.warning, message: 'Humidity elevated: 76.1% (threshold 75%)', timestamp: daysAgo(18), resolved: true },
  { type: AlertType.temperature, severity: Severity.warning, message: 'Temperature elevated: 59.4°F (threshold 59°F)', timestamp: daysAgo(16), resolved: true },
  { type: AlertType.vibration, severity: Severity.critical, message: 'Vibration critical: 1.12 mm/s — construction activity nearby', timestamp: daysAgo(14), resolved: true },
  { type: AlertType.humidity, severity: Severity.critical, message: 'Humidity critical: 78.4% (threshold 75%)', timestamp: daysAgo(12), resolved: true },
  { type: AlertType.temperature, severity: Severity.warning, message: 'Temperature low: 49.8°F (threshold 50°F)', timestamp: daysAgo(10), resolved: true },
  { type: AlertType.vibration, severity: Severity.warning, message: 'Vibration detected: 0.58 mm/s (threshold 0.5 mm/s)', timestamp: daysAgo(8), resolved: true },
  { type: AlertType.temperature, severity: Severity.warning, message: 'Temperature elevated: 60.1°F (threshold 59°F)', timestamp: daysAgo(6), resolved: true },
  { type: AlertType.humidity, severity: Severity.warning, message: 'Humidity low: 54.5% (threshold 55%)', timestamp: daysAgo(5), resolved: true },
  { type: AlertType.vibration, severity: Severity.warning, message: 'Vibration spike: 0.72 mm/s — HVAC maintenance', timestamp: daysAgo(4), resolved: true },
  { type: AlertType.access, severity: Severity.info, message: 'Locker accessed: member badge scan — Robert Saenz', timestamp: daysAgo(4), resolved: true },
  { type: AlertType.temperature, severity: Severity.warning, message: 'Temperature low: 49.3°F (threshold 50°F)', timestamp: daysAgo(3), resolved: true },
  { type: AlertType.access, severity: Severity.info, message: 'Locker accessed: member badge scan — Robert Saenz', timestamp: daysAgo(2), resolved: true },
  { type: AlertType.humidity, severity: Severity.warning, message: 'Humidity low: 54.1% (threshold 55%)', timestamp: daysAgo(1), resolved: true },
  { type: AlertType.access, severity: Severity.info, message: 'Reserve room entry: staff badge — Samuel Jalloh', timestamp: daysAgo(1), resolved: true },
  { type: AlertType.access, severity: Severity.warning, message: 'After-hours access: member badge scan — Robert Saenz (11:42 PM)', timestamp: daysAgo(0), resolved: true },
  { type: AlertType.temperature, severity: Severity.warning, message: 'Temperature elevated: 59.6°F (threshold 59°F)', timestamp: daysAgo(0), resolved: true },
];

// ── Slot layout ────────────────────────────────────────────────────────

// Locker #7: 20 occupied positions (out of 32) — primary locker, investment grade
const locker7OccupiedPositions = [1, 2, 3, 4, 5, 6, 8, 9, 10, 11, 13, 14, 15, 17, 18, 21, 22, 25, 26, 29];
// Locker #12: 16 occupied positions (out of 32) — Italian & French wines
const locker12OccupiedPositions = [1, 2, 3, 5, 6, 7, 9, 10, 11, 13, 14, 17, 18, 21, 22, 25];
// Locker #19: 18 occupied positions (out of 32) — Spanish, New World, overflow
const locker19OccupiedPositions = [1, 2, 3, 4, 5, 7, 8, 9, 10, 13, 14, 15, 17, 18, 21, 22, 25, 26];
// Locker #24: 10 occupied positions (out of 32) — Champagne vault, newest
const locker24OccupiedPositions = [1, 3, 5, 7, 9, 11, 13, 15, 17, 19];

// ── Main seed ──────────────────────────────────────────────────────────

async function main() {
  console.log('🌱 Seeding Caveau database...');

  // Clear in reverse-dependency order
  await prisma.$transaction([
    prisma.sensorReading.deleteMany(),
    prisma.alert.deleteMany(),
    prisma.provenanceCertificate.deleteMany(),
    prisma.wineValuation.deleteMany(),
    prisma.lockerSlot.deleteMany(),
    prisma.hurricaneProtocolMember.deleteMany(),
    prisma.hurricaneProtocol.deleteMany(),
    prisma.wine.deleteMany(),
    prisma.locker.deleteMany(),
    prisma.facilityEvent.deleteMany(),
    prisma.facilityMember.deleteMany(),
    prisma.member.deleteMany(),
    prisma.facility.deleteMany(),
  ]);

  // 1. Facilities — Naples is the flagship, Miami opened later as a 2nd location
  const naples = await prisma.facility.create({
    data: {
      name: 'Caveau Naples',
      location: 'Naples, FL',
      // Above-sea-level siting is the whole pitch vs. a home cellar
      // in flood-zone Naples — 18 ft sits above the FEMA BFE for the
      // surrounding blocks.
      elevationFt: 18,
      generatorStatus: 'operational',
      fireSuppressionStatus: 'operational',
      lastInspectionAt: new Date(Date.now() - 42 * 86400000),
    },
  });
  const miami = await prisma.facility.create({
    data: {
      name: 'Caveau Miami',
      location: 'Miami, FL',
      elevationFt: 11,
      generatorStatus: 'operational',
      fireSuppressionStatus: 'operational',
      lastInspectionAt: new Date(Date.now() - 67 * 86400000),
    },
  });
  console.log(`  ✓ Facilities: ${naples.name}, ${miami.name}`);

  // 1b. Facility events — historical resilience record. Hurricane Helene
  // is the headline demo moment: the monitored cellar rode out a cat-4
  // storm with a clean environmental record, which is the auto-generated
  // post-event report a member sees on /facility/events/[id].
  await prisma.facilityEvent.createMany({
    data: [
      {
        facilityId: naples.id,
        type: FacilityEventType.hurricane,
        severity: Severity.critical,
        startedAt: new Date('2024-09-26T00:00:00Z'),
        endedAt: new Date('2024-09-28T12:00:00Z'),
        notes:
          'Hurricane Helene — Category 4 landfall in Big Bend. Facility switched to generator power for 31 hours; Sentinel environmental envelope held within spec throughout. No water intrusion (elevation +18 ft).',
      },
      {
        facilityId: naples.id,
        type: FacilityEventType.generator_test,
        severity: Severity.info,
        startedAt: new Date(Date.now() - 14 * 86400000),
        endedAt: new Date(Date.now() - 14 * 86400000 + 45 * 60000),
        notes: 'Quarterly 45-minute load test on the Kohler 150 kW standby. Transfer clean, temperature drift < 0.3°F.',
      },
      {
        facilityId: naples.id,
        type: FacilityEventType.inspection,
        severity: Severity.info,
        startedAt: new Date(Date.now() - 42 * 86400000),
        endedAt: new Date(Date.now() - 42 * 86400000 + 3 * 3600000),
        notes: 'Semi-annual fire suppression inspection — FM-200 system recertified, no deficiencies noted.',
      },
      // Miami event log — a recent tropical depression (keeps the env
      // report inside the 30-day sensor seed window), a quarterly load
      // test, and the semi-annual inspection that matches
      // lastInspectionAt above.
      {
        facilityId: miami.id,
        type: FacilityEventType.weather,
        severity: Severity.warning,
        startedAt: new Date(Date.now() - 9 * 86400000),
        endedAt: new Date(Date.now() - 8 * 86400000),
        notes:
          'Tropical depression passed 40 miles offshore. Facility on grid throughout; Sentinel recorded a 0.4°F upward drift during peak humidity but stayed in spec. Zero water intrusion.',
      },
      {
        facilityId: miami.id,
        type: FacilityEventType.generator_test,
        severity: Severity.info,
        startedAt: new Date(Date.now() - 21 * 86400000),
        endedAt: new Date(Date.now() - 21 * 86400000 + 40 * 60000),
        notes:
          'Quarterly 40-minute load test on the Kohler 150 kW standby. Automatic transfer switch engaged cleanly; temperature drift negligible.',
      },
      {
        facilityId: miami.id,
        type: FacilityEventType.inspection,
        severity: Severity.info,
        startedAt: new Date(Date.now() - 67 * 86400000),
        endedAt: new Date(Date.now() - 67 * 86400000 + 2.5 * 3600000),
        notes:
          'Semi-annual fire suppression inspection — FM-200 system recertified, all sensors within tolerance, no deficiencies noted.',
      },
    ],
  });
  console.log('  ✓ Facility events: 6 (Naples: 3, Miami: 3)');

  // 2. Member (password: demo1234)
  const passwordHash = await bcrypt.hash('demo1234', 10);
  const member = await prisma.member.create({
    data: {
      name: 'Robert Saenz',
      email: 'robert@caveau.com',
      tier: Tier.black,
      role: Role.member,
      passwordHash,
      onboardedAt: new Date(),
      // Hurricane Protection (feature #46) — enrolled with PURE carrier
      // discount to showcase the #31 insurance partnership narrative.
      hurricaneProtectionActive: true,
      hurricaneProtectionEnrolledAt: new Date(Date.now() - 120 * 86400000),
      hurricaneInsurancePartner: 'PURE Insurance',
      hurricaneInsuranceDiscountPct: 12.5,
    },
  });
  console.log(`  ✓ Member: ${member.name}`);

  // 2b. Facility memberships — Robert holds wine in both locations
  await prisma.facilityMember.createMany({
    data: [
      { memberId: member.id, facilityId: naples.id },
      { memberId: member.id, facilityId: miami.id },
    ],
  });
  console.log('  ✓ Facility memberships: Naples + Miami');

  // 3. Wines
  const createdWines = [];
  for (const w of wines) {
    const wine = await prisma.wine.create({
      data: {
        name: w.name,
        vintage: w.vintage,
        region: w.region,
        varietal: w.varietal,
        producer: w.producer,
        purchasePrice: w.purchasePrice,
        currentValue: w.currentValue,
        tastingNotes: w.tastingNotes,
        drinkWindowStart: w.drinkWindowStart,
        drinkWindowEnd: w.drinkWindowEnd,
        memberId: member.id,
      },
    });
    createdWines.push(wine);
  }
  console.log(`  ✓ Wines: ${createdWines.length}`);

  // 4. Lockers — three at Naples, one (the Champagne vault) at Miami
  const locker7 = await prisma.locker.create({
    data: { lockerNumber: 7, zone: 'A', facilityId: naples.id, memberId: member.id },
  });
  const locker12 = await prisma.locker.create({
    data: { lockerNumber: 12, zone: 'B', facilityId: naples.id, memberId: member.id },
  });
  const locker19 = await prisma.locker.create({
    data: { lockerNumber: 19, zone: 'C', facilityId: naples.id, memberId: member.id },
  });
  const locker24 = await prisma.locker.create({
    data: { lockerNumber: 24, zone: 'A', facilityId: miami.id, memberId: member.id },
  });
  console.log('  ✓ Lockers: Naples #7/#12/#19, Miami #24');

  // 5. Locker slots — all 32 per locker, some occupied
  let wineIndex = 0;
  const allLockerConfigs: { locker: typeof locker7; positions: number[] }[] = [
    { locker: locker7, positions: locker7OccupiedPositions },
    { locker: locker12, positions: locker12OccupiedPositions },
    { locker: locker19, positions: locker19OccupiedPositions },
    { locker: locker24, positions: locker24OccupiedPositions },
  ];

  for (const { locker, positions } of allLockerConfigs) {
    for (let pos = 1; pos <= 32; pos++) {
      const occupied = positions.includes(pos) && wineIndex < createdWines.length;
      await prisma.lockerSlot.create({
        data: {
          lockerId: locker.id,
          slotPosition: pos,
          wineId: occupied ? createdWines[wineIndex]?.id : null,
          dateStored: occupied
            ? new Date(Date.now() - Math.floor(Math.random() * 180 + 10) * 86400000)
            : null,
        },
      });
      if (occupied) wineIndex++;
    }
  }
  console.log(`  ✓ Locker slots: 128 total, ${wineIndex} occupied`);

  // 6. Alerts — spread across all 4 lockers
  const lockerIds = [locker7.id, locker12.id, locker19.id, locker24.id];
  for (let i = 0; i < alertData.length; i++) {
    const a = alertData[i];
    await prisma.alert.create({
      data: {
        lockerId: lockerIds[i % lockerIds.length],
        type: a.type,
        severity: a.severity,
        message: a.message,
        timestamp: a.timestamp,
        resolved: a.resolved,
      },
    });
  }
  console.log(`  ✓ Alerts: ${alertData.length}`);

  // 7. Provenance certificates — investment-grade wines across lockers
  const certConfigs = [
    // DRC, Screaming Eagle, Petrus, Lafite, Opus One (locker 7)
    ...createdWines.slice(5, 10).map((w) => ({ wine: w, lockerId: locker7.id })),
    // Masseto, Conterno Barolo, Gaja (locker 12)
    ...createdWines.slice(35, 38).map((w) => ({ wine: w, lockerId: locker12.id })),
    // Vega Sicilia, Pingus (locker 19)
    ...createdWines.slice(45, 47).map((w) => ({ wine: w, lockerId: locker19.id })),
    // Salon Champagne (locker 24)
    ...createdWines.slice(64, 65).map((w) => ({ wine: w, lockerId: locker24.id })),
  ];
  let certCount = 0;
  for (let i = 0; i < certConfigs.length; i++) {
    const { wine, lockerId } = certConfigs[i];
    if (!wine) continue;
    const monitoringStart = new Date(Date.now() - (180 + i * 15) * 86400000);
    const monitoringEnd = new Date();
    // HMAC-SHA256 keyed on NEXTAUTH_SECRET so the public verify hash
    // can't be forged even if an attacker learns the tuple format.
    // Mirrors src/lib/certificate-hash.ts — kept inlined here so the
    // seed script stays a single file Prisma can execute directly.
    const certKey = process.env.NEXTAUTH_SECRET;
    if (!certKey) {
      throw new Error(
        'NEXTAUTH_SECRET is required to seed provenance certificates',
      );
    }
    const hash = createHmac('sha256', certKey)
      .update(`${wine.id}|${lockerId}|${monitoringStart.toISOString()}|${monitoringEnd.toISOString()}`)
      .digest('hex');

    await prisma.provenanceCertificate.create({
      data: {
        wineId: wine.id,
        lockerId,
        monitoringStart,
        monitoringEnd,
        tempMean: 55.0 + i * 0.08,
        tempMin: 50.5 + i * 0.15,
        tempMax: 58.2 + i * 0.1,
        humidityMean: 64.5 + i * 0.2,
        dataIntegrityHash: hash,
        certificateNumber: `CAV-${new Date().getFullYear()}-${String(i + 1).padStart(4, '0')}`,
      },
    });
    certCount++;
  }
  console.log(`  ✓ Provenance certificates: ${certCount}`);

  // 8. Wine valuations — multiple entries per wine over 12 months, varied sources
  const valuationSources = ['manual', 'liv-ex', 'wine-searcher', 'auction', 'liv-ex', 'manual'];
  let valCount = 0;
  for (const wine of createdWines) {
    const basePrice = Number(wine.purchasePrice);
    const currentPrice = Number(wine.currentValue);
    const priceGrowth = currentPrice - basePrice;
    // Generate 4-6 valuation entries over 12 months
    const numEntries = 4 + Math.floor(Math.random() * 3);
    for (let j = 0; j < numEntries; j++) {
      const monthsAgo = Math.round((12 / (numEntries - 1)) * (numEntries - 1 - j));
      const progress = j / (numEntries - 1); // 0 to 1
      // Price follows a smooth curve from purchase to current with slight noise
      const noise = (Math.random() - 0.5) * priceGrowth * 0.05;
      const price = basePrice + priceGrowth * progress + noise;
      const date = new Date();
      date.setMonth(date.getMonth() - monthsAgo);
      date.setDate(1 + Math.floor(Math.random() * 27));

      await prisma.wineValuation.create({
        data: {
          wineId: wine.id,
          source: valuationSources[j % valuationSources.length],
          price: Math.round(Math.max(price, basePrice * 0.95) * 100) / 100,
          date,
        },
      });
      valCount++;
    }
  }
  console.log(`  ✓ Wine valuations: ${valCount} (across ${createdWines.length} wines)`);

  // 9. Last valuation sync timestamp — pretend the Liv-ex cron (#39) ran
  // recently so the wine detail page shows "synced X ago" instead of
  // falling back to the most recent WineValuation.date.
  await prisma.wine.updateMany({
    data: { lastValuationSyncAt: new Date(Date.now() - 6 * 3600000) },
  });
  console.log('  ✓ Last-synced timestamps applied to all wines');

  // 10. Historical dispositions — wines that left the collection.
  // These aren't placed in any locker slot (the positions arrays above
  // allocate exactly 66 slots for the first 66 wines, so anything we
  // create here is automatically unplaced). Each gets a status that
  // mirrors the DispositionType so the collection "history" tab picks
  // them up and the provenance timeline on the wine detail page shows
  // the full chain of custody.
  const historicalWines = [
    {
      name: 'Château Latour',
      vintage: 2010,
      region: 'Bordeaux',
      varietal: 'Cabernet Sauvignon',
      producer: 'Château Latour',
      purchasePrice: 950,
      currentValue: 1850,
      tastingNotes:
        'Legendary Pauillac power — dense cassis, graphite, and cigar box with decades of cellar life ahead. Sold at auction to fund a 2024 Burgundy allocation.',
      drinkWindowStart: 2025,
      drinkWindowEnd: 2060,
      disposition: {
        type: DispositionType.sold,
        daysAgo: 92,
        salePrice: 2100,
        recipient: 'Sotheby\'s Wine — New York auction',
        notes: 'Sold at Sotheby\'s Finest & Rarest Wines, Nov 2025. Premium over current value reflected tight supply of library-aged Latour.',
      },
    },
    {
      name: 'Dom Pérignon P2',
      vintage: 2002,
      region: 'Champagne',
      varietal: 'Chardonnay',
      producer: 'Moët & Chandon',
      purchasePrice: 420,
      currentValue: 480,
      tastingNotes:
        'Second plenitude release — toasted brioche, marzipan, and a mineral-driven finish that only extended lees aging can produce. Opened to celebrate daughter\'s graduation.',
      drinkWindowStart: 2020,
      drinkWindowEnd: 2035,
      disposition: {
        type: DispositionType.consumed,
        daysAgo: 45,
        salePrice: null,
        recipient: null,
        notes: 'Opened at Le Bernardin to celebrate Isabella\'s Yale Law graduation. Paired with Michelin-tasting menu.',
      },
    },
    {
      name: 'Caymus Cabernet Sauvignon',
      vintage: 2016,
      region: 'Napa Valley',
      varietal: 'Cabernet Sauvignon',
      producer: 'Caymus Vineyards',
      purchasePrice: 95,
      currentValue: 125,
      tastingNotes:
        'Ripe, approachable Napa cab with soft tannins and generous dark fruit. Gifted to celebrate a business partner\'s anniversary.',
      drinkWindowStart: 2020,
      drinkWindowEnd: 2030,
      disposition: {
        type: DispositionType.gifted,
        daysAgo: 128,
        salePrice: null,
        recipient: 'Marcus Whitfield (10-year partnership anniversary)',
        notes: 'Hand-delivered with a personal note. Confirmed receipt; stored at recipient\'s climate-controlled cellar.',
      },
    },
    {
      name: 'Silver Oak Napa Valley',
      vintage: 2015,
      region: 'Napa Valley',
      varietal: 'Cabernet Sauvignon',
      producer: 'Silver Oak',
      purchasePrice: 120,
      currentValue: 145,
      tastingNotes:
        'Classic American oak signature — vanilla, coconut, and ripe blackberry. Transferred to personal residence cellar in Naples after downsizing locker holdings.',
      drinkWindowStart: 2020,
      drinkWindowEnd: 2032,
      disposition: {
        type: DispositionType.transferred,
        daysAgo: 215,
        salePrice: null,
        recipient: 'Private residence cellar — Port Royal, Naples FL',
        notes: 'Chain of custody maintained via Caveau white-glove delivery; recipient cellar verified at 55°F / 68% RH before handoff.',
      },
    },
    {
      name: 'Jordan Cabernet Sauvignon',
      vintage: 2017,
      region: 'Alexander Valley',
      varietal: 'Cabernet Sauvignon',
      producer: 'Jordan Vineyard & Winery',
      purchasePrice: 58,
      currentValue: 68,
      tastingNotes:
        'Bordeaux-inspired elegance from Alexander Valley. Removed from cellar after cork failure detected during routine inspection — insurance claim filed.',
      drinkWindowStart: 2022,
      drinkWindowEnd: 2028,
      disposition: {
        type: DispositionType.removed,
        daysAgo: 310,
        salePrice: null,
        recipient: null,
        notes: 'Cork seepage identified during quarterly inspection. Bottle removed and filed under insurance claim #CAV-2025-0042. Environmental record clean — suspected manufacturer defect.',
      },
    },
  ];

  let dispositionCount = 0;
  for (const hw of historicalWines) {
    const wine = await prisma.wine.create({
      data: {
        name: hw.name,
        vintage: hw.vintage,
        region: hw.region,
        varietal: hw.varietal,
        producer: hw.producer,
        purchasePrice: hw.purchasePrice,
        currentValue: hw.currentValue,
        tastingNotes: hw.tastingNotes,
        drinkWindowStart: hw.drinkWindowStart,
        drinkWindowEnd: hw.drinkWindowEnd,
        memberId: member.id,
        // Wine.status mirrors DispositionType exactly — both enums share
        // the same string values, so the cast is a direct remap, not a
        // lossy conversion. This matches what recordDisposition() does
        // at runtime in src/app/wine/[id]/actions.ts.
        status: hw.disposition.type as unknown as WineStatus,
      },
    });

    const dispositionDate = new Date(Date.now() - hw.disposition.daysAgo * 86400000);
    await prisma.wineDisposition.create({
      data: {
        wineId: wine.id,
        memberId: member.id,
        type: hw.disposition.type,
        date: dispositionDate,
        salePrice: hw.disposition.salePrice,
        recipient: hw.disposition.recipient,
        notes: hw.disposition.notes,
      },
    });

    // Give historical wines a short valuation history too so the
    // detail page still renders a chart instead of an empty state.
    const basePrice = Number(hw.purchasePrice);
    for (let j = 0; j < 3; j++) {
      const monthsAgo = 12 - j * 4;
      const d = new Date();
      d.setMonth(d.getMonth() - monthsAgo);
      await prisma.wineValuation.create({
        data: {
          wineId: wine.id,
          source: ['manual', 'liv-ex', 'wine-searcher'][j],
          price: Math.round(basePrice * (0.95 + j * 0.05) * 100) / 100,
          date: d,
        },
      });
    }
    dispositionCount++;
  }
  console.log(`  ✓ Historical dispositions: ${dispositionCount}`);

  // Historical Hurricane Protection activation — ties to the Helene
  // FacilityEvent seeded above. Stage = returned so the dashboard banner
  // stays quiet on first load; Rob can see the row in the protocol
  // history card on /settings/hurricane and trace through to the
  // post-event environmental report at /facility/events/[id].
  const heleneEvent = await prisma.facilityEvent.findFirst({
    where: {
      facilityId: naples.id,
      type: FacilityEventType.hurricane,
    },
  });
  if (heleneEvent) {
    const totalPortfolioValue = createdWines.reduce(
      (sum, w) => sum + Number(w.currentValue),
      0,
    );
    const heleneProtocol = await prisma.hurricaneProtocol.create({
      data: {
        facilityId: naples.id,
        stormName: 'Helene',
        nhcAdvisory: 'AL092024',
        category: 4,
        stage: 'returned',
        watchIssuedAt: new Date('2024-09-23T00:00:00Z'),
        transportDispatchedAt: new Date('2024-09-24T06:00:00Z'),
        shelteredAt: new Date('2024-09-25T14:00:00Z'),
        allClearAt: new Date('2024-09-28T12:00:00Z'),
        returnedAt: new Date('2024-09-30T18:00:00Z'),
        facilityEventId: heleneEvent.id,
        notes:
          'Pre-landfall activation ahead of Helene. Refrigerated transport to Southwest Florida International airport vault; return delivery 48h after all-clear.',
      },
    });
    await prisma.hurricaneProtocolMember.create({
      data: {
        protocolId: heleneProtocol.id,
        memberId: member.id,
        bottleCountSnapshot: Math.floor(createdWines.length * 0.6),
        totalValueSnapshot: Math.round(totalPortfolioValue * 0.6 * 100) / 100,
        notes: 'Complete inventory match on return. Zero temperature excursions in transit (Sentinel logger attached to case #3).',
      },
    });
    console.log('  ✓ Hurricane protocol: Helene (returned)');
  }

  console.log('\n✅ Seed complete!');
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
