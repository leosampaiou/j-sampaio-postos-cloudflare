CREATE TABLE `closureParticipants` (
	`id` int AUTO_INCREMENT NOT NULL,
	`closureId` int NOT NULL,
	`employeeId` int NOT NULL,
	`sharePercent` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `closureParticipants_id` PRIMARY KEY(`id`),
	CONSTRAINT `closure_participant_unique` UNIQUE(`closureId`,`employeeId`)
);
--> statement-breakpoint
CREATE TABLE `discrepancyAllocations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`caseId` int NOT NULL,
	`employeeId` int NOT NULL,
	`closureRevision` int NOT NULL,
	`allocatedCents` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `discrepancyAllocations_id` PRIMARY KEY(`id`),
	CONSTRAINT `discrepancy_allocation_revision_unique` UNIQUE(`caseId`,`closureRevision`,`employeeId`)
);
--> statement-breakpoint
CREATE TABLE `discrepancyCases` (
	`id` int AUTO_INCREMENT NOT NULL,
	`unitId` int NOT NULL,
	`closureId` int NOT NULL,
	`closureRevision` int NOT NULL,
	`type` enum('sobra','falta') NOT NULL,
	`amountCents` int NOT NULL,
	`status` enum('pendente_analise','em_investigacao','justificada','encerrada_sem_desconto','encaminhada_administrativo','resolvida','cancelada_por_correcao') NOT NULL DEFAULT 'pendente_analise',
	`justification` text,
	`reviewNotes` text,
	`evidenceKey` varchar(420),
	`decisionBy` int,
	`decisionAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `discrepancyCases_id` PRIMARY KEY(`id`),
	CONSTRAINT `discrepancy_closure_unique` UNIQUE(`closureId`)
);
--> statement-breakpoint
CREATE TABLE `fuelTanks` (
	`id` int AUTO_INCREMENT NOT NULL,
	`unitId` int NOT NULL,
	`name` varchar(100) NOT NULL,
	`code` varchar(40) NOT NULL,
	`fuelType` varchar(80) NOT NULL,
	`capacityTotalLiters` decimal(14,3) NOT NULL,
	`operationalCapacityLiters` decimal(14,3) NOT NULL,
	`minimumStockLiters` decimal(14,3) NOT NULL,
	`initialStockLiters` decimal(14,3) NOT NULL,
	`stockStartDate` varchar(10) NOT NULL,
	`replenishmentLeadDays` int NOT NULL DEFAULT 0,
	`safetyReserveLiters` decimal(14,3) NOT NULL DEFAULT '0',
	`nearMinimumPercent` int NOT NULL DEFAULT 15,
	`autonomyWarningDays` int NOT NULL DEFAULT 3,
	`autonomyCriticalDays` int NOT NULL DEFAULT 2,
	`discrepancyAlertPercent` decimal(9,3) NOT NULL DEFAULT '2',
	`staleAfterDays` int NOT NULL DEFAULT 7,
	`active` boolean NOT NULL DEFAULT true,
	`lastSuppliedAt` timestamp,
	`createdBy` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `fuelTanks_id` PRIMARY KEY(`id`),
	CONSTRAINT `fuel_tank_unit_code_unique` UNIQUE(`unitId`,`code`)
);
--> statement-breakpoint
CREATE TABLE `payrollAdjustmentReviews` (
	`id` int AUTO_INCREMENT NOT NULL,
	`unitId` int NOT NULL,
	`caseId` int NOT NULL,
	`employeeId` int NOT NULL,
	`referenceMonth` varchar(7) NOT NULL,
	`originalAmountCents` int NOT NULL,
	`approvedAmountCents` int,
	`justification` text NOT NULL,
	`status` enum('nao_elegivel','aguardando_analise','aguardando_autorizacao','aprovado','rejeitado','encaminhado_folha','processado') NOT NULL DEFAULT 'aguardando_analise',
	`approvalBy` int,
	`approvedAt` timestamp,
	`createdBy` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `payrollAdjustmentReviews_id` PRIMARY KEY(`id`),
	CONSTRAINT `payroll_review_case_employee_unique` UNIQUE(`caseId`,`employeeId`)
);
--> statement-breakpoint
CREATE TABLE `stockMovements` (
	`id` int AUTO_INCREMENT NOT NULL,
	`unitId` int NOT NULL,
	`tankId` int NOT NULL,
	`movementType` enum('opening','receipt','sale','writeoff','correction') NOT NULL,
	`quantityLiters` decimal(14,3) NOT NULL,
	`sourceKey` varchar(220) NOT NULL,
	`sourceClosureId` int,
	`sourcePumpId` int,
	`supplier` varchar(180),
	`invoiceNumber` varchar(80),
	`acquisitionValueCents` int,
	`documentKey` varchar(420),
	`notes` text,
	`occurredAt` timestamp NOT NULL DEFAULT (now()),
	`createdBy` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `stockMovements_id` PRIMARY KEY(`id`),
	CONSTRAINT `stockMovements_sourceKey_unique` UNIQUE(`sourceKey`),
	CONSTRAINT `stock_movement_invoice_unique` UNIQUE(`unitId`,`tankId`,`invoiceNumber`)
);
--> statement-breakpoint
CREATE TABLE `tankMeasurements` (
	`id` int AUTO_INCREMENT NOT NULL,
	`unitId` int NOT NULL,
	`tankId` int NOT NULL,
	`physicalLiters` decimal(14,3) NOT NULL,
	`theoreticalLiters` decimal(14,3) NOT NULL,
	`differenceLiters` decimal(14,3) NOT NULL,
	`differencePercent` decimal(9,3),
	`measuredAt` timestamp NOT NULL,
	`notes` text,
	`measuredBy` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `tankMeasurements_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `tankPumpAssignments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`unitId` int NOT NULL,
	`pumpId` int NOT NULL,
	`tankId` int NOT NULL,
	`createdBy` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `tankPumpAssignments_id` PRIMARY KEY(`id`),
	CONSTRAINT `tank_pump_one_assignment_unique` UNIQUE(`pumpId`)
);
--> statement-breakpoint
ALTER TABLE `closures` ADD `revision` int DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `closureParticipants` ADD CONSTRAINT `closureParticipants_closureId_closures_id_fk` FOREIGN KEY (`closureId`) REFERENCES `closures`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `closureParticipants` ADD CONSTRAINT `closureParticipants_employeeId_employees_id_fk` FOREIGN KEY (`employeeId`) REFERENCES `employees`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `discrepancyAllocations` ADD CONSTRAINT `discrepancyAllocations_caseId_discrepancyCases_id_fk` FOREIGN KEY (`caseId`) REFERENCES `discrepancyCases`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `discrepancyAllocations` ADD CONSTRAINT `discrepancyAllocations_employeeId_employees_id_fk` FOREIGN KEY (`employeeId`) REFERENCES `employees`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `discrepancyCases` ADD CONSTRAINT `discrepancyCases_unitId_units_id_fk` FOREIGN KEY (`unitId`) REFERENCES `units`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `discrepancyCases` ADD CONSTRAINT `discrepancyCases_closureId_closures_id_fk` FOREIGN KEY (`closureId`) REFERENCES `closures`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `discrepancyCases` ADD CONSTRAINT `discrepancyCases_decisionBy_appUsers_id_fk` FOREIGN KEY (`decisionBy`) REFERENCES `appUsers`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `fuelTanks` ADD CONSTRAINT `fuelTanks_unitId_units_id_fk` FOREIGN KEY (`unitId`) REFERENCES `units`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `fuelTanks` ADD CONSTRAINT `fuelTanks_createdBy_appUsers_id_fk` FOREIGN KEY (`createdBy`) REFERENCES `appUsers`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `payrollAdjustmentReviews` ADD CONSTRAINT `payrollAdjustmentReviews_unitId_units_id_fk` FOREIGN KEY (`unitId`) REFERENCES `units`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `payrollAdjustmentReviews` ADD CONSTRAINT `payrollAdjustmentReviews_caseId_discrepancyCases_id_fk` FOREIGN KEY (`caseId`) REFERENCES `discrepancyCases`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `payrollAdjustmentReviews` ADD CONSTRAINT `payrollAdjustmentReviews_employeeId_employees_id_fk` FOREIGN KEY (`employeeId`) REFERENCES `employees`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `payrollAdjustmentReviews` ADD CONSTRAINT `payrollAdjustmentReviews_approvalBy_appUsers_id_fk` FOREIGN KEY (`approvalBy`) REFERENCES `appUsers`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `payrollAdjustmentReviews` ADD CONSTRAINT `payrollAdjustmentReviews_createdBy_appUsers_id_fk` FOREIGN KEY (`createdBy`) REFERENCES `appUsers`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `stockMovements` ADD CONSTRAINT `stockMovements_unitId_units_id_fk` FOREIGN KEY (`unitId`) REFERENCES `units`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `stockMovements` ADD CONSTRAINT `stockMovements_tankId_fuelTanks_id_fk` FOREIGN KEY (`tankId`) REFERENCES `fuelTanks`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `stockMovements` ADD CONSTRAINT `stockMovements_sourceClosureId_closures_id_fk` FOREIGN KEY (`sourceClosureId`) REFERENCES `closures`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `stockMovements` ADD CONSTRAINT `stockMovements_sourcePumpId_fuelPumps_id_fk` FOREIGN KEY (`sourcePumpId`) REFERENCES `fuelPumps`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `stockMovements` ADD CONSTRAINT `stockMovements_createdBy_appUsers_id_fk` FOREIGN KEY (`createdBy`) REFERENCES `appUsers`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `tankMeasurements` ADD CONSTRAINT `tankMeasurements_unitId_units_id_fk` FOREIGN KEY (`unitId`) REFERENCES `units`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `tankMeasurements` ADD CONSTRAINT `tankMeasurements_tankId_fuelTanks_id_fk` FOREIGN KEY (`tankId`) REFERENCES `fuelTanks`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `tankMeasurements` ADD CONSTRAINT `tankMeasurements_measuredBy_appUsers_id_fk` FOREIGN KEY (`measuredBy`) REFERENCES `appUsers`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `tankPumpAssignments` ADD CONSTRAINT `tankPumpAssignments_unitId_units_id_fk` FOREIGN KEY (`unitId`) REFERENCES `units`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `tankPumpAssignments` ADD CONSTRAINT `tankPumpAssignments_pumpId_fuelPumps_id_fk` FOREIGN KEY (`pumpId`) REFERENCES `fuelPumps`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `tankPumpAssignments` ADD CONSTRAINT `tankPumpAssignments_tankId_fuelTanks_id_fk` FOREIGN KEY (`tankId`) REFERENCES `fuelTanks`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `tankPumpAssignments` ADD CONSTRAINT `tankPumpAssignments_createdBy_appUsers_id_fk` FOREIGN KEY (`createdBy`) REFERENCES `appUsers`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `closure_participant_employee_idx` ON `closureParticipants` (`employeeId`,`closureId`);--> statement-breakpoint
CREATE INDEX `discrepancy_allocation_employee_idx` ON `discrepancyAllocations` (`employeeId`,`caseId`);--> statement-breakpoint
CREATE INDEX `discrepancy_unit_status_idx` ON `discrepancyCases` (`unitId`,`status`);--> statement-breakpoint
CREATE INDEX `fuel_tank_unit_active_idx` ON `fuelTanks` (`unitId`,`active`);--> statement-breakpoint
CREATE INDEX `payroll_review_unit_month_idx` ON `payrollAdjustmentReviews` (`unitId`,`referenceMonth`);--> statement-breakpoint
CREATE INDEX `payroll_review_case_idx` ON `payrollAdjustmentReviews` (`caseId`);--> statement-breakpoint
CREATE INDEX `stock_movement_tank_time_idx` ON `stockMovements` (`unitId`,`tankId`,`occurredAt`);--> statement-breakpoint
CREATE INDEX `stock_movement_closure_pump_idx` ON `stockMovements` (`sourceClosureId`,`sourcePumpId`);--> statement-breakpoint
CREATE INDEX `tank_measurement_latest_idx` ON `tankMeasurements` (`unitId`,`tankId`,`measuredAt`);--> statement-breakpoint
CREATE INDEX `tank_assignment_unit_idx` ON `tankPumpAssignments` (`unitId`,`tankId`);