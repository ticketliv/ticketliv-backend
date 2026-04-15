/**
 * Date Utilities for TicketLiv
 */

/**
 * Formats a date string or object to YYYY-MM-DD
 * Uses UTC to avoid timezone shifts for calendar dates
 */
const formatDateOnly = (dateStr) => {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

/**
 * Extracts time in 12-hour format with AM/PM
 */
const formatTimeOnly = (dateStr) => {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('en-IN', { 
    hour: '2-digit', 
    minute: '2-digit', 
    hour12: true, 
    timeZone: 'UTC' 
  });
};

module.exports = {
  formatDateOnly,
  formatTimeOnly
};
