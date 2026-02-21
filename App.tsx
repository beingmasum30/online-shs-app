import React, { useState, useEffect } from 'react';
import { User, UserRole } from './types';
import Login from './components/Login';
import AdminDashboard from './components/AdminDashboard';
import CustomerDashboard from './components/CustomerDashboard';
import Navbar from './components/Navbar';
import { onSnapshot } from './firebase';

const App: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);

  // Load initial user from storage
  useEffect(() => {
    const saved = localStorage.getItem('shs_user');
    if (saved) {
      const parsedUser = JSON.parse(saved);
      setUser(parsedUser);
    }
  }, []);

  // Listen for real-time updates to the logged-in user's data
  useEffect(() => {
    if (!user) return;

    const unsub = onSnapshot('users', (snap: any) => {
      const allUsers = snap.docs.map((d: any) => d.data());
      const updatedUser = allUsers.find((u: User) => u.id === user.id);
      if (updatedUser) {
        // Only update if something changed to avoid unnecessary re-renders
        if (JSON.stringify(updatedUser) !== JSON.stringify(user)) {
          setUser(updatedUser);
          localStorage.setItem('shs_user', JSON.stringify(updatedUser));
        }
      }
    });

    return () => unsub();
  }, [user?.id]);

  const handleLogin = (u: User) => {
    setUser(u);
    localStorage.setItem('shs_user', JSON.stringify(u));
  };

  const handleLogout = () => {
    setUser(null);
    localStorage.removeItem('shs_user');
  };

  if (!user) {
    return <Login onLogin={handleLogin} />;
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <Navbar user={user} onLogout={handleLogout} />
      <main className="animate-in fade-in duration-700">
        {user.role === UserRole.ADMIN ? (
          <AdminDashboard />
        ) : (
          <CustomerDashboard user={user} />
        )}
      </main>
    </div>
  );
};

export default App;