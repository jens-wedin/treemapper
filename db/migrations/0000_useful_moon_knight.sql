CREATE TABLE `audit_log` (
	`id` integer PRIMARY KEY NOT NULL,
	`timestamp` text NOT NULL,
	`action` text NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`before` text,
	`after` text
);
--> statement-breakpoint
CREATE TABLE `citations` (
	`id` integer PRIMARY KEY NOT NULL,
	`owner_type` text NOT NULL,
	`owner_id` text NOT NULL,
	`source_id` text NOT NULL,
	`page` text,
	`quality` integer,
	`text` text,
	`raw_tags` text
);
--> statement-breakpoint
CREATE TABLE `events` (
	`id` integer PRIMARY KEY NOT NULL,
	`owner_type` text NOT NULL,
	`owner_id` text NOT NULL,
	`type` text NOT NULL,
	`date_raw` text,
	`date_year` integer,
	`place` text,
	`description` text,
	`age` text,
	`raw_tags` text
);
--> statement-breakpoint
CREATE TABLE `families` (
	`id` text PRIMARY KEY NOT NULL,
	`husband_id` text,
	`wife_id` text,
	`note` text,
	`raw_tags` text
);
--> statement-breakpoint
CREATE TABLE `family_children` (
	`id` integer PRIMARY KEY NOT NULL,
	`family_id` text NOT NULL,
	`child_id` text NOT NULL,
	`seq` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `issue_dismissals` (
	`fingerprint` text PRIMARY KEY NOT NULL,
	`dismissed_at` text NOT NULL,
	`note` text
);
--> statement-breakpoint
CREATE TABLE `media` (
	`id` integer PRIMARY KEY NOT NULL,
	`owner_type` text NOT NULL,
	`owner_id` text NOT NULL,
	`title` text,
	`original_url` text NOT NULL,
	`form` text,
	`filesize` integer,
	`local_path` text,
	`download_status` text DEFAULT 'pending' NOT NULL,
	`downloaded_at` text,
	`raw_tags` text
);
--> statement-breakpoint
CREATE TABLE `persons` (
	`id` text PRIMARY KEY NOT NULL,
	`given_name` text DEFAULT '' NOT NULL,
	`surname` text DEFAULT '' NOT NULL,
	`married_name` text,
	`suffix` text,
	`sex` text DEFAULT 'U' NOT NULL,
	`note` text,
	`raw_tags` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sources` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text,
	`author` text,
	`publication` text,
	`note` text,
	`raw_tags` text
);
