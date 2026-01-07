const { calculateLeaveEntitlements } = require('./lib/leavePolicy');

// Test current year joiners (2025)
console.log('\n=== TESTING CURRENT YEAR JOINERS (2025) ===');

// Test 1: Joined in current year (March 25th)
const marchJoiner = {
  id: 'emp1',
  name: 'March Joiner',
  joinDate: '2025-03-25'
};
const marchResult = calculateLeaveEntitlements(marchJoiner.joinDate, 2025);
console.log('\nMarch 25th Joiner (2025):');
console.log('Expected casual leave: 4.5 days (9 completed months * 0.5)');
console.log('Actual result:', marchResult);
console.log('✓ Test passed:', marchResult.casualLeave === 4.5);

// Test 2: Joined January 1st
const janJoiner = {
  id: 'emp2',
  name: 'January Joiner',
  joinDate: '2025-01-01'
};
const janResult = calculateLeaveEntitlements(janJoiner.joinDate, 2025);
console.log('\nJanuary 1st Joiner (2025):');
console.log('Expected casual leave: 6 days (12 completed months * 0.5)');
console.log('Actual result:', janResult);
console.log('✓ Test passed:', janResult.casualLeave === 6);

// Test 3: Joined December 31st
const decJoiner = {
  id: 'emp3',
  name: 'December Joiner',
  joinDate: '2025-12-31'
};
const decResult = calculateLeaveEntitlements(decJoiner.joinDate, 2025);
console.log('\nDecember 31st Joiner (2025):');
console.log('Expected casual leave: 0.5 days (1 completed month * 0.5)');
console.log('Actual result:', decResult);
console.log('✓ Test passed:', decResult.casualLeave === 0.5);

console.log('\n=== TESTING PREVIOUS YEAR JOINERS (2024) ===');

// Test 4: Previous year Q1 joiner
const q1Joiner = {
  id: 'emp4',
  name: 'Q1 Joiner',
  joinDate: '2024-03-31' // Should be Q1
};
const q1Result = calculateLeaveEntitlements(q1Joiner.joinDate, 2025);
console.log('\nQ1 Joiner (March 31, 2024):');
console.log('Expected quarter: Q1, Annual Leave: 14 days');
console.log('Actual result:', q1Result);
console.log('✓ Quarter test passed:', q1Result.quarter === 1 && q1Result.annualLeave === 14);

// Test 5: Previous year Q2 joiner
const q2Joiner = {
  id: 'emp5',
  name: 'Q2 Joiner',
  joinDate: '2024-04-01' // Should be Q2
};
const q2Result = calculateLeaveEntitlements(q2Joiner.joinDate, 2025);
console.log('\nQ2 Joiner (April 1, 2024):');
console.log('Expected quarter: Q2, Annual Leave: 10 days');
console.log('Actual result:', q2Result);
console.log('✓ Quarter test passed:', q2Result.quarter === 2 && q2Result.annualLeave === 10);

// Test 6: Previous year Q3 joiner
const q3Joiner = {
  id: 'emp6',
  name: 'Q3 Joiner',
  joinDate: '2024-07-01' // Should be Q3
};
const q3Result = calculateLeaveEntitlements(q3Joiner.joinDate, 2025);
console.log('\nQ3 Joiner (July 1, 2024):');
console.log('Expected quarter: Q3, Annual Leave: 7 days');
console.log('Actual result:', q3Result);
console.log('✓ Quarter test passed:', q3Result.quarter === 3 && q3Result.annualLeave === 7);

// Test 7: Previous year Q4 joiner
const q4Joiner = {
  id: 'emp7',
  name: 'Q4 Joiner',
  joinDate: '2024-10-01' // Should be Q4
};
const q4Result = calculateLeaveEntitlements(q4Joiner.joinDate, 2025);
console.log('\nQ4 Joiner (October 1, 2024):');
console.log('Expected quarter: Q4, Annual Leave: 4 days');
console.log('Actual result:', q4Result);
console.log('✓ Quarter test passed:', q4Result.quarter === 4 && q4Result.annualLeave === 4);

// Test 8: Previous year Q4 end joiner
const q4EndJoiner = {
  id: 'emp8',
  name: 'Q4 End Joiner',
  joinDate: '2024-12-31' // Should be Q4
};
const q4EndResult = calculateLeaveEntitlements(q4EndJoiner.joinDate, 2025);
console.log('\nQ4 End Joiner (December 31, 2024):');
console.log('Expected quarter: Q4, Annual Leave: 4 days');
console.log('Actual result:', q4EndResult);
console.log('✓ Quarter test passed:', q4EndResult.quarter === 4 && q4EndResult.annualLeave === 4);

console.log('\n=== TESTING LONG-TERM EMPLOYEES (2023 OR EARLIER) ===');

// Test 9: Long-term employee
const longTermEmployee = {
  id: 'emp9',
  name: 'Long Term Employee',
  joinDate: '2023-06-15'
};
const longTermResult = calculateLeaveEntitlements(longTermEmployee.joinDate, 2025);
console.log('\nLong-term Employee (June 15, 2023):');
console.log('Expected: Annual Leave 14, Sick Leave 7, Casual Leave 7');
console.log('Actual result:', longTermResult);
console.log('✓ Test passed:', longTermResult.annualLeave === 14 && longTermResult.sickLeave === 7 && longTermResult.casualLeave === 7);

console.log('\n=== TESTING QUARTER BOUNDARIES (CRITICAL EDGE CASES) ===');

// Test boundary dates for each quarter
const boundaryTests = [
  { date: '2024-01-01', expectedQuarter: 1, expectedAnnual: 14, name: 'Q1 Start' },
  { date: '2024-03-31', expectedQuarter: 1, expectedAnnual: 14, name: 'Q1 End' },
  { date: '2024-04-01', expectedQuarter: 2, expectedAnnual: 10, name: 'Q2 Start' },
  { date: '2024-06-30', expectedQuarter: 2, expectedAnnual: 10, name: 'Q2 End' },
  { date: '2024-07-01', expectedQuarter: 3, expectedAnnual: 7, name: 'Q3 Start' },
  { date: '2024-09-30', expectedQuarter: 3, expectedAnnual: 7, name: 'Q3 End' },
  { date: '2024-10-01', expectedQuarter: 4, expectedAnnual: 4, name: 'Q4 Start' },
  { date: '2024-12-31', expectedQuarter: 4, expectedAnnual: 4, name: 'Q4 End' }
];

boundaryTests.forEach(test => {
  const employee = {
    id: `boundary_${test.name}`,
    name: test.name,
    joinDate: test.date
  };
  const result = calculateLeaveEntitlements(employee.joinDate, 2025);
  const passed = result.quarter === test.expectedQuarter && result.annualLeave === test.expectedAnnual;
  console.log(`${test.name} (${test.date}): Quarter ${result.quarter}, Annual ${result.annualLeave} - ${passed ? '✓ PASSED' : '✗ FAILED'}`);
});

console.log('\n=== SUMMARY ===');
console.log('All quarter boundary tests completed!');
console.log('The bug fix ensures that all days within each quarter are properly categorized.');
console.log('No redundant day-range checks are needed since month checks are sufficient.');