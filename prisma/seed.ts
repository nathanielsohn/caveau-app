import { PrismaClient } from '@prisma/client';
import { createHash } from 'crypto';

const prisma = new PrismaClient();

// ── Wine catalog ──────────────────────────────────────────────────────

const wines = [
  // Caveau Private Label (5)
  { name: 'Caveau Reserve Cabernet Sauvignon', vintage: 2019, region: 'Napa Valley', varietal: 'Cabernet Sauvignon', producer: 'Caveau Estates', purchasePrice: 285, currentValue: 340, tastingNotes: 'Dense blackcurrant and cassis with cedar, tobacco, and a hint of dark chocolate. Full-bodied with velvety tannins and a long, persistent finish.', drinkWindowStart: 2024, drinkWindowEnd: 2035 },
  { name: 'Caveau Estate Pinot Noir', vintage: 2020, region: 'Sonoma Coast', varietal: 'Pinot Noir', producer: 'Caveau Estates', purchasePrice: 195, currentValue: 230, tastingNotes: 'Bright cherry and raspberry with earthy undertones, rose petal, and subtle baking spice. Silky texture with balanced acidity.', drinkWindowStart: 2023, drinkWindowEnd: 2030 },
  { name: 'Caveau Grand Cru Chardonnay', vintage: 2021, region: 'Sonoma Coast', varietal: 'Chardonnay', producer: 'Caveau Estates', purchasePrice: 165, currentValue: 190, tastingNotes: 'Crisp green apple and citrus with toasted almond, vanilla, and a mineral finish. Elegant and well-structured.', drinkWindowStart: 2023, drinkWindowEnd: 2028 },
  { name: 'Caveau Vintage Merlot', vintage: 2018, region: 'Napa Valley', varietal: 'Merlot', producer: 'Caveau Estates', purchasePrice: 210, currentValue: 265, tastingNotes: 'Plush plum and black cherry with mocha, graphite, and dried herbs. Round tannins with a supple mid-palate.', drinkWindowStart: 2023, drinkWindowEnd: 2032 },
  { name: 'Caveau Limited Syrah', vintage: 2020, region: 'Paso Robles', varietal: 'Syrah', producer: 'Caveau Estates', purchasePrice: 175, currentValue: 210, tastingNotes: 'Smoky blackberry and blueberry with cracked pepper, cured meat, and violet. Dense and concentrated with a savory finish.', drinkWindowStart: 2024, drinkWindowEnd: 2034 },

  // Investment Grade (8)
  { name: 'Domaine de la Romanée-Conti Grand Cru', vintage: 2018, region: 'Burgundy', varietal: 'Pinot Noir', producer: 'Domaine de la Romanée-Conti', purchasePrice: 22500, currentValue: 25800, tastingNotes: 'Ethereal rose petal, wild strawberry, and exotic spice. Transcendent complexity with layers of earth, truffle, and silk. Infinite finish.', drinkWindowStart: 2028, drinkWindowEnd: 2060 },
  { name: 'Screaming Eagle Cabernet Sauvignon', vintage: 2019, region: 'Napa Valley', varietal: 'Cabernet Sauvignon', producer: 'Screaming Eagle', purchasePrice: 4200, currentValue: 5100, tastingNotes: 'Pure cassis and blackberry with graphite, espresso, and crushed violets. Extraordinary density yet weightless on the palate.', drinkWindowStart: 2026, drinkWindowEnd: 2055 },
  { name: 'Petrus', vintage: 2017, region: 'Bordeaux', varietal: 'Merlot', producer: 'Petrus', purchasePrice: 4800, currentValue: 5500, tastingNotes: 'Opulent truffle, black cherry, and iron minerality. Liquid velvet with an architectural structure that defies the varietal.', drinkWindowStart: 2027, drinkWindowEnd: 2055 },
  { name: 'Château Lafite Rothschild', vintage: 2016, region: 'Bordeaux', varietal: 'Cabernet Sauvignon', producer: 'Château Lafite Rothschild', purchasePrice: 1200, currentValue: 1650, tastingNotes: 'Lead pencil, cassis, and cedar with extraordinary precision. The tannins are seamless, the finish seemingly endless.', drinkWindowStart: 2026, drinkWindowEnd: 2060 },
  { name: 'Opus One', vintage: 2019, region: 'Napa Valley', varietal: 'Cabernet Sauvignon', producer: 'Opus One Winery', purchasePrice: 420, currentValue: 485, tastingNotes: 'Cassis and dark plum with espresso, cocoa, and subtle floral notes. Impeccably balanced with fine-grained tannins.', drinkWindowStart: 2025, drinkWindowEnd: 2045 },
  { name: 'Sassicaia', vintage: 2018, region: 'Tuscany', varietal: 'Cabernet Sauvignon', producer: 'Tenuta San Guido', purchasePrice: 380, currentValue: 440, tastingNotes: 'Wild herbs, dark cherry, and Mediterranean scrub with tobacco and licorice. Firm yet elegant with a long savory finish.', drinkWindowStart: 2025, drinkWindowEnd: 2042 },
  { name: 'Penfolds Grange', vintage: 2017, region: 'South Australia', varietal: 'Shiraz', producer: 'Penfolds', purchasePrice: 750, currentValue: 890, tastingNotes: 'Concentrated blackberry, dark chocolate, and smoked meat with tar and anise. Monumental structure with decades of life ahead.', drinkWindowStart: 2027, drinkWindowEnd: 2055 },
  { name: 'Château Margaux', vintage: 2015, region: 'Bordeaux', varietal: 'Cabernet Sauvignon', producer: 'Château Margaux', purchasePrice: 950, currentValue: 1350, tastingNotes: 'Perfumed violets, cassis, and black tea with extraordinary finesse. The quintessence of elegance — power wrapped in lace.', drinkWindowStart: 2025, drinkWindowEnd: 2060 },

  // Mid-Range (12)
  { name: 'Caymus Special Selection', vintage: 2019, region: 'Napa Valley', varietal: 'Cabernet Sauvignon', producer: 'Caymus Vineyards', purchasePrice: 185, currentValue: 210, tastingNotes: 'Rich dark fruit, cocoa, and vanilla with hints of tobacco. Bold and approachable with soft tannins.', drinkWindowStart: 2023, drinkWindowEnd: 2035 },
  { name: 'Silver Oak Alexander Valley', vintage: 2018, region: 'Alexander Valley', varietal: 'Cabernet Sauvignon', producer: 'Silver Oak', purchasePrice: 95, currentValue: 115, tastingNotes: 'Ripe blackberry and cassis with sweet vanilla from American oak. Plush and generous with a lingering finish.', drinkWindowStart: 2023, drinkWindowEnd: 2032 },
  { name: 'Jordan Cabernet Sauvignon', vintage: 2019, region: 'Alexander Valley', varietal: 'Cabernet Sauvignon', producer: 'Jordan Vineyard & Winery', purchasePrice: 65, currentValue: 78, tastingNotes: 'Elegant cassis and cherry with dried herbs and gentle oak. Bordeaux-inspired restraint with California warmth.', drinkWindowStart: 2023, drinkWindowEnd: 2030 },
  { name: 'Duckhorn Merlot', vintage: 2020, region: 'Napa Valley', varietal: 'Merlot', producer: 'Duckhorn Vineyards', purchasePrice: 58, currentValue: 65, tastingNotes: 'Plum and boysenberry with cola, mocha, and baking spice. Lush mid-palate with polished tannins.', drinkWindowStart: 2023, drinkWindowEnd: 2029 },
  { name: "Stag's Leap Cask 23", vintage: 2018, region: 'Napa Valley', varietal: 'Cabernet Sauvignon', producer: "Stag's Leap Wine Cellars", purchasePrice: 250, currentValue: 310, tastingNotes: 'Black cherry, currant, and olive tapenade with cedar and dark earth. Structured yet graceful with a savory core.', drinkWindowStart: 2024, drinkWindowEnd: 2038 },
  { name: 'Robert Mondavi Reserve', vintage: 2019, region: 'Napa Valley', varietal: 'Cabernet Sauvignon', producer: 'Robert Mondavi Winery', purchasePrice: 175, currentValue: 195, tastingNotes: 'Classic Napa cab: dark fruit, espresso, and toasty oak with mineral depth. Balanced and age-worthy.', drinkWindowStart: 2024, drinkWindowEnd: 2035 },
  { name: 'Far Niente Chardonnay', vintage: 2021, region: 'Napa Valley', varietal: 'Chardonnay', producer: 'Far Niente', purchasePrice: 68, currentValue: 72, tastingNotes: 'Meyer lemon and ripe pear with honeysuckle and crème brûlée. Rich and creamy with bright acidity.', drinkWindowStart: 2023, drinkWindowEnd: 2027 },
  { name: 'Cakebread Cellars Sauvignon Blanc', vintage: 2022, region: 'Napa Valley', varietal: 'Sauvignon Blanc', producer: 'Cakebread Cellars', purchasePrice: 32, currentValue: 35, tastingNotes: 'Crisp grapefruit and passion fruit with fresh-cut grass and flinty minerality. Zesty and refreshing.', drinkWindowStart: 2023, drinkWindowEnd: 2026 },
  { name: 'Ridge Monte Bello', vintage: 2018, region: 'Santa Cruz Mountains', varietal: 'Cabernet Sauvignon', producer: 'Ridge Vineyards', purchasePrice: 220, currentValue: 280, tastingNotes: 'Dark cherry and iron minerality with dried sage, crushed rock, and cedar. Austere and powerful with tremendous aging potential.', drinkWindowStart: 2026, drinkWindowEnd: 2048 },
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
  { name: 'Château Palmer', vintage: 2017, region: 'Bordeaux', varietal: 'Merlot', producer: 'Château Palmer', purchasePrice: 280, currentValue: 360, tastingNotes: 'Exotic spice, violet, and dark plum with a velvety Margaux texture. Hedonistic richness with underlying structure.', drinkWindowStart: 2025, drinkWindowEnd: 2045 },
  { name: 'Château Léoville-Las Cases', vintage: 2016, region: 'Bordeaux', varietal: 'Cabernet Sauvignon', producer: 'Château Léoville-Las Cases', purchasePrice: 200, currentValue: 270, tastingNotes: 'Intense cassis and blackberry with cedar, graphite, and iron. Often called the "Latour of Saint-Julien" for its structure.', drinkWindowStart: 2026, drinkWindowEnd: 2055 },
];

