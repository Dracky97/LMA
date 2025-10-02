// Shared leave types configuration
export const LEAVE_TYPES = [
    { value: 'Sick Leave', label: 'Sick Leave', key: 'sickLeave' },
    { value: 'Casual Leave', label: 'Casual Leave', key: 'casualLeave' },
    { value: 'Leave in-lieu', label: 'Leave in-lieu', key: 'leave in-lieu' },
    { value: 'Annual Leave', label: 'Annual Leave', key: 'annualLeave' },
    { value: 'Maternity Leave', label: 'Maternity Leave', key: 'maternityLeave', gender: 'female' },
    { value: 'Short Leave', label: 'Short Leave', key: 'shortLeave' },
    { value: 'Paternity Leave', label: 'Paternity Leave', key: 'paternityLeave', gender: 'male' },
    { value: 'Other', label: 'Other', key: 'other' }
];

// Leave type mapping from display name to internal key
export const LEAVE_TYPE_MAP = {
    'Sick Leave': 'sickLeave',
    'Casual Leave': 'casualLeave',
    'Leave in-lieu': 'leave in-lieu',
    'Annual Leave': 'annualLeave',
    'Maternity Leave': 'maternityLeave',
    'Short Leave': 'shortLeave',
    'Paternity Leave': 'paternityLeave',
    'Other': 'other'
};

// Leave balance display configuration with styling and standard allocations
export const LEAVE_BALANCE_TYPES = [
    { key: 'sickLeave', label: 'Sick Leave', bgColor: 'bg-orange-900/30', textColor: 'text-orange-300', titleColor: 'text-orange-200', standardAllocation: 7 },
    { key: 'casualLeave', label: 'Casual Leave', bgColor: 'bg-green-900/30', textColor: 'text-green-300', titleColor: 'text-green-200', standardAllocation: 7 },
    { key: 'leave in-lieu', label: 'Leave in-lieu', bgColor: 'bg-yellow-900/30', textColor: 'text-yellow-300', titleColor: 'text-yellow-200', standardAllocation: 0 },
    { key: 'annualLeave', label: 'Annual Leave', bgColor: 'bg-yellow-900/30', textColor: 'text-yellow-300', titleColor: 'text-yellow-200', standardAllocation: 14 },
    { key: 'maternityLeave', label: 'Maternity Leave', bgColor: 'bg-pink-900/30', textColor: 'text-pink-300', titleColor: 'text-pink-200', gender: 'female', standardAllocation: 84 },
    { key: 'shortLeave', label: 'Short Leave', bgColor: 'bg-red-900/30', textColor: 'text-red-300', titleColor: 'text-red-200', standardAllocation: 12 },
    { key: 'paternityLeave', label: 'Paternity Leave', bgColor: 'bg-indigo-900/30', textColor: 'text-indigo-300', titleColor: 'text-indigo-200', gender: 'male', standardAllocation: 3 },
    { key: 'other', label: 'Other', bgColor: 'bg-gray-900/30', textColor: 'text-gray-300', titleColor: 'text-gray-200', standardAllocation: 0 }
];

// Helper functions
export const getFilteredLeaveTypes = (gender) => {
    return LEAVE_TYPES.filter(leaveType => {
        if (leaveType.gender) {
            return leaveType.gender === gender;
        }
        return true;
    });
};

export const getFilteredLeaveBalanceTypes = (gender) => {
    return LEAVE_BALANCE_TYPES.filter(type => {
        if (type.gender) {
            return type.gender === gender;
        }
        return true;
    });
};

export const getLeaveTypeKey = (displayName) => {
    return LEAVE_TYPE_MAP[displayName] || displayName.toLowerCase().replace(' ', '');
};

export const validateLeaveType = (leaveType, userGender) => {
    const typeConfig = LEAVE_TYPES.find(type => type.key === leaveType);
    if (!typeConfig) {
        throw new Error(`Invalid leave type: ${leaveType}`);
    }

    if (typeConfig.gender && typeConfig.gender !== userGender) {
        const leaveName = typeConfig.label;
        throw new Error(`${leaveName} is only available for ${typeConfig.gender} employees`);
    }

    return true;
};

// Helper function to get the proper allocation for annual leave based on start date
// Annual leave allocation schedule:
// January 1 – March 31: 14 days
// April 1 – June 30: 10 days
// July 1 – September 30: 7 days
// October 1 – December 31: 0 days
export const getAnnualLeaveAllocation = (startDate) => {
    if (!startDate) return 14; // Default for new employees

    const currentDate = new Date();
    const currentMonth = currentDate.getMonth(); // 0-11 (Jan-Dec)

    // Updated annual leave allocation based on quarter
    if (currentMonth >= 3 && currentMonth <= 5) { // Apr-Jun
        return 10;
    } else if (currentMonth >= 6 && currentMonth <= 8) { // Jul-Sep
        return 7;
    } else if (currentMonth >= 9) { // Oct-Dec
        return 0; // Updated from 4 to 0 days
    }

    return 14; // Jan-Mar
};

// Helper function to get the total allocation for a leave type
export const getLeaveAllocation = (leaveType, userData) => {
    // First check if user has custom allocations set by admin
    if (userData?.leaveAllocations && userData.leaveAllocations[leaveType] !== undefined) {
        return userData.leaveAllocations[leaveType];
    }

    const typeConfig = LEAVE_BALANCE_TYPES.find(type => type.key === leaveType);
    if (!typeConfig) return 0;

    // Special case for annual leave - depends on start date (only if no custom allocation)
    if (leaveType === 'annualLeave') {
        return getAnnualLeaveAllocation(userData?.createdAt);
    }

    return typeConfig.standardAllocation;
};