CREATE TABLE `handbook_pages` (
	`id` text PRIMARY KEY NOT NULL,
	`practice_id` text NOT NULL,
	`source_page_id` text NOT NULL,
	`parent_source_id` text,
	`title` text NOT NULL,
	`source_content` text NOT NULL,
	`edited_content` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`source_revision` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`published_at` text,
	`updated_by` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_handbook_pages_practice_source` ON `handbook_pages` (`practice_id`,`source_page_id`);--> statement-breakpoint
CREATE INDEX `idx_handbook_pages_practice_status` ON `handbook_pages` (`practice_id`,`status`);--> statement-breakpoint
CREATE TABLE `practice_members` (
	`practice_id` text NOT NULL,
	`user_id` text NOT NULL,
	`email` text NOT NULL,
	`role` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_practice_members_practice_user` ON `practice_members` (`practice_id`,`user_id`);--> statement-breakpoint
CREATE INDEX `idx_practice_members_user_id` ON `practice_members` (`user_id`);--> statement-breakpoint
CREATE TABLE `practices` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_user_id` text NOT NULL,
	`name` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_practices_owner_user_id` ON `practices` (`owner_user_id`);