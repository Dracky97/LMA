# Leave Report - All Employees Feature

## Overview
Enhanced the leave report functionality in the HR Manager Dashboard to display comprehensive leave information for **all employees** in the company for a selected date range, not just those who have taken leave.

## Changes Made

### 1. Enhanced Report Generation (`generateMonthlyReport` function)

#### New Data Structure: `employeeDetails`
The report now includes a comprehensive `employeeDetails` array that contains information for **every employee** in the company:

```javascript
employeeDetails: [
  {
    id: userId,
    employeeNumber: 'EMP001',
    name: 'John Doe',
    department: 'IT',
    designation: 'Software Engineer',
    leaveBalance: {
      'Annual Leave': 15.0,
      'Casual Leave': 7.0,
      'Medical Leave': 21.0
    },
    requests: [...], // All leave requests in the date range
    totalLeaveDays: 5.0, // Total approved leave days in period
    approvedRequests: 2,
    pendingRequests: 0,
    rejectedRequests: 0
  },
  // ... for all employees
]
```

#### Enhanced Summary Statistics
Added new summary metrics:
- `totalEmployees`: Total number of employees in the company
- `employeesWithLeave`: Number of employees who took leave in the selected period

### 2. Enhanced Report View UI

#### New Summary Cards
- Total Requests
- Approved Requests
- Rejected Requests
- Pending Requests
- **Total Employees** (new)
- **Employees with Leave** (new)

#### Department Statistics Table
Shows leave request statistics broken down by department:
- Total requests per department
- Approved, Rejected, and Pending counts

#### Leave Type Statistics Table
Shows leave request statistics broken down by leave type:
- Total requests per leave type
- Approved, Rejected, and Pending counts

#### **All Employees Leave Report Table** (NEW)
Comprehensive table showing **all employees** with the following columns:

| Column | Description |
|--------|-------------|
| Emp # | Employee Number |
| Name | Employee Name |
| Department | Employee Department |
| Designation | Employee Designation |
| Leave Days | Total approved leave days taken in the period |
| Requests | Request counts (Approved / Pending / Rejected) |
| Annual | Current Annual Leave balance |
| Casual | Current Casual Leave balance |
| Medical | Current Medical Leave balance |

**Features:**
- Employees with leave in the period are highlighted with a blue background
- Negative leave balances are shown in red
- Sorted by department, then by name
- Shows "-" for employees with no leave activity
- Request format: `Approved / PendingP / RejectedR`

#### Employees with Negative Balance Section
A warning section that highlights employees who have negative leave balances:
- Shows employee name, ID, and department
- Lists all leave types with negative balances
- Displayed in red for visibility

### 3. Enhanced PDF Export

The PDF export has been updated to include all the new information:

#### Changes:
- **Landscape orientation** for better table display
- Enhanced summary section with total employees and employees with leave
- Department statistics with full breakdown
- Leave type statistics with full breakdown
- **Complete employee table** with all employees and their leave details
- Employees with negative balance section

#### PDF Structure:
1. Title and date range
2. Summary statistics
3. Department statistics
4. Leave type statistics
5. All employees leave report table
6. Employees with negative balance (if any)

## Usage

### Generating Reports

1. Navigate to the **Reports** tab in the HR Manager Dashboard
2. Choose report type:
   - **Current Month**: Generates report for the current month (25th to 25th)
   - **Custom Range**: Select custom start and end dates

### Viewing Reports

The report view displays:
1. Summary cards at the top
2. Department and leave type statistics
3. **Complete employee list** with leave details for the selected period
4. Warning section for employees with negative balances

### Exporting to PDF

Click the "Download PDF" button to export the complete report including:
- All summary statistics
- All employees with their leave information
- Negative balance warnings

## Benefits

1. **Complete Visibility**: See all employees, not just those with leave requests
2. **Easy Comparison**: Compare leave patterns across all employees
3. **Balance Monitoring**: Quickly identify employees with negative balances
4. **Department Analysis**: Understand leave distribution by department
5. **Comprehensive Records**: Export complete reports for record-keeping
6. **Proactive Management**: Identify employees who haven't taken leave

## Technical Details

### Data Flow
1. Fetch all users from Firestore
2. Fetch all leave requests for the date range
3. For each employee:
   - Find their leave requests in the date range
   - Calculate total approved leave days
   - Get current leave balances
   - Count requests by status
4. Sort employees by department and name
5. Display in comprehensive table format

### Performance Considerations
- All data is fetched once during report generation
- Sorting and filtering happen in memory
- PDF generation uses landscape orientation for better readability

## Future Enhancements

Potential improvements:
1. Add filtering options (by department, by leave status)
2. Add search functionality in the employee table
3. Export to Excel format
4. Add charts and visualizations
5. Add year-over-year comparisons
6. Add employee leave trends
