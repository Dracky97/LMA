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

const auth = getAuth(app);
const db = getFirestore(app);

// Ensure auth is properly initialized
console.log('Firebase Auth initialized:', auth);
console.log('Firebase App:', app);

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

    const signup = async (name, email, password, department, managerId, employeeNumber = null, gender = null, designation = null, birthday = null, employeeStatus = 'probation', joinedDate = null) => {
        try {
            const userCredential = await createUserWithEmailAndPassword(auth, email, password);
            const newUser = userCredential.user;
            // Calculate prorated annual leave based on start date
            const currentDate = new Date();
            const currentMonth = currentDate.getMonth(); // 0-11 (Jan-Dec)

            // Prorated annual leave based on quarter
            let annualLeave = 14; // Default for Jan-Mar
            if (currentMonth >= 3 && currentMonth <= 5) { // Apr-Jun
                annualLeave = 10;
            } else if (currentMonth >= 6 && currentMonth <= 8) { // Jul-Sep
                annualLeave = 7;
            } else if (currentMonth >= 9) { // Oct-Dec
                annualLeave = 4;
            }

            // Set gender-specific leave balances
            let leaveBalance = {
                annualLeave,
                sickLeave: 7,
                casualLeave: 7,
                'leave in-lieu': 0,
                shortLeave: 12,
                other: 0
            };

            if (gender === 'female') {
                // Default maternity leave for first and second child
                leaveBalance = { ...leaveBalance, maternityLeave: 84 };
            } else if (gender === 'male') {
                leaveBalance = { ...leaveBalance, paternityLeave: 3 };
            }

            // Calculate next performance evaluation date (every 3 months from joined date)
            const evaluationDate = joinedDate ? new Date(joinedDate) : currentDate;
            evaluationDate.setMonth(evaluationDate.getMonth() + 3);

            return await setDoc(doc(db, 'users', newUser.uid), {
                name,
                email,
                role: 'Employee',
                isManager: false, // <-- New flag, only Admins can change this
                department,
                managerId: managerId || null,
                employeeNumber, // Add employee number field
                gender, // Add gender field
                designation, // Add designation field
                employeeStatus, // Add employee status field (permanent/probation/intern)
                joinedDate: joinedDate || currentDate.toISOString(), // Add joined date field
                nextEvaluationDate: evaluationDate.toISOString(), // Add next evaluation date
                personalDetails: { phone: '', address: '', dob: birthday || '' },
                education: [],
                qualifications: [],
                socialMedia: { linkedin: '', twitter: '' },
                leaveBalance,
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
            throw new Error(`Logout failed: ${error.message}`);
        }
    };

    const resetPassword = async (email) => {
        try {
            await sendPasswordResetEmail(auth, email);
            return { success: true, message: 'Password reset email sent successfully!' };
        } catch (error) {
            console.error("Error sending password reset email:", error);
            throw new Error(`Password reset failed: ${error.message}`);
        }
    };

    const changePassword = async (currentPassword, newPassword) => {
        try {
            // If no parameters provided, send password reset email
            if (!currentPassword && !newPassword) {
                console.log('=== PASSWORD RESET EMAIL ===');

                if (!user || !user.email) {
                    throw new Error('No user is currently signed in');
                }

                console.log('📧 Sending password reset email to:', user.email);

                await sendPasswordResetEmail(auth, user.email);
                console.log('✅ Password reset email sent successfully');

                return {
                    success: true,
                    message: 'Password reset link has been sent to your email address. Please check your email and follow the instructions to reset your password.'
                };
            }

            // Original password change logic (if needed for admin purposes)
            console.log('=== DIRECT PASSWORD CHANGE ===');

            if (!user) {
                throw new Error('No user is currently signed in');
            }

            if (!user.email) {
                throw new Error('User email not available');
            }

            console.log('🔐 Attempting direct password change for:', user.email);

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
                throw new Error(`Password operation failed: ${error.message}`);
            }
        }
    };

    const value = { user, userData, loading, signup, login, logout, resetPassword, changePassword };
    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => useContext(AuthContext);
