CREATE TABLE IF NOT EXISTS `template_imports` (
  `practice_id` text PRIMARY KEY NOT NULL,
  `import_id` text NOT NULL,
  `root_page_id` text NOT NULL,
  `package_version` integer NOT NULL,
  `expected_pages` integer NOT NULL,
  `expected_assets` integer NOT NULL,
  `started_at` text NOT NULL,
  `started_by` text NOT NULL
);
