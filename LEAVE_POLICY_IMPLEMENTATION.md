# Leave Policy Logic Implementation

## Overview

This document outlines the implementation of the Leave Policy Logic Specification for the Leave Management Application. The system now supports comprehensive leave entitlement calculations based on employee join date and current year.

## 🎯 Implemented Features

### 1. Leave Entitlements Logic

The system now implements three distinct leave conditions based on employee join date:

#### Condition A: Current Year Joiner
- **Annual Leave**: 0 days
- **Sick Leave**: 7 days
- **Casual Leave**: 0.5 × completed months of service

#### Condition B: Previous Year Joiner
- **Sick Leave**: 7 days
- **Casual Leave**: 7 days
- **Annual Leave**: Based on join date lookup table

#### Condition C: Long-term Employee
- **Annual Leave**: 14 days
- **Sick Leave**: 7 days
- **Casual Leave**: 7 days

### 2. Annual Leave Lookup Table (Previous Year Joiners)

| Join Date Range | Annual Leave Entitlement |
|----------------|-------------------------|
| Q1 (Jan 1 - Mar 31) | 14 days |
| Q2 (Apr 1 - Jun 30) | 10 days |
| Q3 (Jul 1 - Sep 30) | 7 days |
| Q4 (Oct 1 - Dec 31) | 4 days |

### 3. Short Leave Policy

- **Monthly Allowance**: 3 hours per month (auto-resets monthly)
- **Maximum per Request**: 2 hours
- **Validation**: Cannot apply for 3+ hours in a single request
- **Important**: Short Leave does NOT use annual allocation - it automatically resets to 3 hours at the start of each month
- **No Carryover**: Unused short leave hours do not carry over to the next month

## 📁 Files Created/Modified

### New Files
1. **`lib/leavePolicy.js`** - Core policy logic implementation
2. **`components/LeavePolicyInfo.js`** - UI components for policy display

### Modified Files
1. **`components/LeaveRequestModal.js`** - Integrated short leave validation
2. **`components/dashboards/HRManagerDashboard.js`** - Added policy management features

## 🔧 Key Functions Implemented

### Core Policy Functions (`lib/leavePolicy.js`)

#### `calculateLeaveEntitlements(joinDate, currentYear)`
Calculates leave entitlements based on the employee's join date and current year.

```javascript
// Example usage
const entitlements = calculateLeaveEntitlements('2023-03-15', 2024);
// Returns: { annualLeave: 10, sickLeave: 7, casualLeave: 7, condition: 'B' }
```

#### `validateShortLeave(requestedHours, usedHoursThisMonth, requestDate)`
Validates short leave requests against policy constraints.

```javascript
// Example usage
const validation = validateShortLeave(1.5, 1.0);
// Returns: { isValid: true, remainingHoursThisMonth: 2.0, errors: [] }
```

#### `calculateCompletedMonths(joinDate, currentDate)`
Calculates completed months of service for Condition A employees.

#### `getQuarterInfo(joinDate)`
Provides quarterly information for annual leave calculation (Condition B).

### UI Components (`components/LeavePolicyInfo.js`)

#### `LeavePolicyInfo(employee, year)`
Displays detailed leave policy information for a specific employee.

#### `LeavePolicyReference()`
Shows the complete policy reference guide.

## 🎨 User Interface Enhancements

### HR Manager Dashboard

1. **New "Leave Policy" Tab**
   - Policy reference guide
   - Employee policy calculator
   - Bulk leave balance calculation tool

2. **Enhanced Leave Request Modal**
   - Real-time short leave usage tracking
   - Policy-compliant validation
   - Visual feedback for policy constraints

3. **Edit Balance Modal**
   - Integrated policy information display
   - Shows expected entitlements based on join date

### Short Leave Validation Features

1. **Real-time Usage Tracking**
   - Shows current month usage: "Used: 1.5h / 3h monthly allowance"
   - Displays remaining hours: "Remaining: 1.5h"
   - Maximum per request reminder: "Max 2h per request"

2. **Smart Validation**
   - Prevents requests exceeding 2 hours
   - Blocks requests that would exceed monthly allowance
   - Clear error messages for policy violations

## 🔄 Bulk Operations

### Calculate All Leave Balances
HR can now automatically calculate and update leave balances for all employees based on the new policy:

1. **Policy-based Calculation**: Uses join date to determine entitlements
2. **Current Usage Consideration**: Factors in already taken leave for the year
3. **Batch Processing**: Updates all employees with a single operation
4. **Error Handling**: Reports individual failures while continuing with others

## 🧮 Calculation Examples

### Example 1: Current Year Joiner
- **Join Date**: March 15, 2024
- **Current Date**: January 2, 2026
- **Completed Months**: 9 months (March 2024 to January 2026)
- **Entitlements**:
  - Annual Leave: 0 days
  - Sick Leave: 7 days
  - Casual Leave: 4.5 days (0.5 × 9 months)

### Example 2: Previous Year Joiner
- **Join Date**: May 20, 2023
- **Current Year**: 2024
- **Condition**: B (Previous year joiner)
- **Quarter**: Q2 (Apr-Jun)
- **Entitlements**:
  - Annual Leave: 10 days
  - Sick Leave: 7 days
  - Casual Leave: 7 days

