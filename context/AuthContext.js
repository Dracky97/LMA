import React, { createContext, useContext, useState, useEffect } from 'react';
import {
    getAuth,
    onAuthStateChanged,
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    signOut,
    sendPasswordResetEmail,
    updatePassword,
    reauthenticateWithCredential,
    EmailAuthProvider,
    connectAuthEmulator
} from 'firebase/auth';
import { getFirestore, doc, setDoc, onSnapshot } from 'firebase/firestore';
import { app } from '../lib/firebase-client';
import { LEAVE_CONFIG, calculateLeaveEntitlements } from '../lib/leavePolicy';

const auth = getAuth(app);
const db = getFirestore(app);


const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [userData, setUserData] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let unsubSnapshot;
        
        const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
            // Clean up previous snapshot listener if it exists
            if (unsubSnapshot) {
                unsubSnapshot();
            }
            
            setUser(currentUser);
            if (currentUser) {
                // Check if session has expired (30 minutes)
                const loginTime = localStorage.getItem('loginTime');
                if (loginTime) {
                    const now = new Date().getTime();
                    const loginTimeMs = parseInt(loginTime);
                    const thirtyMinutesInMs = 30 * 60 * 1000;
                    
                    if (now - loginTimeMs > thirtyMinutesInMs) {
                        // Session expired, logout user
                        signOut(auth);
                        localStorage.removeItem('loginTime');
                        return;
                    }
                }
                
                const userDocRef = doc(db, 'users', currentUser.uid);
                unsubSnapshot = onSnapshot(userDocRef, (docSnap) => {
                    if (docSnap.exists()) {
                        const newData = { uid: currentUser.uid, ...docSnap.data() };
                        setUserData(prevData => {
                            // Only update if data has actually changed
                            if (JSON.stringify(prevData) !== JSON.stringify(newData)) {
                                return newData;
                            }
                            return prevData;
                        });
                    } else {
                        setUserData(null);
                    }
                    setLoading(false);
                }, (error) => {
                    console.error("Error fetching user data:", error);
                    setLoading(false);
                });
            } else {
                setUserData(null);
                setLoading(false);
            }
        });
        
        // Clean up both listeners on unmount
        return () => {
            unsubscribe();
            if (unsubSnapshot) {
                unsubSnapshot();
            }
        };
    }, [auth, db]);

    const signup = async (name, email, password, department, managerId, employeeNumber = null, gender = null, designation = null, birthday = null, employeeStatus = 'probation', joinedDate = null, role = 'Employee') => {
        try {
            const userCredential = await createUserWithEmailAndPassword(auth, email, password);
            const newUser = userCredential.user;

            const currentDate = new Date();

            // Calculate next performance evaluation date (every 3 months from joined date or current date)
            const evaluationStartDate = joinedDate ? new Date(joinedDate) : currentDate;
            const evaluationDate = new Date(evaluationStartDate);
            evaluationDate.setMonth(evaluationDate.getMonth() + 3);

            // Calculate leave entitlements based on the effective join date.
            // The condition (A, B, or C) is determined by how the join year compares
            // to the current calendar year:
            //   Condition A (current year):   Annual=0, Sick=7, Casual=0.5×months
            //   Condition B (previous year):  Annual=Q1-14/Q2-10/Q3-7/Q4-4, Sick=7, Casual=7
            //   Condition C (2+ years ago):   Annual=14, Sick=7, Casual=7
            //   Short Leave = 3 hours/month for all conditions (monthly reset, not annual)
            const effectiveJoinDate = joinedDate || currentDate.toISOString();
            let entitlements;
            try {
                entitlements = calculateLeaveEntitlements(effectiveJoinDate, currentDate.getFullYear());
            } catch (calcError) {
                console.warn('[signup] Could not calculate leave entitlements, using safe defaults:', calcError.message);
                entitlements = {
                    annualLeave: 0,
                    sickLeave: LEAVE_CONFIG.SICK_LEAVE_STANDARD,
                    casualLeave: 0,
                    condition: 'A',
                };
            }

            const leaveBalance = {
                annualLeave: entitlements.annualLeave,
                sickLeave:   entitlements.sickLeave,
                casualLeave: entitlements.casualLeave,
                shortLeave:  LEAVE_CONFIG.SHORT_LEAVE_MONTHLY_LIMIT, // 3 hours (resets monthly)
            };
            const leaveAllocations = {
                // Stores the entitlement ceiling used by the Jan 1 annual reset function.
                // shortLeave is intentionally omitted — it resets monthly automatically.
                annualLeave: entitlements.annualLeave,
                sickLeave:   entitlements.sickLeave,
                casualLeave: entitlements.casualLeave,
            };

            const assignedRole = role || 'Employee';
            const managerRoles = ['Admin', 'Manager HR', 'HR Manager', 'CEO', 'CMO', 'CFO', 'COO', 'Registrar', 'Head of Academic', 'Head - Student Support', 'Manager IT', 'Finance Manager', 'Manager - Marketing & Student Enrolment', 'Manager - Digital Marketing', 'Sales Manager', 'Academic - Senior Lecturer'];
            const isManagerRole = managerRoles.some(r => assignedRole.includes(r) || assignedRole.startsWith('Manager') || assignedRole.startsWith('Head'));

            return await setDoc(doc(db, 'users', newUser.uid), {
                name,
                email,
                role: assignedRole,
                isManager: isManagerRole,
                department,
                managerId: managerId || null,
                employeeNumber,
                gender,
                designation,
                employeeStatus,
                joinedDate: joinedDate || currentDate.toISOString(),
                nextEvaluationDate: evaluationDate.toISOString(),
                personalDetails: { phone: '', address: '', dob: birthday || '' },
                education: [],
                qualifications: [],
                socialMedia: { linkedin: '', twitter: '' },
                leaveBalance,
                leaveAllocations,
                leaveCondition: entitlements.condition || 'A',
                leaveConditionSetAt: currentDate.toISOString(),
                leaveConditionSetBy: 'Automated System (Condition ' + (entitlements.condition || 'A') + ')',
                createdAt: currentDate,
            });
        } catch (error) {
            console.error("Error signing up:", error);
            throw new Error(`Signup failed: ${error.message}`);
        }
    };

    const login = async (email, password) => {
        try {
            const userCredential = await signInWithEmailAndPassword(auth, email, password);
            // Set login time in localStorage for session expiration
            localStorage.setItem('loginTime', new Date().getTime().toString());
            return userCredential;
        } catch (error) {
            console.error("Error logging in:", error);
            throw new Error(`Login failed: ${error.message}`);
        }
    };
    
    const logout = async () => {
        try {
            await signOut(auth);
            // Remove login time from localStorage
      
            localStorage.removeItem('loginTime');
            // Redirect to login page after logout
            if (typeof window !== 'undefined') {
                window.location.href = '/';
            }
        } catch (error) {
            console.error("Error logging out:", error);
            throw new Error('Logout failed: ' + error.message);
        }
    };

    const resetPassword = async (email) => {
        try {
            await sendPasswordResetEmail(auth, email);
            return { success: true, message: 'Password reset email sent successfully!' };
        } catch (error) {
            console.error("Error sending password reset email:", error);
            throw new Error('Password reset failed: ' + error.message);
        }
    };

    const changePassword = async (currentPassword, newPassword) => {
        try {
            // If no parameters provided, send password reset email
            if (!currentPassword && !newPassword) {
                if (!user || !user.email) {
                    throw new Error('No user is currently signed in');
                }

                await sendPasswordResetEmail(auth, user.email);

                return {
                    success: true,
                    message: 'Password reset link has been sent to your email address. Please check your email and follow the instructions to reset your password.'
                };
            }

            if (!user) {
                throw new Error('No user is currently signed in');
            }

            if (!user.email) {
                throw new Error('User email not available');
            }

            // Re-authenticate user before changing password
            const credential = EmailAuthProvider.credential(user.email, currentPassword);
            await reauthenticateWithCredential(user, credential);

            // Update password
            await updatePassword(user, newPassword);

            return { success: true, message: 'Password updated successfully!' };
        } catch (error) {
            console.error('Password operation error:', error);

            // Handle specific Firebase Auth errors
            if (error.code === 'auth/user-not-found') {
                throw new Error('No user found with this email address');
            } else if (error.code === 'auth/invalid-email') {
                throw new Error('Invalid email address');
            } else if (error.code === 'auth/network-request-failed') {
                throw new Error('Network error. Please check your internet connection');
            } else {
                throw new Error('Password operation failed: ' + error.message);
            }
        }
    };

    const value = { user, userData, loading, signup, login, logout, resetPassword, changePassword };
    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => useContext(AuthContext);
