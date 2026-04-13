const { query } = require('../../config/database');
const { calculateDynamicPrice } = require('../../utils/pricing');

/**
 * Recommendation Service
 * Provides personalized event recommendations based on user behavior and preferences
 */
class RecommendationService {
  /**
   * Get recommended events for a user
   */
  async getPersonalizedEvents(userId, limit = 10) {
    // ... (logic remains same)
    const userInterests = await query(`
      SELECT ec.category_id, COUNT(*) as booking_count
      FROM bookings b
      JOIN event_categories ec ON b.event_id = ec.event_id
      WHERE b.user_id = $1 AND b.status = 'confirmed'
      GROUP BY ec.category_id
      ORDER BY booking_count DESC
      LIMIT 5
    `, [userId]);

    const interestIds = userInterests.rows.map(r => r.category_id);

    if (interestIds.length === 0) {
      const trending = await query("SELECT * FROM events WHERE is_popular = true OR is_featured = true LIMIT $1", [limit]);
      return trending.rows;
    }

    const recommendations = await query(`
      SELECT DISTINCT e.*, 
        (CASE WHEN ec.category_id = ANY($2) THEN 1.0 ELSE 0.5 END) as relevance_score
      FROM events e
      JOIN event_categories ec ON e.id = ec.event_id
      WHERE e.status = 'Live'
      AND e.id NOT IN (SELECT event_id FROM bookings WHERE user_id = $1)
      ORDER BY relevance_score DESC, e.is_featured DESC, e.total_sales DESC
      LIMIT $3
    `, [userId, interestIds, limit]);

    return recommendations.rows;
  }

  /**
   * Adaptive Dynamic Pricing Logic
   * Predictive analytics for revenue optimization
   */
  async predictOptimalPrice(eventId, basePrice) {
    const stats = await query(`
      SELECT 
        COUNT(*) as current_sales,
        (SELECT capacity FROM ticket_types WHERE event_id = $1 LIMIT 1) as total_capacity,
        EXTRACT(DAY FROM (start_date - NOW())) as days_left
      FROM bookings WHERE event_id = $1 AND status = 'confirmed'
    `, [eventId]);

    const { current_sales, total_capacity, days_left } = stats.rows[0];

    return calculateDynamicPrice(basePrice, current_sales, total_capacity, {
      timeToEventDays: days_left
    });
  }
}

module.exports = new RecommendationService();
