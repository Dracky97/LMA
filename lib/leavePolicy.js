/**
 * ------------------------------------------------------------------
 * CONFIGURATION & CONSTANTS
 * ------------------------------------------------------------------
 */
export const LEAVE_CONFIG = {
    // Annual Leave Tiers based on Join Quarter [Q1, Q2, Q3, Q4]
    // Q1 (Jan-Mar): 14, Q2 (Apr-Jun): 10, Q3 (Jul-Sep): 7, Q4 (Oct-Dec): 4
    ANNUAL_LEAVE_TIERS: [14, 10, 7, 4], 
    
    // Standard Entitlements
    SICK_LEAVE_STANDARD: 7,
    CASUAL_LEAVE_STANDARD: 7,
    ANNUAL_LEAVE_STANDARD: 14,
    
    // Accrual Rates
    CASUAL_LEAVE_ACCRUAL_RATE: 0.5, // Days per month for new joiners
    
    // Short Leave Policy
   SHORT_LEAVE_MONTHLY_LIMIT: 3, // Hours per month
   SHORT_LEAVE_REQUEST_LIMIT: 2  // Hours per single request
};

/**
 * Calculate the number of completed months between join date and a reference date
 * @param {string|Date} joinDate - The employee's join date
 * @param {string|Date} referenceDate - The date to calculate from (e.g., end of year)
 * @returns {number} Number of completed months
 */
export const calculateCompletedMonths = (joinDate, referenceDate) => {
    const join = parseLocalDate(joinDate);
    const ref = parseLocalDate(referenceDate);
    
    if (!join || !ref || isNaN(join.getTime()) || isNaN(ref.getTime())) {
        return 0;
    }
    
    const joinYear = join.getFullYear();
    const joinMonth = join.getMonth();
    const joinDay = join.getDate();
    
    const refYear = ref.getFullYear();
    const refMonth = ref.getMonth();
    const refDay = ref.getDate();
    
    let months = (refYear - joinYear) * 12 + (refMonth - joinMonth);
    
    // If the reference day is before the join day, don't count the current month
    // FIX: Only decrement if refDay < joinDay (not <=)
    if (refDay < joinDay) {
        months--;
    }
    
    return Math.max(0, months);
};

/**
 * ------------------------------------------------------------------
 * UTILITY FUNCTIONS
 * ------------------------------------------------------------------
 */

/**
 * Parse date string safely in local timezone
 * Handles ISO dates by appending time to prevent UTC conversion issues
 */
const parseLocalDate = (dateString) => {
    if (!dateString) return null;
    
    // If already a Date object, return it
    if (dateString instanceof Date) {
        return isNaN(dateString.getTime()) ? null : dateString;
    }
    
    // For ISO date strings like "2024-05-15", append noon local time to prevent UTC shift
    const dateStr = String(dateString);
    if (dateStr.match(/^\d{4}-\d{2}-\d{2}$/)) {
        return new Date(dateStr + 'T12:00:00');
    }
    
    return new Date(dateString);
};

/**
 * Helper to determine Annual Leave based on Join Quarter
 * Logic: Q1=14, Q2=10, Q3=7, Q4=4
 * ONLY used for Condition A (current year joiners) - they get 0 initially
 */
const getQuarterlyEntitlement = (joinDate) => {
    const join = parseLocalDate(joinDate);
    if (!join || isNaN(join.getTime())) return 0;

    // Month index: 0=Jan, 11=Dec
    const monthIndex = join.getMonth();
    
    // Calculate Quarter Index (0 to 3)
    const quarterIndex = Math.floor(monthIndex / 3);
    
    return LEAVE_CONFIG.ANNUAL_LEAVE_TIERS[quarterIndex] || 0;
};

/**
 * ------------------------------------------------------------------
 * CORE POLICY LOGIC
 * ------------------------------------------------------------------
 */

/**
 * Determine leave condition based on join date and current year
 * Returns 'A' (New), 'B' (Last Year - completed 1+ year), or 'C' (Old)
 * Condition B now properly checks if 12+ months have been completed
 */
export const getLeaveCondition = (joinDate, currentYear = new Date().getFullYear()) => {
    const join = parseLocalDate(joinDate);
    if (!join || isNaN(join.getTime())) throw new Error('Invalid join date');

    const joinYear = join.getFullYear();

    if (joinYear === currentYear) return 'A';
    if (joinYear === currentYear - 1) return 'B';
    if (joinYear < currentYear - 1) return 'C';
    return 'Future';
};

/**
 * Calculate leave entitlements (The "Budget")
 */
