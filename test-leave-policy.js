/**
 * Test Suite for Leave Policy Logic
 * Tests all conditions and edge cases as specified in the policy document
 */

// Import the leave policy functions
import {
    calculateLeaveEntitlements,
    calculateCompletedMonths,
    getLeaveCondition,
    validateShortLeave,
    getCurrentMonthShortLeaveUsage,
    formatLeaveEntitlements,
    getQuarterInfo
} from './lib/leavePolicy.js';

/**
 * Test Suite Configuration
 */
const TESTS = {
    passed: 0,
    failed: 0,
    total: 0
};

/**
 * Test helper function
 */
function test(description, testFunction) {
    try {
        testFunction();
        console.log(`✓ PASS: ${description}`);
        TESTS.passed++;
    } catch (error) {
        console.error(`✗ FAIL: ${description}`);
        console.error(`  Error: ${error.message}`);
        TESTS.failed++;
    }
    TESTS.total++;
}

/**
 * Assert helper function
 */
function assertEqual(actual, expected, message) {
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
        throw new Error(message || `Expected: ${expected}, Got: ${actual}`);
    }
}

function assertTrue(condition, message) {
    if (!condition) {
        throw new Error(message || `Expected true, got false`);
    }
}

function assertFalse(condition, message) {
    if (condition) {
        throw new Error(message || `Expected false, got true`);
    }
}

/**
 * Run all tests
 */
console.log('=== LEAVE POLICY LOGIC TEST SUITE ===\n');

// Test 1: Calculate Completed Months
console.log('--- Testing calculateCompletedMonths ---');

test('should calculate 0 months for same day join', () => {
    const joinDate = '2024-06-15';
    const currentDate = '2024-06-15';
    const result = calculateCompletedMonths(joinDate, currentDate);
    assertEqual(result, 0, 'Same day join should result in 0 completed months');
});

test('should calculate 1 month for next day same month', () => {
    const joinDate = '2024-06-15';
    const currentDate = '2024-07-15';
    const result = calculateCompletedMonths(joinDate, currentDate);
    assertEqual(result, 1, 'One month should be completed when same day in next month');
});

test('should calculate 3 months for 3 months later', () => {
    const joinDate = '2024-01-15';
    const currentDate = '2024-04-15';
    const result = calculateCompletedMonths(joinDate, currentDate);
    assertEqual(result, 3, 'Three months should be completed');
});

test('should calculate 11 months for almost one year', () => {
    const joinDate = '2024-01-15';
    const currentDate = '2024-12-14';
    const result = calculateCompletedMonths(joinDate, currentDate);
    assertEqual(result, 10, 'Should not count incomplete month');
});

test('should calculate 12 months for one year', () => {
    const joinDate = '2024-01-15';
    const currentDate = '2025-01-15';
    const result = calculateCompletedMonths(joinDate, currentDate);
    assertEqual(result, 12, 'Should calculate exactly 12 months for one year');
});

// Test 2: Get Leave Condition
console.log('\n--- Testing getLeaveCondition ---');

test('should return Condition A for current year joiners', () => {
    const currentYear = 2024;
    const joinDate = '2024-03-25'; // March 25, 2024
    const result = getLeaveCondition(joinDate, currentYear);
    assertEqual(result, 'A', 'Joiners in current year should be Condition A');
});

test('should return Condition B for previous year joiners', () => {
    const currentYear = 2024;
    const joinDate = '2023-06-15'; // June 15, 2023
    const result = getLeaveCondition(joinDate, currentYear);
    assertEqual(result, 'B', 'Joiners in previous year should be Condition B');
});

test('should return Condition C for long-term employees', () => {
    const currentYear = 2024;
    const joinDate = '2020-01-01'; // 2020
    const result = getLeaveCondition(joinDate, currentYear);
    assertEqual(result, 'C', 'Long-term employees should be Condition C');
});

// Test 3: Calculate Leave Entitlements - Condition A
console.log('\n--- Testing Condition A (Current Year Joiners) ---');

