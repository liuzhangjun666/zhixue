const RETENTION_MESSAGE_ARCHIVE_AFTER_DAYS = Math.max(1, Number(process.env.RETENTION_MESSAGE_ARCHIVE_AFTER_DAYS || 180))
const RETENTION_MESSAGE_DELETE_AFTER_DAYS = Math.max(
  RETENTION_MESSAGE_ARCHIVE_AFTER_DAYS,
  Number(process.env.RETENTION_MESSAGE_DELETE_AFTER_DAYS || 365)
)
const RETENTION_AUDIT_LOG_RETENTION_DAYS = Math.max(30, Number(process.env.RETENTION_AUDIT_LOG_RETENTION_DAYS || 365))
const RETENTION_COMPLAINT_RETENTION_DAYS = Math.max(180, Number(process.env.RETENTION_COMPLAINT_RETENTION_DAYS || 730))

export const retentionConfig = {
  archiveAfterDays: RETENTION_MESSAGE_ARCHIVE_AFTER_DAYS,
  deleteAfterDays: RETENTION_MESSAGE_DELETE_AFTER_DAYS,
  auditLogRetentionDays: RETENTION_AUDIT_LOG_RETENTION_DAYS,
  complaintRetentionDays: RETENTION_COMPLAINT_RETENTION_DAYS
}

export const runRetentionJobs = async (pool) => {
  const summary = {
    archivedMessages: 0,
    deletedMessages: 0,
    deletedAuditLogs: 0,
    deletedComplaints: 0,
    deactivatedRestrictions: 0
  }

  const [archiveResult] = await pool.query(
    `INSERT INTO message_archives (message_id, conversation_id, sender_id, content, is_read, created_at, archived_at, archive_reason)
     SELECT m.id, m.conversation_id, m.sender_id, m.content, m.is_read, m.created_at, NOW(), 'retention_policy'
       FROM messages m
      WHERE m.created_at < DATE_SUB(NOW(), INTERVAL ? DAY)
        AND NOT EXISTS (SELECT 1 FROM message_archives ma WHERE ma.message_id = m.id)`,
    [retentionConfig.archiveAfterDays]
  )
  summary.archivedMessages = Number(archiveResult?.affectedRows || 0)

  const [deleteMsgResult] = await pool.query(
    `DELETE m
       FROM messages m
      WHERE m.created_at < DATE_SUB(NOW(), INTERVAL ? DAY)
        AND EXISTS (SELECT 1 FROM message_archives ma WHERE ma.message_id = m.id)`,
    [retentionConfig.deleteAfterDays]
  )
  summary.deletedMessages = Number(deleteMsgResult?.affectedRows || 0)

  const [deleteAuditResult] = await pool.query(
    'DELETE FROM audit_logs WHERE created_at < DATE_SUB(NOW(), INTERVAL ? DAY)',
    [retentionConfig.auditLogRetentionDays]
  )
  summary.deletedAuditLogs = Number(deleteAuditResult?.affectedRows || 0)

  const [deleteComplaintsResult] = await pool.query(
    `DELETE FROM complaints
      WHERE created_at < DATE_SUB(NOW(), INTERVAL ? DAY)
        AND status IN ('resolved','rejected')`,
    [retentionConfig.complaintRetentionDays]
  )
  summary.deletedComplaints = Number(deleteComplaintsResult?.affectedRows || 0)

  const [deactivateRestrictionResult] = await pool.query(
    `UPDATE user_restrictions
        SET is_active = FALSE, updated_at = NOW()
      WHERE is_active = TRUE
        AND end_at IS NOT NULL
        AND end_at < NOW()`
  )
  summary.deactivatedRestrictions = Number(deactivateRestrictionResult?.affectedRows || 0)

  return summary
}
