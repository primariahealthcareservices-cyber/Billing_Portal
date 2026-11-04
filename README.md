CREATE TABLE `daily_collection_summary` (
  `id` int NOT NULL AUTO_INCREMENT,
  `summary_date` date NOT NULL,
  `op_count` int DEFAULT '0',
  `op_amount` decimal(14,2) DEFAULT '0.00',
  `op_lab_amount` decimal(14,2) DEFAULT '0.00',
  `op_radiology_amount` decimal(14,2) DEFAULT '0.00',
  `ip_count` int DEFAULT '0',
  `ip_amount` decimal(14,2) DEFAULT '0.00',
  `ip_lab_amount` decimal(14,2) DEFAULT '0.00',
  `ip_radiology_amount` decimal(14,2) DEFAULT '0.00',
  `direct_count` int DEFAULT '0',
  `direct_amount` decimal(14,2) DEFAULT '0.00',
  `direct_lab_amount` decimal(14,2) DEFAULT '0.00',
  `direct_radiology_amount` decimal(14,2) DEFAULT '0.00',
  `total_amount` decimal(14,2) DEFAULT '0.00',
  `expenses` decimal(14,2) DEFAULT '0.00',
  `grand_total` decimal(14,2) DEFAULT '0.00',
  `due_total` decimal(14,2) DEFAULT '0.00',
  `credit_due` decimal(14,2) DEFAULT '0.00',
  `insurance_due` decimal(14,2) DEFAULT '0.00',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `summary_date` (`summary_date`)
);

CREATE TABLE `lab_attribute_subcategories` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(255) NOT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `name` (`name`)
);


CREATE TABLE `lab_attributes` (
  `id` int NOT NULL AUTO_INCREMENT,
  `attribute_name` varchar(255) NOT NULL,
  `method_name` varchar(255) DEFAULT NULL,
  `alias_names` varchar(255) DEFAULT NULL,
  `is_long_text` tinyint(1) DEFAULT '0',
  `suggest_results` tinyint(1) DEFAULT '0',
  `options` text,
  `sub_category_id` int DEFAULT NULL,
  `is_active` tinyint(1) DEFAULT '1',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `unit` varchar(100) DEFAULT NULL,
  `normal_range` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`id`)
);

CREATE TABLE `manufacturers` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `name` varchar(255) NOT NULL,
  `short_name` varchar(100) DEFAULT NULL,
  `inventory_type` varchar(500) DEFAULT NULL,
  `tax_category` varchar(100) DEFAULT NULL,
  `contact_person` varchar(150) DEFAULT NULL,
  `contact_no` varchar(50) DEFAULT NULL,
  `pincode` varchar(20) DEFAULT NULL,
  `fax` varchar(50) DEFAULT NULL,
  `address` text,
  `alt_contact_no` varchar(50) DEFAULT NULL,
  `email` varchar(150) DEFAULT NULL,
  `website` varchar(200) DEFAULT NULL,
  `remarks` text,
  `apgst_no` varchar(50) DEFAULT NULL,
  `cst_no` varchar(50) DEFAULT NULL,
  `gst_no` varchar(50) DEFAULT NULL,
  `dl_no` varchar(50) DEFAULT NULL,
  `pan_no` varchar(50) DEFAULT NULL,
  `is_active` tinyint(1) DEFAULT '1',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
);


CREATE TABLE `op_bills_backup_discount` (
  `id` int NOT NULL DEFAULT '0',
  `bill_no` varchar(50) NOT NULL,
  `paid_amount` decimal(10,2) DEFAULT '0.00',
  `payment_mode` enum('Cash','Card','UPI','Insurance','Credit','Bank') DEFAULT 'Cash',
  `consultation_charge` decimal(10,2) DEFAULT '0.00',
  `lab_charge` decimal(10,2) DEFAULT '0.00',
  `radiology_charge` decimal(10,2) DEFAULT '0.00',
  `procedure_charge` decimal(10,2) DEFAULT '0.00',
  `service_charge` decimal(10,2) DEFAULT '0.00',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP
);


CREATE TABLE `pharmacy_inventory_types` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `name` varchar(255) NOT NULL,
  `is_active` tinyint(1) DEFAULT '1',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `id` (`id`),
  UNIQUE KEY `name` (`name`)
);

CREATE TABLE `pharmacy_item_types` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `name` varchar(255) NOT NULL,
  `inventory_type_id` bigint unsigned NOT NULL,
  `is_active` tinyint(1) DEFAULT '1',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `inventory_type_id` (`inventory_type_id`),
  CONSTRAINT `pharmacy_item_types_ibfk_1` FOREIGN KEY (`inventory_type_id`) REFERENCES `pharmacy_inventory_types` (`id`)
);

CREATE TABLE `purchase_order_items` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `purchase_order_id` bigint unsigned NOT NULL,
  `item_name` varchar(255) NOT NULL,
  `batch_no` varchar(50) DEFAULT NULL,
  `qty` decimal(12,2) DEFAULT '0.00',
  `rate` decimal(14,2) DEFAULT '0.00',
  `disc_pct` decimal(6,2) DEFAULT '0.00',
  `tax_pct` decimal(6,2) DEFAULT '0.00',
  `amount` decimal(14,2) DEFAULT '0.00',
  PRIMARY KEY (`id`),
  KEY `purchase_order_id` (`purchase_order_id`),
  CONSTRAINT `purchase_order_items_ibfk_1` FOREIGN KEY (`purchase_order_id`) REFERENCES `purchase_orders` (`id`) ON DELETE CASCADE
);

CREATE TABLE `purchase_orders` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `po_no` varchar(50) DEFAULT NULL,
  `po_date` date NOT NULL,
  `valid_till` date DEFAULT NULL,
  `inventory_type` varchar(500) DEFAULT NULL,
  `supplier_id` bigint unsigned DEFAULT NULL,
  `supplier_phone` varchar(50) DEFAULT NULL,
  `supplier_email` varchar(150) DEFAULT NULL,
  `supplier_address` text,
  `sub_total` decimal(14,2) DEFAULT '0.00',
  `overall_disc_pct` decimal(6,2) DEFAULT '0.00',
  `overall_disc_amt` decimal(14,2) DEFAULT '0.00',
  `tax_amount` decimal(14,2) DEFAULT '0.00',
  `net_amount` decimal(14,2) DEFAULT '0.00',
  `other_charges` decimal(14,2) DEFAULT '0.00',
  `net_payable` decimal(14,2) DEFAULT '0.00',
  `terms_and_conditions` text,
  `credit_period_days` int DEFAULT NULL,
  `mode_of_dispatch` varchar(150) DEFAULT NULL,
  `place_of_delivery` varchar(255) DEFAULT NULL,
  `payment_terms` varchar(255) DEFAULT NULL,
  `contact_person` varchar(150) DEFAULT NULL,
  `contact_no_at_delivery` varchar(50) DEFAULT NULL,
  `remarks` text,
  `status` varchar(50) DEFAULT 'Pending',
  `created_by` bigint unsigned DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `po_no_unique` (`po_no`)
);