test('should calculate Condition A entitlements correctly for March joiner', () => {
    const joinDate = '2024-03-25';
    const currentYear = 2024;
    const result = calculateLeaveEntitlements(joinDate, currentYear);
    
    // By December 2024, should have completed 9 months
    assertEqual(result.condition, 'A', 'Should be Condition A');
    assertEqual(result.annualLeave, 0, 'Annual leave should be 0 for Condition A');
    assertEqual(result.sickLeave, 7, 'Sick leave should be 7 for Condition A');
    assertEqual(result.completedMonths, 9, 'Should calculate 9 completed months');
    assertEqual(result.casualLeave, 4.5, 'Casual leave should be 4.5 days (0.5 × 9)');
});

test('should calculate Condition A entitlements for January joiner', () => {
    const joinDate = '2024-01-01';
    const currentYear = 2024;
    const result = calculateLeaveEntitlements(joinDate, currentYear);
    
    // By December 2024, should have completed 11 months
    assertEqual(result.condition, 'A', 'Should be Condition A');
    assertEqual(result.casualLeave, 5.5, 'Casual leave should be 5.5 days (0.5 × 11)');
});

test('should calculate Condition A entitlements for December joiner', () => {
    const joinDate = '2024-12-01';
    const currentYear = 2024;
    const result = calculateLeaveEntitlements(joinDate, currentYear);
    
    // By December 2024, should have completed 0 months
    assertEqual(result.condition, 'A', 'Should be Condition A');
    assertEqual(result.casualLeave, 0, 'Casual leave should be 0 days (0.5 × 0)');
});

// Test 4: Calculate Leave Entitlements - Condition B
console.log('\n--- Testing Condition B (Previous Year Joiners) ---');

test('should calculate Q1 joiner (Jan-Mar) entitlements', () => {
    const joinDate = '2023-02-15'; // Q1
    const currentYear = 2024;
    const result = calculateLeaveEntitlements(joinDate, currentYear);
    
    assertEqual(result.condition, 'B', 'Should be Condition B');
    assertEqual(result.annualLeave, 14, 'Q1 joiners should get 14 days annual leave');
    assertEqual(result.sickLeave, 7, 'Sick leave should be 7');
    assertEqual(result.casualLeave, 7, 'Casual leave should be 7');
});

test('should calculate Q2 joiner (Apr-Jun) entitlements', () => {
    const joinDate = '2023-05-01'; // Q2
    const currentYear = 2024;
    const result = calculateLeaveEntitlements(joinDate, currentYear);
    
    assertEqual(result.condition, 'B', 'Should be Condition B');
    assertEqual(result.annualLeave, 10, 'Q2 joiners should get 10 days annual leave');
});

test('should calculate Q3 joiner (Jul-Sep) entitlements', () => {
    const joinDate = '2023-08-15'; // Q3
    const currentYear = 2024;
    const result = calculateLeaveEntitlements(joinDate, currentYear);
    
    assertEqual(result.condition, 'B', 'Should be Condition B');
    assertEqual(result.annualLeave, 7, 'Q3 joiners should get 7 days annual leave');
});

test('should calculate Q4 joiner (Oct-Dec) entitlements', () => {
    const joinDate = '2023-11-01'; // Q4
    const currentYear = 2024;
    const result = calculateLeaveEntitlements(joinDate, currentYear);
    
    assertEqual(result.condition, 'B', 'Should be Condition B');
    assertEqual(result.annualLeave, 4, 'Q4 joiners should get 4 days annual leave');
});

// Test 5: Calculate Leave Entitlements - Condition C
console.log('\n--- Testing Condition C (Long-term Employees) ---');

