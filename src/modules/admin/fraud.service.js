const { query } = require('../../config/database');

/**
 * Fraud & Anomaly Detection Service
 * Requirement 38 & 49
 */
const detectFraudulentBookings = async () => {
  // 1. Detect high-frequency transactions from single IP
  const highFreqIps = await query(`
    SELECT ip_address, COUNT(*) as booking_count
    FROM audit_logs
    WHERE action = 'CREATE_BOOKING' AND created_at > NOW() - INTERVAL '1 hour'
    GROUP BY ip_address
    HAVING COUNT(*) > 5
  `);

  // 2. Detect multiple accounts using same card (simulated)
  const duplicateCards = await query(`
    SELECT transaction_id, COUNT(*) as occurrence
    FROM payments
    WHERE status = 'success' AND created_at > NOW() - INTERVAL '24 hours'
    GROUP BY transaction_id
    HAVING COUNT(*) > 1
  `);

  return {
    flaggedIps: highFreqIps.rows,
    flaggedTransactions: duplicateCards.rows
  };
};

module.exports = { detectFraudulentBookings };
