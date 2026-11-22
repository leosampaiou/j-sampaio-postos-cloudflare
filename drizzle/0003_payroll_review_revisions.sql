ALTER TABLE `payrollAdjustmentReviews` DROP INDEX `payroll_review_case_employee_unique`;--> statement-breakpoint
ALTER TABLE `payrollAdjustmentReviews` ADD `closureRevision` int DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `payrollAdjustmentReviews` ADD CONSTRAINT `payroll_review_case_employee_revision_unique` UNIQUE(`caseId`,`employeeId`,`closureRevision`);