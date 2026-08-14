CREATE TABLE `raw_records` (
	`id` integer PRIMARY KEY NOT NULL,
	`xref` text,
	`tag` text NOT NULL,
	`raw_tags` text
);
--> statement-breakpoint
ALTER TABLE `tree_meta` ADD `schema_json` text;