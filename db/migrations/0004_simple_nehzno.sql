CREATE TABLE `place_country_rejections` (
	`place` text NOT NULL,
	`code` text NOT NULL,
	`rejected_at` text NOT NULL,
	PRIMARY KEY(`place`, `code`)
);
