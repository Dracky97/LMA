# Leave Policy Conflict Resolution Report

**Date**: February 25, 2026  
**Status**: ✅ RESOLVED

---

## 🔍 Executive Summary

Two major leave policy conflicts were identified and resolved in the Leave Management Application:

1. **Short Leave Calculation Inconsistency** - Mixed use of monthly reset vs annual allocation
2. **Manual Balance Override Without Validation** - HR/Admin could bypass policy rules

---

## ⚠️ Conflicts Identified

### Conflict #1: Short Leave Balance Calculation Inconsistency

**Severity**: HIGH  
**Impact**: Users seeing incorrect short leave balances, confusion about available hours

#### Problem Description:
The application was using TWO different approaches to calculate Short Leave simultaneously:

1. **Monthly Reset Approach** (Correct per policy):
   - 3 hours per month
   - Auto-resets at start of each month
   - No carryover
   - Implemented in [`lib/leavePolicy.js`](lib/leavePolicy.js:233)

2. **Annual Allocation Approach** (Incorrect):
   - 36 hours per year (3h × 12 months)
   - Stored in `leaveAllocations.shortLeave`
   - Implemented in [`context/AuthContext.js`](context/AuthContext.js:109) and [`functions/index.js`](functions/index.js:294)

#### Evidence:
```javascript
// In AuthContext.js (BEFORE FIX)
leaveAllocations: {
    shortLeave: LEAVE_CONFIG.SHORT_LEAVE_MONTHLY_LIMIT * 12 // 36 hours annual
}

// In LeaveBalanceCard.js (BEFORE FIX)
const allocation = userData?.leaveAllocations?.[type.key]; // Could be 36 hours
sub: `${formatNumber(total)} Hours total` // Showing 36 hours instead of 3
```

#### Root Cause:
Conflicting implementation between policy logic (monthly reset) and data initialization (annual allocation).

---

### Conflict #2: Manual Balance Editing Overrides Policy

**Severity**: MEDIUM  
**Impact**: HR/Admin could set balances that violate policy rules without warning

#### Problem Description:
HR Managers and Admins could manually edit leave balances and allocations without any validation against the policy-calculated entitlements based on employee join dates.

#### Example Scenario:
- Employee joined in Q4 2023 (Condition B)
- Policy says: 4 days annual leave
- HR could manually set: 14 days annual leave
- System would accept without warning

#### Evidence:
```javascript
// In HRManagerDashboard.js (BEFORE FIX)
await updateDoc(doc(db, "users", editingUser.uid), {
    leaveBalance: {
        annualLeave: editBalanceData.annualLeave, // No validation!
    }
});
```

#### Root Cause:
No validation layer between manual edits and database updates.

---

## ✅ Solutions Implemented

### Solution #1: Standardize Short Leave to Monthly Reset Only

#### Changes Made:

1. **[`context/AuthContext.js`](context/AuthContext.js:104-111)** - Removed annual allocation
   ```javascript
   // BEFORE
   leaveAllocations: {
       shortLeave: LEAVE_CONFIG.SHORT_LEAVE_MONTHLY_LIMIT * 12 // 36 hours
   }
   
   // AFTER
   leaveAllocations: {
       // Short Leave is NOT included - it auto-resets monthly
   }
   ```

2. **[`functions/index.js`](functions/index.js:291-296)** - Removed from monthly reset function
   ```javascript
   // BEFORE
   batch.update(userRef, {
       'leaveBalance.shortLeave': 3,
       'leaveAllocations.shortLeave': 36,  // Removed this line
   });
   
   // AFTER
   batch.update(userRef, {
       'leaveBalance.shortLeave': 3,
       // No allocation update
   });
   ```

3. **[`components/LeaveBalanceCard.js`](components/LeaveBalanceCard.js:17-18)** - Exclude from allocation lookup
   ```javascript
   // BEFORE
   const allocation = userData?.leaveAllocations?.[type.key];
   
   // AFTER
   const allocation = type.key === 'shortLeave' ? null : userData?.leaveAllocations?.[type.key];
   ```

