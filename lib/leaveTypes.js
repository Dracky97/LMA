// Shared leave types configuration
export const LEAVE_TYPES = [
    { value: 'Sick Leave', label: 'Sick Leave', key: 'sickLeave' },
    { value: 'Casual Leave', label: 'Casual Leave', key: 'casualLeave' },
    { value: 'Leave in-lieu', label: 'Leave in-lieu', key: 'leave in-lieu' },
    { value: 'Annual Leave', label: 'Annual Leave', key: 'annualLeave' },
    { value: 'Short Leave', label: 'Short Leave', key: 'shortLeave' },
    { value: 'Maternity Leave', label: 'Maternity Leave', key: 'maternityLeave', gender: 'female' },
    { value: 'Paternity Leave', label: 'Paternity Leave', key: 'paternityLeave', gender: 'male' },
    { value: 'Other', label: 'Other', key: 'other' }
];

// Leave type mapping from display name to internal key
export const LEAVE_TYPE_MAP = {
    'Sick Leave': 'sickLeave',
    'Casual Leave': 'casualLeave',
    'Leave in-lieu': 'leave in-lieu',
    'Annual Leave': 'annualLeave',
    'Short Leave': 'shortLeave',
    'Maternity Leave': 'maternityLeave',
    'Paternity Leave': 'paternityLeave',
    'Other': 'other'
};

// Leave balance display configuration with styling only (no default allocations)
export const LEAVE_BALANCE_TYPES = [
    // Unique, high-contrast colors per type (no purple), tuned for dark theme
    { key: 'annualLeave',    label: 'Annual Leave',    bgColor: 'bg-amber-900/30',   textColor: 'text-amber-300',   titleColor: 'text-amber-200' },
    { key: 'casualLeave',    label: 'Casual Leave',    bgColor: 'bg-emerald-900/30', textColor: 'text-emerald-300', titleColor: 'text-emerald-200' },
    { key: 'sickLeave',      label: 'Sick Leave',      bgColor: 'bg-orange-900/30',  textColor: 'text-orange-300',  titleColor: 'text-orange-200' },
    { key: 'leave in-lieu',  label: 'Leave in-lieu',   bgColor: 'bg-sky-900/30',    textColor: 'text-sky-300',    titleColor: 'text-sky-200' },
    { key: 'shortLeave',     label: 'Short Leave',     bgColor: 'bg-indigo-900/30', textColor: 'text-indigo-300', titleColor: 'text-indigo-200' },
    { key: 'other',          label: 'Other',           bgColor: 'bg-slate-800/50',   textColor: 'text-slate-300',   titleColor: 'text-slate-200' },
    { key: 'maternityLeave', label: 'Maternity Leave', bgColor: 'bg-pink-900/30',    textColor: 'text-pink-300',    titleColor: 'text-pink-200', gender: 'female' },
    { key: 'paternityLeave', label: 'Paternity Leave', bgColor: 'bg-cyan-900/30',     textColor: 'text-cyan-300',     titleColor: 'text-cyan-200',  gender: 'male' }
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

