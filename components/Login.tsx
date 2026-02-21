import React, { useState } from 'react';
import { User } from '../types';
import { db } from '../firebase';

interface Props {
  onLogin: (user: User) => void;
}

const Login: React.FC<Props> = ({ onLogin }) => {
  const [userId, setUserId] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoggingIn(true);
    setTimeout(() => {
      const users = db.get('users');
      const user = users.find((u: any) => 
        u.id.toUpperCase() === userId.trim().toUpperCase() && 
        u.password === password
      );
      
      if (user) {
        if (user.isDeleted) {
          setError('Account deleted.');
          setIsLoggingIn(false);
          return;
        }
        if (user.status === 'INACTIVE' && user.role !== 'ADMIN') {
          setError('Account deactivated.');
          setIsLoggingIn(false);
          return;
        }
        onLogin(user); 
      } else { 
        setError('Invalid Credentials'); 
        setIsLoggingIn(false); 
      }
    }, 600);
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm animate-in fade-in zoom-in-95 duration-500">
        <div className="bg-white p-8 md:p-12 rounded-[2.5rem] md:rounded-[3rem] shadow-2xl shadow-slate-200 border border-slate-100 space-y-8 relative overflow-hidden">
          <div className="text-center space-y-4 flex flex-col items-center">
            <div className="relative w-20 h-20 md:w-28 md:h-28 rounded-3xl bg-red-700 flex items-center justify-center shadow-xl border-4 border-white rotate-3">
              <span className="text-white text-3xl md:text-4xl font-black italic -rotate-3 select-none">SH</span>
            </div>
            <div className="space-y-1">
              <h1 className="text-lg md:text-xl font-black text-slate-900 tracking-tighter uppercase italic leading-none">SEVA HEALTH SERVICE</h1>
              <p className="text-[7px] md:text-[8px] text-slate-400 font-bold uppercase tracking-[0.3em]">Excellence in Diagnostics</p>
            </div>
          </div>

          <form onSubmit={handleLogin} className="space-y-5">
            <div className="space-y-1.5">
              <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest ml-1 block">Username</label>
              <input 
                value={userId}
                onChange={e => setUserId(e.target.value)}
                className="w-full p-4 bg-slate-50 rounded-2xl font-black uppercase outline-none border-2 border-transparent focus:border-red-600 transition-all shadow-inner text-sm"
                placeholder="ID"
                required
                disabled={isLoggingIn}
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest ml-1 block">Password</label>
              <div className="relative">
                <input 
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="w-full p-4 bg-slate-50 rounded-2xl font-black outline-none border-2 border-transparent focus:border-red-600 transition-all shadow-inner text-sm"
                  placeholder="••••••"
                  required
                  disabled={isLoggingIn}
                />
                <button 
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-300"
                >
                  <i className={`fas ${showPassword ? 'fa-eye-slash' : 'fa-eye'}`}></i>
                </button>
              </div>
            </div>

            {error && <p className="text-[9px] font-black text-rose-500 uppercase text-center">{error}</p>}

            <button 
              type="submit"
              disabled={isLoggingIn}
              className="w-full bg-slate-900 hover:bg-red-700 text-white py-4 md:py-5 rounded-2xl font-black uppercase text-[10px] tracking-widest shadow-xl transition-all active:scale-95 disabled:opacity-50"
            >
              {isLoggingIn ? 'Authenticating...' : 'Sign In'}
            </button>
          </form>
          
          <p className="text-center text-[7px] font-bold text-slate-300 uppercase tracking-widest">© 2025 SEVA HEALTH SERVICE HUB</p>
        </div>
      </div>
    </div>
  );
};

export default Login;