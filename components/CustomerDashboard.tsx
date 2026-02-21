import React, { useState, useEffect, useMemo, useRef } from 'react';
import { User, DiagnosticTest, LabType, Order, Advertisement } from '../types';
import { db, onSnapshot, runTransaction } from '../firebase';

interface Props { user: User; }

type Tab = 'dashboard' | 'registration' | 'estimate' | 'orders' | 'target' | 'business';

const CustomerDashboard: React.FC<Props> = ({ user }) => {
  const [activeTab, setActiveTab] = useState<Tab>('dashboard');
  const [orders, setOrders] = useState<Order[]>([]);
  const [tests, setTests] = useState<DiagnosticTest[]>([]);
  const [ads, setAds] = useState<Advertisement[]>([]);
  const [message, setMessage] = useState<{ type: 'error' | 'success', text: string } | null>(null);
  
  // Slider State
  const [adIndex, setAdIndex] = useState(0);
  // Use number instead of NodeJS.Timeout for browser-based timers
  const sliderTimer = useRef<number | null>(null);

  // New Archive Filter States for Partner
  const [archiveLab, setArchiveLab] = useState<'ALL' | LabType>('ALL');
  const [archiveFromDate, setArchiveFromDate] = useState('');
  const [archiveToDate, setArchiveToDate] = useState('');
  const [archiveQuery, setArchiveQuery] = useState('');
  const [appliedOrders, setAppliedOrders] = useState<Order[]>([]);
  const [orderSubTab, setOrderSubTab] = useState<'pending' | 'processing' | 'ready'>('pending');

  // States for wizards
  const allowedLabs = useMemo(() => user.allowedLabs || [LabType.LONG_LIFE, LabType.THYROCARE], [user.allowedLabs]);
  const [regStep, setRegStep] = useState(1);
  const [regPatient, setRegPatient] = useState({ name: '', age: '', months: '0', gender: 'MALE', doc: 'SELF' });
  const [regLab, setRegLab] = useState<LabType>(allowedLabs[0] || LabType.LONG_LIFE);
  const [regSearch, setRegSearch] = useState('');
  const [regCart, setRegCart] = useState<DiagnosticTest[]>([]);

  const [estLab, setEstLab] = useState<LabType>(allowedLabs[0] || LabType.LONG_LIFE);
  const [estSearch, setEstSearch] = useState('');
  const [estCart, setEstCart] = useState<DiagnosticTest[]>([]);
  const [estMode, setEstMode] = useState<'RATE' | 'MRP' | 'BOTH'>('RATE');

  // Reactive enforcement: reset selected lab if it becomes restricted by admin
  useEffect(() => {
    if (!allowedLabs.includes(regLab)) {
      setRegLab(allowedLabs[0]);
    }
    if (!allowedLabs.includes(estLab)) {
      setEstLab(allowedLabs[0]);
    }
  }, [allowedLabs, regLab, estLab]);

  useEffect(() => {
    const unsubOrders = onSnapshot('orders', (snap: any) => setOrders(snap.docs.map((d: any) => d.data()).filter((o: Order) => o.customerId === user.id)));
    const unsubTests = onSnapshot('tests', (snap: any) => setTests(snap.docs.map((d: any) => d.data())));
    const unsubAds = onSnapshot('advertisements', (snap: any) => {
      const allAds = snap.docs.map((d: any) => d.data()).filter((ad: Advertisement) => ad.isActive && (ad.targetUserIds.includes(user.id) || ad.targetUserIds.includes('ALL')));
      setAds(allAds);
    });
    return () => { unsubOrders(); unsubTests(); unsubAds(); };
  }, [user.id]);

  // Handle Ad Slider
  useEffect(() => {
    if (ads.length > 1) {
      // Cast to any/number to ensure browser context is used for setInterval
      sliderTimer.current = setInterval(() => {
        setAdIndex(prev => (prev + 1) % ads.length);
      }, 5000) as unknown as number;
    } else {
      setAdIndex(0);
    }
    return () => { if (sliderTimer.current) clearInterval(sliderTimer.current); };
  }, [ads]);

  const totalBilled = useMemo(() => orders.filter(o => o.status !== 'CANCELLED').reduce((s, o) => s + o.totalAmount, 0), [orders]);
  const dues = useMemo(() => totalBilled - (user.totalPaid || 0), [totalBilled, user.totalPaid]);
  const isKhataBlocked = useMemo(() => dues > (user.khataLimit || 0), [dues, user.khataLimit]);
  const currentTarget = useMemo(() => user.monthlyTarget || 10000, [user.monthlyTarget]);

  // Daily Personal Business Stats
  const todayBiz = useMemo(() => {
    const todayStr = new Date().toDateString();
    const todayOrders = orders.filter(o => new Date(o.date).toDateString() === todayStr && o.status !== 'CANCELLED');
    const bill = todayOrders.reduce((s, o) => s + o.totalAmount, 0);
    return { count: todayOrders.length, bill, orders: todayOrders };
  }, [orders]);

  const getPrice = (test: DiagnosticTest, lab: LabType) => { 
    const custom = user.customRates?.[lab]?.find(r => r.testId === test.id); 
    return custom ? custom.yourRate : 0; 
  };

  const searchTests = (query: string, lab: LabType) => {
    if (!query) return [];
    const q = query.toLowerCase();
    
    // ONLY show manually entered custom rates for this partner
    const customRates = user.customRates?.[lab] || [];
    
    return customRates.filter(cr => 
      cr.testName?.toLowerCase().includes(q) || cr.testId.toLowerCase().includes(q)
    ).map(cr => ({
      id: cr.testId,
      name: cr.testName || 'Unknown',
      category: 'HAEMATOLOGY', // Default fallback
      mrp: cr.mrp || 0,
      longLifePrice: 0,
      thyrocarePrice: 0,
      yourRate: cr.yourRate
    } as any));
  };

  const handleBooking = async () => {
    const total = regCart.reduce((s, t) => s + getPrice(t, regLab), 0);
    const order: Order = {
      id: `SID-${Date.now()}`, customerId: user.id, customerName: user.clinicName || user.name,
      patientName: regPatient.name.toUpperCase(), patientAgeYears: regPatient.age, patientAgeMonths: regPatient.months, patientGender: regPatient.gender,
      refDoc: regPatient.doc.toUpperCase(), tests: regCart, totalAmount: total, totalMrp: regCart.reduce((s, t) => s + (t.mrp || 0), 0),
      lab: regLab, status: 'PICK_UP_PENDING', date: Date.now()
    };
    try {
      await runTransaction(async tx => tx.set('orders', order));
      setRegStep(5);
      setTimeout(() => { setRegStep(1); setRegCart([]); setActiveTab('orders'); }, 2000);
    } catch (e) { setMessage({ type: 'error', text: 'Cloud Sync Failed' }); }
  };

  const handlePrint = (o: Order, type: 'B2B' | 'MRP') => {
    const win = window.open('', '_blank');
    if (!win) return;
    const labName = o.lab.replace('_', ' ');
    const testsHtml = o.tests.map((t, idx) => {
      const p = type === 'B2B' ? getPrice(t, o.lab) : (t.mrp || 0);
      return `<div style="display:flex; justify-content:space-between; margin-bottom: 4px; border-bottom: 1px solid #f1f5f9; padding-bottom: 4px;">
                <span>${idx + 1}. ${t.name.toUpperCase()}</span>
                <span style="font-weight: 900;">₹${p.toLocaleString()}</span>
              </div>`;
    }).join('');
    
    const finalAmount = type === 'B2B' ? o.totalAmount : o.tests.reduce((s, t) => s + (t.mrp || 0), 0);
    const billTitle = type === 'B2B' ? 'Partner B2B Bill' : 'Retail Invoice (MRP)';

    win.document.write(`
      <html>
        <head>
          <title>${billTitle} - ${o.patientName}</title>
          <script src="https://cdn.tailwindcss.com"></script>
          <style>
            @media print { .no-print { display: none; } }
            body { font-family: 'Courier New', Courier, monospace; }
          </style>
        </head>
        <body class="p-10 text-slate-900 bg-white">
          <div class="flex items-center gap-4 mb-8 border-b pb-6">
            <div class="bg-red-700 text-white w-10 h-10 rounded-lg flex items-center justify-center font-black italic text-xl border-2 border-white">SH</div>
            <div>
              <h1 class="font-black text-xl tracking-tighter">SEVA HEALTH SERVICE</h1>
              <p class="text-[10px] text-slate-400 font-bold uppercase tracking-widest">${billTitle}</p>
            </div>
          </div>
          <div class="space-y-6">
            <h2 class="text-lg font-black text-red-700 uppercase border-b-2 border-red-700 inline-block pb-1">${labName}</h2>
            
            <div class="space-y-2 text-sm leading-relaxed">
              <div class="grid grid-cols-2 gap-4 mb-4">
                <p class="font-black">ID: ${o.id}</p>
                <p class="font-black text-right">HUB: ${o.customerName}</p>
              </div>
              <p>PATIENT: <span class="font-black">*${o.patientName}*</span></p>
              <p>AGE/SEX: <span class="font-black">*${o.patientAgeYears}Y ${o.patientAgeMonths}M / ${o.patientGender}*</span></p>
              <p>DR: <span class="font-black">*${o.refDoc}*</span></p>
              
              <div class="mt-8">
                <p class="font-bold border-b pb-1 mb-2 text-slate-400">TESTS & CHARGES:</p>
                <div class="space-y-1">
                  ${testsHtml}
                </div>
              </div>
            </div>

            <div class="mt-12 border-t-2 pt-6 flex justify-between items-end">
               <div class="text-[10px] text-slate-400 font-bold uppercase italic space-y-1">
                  <p>Date: ${new Date(o.date).toLocaleDateString()}</p>
                  <p>System Generated Slip</p>
               </div>
               <div class="text-right">
                  <p class="text-[10px] font-black uppercase italic text-red-700 mb-1">TOTAL PAYABLE (${type})</p>
                  <p class="text-3xl font-black text-slate-900">₹${finalAmount.toLocaleString()}/-</p>
               </div>
            </div>
          </div>
          
          <div class="mt-20 text-center no-print flex flex-col items-center gap-4">
            <button onclick="window.print()" class="bg-[#2b4fa1] text-white px-16 py-5 rounded-2xl font-black uppercase text-xs tracking-widest shadow-2xl hover:bg-red-700 transition-all transform active:scale-95">Print Bill Now</button>
            <p class="text-[8px] text-slate-300 uppercase font-bold italic">Generated via SEVA HEALTH SERVICE Portal</p>
          </div>
        </body>
      </html>
    `);
    win.document.close();
  };

  const handleOnlinePayment = () => {
    if (dues <= 0) {
      setMessage({ type: 'success', text: 'No pending dues!' });
      return;
    }
    // UPI Deep Link Construction
    const upiId = '7001894460@ptsbi';
    const payeeName = 'SEVA HEALTH SERVICE';
    const transactionNote = `BILL_PAY_${user.id}`;
    const upiUrl = `upi://pay?pa=${upiId}&pn=${encodeURIComponent(payeeName)}&am=${dues}&cu=INR&tn=${encodeURIComponent(transactionNote)}`;
    
    window.location.href = upiUrl;
  };

  const handleFilterArchive = () => {
    const from = archiveFromDate ? new Date(archiveFromDate).getTime() : 0;
    const to = archiveToDate ? new Date(archiveToDate).setHours(23, 59, 59, 999) : Infinity;

    const filtered = orders.filter(o => {
      // Archive view filter logic
      if (archiveLab !== 'ALL' && o.lab !== archiveLab) return false;
      if (o.date < from || o.date > to) return false;
      if (archiveQuery) {
        const q = archiveQuery.toLowerCase();
        if (!o.patientName.toLowerCase().includes(q) && !o.id.toLowerCase().includes(q)) return false;
      }
      return true;
    });

    setAppliedOrders(filtered.sort((a,b) => b.date - a.date));
    setMessage({ type: 'success', text: `${filtered.length} entries found` });
    setTimeout(() => setMessage(null), 1500);
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col pb-40">
      {isKhataBlocked && (
        <div className="bg-rose-600 text-white p-5 text-[10px] font-black uppercase text-center sticky top-0 z-[101] shadow-2xl animate-pulse tracking-[0.2em] italic">
           <i className="fas fa-lock mr-2"></i> Khata Over Limit (Dues: ₹{dues.toLocaleString()}). Reports Restricted.
        </div>
      )}

      {/* Portal Header */}
      <div className="bg-[#2b4fa1] text-white p-6 md:p-10 pt-16 pb-28 rounded-b-[3rem] md:rounded-b-[5rem] shadow-[0_30px_80px_rgba(43,79,161,0.2)] relative overflow-hidden">
        <div className="absolute top-0 right-0 opacity-10 text-[8rem] md:text-[12rem] font-black italic -mr-8 md:-mr-16 -mt-8 md:-mt-16 pointer-events-none select-none">SHS</div>
        <div className="relative z-10">
          <h2 className="text-xl md:text-3xl font-black italic uppercase tracking-tighter truncate leading-none mb-8">{user.clinicName}</h2>
          <div className="flex flex-wrap gap-4 md:gap-6">
             <div className="bg-white/10 px-4 md:px-6 py-3 md:py-4 rounded-2xl md:rounded-[2rem] border border-white/10 backdrop-blur-md shadow-inner flex-1 md:flex-none relative group overflow-hidden">
                <p className="text-[7px] md:text-[9px] font-black opacity-40 uppercase italic tracking-widest leading-none mb-1 md:mb-2">Total Dues</p>
                <div className="flex items-center justify-between gap-4">
                  <p className="text-xl md:text-3xl font-black italic tracking-tighter">₹{dues.toLocaleString()}</p>
                  {dues > 0 && (
                    <button 
                      onClick={handleOnlinePayment}
                      className="bg-emerald-500 hover:bg-emerald-400 text-white px-3 py-1.5 rounded-xl text-[8px] font-black uppercase tracking-widest shadow-lg transition-all active:scale-90 flex items-center gap-2"
                    >
                      <i className="fas fa-wallet"></i> Pay
                    </button>
                  )}
                </div>
             </div>
             <div className="bg-white/10 px-4 md:px-6 py-3 md:py-4 rounded-2xl md:rounded-[2rem] border border-white/10 backdrop-blur-md shadow-inner flex-1 md:flex-none"><p className="text-[7px] md:text-[9px] font-black opacity-40 uppercase italic tracking-widest leading-none mb-1 md:mb-2">Limit</p><p className="text-xl md:text-3xl font-black italic tracking-tighter text-emerald-300">₹{user.khataLimit || 0}</p></div>
          </div>
        </div>
      </div>

      <div className="px-4 md:px-6 -mt-14 flex-1 space-y-8 relative z-20">
        {activeTab === 'dashboard' && (
          <div className="space-y-6 md:space-y-8 animate-in slide-in-from-bottom-10 duration-700">
            <div className="grid grid-cols-2 gap-4 md:gap-6">
               <div onClick={() => setActiveTab('orders')} className="bg-white p-6 md:p-8 rounded-3xl md:rounded-[3rem] border shadow-xl h-36 md:h-44 flex flex-col justify-between active:scale-95 transition-all transform hover:-translate-y-1">
                  <p className="text-[9px] md:text-[11px] font-black text-slate-300 uppercase italic tracking-widest">In Process</p>
                  <p className="text-4xl md:text-6xl font-black italic text-[#2b4fa1] tracking-tighter">{orders.filter(o => o.status !== 'READY' && o.status !== 'CANCELLED').length}</p>
               </div>
               <div onClick={() => setActiveTab('orders')} className="bg-white p-6 md:p-8 rounded-3xl md:rounded-[3rem] border shadow-xl h-36 md:h-44 flex flex-col justify-between active:scale-95 transition-all transform hover:-translate-y-1">
                  <p className="text-[9px] md:text-[11px] font-black text-slate-300 uppercase italic tracking-widest">Ready</p>
                  <p className="text-4xl md:text-6xl font-black italic text-emerald-600 tracking-tighter">{orders.filter(o => o.status === 'READY').length}</p>
               </div>
            </div>
            
            {/* ENHANCED BROADCAST SLIDER */}
            {ads.length > 0 && (
              <div className="relative bg-slate-900 rounded-[2rem] md:rounded-[3.5rem] overflow-hidden shadow-2xl animate-in zoom-in-95 border-b-[8px] md:border-b-[12px] border-red-700 min-h-[160px]">
                {ads.map((ad, idx) => (
                  <div key={ad.id} className={`absolute inset-0 transition-opacity duration-1000 ${idx === adIndex ? 'opacity-100 z-10' : 'opacity-0 z-0'} flex flex-col`}>
                    {ad.mediaUrl && (
                      <div className="w-full aspect-video md:aspect-[21/9]">
                        {ad.mediaType === 'IMAGE' ? (
                          <img src={ad.mediaUrl} className="w-full h-full object-cover opacity-90" />
                        ) : (
                          <video src={ad.mediaUrl} autoPlay muted loop playsInline className="w-full h-full object-cover opacity-90" />
                        )}
                      </div>
                    )}
                    <div className="p-6 md:p-8 flex items-center gap-4 md:gap-6 text-white">
                      <i className="fas fa-bullhorn text-red-500 text-xl md:text-2xl flex-shrink-0"></i>
                      <p className="text-[10px] md:text-[12px] font-black italic uppercase leading-relaxed tracking-wider line-clamp-2">{ad.note}</p>
                    </div>
                  </div>
                ))}
                {/* SLIDER DOTS */}
                <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5 z-20">
                  {ads.map((_, i) => (
                    <div key={i} className={`h-1 rounded-full transition-all ${i === adIndex ? 'w-4 bg-red-600' : 'w-1 bg-white/20'}`}></div>
                  ))}
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 gap-4 md:gap-6">
              <button onClick={() => { setRegStep(1); setActiveTab('registration'); }} className="bg-white p-6 md:p-10 rounded-[2rem] md:rounded-[4rem] border shadow-xl flex items-center justify-between group active:scale-95 transition-all transform hover:border-red-700">
                 <div className="flex items-center gap-4 md:gap-8"><div className="w-16 h-16 md:w-20 md:h-20 bg-red-50 text-red-700 rounded-2xl md:rounded-3xl flex items-center justify-center text-3xl md:text-4xl shadow-inner border border-red-100"><i className="fas fa-plus-square"></i></div><div><p className="text-lg md:text-2xl font-black italic text-slate-900 leading-none">New Booking</p><p className="text-[8px] md:text-[10px] font-bold text-slate-400 mt-2 uppercase italic tracking-[0.2em] md:tracking-[0.3em] leading-none">Register Patient</p></div></div>
                 <i className="fas fa-chevron-right text-slate-100 text-2xl md:text-3xl group-hover:text-red-700 transition-colors"></i>
              </button>
              <button onClick={() => { setActiveTab('target'); }} className="bg-white p-6 md:p-10 rounded-[2rem] md:rounded-[4rem] border shadow-xl flex items-center justify-between group active:scale-95 transition-all transform hover:border-emerald-600">
                 <div className="flex items-center gap-4 md:gap-8"><div className="w-16 h-16 md:w-20 md:h-20 bg-emerald-50 text-emerald-600 rounded-2xl md:rounded-3xl flex items-center justify-center text-3xl md:text-4xl shadow-inner border border-emerald-100"><i className="fas fa-bullseye"></i></div><div><p className="text-lg md:text-2xl font-black italic text-slate-900 leading-none">Clinic Target</p><p className="text-[8px] md:text-[10px] font-bold text-slate-400 mt-2 uppercase italic tracking-[0.2em] md:tracking-[0.3em] leading-none">Gift & Incentives</p></div></div>
                 <i className="fas fa-chevron-right text-slate-100 text-2xl md:text-3xl group-hover:text-emerald-600 transition-colors"></i>
              </button>
            </div>
          </div>
        )}

        {/* BUSINESS TAB FOR PARTNER */}
        {activeTab === 'business' && (
          <div className="bg-white p-8 md:p-12 rounded-[2rem] md:rounded-[4.5rem] border shadow-2xl animate-in slide-in-from-right-10 border-t-[16px] border-[#2b4fa1] space-y-10">
             <h3 className="text-2xl md:text-3xl font-black italic uppercase border-l-[8px] md:border-l-[10px] border-[#2b4fa1] pl-4 md:pl-8 leading-none tracking-tighter">Daily Biz Summary</h3>
             
             <div className="grid grid-cols-2 gap-4">
                <div className="bg-slate-50 p-6 rounded-3xl border border-slate-100 space-y-1">
                   <p className="text-[8px] font-black text-slate-400 uppercase italic">Today's Cases</p>
                   <p className="text-3xl font-black italic text-slate-900">{todayBiz.count}</p>
                </div>
                <div className="bg-[#2b4fa1]/5 p-6 rounded-3xl border border-[#2b4fa1]/10 space-y-1">
                   <p className="text-[8px] font-black text-[#2b4fa1] uppercase italic">Today's Bill</p>
                   <p className="text-3xl font-black italic text-[#2b4fa1]">₹{todayBiz.bill.toLocaleString()}</p>
                </div>
             </div>

             <div className="space-y-4">
                <h4 className="text-[10px] font-black uppercase text-slate-400 italic tracking-widest ml-2">Today's Case Log</h4>
                <div className="space-y-3">
                   {todayBiz.orders.length === 0 ? (
                     <div className="py-10 text-center border-2 border-dashed border-slate-100 rounded-3xl italic text-slate-200 uppercase font-black text-xs">No entries today</div>
                   ) : (
                     todayBiz.orders.map(o => (
                       <div key={o.id} className="flex justify-between items-center bg-slate-50 p-5 rounded-2xl border border-slate-100">
                          <div>
                             <p className="text-xs font-black italic text-slate-900 uppercase leading-none">{o.patientName}</p>
                             <p className="text-[9px] font-bold text-slate-400 uppercase mt-1 italic">{o.lab}</p>
                          </div>
                          <p className="text-sm font-black italic text-[#2b4fa1]">₹{o.totalAmount.toLocaleString()}</p>
                       </div>
                     ))
                   )}
                </div>
             </div>
          </div>
        )}

        {activeTab === 'registration' && (
          <div className="bg-white p-6 md:p-12 rounded-[2rem] md:rounded-[4.5rem] border shadow-2xl min-h-[500px] animate-in slide-in-from-right-10 border-t-[16px] border-red-700">
            <h3 className="text-2xl md:text-3xl font-black italic uppercase border-l-[8px] md:border-l-[10px] border-red-700 pl-4 md:pl-8 leading-none tracking-tighter">Registration</h3>
            
            {regStep === 1 && (
              <div className="space-y-6 md:space-y-8 mt-10 animate-in fade-in">
                <div className="space-y-2">
                  <p className="text-[9px] md:text-[10px] font-black text-slate-400 uppercase italic ml-2">Patient name:</p>
                  <input autoComplete="off" placeholder="FULL NAME" value={regPatient.name} onChange={e => setRegPatient({...regPatient, name: e.target.value})} className="w-full p-4 md:p-6 bg-slate-50 border-2 rounded-2xl md:rounded-3xl font-black uppercase text-sm outline-none focus:border-red-700 shadow-inner" />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                   <div className="space-y-2">
                      <p className="text-[9px] md:text-[10px] font-black text-slate-400 uppercase italic ml-2">Age:</p>
                      <div className="flex items-center gap-2">
                         <input type="number" placeholder="YY" value={regPatient.age} onChange={e => setRegPatient({...regPatient, age: e.target.value})} className="flex-1 p-4 md:p-6 bg-slate-50 border-2 rounded-2xl md:rounded-3xl font-black text-sm outline-none focus:border-red-700 shadow-inner" />
                         <span className="font-black text-slate-300">y.</span>
                         <input type="number" placeholder="MM" value={regPatient.months} onChange={e => setRegPatient({...regPatient, months: e.target.value})} className="flex-1 p-4 md:p-6 bg-slate-50 border-2 rounded-2xl md:rounded-3xl font-black text-sm outline-none focus:border-red-700 shadow-inner" />
                         <span className="font-black text-slate-300">M</span>
                      </div>
                   </div>
                   <div className="space-y-2">
                      <p className="text-[9px] md:text-[10px] font-black text-slate-400 uppercase italic ml-2">Gender:</p>
                      <select value={regPatient.gender} onChange={e => setRegPatient({...regPatient, gender: e.target.value})} className="w-full p-4 md:p-6 bg-slate-50 border-2 rounded-2xl md:rounded-3xl font-black uppercase text-sm outline-none">
                         <option value="MALE">MALE</option><option value="FEMALE">FEMALE</option><option value="OTHER">OTHER</option>
                      </select>
                   </div>
                </div>

                <div className="space-y-2">
                  <p className="text-[9px] md:text-[10px] font-black text-slate-400 uppercase italic ml-2">Doctor name :</p>
                  <input autoComplete="off" placeholder="REF. DOCTOR" value={regPatient.doc} onChange={e => setRegPatient({...regPatient, doc: e.target.value})} className="w-full p-4 md:p-6 bg-slate-50 border-2 rounded-2xl md:rounded-3xl font-black uppercase text-sm outline-none focus:border-red-700 shadow-inner" />
                </div>

                <button onClick={() => regPatient.name && setRegStep(2)} className="w-full py-5 md:py-7 bg-slate-900 text-white rounded-2xl md:rounded-[2rem] font-black uppercase text-[10px] md:text-xs tracking-[0.3em] shadow-2xl active:scale-95 transition-all">Next: Select Lab & Tests</button>
              </div>
            )}
            
            {regStep === 2 && (
              <div className="space-y-8 mt-10 animate-in fade-in">
                <div className="space-y-4">
                  <p className="text-[9px] md:text-[10px] font-black text-slate-400 uppercase italic ml-2">Then whitch lab: thyrocare/longlife</p>
                  <div className="flex flex-col md:flex-row gap-4">
                     {allowedLabs.map(lab => (
                       <button key={lab} onClick={() => setRegLab(lab)} className={`flex-1 py-6 md:py-10 rounded-2xl md:rounded-[2.5rem] border-4 font-black italic text-sm md:text-xl transition-all ${regLab === lab ? 'border-red-700 bg-red-50 text-red-700 shadow-xl' : 'border-slate-50 text-slate-300'}`}>{lab.replace('_', ' ')}</button>
                     ))}
                  </div>
                </div>

                <div className="space-y-4">
                  <p className="text-[9px] md:text-[10px] font-black text-slate-400 uppercase italic ml-2">Test name:</p>
                  <div className="relative">
                    <input autoComplete="off" placeholder="SEARCH TESTS..." value={regSearch} onChange={e => setRegSearch(e.target.value)} className="w-full p-5 md:p-7 bg-slate-50 rounded-2xl md:rounded-[2.5rem] font-black uppercase text-sm outline-none shadow-inner border-2 border-transparent focus:border-red-700" />
                    {regSearch.length > 1 && (
                      <div className="absolute top-full left-0 w-full bg-white border-2 rounded-2xl mt-2 shadow-2xl z-50 max-h-60 overflow-y-auto">
                        {searchTests(regSearch, regLab).map(t => (
                          <button key={t.id} onClick={() => { if(!regCart.some(i => i.id === t.id)) setRegCart([...regCart, t]); setRegSearch(''); }} className="w-full p-4 md:p-6 text-left border-b hover:bg-slate-50 flex justify-between items-center group">
                            <div>
                              <span className="text-[10px] md:text-xs font-black uppercase italic group-hover:text-red-700 transition-colors block">{t.name}</span>
                              <span className="text-[8px] md:text-[9px] text-slate-300 uppercase font-mono">{t.id}</span>
                            </div>
                            <span className="text-[10px] md:text-xs font-black text-emerald-600 italic">₹{getPrice(t, regLab).toLocaleString()}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2 md:gap-3">
                    {regCart.map((t, i) => (<div key={i} className="bg-slate-900 text-white px-4 md:px-6 py-2 md:py-3 rounded-xl md:rounded-2xl text-[9px] md:text-[10px] font-black uppercase flex items-center gap-3 md:gap-4 animate-in zoom-in-95"><span>{t.name}</span><button onClick={() => setRegCart(regCart.filter((_, idx) => idx !== i))} className="text-white/40 group-hover:text-white"><i className="fas fa-times-circle text-base md:text-lg"></i></button></div>))}
                  </div>
                </div>

                <div className="flex gap-4 pt-6">
                  <button onClick={() => setRegStep(1)} className="flex-1 py-5 md:py-6 bg-slate-100 rounded-2xl md:rounded-3xl font-black uppercase text-[10px] tracking-widest">Back</button>
                  <button onClick={() => regCart.length > 0 && setRegStep(4)} className="flex-[2] py-5 md:py-6 bg-slate-900 text-white rounded-2xl md:rounded-3xl font-black uppercase text-[10px] tracking-widest shadow-2xl">Confirm</button>
                </div>
              </div>
            )}

            {regStep === 4 && (
              <div className="space-y-8 md:space-y-10 mt-10 animate-in fade-in">
                <div className="bg-slate-50 p-6 md:p-10 rounded-[2rem] md:rounded-[4rem] border shadow-inner space-y-6 md:space-y-8">
                   <div><p className="text-[8px] md:text-[10px] font-black text-slate-300 uppercase italic mb-1">Confirming Case</p><p className="text-xl md:text-3xl font-black italic uppercase text-slate-900 leading-none">{regPatient.name} ({regPatient.age}y. {regPatient.months}M)</p><p className="text-[8px] md:text-[10px] font-bold text-slate-400 mt-4 uppercase italic tracking-[0.2em]">{regLab} Portal</p></div>
                   <div className="space-y-4 pt-6 md:pt-8 border-t">
                      {regCart.map((t, i) => (
                        <div key={i} className="flex justify-between text-[9px] md:text-[11px] font-black italic uppercase text-slate-600"><span>{t.name}</span><span className="font-mono">₹{getPrice(t, regLab).toLocaleString()}</span></div>
                      ))}
                   </div>
                   <div className="pt-6 md:pt-8 border-t flex justify-between items-end">
                      <p className="text-[10px] md:text-sm font-black text-slate-400 uppercase italic leading-none">Total B2B:</p>
                      <p className="text-3xl md:text-5xl font-black italic font-mono text-red-700 tracking-tighter leading-none">₹{regCart.reduce((s, t) => s + getPrice(t, regLab), 0).toLocaleString()}/-</p>
                   </div>
                </div>
                <button onClick={handleBooking} className="w-full py-6 md:py-8 bg-emerald-600 text-white rounded-2xl md:rounded-[2.5rem] font-black uppercase text-[10px] md:text-xs tracking-[0.4em] shadow-[0_15px_40px_rgba(16,185,129,0.3)] transition-all active:scale-95">Complete Booking</button>
              </div>
            )}

            {regStep === 5 && (
              <div className="flex flex-col items-center justify-center py-20 md:py-28 text-center animate-in zoom-in-95">
                 <div className="w-32 h-32 md:w-40 md:h-40 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center mb-10 shadow-inner border border-emerald-100"><i className="fas fa-check-double text-5xl md:text-7xl animate-bounce"></i></div>
                 <h2 className="text-3xl md:text-5xl font-black italic uppercase text-slate-900 tracking-tighter">SYNCHRONIZED</h2>
                 <p className="text-[10px] md:text-[12px] font-bold text-slate-400 mt-6 uppercase italic tracking-[0.3em]">Case successfully pushed to cloud.</p>
              </div>
            )}
          </div>
        )}

        {activeTab === 'estimate' && (
          <div className="bg-white p-12 rounded-[4.5rem] border shadow-2xl animate-in slide-in-from-right-10 space-y-10 border-t-[16px] border-blue-600">
             <h3 className="text-3xl font-black italic uppercase border-l-[10px] border-blue-600 pl-8 leading-none tracking-tighter">B2B Rate Quoter</h3>
             
             <div className="space-y-4">
                <p className="text-[10px] font-black text-slate-300 uppercase italic ml-2">Pricing Mode</p>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: 'RATE', label: 'Your Rate' },
                    { id: 'MRP', label: 'MRP' },
                    { id: 'BOTH', label: 'Both' }
                  ].map(m => (
                    <button key={m.id} onClick={() => setEstMode(m.id as any)} className={`py-4 rounded-2xl font-black text-[10px] uppercase transition-all ${estMode === m.id ? 'bg-blue-600 text-white shadow-lg' : 'bg-slate-50 text-slate-300'}`}>{m.label}</button>
                  ))}
                </div>
             </div>

             <div className="flex gap-4">
                {allowedLabs.map(lab => (
                  <button key={lab} onClick={() => setEstLab(lab)} className={`flex-1 py-10 rounded-[2.5rem] border-4 font-black italic text-xl transition-all ${estLab === lab ? 'border-blue-600 bg-blue-50 text-blue-600 shadow-xl' : 'border-slate-50 text-slate-300'}`}>{lab.replace('_', ' ')}</button>
                ))}
             </div>
             <div className="relative">
                <input autoComplete="off" placeholder="SEARCH TESTS (CODE OR NAME)..." value={estSearch} onChange={e => setEstSearch(e.target.value)} className="w-full p-7 bg-slate-50 border-2 rounded-[2.5rem] font-black uppercase text-sm outline-none shadow-inner focus:border-blue-600" />
                {estSearch.length > 1 && (
                  <div className="absolute top-full left-0 w-full bg-white border-2 rounded-2xl mt-2 shadow-2xl z-50 max-h-60 overflow-y-auto">
                    {searchTests(estSearch, estLab).map(t => (
                      <button key={t.id} onClick={() => { if(!estCart.some(i => i.id === t.id)) setEstCart([...estCart, t]); setEstSearch(''); }} className="w-full p-6 text-left border-b hover:bg-slate-50 flex justify-between group items-center">
                        <div>
                          <span className="text-xs font-black uppercase italic group-hover:text-blue-600 transition-colors block">{t.name}</span>
                          <span className="text-[8px] text-slate-300 uppercase font-mono">{t.id}</span>
                        </div>
                        <div className="text-right">
                           <span className="text-[9px] font-black text-rose-500 italic block">MRP: ₹{(t.mrp || 0).toLocaleString()}</span>
                           <span className="text-xs font-black text-blue-600 italic">B2B: ₹{getPrice(t, estLab).toLocaleString()}</span>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
             </div>
             <div className="flex flex-wrap gap-3">
                {estCart.map((t, i) => (<div key={i} className="bg-blue-50 text-blue-700 px-6 py-3 rounded-2xl text-[10px] font-black uppercase flex items-center gap-4 border shadow-md animate-in zoom-in-95 group"><span>{t.name}</span><button onClick={() => setEstCart(estCart.filter((_, idx) => idx !== i))} className="text-blue-200 group-hover:text-blue-700"><i className="fas fa-times-circle text-lg"></i></button></div>))}
             </div>
             {estCart.length > 0 && (
               <div className="pt-10 border-t text-center animate-in slide-in-from-bottom-10 flex flex-col items-center gap-6">
                  <div className="space-y-4 w-full">
                    {(estMode === 'RATE' || estMode === 'BOTH') && (
                      <div>
                        <p className="text-[11px] font-black text-slate-300 uppercase italic leading-none">B2B Estimated Total</p>
                        <p className="text-5xl font-black italic tracking-tighter text-blue-600 leading-none mt-2">₹{estCart.reduce((s, t) => s + getPrice(t, estLab), 0).toLocaleString()}/-</p>
                      </div>
                    )}
                    {(estMode === 'MRP' || estMode === 'BOTH') && (
                      <div>
                        <p className="text-[11px] font-black text-slate-300 uppercase italic leading-none">MRP Estimated Total</p>
                        <p className="text-5xl font-black italic tracking-tighter text-rose-600 leading-none mt-2">₹{estCart.reduce((s, t) => s + (t.mrp || 0), 0).toLocaleString()}/-</p>
                      </div>
                    )}
                  </div>
                  <button onClick={() => {
                     const partnerName = user.clinicName || 'N/A';
                     const labDisplay = estLab.replace('_', '');
                     let msg = `*SHS ESTIMATE*\n*LAB*: ${labDisplay}\n*PARTNER*: ${partnerName}\n-------------------------------------\n`;
                     estCart.forEach(t => {
                       msg += `• *${t.name.toUpperCase()}*\n`;
                       if (estMode === 'RATE' || estMode === 'BOTH') msg += `  Rate: ₹${getPrice(t, estLab).toLocaleString()}\n`;
                       if (estMode === 'MRP' || estMode === 'BOTH') msg += `  MRP: ₹${(t.mrp || 0).toLocaleString()}\n`;
                     });
                     msg += `-------------------------------------\n`;
                     if (estMode === 'RATE' || estMode === 'BOTH') msg += `*B2B TOTAL*: *${estCart.reduce((s, t) => s + getPrice(t, estLab), 0).toLocaleString()}/-*\n`;
                     if (estMode === 'MRP' || estMode === 'BOTH') msg += `*MRP TOTAL*: *${estCart.reduce((s, t) => s + (t.mrp || 0), 0).toLocaleString()}/-*`;
                     window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank');
                  }} className="mt-10 w-full py-8 bg-emerald-600 text-white rounded-[2.5rem] font-black uppercase text-xs tracking-[0.4em] shadow-2xl flex items-center justify-center gap-6 active:scale-95 transition-all hover:bg-emerald-500"><i className="fab fa-whatsapp text-3xl"></i> Share Quote</button>
               </div>
             )}
          </div>
        )}

        {activeTab === 'target' && (
          <div className="bg-white p-12 rounded-[4.5rem] border shadow-2xl animate-in slide-in-from-right-10 space-y-10 border-t-[16px] border-emerald-600">
             <h3 className="text-3xl font-black italic uppercase border-l-[10px] border-emerald-600 pl-8 leading-none tracking-tighter">Clinic Target</h3>
             
             <div className="bg-slate-50 p-10 rounded-[3.5rem] border shadow-inner space-y-10">
                <div className="flex justify-between items-end">
                   <div>
                      <p className="text-[10px] font-black text-slate-300 uppercase italic mb-1">Achieved So Far</p>
                      <p className="text-5xl font-black italic text-slate-900 tracking-tighter">₹{totalBilled.toLocaleString()}</p>
                   </div>
                   <div className="text-right">
                      <p className="text-[10px] font-black text-emerald-600 uppercase italic mb-1">Target Amount</p>
                      <p className="text-2xl font-black italic text-emerald-600 tracking-tighter">₹{currentTarget.toLocaleString()}</p>
                   </div>
                </div>

                <div className="relative h-16 bg-slate-200 rounded-3xl overflow-hidden border shadow-inner">
                   <div 
                      className="absolute top-0 left-0 h-full bg-emerald-500 transition-all duration-1000 ease-out"
                      style={{ width: `${Math.min((totalBilled / currentTarget) * 100, 100)}%` }}
                   >
                      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent animate-[shimmer_2s_infinite]"></div>
                   </div>
                   <div className="absolute inset-0 flex items-center justify-center">
                      <p className="text-sm font-black italic text-slate-900 drop-shadow-sm">
                         {Math.min((totalBilled / currentTarget) * 100, 100).toFixed(1)}% Completed
                      </p>
                   </div>
                </div>

                <div className="bg-white p-8 rounded-[2.5rem] border-2 border-emerald-100 shadow-lg text-center">
                   <i className="fas fa-gift text-emerald-500 text-5xl mb-6"></i>
                   <p className="text-sm font-black italic text-slate-800 uppercase leading-relaxed tracking-wider">
                      {currentTarget.toLocaleString()} takar lab rate e sample dile gift pabe ba extra incentives pabe.
                   </p>
                   {totalBilled >= currentTarget && (
                     <div className="mt-6 py-3 px-6 bg-emerald-600 text-white rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] animate-bounce">
                        Target Unlocked! Contact Admin for Gift.
                     </div>
                   )}
                </div>
             </div>
          </div>
        )}

        {activeTab === 'orders' && (
          <div className="space-y-6 pb-40 animate-in duration-700">
            <div className="bg-white p-8 md:p-12 rounded-[2.5rem] border shadow-xl space-y-10 border-t-[12px] border-[#2b4fa1]">
              <div className="border-l-8 border-[#2b4fa1] pl-6"><h3 className="text-2xl font-black italic uppercase text-slate-900 tracking-tighter leading-none">Orders Archive</h3></div>
              
              <div className="flex bg-slate-50 p-1.5 rounded-2xl border shadow-sm w-max mb-8">
                {(['pending', 'processing', 'ready'] as const).map(sub => (
                  <button key={sub} onClick={() => setOrderSubTab(sub)} 
                    className={`px-6 md:px-10 py-3 rounded-xl text-[10px] font-black uppercase transition-all ${orderSubTab === sub ? 'bg-[#2b4fa1] text-white shadow-md' : 'text-slate-400'}`}>
                    {sub} ({orders.filter(o => sub === 'pending' ? o.status === 'PICK_UP_PENDING' : sub === 'processing' ? o.status === 'PICKED_UP' : o.status === 'READY').length})
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 pb-6 border-b">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase ml-2 italic">Labs:</label>
                  <select value={archiveLab} onChange={e => setArchiveLab(e.target.value as any)} className="w-full p-4 bg-slate-50 border rounded-2xl font-black text-[10px] uppercase outline-none focus:border-[#2b4fa1]">
                    <option value="ALL">ALL LABS</option>
                    <option value={LabType.THYROCARE}>THYROCARE</option>
                    <option value={LabType.LONG_LIFE}>LONG LIFE</option>
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase ml-2 italic">From Date</label>
                  <input type="date" value={archiveFromDate} onChange={e => setArchiveFromDate(e.target.value)} className="w-full p-4 bg-slate-50 border rounded-2xl font-black text-[10px] uppercase outline-none focus:border-[#2b4fa1]" />
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase ml-2 italic">To Date</label>
                  <input type="date" value={archiveToDate} onChange={e => setArchiveToDate(e.target.value)} className="w-full p-4 bg-slate-50 border rounded-2xl font-black text-[10px] uppercase outline-none focus:border-[#2b4fa1]" />
                </div>

                <div className="lg:col-span-2 space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase ml-2 italic">Search Patient / ID / Workorder:</label>
                  <input value={archiveQuery} onChange={e => setArchiveQuery(e.target.value)} placeholder="ENTER SEARCH KEYWORD..." className="w-full p-4 bg-slate-50 border rounded-2xl font-black text-[10px] uppercase outline-none focus:border-[#2b4fa1]" />
                </div>

                <div className="lg:col-span-1 flex items-end">
                  <button onClick={handleFilterArchive} className="w-full px-12 py-4 bg-[#2b4fa1] text-white rounded-2xl font-black uppercase text-[10px] tracking-widest shadow-xl transition-all active:scale-95">Search</button>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-6">
              {(appliedOrders.length > 0 ? appliedOrders : orders.filter(o => {
                if (orderSubTab === 'pending') return o.status === 'PICK_UP_PENDING';
                if (orderSubTab === 'processing') return o.status === 'PICKED_UP';
                return o.status === 'READY';
              }).sort((a,b) => b.date - a.date)).map(o => (
                <div key={o.id} className="bg-white p-8 rounded-[3rem] border shadow-lg hover:border-blue-600 transition-all flex flex-col gap-6">
                  <div className="flex justify-between items-start">
                     <h4 className="text-xl font-black italic uppercase text-[#2b4fa1] tracking-tighter">{o.lab.replace('_', ' ')}</h4>
                     <div className="flex gap-2">
                        {o.status === 'READY' && !isKhataBlocked && (
                           <button onClick={() => window.open(o.reportUrl, '_blank')} className="bg-blue-50 text-blue-600 px-4 py-2 rounded-xl text-[8px] font-black uppercase italic hover:bg-blue-600 hover:text-white transition-all">Download Report</button>
                        )}
                     </div>
                  </div>

                  <div className="bg-slate-50 p-6 rounded-3xl border font-mono text-[11px] space-y-2 leading-relaxed">
                     <p className="font-bold border-b border-slate-200 pb-2 mb-2">ID: <span className="font-black">{o.id}</span> &bull; HUB: <span className="font-black">{o.customerName}</span></p>
                     <p>PATIENT: <span className="font-black italic">*{o.patientName}*</span></p>
                     <p>AGE/SEX: <span className="font-black italic">*{o.patientAgeYears}Y {o.patientAgeMonths}M / {o.patientGender}*</span></p>
                     <p>DR: <span className="font-black italic">*{o.refDoc}*</span></p>
                     <div className="mt-4 pt-4 border-t border-slate-200">
                        <p className="font-bold mb-1">TESTS:</p>
                        {o.tests.map((t, idx) => (
                          <p key={t.id} className="font-black italic">{idx + 1}.{t.name.toUpperCase()}</p>
                        ))}
                     </div>
                  </div>

                  <div className="flex items-center justify-between">
                     <div className="text-slate-300 text-[10px] font-bold uppercase italic">{new Date(o.date).toLocaleDateString()}</div>
                     <div className="flex items-center gap-4">
                        <div className="text-right mr-4">
                           <p className="text-[8px] font-black text-slate-300 uppercase italic">Payable</p>
                           <p className="text-xl font-black text-red-700 italic leading-none">₹{o.totalAmount.toLocaleString()}/-</p>
                        </div>
                        <div className="flex gap-2">
                          <button 
                            onClick={() => handlePrint(o, 'B2B')}
                            className={`px-4 py-2 rounded-xl flex items-center justify-center gap-2 transition-all shadow-md text-[8px] font-black uppercase ${isKhataBlocked ? 'bg-slate-100 text-slate-300' : 'bg-[#2b4fa1] text-white active:scale-95'}`}
                          >
                             <i className={`fas ${isKhataBlocked ? 'fa-lock' : 'fa-file-invoice'}`}></i> B2B Print
                          </button>
                          <button 
                            onClick={() => handlePrint(o, 'MRP')}
                            className={`px-4 py-2 rounded-xl flex items-center justify-center gap-2 transition-all shadow-md text-[8px] font-black uppercase ${isKhataBlocked ? 'bg-slate-100 text-slate-300' : 'bg-rose-600 text-white active:scale-95'}`}
                          >
                             <i className={`fas ${isKhataBlocked ? 'fa-lock' : 'fa-file-invoice-dollar'}`}></i> MRP Print
                          </button>
                        </div>
                     </div>
                  </div>
                </div>
              ))}
              {orders.length === 0 && (
                <div className="text-center py-24 bg-white rounded-[4rem] border-4 border-dashed border-slate-100 italic text-slate-200 uppercase font-black text-sm tracking-widest">No orders logged yet</div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Navigation */}
      <div className="fixed bottom-0 left-0 w-full bg-white/80 backdrop-blur-xl border-t flex justify-around items-center py-4 md:py-6 z-[100] shadow-[0_-20px_60px_rgba(0,0,0,0.05)] rounded-t-[2.5rem] md:rounded-t-[4rem] px-4">
        {[ 
          { id: 'dashboard', icon: 'house-medical', label: 'Home' }, 
          { id: 'business', icon: 'chart-pie', label: 'Biz' },
          { id: 'registration', icon: 'square-plus', label: 'Book' }, 
          { id: 'estimate', icon: 'calculator', label: 'Quote' }, 
          { id: 'target', icon: 'bullseye', label: 'Target' },
          { id: 'orders', icon: 'book-medical', label: 'Orders' } 
        ].map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id as any)} className={`transition-all p-3 md:p-4 rounded-[1.5rem] md:rounded-[2rem] active:scale-90 flex flex-col items-center gap-1 md:gap-2 min-w-[60px] md:min-w-[70px] ${activeTab === t.id ? 'bg-red-700 text-white shadow-[0_10px_25px_rgba(185,28,28,0.3)]' : 'text-slate-300'}`}>
            <i className={`fas fa-${t.icon} text-base md:text-lg`}></i>
            <span className="text-[5px] md:text-[7px] font-black uppercase tracking-widest leading-none">{t.label}</span>
          </button>
        ))}
      </div>
      
      {message && (<div className={`fixed bottom-24 md:bottom-32 left-6 right-6 md:left-8 md:right-8 p-6 md:p-8 rounded-[2rem] md:rounded-[2.5rem] text-white text-center font-black text-[10px] md:text-[11px] uppercase shadow-[0_30px_80px_rgba(0,0,0,0.3)] z-[5000] animate-in slide-in-from-bottom-24 border-2 border-white/20 backdrop-blur-2xl ${message.type === 'error' ? 'bg-rose-600/90' : 'bg-emerald-600/90'}`}><div className="flex items-center justify-center gap-4 md:gap-6"><i className={`fas ${message.type === 'error' ? 'fa-triangle-exclamation' : 'fa-check-double'} text-2xl md:text-3xl`}/><span className="leading-tight tracking-[0.3em] md:tracking-[0.4em] italic">{message.text}</span></div></div>)}
      
      <style>{`
        @keyframes shimmer {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
      `}</style>
    </div>
  );
};

export default CustomerDashboard;