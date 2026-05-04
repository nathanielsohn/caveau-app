-- CreateEnum
CREATE TYPE "Role" AS ENUM ('admin', 'staff', 'member');

-- CreateEnum
CREATE TYPE "Tier" AS ENUM ('gold', 'platinum', 'black');

-- CreateEnum
CREATE TYPE "AlertType" AS ENUM ('temperature', 'humidity', 'vibration', 'light', 'door', 'access');

-- CreateEnum
CREATE TYPE "Severity" AS ENUM ('info', 'warning', 'critical');

-- CreateEnum
CREATE TYPE "WineStatus" AS ENUM ('in_cellar', 'sold', 'transferred', 'consumed', 'gifted', 'removed');

-- CreateEnum
CREATE TYPE "DispositionType" AS ENUM ('sold', 'transferred', 'consumed', 'gifted', 'removed');

-- CreateTable
CREATE TABLE "facilities" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "facilities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "members" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "tier" "Tier" NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'member',
    "password_hash" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wines" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "vintage" INTEGER NOT NULL,
    "region" TEXT NOT NULL,
    "varietal" TEXT NOT NULL,
    "producer" TEXT NOT NULL,
    "purchase_price" DECIMAL(10,2) NOT NULL,
    "current_value" DECIMAL(10,2) NOT NULL,
    "image_url" TEXT,
    "tasting_notes" TEXT,
    "drink_window_start" INTEGER,
    "drink_window_end" INTEGER,
    "status" "WineStatus" NOT NULL DEFAULT 'in_cellar',
    "member_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wine_valuations" (
    "id" TEXT NOT NULL,
    "wine_id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "price" DECIMAL(10,2) NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "wine_valuations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lockers" (
    "id" TEXT NOT NULL,
    "locker_number" INTEGER NOT NULL,
    "zone" TEXT NOT NULL,
    "facility_id" TEXT,
    "member_id" TEXT,

    CONSTRAINT "lockers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "locker_slots" (
    "id" TEXT NOT NULL,
    "locker_id" TEXT NOT NULL,
    "slot_position" INTEGER NOT NULL,
    "wine_id" TEXT,
    "date_stored" TIMESTAMP(3),

    CONSTRAINT "locker_slots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sensor_readings" (
    "id" SERIAL NOT NULL,
    "locker_id" TEXT NOT NULL,
    "temperature" DECIMAL(5,2) NOT NULL,
    "humidity" DECIMAL(5,2) NOT NULL,
    "vibration" DECIMAL(5,3) NOT NULL,
    "light_lux" DECIMAL(5,2) NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sensor_readings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alerts" (
    "id" TEXT NOT NULL,
    "locker_id" TEXT NOT NULL,
    "type" "AlertType" NOT NULL,
    "severity" "Severity" NOT NULL,
    "message" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "alerts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "provenance_certificates" (
    "id" TEXT NOT NULL,
    "wine_id" TEXT NOT NULL,
    "locker_id" TEXT NOT NULL,
    "monitoring_start" TIMESTAMP(3) NOT NULL,
    "monitoring_end" TIMESTAMP(3) NOT NULL,
    "temp_mean" DECIMAL(5,2),
    "temp_min" DECIMAL(5,2),
    "temp_max" DECIMAL(5,2),
    "humidity_mean" DECIMAL(5,2),
    "data_integrity_hash" TEXT NOT NULL,
    "certificate_number" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "provenance_certificates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wine_dispositions" (
    "id" TEXT NOT NULL,
    "wine_id" TEXT NOT NULL,
    "member_id" TEXT NOT NULL,
    "type" "DispositionType" NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "sale_price" DECIMAL(10,2),
    "recipient" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wine_dispositions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "members_email_key" ON "members"("email");

-- CreateIndex
CREATE INDEX "members_tier_idx" ON "members"("tier");

-- CreateIndex
CREATE INDEX "members_role_idx" ON "members"("role");

-- CreateIndex
CREATE INDEX "wines_member_id_idx" ON "wines"("member_id");

-- CreateIndex
CREATE INDEX "wines_member_id_region_varietal_idx" ON "wines"("member_id", "region", "varietal");

-- CreateIndex
CREATE INDEX "wines_member_id_status_idx" ON "wines"("member_id", "status");

-- CreateIndex
CREATE INDEX "wine_valuations_wine_id_date_idx" ON "wine_valuations"("wine_id", "date" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "wine_valuations_wine_id_date_source_key" ON "wine_valuations"("wine_id", "date", "source");

-- CreateIndex
CREATE UNIQUE INDEX "lockers_locker_number_key" ON "lockers"("locker_number");

-- CreateIndex
CREATE INDEX "lockers_facility_id_idx" ON "lockers"("facility_id");

-- CreateIndex
CREATE INDEX "lockers_member_id_idx" ON "lockers"("member_id");

-- CreateIndex
CREATE INDEX "locker_slots_wine_id_idx" ON "locker_slots"("wine_id");

-- CreateIndex
CREATE UNIQUE INDEX "locker_slots_locker_id_slot_position_key" ON "locker_slots"("locker_id", "slot_position");

-- CreateIndex
CREATE INDEX "sensor_readings_locker_id_timestamp_idx" ON "sensor_readings"("locker_id", "timestamp" DESC);

-- CreateIndex
CREATE INDEX "sensor_readings_timestamp_idx" ON "sensor_readings"("timestamp" DESC);

-- CreateIndex
CREATE INDEX "alerts_locker_id_timestamp_idx" ON "alerts"("locker_id", "timestamp" DESC);

-- CreateIndex
CREATE INDEX "alerts_resolved_locker_id_timestamp_idx" ON "alerts"("resolved", "locker_id", "timestamp" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "provenance_certificates_certificate_number_key" ON "provenance_certificates"("certificate_number");

-- CreateIndex
CREATE INDEX "provenance_certificates_wine_id_locker_id_idx" ON "provenance_certificates"("wine_id", "locker_id");

-- CreateIndex
CREATE INDEX "wine_dispositions_wine_id_idx" ON "wine_dispositions"("wine_id");

-- CreateIndex
CREATE INDEX "wine_dispositions_member_id_idx" ON "wine_dispositions"("member_id");

-- CreateIndex
CREATE UNIQUE INDEX "wine_dispositions_wine_id_type_date_key" ON "wine_dispositions"("wine_id", "type", "date");

-- AddForeignKey
ALTER TABLE "wines" ADD CONSTRAINT "wines_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "members"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wine_valuations" ADD CONSTRAINT "wine_valuations_wine_id_fkey" FOREIGN KEY ("wine_id") REFERENCES "wines"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lockers" ADD CONSTRAINT "lockers_facility_id_fkey" FOREIGN KEY ("facility_id") REFERENCES "facilities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lockers" ADD CONSTRAINT "lockers_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "members"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "locker_slots" ADD CONSTRAINT "locker_slots_locker_id_fkey" FOREIGN KEY ("locker_id") REFERENCES "lockers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "locker_slots" ADD CONSTRAINT "locker_slots_wine_id_fkey" FOREIGN KEY ("wine_id") REFERENCES "wines"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sensor_readings" ADD CONSTRAINT "sensor_readings_locker_id_fkey" FOREIGN KEY ("locker_id") REFERENCES "lockers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_locker_id_fkey" FOREIGN KEY ("locker_id") REFERENCES "lockers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provenance_certificates" ADD CONSTRAINT "provenance_certificates_wine_id_fkey" FOREIGN KEY ("wine_id") REFERENCES "wines"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provenance_certificates" ADD CONSTRAINT "provenance_certificates_locker_id_fkey" FOREIGN KEY ("locker_id") REFERENCES "lockers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wine_dispositions" ADD CONSTRAINT "wine_dispositions_wine_id_fkey" FOREIGN KEY ("wine_id") REFERENCES "wines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wine_dispositions" ADD CONSTRAINT "wine_dispositions_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

