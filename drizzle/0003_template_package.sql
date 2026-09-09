CREATE TABLE IF NOT EXISTS `template_settings` (
  `practice_id` text PRIMARY KEY NOT NULL,
  `root_page_id` text NOT NULL,
  `package_version` integer NOT NULL,
  `installed_at` text NOT NULL,
  `installed_by` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `template_pages` (
  `practice_id` text NOT NULL,
  `id` text NOT NULL,
  `parent_source_id` text,
  `title` text NOT NULL,
  `depth` integer NOT NULL,
  `body` text NOT NULL,
  `sort_order` integer NOT NULL,
  PRIMARY KEY (`practice_id`, `id`)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_template_pages_practice_order` ON `template_pages` (`practice_id`,`sort_order`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `template_assets` (
  `practice_id` text NOT NULL,
  `id` text NOT NULL,
  `r2_key` text,
  `external_url` text,
  `title` text NOT NULL,
  `mime` text NOT NULL,
  PRIMARY KEY (`practice_id`, `id`)
);
