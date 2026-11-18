-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "MemberRole" AS ENUM ('OWNER', 'ADMIN', 'OPERATOR', 'VIEWER');

-- CreateEnum
CREATE TYPE "VehicleStatus" AS ENUM ('ACTIVE', 'MAINTENANCE', 'RETIRED');

-- CreateEnum
CREATE TYPE "DeviceApproval" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "TripStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'ABORTED');

-- CreateEnum
CREATE TYPE "ImpactStatus" AS ENUM ('SUSPECTED', 'CONFIRMED', 'ACKNOWLEDGED', 'CANCELLED', 'RESOLVED', 'FALSE_ALARM');

-- CreateEnum
CREATE TYPE "AlertChannel" AS ENUM ('SMS', 'HTTP', 'EMAIL');

-- CreateEnum
CREATE TYPE "AlertStatus" AS ENUM ('QUEUED', 'SENT', 'FAILED', 'ACKNOWLEDGED');

-- CreateEnum
CREATE TYPE "CommandKind" AS ENUM ('LOCATE', 'ARM', 'DISARM', 'TEST_ALERT', 'SET_CONFIG', 'ROTATE_TOKEN');

-- CreateEnum
CREATE TYPE "CommandStatus" AS ENUM ('PENDING', 'ACKED', 'EXPIRED', 'FAILED');