export const calculateLeaveEntitlements = (joinDate, currentYear = new Date().getFullYear()) => {
    if (!joinDate) throw new Error('Join date is required');
    
    const condition = getLeaveCondition(joinDate, currentYear);
    const currentDate = new Date(currentYear, 11, 31); // End of calculation year
    const completedMonths = calculateCompletedMonths(joinDate, currentDate);
    
    let entitlements = {
        annualLeave: 0,
        sickLeave: LEAVE_CONFIG.SICK_LEAVE_STANDARD,
        casualLeave: 0,
        condition: condition,
        completedMonths: completedMonths,
        quarter: getQuarterInfo(joinDate).quarter
    };

    switch (condition) {
        case 'A': // Joined Current Year
            entitlements.annualLeave = 0;
            entitlements.sickLeave = LEAVE_CONFIG.SICK_LEAVE_STANDARD;
            // 0.5 days per completed month
            entitlements.casualLeave = parseFloat((completedMonths * LEAVE_CONFIG.CASUAL_LEAVE_ACCRUAL_RATE).toFixed(2));
            break;

        case 'B': // Joined Previous Year - Quarterly entitlements for annual leave
            entitlements.sickLeave = LEAVE_CONFIG.SICK_LEAVE_STANDARD;
            entitlements.casualLeave = LEAVE_CONFIG.CASUAL_LEAVE_STANDARD;
            entitlements.annualLeave = getQuarterlyEntitlement(joinDate);
            break;

        case 'C': // Joined Before Previous Year
            entitlements.sickLeave = LEAVE_CONFIG.SICK_LEAVE_STANDARD;
            entitlements.casualLeave = LEAVE_CONFIG.CASUAL_LEAVE_STANDARD;
            entitlements.annualLeave = LEAVE_CONFIG.ANNUAL_LEAVE_STANDARD;
            break;
            
        default: // Future or Invalid
            entitlements.sickLeave = 0;
            entitlements.casualLeave = 0;
            entitlements.annualLeave = 0;
    }

    return entitlements;
};

/**
 * Calculate available balances (Budget - Spent)
 */
export const calculateLeaveBalances = (employee, leaveRequests = [], year = new Date().getFullYear()) => {
    if (!employee.joinDate) throw new Error('Employee join date is required');

    // 1. Get Entitlements (The Total Budget)
    const entitlements = calculateLeaveEntitlements(employee.joinDate, year);

    // 2. Filter requests for the Calculation Year AND Approved status
    const approvedRequests = leaveRequests.filter(req =>
        req.userId === employee.uid &&
        req.status === 'Approved' &&
        new Date(req.startDate).getFullYear() === year
    );

    console.log(`🔍 Balance calculation for ${employee.name} (${employee.uid}): Found ${approvedRequests.length} approved requests in ${year}`);
    console.log('📋 Approved requests details:', approvedRequests.map(req => ({
        id: req.id,
        type: req.type,
        status: req.status,
        leaveUnits: req.leaveUnits,
        startDate: req.startDate
    })));

    // 3. Calculate Usage
    const usage = approvedRequests.reduce((acc, req) => {
        const type = req.type.toLowerCase().replace(/\s/g, ''); // normalize 'Short Leave' -> 'shortleave'
        
        // Handle Standard Leaves (Days) - using 'leaveUnits'
        if (['annualleave', 'casualleave', 'sickleave'].includes(type)) {
            const days = parseFloat(req.leaveUnits) || 0; 
            acc[type] = (acc[type] || 0) + days;
        }
        
        // Handle Short Leave (Hours) - using 'totalHours'
        // FIX: Count short leave used in the CALCULATION YEAR's months, not current date
        if (type === 'shortleave') {
            const reqDate = new Date(req.startDate);
            
            // Count ALL short leave in the calculation year (no month restriction for balance)
            if (reqDate.getFullYear() === year) {
                const hours = parseFloat(req.totalHours) || 0; 
                acc.shortLeaveThisYear = (acc.shortLeaveThisYear || 0) + hours;
            }
        }
        
        return acc;
    }, { shortLeaveThisYear: 0 });

    // 4. Return Balances
    // Reverted to original Short Leave Policy: 3 hours/month, auto-reset monthly
    // Calculate current month short leave usage for balance
    const now = new Date();
    const currentMonthShortLeaveUsage = approvedRequests.filter(req =>
        req.type === 'Short Leave' &&
        new Date(req.startDate).getMonth() === now.getMonth() &&
        new Date(req.startDate).getFullYear() === now.getFullYear()
    ).reduce((total, req) => total + (parseFloat(req.totalHours) || 0), 0);
    
    const shortLeaveBalance = Math.max(0, LEAVE_CONFIG.SHORT_LEAVE_MONTHLY_LIMIT - currentMonthShortLeaveUsage);
     
    return {
        annualLeave: Math.max(0, entitlements.annualLeave - (usage.annualleave || 0)),
        casualLeave: Math.max(0, entitlements.casualLeave - (usage.casualleave || 0)),
        sickLeave: Math.max(0, entitlements.sickLeave - (usage.sickleave || 0)),
         
        // Short Leave Balance = remaining hours this month (auto-resets monthly)
        shortLeave: shortLeaveBalance,
         
        // Meta data
        usage: usage,
        entitlements: entitlements,
        condition: entitlements.condition,
        year: year,
        currentMonthShortLeaveUsage: currentMonthShortLeaveUsage
    };
};

