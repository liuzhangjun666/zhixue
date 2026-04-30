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

-- 家长偏好画像（用于双向匹配）
CREATE TABLE IF NOT EXISTS parent_profiles (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL UNIQUE,
  city VARCHAR(50) DEFAULT '',
  district VARCHAR(50) DEFAULT '',
  teaching_style_preference VARCHAR(50) DEFAULT '',
  teacher_gender_preference VARCHAR(20) DEFAULT 'any',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_parent_profiles_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
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
  description TEXT,
  status ENUM('pending','matching','scheduled','completed','cancelled') DEFAULT 'pending',
  teacher_name VARCHAR(50) DEFAULT '',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (parent_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- 评价
CREATE TABLE IF NOT EXISTS reviews (
  id INT AUTO_INCREMENT PRIMARY KEY,
  parent_id INT NOT NULL,
  match_id INT DEFAULT NULL,
  reviewer_id INT DEFAULT NULL,
  reviewee_id INT DEFAULT NULL,
  teacher_name VARCHAR(50) NOT NULL DEFAULT '',
  subject VARCHAR(20) DEFAULT '',
  rating TINYINT UNSIGNED DEFAULT 5,
  integrity_rating TINYINT UNSIGNED DEFAULT 5,
  responsibility_rating TINYINT UNSIGNED DEFAULT 5,
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

-- 用户协议与隐私同意记录
CREATE TABLE IF NOT EXISTS user_consents (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  role ENUM('parent','teacher') NOT NULL,
  phone VARCHAR(20) NOT NULL,
  policy_version VARCHAR(40) NOT NULL,
  agreed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ip VARCHAR(64) NOT NULL DEFAULT '',
  user_agent VARCHAR(255) NOT NULL DEFAULT '',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_user_consents_user_time(user_id, agreed_at),
  CONSTRAINT fk_user_consents_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- 教师画像
CREATE TABLE IF NOT EXISTS teacher_profiles (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL UNIQUE,
  real_name VARCHAR(50) NOT NULL DEFAULT '',
  gender ENUM('male','female') NOT NULL DEFAULT 'male',
  city VARCHAR(50) NOT NULL DEFAULT '',
  district VARCHAR(50) NOT NULL DEFAULT '',
  subjects JSON,
  grades JSON,
  experience_years INT NOT NULL DEFAULT 0,
  teaching_methods JSON,
  fee_range ENUM('under_100','100_150','150_200','over_200') NOT NULL DEFAULT '100_150',
  school VARCHAR(100) NOT NULL DEFAULT '',
  teaching_style VARCHAR(100) NOT NULL DEFAULT '',
  student_type VARCHAR(100) NOT NULL DEFAULT '',
  areas JSON,
  intro TEXT,
  hourly_price_min DECIMAL(10,2) DEFAULT NULL,
  hourly_price_max DECIMAL(10,2) DEFAULT NULL,
  teaching_mode ENUM('online','offline','both') NOT NULL DEFAULT 'both',
  available_time_text VARCHAR(255) NOT NULL DEFAULT '',
  rating_avg DECIMAL(3,2) NOT NULL DEFAULT 0,
  rating_count INT NOT NULL DEFAULT 0,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  verified TINYINT(1) NOT NULL DEFAULT 0,
  verify_status ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
  verify_remark VARCHAR(255) NOT NULL DEFAULT '',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_teacher_profiles_city(city),
  INDEX idx_teacher_profiles_price(hourly_price_min, hourly_price_max),
  INDEX idx_teacher_profiles_rating(rating_avg),
  INDEX idx_teacher_profiles_active(is_active),
  CONSTRAINT fk_teacher_profiles_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- 教师认证材料
CREATE TABLE IF NOT EXISTS teacher_verifications (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  cert_type ENUM('teacher_license','work_proof','id_card') NOT NULL,
  cert_url LONGTEXT NOT NULL,
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
  parent_accept_status ENUM('pending','accepted','rejected') NOT NULL DEFAULT 'pending',
  teacher_accept_status ENUM('pending','accepted','rejected') NOT NULL DEFAULT 'pending',
  unlock_granted TINYINT(1) NOT NULL DEFAULT 0,
  feedback_submitted TINYINT(1) NOT NULL DEFAULT 0,
  rematch_count TINYINT UNSIGNED NOT NULL DEFAULT 0,
  feedback_reason VARCHAR(255) NOT NULL DEFAULT '',
  degrade_level TINYINT UNSIGNED NOT NULL DEFAULT 0,
  match_tips JSON,
  last_feedback_at DATETIME DEFAULT NULL,
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

-- 投诉与申诉
CREATE TABLE IF NOT EXISTS complaints (
  id INT AUTO_INCREMENT PRIMARY KEY,
  complainant_id INT NOT NULL,
  respondent_id INT NOT NULL,
  match_id INT DEFAULT NULL,
  type ENUM('fake_info','harassment','service_issue','other') NOT NULL DEFAULT 'other',
  content TEXT NOT NULL,
  evidence JSON,
  status ENUM('pending','processing','resolved','rejected') NOT NULL DEFAULT 'pending',
  result TEXT,
  appeal_content TEXT,
  appealed_at DATETIME DEFAULT NULL,
  appeal_status ENUM('none','pending','approved','rejected') NOT NULL DEFAULT 'none',
  handled_by INT DEFAULT NULL,
  handled_at DATETIME DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_complaints_respondent (respondent_id, status, created_at),
  FOREIGN KEY (complainant_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (respondent_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- 用户限制（禁言/封禁）
CREATE TABLE IF NOT EXISTS user_restrictions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  restriction_type ENUM('mute','ban') NOT NULL,
  reason VARCHAR(255) NOT NULL DEFAULT '',
  source_complaint_id INT DEFAULT NULL,
  start_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  end_at DATETIME DEFAULT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_user_restrictions_active(user_id, restriction_type, is_active, end_at),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- 审计日志
CREATE TABLE IF NOT EXISTS audit_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  actor_type ENUM('user','admin','system') NOT NULL,
  actor_id VARCHAR(64) NOT NULL DEFAULT '',
  action VARCHAR(100) NOT NULL,
  target_type VARCHAR(50) NOT NULL DEFAULT '',
  target_id VARCHAR(64) NOT NULL DEFAULT '',
  details JSON,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_audit_logs_time(created_at),
  INDEX idx_audit_logs_action(action)
) ENGINE=InnoDB;

-- 消息归档
CREATE TABLE IF NOT EXISTS message_archives (
  id INT AUTO_INCREMENT PRIMARY KEY,
  message_id INT NOT NULL UNIQUE,
  conversation_id INT NOT NULL,
  sender_id INT NOT NULL,
  content TEXT NOT NULL,
  is_read BOOLEAN DEFAULT FALSE,
  created_at DATETIME NOT NULL,
  archived_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  archive_reason VARCHAR(50) NOT NULL DEFAULT 'retention_policy',
  INDEX idx_message_archives_time(created_at),
  FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- 邀请记录
CREATE TABLE IF NOT EXISTS invite_records (
  id INT AUTO_INCREMENT PRIMARY KEY,
  inviter_id INT NOT NULL,
  invitee_id INT DEFAULT NULL,
  role ENUM('teacher','parent') NOT NULL,
  invite_code VARCHAR(32) NOT NULL,
  status ENUM('pending','verified') NOT NULL DEFAULT 'pending',
  reward_granted TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_inviter_role_status(inviter_id, role, status),
  UNIQUE KEY uk_inviter_code(inviter_id, invite_code),
  FOREIGN KEY (inviter_id) REFERENCES users(id) ON DELETE CASCADE
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
(2, 'teacher', '张老师', '13900139000', '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', '上海', '五年教龄，专注小学数学和英语提分。', '', '["数学","英语"]'),
(3, 'teacher', '陈老师', '13900139001', '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', '上海', '英语启蒙与自然拼读课程，适合低年级孩子。', '', '["英语"]'),
(4, 'teacher', '周老师', '13900139002', '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', '杭州', '语文阅读理解、作文表达和学习习惯培养。', '', '["语文"]')
ON DUPLICATE KEY UPDATE nickname=VALUES(nickname);

-- 教师发现页画像种子
INSERT INTO teacher_profiles
  (user_id, real_name, city, district, subjects, grades, experience_years, teaching_style, student_type, areas, intro,
   hourly_price_min, hourly_price_max, teaching_mode, available_time_text, rating_avg, rating_count, is_active, verified, verify_status)
VALUES
  (2, '张老师', '上海', '浦东新区', '["数学","英语"]', '["三年级","四年级","五年级"]', 5, '结构化讲解+错题复盘', '基础巩固/提分', '["浦东新区","线上"]',
   '五年教龄，专注小学数学和英语提分，擅长把薄弱知识点拆成可执行练习。', 180, 260, 'both', '工作日晚间、周末上午', 4.8, 36, TRUE, TRUE, 'approved'),
  (3, '陈老师', '上海', '徐汇区', '["英语"]', '["一年级","二年级","三年级"]', 4, '自然拼读+口语互动', '英语启蒙', '["徐汇区","线上"]',
   '英语启蒙与自然拼读课程，课堂互动强，适合低年级孩子建立开口信心。', 160, 220, 'both', '周二/周四晚间，周六下午', 4.9, 42, TRUE, TRUE, 'approved'),
  (4, '周老师', '杭州', '西湖区', '["语文"]', '["三年级","四年级","五年级","六年级"]', 7, '阅读方法+表达训练', '阅读写作提升', '["西湖区","线上"]',
   '语文阅读理解、作文表达和学习习惯培养，适合需要系统提升表达能力的学生。', 200, 300, 'online', '周末全天可约', 4.7, 28, TRUE, TRUE, 'approved')
ON DUPLICATE KEY UPDATE
  real_name=VALUES(real_name),
  city=VALUES(city),
  district=VALUES(district),
  subjects=VALUES(subjects),
  grades=VALUES(grades),
  experience_years=VALUES(experience_years),
  intro=VALUES(intro),
  hourly_price_min=VALUES(hourly_price_min),
  hourly_price_max=VALUES(hourly_price_max),
  teaching_mode=VALUES(teaching_mode),
  available_time_text=VALUES(available_time_text),
  rating_avg=VALUES(rating_avg),
  rating_count=VALUES(rating_count),
  is_active=VALUES(is_active);

-- 学生档案
INSERT INTO children (id, parent_id, name, grade, target_subject) VALUES
(1, 1, '李小明', '四年级', '数学'),
(2, 1, '李小雨', '一年级', '英语')
ON DUPLICATE KEY UPDATE name=VALUES(name);

INSERT INTO parent_profiles (user_id, city, district, teaching_style_preference, teacher_gender_preference) VALUES
(1, '上海', '浦东新区', 'guiding', 'any')
ON DUPLICATE KEY UPDATE
  city=VALUES(city),
  district=VALUES(district),
  teaching_style_preference=VALUES(teaching_style_preference),
  teacher_gender_preference=VALUES(teacher_gender_preference);

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

-- 支付流水表
CREATE TABLE IF NOT EXISTS payment_transactions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  order_no VARCHAR(64) NOT NULL UNIQUE,
  type ENUM('membership','unlock','refund','other') NOT NULL DEFAULT 'membership',
  title VARCHAR(100) NOT NULL DEFAULT '',
  amount DECIMAL(10,2) NOT NULL DEFAULT 0,
  status ENUM('pending','paid','failed','refunded') NOT NULL DEFAULT 'pending',
  pay_method VARCHAR(30) DEFAULT '',
  remark VARCHAR(255) DEFAULT '',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_pt_user_time(user_id, created_at),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- 支付流水种子数据
INSERT INTO payment_transactions (id, user_id, order_no, type, title, amount, status, pay_method, remark, created_at) VALUES
(1, 1, 'ZX20260215001', 'membership', '季度会员 — 订阅开通', 269.00, 'paid', '微信支付', '首次开通季度会员', '2026-02-15 09:30:00'),
(2, 1, 'ZX20260220001', 'unlock', '解锁陈老师联系方式', 0.00, 'paid', '会员权益', '会员免费解锁', '2026-02-20 14:15:00'),
(3, 1, 'ZX20260305001', 'unlock', '解锁周老师联系方式', 0.00, 'paid', '会员权益', '会员免费解锁', '2026-03-05 10:00:00'),
(4, 1, 'ZX20260310001', 'refund', '取消请求退款', -50.00, 'refunded', '原路退回', '取消四年级数学专项提升退回预付款', '2026-03-10 16:20:00'),
(5, 1, 'ZX20260415001', 'membership', '季度会员 — 续费', 269.00, 'paid', '支付宝', '续费季度会员', '2026-04-15 08:45:00')
ON DUPLICATE KEY UPDATE title=VALUES(title);