-- CreateEnum
CREATE TYPE "DeviceEventType" AS ENUM ('HEARTBEAT', 'POWER_LOST', 'POWER_RESTORED', 'GPS_FIX_LOST', 'MODEM_FAULT', 'SENSOR_FAULT', 'CONFIG_APPLIED', 'INCIDENT_CANCELLED', 'INCIDENT_CONFIRMED', 'OTA_INSTALLED', 'OTA_ROLLED_BACK', 'SAFE_MODE_ENTERED', 'DEVICE_OFFLINE');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Organization" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Membership" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "MemberRole" NOT NULL DEFAULT 'OPERATOR',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Membership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Vehicle" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "plateNo" TEXT NOT NULL,
    "make" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "year" INTEGER,
    "vin" TEXT,
    "driverName" TEXT,
    "driverPhone" TEXT,
    "status" "VehicleStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Vehicle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrackerDevice" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "vehicleId" TEXT,
    "mac" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "approvalStatus" "DeviceApproval" NOT NULL DEFAULT 'PENDING',
    "firmwareVersion" TEXT,
    "hwVariant" TEXT,
    "lastSeenAt" TIMESTAMP(3),
    "lastLat" DOUBLE PRECISION,
    "lastLng" DOUBLE PRECISION,
    "lastFixAt" TIMESTAMP(3),
    "lastSpeedKph" DOUBLE PRECISION,
    "batteryV" DOUBLE PRECISION,
    "rssiDbm" INTEGER,
    "satellites" INTEGER,
    "ignition" BOOLEAN,
    "configRev" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrackerDevice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Trip" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3),
    "distanceM" DOUBLE PRECISION,
    "maxSpeedKph" DOUBLE PRECISION,
    "status" "TripStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Trip_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TelemetrySample" (
    "id" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "tripId" TEXT,
    "clientSampleId" TEXT NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "speedKph" DOUBLE PRECISION,
    "headingDeg" DOUBLE PRECISION,
    "accelG" DOUBLE PRECISION,
    "tiltDeg" DOUBLE PRECISION,
    "vibration" BOOLEAN,
    "satellites" INTEGER,
    "hdop" DOUBLE PRECISION,
    "batteryV" DOUBLE PRECISION,
    "ignition" BOOLEAN,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TelemetrySample_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImpactEvent" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "tripId" TEXT,
    "clientIncidentId" TEXT NOT NULL,
    "detectedAt" TIMESTAMP(3) NOT NULL,
    "peakAccelG" DOUBLE PRECISION NOT NULL,
    "tiltDeg" DOUBLE PRECISION NOT NULL,
    "vibrationCount" INTEGER NOT NULL DEFAULT 0,
    "speedKph" DOUBLE PRECISION,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "gpsAgeS" INTEGER,
    "status" "ImpactStatus" NOT NULL DEFAULT 'CONFIRMED',
    "cancelDeadline" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "resolution" TEXT,
    "evidence" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ImpactEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AlertDelivery" (
    "id" TEXT NOT NULL,
    "impactEventId" TEXT NOT NULL,
    "channel" "AlertChannel" NOT NULL,
    "target" TEXT NOT NULL,
    "status" "AlertStatus" NOT NULL DEFAULT 'QUEUED',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "providerRef" TEXT,
    "error" TEXT,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AlertDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeviceCommand" (
    "id" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "kind" "CommandKind" NOT NULL,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "status" "CommandStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "ackedAt" TIMESTAMP(3),

    CONSTRAINT "DeviceCommand_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeviceStateEvent" (
    "id" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "clientEventId" TEXT,
    "type" "DeviceEventType" NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeviceStateEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmergencyContact" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmergencyContact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Geofence" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "vehicleId" TEXT,
    "name" TEXT NOT NULL,
    "centerLat" DOUBLE PRECISION NOT NULL,
    "centerLng" DOUBLE PRECISION NOT NULL,
    "radiusM" DOUBLE PRECISION NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Geofence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrgSettings" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "impactThresholdG" DOUBLE PRECISION NOT NULL DEFAULT 2.5,
    "tiltThresholdDeg" DOUBLE PRECISION NOT NULL DEFAULT 60,
    "confirmWindowMs" INTEGER NOT NULL DEFAULT 200,
    "cancelWindowS" INTEGER NOT NULL DEFAULT 15,
    "heartbeatIntervalS" INTEGER NOT NULL DEFAULT 30,
    "sosRetryS" INTEGER NOT NULL DEFAULT 60,
    "telemetryRetentionDays" INTEGER NOT NULL DEFAULT 30,
    "incidentRetentionDays" INTEGER NOT NULL DEFAULT 365,
    "alertPhones" JSONB NOT NULL DEFAULT '[]',
    "alertEmails" JSONB NOT NULL DEFAULT '[]',
    "parkedImpactAlerts" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "OrgSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "orgId" TEXT,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "target" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Organization_slug_key" ON "Organization"("slug");

-- CreateIndex
CREATE INDEX "Membership_userId_idx" ON "Membership"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Membership_orgId_userId_key" ON "Membership"("orgId", "userId");

-- CreateIndex
CREATE INDEX "Vehicle_orgId_status_idx" ON "Vehicle"("orgId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Vehicle_orgId_plateNo_key" ON "Vehicle"("orgId", "plateNo");

-- CreateIndex
CREATE UNIQUE INDEX "TrackerDevice_mac_key" ON "TrackerDevice"("mac");

-- CreateIndex
CREATE UNIQUE INDEX "TrackerDevice_tokenHash_key" ON "TrackerDevice"("tokenHash");

-- CreateIndex
CREATE INDEX "TrackerDevice_orgId_lastSeenAt_idx" ON "TrackerDevice"("orgId", "lastSeenAt");

-- CreateIndex
CREATE INDEX "TrackerDevice_vehicleId_idx" ON "TrackerDevice"("vehicleId");

-- CreateIndex
CREATE INDEX "Trip_vehicleId_startedAt_idx" ON "Trip"("vehicleId", "startedAt");

-- CreateIndex
CREATE INDEX "Trip_deviceId_startedAt_idx" ON "Trip"("deviceId", "startedAt");

-- CreateIndex
CREATE INDEX "Trip_orgId_startedAt_idx" ON "Trip"("orgId", "startedAt");

-- CreateIndex
CREATE INDEX "TelemetrySample_deviceId_recordedAt_idx" ON "TelemetrySample"("deviceId", "recordedAt");

-- CreateIndex
CREATE INDEX "TelemetrySample_tripId_recordedAt_idx" ON "TelemetrySample"("tripId", "recordedAt");

-- CreateIndex
CREATE UNIQUE INDEX "TelemetrySample_deviceId_clientSampleId_key" ON "TelemetrySample"("deviceId", "clientSampleId");

-- CreateIndex
CREATE INDEX "ImpactEvent_orgId_detectedAt_idx" ON "ImpactEvent"("orgId", "detectedAt");

-- CreateIndex
CREATE INDEX "ImpactEvent_vehicleId_detectedAt_idx" ON "ImpactEvent"("vehicleId", "detectedAt");

-- CreateIndex
CREATE INDEX "ImpactEvent_status_detectedAt_idx" ON "ImpactEvent"("status", "detectedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ImpactEvent_deviceId_clientIncidentId_key" ON "ImpactEvent"("deviceId", "clientIncidentId");

-- CreateIndex
CREATE INDEX "AlertDelivery_impactEventId_status_idx" ON "AlertDelivery"("impactEventId", "status");

-- CreateIndex
CREATE INDEX "DeviceCommand_deviceId_status_createdAt_idx" ON "DeviceCommand"("deviceId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "DeviceStateEvent_deviceId_createdAt_idx" ON "DeviceStateEvent"("deviceId", "createdAt");

-- CreateIndex
CREATE INDEX "DeviceStateEvent_type_createdAt_idx" ON "DeviceStateEvent"("type", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "DeviceStateEvent_deviceId_clientEventId_key" ON "DeviceStateEvent"("deviceId", "clientEventId");

-- CreateIndex
CREATE INDEX "EmergencyContact_orgId_active_idx" ON "EmergencyContact"("orgId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "EmergencyContact_orgId_phone_key" ON "EmergencyContact"("orgId", "phone");

-- CreateIndex
CREATE INDEX "Geofence_orgId_active_idx" ON "Geofence"("orgId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "OrgSettings_orgId_key" ON "OrgSettings"("orgId");

-- CreateIndex
CREATE INDEX "AuditLog_orgId_createdAt_idx" ON "AuditLog"("orgId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_action_createdAt_idx" ON "AuditLog"("action", "createdAt");

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vehicle" ADD CONSTRAINT "Vehicle_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrackerDevice" ADD CONSTRAINT "TrackerDevice_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrackerDevice" ADD CONSTRAINT "TrackerDevice_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Trip" ADD CONSTRAINT "Trip_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Trip" ADD CONSTRAINT "Trip_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Trip" ADD CONSTRAINT "Trip_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "TrackerDevice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TelemetrySample" ADD CONSTRAINT "TelemetrySample_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "TrackerDevice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TelemetrySample" ADD CONSTRAINT "TelemetrySample_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImpactEvent" ADD CONSTRAINT "ImpactEvent_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImpactEvent" ADD CONSTRAINT "ImpactEvent_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "TrackerDevice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImpactEvent" ADD CONSTRAINT "ImpactEvent_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImpactEvent" ADD CONSTRAINT "ImpactEvent_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AlertDelivery" ADD CONSTRAINT "AlertDelivery_impactEventId_fkey" FOREIGN KEY ("impactEventId") REFERENCES "ImpactEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeviceCommand" ADD CONSTRAINT "DeviceCommand_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "TrackerDevice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeviceStateEvent" ADD CONSTRAINT "DeviceStateEvent_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "TrackerDevice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmergencyContact" ADD CONSTRAINT "EmergencyContact_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Geofence" ADD CONSTRAINT "Geofence_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Geofence" ADD CONSTRAINT "Geofence_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrgSettings" ADD CONSTRAINT "OrgSettings_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

