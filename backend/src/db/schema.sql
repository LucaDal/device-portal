CREATE TABLE `user_invitations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`email` text NOT NULL,
	`role` text DEFAULT 'user' NOT NULL,
	`otp_hash` text NOT NULL,
	`invited_by` integer NOT NULL,
	`expires_at` text NOT NULL,
	`accepted_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`invited_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "user_invitations_role" CHECK("user_invitations"."role" in ('admin', 'dev', 'user'))
);

CREATE UNIQUE INDEX `user_invitations_email_unique` ON `user_invitations` (`email`);
CREATE INDEX `idx_user_invitations_inviter` ON `user_invitations` (`invited_by`);
CREATE TABLE `users` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`email` text NOT NULL,
	`password_hash` text NOT NULL,
	`role` text DEFAULT 'user' NOT NULL,
	`must_change_password` integer DEFAULT 0 NOT NULL,
	`session_version` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT "users_role" CHECK("users"."role" in ('admin', 'dev', 'user')),
	CONSTRAINT "users_password_change" CHECK("users"."must_change_password" IN (0, 1)),
	CONSTRAINT "users_session_version" CHECK("users"."session_version" >= 0)
);

CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);
CREATE TABLE `device_properties` (
	`device_code` text PRIMARY KEY NOT NULL,
	`properties` text DEFAULT '{}' NOT NULL,
	FOREIGN KEY (`device_code`) REFERENCES `devices`(`code`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "device_properties_json" CHECK(json_valid("device_properties"."properties") AND json_type("device_properties"."properties") = 'object')
);

CREATE TABLE `device_share_invitations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`device_code` text NOT NULL,
	`email` text NOT NULL,
	`invitation_token` text NOT NULL,
	`invited_by` integer NOT NULL,
	`expires_at` text NOT NULL,
	`accepted_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`device_code`) REFERENCES `devices`(`code`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`invited_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);

