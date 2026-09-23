CREATE DATABASE IF NOT EXISTS billing_portal CHARACTER SET utf8mb4;
USE billing_portal;

CREATE TABLE users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  email VARCHAR(150) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('SuperAdmin','IT','PCM','MedTech','Caredx') NOT NULL,
  department VARCHAR(100),
  is_active BOOLEAN DEFAULT TRUE,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE finance_entries (
  id INT AUTO_INCREMENT PRIMARY KEY,
  department ENUM('IT','PCM','MedTech','Caredx') NOT NULL,
  entry_type ENUM('Income','Expenses') NOT NULL,
  category VARCHAR(60) NOT NULL,
  generated_by VARCHAR(120) NULL,
  revenue_type VARCHAR(50) NULL,
  amount DECIMAL(14,2) NOT NULL,
  remarks TEXT,
  entry_date DATE NOT NULL,
  created_by_id INT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (created_by_id) REFERENCES users(id)
);

CREATE TABLE caredx_lab_entries (
  id INT AUTO_INCREMENT PRIMARY KEY,
  entry_date DATE NOT NULL,
  patient_name VARCHAR(150) NOT NULL,
  test_name VARCHAR(255) NOT NULL,
  total_amount_paid DECIMAL(14,2) NOT NULL DEFAULT 0,
  employee_name VARCHAR(150) NULL,
  cash DECIMAL(14,2) NOT NULL DEFAULT 0,
  online DECIMAL(14,2) NOT NULL DEFAULT 0,
  paid_to_other_labs DECIMAL(14,2) NOT NULL DEFAULT 0,
  rmp DECIMAL(14,2) NOT NULL DEFAULT 0,
  salaries_expense DECIMAL(14,2) NOT NULL DEFAULT 0,
  expense_details TEXT,
  referral_by VARCHAR(150) NULL,
  referral_amount DECIMAL(14,2) NOT NULL DEFAULT 0,
  sales DECIMAL(14,2) NOT NULL DEFAULT 0,
  created_by_id INT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (created_by_id) REFERENCES users(id)
);

CREATE TABLE caredx_expenses (
  id INT AUTO_INCREMENT PRIMARY KEY,
  expense_date DATE NOT NULL,
  category VARCHAR(150) NOT NULL,
  amount DECIMAL(14,2) NOT NULL,
  remarks TEXT,
  created_by_id INT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (created_by_id) REFERENCES users(id)
);