// ── Alerts ─────────────────────────────────────────────────────────────

function daysAgo(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(Math.floor(Math.random() * 24), Math.floor(Math.random() * 60));
  return d;
}

const alertData = [
  { type: 'temperature', severity: 'warning', message: 'Temperature elevated: 59.8°F (threshold 59°F)', timestamp: daysAgo(28), resolved: true },
  { type: 'humidity', severity: 'warning', message: 'Humidity low: 53.2% (threshold 55%)', timestamp: daysAgo(23), resolved: true },
  { type: 'vibration', severity: 'warning', message: 'Vibration spike detected: 0.62 mm/s (threshold 0.5 mm/s)', timestamp: daysAgo(18), resolved: true },
  { type: 'temperature', severity: 'critical', message: 'Temperature critical: 62.4°F (threshold 59°F)', timestamp: daysAgo(14), resolved: true },
  { type: 'humidity', severity: 'warning', message: 'Humidity elevated: 76.1% (threshold 75%)', timestamp: daysAgo(10), resolved: true },
  { type: 'vibration', severity: 'critical', message: 'Vibration critical: 1.12 mm/s (threshold 0.5 mm/s)', timestamp: daysAgo(7), resolved: true },
  { type: 'temperature', severity: 'warning', message: 'Temperature low: 49.3°F (threshold 50°F)', timestamp: daysAgo(3), resolved: false },
  { type: 'humidity', severity: 'warning', message: 'Humidity low: 54.1% (threshold 55%)', timestamp: daysAgo(1), resolved: false },
];