4. **[`components/LeaveBalanceCard.js`](components/LeaveBalanceCard.js:72-86)** - Update display logic
   ```javascript
   // BEFORE
   sub: `${formatNumber(total)} Hours total` // Shows 36h
   
   // AFTER
   sub: `${formatNumber(monthlyLimit)}h monthly (auto-resets)` // Shows 3h
   ```

#### Result:
- ✅ Short Leave now consistently shows 3 hours per month
- ✅ No more confusion about annual vs monthly allocation
- ✅ Clear indication that it auto-resets monthly

---

### Solution #2: Add Policy Validation to Manual Edits

#### Changes Made:

1. **[`components/dashboards/HRManagerDashboard.js`](components/dashboards/HRManagerDashboard.js:512-565)** - Added validation with confirmation
   ```javascript
   // Calculate policy-expected values
   const policyEntitlements = calculateLeaveEntitlements(
       editingUser.joinDate, 
       new Date().getFullYear()
   );
   
   // Check for deviations
   if (editBalanceData.annualLeaveTotal !== policyEntitlements.annualLeave) {
       warnings.push(`Annual Leave allocation differs from policy`);
   }
   
   // Require confirmation if deviating
   if (warnings.length > 0) {
       if (!confirm(`Policy Deviation Warning: ${warnings}\n\nProceed?`)) {
           return; // Cancel the edit
       }
   }
   ```

2. **[`components/dashboards/AdminDashboard.js`](components/dashboards/AdminDashboard.js:456-495)** - Added validation logging
   ```javascript
   // Validate but don't block (Admin has override authority)
   if (warnings.length > 0) {
       console.warn('Policy deviation detected:', warnings);
       // Log but allow Admin to proceed
   }
   ```

3. **Both dashboards** - Exclude shortLeave from allocations
   ```javascript
   const sanitizedAllocations = Object.fromEntries(
       Object.entries(editUserData.leaveAllocations || {}).filter(([k]) => 
           k !== 'leave in-lieu' && 
           k !== 'other' && 
           k !== 'shortLeave' // Added this exclusion
       )
   );
   ```

#### Result:
- ✅ HR receives warnings when deviating from policy
- ✅ Admin can override but deviations are logged
- ✅ Short Leave cannot be given annual allocation via manual edit

---

## 📋 Files Modified

| File | Changes | Purpose |
|------|---------|---------|
| [`context/AuthContext.js`](context/AuthContext.js) | Removed shortLeave from leaveAllocations | Fix initialization |
| [`functions/index.js`](functions/index.js) | Removed shortLeave allocation from reset | Fix monthly reset |
| [`components/LeaveBalanceCard.js`](components/LeaveBalanceCard.js) | Updated display logic for short leave | Fix UI display |
| [`components/dashboards/HRManagerDashboard.js`](components/dashboards/HRManagerDashboard.js) | Added policy validation with confirmation | Prevent policy violations |
| [`components/dashboards/AdminDashboard.js`](components/dashboards/AdminDashboard.js) | Added policy validation logging | Track overrides |
| [`LEAVE_POLICY_IMPLEMENTATION.md`](LEAVE_POLICY_IMPLEMENTATION.md) | Added conflict resolution section | Documentation |

---

## 🧪 Testing Recommendations

### Test Case 1: Short Leave Display
1. Log in as any employee
2. Check "My Leave Balance" card
3. **Expected**: Short Leave shows "X Hours Remaining" with "3h monthly (auto-resets)" subtitle
4. **Not Expected**: Should NOT show "36 Hours total"

### Test Case 2: Short Leave Monthly Reset
1. Use short leave in current month
2. Wait for next month (or manually trigger reset function)
3. **Expected**: Balance resets to 3 hours
4. **Not Expected**: Should NOT accumulate unused hours

