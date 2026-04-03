import React, { useState, useEffect, useMemo } from 'react';
import {
    getFirestore,
    collection,
    onSnapshot,
    addDoc,
    updateDoc,
    deleteDoc,
    doc,
    query,
    orderBy,
} from 'firebase/firestore';
import { app } from '../lib/firebase-client';
import { useAuth } from '../context/AuthContext';

const db = getFirestore(app);

// Holiday type definitions
const HOLIDAY_TYPES = [
    { value: 'company',     label: 'Company Holiday',      color: '#411e75', bg: 'bg-purple-900',  text: 'text-purple-200',  dot: 'bg-purple-400' },
    { value: 'mercantile',  label: 'Mercantile Holiday',   color: '#c6a876', bg: 'bg-amber-900',   text: 'text-amber-200',   dot: 'bg-amber-400'  },
    { value: 'poya',        label: 'Poya Day',             color: '#b8860b', bg: 'bg-yellow-900',  text: 'text-yellow-200',  dot: 'bg-yellow-400' },
    { value: 'important',   label: 'Important Day',        color: '#1d6fa4', bg: 'bg-blue-900',    text: 'text-blue-200',    dot: 'bg-blue-400'   },
];

const TYPE_MAP = {};
HOLIDAY_TYPES.forEach(t => { TYPE_MAP[t.value] = t; });

const DAYS_OF_WEEK = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
];

