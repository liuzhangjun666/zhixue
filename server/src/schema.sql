-- 知学空间 MySQL 数据库初始化脚本
CREATE DATABASE IF NOT EXISTS zhixue DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE zhixue;

-- 用户主表
CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  role ENUM('parent','teacher') NOT NULL DEFAULT 'parent',
  nickname VARCHAR(50) NOT NULL DEFAULT '',
  phone VARCHAR(20) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  avatar TEXT,
  wechat VARCHAR(50) NOT NULL DEFAULT '',
  city VARCHAR(50) DEFAULT '',
  bio TEXT,
  avatar LONGTEXT,
  preferred_grade VARCHAR(20) DEFAULT '',
  preferred_subjects JSON,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- 学生档案
CREATE TABLE IF NOT EXISTS children (
  id INT AUTO_INCREMENT PRIMARY KEY,
  parent_id INT NOT NULL,
  name VARCHAR(50) NOT NULL,
  grade VARCHAR(20) NOT NULL DEFAULT '',
  target_subject VARCHAR(20) DEFAULT '',
  FOREIGN KEY (parent_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- 辅导请求
CREATE TABLE IF NOT EXISTS requests (
  id INT AUTO_INCREMENT PRIMARY KEY,
  parent_id INT NOT NULL,
  title VARCHAR(100) NOT NULL DEFAULT '',
  subject VARCHAR(20) DEFAULT '',
  grade VARCHAR(20) DEFAULT '',
  budget VARCHAR(50) DEFAULT '',
  schedule VARCHAR(100) DEFAULT '',
  status ENUM('pending','matching','scheduled','completed','cancelled') DEFAULT 'pending',
  teacher_name VARCHAR(50) DEFAULT '',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (parent_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- 评价
CREATE TABLE IF NOT EXISTS reviews (
  id INT AUTO_INCREMENT PRIMARY KEY,
  parent_id INT NOT NULL,
  teacher_name VARCHAR(50) NOT NULL DEFAULT '',
  subject VARCHAR(20) DEFAULT '',
  rating TINYINT UNSIGNED DEFAULT 5,
  content TEXT,
  reply TEXT,
  created_at DATE DEFAULT (CURRENT_DATE),
  FOREIGN KEY (parent_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- 会员状态
CREATE TABLE IF NOT EXISTS memberships (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL UNIQUE,
  plan_name VARCHAR(50) DEFAULT '普通用户',
  expire_at DATE,
  remaining_unlock INT DEFAULT 0,
  weekly_priority_quota INT DEFAULT 0,
  auto_renew BOOLEAN DEFAULT FALSE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- 套餐配置
CREATE TABLE IF NOT EXISTS membership_plans (
  id VARCHAR(20) PRIMARY KEY,
  name VARCHAR(50) NOT NULL,
  price DECIMAL(10,2) NOT NULL DEFAULT 0,
  duration_month INT NOT NULL DEFAULT 1,
  features JSON,
  recommended BOOLEAN DEFAULT FALSE
) ENGINE=InnoDB;

-- 用户设置
CREATE TABLE IF NOT EXISTS user_settings (
  user_id INT PRIMARY KEY,
  notifications JSON,
  privacy JSON,
  deactivated BOOLEAN DEFAULT FALSE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- 教师画像
CREATE TABLE IF NOT EXISTS teacher_profiles (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL UNIQUE,
  real_name VARCHAR(50) NOT NULL DEFAULT '',
  city VARCHAR(50) NOT NULL DEFAULT '',
  district VARCHAR(50) NOT NULL DEFAULT '',
  subjects JSON,
  grades JSON,
  experience_years INT NOT NULL DEFAULT 0,
  teaching_style VARCHAR(100) NOT NULL DEFAULT '',
  student_type VARCHAR(100) NOT NULL DEFAULT '',
  areas JSON,
  intro TEXT,
  verified TINYINT(1) NOT NULL DEFAULT 0,
  verify_status ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
  verify_remark VARCHAR(255) NOT NULL DEFAULT '',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_teacher_profiles_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- 教师认证材料
CREATE TABLE IF NOT EXISTS teacher_verifications (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  cert_type ENUM('teacher_license','work_proof','id_card') NOT NULL,
  cert_url TEXT NOT NULL,
  status ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
  review_remark VARCHAR(255) NOT NULL DEFAULT '',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_teacher_verifications_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- 问卷
CREATE TABLE IF NOT EXISTS questionnaires (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  role ENUM('teacher','parent') NOT NULL,
  answers JSON NOT NULL,
  version VARCHAR(20) NOT NULL DEFAULT 'v1',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_questionnaire_user_role(user_id, role),
  CONSTRAINT fk_questionnaires_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- 匹配结果
CREATE TABLE IF NOT EXISTS matches (
  id INT AUTO_INCREMENT PRIMARY KEY,
  teacher_id INT NOT NULL,
  parent_id INT NOT NULL,
  request_id INT NOT NULL,
  match_score DECIMAL(5,2) NOT NULL DEFAULT 0,
  status ENUM('new','viewed','unlocked','accepted','rejected','expired') NOT NULL DEFAULT 'new',
  matched_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  unlocked_at DATETIME DEFAULT NULL,
  week_number INT NOT NULL,
  UNIQUE KEY uk_match_teacher_parent_request(teacher_id, parent_id, request_id),
  INDEX idx_match_teacher_status(teacher_id, status),
  CONSTRAINT fk_matches_teacher FOREIGN KEY (teacher_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_matches_parent FOREIGN KEY (parent_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_matches_request FOREIGN KEY (request_id) REFERENCES requests(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- 联系方式解锁记录
CREATE TABLE IF NOT EXISTS contact_unlock_records (
  id INT AUTO_INCREMENT PRIMARY KEY,
  teacher_id INT NOT NULL,
  parent_id INT NOT NULL,
  request_id INT NOT NULL,
  unlock_type ENUM('phone','wechat') NOT NULL DEFAULT 'phone',
  unlock_cost INT NOT NULL DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_unlock_teacher_time(teacher_id, created_at),
  CONSTRAINT fk_unlock_teacher FOREIGN KEY (teacher_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_unlock_parent FOREIGN KEY (parent_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_unlock_request FOREIGN KEY (request_id) REFERENCES requests(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- 会话表
CREATE TABLE IF NOT EXISTS conversations (
  id INT AUTO_INCREMENT PRIMARY KEY,
  parent_id INT NOT NULL,
  teacher_id INT NOT NULL,
  last_message TEXT,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (parent_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (teacher_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE KEY unique_conversation (parent_id, teacher_id)
) ENGINE=InnoDB;

-- 消息表
CREATE TABLE IF NOT EXISTS messages (
  id INT AUTO_INCREMENT PRIMARY KEY,
  conversation_id INT NOT NULL,
  sender_id INT NOT NULL,
  content TEXT NOT NULL,
  is_read BOOLEAN DEFAULT FALSE,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
  FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ===================== 种子数据 =====================

-- 插入演示用户（密码 123456 的 bcrypt 哈希）
INSERT INTO users (id, role, nickname, phone, password_hash, city, bio, preferred_grade, preferred_subjects) VALUES
(1, 'parent', '李明爸爸', '13800138000', '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', '上海', '关注孩子学习习惯培养，偏好长期稳定的老师合作。', '小学', '["数学","英语"]'),
(2, 'teacher', '张老师', '13900139000', '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', '上海', '五年教龄，专注小学数学和英语提分。', '', '["数学","英语"]')
ON DUPLICATE KEY UPDATE nickname=VALUES(nickname);

-- 学生档案
INSERT INTO children (id, parent_id, name, grade, target_subject) VALUES
(1, 1, '李小明', '四年级', '数学'),
(2, 1, '李小雨', '一年级', '英语')
ON DUPLICATE KEY UPDATE name=VALUES(name);

-- 辅导请求
INSERT INTO requests (id, parent_id, title, subject, grade, budget, schedule, status, teacher_name, created_at) VALUES
(1, 1, '四年级数学专项提升', '数学', '四年级', '200-280 元/小时', '每周二、周四 19:00-20:30', 'cancelled', '', '2026-03-01'),
(2, 1, '一年级英语启蒙', '英语', '一年级', '150-220 元/小时', '每周六 10:00-11:30', 'completed', '陈老师', '2026-02-18'),
(3, 1, '三年级语文阅读理解', '语文', '三年级', '180-240 元/小时', '每周一 18:30-20:00', 'completed', '周老师', '2026-01-26')
ON DUPLICATE KEY UPDATE title=VALUES(title);

-- 评价
INSERT INTO reviews (id, parent_id, teacher_name, subject, rating, content, reply, created_at) VALUES
(1, 1, '陈老师', '英语', 5, '课堂节奏很好，孩子愿意主动开口练习，课后反馈也很详细。', '', '2026-03-10'),
(2, 1, '周老师', '语文', 4, '阅读方法讲解清晰，建议作业批注再细一点。', '已和老师沟通作业反馈粒度，会在下一阶段优化。', '2026-02-28'),
(3, 1, '王老师', '数学', 5, '针对错题做了专题训练，最近单元测试提升明显。', '', '2026-02-15')
ON DUPLICATE KEY UPDATE content=VALUES(content);

-- 会员状态
INSERT INTO memberships (user_id, plan_name, expire_at, remaining_unlock, weekly_priority_quota, auto_renew) VALUES
(1, '粉钻会员', '2026-05-15', 5, 3, FALSE)
ON DUPLICATE KEY UPDATE plan_name=VALUES(plan_name);

-- 套餐配置
INSERT INTO membership_plans (id, name, price, duration_month, features, recommended) VALUES
('month',   '月度会员', 99.00,  1,  '["每日 5 次老师联系方式解锁","优先匹配队列","课堂记录导出"]', FALSE),
('quarter', '季度会员', 269.00, 3,  '["每日 8 次老师联系方式解锁","优先匹配队列","学习规划模板","专属客服答疑"]', TRUE),
('year',    '年度会员', 899.00, 12, '["每日 12 次老师联系方式解锁","最高优先级匹配","家庭学习报告","1v1 教育顾问月度复盘"]', FALSE)
ON DUPLICATE KEY UPDATE name=VALUES(name);

-- 用户设置
INSERT INTO user_settings (user_id, notifications, privacy, deactivated) VALUES
(1, '{"systemNotice":true,"requestUpdate":true,"classReminder":true,"smsAlert":false}', '{"showPhoneToMatchedTeacher":true,"allowTeacherInvite":true,"shareLearningReport":false}', FALSE),
(2, '{}', '{}', FALSE)
ON DUPLICATE KEY UPDATE notifications=VALUES(notifications);

-- 会话和消息种子数据
INSERT INTO conversations (id, parent_id, teacher_id, last_message) VALUES
(1, 1, 2, '好的，我会准时上课的。')
ON DUPLICATE KEY UPDATE last_message=VALUES(last_message);

INSERT INTO messages (id, conversation_id, sender_id, content, is_read, created_at) VALUES
(1, 1, 1, '张老师您好，想了解一下您周末的时间安排。', TRUE, '2026-04-20 10:00:00'),
(2, 1, 2, '您好！周末上午 10:00-12:00 和下午 14:00-16:00 都可以排课。', TRUE, '2026-04-20 10:15:00'),
(3, 1, 1, '太好了，那我们约周六上午的课吧。', TRUE, '2026-04-20 10:20:00'),
(4, 1, 2, '好的，我会准时上课的。', FALSE, '2026-04-20 10:30:00')
ON DUPLICATE KEY UPDATE content=VALUES(content);