test('should calculate Condition C entitlements', () => {
    const joinDate = '2020-01-01';
    const currentYear = 2024;
    const result = calculateLeaveEntitlements(joinDate, currentYear);
    
    assertEqual(result.condition, 'C', 'Should be Condition C');
    assertEqual(result.annualLeave, 14, 'Long-term employees should get 14 days annual leave');
    assertEqual(result.sickLeave, 7, 'Sick leave should be 7');
    assertEqual(result.casualLeave, 7, 'Casual leave should be 7');
});

// Test 6: Quarterly Information
console.log('\n--- Testing getQuarterInfo ---');

test('should identify Q1 correctly', () => {
    const joinDate = '2023-02-15';
    const result = getQuarterInfo(joinDate);
    
    assertEqual(result.quarter, 1, 'Should be quarter 1');
    assertEqual(result.quarterName, 'Q1 (January - March)', 'Quarter name should be Q1');
    assertEqual(result.annualLeave, 14, 'Q1 should give 14 days annual leave');
});

test('should identify Q2 correctly', () => {
    const joinDate = '2023-04-15';
    const result = getQuarterInfo(joinDate);
    
    assertEqual(result.quarter, 2, 'Should be quarter 2');
    assertEqual(result.annualLeave, 10, 'Q2 should give 10 days annual leave');
});

test('should identify Q3 correctly', () => {
    const joinDate = '2023-07-15';
    const result = getQuarterInfo(joinDate);
    
    assertEqual(result.quarter, 3, 'Should be quarter 3');
    assertEqual(result.annualLeave, 7, 'Q3 should give 7 days annual leave');
});

test('should identify Q4 correctly', () => {
    const joinDate = '2023-11-15';
    const result = getQuarterInfo(joinDate);
    
    assertEqual(result.quarter, 4, 'Should be quarter 4');
    assertEqual(result.annualLeave, 4, 'Q4 should give 4 days annual leave');
});

// Test 7: Short Leave Validation
console.log('\n--- Testing validateShortLeave ---');

test('should validate valid 1 hour request', () => {
    const result = validateShortLeave(1, 0);
    
    assertTrue(result.isValid, '1 hour request should be valid');
    assertEqual(result.remainingHoursThisMonth, 3, 'Should have 3 hours remaining');
});

test('should validate valid 2 hour request', () => {
    const result = validateShortLeave(2, 0);
    
    assertTrue(result.isValid, '2 hour request should be valid');
});

test('should reject invalid 3 hour request', () => {
    const result = validateShortLeave(3, 0);
    
    assertFalse(result.isValid, '3 hour request should be invalid');
    assertTrue(result.errors.length > 0, 'Should have error messages');
});

test('should reject request exceeding monthly allowance', () => {
    const result = validateShortLeave(2, 2); // 2 used + 2 requested = 4 > 3
    
    assertFalse(result.isValid, 'Request exceeding monthly allowance should be invalid');
    assertTrue(result.errors.length > 0, 'Should have error messages for exceeding allowance');
});

test('should reject negative hour request', () => {
    const result = validateShortLeave(-1, 0);
    
    assertFalse(result.isValid, 'Negative hour request should be invalid');
});

// Test 8: Format Leave Entitlements
console.log('\n--- Testing formatLeaveEntitlements ---');

test('should format Condition A entitlements', () => {
    const entitlements = {
        condition: 'A',
        annualLeave: 0,
        sickLeave: 7,
        casualLeave: 4.5,
        completedMonths: 9
    };
    
    const result = formatLeaveEntitlements(entitlements);
    
    assertEqual(result.condition, 'Current Year Joiner', 'Should format condition A');
    assertTrue(result.note.includes('0.5 × 9 completed months'), 'Should mention calculation formula');
});

test('should format Condition B entitlements', () => {
    const entitlements = {
        condition: 'B',
        annualLeave: 14,
        sickLeave: 7,
        casualLeave: 7,
        completedMonths: 0
    };
    
    const result = formatLeaveEntitlements(entitlements);
    
    assertEqual(result.condition, 'Previous Year Joiner', 'Should format condition B');
    assertTrue(result.note.includes('join date in previous year'), 'Should mention join date basis');
});