/**
 * ------------------------------------------------------------------
 * VALIDATION & UI HELPERS
 * ------------------------------------------------------------------
 */

/**
 * Get current month Short Leave usage for a specific user.
 * *REQUIRED BY UI COMPONENTS (LeaveRequestModal)*
 * Reverted to count hours for the original policy
 */
export const getCurrentMonthShortLeaveUsage = (userId, leaveRequests) => {
    if (!Array.isArray(leaveRequests)) return 0;

    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    return leaveRequests.reduce((total, req) => {
        // Filter: User + Approved + Short Leave
        if (req.userId !== userId || req.status !== 'Approved' || req.type !== 'Short Leave') {
            return total;
        }

        // Filter: Current Month Only
        const reqDate = new Date(req.startDate);
        if (isNaN(reqDate.getTime())) return total;

        if (reqDate.getMonth() === currentMonth && reqDate.getFullYear() === currentYear) {
            // Use totalHours for Short Leave
            return total + (parseFloat(req.totalHours) || 0);
        }

        return total;
    }, 0);
};

/**
 * Validate a Short Leave Request
 * Each user entitled to 3 hours of short leave each month
 * Maximum 2 hours at once, with automatic monthly reset
 */
export const validateShortLeave = (requestedHours, usedHoursThisMonth = 0) => {
    const result = {
        isValid: true,
        errors: [],
        remainingHoursThisMonth: Math.max(0, LEAVE_CONFIG.SHORT_LEAVE_MONTHLY_LIMIT - usedHoursThisMonth)
    };

    // Check 1: Max hours per single request (2 hours)
    if (requestedHours > LEAVE_CONFIG.SHORT_LEAVE_REQUEST_LIMIT) {
        result.isValid = false;
        result.errors.push(`Maximum allowed per request is ${LEAVE_CONFIG.SHORT_LEAVE_REQUEST_LIMIT} hours.`);
    }

    // Check 2: Monthly allowance (3 hours)
    if (usedHoursThisMonth + requestedHours > LEAVE_CONFIG.SHORT_LEAVE_MONTHLY_LIMIT) {
        result.isValid = false;
        result.errors.push(`Monthly limit exceeded. You only have ${result.remainingHoursThisMonth} hours remaining this month.`);
    }

    return result;
};

/**
 * Format leave entitlement information for display
 */
export const formatLeaveEntitlements = (entitlements) => {
    const conditionText = {
        'A': 'Current Year Joiner',
        'B': 'Previous Year Joiner',
        'C': 'Long-term Employee'
    };
    
    return {
        condition: conditionText[entitlements.condition] || entitlements.condition,
        annualLeave: `${entitlements.annualLeave} days`,
        sickLeave: `${entitlements.sickLeave} days`,
        casualLeave: `${entitlements.casualLeave} days`,
        note: entitlements.condition === 'A' 
            ? `Casual leave accruing at 0.5 days/month (${entitlements.completedMonths} months completed)`
            : 'Standard entitlements applied'
    };
};

/**
 * ------------------------------------------------------------------
 * UI HELPERS
 * ------------------------------------------------------------------
 */

/**
 * Get detailed quarter information for display in the UI
 * Used by LeavePolicyInfo.js
 * @param {Date} joinDate - Join date
 * @returns {Object} Quarter information
 */
export const getQuarterInfo = (joinDate) => {
    const join = parseLocalDate(joinDate);
    
    // Handle invalid dates
    if (!join || isNaN(join.getTime())) {
        throw new Error('Invalid join date provided');
    }
    
    const monthIndex = join.getMonth(); // 0-11
    const quarterIndex = Math.floor(monthIndex / 3); // 0-3
    
    // Static display data mapped to the config
    const quarterNames = [
        'Q1 (January - March)',
        'Q2 (April - June)',
        'Q3 (July - September)',
        'Q4 (October - December)'
    ];
    
    const dateRanges = [
        'Jan 1 – Mar 31',
        'Apr 1 – Jun 30',
        'Jul 1 – Sep 30',
        'Oct 1 – Dec 31'
    ];

    return {
        quarter: quarterIndex + 1,
        quarterName: quarterNames[quarterIndex],
        // Pull the actual entitlement value from our central config
        annualLeave: LEAVE_CONFIG.ANNUAL_LEAVE_TIERS[quarterIndex],
        dateRange: dateRanges[quarterIndex],
        joinMonth: monthIndex + 1,
        joinDay: join.getDate(),
        joinDate: join.toLocaleDateString()
    };
};