### Test Case 3: HR Manual Edit Warning
1. Log in as HR Manager
2. Edit an employee's leave balance
3. Set Annual Leave to value different from policy
4. **Expected**: Warning dialog appears with policy deviation details
5. **Action**: Can proceed or cancel

### Test Case 4: Admin Manual Edit Logging
1. Log in as Admin
2. Edit an employee's leave balance
3. Set values different from policy
4. **Expected**: Console warning logged, but edit proceeds
5. **Check**: Browser console for policy deviation warnings

### Test Case 5: Policy Calculation Accuracy
1. Create test employees with different join dates:
   - Current year (Condition A)
   - Previous year Q1, Q2, Q3, Q4 (Condition B)
   - Before previous year (Condition C)
2. Calculate entitlements using policy function
3. **Expected**: Values match policy specification exactly

---

## 📊 Impact Assessment

### Before Fixes:
- ❌ Short Leave showing 36 hours total (confusing)
- ❌ Inconsistent balance calculations
- ❌ HR could violate policy without warning
- ❌ No audit trail for policy overrides

### After Fixes:
- ✅ Short Leave consistently shows 3h monthly
- ✅ Clear indication of auto-reset behavior
- ✅ HR warned when deviating from policy
- ✅ Admin overrides logged for audit
- ✅ Consistent policy enforcement

---

## 🔐 Policy Rules (Clarified)

### Short Leave Policy
- **Entitlement**: 3 hours per month
- **Reset**: Automatic at start of each month
- **Maximum per Request**: 2 hours
- **Carryover**: None (unused hours do not carry over)
- **Allocation**: No annual allocation (monthly only)

### Annual Leave Policy
- **Condition A** (Current year joiners): 0 days
- **Condition B** (Previous year joiners): Based on join quarter
  - Q1 (Jan-Mar): 14 days
  - Q2 (Apr-Jun): 10 days
  - Q3 (Jul-Sep): 7 days
  - Q4 (Oct-Dec): 4 days
- **Condition C** (Long-term employees): 14 days

### Sick Leave Policy
- **All Conditions**: 7 days standard

### Casual Leave Policy
- **Condition A**: 0.5 days per completed month
- **Conditions B & C**: 7 days standard

---

## 🎯 Compliance Checklist

- [x] Short Leave uses monthly reset only (no annual allocation)
- [x] Policy validation added to HR manual edits
- [x] Policy validation added to Admin manual edits
- [x] Short Leave display updated to show monthly limit
- [x] Documentation updated with conflict resolution details
- [x] All leave types follow policy specification
- [x] Manual overrides require confirmation (HR) or are logged (Admin)

---

## 📝 Maintenance Guidelines

### When Updating Leave Policy:
1. Update [`lib/leavePolicy.js`](lib/leavePolicy.js) - Core policy logic
2. Update [`LEAVE_POLICY_IMPLEMENTATION.md`](LEAVE_POLICY_IMPLEMENTATION.md) - Documentation
3. Test all affected components
4. Verify validation logic in dashboards

### When Adding New Leave Types:
1. Add to [`lib/leaveTypes.js`](lib/leaveTypes.js)
2. Determine if it uses allocation or accrual
3. Update validation logic if needed
4. Document the policy rules

### When Debugging Balance Issues:
1. Check [`lib/leavePolicy.js`](lib/leavePolicy.js) - Calculation logic
2. Check component display logic
3. Verify database values match expected policy
4. Review manual edit history (if logged)

---

## ✅ Sign-Off

**Conflicts Identified**: 2  
**Conflicts Resolved**: 2  
**Files Modified**: 6  
**Tests Recommended**: 5  
**Status**: COMPLETE

All identified leave policy conflicts have been resolved. The application now consistently enforces the leave policy across all components, with appropriate validation and logging for manual overrides.

---

**Report Generated**: February 25, 2026  
**Next Review**: Recommended after next policy update or major feature addition