// Test 9: Edge Cases
console.log('\n--- Testing Edge Cases ---');

test('should handle invalid dates gracefully', () => {
    try {
        calculateLeaveEntitlements('invalid-date');
        throw new Error('Should have thrown error for invalid date');
    } catch (error) {
        assertTrue(error.message.includes('Invalid'), 'Should mention invalid date');
    }
});

test('should handle future join dates', () => {
    const joinDate = '2030-01-01';
    const currentYear = 2024;
    const result = calculateLeaveEntitlements(joinDate, currentYear);
    
    assertEqual(result.condition, 'A', 'Future join date should be Condition A');
    assertEqual(result.completedMonths, 0, 'Future join date should have 0 completed months');
});

// Test 10: Real-world Examples
console.log('\n--- Testing Real-world Examples ---');

test('Example 1: Employee joined March 25th, 2024 (Condition A)', () => {
    const joinDate = '2024-03-25';
    const currentYear = 2024;
    const result = calculateLeaveEntitlements(joinDate, currentYear);
    
    console.log(`  Join Date: ${joinDate}`);
    console.log(`  Condition: ${result.condition}`);
    console.log(`  Annual Leave: ${result.annualLeave} days`);
    console.log(`  Sick Leave: ${result.sickLeave} days`);
    console.log(`  Casual Leave: ${result.casualLeave} days`);
    console.log(`  Completed Months: ${result.completedMonths}`);
    
    assertEqual(result.annualLeave, 0, 'Should be 0 annual leave days');
    assertEqual(result.sickLeave, 7, 'Should be 7 sick leave days');
    assertEqual(result.casualLeave, 4.5, 'Should be 4.5 casual leave days');
});

test('Example 2: Employee joined May 15th, 2023 (Condition B, Q2)', () => {
    const joinDate = '2023-05-15';
    const currentYear = 2024;
    const result = calculateLeaveEntitlements(joinDate, currentYear);
    
    console.log(`  Join Date: ${joinDate}`);
    console.log(`  Condition: ${result.condition}`);
    console.log(`  Annual Leave: ${result.annualLeave} days`);
    console.log(`  Sick Leave: ${result.sickLeave} days`);
    console.log(`  Casual Leave: ${result.casualLeave} days`);
    
    assertEqual(result.annualLeave, 10, 'Q2 joiner should get 10 annual leave days');
    assertEqual(result.sickLeave, 7, 'Should be 7 sick leave days');
    assertEqual(result.casualLeave, 7, 'Should be 7 casual leave days');
});

test('Example 3: Employee joined January 10th, 2020 (Condition C)', () => {
    const joinDate = '2020-01-10';
    const currentYear = 2024;
    const result = calculateLeaveEntitlements(joinDate, currentYear);
    
    console.log(`  Join Date: ${joinDate}`);
    console.log(`  Condition: ${result.condition}`);
    console.log(`  Annual Leave: ${result.annualLeave} days`);
    console.log(`  Sick Leave: ${result.sickLeave} days`);
    console.log(`  Casual Leave: ${result.casualLeave} days`);
    
    assertEqual(result.annualLeave, 14, 'Long-term employee should get 14 annual leave days');
    assertEqual(result.sickLeave, 7, 'Should be 7 sick leave days');
    assertEqual(result.casualLeave, 7, 'Should be 7 casual leave days');
});

// Test Summary
console.log('\n=== TEST SUMMARY ===');
console.log(`Total Tests: ${TESTS.total}`);
console.log(`Passed: ${TESTS.passed}`);
console.log(`Failed: ${TESTS.failed}`);
console.log(`Success Rate: ${((TESTS.passed / TESTS.total) * 100).toFixed(1)}%`);

if (TESTS.failed === 0) {
    console.log('\n🎉 All tests passed! Leave policy logic is working correctly.');
} else {
    console.log('\n⚠️ Some tests failed. Please review the implementation.');
}

console.log('\n=== END OF TEST SUITE ===');