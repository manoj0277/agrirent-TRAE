

import React, { createContext, useState, useContext, ReactNode, useMemo, useEffect } from 'react';
import { User, UserRole } from '../types';
import { useToast } from './ToastContext';
import { supabase, supabaseConfigured } from '../lib/supabase';

interface AuthContextType {
    user: User | null | undefined;
    allUsers: User[];
    login: (email: string, password: string, role: UserRole) => Promise<boolean>;
    logout: () => void;
    signup: (details: Omit<User, 'id' | 'status'>) => Promise<boolean>;
    approveSupplier: (userId: number) => void;
    suspendUser: (userId: number) => void;
    reactivateUser: (userId: number) => void;
    updateUser: (updatedUser: User) => void;
    changePassword: (currentPassword: string, newPassword: string) => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [user, setUser] = useState<User | null | undefined>(undefined);
    const [allUsers, setAllUsers] = useState<User[]>([]);
    const { showToast } = useToast();

    const uidToInt = (uid: string): number => {
        let hash = 0;
        for (let i = 0; i < uid.length; i++) {
            hash = ((hash << 5) - hash) + uid.charCodeAt(i);
            hash |= 0;
        }
        return Math.abs(hash);
    };

    const withTimeout = async <T,>(p: Promise<T>, ms: number): Promise<T> => {
        return new Promise<T>((resolve, reject) => {
            const timer = setTimeout(() => reject(new Error('timeout')), ms);
            p.then(v => { clearTimeout(timer); resolve(v); }).catch(e => { clearTimeout(timer); reject(e); });
        });
    };

    const tryInsertUser = async (data: User): Promise<boolean> => {
        for (let i = 0; i < 3; i++) {
            const { error } = await withTimeout(supabase.from('users').insert([data], { ignoreDuplicates: true }), 8000);
            if (!error) return true;
            await new Promise(r => setTimeout(r, 500 * (i + 1)));
        }
        return false;
    };

