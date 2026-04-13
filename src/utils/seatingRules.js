/**
 * Seating Selection Rules Engine
 * Logic for preventing single-seat gaps and group adjacency (Requirement: User Interaction)
 */
const validateSeatSelection = (selectedSeats, _allSeatsInSection) => {
  // Sort selected seats by row and number
  const sortedSelection = [...selectedSeats].sort((a, b) => {
    if (a.row !== b.row) return a.row.localeCompare(b.row);
    return parseInt(a.num) - parseInt(b.num);
  });

  // Check for adjacency within a row
  for (let i = 0; i < sortedSelection.length - 1; i++) {
    const current = sortedSelection[i];
    const next = sortedSelection[i + 1];
    
    if (current.row === next.row) {
      const gap = parseInt(next.num) - parseInt(current.num);
      if (gap > 1) {
        // There is a gap between two selected seats in the same row
        // Check if this gap leaves a "single seat orphan"
        const orphanCount = gap - 1;
        if (orphanCount === 1) return { valid: false, message: 'Your selection leaves a single-seat gap.' };
      }
    }
  }

  // Check for orphans at the ends of rows
  // (Requires full seating layout visibility)
  
  return { valid: true };
};

module.exports = { validateSeatSelection };
