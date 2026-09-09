CREATE TABLE `practice_invitations` (
	`id` text PRIMARY KEY NOT NULL,
	`practice_id` text NOT NULL,
	`email` text NOT NULL,
	`role` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`invited_by` text NOT NULL,
	`created_at` text NOT NULL,
	`accepted_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_practice_invitations_practice_email` ON `practice_invitations` (`practice_id`,`email`);--> statement-breakpoint
CREATE INDEX `idx_practice_invitations_email_status` ON `practice_invitations` (`email`,`status`);--> statement-breakpoint
CREATE TABLE `practice_profiles` (
	`practice_id` text PRIMARY KEY NOT NULL,
	`contact_name` text DEFAULT '' NOT NULL,
	`qm_responsible` text DEFAULT '' NOT NULL,
	`logo_text` text DEFAULT 'QM' NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_practice_members_practice_email` ON `practice_members` (`practice_id`,`email`);