    useEffect(() => {
        if (!supabaseConfigured) {
            setUser(null);
            return;
        }
        const load = async () => {
            const { data } = await supabase.auth.getSession();
            const session = data.session;
            if (!session || !session.user) {
                setUser(null);
                return;
            }
            try {
                const emailLower = (session.user.email || '').toLowerCase();
                const { data: rows } = await supabase.from('users').select('*').eq('email', emailLower).limit(1);
                if (!rows || rows.length === 0) {
                    const minimal: User = {
                        id: uidToInt(session.user.id),
                        name: emailLower || 'User',
                        email: emailLower,
                        phone: '',
                        role: UserRole.Farmer,
                        status: 'approved',
                    };
                    await supabase.from('users').insert([minimal], { ignoreDuplicates: true });
                    setUser(minimal);
                } else {
                    const dataRow = rows[0] as Partial<User> & { role?: UserRole; status?: 'approved' | 'pending' | 'suspended' };
                    const sessionUser: User = {
                        id: (dataRow as any).id ?? uidToInt(session.user.id),
                        name: dataRow.name ?? (emailLower || 'User'),
                        email: emailLower,
                        phone: (dataRow as any).phone ?? '',
                        role: dataRow.role ?? UserRole.Farmer,
                        status: dataRow.status ?? 'approved',
                    };
                    setUser(sessionUser);
                }
            } catch {
                setUser(null);
            }
        };
        load();

        const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
            if (event === 'SIGNED_OUT') {
                setUser(null);
                return;
            }
            const s = session;
            if (!s || !s.user) {
                setUser(null);
                return;
            }
            (async () => {
                try {
                    const emailLower = (s.user.email || '').toLowerCase();
                    const { data: rows } = await supabase.from('users').select('*').eq('email', emailLower).limit(1);
                    if (!rows || rows.length === 0) {
                        const minimal: User = {
                            id: uidToInt(s.user.id),
                            name: emailLower || 'User',
                            email: emailLower,
                            phone: '',
                            role: UserRole.Farmer,
                            status: 'approved',
                        };
                        await supabase.from('users').insert([minimal], { ignoreDuplicates: true });
                        setUser(minimal);
                    } else {
                        const dataRow = rows[0] as Partial<User> & { role?: UserRole; status?: 'approved' | 'pending' | 'suspended' };
                        const sessionUser: User = {
                            id: (dataRow as any).id ?? uidToInt(s.user.id),
                            name: dataRow.name ?? (emailLower || 'User'),
                            email: emailLower,
                            phone: (dataRow as any).phone ?? '',
                            role: dataRow.role ?? UserRole.Farmer,
                            status: dataRow.status ?? 'approved',
                        };
                        setUser(sessionUser);
                    }
                } catch {
                    setUser(null);
                }
            })();
        });
        return () => listener.subscription.unsubscribe();
    }, []);

    useEffect(() => {
        if (!supabaseConfigured) return;
        if (!user) return;
        const loadUsers = async () => {
            try {
                const { data: rows } = await supabase.from('users').select('*');
                if (rows) setAllUsers(rows as User[]);
            } catch {}
        };
        loadUsers();
    }, [user]);

    const login = async (email: string, password: string, role: UserRole): Promise<boolean> => {
        if (!supabaseConfigured) return false;
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) return false;
        const sessionUser = data.user;
        if (!sessionUser) return false;
        const emailLower = (sessionUser.email || '').toLowerCase();
        const { data: rows } = await supabase.from('users').select('*').eq('email', emailLower).limit(1);
        if (!rows || rows.length === 0) {
            const created: User = { id: uidToInt(sessionUser.id), name: emailLower || 'User', email: emailLower, phone: '', role: role, status: 'approved' };
            await supabase.from('users').insert([created], { ignoreDuplicates: true });
            setUser(created);
            return true;
        }
        const rec = rows[0] as Partial<User> & { role?: UserRole; status?: 'approved' | 'pending' | 'suspended' };
        if (rec.status === 'suspended') {
            try { await supabase.auth.signOut({ scope: 'local' }); } catch {}
            return false;
        }
        const resolvedRole = rec.role === UserRole.Admin ? UserRole.Admin : role;
        try { await supabase.from('users').update({ role: resolvedRole }).eq('email', emailLower); } catch {}
        const nextUser: User = {
            id: (rec as any).id ?? uidToInt(sessionUser.id),
            name: rec.name ?? (emailLower || 'User'),
            email: emailLower,
            phone: (rec as any).phone ?? '',
            role: resolvedRole,
            status: rec.status ?? 'approved',
        };
        setUser(nextUser);
        return true;
    };

    

        const logout = () => {
        if (!supabaseConfigured) { setUser(null); return; }
        supabase.auth.signOut({ scope: 'local' }).catch(() => {});
        setUser(null);
    };

    const signup = async (details: Omit<User, 'id' | 'status'>): Promise<boolean> => {
        try {
            const emailLower = (details.email || '').toLowerCase().trim();
            const phoneDigits = (details.phone || '').replace(/[^0-9]/g, '');
            if (!phoneDigits) {
                showToast('Phone number is required.', 'error');
                return false;
            }
            if (!emailLower) {
                showToast('Email is required for signup.', 'error');
                return false;
            }
            const SUPABASE_URL = (import.meta as any).env?.VITE_SUPABASE_URL || '';
            const SUPABASE_KEY = (import.meta as any).env?.VITE_SUPABASE_ANON_KEY || '';
            if (!SUPABASE_URL || !SUPABASE_KEY) {
                showToast('Supabase is not configured. Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.', 'error');
                return false;
            }
            const { data: existingByPhone } = await withTimeout(
                supabase.from('users').select('id').eq('phone', phoneDigits).limit(1),
                8000
            );
            if (existingByPhone && existingByPhone.length > 0) {
                showToast('Email or phone already exists. Please login.', 'error');
                return false;
            }

            const emailToUse = emailLower;
            const { data: cred, error } = await withTimeout(supabase.auth.signUp({ email: emailToUse, password: details.password ?? '', options: { data: { full_name: details.name, phone: phoneDigits } } }), 12000);
            if (error) throw error;
            const uid = cred.user?.id || `${Date.now()}`;
            const newUser: User = {
                id: uidToInt(uid),
                name: details.name,
                email: emailToUse,
                phone: phoneDigits,
                role: details.role,
                status: details.role === UserRole.Supplier ? 'pending' : 'approved',
            };
            const saved = await tryInsertUser(newUser);
            if (!saved) {
                showToast('Could not save your profile right now. Continuing sign in.', 'error');
            }
            try {
                const { error: signInErr } = await withTimeout(supabase.auth.signInWithPassword({ email: emailToUse, password: details.password ?? '' }), 10000);
                if (signInErr) {
                    const msg = (signInErr.message || '').toLowerCase();
                    if (msg.includes('confirm') && msg.includes('email')) {
                        showToast('Please confirm your email. Check your inbox.', 'warning');
                    }
                }
            } catch {}
            setUser(newUser);
            if (newUser.status === 'pending') {
                showToast('Account created! Your supplier account is now pending admin approval.', 'success');
            } else {
                showToast('Account created successfully!', 'success');
            }
            return true;
        } catch (err: any) {
            const code = err?.message as string | undefined;
            if (code && code.toLowerCase().includes('already')) {
                showToast('Email or phone already exists. Please login.', 'error');
                return false;
            } else if (code && code.toLowerCase().includes('invalid')) {
                showToast('Please enter a valid email address.', 'error');
                return false;
            } else if (code && code.toLowerCase().includes('password')) {
                showToast('Password should be at least 6 characters.', 'error');
                return false;
            } else if (err && err.message === 'timeout') {
                showToast('Network issue while creating account. Please try again.', 'error');
                return false;
            } else {
                showToast('Failed to create account. Please retry.', 'error');
                return false;
            }
        }
    };

    const approveSupplier = async (userId: number) => {
        try {
            const { error } = await supabase.from('users').update({ status: 'approved' }).eq('id', userId);
            if (error) throw error;
            showToast('Supplier approved!', 'success');
        } catch {
            showToast('Failed to approve supplier.', 'error');
        }
    };

    const suspendUser = async (userId: number) => {
        try {
            const { error } = await supabase.from('users').update({ status: 'suspended' }).eq('id', userId);
            if (error) throw error;
            showToast('User suspended.', 'warning');
        } catch {
            showToast('Failed to suspend user.', 'error');
        }
    };

    const reactivateUser = async (userId: number) => {
        try {
            const { error } = await supabase.from('users').update({ status: 'approved' }).eq('id', userId);
            if (error) throw error;
            showToast('User reactivated.', 'success');
        } catch {
            showToast('Failed to reactivate user.', 'error');
        }
    };
    
    const updateUser = async (updatedUser: User) => {
        try {
            if (!supabaseConfigured) {
                showToast('Supabase not configured. Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.', 'error');
                return;
            }
            const { error } = await supabase.from('users').upsert([{ ...updatedUser }], { onConflict: 'id' });
            if (error) throw error;
            try { await supabase.auth.updateUser({ data: { full_name: updatedUser.name, phone: updatedUser.phone } }); } catch {}
            if (user && user.id === updatedUser.id) {
                setUser(updatedUser);
            }
            setAllUsers(prev => prev.map(u => u.id === updatedUser.id ? updatedUser : u));
            showToast('Profile updated!', 'success');
        } catch {
            showToast('Failed to update profile.', 'error');
        }
    };

    const changePassword = (currentPassword: string, newPassword: string): boolean => {
        if (!user) {
            showToast('You must be logged in to change your password.', 'error');
            return false;
        }
        if (newPassword.length < 6) {
            showToast('New password must be at least 6 characters long.', 'error');
            return false;
        }
        supabase.auth.updateUser({ password: newPassword })
            .then(({ error }) => {
                if (!error) {
                    showToast('Password updated successfully!', 'success');
                } else {
                    showToast('Failed to update password. Please try again.', 'error');
                }
            })
            .catch(() => {
                showToast('Failed to update password. Please try again.', 'error');
            });
        return true;
    };


    const value = useMemo(() => ({ user, allUsers, login, logout, signup, approveSupplier, suspendUser, reactivateUser, updateUser, changePassword }), [user, allUsers]);

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = (): AuthContextType => {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
};
