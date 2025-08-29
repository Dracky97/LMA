import React, { createContext, useContext, useState, useEffect } from 'react';
import { getAuth, onAuthStateChanged, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { getFirestore, doc, setDoc, onSnapshot } from 'firebase/firestore';
import { app } from '../lib/firebase-client';

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

    const signup = async (name, email, password, department, managerId, employeeNumber = null) => {
        try {
            const userCredential = await createUserWithEmailAndPassword(auth, email, password);
            const newUser = userCredential.user;
            return await setDoc(doc(db, 'users', newUser.uid), {
                name,
                email,
                role: 'Employee',
                isManager: false, // <-- New flag, only Admins can change this
                department,
                managerId: managerId || null,
                employeeNumber, // Add employee number field
                leaveBalance: { annual: 14, sick: 7, casual: 5 },
                personalDetails: { phone: '', address: '', dob: '' },
                education: [],
                qualifications: [],
                socialMedia: { linkedin: '', twitter: '' },
                createdAt: new Date(),
            });
        } catch (error) {
            console.error("Error signing up:", error);
            throw new Error(`Signup failed: ${error.message}`);
        }
    };

    const login = async (email, password) => {
        try {
            return await signInWithEmailAndPassword(auth, email, password);
        } catch (error) {
            console.error("Error logging in:", error);
            throw new Error(`Login failed: ${error.message}`);
        }
    };
    
    const logout = async () => {
        try {
            return await signOut(auth);
        } catch (error) {
            console.error("Error logging out:", error);
            throw new Error(`Logout failed: ${error.message}`);
        }
    };

    const value = { user, userData, loading, signup, login, logout };
    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => useContext(AuthContext);