function getDaysInMonth(year, month) {
    return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfMonth(year, month) {
    return new Date(year, month, 1).getDay();
}

function toDateKey(year, month, day) {
    return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function parseDate(dateStr) {
    // dateStr is "YYYY-MM-DD"
    const [y, m, d] = dateStr.split('-').map(Number);
    return { year: y, month: m - 1, day: d };
}

export default function CalendarView() {
    const { userData } = useAuth();
    const today = new Date();

    const [currentYear, setCurrentYear] = useState(today.getFullYear());
    const [currentMonth, setCurrentMonth] = useState(today.getMonth());
    const [holidays, setHolidays] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedDay, setSelectedDay] = useState(null); // { year, month, day }
    const [viewMode, setViewMode] = useState('month'); // 'month' | 'list'
    const [listFilter, setListFilter] = useState('all');

    // Add/Edit modal state
    const [showModal, setShowModal] = useState(false);
    const [editingHoliday, setEditingHoliday] = useState(null);
    const [formData, setFormData] = useState({
        name: '',
        date: '',
        type: 'mercantile',
        description: '',
        recurring: false,
    });
    const [formError, setFormError] = useState('');
    const [saving, setSaving] = useState(false);
    const [deleteConfirm, setDeleteConfirm] = useState(null);

    const isAdminOrHR = userData?.role === 'Admin' || userData?.role === 'Manager HR';

    // Fetch holidays from Firestore
    useEffect(() => {
        const q = query(collection(db, 'holidays'), orderBy('date', 'asc'));
        const unsub = onSnapshot(q, (snap) => {
            setHolidays(snap.docs.map(d => ({ id: d.id, ...d.data() })));
            setLoading(false);
        }, (err) => {
            console.error('Error loading holidays:', err);
            setLoading(false);
        });
        return () => unsub();
    }, []);

    // Build a map: dateKey -> [holiday, ...]
    const holidayMap = useMemo(() => {
        const map = {};
        holidays.forEach(h => {
            if (!h.date) return;
            // Support recurring: show every year on same month+day
            if (h.recurring) {
                // Add for all years we might display (current ± 2)
                for (let y = currentYear - 2; y <= currentYear + 2; y++) {
                    const parts = h.date.split('-');
                    const key = `${y}-${parts[1]}-${parts[2]}`;
                    if (!map[key]) map[key] = [];
                    map[key].push(h);
                }
            } else {
                if (!map[h.date]) map[h.date] = [];
                map[h.date].push(h);
            }
        });
        return map;
    }, [holidays, currentYear]);

    // Holidays for current month (for the calendar grid)
    const currentMonthHolidays = useMemo(() => {
        const prefix = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-`;
        const result = {};
        Object.entries(holidayMap).forEach(([key, hs]) => {
            if (key.startsWith(prefix)) {
                result[key] = hs;
            }
        });
        return result;
    }, [holidayMap, currentYear, currentMonth]);

    // Holidays for list view (filtered by year, with optional type filter)
    const listHolidays = useMemo(() => {
        const yearStr = `${currentYear}-`;
        return Object.entries(holidayMap)
            .filter(([key]) => key.startsWith(yearStr))
            .flatMap(([key, hs]) => hs.map(h => ({ ...h, _key: key })))
            .filter(h => listFilter === 'all' || h.type === listFilter)
            .sort((a, b) => a._key.localeCompare(b._key));
    }, [holidayMap, currentYear, listFilter]);

    // Holidays for selected day
    const selectedDayHolidays = useMemo(() => {
        if (!selectedDay) return [];
        const key = toDateKey(selectedDay.year, selectedDay.month, selectedDay.day);
        return holidayMap[key] || [];
    }, [selectedDay, holidayMap]);

    function prevMonth() {
        if (currentMonth === 0) { setCurrentMonth(11); setCurrentYear(y => y - 1); }
        else setCurrentMonth(m => m - 1);
        setSelectedDay(null);
    }

    function nextMonth() {
        if (currentMonth === 11) { setCurrentMonth(0); setCurrentYear(y => y + 1); }
        else setCurrentMonth(m => m + 1);
        setSelectedDay(null);
    }

    function goToToday() {
        setCurrentYear(today.getFullYear());
        setCurrentMonth(today.getMonth());
        setSelectedDay({ year: today.getFullYear(), month: today.getMonth(), day: today.getDate() });
    }

    function openAddModal(dateStr) {
        setEditingHoliday(null);
        setFormData({ name: '', date: dateStr || '', type: 'mercantile', description: '', recurring: false });
        setFormError('');
        setShowModal(true);
    }

    function openEditModal(holiday) {
        setEditingHoliday(holiday);
        setFormData({
            name: holiday.name || '',
            date: holiday.date || '',
            type: holiday.type || 'mercantile',
            description: holiday.description || '',
            recurring: holiday.recurring || false,
        });
        setFormError('');
        setShowModal(true);
    }

    async function saveHoliday() {
        if (!formData.name.trim()) { setFormError('Name is required.'); return; }
        if (!formData.date) { setFormError('Date is required.'); return; }
        setSaving(true);
        setFormError('');
        try {
            const payload = {
                name: formData.name.trim(),
                date: formData.date,
                type: formData.type,
                description: formData.description.trim(),
                recurring: formData.recurring,
                updatedBy: userData?.uid || '',
                updatedAt: new Date().toISOString(),
            };
            if (editingHoliday) {
                await updateDoc(doc(db, 'holidays', editingHoliday.id), payload);
            } else {
                payload.createdBy = userData?.uid || '';
                payload.createdAt = new Date().toISOString();
                await addDoc(collection(db, 'holidays'), payload);
            }
            setShowModal(false);
        } catch (e) {
            setFormError('Failed to save: ' + e.message);
        }
        setSaving(false);
    }

    async function confirmDelete(holiday) {
        try {
            await deleteDoc(doc(db, 'holidays', holiday.id));
        } catch (e) {
            console.error('Delete failed:', e);
        }
        setDeleteConfirm(null);
    }

    // --- Render helpers ---

    function renderLegend() {
        return (
            <div className="flex flex-wrap gap-3 mt-2">
                {HOLIDAY_TYPES.map(t => (
                    <div key={t.value} className="flex items-center gap-1.5 text-xs text-slate-400">
                        <span className={`w-2.5 h-2.5 rounded-full ${t.dot}`}></span>
                        {t.label}
                    </div>
                ))}
                <div className="flex items-center gap-1.5 text-xs text-slate-400">
                    <span className="w-2.5 h-2.5 rounded-full bg-slate-600"></span>
                    Sunday (non-working)
                </div>
            </div>
        );
    }

    function renderCalendarGrid() {
        const daysInMonth = getDaysInMonth(currentYear, currentMonth);
        const firstDay = getFirstDayOfMonth(currentYear, currentMonth);
        const cells = [];

        // Empty cells before first day
        for (let i = 0; i < firstDay; i++) {
            cells.push(<div key={`empty-${i}`} className="h-24 border border-gray-800 bg-card rounded"></div>);
        }

        for (let day = 1; day <= daysInMonth; day++) {
            const key = toDateKey(currentYear, currentMonth, day);
            const dayHolidays = holidayMap[key] || [];
            const isToday = today.getFullYear() === currentYear && today.getMonth() === currentMonth && today.getDate() === day;
            const isSunday = new Date(currentYear, currentMonth, day).getDay() === 0;
            const isSaturday = new Date(currentYear, currentMonth, day).getDay() === 6;
            const isSelected = selectedDay?.year === currentYear && selectedDay?.month === currentMonth && selectedDay?.day === day;

            cells.push(
                <div
                    key={day}
                    onClick={() => setSelectedDay({ year: currentYear, month: currentMonth, day })}
                    className={`h-24 border rounded p-1 cursor-pointer transition-colors overflow-hidden
                        ${isSunday ? 'border-gray-700 bg-gray-900' : 'border-gray-800 bg-card'}
                        ${isSelected ? 'ring-2 ring-[#c6a876]' : ''}
                        hover:border-[#c6a876]`}
                >
                    <div className="flex justify-between items-start">
                        <span className={`text-sm font-medium leading-none
                            ${isToday ? 'bg-[#411e75] text-white rounded-full w-6 h-6 flex items-center justify-center text-xs' : ''}
                            ${isSunday ? 'text-slate-500' : 'text-slate-200'}
                            ${isSaturday && !isToday ? 'text-amber-400' : ''}`}>
                            {isToday ? <span>{day}</span> : day}
                        </span>
                        {isAdminOrHR && (
                            <button
                                onClick={(e) => { e.stopPropagation(); openAddModal(key); }}
                                className="text-slate-600 hover:text-[#c6a876] text-xs leading-none opacity-0 group-hover:opacity-100 transition-opacity"
                                title="Add holiday"
                            >+</button>
                        )}
                    </div>
                    <div className="mt-1 space-y-0.5 overflow-hidden">
                        {dayHolidays.slice(0, 2).map((h, i) => {
                            const t = TYPE_MAP[h.type] || TYPE_MAP['important'];
                            return (
                                <div key={i} className={`text-[10px] leading-tight px-1 rounded truncate ${t.bg} ${t.text}`}>
                                    {h.name}
                                </div>
                            );
                        })}
                        {dayHolidays.length > 2 && (
                            <div className="text-[10px] text-slate-500">+{dayHolidays.length - 2} more</div>
                        )}
                    </div>
                </div>
            );
        }

        return (
            <div className="mt-2">
                <div className="grid grid-cols-7 mb-1">
                    {DAYS_OF_WEEK.map(d => (
                        <div key={d} className={`text-center text-xs font-medium py-2 ${d === 'Sun' ? 'text-slate-500' : d === 'Sat' ? 'text-amber-400' : 'text-slate-400'}`}>{d}</div>
                    ))}
                </div>
                <div className="grid grid-cols-7 gap-1">
                    {cells}
                </div>
            </div>
        );
    }

    function renderSelectedDayPanel() {
        if (!selectedDay) return null;
        const key = toDateKey(selectedDay.year, selectedDay.month, selectedDay.day);
        const hs = holidayMap[key] || [];
        const dateLabel = new Date(selectedDay.year, selectedDay.month, selectedDay.day)
            .toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

        return (
            <div className="mt-4 bg-card rounded-lg p-4 border border-gray-700">
                <div className="flex justify-between items-center mb-3">
                    <h3 className="text-sm font-semibold text-slate-200">{dateLabel}</h3>
                    <div className="flex gap-2">
                        {isAdminOrHR && (
                            <button
                                onClick={() => openAddModal(key)}
                                className="text-xs px-3 py-1 rounded bg-[#411e75] text-white hover:bg-purple-700 transition-colors"
                            >
                                + Add
                            </button>
                        )}
                        <button onClick={() => setSelectedDay(null)} className="text-slate-500 hover:text-slate-300 text-xs">
                            Close
                        </button>
                    </div>
                </div>
                {hs.length === 0 ? (
                    <p className="text-xs text-slate-500">No events on this day.</p>
                ) : (
                    <div className="space-y-2">
                        {hs.map(h => {
                            const t = TYPE_MAP[h.type] || TYPE_MAP['important'];
                            return (
                                <div key={h.id} className={`rounded p-3 ${t.bg} border border-opacity-30`}>
                                    <div className="flex justify-between items-start">
                                        <div>
                                            <span className={`text-sm font-semibold ${t.text}`}>{h.name}</span>
                                            {h.recurring && <span className="ml-2 text-[10px] bg-gray-700 text-gray-300 px-1 rounded">Recurring</span>}
                                            <div className={`text-xs mt-0.5 ${t.text} opacity-80`}>{t.label}</div>
                                            {h.description && <div className="text-xs text-slate-300 mt-1">{h.description}</div>}
                                        </div>
                                        {isAdminOrHR && (
                                            <div className="flex gap-2 ml-2">
                                                <button onClick={() => openEditModal(h)} className="text-[11px] text-slate-400 hover:text-white underline">Edit</button>
                                                <button onClick={() => setDeleteConfirm(h)} className="text-[11px] text-red-400 hover:text-red-300 underline">Delete</button>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        );
    }

    function renderListView() {
        return (
            <div className="mt-4">
                <div className="flex flex-wrap gap-2 mb-4">
                    {[{ value: 'all', label: 'All' }, ...HOLIDAY_TYPES].map(t => (
                        <button
                            key={t.value}
                            onClick={() => setListFilter(t.value)}
                            className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                                listFilter === t.value
                                    ? 'bg-[#411e75] border-[#411e75] text-white'
                                    : 'border-gray-700 text-slate-400 hover:border-[#c6a876] hover:text-white'
                            }`}
                        >
                            {t.label}
                        </button>
                    ))}
                </div>
                {listHolidays.length === 0 ? (
                    <div className="text-center py-12 text-slate-500">No holidays found for {currentYear}.</div>
                ) : (
                    <div className="space-y-2">
                        {listHolidays.map((h, i) => {
                            const t = TYPE_MAP[h.type] || TYPE_MAP['important'];
                            const { year, month, day } = parseDate(h._key);
                            const dateLabel = new Date(year, month, day)
                                .toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
                            return (
                                <div key={`${h.id}-${i}`} className="flex items-start justify-between bg-card border border-gray-800 rounded-lg px-4 py-3 hover:border-gray-700 transition-colors">
                                    <div className="flex items-start gap-3">
                                        <span className={`mt-1 w-2.5 h-2.5 rounded-full flex-shrink-0 ${t.dot}`}></span>
                                        <div>
                                            <div className="text-sm font-medium text-slate-200">{h.name}</div>
                                            <div className="text-xs text-slate-500 mt-0.5">
                                                {dateLabel} &middot; {t.label}
                                                {h.recurring && <span className="ml-2 bg-gray-700 text-gray-300 px-1 rounded text-[10px]">Recurring</span>}
                                            </div>
                                            {h.description && <div className="text-xs text-slate-400 mt-1">{h.description}</div>}
                                        </div>
                                    </div>
                                    {isAdminOrHR && (
                                        <div className="flex gap-3 ml-4 flex-shrink-0">
                                            <button onClick={() => openEditModal(h)} className="text-xs text-slate-400 hover:text-white underline">Edit</button>
                                            <button onClick={() => setDeleteConfirm(h)} className="text-xs text-red-400 hover:text-red-300 underline">Delete</button>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        );
    }

    function renderModal() {
        if (!showModal) return null;
        return (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-60">
                <div className="bg-card border border-gray-700 rounded-xl shadow-2xl w-full max-w-md mx-4 p-6">
                    <h2 className="text-lg font-semibold text-white mb-4">
                        {editingHoliday ? 'Edit Holiday / Event' : 'Add Holiday / Event'}
                    </h2>
                    <div className="space-y-4">
                        <div>
                            <label className="block text-xs text-slate-400 mb-1">Name *</label>
                            <input
                                type="text"
                                value={formData.name}
                                onChange={e => setFormData(f => ({ ...f, name: e.target.value }))}
                                className="w-full bg-muted border border-gray-700 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-[#c6a876]"
                                placeholder="e.g. Sinhala & Tamil New Year"
                            />
                        </div>
                        <div>
                            <label className="block text-xs text-slate-400 mb-1">Date *</label>
                            <input
                                type="date"
                                value={formData.date}
                                onChange={e => setFormData(f => ({ ...f, date: e.target.value }))}
                                className="w-full bg-muted border border-gray-700 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-[#c6a876]"
                            />
                        </div>
                        <div>
                            <label className="block text-xs text-slate-400 mb-1">Type *</label>
                            <select
                                value={formData.type}
                                onChange={e => setFormData(f => ({ ...f, type: e.target.value }))}
                                className="w-full bg-muted border border-gray-700 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-[#c6a876]"
                            >
                                {HOLIDAY_TYPES.map(t => (
                                    <option key={t.value} value={t.value}>{t.label}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs text-slate-400 mb-1">Description</label>
                            <textarea
                                value={formData.description}
                                onChange={e => setFormData(f => ({ ...f, description: e.target.value }))}
                                rows={2}
                                className="w-full bg-muted border border-gray-700 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-[#c6a876] resize-none"
                                placeholder="Optional description"
                            />
                        </div>
                        <div className="flex items-center gap-2">
                            <input
                                type="checkbox"
                                id="recurring"
                                checked={formData.recurring}
                                onChange={e => setFormData(f => ({ ...f, recurring: e.target.checked }))}
                                className="accent-[#411e75]"
                            />
                            <label htmlFor="recurring" className="text-sm text-slate-300">
                                Recurring annually (repeats every year on this date)
                            </label>
                        </div>
                        {formError && <div className="text-red-400 text-xs">{formError}</div>}
                    </div>
                    <div className="flex justify-end gap-3 mt-6">
                        <button
                            onClick={() => setShowModal(false)}
                            className="px-4 py-2 text-sm text-slate-400 hover:text-white transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={saveHoliday}
                            disabled={saving}
                            className="px-5 py-2 text-sm bg-[#411e75] text-white rounded hover:bg-purple-700 transition-colors disabled:opacity-50"
                        >
                            {saving ? 'Saving...' : editingHoliday ? 'Update' : 'Add'}
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    function renderDeleteConfirm() {
        if (!deleteConfirm) return null;
        return (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-60">
                <div className="bg-card border border-gray-700 rounded-xl shadow-2xl w-full max-w-sm mx-4 p-6">
                    <h2 className="text-base font-semibold text-white mb-2">Delete Holiday?</h2>
                    <p className="text-sm text-slate-400 mb-4">
                        Are you sure you want to delete <span className="text-white font-medium">{deleteConfirm.name}</span>? This cannot be undone.
                    </p>
                    <div className="flex justify-end gap-3">
                        <button onClick={() => setDeleteConfirm(null)} className="px-4 py-2 text-sm text-slate-400 hover:text-white">Cancel</button>
                        <button onClick={() => confirmDelete(deleteConfirm)} className="px-5 py-2 text-sm bg-red-700 text-white rounded hover:bg-red-600">Delete</button>
                    </div>
                </div>
            </div>
        );
    }

    // Upcoming holidays (next 5 from today)
    const upcomingHolidays = useMemo(() => {
        const todayKey = toDateKey(today.getFullYear(), today.getMonth(), today.getDate());
        return Object.entries(holidayMap)
            .filter(([key]) => key >= todayKey)
            .flatMap(([key, hs]) => hs.map(h => ({ ...h, _key: key })))
            .sort((a, b) => a._key.localeCompare(b._key))
            .slice(0, 5);
    }, [holidayMap, today]);

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                    <h1 className="text-2xl font-bold text-white">Company Calendar</h1>
                    <p className="text-sm text-slate-400 mt-0.5">Holidays, Poya days, and important events</p>
                </div>
                <div className="flex gap-2 flex-wrap">
                    {isAdminOrHR && (
                        <button
                            onClick={() => openAddModal('')}
                            className="px-4 py-2 text-sm bg-[#411e75] text-white rounded-lg hover:bg-purple-700 transition-colors"
                        >
                            + Add Holiday
                        </button>
                    )}
                    <button
                        onClick={goToToday}
                        className="px-4 py-2 text-sm border border-gray-700 text-slate-300 rounded-lg hover:border-[#c6a876] hover:text-white transition-colors"
                    >
                        Today
                    </button>
                    <div className="flex border border-gray-700 rounded-lg overflow-hidden">
                        <button
                            onClick={() => setViewMode('month')}
                            className={`px-3 py-2 text-xs font-medium transition-colors ${viewMode === 'month' ? 'bg-[#411e75] text-white' : 'text-slate-400 hover:text-white'}`}
                        >
                            Month
                        </button>
                        <button
                            onClick={() => setViewMode('list')}
                            className={`px-3 py-2 text-xs font-medium transition-colors ${viewMode === 'list' ? 'bg-[#411e75] text-white' : 'text-slate-400 hover:text-white'}`}
                        >
                            List
                        </button>
                    </div>
                </div>
            </div>

            {/* Upcoming holidays strip */}
            {upcomingHolidays.length > 0 && (
                <div className="bg-card border border-gray-800 rounded-lg p-4">
                    <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Upcoming</h3>
                    <div className="flex flex-wrap gap-2">
                        {upcomingHolidays.map((h, i) => {
                            const t = TYPE_MAP[h.type] || TYPE_MAP['important'];
                            const { year, month, day } = parseDate(h._key);
                            const dateLabel = new Date(year, month, day)
                                .toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                            const daysLeft = Math.round((new Date(year, month, day) - today) / 86400000);
                            return (
                                <div key={i} className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs ${t.bg} ${t.text}`}>
                                    <span className={`w-2 h-2 rounded-full ${t.dot}`}></span>
                                    <span className="font-medium">{h.name}</span>
                                    <span className="opacity-70">{dateLabel}</span>
                                    {daysLeft === 0 && <span className="bg-white bg-opacity-20 rounded-full px-1">Today</span>}
                                    {daysLeft === 1 && <span className="bg-white bg-opacity-20 rounded-full px-1">Tomorrow</span>}
                                    {daysLeft > 1 && <span className="opacity-60">in {daysLeft}d</span>}
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Main content */}
            <div className="bg-card border border-gray-800 rounded-lg p-4 sm:p-6">
                {/* Month navigation */}
                <div className="flex items-center justify-between mb-2">
                    <button onClick={prevMonth} className="text-slate-400 hover:text-white p-2 rounded-lg hover:bg-muted transition-colors">
                        <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                    </button>
                    <div className="text-center">
                        <h2 className="text-lg font-bold text-white">{MONTHS[currentMonth]} {currentYear}</h2>
                    </div>
                    <button onClick={nextMonth} className="text-slate-400 hover:text-white p-2 rounded-lg hover:bg-muted transition-colors">
                        <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                    </button>
                </div>

                {/* Year jump */}
                <div className="flex justify-center gap-2 mb-3">
                    <button onClick={() => setCurrentYear(y => y - 1)} className="text-xs text-slate-500 hover:text-slate-300">&larr; {currentYear - 1}</button>
                    <span className="text-xs text-slate-600">|</span>
                    <button onClick={() => setCurrentYear(y => y + 1)} className="text-xs text-slate-500 hover:text-slate-300">{currentYear + 1} &rarr;</button>
                </div>

                {renderLegend()}

                {loading ? (
                    <div className="text-center py-16 text-slate-500">Loading holidays...</div>
                ) : viewMode === 'month' ? (
                    <>
                        {renderCalendarGrid()}
                        {renderSelectedDayPanel()}
                    </>
                ) : (
                    renderListView()
                )}
            </div>

            {/* Summary stats */}
            {!loading && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {HOLIDAY_TYPES.map(t => {
                        const yearStr = `${currentYear}-`;
                        const count = Object.entries(holidayMap)
                            .filter(([key]) => key.startsWith(yearStr))
                            .flatMap(([, hs]) => hs)
                            .filter(h => h.type === t.value).length;
                        return (
                            <div key={t.value} className={`bg-card border border-gray-800 rounded-lg p-4`}>
                                <div className={`text-2xl font-bold ${t.text}`}>{count}</div>
                                <div className="text-xs text-slate-400 mt-1">{t.label}s</div>
                                <div className="text-[10px] text-slate-600">{currentYear}</div>
                            </div>
                        );
                    })}
                </div>
            )}

            {renderModal()}
            {renderDeleteConfirm()}
        </div>
    );
}
