# Data Model

> Last updated: 2026-04-11 | All 14 core features complete

## Entity Relationship Diagram

```mermaid
erDiagram
    Facility ||--o{ Locker : "houses"
    Member ||--o{ Wine : "owns"
    Member ||--o{ Locker : "rents"
    Wine ||--o{ LockerSlot : "stored in"
    Wine ||--o{ WineValuation : "valued at"
    Wine ||--o{ ProvenanceCertificate : "certified by"
    Locker ||--o{ LockerSlot : "contains"
    Locker ||--o{ SensorReading : "monitored by"
    Locker ||--o{ Alert : "triggers"
    Locker ||--o{ ProvenanceCertificate : "covers"

    Facility {
        uuid id PK
        string name
        string location
        datetime created_at
    }
    Member {
        uuid id PK
        string name
        string email UK
        string tier
        string role
        datetime created_at
    }
    Wine {
        uuid id PK
        string name
        int vintage
        string region
        string varietal
        string producer
        decimal purchase_price
        decimal current_value
        string image_url
        string tasting_notes
        int drink_window_start
        int drink_window_end
        uuid member_id FK
        datetime created_at
    }
    WineValuation {
        uuid id PK
        uuid wine_id FK
        string source
        decimal price
        datetime date
    }
    Locker {
        uuid id PK
        int locker_number UK
        string zone
        uuid facility_id FK
        uuid member_id FK
    }
    LockerSlot {
        uuid id PK
        uuid locker_id FK
        int slot_position
        uuid wine_id FK
        datetime date_stored
    }
    SensorReading {
        int id PK
        uuid locker_id FK
        decimal temperature
        decimal humidity
        decimal vibration
        decimal light_lux
        datetime timestamp
    }
    Alert {
        uuid id PK
        uuid locker_id FK
        string type
        string severity
        string message
        datetime timestamp
        boolean resolved
    }
    ProvenanceCertificate {
        uuid id PK
        uuid wine_id FK
        uuid locker_id FK
        datetime monitoring_start
        datetime monitoring_end
        decimal temp_mean
        decimal temp_min
        decimal temp_max
        decimal humidity_mean
        string data_integrity_hash
        string certificate_number UK
        datetime created_at
    }
```

## Entity Descriptions

> Seed data quantities below describe the demo data seeded by Feature 02.

### Facility
Physical wine storage location. Included to support multi-location expansion post-demo. Demo will seed one facility ("Caveau Naples").

### Member
A Caveau member. The `role` field (`admin` | `staff` | `member`) enables RBAC when auth is added. Demo will seed one user ("Robert Saenz", Black tier, role: `member`).

### Wine
A bottle in a member's collection. Seeds 66 wines across 8 categories: Caveau private label (5), investment-grade (8), mid-range (12), French classics (10), Italian icons (10), Spanish/Portuguese (6), New World gems (10), and Champagne (5).

### WineValuation
Price history for a wine. Seeds 4-6 entries per wine (329 total) with sources: "manual", "liv-ex", "wine-searcher", "auction" over 12 months. Powers the dashboard analytics collection value trend chart.

### Locker
A physical wine locker assigned to a facility and member. Each has 32 slots (4 columns x 8 rows). Seeds 4 lockers: #7 (Zone A), #12 (Zone B), #19 (Zone C), #24 (Zone D).

### LockerSlot
A position within a locker. The `[lockerId, slotPosition]` unique constraint prevents double-booking. Seeds 66 of 128 total slots as occupied.

### SensorReading
Environmental data from a locker's Sentinel sensor. Uses **autoincrement** IDs (not UUID) for write performance at scale. Seeds ~34K rows (30 days at 5-minute intervals for 4 lockers).

### Alert
A threshold breach or access event. Types include temperature, humidity, vibration, and access (badge scans). Live alerts from the Sentinel page are in-memory only — they are not written to this table. Seeds 20 historical alerts.

### ProvenanceCertificate
A document certifying storage conditions for a wine. Includes aggregated sensor stats (temp mean/min/max, humidity mean) and a SHA-256 data integrity hash of the sensor readings in the monitoring window.

## Important: Prisma Decimal Fields

Prisma returns `Decimal` columns as `Prisma.Decimal` objects (string-backed), **not native JS numbers**. This affects:

- `Wine.purchasePrice`, `Wine.currentValue`
- `WineValuation.price`
- All `SensorReading` fields (temperature, humidity, vibration, lightLux)
- `ProvenanceCertificate` temp/humidity fields

**Always** use `Number()` or `.toNumber()` before doing arithmetic. The `toNumber()` helper in `src/lib/utils.ts` handles all cases (Decimal, string, number, null).

## Indexes

| Table | Index | Purpose |
|-------|-------|---------|
| wines | member_id | Filter wines by member |
| wine_valuations | wine_id, date DESC | Latest valuation per wine |
| lockers | facility_id | Lockers by facility |
| lockers | member_id | Lockers by member |
| locker_slots | locker_id + slot_position (unique) | Prevent double-booking |
| sensor_readings | locker_id, timestamp DESC | Recent readings per locker |
| sensor_readings | timestamp DESC | Global recent readings |
| alerts | locker_id, timestamp DESC | Recent alerts per locker |
| alerts | resolved, locker_id | Unresolved alert queries |
