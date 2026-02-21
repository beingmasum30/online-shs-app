import React from 'react';
import { User, UserRole } from '../types';

interface NavbarProps {
  user: User;
  onLogout: () => void;
}

const Navbar: React.FC<NavbarProps> = ({ user, onLogout }) => {
  return (
    <nav className="bg-white border-b border-slate-100 sticky top-0 z-[100] px-3 md:px-6 py-2 md:py-4 shadow-sm">
      <div className="max-w-7xl mx-auto flex justify-between items-center">
        <div className="flex items-center gap-2 md:gap-4 overflow-hidden">
          <div className="bg-red-700 text-white w-8 h-8 md:w-12 md:h-12 rounded-lg md:rounded-2xl flex items-center justify-center font-black italic shadow-lg shadow-red-100 text-sm md:text-xl border-2 border-white flex-shrink-0">SH</div>
          <div className="min-w-0">
            <h1 className="text-[10px] md:text-base font-black text-slate-900 leading-none uppercase tracking-tighter italic truncate">SEVA HEALTH SERVICE</h1>
            <p className="text-[6px] md:text-[9px] text-slate-400 font-bold uppercase tracking-widest mt-0.5 md:mt-1 truncate max-w-[100px] md:max-w-none">
              {user.role === UserRole.ADMIN ? 'Administrator' : `Partner: ${user.name}`}
            </p>
          </div>
        </div>
        
        <div className="flex items-center gap-3 md:gap-6 flex-shrink-0">
          <button 
            onClick={onLogout} 
            aria-label="Logout"
            className="bg-slate-50 hover:bg-rose-50 text-slate-300 hover:text-rose-500 w-8 h-8 md:w-12 md:h-12 rounded-lg md:rounded-2xl transition-all flex items-center justify-center shadow-inner group flex-shrink-0 border border-slate-100"
          >
            <i className="fas fa-power-off text-xs md:text-lg group-hover:scale-110 transition-transform"></i>
          </button>
        </div>
      </div>
    </nav>
  );
};

export default Navbar;