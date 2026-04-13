/**
 * Dynamic Pricing Engine
 * Calculates seat/ticket price based on demand and rules
 */
const calculateDynamicPrice = (basePrice, soldCount, totalCapacity, options = {}) => {
  const { 
    surgeEnabled = true,
    surgeThreshold = 0.7, // 70% sold
    surgeRate = 0.2, // 20% increase
    demandWaitList: _demandWaitList = 0,
    timeToEventDays = 30
  } = options;

  let finalPrice = parseFloat(basePrice);

  if (!surgeEnabled) return finalPrice;

  // 1. Demand-based surge (Sold count)
  const soldRatio = soldCount / totalCapacity;
  if (soldRatio >= surgeThreshold) {
    const surgeFactor = (soldRatio - surgeThreshold) / (1 - surgeThreshold);
    finalPrice *= (1 + (surgeRate * surgeFactor));
  }

  // 2. Time-based surge (FOMO)
  if (timeToEventDays <= 3) {
    finalPrice *= 1.15; // 15% increase for last 3 days
  } else if (timeToEventDays <= 7) {
    finalPrice *= 1.10; // 10% increase for last week
  }

  // 3. Early Bird discounting
  if (timeToEventDays > 60 && soldRatio < 0.2) {
    finalPrice *= 0.85; // 15% discount for 60+ days early and low sales
  }

  return Math.round(finalPrice * 100) / 100;
};

module.exports = { calculateDynamicPrice };