CREATE UNIQUE INDEX `device_share_invitations_invitation_token_unique` ON `device_share_invitations` (`invitation_token`);
CREATE INDEX `idx_device_share_invitations_lookup` ON `device_share_invitations` (`email`,`accepted_at`,`expires_at`);
CREATE INDEX `idx_device_share_invitations_device` ON `device_share_invitations` (`device_code`);
CREATE INDEX `idx_device_share_invitations_inviter` ON `device_share_invitations` (`invited_by`);
CREATE TABLE `device_shares` (
	`device_code` text NOT NULL,
	`user_id` integer NOT NULL,
	`shared_by` integer NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY(`device_code`, `user_id`),
	FOREIGN KEY (`device_code`) REFERENCES `devices`(`code`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`shared_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);

CREATE INDEX `idx_device_shares_user` ON `device_shares` (`user_id`);
CREATE INDEX `idx_device_shares_sharer` ON `device_shares` (`shared_by`);
CREATE TABLE `device_type_widgets` (
	`device_type_id` text NOT NULL,
	`widget_id` text NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	`definition` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY(`device_type_id`, `widget_id`),
	FOREIGN KEY (`device_type_id`) REFERENCES `device_types`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "device_type_widgets_json" CHECK(json_valid("device_type_widgets"."definition") AND json_type("device_type_widgets"."definition") = 'object'),
	CONSTRAINT "device_type_widgets_identity" CHECK(COALESCE(json_extract("device_type_widgets"."definition", '$.id') = "device_type_widgets"."widget_id", 0)),
	CONSTRAINT "device_type_widgets_kind" CHECK(COALESCE(json_extract("device_type_widgets"."definition", '$.kind'), '') in ('text', 'value', 'switch', 'input', 'button')),
	CONSTRAINT "device_type_widgets_position" CHECK("device_type_widgets"."position" >= 0)
);

CREATE INDEX `idx_device_type_widgets_position` ON `device_type_widgets` (`device_type_id`,`position`,`widget_id`);
CREATE TABLE `device_types` (
	`id` text PRIMARY KEY NOT NULL,
	`description` text,
	`firmware_version` text NOT NULL,
	`firmware_build` blob NOT NULL,
	`deviceProperties` text DEFAULT '{}' NOT NULL,
	`genericProperties` text DEFAULT '{}' NOT NULL,
	`mqttTopics` text DEFAULT '[]' NOT NULL,
	`mqtt_enabled` integer DEFAULT 0 NOT NULL,
	`widgets_revision` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT "device_types_widgets_revision" CHECK("device_types"."widgets_revision" >= 0),
	CONSTRAINT "device_types_mqtt_enabled" CHECK("device_types"."mqtt_enabled" IN (0, 1)),
	CONSTRAINT "device_types_properties_json" CHECK(json_valid("device_types"."deviceProperties") AND json_type("device_types"."deviceProperties") = 'object'),
	CONSTRAINT "device_types_generic_properties_json" CHECK(json_valid("device_types"."genericProperties") AND json_type("device_types"."genericProperties") = 'object'),
	CONSTRAINT "device_types_topics_json" CHECK(json_valid("device_types"."mqttTopics") AND json_type("device_types"."mqttTopics") = 'array')
);

CREATE TABLE `devices` (
	`code` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`device_type_id` text NOT NULL,
	`owner_id` integer,
	`activated` integer DEFAULT 0 NOT NULL,
	`device_secret_hash` text NOT NULL,
	`mqtt_enabled` integer DEFAULT 1 NOT NULL,
	FOREIGN KEY (`device_type_id`) REFERENCES `device_types`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "devices_name" CHECK(length("devices"."name") BETWEEN 1 AND 128 AND length(trim("devices"."name")) > 0),
	CONSTRAINT "devices_activated" CHECK("devices"."activated" IN (0, 1)),
	CONSTRAINT "devices_mqtt_enabled" CHECK("devices"."mqtt_enabled" IN (0, 1))
);

CREATE INDEX `idx_devices_owner` ON `devices` (`owner_id`);
CREATE INDEX `idx_devices_type` ON `devices` (`device_type_id`);
CREATE TABLE `mqtt_acl_rules` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`device_code` text NOT NULL,
	`action` text NOT NULL,
	`topic_pattern` text NOT NULL,
	`permission` text DEFAULT 'allow' NOT NULL,
	`priority` integer DEFAULT 100 NOT NULL,
	`source` text DEFAULT 'device_type_mqtt' NOT NULL,
	`source_key` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`device_code`) REFERENCES `devices`(`code`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "mqtt_acl_action" CHECK("mqtt_acl_rules"."action" in ('publish', 'subscribe', 'all')),
	CONSTRAINT "mqtt_acl_permission" CHECK("mqtt_acl_rules"."permission" in ('allow', 'deny'))
);

CREATE INDEX `idx_mqtt_acl_rules_device_priority` ON `mqtt_acl_rules` (`device_code`,`priority`,`id`);
CREATE TABLE `mqtt_device_credentials` (
	`device_code` text PRIMARY KEY NOT NULL,
	`encrypted_password` text NOT NULL,
	FOREIGN KEY (`device_code`) REFERENCES `devices`(`code`) ON UPDATE no action ON DELETE cascade
);

CREATE TABLE `mqtt_dynsec_queue` (
	`device_code` text PRIMARY KEY NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`next_attempt_at` integer DEFAULT 0 NOT NULL,
	`last_error` text,
	CONSTRAINT "mqtt_dynsec_revision" CHECK("mqtt_dynsec_queue"."revision" > 0),
	CONSTRAINT "mqtt_dynsec_attempts" CHECK("mqtt_dynsec_queue"."attempts" >= 0)
);

CREATE INDEX `idx_mqtt_dynsec_due` ON `mqtt_dynsec_queue` (`next_attempt_at`,`device_code`);
CREATE TABLE `mqtt_user_acl_rules` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`action` text NOT NULL,
	`topic_pattern` text NOT NULL,
	`permission` text DEFAULT 'allow' NOT NULL,
	`source` text DEFAULT 'generated' NOT NULL,
	`source_device_code` text,
	`source_key` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`source_device_code`) REFERENCES `devices`(`code`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "mqtt_user_acl_action" CHECK("mqtt_user_acl_rules"."action" in ('publish', 'subscribe', 'all')),
	CONSTRAINT "mqtt_user_acl_permission" CHECK("mqtt_user_acl_rules"."permission" in ('allow', 'deny'))
);

CREATE INDEX `idx_mqtt_user_acl_rules_user` ON `mqtt_user_acl_rules` (`user_id`,`id`);
CREATE INDEX `idx_mqtt_user_acl_rules_device` ON `mqtt_user_acl_rules` (`source_device_code`);
CREATE TABLE `app_settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE `default_device_properties` (
	`key` text PRIMARY KEY NOT NULL,
	`label` text,
	`type` text NOT NULL,
	`value` text NOT NULL,
	`is_global` integer DEFAULT 0 NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT "default_properties_type" CHECK("default_device_properties"."type" in ('string', 'int', 'uint', 'float', 'bool')),
	CONSTRAINT "default_properties_global" CHECK("default_device_properties"."is_global" IN (0, 1))
);

CREATE TABLE `device_request_logs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`event_type` text NOT NULL,
	`method` text NOT NULL,
	`path` text NOT NULL,
	`status_code` integer,
	`device_code` text,
	`device_type_id` text,
	`user_id` integer,
	`user_email` text,
	`topic` text,
	`ip` text,
	`user_agent` text,
	`request_summary` text,
	`response_summary` text,
	`error` text
);

CREATE INDEX `idx_device_request_logs_created` ON `device_request_logs` (`created_at`,`id`);
CREATE INDEX `idx_device_request_logs_type_created` ON `device_request_logs` (`event_type`,`created_at`,`id`);
CREATE INDEX `idx_device_request_logs_device_created` ON `device_request_logs` (`device_code`,`created_at`,`id`);
