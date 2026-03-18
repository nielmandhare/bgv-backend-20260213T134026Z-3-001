/**
 * Confidence Score Calculator
 * Calculates how reliable a verification result is
 */

class ConfidenceCalculator {
  /**
   * Calculate confidence score (0-1) for verification result
   */
  calculate(extracted, rawResponse, verificationType) {
    let score = 0.95; // Base confidence
    let deductions = 0;

    // Deduct for missing fields
    const missingFields = Object.values(extracted).filter(v => v === undefined || v === null).length;
    deductions += missingFields * 0.02; // 2% per missing field

    // Check for warning indicators
    if (rawResponse.warnings?.length > 0) {
      deductions += rawResponse.warnings.length * 0.05;
    }

    // Check processing time (slower = less confidence)
    if (rawResponse.processing_time > 5000) { // > 5 seconds
      deductions += 0.05;
    }

    // Vendor-specific checks
    if (rawResponse.status === 'partial') {
      deductions += 0.15;
    }

    if (rawResponse.error) {
      deductions += 0.3;
    }

    // Calculate final score
    score = Math.max(0.5, Math.min(1.0, score - deductions));

    return Math.round(score * 100) / 100; // Round to 2 decimal places
  }

  /**
   * Get confidence level text
   */
  getLevel(score) {
    if (score >= 0.95) return 'VERY_HIGH';
    if (score >= 0.85) return 'HIGH';
    if (score >= 0.70) return 'MEDIUM';
    if (score >= 0.50) return 'LOW';
    return 'VERY_LOW';
  }

  /**
   * Check if confidence is acceptable
   */
  isAcceptable(score, threshold = 0.7) {
    return score >= threshold;
  }
}

module.exports = new ConfidenceCalculator();