// ── Slot layout ────────────────────────────────────────────────────────

// Locker #7: 16 occupied positions (out of 32)
const locker7OccupiedPositions = [1, 2, 3, 5, 6, 8, 9, 10, 13, 14, 17, 18, 21, 22, 25, 26];
// Locker #12: 8 occupied positions (out of 32)
const locker12OccupiedPositions = [1, 3, 5, 7, 9, 11, 13, 15];

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
    prisma.wine.deleteMany(),
    prisma.locker.deleteMany(),
    prisma.member.deleteMany(),
    prisma.facility.deleteMany(),
  ]);

  // 1. Facility
  const facility = await prisma.facility.create({
    data: { name: 'Caveau Naples', location: 'Naples, FL' },
  });
  console.log(`  ✓ Facility: ${facility.name}`);

  // 2. Member
  const member = await prisma.member.create({
    data: {
      name: 'Alessandro Marchetti',
      email: 'alessandro@caveau.com',
      tier: 'black',
      role: 'member',
    },
  });
  console.log(`  ✓ Member: ${member.name}`);

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

  // 4. Lockers
  const locker7 = await prisma.locker.create({
    data: {
      lockerNumber: 7,
      zone: 'A',
      facilityId: facility.id,
      memberId: member.id,
    },
  });
  const locker12 = await prisma.locker.create({
    data: {
      lockerNumber: 12,
      zone: 'B',
      facilityId: facility.id,
      memberId: member.id,
    },
  });
  console.log('  ✓ Lockers: #7 (Zone A), #12 (Zone B)');

  // 5. Locker slots — all 32 per locker, some occupied
  let wineIndex = 0;

  for (let pos = 1; pos <= 32; pos++) {
    const occupied = locker7OccupiedPositions.includes(pos);
    await prisma.lockerSlot.create({
      data: {
        lockerId: locker7.id,
        slotPosition: pos,
        wineId: occupied ? createdWines[wineIndex]?.id : null,
        dateStored: occupied
          ? new Date(Date.now() - Math.floor(Math.random() * 90 + 10) * 86400000)
          : null,
      },
    });
    if (occupied) wineIndex++;
  }

  for (let pos = 1; pos <= 32; pos++) {
    const occupied = locker12OccupiedPositions.includes(pos);
    await prisma.lockerSlot.create({
      data: {
        lockerId: locker12.id,
        slotPosition: pos,
        wineId: occupied ? createdWines[wineIndex]?.id : null,
        dateStored: occupied
          ? new Date(Date.now() - Math.floor(Math.random() * 90 + 10) * 86400000)
          : null,
      },
    });
    if (occupied) wineIndex++;
  }
  console.log(`  ✓ Locker slots: 64 total, ${wineIndex} occupied`);

  // 6. Alerts — split between both lockers
  for (let i = 0; i < alertData.length; i++) {
    const a = alertData[i];
    await prisma.alert.create({
      data: {
        lockerId: i < 4 ? locker7.id : locker12.id,
        type: a.type,
        severity: a.severity,
        message: a.message,
        timestamp: a.timestamp,
        resolved: a.resolved,
      },
    });
  }
  console.log(`  ✓ Alerts: ${alertData.length}`);

  // 7. Provenance certificates — top 5 investment-grade wines (indices 5–9)
  const certWines = createdWines.slice(5, 10); // DRC, Screaming Eagle, Petrus, Lafite, Opus One
  for (let i = 0; i < certWines.length; i++) {
    const wine = certWines[i];
    const monitoringStart = new Date(Date.now() - 180 * 86400000); // ~6 months ago
    const monitoringEnd = new Date();
    const hash = createHash('sha256')
      .update(`${wine.id}|${locker7.id}|${monitoringStart.toISOString()}|${monitoringEnd.toISOString()}`)
      .digest('hex');

    await prisma.provenanceCertificate.create({
      data: {
        wineId: wine.id,
        lockerId: locker7.id,
        monitoringStart,
        monitoringEnd,
        tempMean: 55.0 + i * 0.1,
        tempMin: 50.5 + i * 0.2,
        tempMax: 58.2 + i * 0.15,
        humidityMean: 64.5 + i * 0.3,
        dataIntegrityHash: hash,
        certificateNumber: `CAV-2026-${String(i + 1).padStart(4, '0')}`,
      },
    });
  }
  console.log(`  ✓ Provenance certificates: ${certWines.length}`);

  // 8. Wine valuations — 1 per wine (source "manual", price = currentValue)
  for (const wine of createdWines) {
    await prisma.wineValuation.create({
      data: {
        wineId: wine.id,
        source: 'manual',
        price: wine.currentValue,
        date: wine.createdAt,
      },
    });
  }
  console.log(`  ✓ Wine valuations: ${createdWines.length}`);

  console.log('\n✅ Seed complete!');
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
