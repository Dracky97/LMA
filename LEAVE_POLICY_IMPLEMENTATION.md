# Leave Policy Implementation

**Version**: 2.0  
**Effective Date**: April 10, 2026  
**Compatibility**: Next.js, Firebase Firestore

---

## Overview

Leave entitlements are calculated dynamically based on an employee's join date relative to the current calendar year. There are three employee conditions (A, B, C) and a separate short leave policy that applies globally to all employees.

---

## 1. Leave Entitlements by Condition

### Condition A — Current Year Joiner
> Employee joined in the **current calendar year**

| Leave Type    | Entitlement                          |
|---------------|--------------------------------------|
| Annual Leave  | 0 days                               |
| Sick Leave    | 7 days                               |
| Casual Leave  | 0.5 × completed months of service   |

**Casual Leave Accrual**: Calculated as `completedMonths × 0.5`. A month is counted as complete only when the reference day is ≥ the join day.

---

### Condition B — Previous Year Joiner
> Employee joined in the **immediately preceding calendar year**

| Leave Type    | Entitlement                        |
|---------------|------------------------------------|
| Annual Leave  | Based on join-quarter lookup table |
| Sick Leave    | 7 days                             |
| Casual Leave  | 7 days                             |

**Annual Leave Lookup Table (by join quarter):**

| Join Quarter | Date Range         | Annual Leave |
|--------------|--------------------|--------------|
| Q1           | Jan 1 – Mar 31     | 14 days      |
| Q2           | Apr 1 – Jun 30     | 10 days      |
| Q3           | Jul 1 – Sep 30     | 7 days       |
| Q4           | Oct 1 – Dec 31     | 4 days       |

---

### Condition C — Long-term Employee
> Employee joined **two or more calendar years ago**

| Leave Type    | Entitlement |
|---------------|-------------|
| Annual Leave  | 14 days     |
| Sick Leave    | 7 days      |
| Casual Leave  | 7 days      |

---

## 2. Short Leave Policy

Short leave applies globally to all employees regardless of condition.

| Rule                    | Value                              |
|-------------------------|------------------------------------|
| Monthly Allowance       | 3 hours per calendar month         |
| Maximum per Request     | 2 hours                            |
| Reset                   | Automatic at the start of each month |
| Carryover               | None — unused hours do not carry over |
| Annual Allocation       | None — short leave is monthly only |

**Validation Rules:**
- A single request must not exceed 2 hours.
- A request that would push total monthly usage above 3 hours is rejected.

---

## 3. Core Implementation

**File**: `lib/leavePolicy.js`

### Configuration (`LEAVE_CONFIG`)

```js
ANNUAL_LEAVE_TIERS:       [14, 10, 7, 4]  // Q1→Q4 for Condition B
SICK_LEAVE_STANDARD:      7               // days
CASUAL_LEAVE_STANDARD:    7               // days
ANNUAL_LEAVE_STANDARD:    14              // days (Condition C)
CASUAL_LEAVE_ACCRUAL_RATE: 0.5           // days per completed month (Condition A)
SHORT_LEAVE_MONTHLY_LIMIT: 3             // hours per month
SHORT_LEAVE_REQUEST_LIMIT: 2             // hours per single request
```

### Key Functions

| Function | Description |
|---|---|
| `getLeaveCondition(joinDate, currentYear)` | Returns `'A'`, `'B'`, or `'C'` based on join year |
| `calculateLeaveEntitlements(joinDate, currentYear)` | Returns full entitlement object for an employee |
| `calculateLeaveBalances(employee, leaveRequests, year)` | Returns remaining balances after deducting approved leave |
| `validateShortLeave(requestedHours, usedHoursThisMonth)` | Validates a short leave request against policy rules |
| `getCurrentMonthShortLeaveUsage(userId, leaveRequests)` | Returns total approved short leave hours in the current month |
| `calculateCompletedMonths(joinDate, referenceDate)` | Returns completed months of service (used for Condition A accrual) |
| `getQuarterInfo(joinDate)` | Returns quarter number, name, date range, and annual leave entitlement |
| `formatLeaveEntitlements(entitlements)` | Returns human-readable entitlement strings for UI display |

---

## 4. Calculation Examples

### Example 1 — Condition A (Current Year Joiner)
- Join Date: March 15, 2026
- Reference Date: December 31, 2026
- Completed Months: 9
- **Casual Leave**: 9 × 0.5 = **4.5 days**
- Annual Leave: 0 days | Sick Leave: 7 days

### Example 2 — Condition B (Previous Year Joiner, Q2)
- Join Date: May 20, 2025
- Current Year: 2026
- Join Quarter: Q2 (Apr–Jun)
- **Annual Leave**: 10 days
- Sick Leave: 7 days | Casual Leave: 7 days

### Example 3 — Condition C (Long-term Employee)
- Join Date: January 10, 2021
- Current Year: 2026
- **Annual Leave**: 14 days
- Sick Leave: 7 days | Casual Leave: 7 days

### Example 4 — Short Leave Validation
- Monthly Allowance: 3 hours | Already Used: 1.5 hours
- Request: 1.5 hours → **Valid** (total = 3 hours, within limit)
- Request: 2 hours → **Invalid** (total = 3.5 hours, exceeds limit)
- Request: 2.5 hours → **Invalid** (exceeds 2-hour single-request cap)

---

## 5. Policy Rules Summary

| Rule | Value |
|---|---|
| Condition A annual leave | 0 days |
| Condition A casual leave | 0.5 days × completed months |
| Condition B/C sick leave | 7 days |
| Condition B/C casual leave | 7 days |
| Condition C annual leave | 14 days |
| Short leave monthly limit | 3 hours |
| Short leave per-request cap | 2 hours |
| Short leave carryover | None |
| Short leave annual allocation | None |
