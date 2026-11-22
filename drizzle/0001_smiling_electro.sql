CREATE TABLE `appSessions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`tokenHash` varchar(64) NOT NULL,
	`csrfToken` varchar(64) NOT NULL,
	`expiresAt` timestamp NOT NULL,
	`revokedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `appSessions_id` PRIMARY KEY(`id`),
	CONSTRAINT `appSessions_tokenHash_unique` UNIQUE(`tokenHash`)
);
--> statement-breakpoint
CREATE TABLE `appUsers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`unitId` int NOT NULL,
	`username` varchar(48) NOT NULL,
	`fullName` varchar(160) NOT NULL,
	`passwordHash` varchar(255) NOT NULL,
	`role` enum('frentista','gerente','administrador') NOT NULL DEFAULT 'frentista',
	`active` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`lastLoginAt` timestamp,
	CONSTRAINT `appUsers_id` PRIMARY KEY(`id`),
	CONSTRAINT `appUsers_username_unique` UNIQUE(`username`)
);
--> statement-breakpoint
CREATE TABLE `auditEvents` (
	`id` int AUTO_INCREMENT NOT NULL,
	`unitId` int NOT NULL,
	`userId` int NOT NULL,
	`targetType` varchar(40) NOT NULL,
	`targetId` int NOT NULL,
	`action` varchar(48) NOT NULL,
	`field` varchar(80),
	`beforeValue` text,
	`afterValue` text,
	`reason` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `auditEvents_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `closureNozzles` (
	`id` int AUTO_INCREMENT NOT NULL,
	`closureId` int NOT NULL,
	`pumpId` int NOT NULL,
	`pumpNumber` varchar(24) NOT NULL,
	`fuelType` enum('gasolina_comum','diesel_s10') NOT NULL,
	`initialReading` decimal(14,3) NOT NULL,
	`finalReading` decimal(14,3) NOT NULL,
	`liters` decimal(14,3) NOT NULL,
	`priceCents` int NOT NULL,
	`valueCents` int NOT NULL,
	CONSTRAINT `closureNozzles_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `closurePayments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`closureId` int NOT NULL,
	`method` enum('dinheiro','pix','debito','credito') NOT NULL,
	`amountCents` int NOT NULL,
	CONSTRAINT `closurePayments_id` PRIMARY KEY(`id`),
	CONSTRAINT `payment_closure_method_unique` UNIQUE(`closureId`,`method`)
);
--> statement-breakpoint
CREATE TABLE `closures` (
	`id` int AUTO_INCREMENT NOT NULL,
	`unitId` int NOT NULL,
	`closureDate` varchar(10) NOT NULL,
	`shift` enum('manha','tarde','noite') NOT NULL,
	`employeeId` int NOT NULL,
	`responsibleName` varchar(160) NOT NULL,
	`createdBy` int NOT NULL,
	`status` enum('rascunho','aguardando_conferencia','finalizado','reaberto') NOT NULL DEFAULT 'rascunho',
	`result` enum('pendente','conferido','sobra','falta') NOT NULL DEFAULT 'pendente',
	`salesCents` int NOT NULL DEFAULT 0,
	`receivedCents` int NOT NULL DEFAULT 0,
	`differenceCents` int NOT NULL DEFAULT 0,
	`toleranceCents` int NOT NULL DEFAULT 0,
	`notes` text,
	`employeeConfirmed` boolean NOT NULL DEFAULT false,
	`responsibleConfirmed` boolean NOT NULL DEFAULT false,
	`finalizedAt` timestamp,
	`reopenedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `closures_id` PRIMARY KEY(`id`),
	CONSTRAINT `closure_unit_date_shift_unique` UNIQUE(`unitId`,`closureDate`,`shift`)
);
--> statement-breakpoint
CREATE TABLE `employees` (
	`id` int AUTO_INCREMENT NOT NULL,
	`unitId` int NOT NULL,
	`linkedUserId` int,
	`fullName` varchar(160) NOT NULL,
	`active` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `employees_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `fuelPrices` (
	`id` int AUTO_INCREMENT NOT NULL,
	`unitId` int NOT NULL,
	`fuelType` enum('gasolina_comum','diesel_s10') NOT NULL,
	`priceCents` int NOT NULL,
	`effectiveAt` timestamp NOT NULL DEFAULT (now()),
	`createdBy` int NOT NULL,
	CONSTRAINT `fuelPrices_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `fuelPumps` (
	`id` int AUTO_INCREMENT NOT NULL,
	`unitId` int NOT NULL,
	`number` varchar(24) NOT NULL,
	`fuelType` enum('gasolina_comum','diesel_s10') NOT NULL,
	`active` boolean NOT NULL DEFAULT true,
	CONSTRAINT `fuelPumps_id` PRIMARY KEY(`id`),
	CONSTRAINT `pump_unit_number_unique` UNIQUE(`unitId`,`number`)
);
--> statement-breakpoint
CREATE TABLE `unitSettings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`unitId` int NOT NULL,
	`settingKey` varchar(80) NOT NULL,
	`settingValue` text NOT NULL,
	`updatedBy` int,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `unitSettings_id` PRIMARY KEY(`id`),
	CONSTRAINT `unit_setting_unique` UNIQUE(`unitId`,`settingKey`)
);
--> statement-breakpoint
CREATE TABLE `units` (
	`id` int AUTO_INCREMENT NOT NULL,
	`legalName` varchar(180) NOT NULL,
	`tradeName` varchar(120) NOT NULL,
	`cnpj` varchar(20) NOT NULL,
	`address` varchar(240) NOT NULL,
	`city` varchar(100) NOT NULL,
	`state` varchar(2) NOT NULL,
	`postalCode` varchar(12) NOT NULL,
	`active` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `units_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `appSessions` ADD CONSTRAINT `appSessions_userId_appUsers_id_fk` FOREIGN KEY (`userId`) REFERENCES `appUsers`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `appUsers` ADD CONSTRAINT `appUsers_unitId_units_id_fk` FOREIGN KEY (`unitId`) REFERENCES `units`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `auditEvents` ADD CONSTRAINT `auditEvents_unitId_units_id_fk` FOREIGN KEY (`unitId`) REFERENCES `units`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `auditEvents` ADD CONSTRAINT `auditEvents_userId_appUsers_id_fk` FOREIGN KEY (`userId`) REFERENCES `appUsers`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `closureNozzles` ADD CONSTRAINT `closureNozzles_closureId_closures_id_fk` FOREIGN KEY (`closureId`) REFERENCES `closures`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `closureNozzles` ADD CONSTRAINT `closureNozzles_pumpId_fuelPumps_id_fk` FOREIGN KEY (`pumpId`) REFERENCES `fuelPumps`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `closurePayments` ADD CONSTRAINT `closurePayments_closureId_closures_id_fk` FOREIGN KEY (`closureId`) REFERENCES `closures`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `closures` ADD CONSTRAINT `closures_unitId_units_id_fk` FOREIGN KEY (`unitId`) REFERENCES `units`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `closures` ADD CONSTRAINT `closures_employeeId_employees_id_fk` FOREIGN KEY (`employeeId`) REFERENCES `employees`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `closures` ADD CONSTRAINT `closures_createdBy_appUsers_id_fk` FOREIGN KEY (`createdBy`) REFERENCES `appUsers`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `employees` ADD CONSTRAINT `employees_unitId_units_id_fk` FOREIGN KEY (`unitId`) REFERENCES `units`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `employees` ADD CONSTRAINT `employees_linkedUserId_appUsers_id_fk` FOREIGN KEY (`linkedUserId`) REFERENCES `appUsers`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `fuelPrices` ADD CONSTRAINT `fuelPrices_unitId_units_id_fk` FOREIGN KEY (`unitId`) REFERENCES `units`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `fuelPrices` ADD CONSTRAINT `fuelPrices_createdBy_appUsers_id_fk` FOREIGN KEY (`createdBy`) REFERENCES `appUsers`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `fuelPumps` ADD CONSTRAINT `fuelPumps_unitId_units_id_fk` FOREIGN KEY (`unitId`) REFERENCES `units`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `unitSettings` ADD CONSTRAINT `unitSettings_unitId_units_id_fk` FOREIGN KEY (`unitId`) REFERENCES `units`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `unitSettings` ADD CONSTRAINT `unitSettings_updatedBy_appUsers_id_fk` FOREIGN KEY (`updatedBy`) REFERENCES `appUsers`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `appSessions_user_idx` ON `appSessions` (`userId`);--> statement-breakpoint
CREATE INDEX `appUsers_unit_idx` ON `appUsers` (`unitId`);--> statement-breakpoint
CREATE INDEX `audit_unit_created_idx` ON `auditEvents` (`unitId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `audit_target_idx` ON `auditEvents` (`targetType`,`targetId`);--> statement-breakpoint
CREATE INDEX `nozzle_closure_idx` ON `closureNozzles` (`closureId`);--> statement-breakpoint
CREATE INDEX `closure_date_idx` ON `closures` (`unitId`,`closureDate`);--> statement-breakpoint
CREATE INDEX `closure_employee_idx` ON `closures` (`employeeId`);--> statement-breakpoint
CREATE INDEX `employees_unit_idx` ON `employees` (`unitId`);--> statement-breakpoint
CREATE INDEX `employees_linked_user_idx` ON `employees` (`linkedUserId`);--> statement-breakpoint
CREATE INDEX `fuel_price_lookup_idx` ON `fuelPrices` (`unitId`,`fuelType`,`effectiveAt`);