### Example 3: Long-term Employee
- **Join Date**: January 10, 2020
- **Current Year**: 2024
- **Condition**: C (Before previous year)
- **Entitlements**:
  - Annual Leave: 14 days
  - Sick Leave: 7 days
  - Casual Leave: 7 days

## 🔒 Policy Validation

### Short Leave Validation Rules

1. **Single Request Limit**: Maximum 2 hours per request
2. **Monthly Allowance**: Maximum 3 hours per calendar month
3. **Positive Hours**: Must be greater than 0
4. **Real-time Checking**: Validates against current month usage

### Validation Error Messages

- "Single short leave request cannot exceed 2 hours"
- "Monthly allowance exceeded. Available: 1.5h, Requested: 2h"
- "Short leave request must be greater than 0 hours"

## 🎯 Usage Instructions

### For HR Managers

1. **View Policy Reference**
   - Navigate to "Leave Policy" tab in HR Dashboard
   - Review complete policy documentation

2. **Calculate Individual Entitlements**
   - Select employee from dropdown in Policy tab
   - View detailed entitlement breakdown
   - See policy rationale and calculations

3. **Bulk Update Balances**
   - Use "Calculate All Balances" in Policy tab
   - Confirm bulk operation warning
   - Review results and any errors

4. **Monitor Short Leave Usage**
   - Check real-time usage in leave request modal
   - Validate against policy constraints before approval

### For Employees

1. **Short Leave Requests**
   - Check current month usage before applying
   - Ensure requests don't exceed 2 hours
   - Monitor remaining monthly allowance

2. **Leave Balance Display**
   - View updated balances in leave request modal
   - See policy-compliant calculations
   - Understand entitlement basis

## 🔍 Testing Recommendations

### Policy Calculation Testing
1. Test all three conditions with various join dates
2. Verify quarterly calculations for Condition B
3. Validate month calculations for Condition A

### Short Leave Validation Testing
1. Test single requests exceeding 2 hours
2. Test monthly allowance exceedance
3. Test zero/negative hour requests
4. Test end-of-month boundary conditions

### Integration Testing
1. Test bulk balance calculations
2. Test policy info display in edit modal
3. Test error handling for missing join dates

## 🚀 Future Enhancements

1. **Automated Annual Reset**: Schedule automatic balance calculations
2. **Policy Versioning**: Track policy changes over time
3. **Advanced Reporting**: Policy compliance reports
4. **Email Notifications**: Policy violation alerts
5. **Mobile Responsive**: Enhanced mobile policy display

## 📊 Performance Considerations

1. **Efficient Calculations**: Optimized date arithmetic
2. **Minimal Database Queries**: Batch processing where possible
3. **Real-time Updates**: Efficient short leave usage tracking
4. **Error Recovery**: Graceful handling of calculation failures

## 🔧 Maintenance Notes

1. **Policy Updates**: Modify `lib/leavePolicy.js` for policy changes
2. **UI Modifications**: Update `components/LeavePolicyInfo.js` for display changes
3. **Validation Rules**: Adjust short leave validation in modal components
4. **Data Migration**: Use bulk calculation feature for existing employee data

## ⚠️ Policy Conflict Resolution (February 2026)

### Issues Identified and Fixed:

1. **Short Leave Calculation Conflict**
   - **Problem**: Short Leave was using both monthly reset (3h/month) AND annual allocation (36h/year) approaches inconsistently
   - **Solution**: Removed annual allocation for Short Leave; now exclusively uses monthly reset (3h/month, auto-resets)
   - **Files Modified**:
     - [`context/AuthContext.js`](context/AuthContext.js) - Removed shortLeave from leaveAllocations
     - [`functions/index.js`](functions/index.js) - Removed annual allocation from monthly reset function
     - [`components/LeaveBalanceCard.js`](components/LeaveBalanceCard.js) - Updated to show monthly limit instead of annual allocation

2. **Manual Balance Editing Override**
   - **Problem**: HR/Admin could manually edit leave balances without validation against policy calculations
   - **Solution**: Added policy validation warnings when manual edits deviate from policy-calculated entitlements
   - **Files Modified**:
     - [`components/dashboards/HRManagerDashboard.js`](components/dashboards/HRManagerDashboard.js) - Added validation with confirmation prompt
     - [`components/dashboards/AdminDashboard.js`](components/dashboards/AdminDashboard.js) - Added validation logging (Admin has override authority)

### Key Policy Rules (Clarified):

- **Short Leave**: 3 hours per month, auto-resets monthly, NO annual allocation, NO carryover
- **Annual Leave**: Based on join date condition (A/B/C) and quarterly entitlements for Condition B
- **Sick Leave**: 7 days standard for all conditions
- **Casual Leave**: 7 days standard (except Condition A: 0.5 days per completed month)
- **Manual Edits**: HR receives warnings when deviating from policy; Admin can override with logging

---

**Implementation Date**: January 2, 2026  
**Version**: 1.0  
**Compatibility**: Next.js 16.0.10, Firebase Firestore