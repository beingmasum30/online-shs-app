import React, { useState, useEffect, useMemo, useRef } from 'react';
import { User, DiagnosticTest, Order, UserRole, LabType, CustomRate, Advertisement, Transaction } from '../types';
import { db, onSnapshot, runTransaction } from '../firebase';

type AdminTab = 'users' | 'labs' | 'tests' | 'orders' | 'khata' | 'patients' | 'registration' | 'estimate' | 'ads' | 'target' | 'business';

export default function AdminDashboard() {
  const [activeTab, setActiveTab] = useState<AdminTab>('users');
  const [users, setUsers] = useState<User[]>([]);
  const [tests, setTests] = useState<DiagnosticTest[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [ads, setAds] = useState<Advertisement[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  // Global Notification
  const [hasNewOrderNotification, setHasNewOrderNotification] = useState(false);
  const prevOrderCountRef = useRef<number | null>(null);
  const notificationAudio = useRef<HTMLAudioElement | null>(null);

  // Filtering & Sub-navigation
  const [userSearch, setUserSearch] = useState('');
  const [orderSubTab, setOrderSubTab] = useState<'pending' | 'processing' | 'ready'>('pending');
  const [khataSearch, setKhataSearch] = useState('');
  const [editReportId, setEditReportId] = useState<string | null>(null);

  // Transaction History Filters
  const [txHubFilter, setTxHubFilter] = useState('ALL');
  const [txDateFilter, setTxDateFilter] = useState('');

  // Hub Registration / Edit
  const [isRegistering, setIsRegistering] = useState(false);
  const [showRegPassword, setShowRegPassword] = useState(false);
  const [controlUser, setControlUser] = useState<User | null>(null);
  const [regClinicName, setRegClinicName] = useState('');
  const [regRepName, setRegRepName] = useState('');
  const [regId, setRegId] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regContact, setRegContact] = useState('');
  const [regAddress, setRegAddress] = useState('');

  // Individual Clinic Pin Visibility
  const [visiblePins, setVisiblePins] = useState<Record<string, boolean>>({});

  // Rate Management
  const [ratePartnerId, setRatePartnerId] = useState<string | null>(null);
  const [rateLab, setRateLab] = useState<LabType | null>(null);
  const [rateForm, setRateForm] = useState({ testId: '', testName: '', yourRate: '', mrp: '' });
  const [isMasterMode, setIsMasterMode] = useState(false);
  const [masterForm, setMasterForm] = useState({ id: '', name: '', category: '', longLifePrice: '', thyrocarePrice: '', mrp: '' });

  // Order Registration Wizard
  const [regStep, setRegStep] = useState(1);
  const [regHubId, setRegHubId] = useState('');
  const [regLab, setRegLab] = useState<LabType>(LabType.LONG_LIFE);
  const [regPatient, setRegPatient] = useState({ name: '', age: '', months: '0', gender: 'MALE', doc: 'SELF' });
  const [regSearch, setRegSearch] = useState('');
  const [regCart, setRegCart] = useState<DiagnosticTest[]>([]);
  const [regDiscountValue, setRegDiscountValue] = useState('0');
  const [regDiscountType, setRegDiscountType] = useState<'PERCENT' | 'FLAT'>('PERCENT');

  // Estimate Tool
  const [estHubId, setEstHubId] = useState('WALK_IN');
  const [estLab, setEstLab] = useState<LabType>(LabType.LONG_LIFE);
  const [estSearch, setEstSearch] = useState('');
  const [estCart, setEstCart] = useState<DiagnosticTest[]>([]);
  const [estMode, setEstMode] = useState<'RATE' | 'MRP' | 'BOTH'>('RATE');

  // Archive Filters
  const [archiveLab, setArchiveLab] = useState<'ALL' | LabType>('ALL');
  const [archiveFromDate, setArchiveFromDate] = useState('');
  const [archiveToDate, setArchiveToDate] = useState('');
  const [archiveQuery, setArchiveQuery] = useState('');
  const [appliedArchiveOrders, setAppliedArchiveOrders] = useState<Order[]>([]);

  // BroadCast / Ads
  const [adNote, setAdNote] = useState('');
  const [adTargetId, setAdTargetId] = useState('ALL');
  const [adMedia, setAdMedia] = useState<{ url: string, type: 'IMAGE' | 'VIDEO' } | null>(null);

  useEffect(() => {
    notificationAudio.current = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');
    const unsubUsers = onSnapshot('users', (s: any) => setUsers(s.docs.map((d: any) => d.data())));
    const unsubTests = onSnapshot('tests', (s: any) => setTests(s.docs.map((d: any) => d.data())));
    const unsubOrders = onSnapshot('orders', (s: any) => setOrders(s.docs.map((d: any) => d.data())));
    const unsubAds = onSnapshot('advertisements', (s: any) => setAds(s.docs.map((d: any) => d.data())));
    const unsubTxs = onSnapshot('transactions', (s: any) => setTransactions(s.docs.map((d: any) => d.data())));
    return () => { unsubUsers(); unsubTests(); unsubOrders(); unsubAds(); unsubTxs(); };
  }, []);

  useEffect(() => {
    if (orders.length > 0) {
      if (prevOrderCountRef.current !== null && orders.length > prevOrderCountRef.current) {
        if (activeTab !== 'orders') {
          setHasNewOrderNotification(true);
          notificationAudio.current?.play().catch(() => {});
        }
      }
      prevOrderCountRef.current = orders.length;
    }
  }, [orders, activeTab]);

  const partners = useMemo(() => users.filter(u => u.role === UserRole.USER && !u.isDeleted), [users]);

  const getAllowedLabsForHub = (hubId: string) => {
    if (hubId === 'WALK_IN' || !hubId) return [LabType.LONG_LIFE, LabType.THYROCARE];
    const hub = users.find(u => u.id === hubId);
    return hub?.allowedLabs || [LabType.LONG_LIFE, LabType.THYROCARE];
  };

  useEffect(() => {
    const allowed = getAllowedLabsForHub(regHubId);
    if (!allowed.includes(regLab)) setRegLab(allowed[0]);
  }, [regHubId]);

  useEffect(() => {
    const allowed = getAllowedLabsForHub(estHubId);
    if (!allowed.includes(estLab)) setEstLab(allowed[0]);
  }, [estHubId]);

  const todayStats = useMemo(() => {
    const todayStr = new Date().toDateString();
    const todayOrders = orders.filter(o => new Date(o.date).toDateString() === todayStr && o.status !== 'CANCELLED');
    const totalB2B = todayOrders.reduce((s, o) => s + o.totalAmount, 0);
    const totalMRP = todayOrders.reduce((s, o) => s + o.totalMrp, 0);
    const partnerMap: Record<string, { name: string, cases: number, bill: number }> = {};
    todayOrders.forEach(o => {
      if (!partnerMap[o.customerId]) partnerMap[o.customerId] = { name: o.customerName, cases: 0, bill: 0 };
      partnerMap[o.customerId].cases++;
      partnerMap[o.customerId].bill += o.totalAmount;
    });
    return { cases: todayOrders.length, totalB2B, totalMRP, partnerSplit: Object.values(partnerMap) };
  }, [orders]);

  const showToast = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 3000);
  };

  const getPrice = (test: DiagnosticTest, lab: LabType, hubId: string) => {
    if (hubId === 'WALK_IN') return test.mrp || 0;
    const p = partners.find(p => p.id === hubId);
    const custom = p?.customRates?.[lab]?.find(r => r.testId === test.id);
    return custom ? custom.yourRate : 0;
  };

  const searchAvailableTests = (query: string, lab: LabType, hubId: string) => {
    if (!query) return [];
    const q = query.toLowerCase();
    if (hubId === 'WALK_IN') return tests.filter(t => t.name.toLowerCase().includes(q) || t.id.toLowerCase().includes(q));
    const p = partners.find(partner => partner.id === hubId);
    const customRates = p?.customRates?.[lab] || [];
    return customRates.filter(cr => cr.testName?.toLowerCase().includes(q) || cr.testId.toLowerCase().includes(q)).map(cr => ({
      id: cr.testId, name: cr.testName || 'Unknown', category: 'HAEMATOLOGY', mrp: cr.mrp || 0, longLifePrice: 0, thyrocarePrice: 0, yourRate: cr.yourRate
    } as any));
  };

  const currentRegistrationTotal = useMemo(() => {
    const subtotal = regCart.reduce((s, t) => s + getPrice(t, regLab, regHubId), 0);
    const discount = parseFloat(regDiscountValue || '0');
    if (isNaN(discount) || discount <= 0) return subtotal;
    if (regDiscountType === 'PERCENT') {
      return subtotal * (1 - discount / 100);
    } else {
      return Math.max(0, subtotal - discount);
    }
  }, [regCart, regLab, regHubId, regDiscountValue, regDiscountType]);

  const handleBooking = async () => {
    const order: Order = {
      id: `ORD-${Date.now()}`, 
      customerId: regHubId, 
      customerName: regHubId === 'WALK_IN' ? 'WALK-IN' : partners.find(p => p.id === regHubId)?.clinicName || 'CLINIC',
      patientName: regPatient.name.toUpperCase(), 
      patientAgeYears: regPatient.age, 
      patientAgeMonths: regPatient.months, 
      patientGender: regPatient.gender,
      refDoc: regPatient.doc.toUpperCase(), 
      tests: regCart, 
      totalAmount: currentRegistrationTotal, 
      totalMrp: regCart.reduce((s, t) => s + (t.mrp || 0), 0),
      lab: regLab, 
      status: 'PICK_UP_PENDING', 
      date: Date.now()
    };
    try {
      await runTransaction(async tx => tx.set('orders', order));
      showToast('success', 'Booking Confirmed');
      setRegStep(1); 
      setRegCart([]); 
      setRegPatient({ name: '', age: '', months: '0', gender: 'MALE', doc: 'SELF' });
      setRegDiscountValue('0');
    } catch (e) { showToast('error', 'Sync Failed'); }
  };

  const handlePrint = (o: Order, type: 'B2B' | 'MRP') => {
    const win = window.open('', '_blank');
    if (!win) return;
    const labName = o.lab.replace('_', ' ');
    const testsHtml = o.tests.map((t, idx) => {
      const p = type === 'B2B' ? getPrice(t, o.lab, o.customerId) : (t.mrp || 0);
      return `<div style="display:flex; justify-content:space-between; margin-bottom: 4px; border-bottom: 1px solid #f1f5f9; padding-bottom: 4px;">
                <span>${idx + 1}. ${t.name.toUpperCase()}</span>
                <span style="font-weight: 900;">₹${p.toLocaleString()}</span>
              </div>`;
    }).join('');
    
    const finalAmount = type === 'B2B' ? o.totalAmount : (o.totalMrp || o.tests.reduce((s, t) => s + (t.mrp || 0), 0));
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
            
            <div class="space-y-2 text-sm">
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

            <div class="mt-12 border-t-2 pt-4 flex justify-between items-end">
               <div>
                  <p class="text-[10px] font-bold text-slate-400 uppercase italic">Date: ${new Date(o.date).toLocaleDateString()}</p>
                  <p class="text-[10px] font-bold text-slate-400 uppercase italic">Software Version 2.0</p>
               </div>
               <div class="text-right">
                  <p class="text-[10px] font-black uppercase italic text-red-700 mb-1">TOTAL PAYABLE (${type})</p>
                  <p class="text-3xl font-black text-slate-900">₹${finalAmount.toLocaleString()}/-</p>
               </div>
            </div>
          </div>
          
          <div class="mt-20 text-center no-print">
            <button onclick="window.print()" class="bg-slate-900 text-white px-12 py-4 rounded-2xl font-black uppercase text-xs tracking-widest shadow-xl hover:bg-red-700 transition-all">Download PDF Slip</button>
          </div>
        </body>
      </html>
    `);
    win.document.close();
  };

  const handleSavePartner = async (e: React.FormEvent) => {
    e.preventDefault();
    const data: User = {
      id: regId.toUpperCase().trim(), name: regRepName, clinicName: regClinicName, role: UserRole.USER,
      totalPaid: controlUser?.totalPaid ?? 0, walletBalance: controlUser?.walletBalance ?? 0, password: regPassword,
      contactNumber: regContact, address: regAddress, status: controlUser?.status ?? 'ACTIVE', isDeleted: false,
      allowedLabs: controlUser?.allowedLabs ?? [LabType.LONG_LIFE, LabType.THYROCARE],
      khataLimit: controlUser?.khataLimit ?? 10000, monthlyTarget: controlUser?.monthlyTarget ?? 10000,
      customRates: controlUser?.customRates ?? {}
    };
    try {
      await runTransaction(async (tx) => { tx.set('users', data); });
      showToast('success', controlUser ? 'Profile Updated' : 'Partner Registered');
      setIsRegistering(false); setControlUser(null);
    } catch (err) { showToast('error', 'Operation Failed'); }
  };

  const toggleLabAuth = async (userId: string, lab: LabType) => {
    const user = users.find(u => u.id === userId);
    if (!user) return;
    const current = user.allowedLabs || [LabType.LONG_LIFE, LabType.THYROCARE];
    const updated = current.includes(lab) ? current.filter(l => l !== lab) : [...current, lab];
    if (updated.length === 0) { showToast('error', 'At least one lab required'); return; }
    try {
      await runTransaction(async tx => tx.update(`users:${userId}`, { allowedLabs: updated }));
      showToast('success', `${lab} access toggled`);
    } catch (e) { showToast('error', 'Update Failed'); }
  };

  const handleSaveMasterTest = async () => {
    if (!masterForm.id || !masterForm.name) { showToast('error', 'Required fields missing'); return; }
    const test: DiagnosticTest = {
      id: masterForm.id.toUpperCase(), name: masterForm.name.toUpperCase(), category: masterForm.category.toUpperCase(),
      longLifePrice: parseFloat(masterForm.longLifePrice || '0'), thyrocarePrice: parseFloat(masterForm.thyrocarePrice || '0'),
      mrp: parseFloat(masterForm.mrp || '0')
    };
    try {
      await runTransaction(async tx => tx.set('tests', test));
      showToast('success', 'Master Test Saved');
      setMasterForm({ id: '', name: '', category: '', longLifePrice: '', thyrocarePrice: '', mrp: '' });
    } catch (e) { showToast('error', 'Sync Failed'); }
  };

  const shareToWhatsApp = (o: Order) => {
    const header = o.lab === LabType.LONG_LIFE ? 'LLB011 MASUM HARIHARPARA' : '*P7523*';
    const msg = `${header}\n---------------------------------\nCLINIC CODE: ${o.customerName}\n\nNAME: *${o.patientName}*\nAGE: *${o.patientAgeYears} Y ${o.patientAgeMonths} M*\nDR: *${o.refDoc}*\nTEST:\n${o.tests.map(t => `*${t.name.toUpperCase()}*`).join('\n')}\n\n*SPECIAL NOTE:* NO\n---------------------------------\n_GENERATED FROM ADMIN PANEL_`;
    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank');
  };

  const updateOrder = async (id: string, status: Order['status'], extra = {}) => {
    try {
      await runTransaction(async tx => tx.update(`orders:${id}`, { status, ...extra }));
      showToast('success', `Status Updated: ${status}`);
      if (status === 'PICKED_UP') {
        const o = orders.find(ord => ord.id === id);
        if (o) shareToWhatsApp(o);
      }
      if (editReportId === id) setEditReportId(null);
    } catch (e) { showToast('error', 'Update Failed'); }
  };

  const handleArchiveSearch = () => {
    const from = archiveFromDate ? new Date(archiveFromDate).getTime() : 0;
    const to = archiveToDate ? new Date(archiveToDate).setHours(23, 59, 59, 999) : Infinity;
    const results = orders.filter(o => {
      if (archiveLab !== 'ALL' && o.lab !== archiveLab) return false;
      if (o.date < from || o.date > to) return false;
      if (archiveQuery) {
        const q = archiveQuery.toLowerCase();
        if (!o.patientName.toLowerCase().includes(q) && !o.customerId.toLowerCase().includes(q) && !o.id.toLowerCase().includes(q)) return false;
      }
      return true;
    });
    setAppliedArchiveOrders(results.sort((a,b) => b.date - a.date));
    showToast('success', `${results.length} cases found`);
  };

  const handleAddAd = async () => {
    if (!adNote && !adMedia) return;
    const ad: Advertisement = { 
      id: `AD-${Date.now()}`, 
      note: adNote, 
      isActive: true, 
      targetUserIds: [adTargetId],
      mediaUrl: adMedia?.url,
      mediaType: adMedia?.type
    };
    try {
      await runTransaction(async tx => tx.set('advertisements', ad));
      showToast('success', 'Broadcast Active');
      setAdNote('');
      setAdMedia(null);
    } catch (e) { showToast('error', 'Broadcast Failed'); }
  };

  const toggleUserStatus = async (userId: string, currentStatus: string) => {
    const newStatus = currentStatus === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    try {
      await runTransaction(async tx => tx.update(`users:${userId}`, { status: newStatus }));
      showToast('success', `Clinic ${newStatus === 'ACTIVE' ? 'Activated' : 'Deactivated'}`);
    } catch (e) {
      showToast('error', 'Update failed');
    }
  };

  const filteredTransactions = useMemo(() => {
    return transactions.filter(tx => {
      const matchHub = txHubFilter === 'ALL' || tx.hubId === txHubFilter;
      const matchDate = !txDateFilter || new Date(tx.date).toLocaleDateString() === new Date(txDateFilter).toLocaleDateString();
      return matchHub && matchDate;
    }).sort((a, b) => b.date - a.date);
  }, [transactions, txHubFilter, txDateFilter]);

  const togglePinVisibility = (id: string) => {
    setVisiblePins(prev => ({ ...prev, [id]: !prev[id] }));
  };

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-8 min-h-screen pb-40">
      {/* Tab Navigation */}
      <div className="flex bg-white p-1 rounded-2xl border shadow-sm overflow-x-auto custom-scrollbar sticky top-16 z-[100]">
        {(['users', 'labs', 'tests', 'orders', 'khata', 'patients', 'registration', 'estimate', 'ads', 'target', 'business'] as AdminTab[]).map(tab => (
          <button 
            key={tab} 
            onClick={() => { 
              setActiveTab(tab); setRatePartnerId(null); setRateLab(null); setIsMasterMode(false);
              if (tab === 'orders') setHasNewOrderNotification(false);
            }} 
            className={`flex-1 py-3 px-6 rounded-xl text-[10px] font-black uppercase transition-all whitespace-nowrap relative ${activeTab === tab ? 'bg-red-700 text-white shadow-lg' : 'text-slate-400 hover:text-slate-600'}`}
          >
            {tab === 'patients' ? 'Archive' : tab === 'tests' ? 'Rates' : tab === 'ads' ? 'Broadcast' : tab === 'target' ? 'Clinic Target' : tab.toUpperCase()}
            {tab === 'orders' && hasNewOrderNotification && (
              <span className="absolute top-1 right-1 w-2.5 h-2.5 bg-red-600 rounded-full border-2 border-white animate-pulse shadow-[0_0_8px_rgba(220,38,38,0.5)]"></span>
            )}
          </button>
        ))}
      </div>

      {/* TABS CONTENT */}

      {activeTab === 'business' && (
        <div className="space-y-6 animate-in fade-in">
           <div className="bg-white p-8 rounded-[3rem] border shadow-xl border-t-[12px] border-slate-900">
             <div className="border-l-8 border-slate-900 pl-6"><h3 className="text-2xl font-black italic uppercase text-slate-900 tracking-tighter">Business Intelligence</h3><p className="text-[10px] font-bold text-slate-400 uppercase italic mt-1">{new Date().toLocaleDateString()}</p></div>
           </div>
           <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="bg-white p-8 rounded-[2.5rem] border shadow-lg"><p className="text-[10px] font-black text-slate-300 uppercase italic">Cases Today</p><p className="text-5xl font-black text-slate-900">{todayStats.cases}</p></div>
              <div className="bg-white p-8 rounded-[2.5rem] border shadow-lg"><p className="text-[10px] font-black text-emerald-600 uppercase italic">Gross B2B</p><p className="text-5xl font-black text-emerald-600">₹{todayStats.totalB2B.toLocaleString()}</p></div>
              <div className="bg-white p-8 rounded-[2.5rem] border shadow-lg"><p className="text-[10px] font-black text-blue-600 uppercase italic">Total MRP</p><p className="text-5xl font-black text-blue-600">₹{todayStats.totalMRP.toLocaleString()}</p></div>
           </div>
           <div className="bg-white p-8 rounded-[3rem] border shadow-xl overflow-hidden">
             <h4 className="text-sm font-black italic text-slate-400 uppercase tracking-widest mb-6 px-2">Active Hubs Distribution</h4>
             <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {todayStats.partnerSplit.map(p => (
                  <div key={p.name} className="p-5 bg-slate-50 border rounded-2xl flex justify-between items-center group hover:border-red-700 transition-all">
                    <div><p className="text-xs font-black italic text-slate-900 uppercase truncate max-w-[120px]">{p.name}</p><p className="text-[9px] font-bold text-slate-400 uppercase">{p.cases} Cases</p></div>
                    <p className="text-sm font-black italic text-emerald-600">₹{p.bill.toLocaleString()}</p>
                  </div>
                ))}
             </div>
           </div>
        </div>
      )}

      {activeTab === 'users' && (
        <div className="space-y-6 animate-in fade-in">
           <div className="bg-white p-8 rounded-[3rem] border shadow-xl flex flex-col md:flex-row justify-between items-center gap-6">
             <div className="border-l-8 border-red-700 pl-6"><h3 className="text-2xl font-black italic uppercase text-slate-900 tracking-tighter">Hub Partners</h3></div>
             <div className="flex gap-4 w-full md:w-auto">
               <input placeholder="SEARCH HUBS..." value={userSearch} onChange={e => setUserSearch(e.target.value)} className="w-full md:w-64 p-4 bg-slate-50 border rounded-2xl text-[10px] font-black uppercase outline-none" />
               <button onClick={() => { setControlUser(null); setRegClinicName(''); setRegRepName(''); setRegId(''); setRegPassword(''); setRegContact(''); setRegAddress(''); setShowRegPassword(false); setIsRegistering(true); }} className="px-8 py-4 bg-red-700 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-xl">New Hub</button>
             </div>
           </div>
           <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
             {partners.filter(p => p.clinicName?.toLowerCase().includes(userSearch.toLowerCase()) || p.id.toLowerCase().includes(userSearch.toLowerCase())).map(p => (
               <div key={p.id} className={`bg-white p-8 rounded-[3.5rem] border shadow-lg group transition-all flex flex-col justify-between h-full relative ${p.status === 'INACTIVE' ? 'opacity-70 grayscale-[0.5]' : 'hover:border-red-700'}`}>
                 {p.status === 'INACTIVE' && (
                   <div className="absolute top-8 right-8 bg-rose-600 text-white px-3 py-1 rounded-full text-[8px] font-black uppercase italic tracking-widest shadow-lg">Deactivated</div>
                 )}
                 {p.status === 'ACTIVE' && (
                   <div className="absolute top-8 right-8 bg-emerald-600 text-white px-3 py-1 rounded-full text-[8px] font-black uppercase italic tracking-widest shadow-lg">Active</div>
                 )}
                 
                 <div className="space-y-4">
                   <p className="text-[9px] font-black text-slate-300 font-mono italic">SID: {p.id}</p>
                   <h4 className="text-2xl font-black italic uppercase text-slate-900 leading-tight">{p.clinicName}</h4>
                   <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest py-4 border-y border-slate-50 space-y-2">
                     <p><i className="fas fa-user-tie mr-2"></i> {p.name}</p>
                     <p><i className="fas fa-phone mr-2"></i> {p.contactNumber || 'N/A'}</p>
                     <div className="flex items-center justify-between pt-2">
                       <div className="flex items-center gap-2">
                         <i className="fas fa-key text-slate-200"></i>
                         <p className="text-xs font-black tracking-[0.2em] text-slate-900">
                           {visiblePins[p.id] ? p.password : '••••••'}
                         </p>
                       </div>
                       <button onClick={() => togglePinVisibility(p.id)} className="text-slate-300 hover:text-slate-900 transition-colors">
                         <i className={`fas ${visiblePins[p.id] ? 'fa-eye-slash' : 'fa-eye'} text-xs`}></i>
                       </button>
                     </div>
                   </div>
                 </div>
                 <div className="flex flex-col gap-4 pt-6">
                   <div className="flex justify-between items-center">
                     <p className="text-[12px] font-black text-emerald-600 italic">₹{(p.totalPaid || 0).toLocaleString()} Collected</p>
                     <div className="flex gap-2">
                       <button onClick={() => { setControlUser(p); setRegClinicName(p.clinicName || ''); setRegRepName(p.name || ''); setRegId(p.id); setRegPassword(p.password || ''); setRegContact(p.contactNumber || ''); setRegAddress(p.address || ''); setShowRegPassword(false); setIsRegistering(true); }} className="w-10 h-10 rounded-xl bg-slate-50 text-slate-300 hover:text-blue-600 border flex items-center justify-center transition-all shadow-sm"><i className="fas fa-pen"></i></button>
                       <button onClick={async () => { 
                          if(confirm('Delete Hub Permanently? This action will remove the clinic from the system and cannot be undone.')) {
                            try {
                              await runTransaction({ type: 'delete', collection: 'users', id: p.id });
                              showToast('success', 'Hub Deleted Permanently');
                            } catch (e) {
                              showToast('error', 'Delete Failed');
                            }
                          }
                        }} className="w-10 h-10 rounded-xl bg-slate-50 text-slate-300 hover:text-rose-600 border flex items-center justify-center transition-all shadow-sm"><i className="fas fa-trash-alt"></i></button>
                     </div>
                   </div>
                   <button 
                    onClick={() => toggleUserStatus(p.id, p.status || 'ACTIVE')}
                    className={`w-full py-3 rounded-2xl text-[9px] font-black uppercase tracking-widest transition-all shadow-md ${p.status === 'INACTIVE' ? 'bg-emerald-500 hover:bg-emerald-600 text-white' : 'bg-slate-100 hover:bg-rose-50 text-slate-400 hover:text-rose-600'}`}
                   >
                     {p.status === 'INACTIVE' ? 'Activate Clinic' : 'Deactivate Clinic'}
                   </button>
                 </div>
               </div>
             ))}
           </div>
        </div>
      )}

      {activeTab === 'labs' && (
        <div className="bg-white p-8 md:p-12 rounded-[3.5rem] border shadow-xl animate-in fade-in space-y-10">
          <div className="border-l-8 border-slate-900 pl-6"><h3 className="text-2xl font-black italic uppercase text-slate-900 tracking-tighter">Lab Access Control</h3></div>
          <div className="overflow-x-auto custom-scrollbar">
            <table className="w-full text-left border-collapse min-w-[600px]">
              <thead><tr className="bg-slate-900 text-white text-[10px] font-black uppercase italic tracking-widest"><th className="p-6">Hub Name</th><th className="p-6 text-center">Long Life</th><th className="p-6 text-center">Thyrocare</th></tr></thead>
              <tbody className="text-[11px] font-bold text-slate-600 uppercase italic">
                {partners.map(p => (
                  <tr key={p.id} className="border-b hover:bg-slate-50">
                    <td className="p-6">{p.clinicName} <span className="text-[9px] text-slate-300 ml-2">({p.id})</span></td>
                    <td className="p-6 text-center"><button onClick={() => toggleLabAuth(p.id, LabType.LONG_LIFE)} className={`w-16 h-8 rounded-full transition-all ${p.allowedLabs?.includes(LabType.LONG_LIFE) ? 'bg-emerald-600 text-white shadow-lg' : 'bg-slate-100 text-slate-300'}`}>{p.allowedLabs?.includes(LabType.LONG_LIFE) ? 'ON' : 'OFF'}</button></td>
                    <td className="p-6 text-center"><button onClick={() => toggleLabAuth(p.id, LabType.THYROCARE)} className={`w-16 h-8 rounded-full transition-all ${p.allowedLabs?.includes(LabType.THYROCARE) ? 'bg-red-700 text-white shadow-lg' : 'bg-slate-100 text-slate-300'}`}>{p.allowedLabs?.includes(LabType.THYROCARE) ? 'ON' : 'OFF'}</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'tests' && (
        <div className="space-y-6 animate-in slide-in-from-bottom-6">
           {!ratePartnerId && !isMasterMode ? (
             <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                <button onClick={() => setIsMasterMode(true)} className="bg-slate-900 p-12 rounded-[4rem] border shadow-lg text-left group hover:border-emerald-600 transition-all border-b-[12px] border-b-slate-800">
                   <h4 className="text-2xl font-black italic uppercase text-white group-hover:text-emerald-400 transition-colors leading-tight">MASTER TEST INVENTORY</h4>
                </button>
                {partners.map(p => (
                  <button key={p.id} onClick={() => setRatePartnerId(p.id)} className="bg-white p-12 rounded-[4rem] border shadow-lg text-left group hover:border-red-700 transition-all border-b-[12px] border-b-slate-100">
                     <h4 className="text-2xl font-black italic uppercase text-slate-900 group-hover:text-red-700 transition-colors leading-tight">{p.clinicName}</h4>
                     <p className="text-[10px] font-bold text-slate-300 mt-2 uppercase tracking-widest italic leading-none">SID: {p.id}</p>
                  </button>
                ))}
             </div>
           ) : isMasterMode ? (
              <div className="space-y-8">
                <div className="bg-white p-12 rounded-[4.5rem] border shadow-2xl border-t-[16px] border-slate-900">
                   <div className="flex justify-between items-start mb-10"><button onClick={() => setIsMasterMode(false)} className="text-slate-300 hover:text-red-700 text-[10px] font-black uppercase italic tracking-[0.2em]"><i className="fas fa-arrow-left"></i> Hub List</button><p className="text-xl font-black italic text-slate-900 uppercase">MASTER REPOSITORY</p></div>
                   <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4 p-8 bg-slate-50 rounded-[3rem] border items-end">
                      <div><label className="text-[9px] font-black text-slate-400 uppercase italic ml-2">Code:</label><input value={masterForm.id} onChange={e => setMasterForm({...masterForm, id: e.target.value})} className="w-full p-4 bg-white border rounded-2xl font-black text-xs outline-none focus:border-slate-900 uppercase" /></div>
                      <div className="lg:col-span-2"><label className="text-[9px] font-black text-slate-400 uppercase italic ml-2">Name:</label><input value={masterForm.name} onChange={e => setMasterForm({...masterForm, name: e.target.value})} className="w-full p-4 bg-white border rounded-2xl font-black text-xs outline-none focus:border-slate-900 uppercase" /></div>
                      <div><label className="text-[9px] font-black text-slate-400 uppercase italic ml-2">Category:</label><input value={masterForm.category} onChange={e => setMasterForm({...masterForm, category: e.target.value})} className="w-full p-4 bg-white border rounded-2xl font-black text-xs outline-none focus:border-slate-900 uppercase" /></div>
                      <div className="lg:col-span-2 grid grid-cols-3 gap-2">
                         <div><label className="text-[9px] font-black text-slate-400 uppercase italic">L.Life</label><input type="number" value={masterForm.longLifePrice} onChange={e => setMasterForm({...masterForm, longLifePrice: e.target.value})} className="w-full p-4 bg-white border rounded-2xl font-black text-xs outline-none focus:border-slate-900" /></div>
                         <div><label className="text-[9px] font-black text-slate-400 uppercase italic">Thyro</label><input type="number" value={masterForm.thyrocarePrice} onChange={e => setMasterForm({...masterForm, thyrocarePrice: e.target.value})} className="w-full p-4 bg-white border rounded-2xl font-black text-xs outline-none focus:border-slate-900" /></div>
                         <div><label className="text-[9px] font-black text-rose-500 uppercase italic">MRP</label><input type="number" value={masterForm.mrp} onChange={e => setMasterForm({...masterForm, mrp: e.target.value})} className="w-full p-4 bg-rose-50 border border-rose-100 rounded-2xl font-black text-xs outline-none text-rose-700" /></div>
                      </div>
                      <div className="lg:col-span-6 flex justify-end gap-2 mt-4"><button onClick={handleSaveMasterTest} className="px-8 py-3 bg-emerald-600 text-white rounded-xl text-[10px] font-black uppercase shadow-lg hover:bg-emerald-500">Save Master</button></div>
                   </div>
                </div>
                <div className="bg-white rounded-[3.5rem] border shadow-xl overflow-hidden">
                  <div className="overflow-x-auto custom-scrollbar">
                    <table className="w-full text-left min-w-[700px]">
                      <thead><tr className="bg-slate-900 text-white text-[10px] font-black uppercase italic tracking-widest"><th className="p-6">Code</th><th className="p-6">Name</th><th className="p-6 text-right">L.Life</th><th className="p-6 text-right">Thyro</th><th className="p-6 text-right text-rose-300">MRP</th><th className="p-6 text-center">Action</th></tr></thead>
                      <tbody className="text-[11px] font-bold text-slate-600 uppercase italic">
                        {tests.map(t => (
                          <tr key={t.id} className="border-b hover:bg-slate-50"><td className="p-6 text-slate-900 font-mono font-black">{t.id}</td><td className="p-6">{t.name}</td><td className="p-6 text-right">₹{t.longLifePrice}</td><td className="p-6 text-right">₹{t.thyrocarePrice}</td><td className="p-6 text-right text-rose-600 font-black">₹{t.mrp}</td><td className="p-6 text-center"><div className="flex justify-center gap-2"><button onClick={() => { setMasterForm({ id: t.id, name: t.name, category: t.category, longLifePrice: t.longLifePrice.toString(), thyrocarePrice: t.thyrocarePrice.toString(), mrp: t.mrp?.toString() || '' }); window.scrollTo({ top: 0, behavior: 'smooth' }); }} className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 shadow-sm"><i className="fas fa-edit"></i></button><button onClick={async () => { 
                                      if(confirm('Delete Master Entry?')) {
                                        try {
                                          await runTransaction({ type: 'delete', collection: 'tests', id: t.id });
                                          showToast('success', 'Master Entry Deleted');
                                        } catch (e) {
                                          showToast('error', 'Delete Failed');
                                        }
                                      }
                                    }} className="w-8 h-8 rounded-lg bg-rose-50 text-rose-300 shadow-sm"><i className="fas fa-trash-alt"></i></button></div></td></tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
           ) : !rateLab ? (
             <div className="max-w-2xl mx-auto bg-white p-12 rounded-[4rem] border shadow-2xl text-center space-y-10 border-t-[16px] border-red-700">
                <button onClick={() => setRatePartnerId(null)} className="text-slate-300 hover:text-red-700 text-[10px] font-black uppercase italic tracking-[0.2em] mb-4 block"><i className="fas fa-arrow-left"></i> Hub Selection</button>
                <h3 className="text-3xl font-black italic uppercase text-slate-900 tracking-tighter">Laboratory Portal</h3>
                <div className="flex gap-4">
                   <button onClick={() => setRateLab(LabType.LONG_LIFE)} className="flex-1 py-10 rounded-[3rem] border-4 border-slate-50 font-black italic text-2xl hover:border-slate-900 transition-all bg-slate-50 uppercase">LONG LIFE</button>
                   <button onClick={() => setRateLab(LabType.THYROCARE)} className="flex-1 py-10 rounded-[3rem] border-4 border-slate-50 font-black italic text-2xl hover:border-red-700 transition-all bg-red-50 text-red-700 uppercase">THYROCARE</button>
                </div>
             </div>
           ) : (
             <div className="space-y-8">
                <div className="bg-white p-12 rounded-[4.5rem] border shadow-2xl border-t-[16px] border-slate-900">
                   <div className="flex justify-between items-start mb-10"><button onClick={() => setRateLab(null)} className="text-slate-300 hover:text-red-700 text-[10px] font-black uppercase italic tracking-[0.2em]"><i className="fas fa-arrow-left"></i> Lab Selection</button><div className="text-right"><p className="text-xl font-black italic text-slate-900 uppercase leading-none">{partners.find(p => p.id === ratePartnerId)?.clinicName}</p><p className="text-[10px] font-black text-red-600 uppercase mt-1 italic">{rateLab} Rates</p></div></div>
                   <div className="grid grid-cols-1 md:grid-cols-4 gap-6 p-8 bg-slate-50 rounded-[3rem] border">
                      <div><label className="text-[10px] font-black text-slate-400 uppercase italic ml-2">Test Code:</label><input value={rateForm.testId} onChange={e => setRateForm({...rateForm, testId: e.target.value})} className="w-full p-4 bg-white border rounded-2xl font-black text-xs outline-none uppercase" placeholder="T001" /></div>
                      <div><label className="text-[10px] font-black text-slate-400 uppercase italic ml-2">Test Name:</label><input value={rateForm.testName} onChange={e => setRateForm({...rateForm, testName: e.target.value})} className="w-full p-4 bg-white border rounded-2xl font-black text-xs outline-none uppercase" placeholder="CBC" /></div>
                      <div><label className="text-[10px] font-black text-slate-400 uppercase italic ml-2">MRP:</label><input type="number" value={rateForm.mrp} onChange={e => setRateForm({...rateForm, mrp: e.target.value})} className="w-full p-4 bg-white border rounded-2xl font-black text-xs outline-none" placeholder="0" /></div>
                      <div><label className="text-[10px] font-black text-emerald-600 uppercase italic ml-2">Hub Rate:</label><div className="flex gap-2"><input type="number" value={rateForm.yourRate} onChange={e => setRateForm({...rateForm, yourRate: e.target.value})} className="w-full p-4 bg-emerald-50 border-2 border-emerald-100 rounded-2xl font-black text-xs outline-none text-emerald-700" placeholder="0" /><button onClick={async () => {
                              if(!rateForm.testId || !rateForm.testName) { showToast('error', 'Required fields'); return; }
                              const p = users.find(u => u.id === ratePartnerId); if(!p || !rateLab) return;
                              const current = p.customRates || {}; const labRates = current[rateLab] || [];
                              const entry: CustomRate = { testId: rateForm.testId.toUpperCase(), testName: rateForm.testName.toUpperCase(), yourRate: parseFloat(rateForm.yourRate || '0'), mrp: parseFloat(rateForm.mrp || '0') };
                              const updated = [...labRates.filter(r => r.testId !== entry.testId), entry];
                              await runTransaction(async tx => tx.update(`users:${ratePartnerId}`, { customRates: { ...current, [rateLab]: updated } }));
                              showToast('success', 'Rate Saved'); setRateForm({ testId: '', testName: '', yourRate: '', mrp: '' });
                           }} className="bg-emerald-600 text-white w-12 rounded-2xl shadow-lg active:scale-95 transition-all"><i className="fas fa-plus"></i></button></div></div>
                   </div>
                </div>
                <div className="bg-white rounded-[3.5rem] border shadow-xl overflow-hidden">
                  <div className="overflow-x-auto custom-scrollbar">
                    <table className="w-full text-left min-w-[800px]">
                      <thead><tr className="bg-slate-900 text-white text-[10px] font-black uppercase italic tracking-widest"><th className="p-6 text-center w-20">No.</th><th className="p-6">Code</th><th className="p-6">Name</th><th className="p-6 text-right">MRP</th><th className="p-6 text-right text-emerald-300">Hub Rate</th><th className="p-6 text-center">Action</th></tr></thead>
                      <tbody className="text-[11px] font-bold text-slate-600 uppercase italic">
                        {(partners.find(p => p.id === ratePartnerId)?.customRates?.[rateLab] || []).map((r, i) => (
                          <tr key={r.testId} className="border-b hover:bg-slate-50 transition-colors">
                            <td className="p-6 text-center text-slate-300 font-mono italic">{i + 1}</td>
                            <td className="p-6 font-black text-slate-900">{r.testId}</td>
                            <td className="p-6 text-slate-500">{r.testName}</td>
                            <td className="p-6 text-right text-slate-300">₹{r.mrp?.toLocaleString()}</td>
                            <td className="p-6 text-right font-black text-emerald-600">₹{r.yourRate.toLocaleString()}</td>
                            <td className="p-6 text-center"><div className="flex justify-center gap-4"><button onClick={() => { setRateForm({ testId: r.testId, testName: r.testName || '', yourRate: r.yourRate.toString(), mrp: r.mrp?.toString() || '' }); window.scrollTo({ top: 0, behavior: 'smooth' }); }} className="bg-blue-50 text-blue-600 w-8 h-8 rounded-lg flex items-center justify-center shadow-sm hover:bg-blue-600 hover:text-white transition-all"><i className="fas fa-edit"></i></button><button onClick={async () => {
                                  if(confirm('Delete Hub-Specific Rate?')) {
                                    const p = users.find(u => u.id === ratePartnerId); if(!p || !rateLab) return;
                                    const current = p.customRates || {}; const updated = (current[rateLab] || []).filter(item => item.testId !== r.testId);
                                    await runTransaction(async tx => tx.update(`users:${ratePartnerId}`, { customRates: { ...current, [rateLab]: updated } }));
                                    showToast('success', 'Deleted');
                                  }
                                }} className="bg-rose-50 text-rose-300 w-8 h-8 rounded-lg flex items-center justify-center shadow-sm hover:bg-rose-600 hover:text-white transition-all"><i className="fas fa-trash-alt"></i></button></div></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
             </div>
           )}
        </div>
      )}

      {activeTab === 'orders' && (
        <div className="space-y-6 animate-in fade-in">
          <div className="flex bg-white p-1.5 rounded-2xl border shadow-sm w-max gap-1">
            {(['pending', 'processing', 'ready'] as const).map(sub => (
              <button key={sub} onClick={() => setOrderSubTab(sub)} className={`px-8 py-3 rounded-xl text-[10px] font-black uppercase transition-all ${orderSubTab === sub ? 'bg-slate-900 text-white shadow-md' : 'text-slate-400'}`}>{sub.toUpperCase()} ({orders.filter(o => sub === 'pending' ? o.status === 'PICK_UP_PENDING' : sub === 'processing' ? o.status === 'PICKED_UP' : o.status === 'READY').length})</button>
            ))}
          </div>
          <div className="grid grid-cols-1 gap-6">
            {orders.filter(o => {
              if (orderSubTab === 'pending') return o.status === 'PICK_UP_PENDING';
              if (orderSubTab === 'processing') return o.status === 'PICKED_UP';
              return o.status === 'READY';
            }).sort((a,b) => b.date - a.date).map(o => (
              <div key={o.id} className="bg-white p-8 rounded-[3rem] border shadow-lg flex flex-col md:flex-row justify-between gap-8 border-l-[12px] border-l-red-700 hover:shadow-2xl transition-all">
                <div className="flex-1 font-mono text-[11px] bg-slate-50 p-6 rounded-3xl border">
                  <div className="flex justify-between items-center mb-4">
                    <p className="font-black text-slate-900">{o.lab.replace('_',' ')}</p>
                    <div className="flex gap-2">
                      {o.status === 'READY' && (
                        <button onClick={() => setEditReportId(o.id === editReportId ? null : o.id)} className="text-blue-600 bg-white px-3 py-1 rounded-lg border shadow-sm flex items-center gap-2 shadow-inner text-[7px] font-black uppercase transition-all hover:bg-blue-50">
                          <i className="fas fa-edit"></i> Edit Report
                        </button>
                      )}
                      <button onClick={() => shareToWhatsApp(o)} className="text-emerald-600 bg-white px-3 py-1 rounded-lg border shadow-sm flex items-center gap-2 shadow-inner"><i className="fab fa-whatsapp"></i> Details</button>
                    </div>
                  </div>
                  <p className="font-bold border-b pb-2 mb-4">ID: {o.id} &bull; HUB: {o.customerName}</p>
                  <p>PATIENT: <span className="font-black italic">*{o.patientName}*</span></p>
                  <p>AGE/SEX: <span className="font-black italic">*{o.patientAgeYears}Y {o.patientAgeMonths}M / {o.patientGender}*</span></p>
                  <p>DR: <span className="font-black italic">*{o.refDoc}*</span></p>
                  <div className="mt-4 border-t pt-4">
                    <p className="font-bold mb-1">TESTS:</p>
                    {o.tests.map(t => <p key={t.id} className="font-black italic">*{t.name.toUpperCase()}*</p>)}
                  </div>
                </div>
                <div className="flex flex-col items-end justify-center gap-4">
                  <div className="text-right"><p className="text-[10px] font-black text-slate-300 uppercase italic">Payable</p><p className="text-4xl font-black text-red-700 tracking-tighter">₹{o.totalAmount.toLocaleString()}</p></div>
                  <div className="flex gap-2">
                    {o.status === 'PICK_UP_PENDING' && <button onClick={() => updateOrder(o.id, 'PICKED_UP')} className="px-8 py-4 bg-slate-900 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-xl">Pick Up</button>}
                    {(o.status === 'PICKED_UP' || (o.status === 'READY' && editReportId === o.id)) && (
                      <div className="flex flex-col gap-3">
                        <div className="flex gap-2">
                          <input id={`pdf-${o.id}`} defaultValue={o.status === 'READY' ? o.reportUrl : ''} placeholder="Paste PDF Link" className="p-4 bg-slate-50 border rounded-2xl text-[10px] font-black outline-none w-44" />
                          <button onClick={() => { 
                            const u = (document.getElementById(`pdf-${o.id}`) as HTMLInputElement).value; 
                            if(u) updateOrder(o.id, 'READY', { reportUrl: u }); 
                            else showToast('error', 'Link required'); 
                          }} className="px-6 py-4 bg-emerald-600 text-white rounded-2xl text-[10px] font-black uppercase shadow-xl hover:bg-emerald-500 transition-all">{o.status === 'READY' ? 'Update' : 'Publish'}</button>
                        </div>
                        <div className="relative">
                          <input type="file" accept=".pdf" id={`file-up-${o.id}`} className="hidden" onChange={async (e) => {
                            const file = e.target.files?.[0];
                            if (file) {
                              const reader = new FileReader();
                              reader.onload = async (ev) => {
                                const dataUrl = ev.target?.result as string;
                                await updateOrder(o.id, 'READY', { reportUrl: dataUrl });
                              };
                              reader.readAsDataURL(file);
                            }
                          }} />
                          <button onClick={() => document.getElementById(`file-up-${o.id}`)?.click()} className="w-full py-4 bg-slate-900 text-white rounded-2xl text-[9px] font-black uppercase tracking-[0.1em] shadow-lg border border-slate-700 hover:bg-slate-800 transition-all flex items-center justify-center gap-2 italic">
                            <i className="fas fa-file-upload text-sm"></i> {o.status === 'READY' ? 'Upload New PDF' : 'Click to Upload PDF'}
                          </button>
                        </div>
                        {o.status === 'READY' && (
                          <button onClick={() => setEditReportId(null)} className="text-[8px] font-black uppercase text-slate-400 hover:text-slate-900 text-center">Cancel Edit</button>
                        )}
                      </div>
                    )}
                    {o.status === 'READY' && editReportId !== o.id && <button onClick={() => window.open(o.reportUrl, '_blank')} className="px-8 py-4 bg-slate-100 text-slate-600 border rounded-2xl text-[10px] font-black uppercase">View Report</button>}
                    <button onClick={() => updateOrder(o.id, 'CANCELLED')} className="w-12 h-12 flex items-center justify-center bg-rose-50 text-rose-300 hover:text-rose-600 rounded-2xl border transition-all"><i className="fas fa-trash-alt"></i></button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'khata' && (
        <div className="space-y-8 animate-in fade-in">
          <div className="bg-white p-8 md:p-12 rounded-[3.5rem] border shadow-xl space-y-10">
            <div className="flex flex-col md:flex-row justify-between items-center gap-6">
              <div className="border-l-8 border-slate-900 pl-6"><h3 className="text-2xl font-black italic uppercase text-slate-900 tracking-tighter">Financial Ledger</h3></div>
              <input placeholder="SEARCH HUBS..." value={khataSearch} onChange={e => setKhataSearch(e.target.value)} className="w-full md:w-64 p-4 bg-slate-50 border rounded-2xl text-[10px] font-black uppercase outline-none" />
            </div>
            <div className="overflow-x-auto custom-scrollbar">
              <table className="w-full text-left border-collapse min-w-[800px]">
                <thead><tr className="bg-slate-900 text-white text-[10px] font-black uppercase italic tracking-widest"><th className="p-6">Hub Detail</th><th className="p-6 text-right">Total Bill</th><th className="p-6 text-right">Total Paid</th><th className="p-6 text-right">Dues</th><th className="p-6 text-center">Set Limit</th><th className="p-6 text-center">Add Payment</th></tr></thead>
                <tbody className="text-[11px] font-bold text-slate-600 uppercase italic">
                  {partners.filter(p => p.clinicName?.toLowerCase().includes(khataSearch.toLowerCase())).map(p => {
                    const bill = orders.filter(o => o.customerId === p.id && o.status !== 'CANCELLED').reduce((s,o) => s + o.totalAmount, 0);
                    const due = bill - (p.totalPaid || 0);
                    return (
                      <tr key={p.id} className="border-b hover:bg-slate-50">
                        <td className="p-6 font-black">{p.clinicName} <span className="text-[9px] text-slate-300 ml-2">({p.id})</span></td>
                        <td className="p-6 text-right">₹{bill.toLocaleString()}</td>
                        <td className="p-6 text-right text-emerald-600">₹{p.totalPaid?.toLocaleString()}</td>
                        <td className={`p-6 text-right font-black ${due > (p.khataLimit || 0) ? 'text-red-700' : 'text-slate-900'}`}>₹{due.toLocaleString()}</td>
                        <td className="p-6 text-center">
                          <input type="number" onBlur={async (e) => await runTransaction(async tx => tx.update(`users:${p.id}`, { khataLimit: parseFloat(e.target.value) }))} className="w-20 p-2 bg-slate-50 border rounded-lg text-center font-black" defaultValue={p.khataLimit} />
                        </td>
                        <td className="p-6 text-center">
                          <div className="flex justify-center gap-2">
                            <input id={`pay-${p.id}`} type="number" placeholder="Amt" className="w-20 p-2 bg-emerald-50 border border-emerald-100 rounded-lg text-center font-black" />
                            <button onClick={async () => { 
                              const el = document.getElementById(`pay-${p.id}`) as HTMLInputElement; 
                              const val = parseFloat(el.value); 
                              if(val) { 
                                const newTx: Transaction = {
                                  id: `TX-${Date.now()}`,
                                  hubId: p.id,
                                  hubName: p.clinicName || 'Unknown',
                                  amount: val,
                                  date: Date.now(),
                                  paymentMode: 'OFFLINE'
                                };
                                await runTransaction(async tx => {
                                  tx.update(`users:${p.id}`, { totalPaid: (p.totalPaid || 0) + val });
                                  tx.set('transactions', newTx);
                                });
                                el.value = ''; 
                                showToast('success', 'Payment Logged'); 
                              } 
                            }} className="w-8 h-8 bg-emerald-600 text-white rounded-lg shadow-sm active:scale-95 transition-all"><i className="fas fa-plus"></i></button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="bg-white p-8 md:p-12 rounded-[3.5rem] border shadow-xl space-y-10 border-t-[12px] border-emerald-600">
            <div className="flex flex-col md:flex-row justify-between items-center gap-6">
              <div className="border-l-8 border-emerald-600 pl-6"><h3 className="text-2xl font-black italic uppercase text-slate-900 tracking-tighter">Transaction History</h3></div>
              <div className="flex flex-wrap gap-4">
                <select value={txHubFilter} onChange={e => setTxHubFilter(e.target.value)} className="p-4 bg-slate-50 border rounded-2xl text-[10px] font-black uppercase outline-none focus:border-emerald-600">
                  <option value="ALL">ALL HUBS</option>
                  {partners.map(p => <option key={p.id} value={p.id}>{p.clinicName}</option>)}
                </select>
                <input type="date" value={txDateFilter} onChange={e => setTxDateFilter(e.target.value)} className="p-4 bg-slate-50 border rounded-2xl text-[10px] font-black uppercase outline-none focus:border-emerald-600" />
              </div>
            </div>
            <div className="overflow-x-auto custom-scrollbar">
              <table className="w-full text-left min-w-[700px]">
                <thead><tr className="bg-emerald-600 text-white text-[10px] font-black uppercase italic tracking-widest"><th className="p-6">Date</th><th className="p-6">Hub Name</th><th className="p-6">Transaction ID</th><th className="p-6 text-right">Amount</th><th className="p-6 text-center">Action</th></tr></thead>
                <tbody className="text-[11px] font-bold text-slate-600 uppercase italic">
                  {filteredTransactions.map(tx => (
                    <tr key={tx.id} className="border-b hover:bg-slate-50">
                      <td className="p-6">{new Date(tx.date).toLocaleDateString()} {new Date(tx.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td>
                      <td className="p-6 font-black">{tx.hubName} <span className="text-[9px] text-slate-300">({tx.hubId})</span></td>
                      <td className="p-6 font-mono text-slate-400">{tx.id}</td>
                      <td className="p-6 text-right text-emerald-600 font-black">₹{tx.amount.toLocaleString()}</td>
                      <td className="p-6 text-center"><button onClick={async () => { 
                        if(confirm('Delete this transaction?')) {
                          try {
                            await runTransaction({ type: 'delete', collection: 'transactions', id: tx.id });
                            showToast('success', 'Transaction Deleted');
                          } catch (e) {
                            showToast('error', 'Delete Failed');
                          }
                        }
                      }} className="text-rose-300 hover:text-rose-600"><i className="fas fa-trash-alt"></i></button></td>
                    </tr>
                  ))}
                  {filteredTransactions.length === 0 && <tr><td colSpan={5} className="p-20 text-center italic text-slate-300">No records found</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'patients' && (
        <div className="space-y-6 animate-in fade-in">
          <div className="bg-white p-8 md:p-12 rounded-[3.5rem] border shadow-xl space-y-8 border-t-[12px] border-slate-900">
             <div className="border-l-8 border-slate-900 pl-6"><h3 className="text-2xl font-black italic uppercase text-slate-900 tracking-tighter leading-none">Global Archive Search</h3></div>
             <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <select value={archiveLab} onChange={e => setArchiveLab(e.target.value as any)} className="p-4 bg-slate-50 border rounded-2xl text-[10px] font-black uppercase outline-none focus:border-red-700"><option value="ALL">ALL LABS</option><option value={LabType.LONG_LIFE}>LONG LIFE</option><option value={LabType.THYROCARE}>THYROCARE</option></select>
                <input type="date" value={archiveFromDate} onChange={e => setArchiveFromDate(e.target.value)} className="p-4 bg-slate-50 border rounded-2xl text-[10px] font-black uppercase outline-none focus:border-red-700" />
                <input type="date" value={archiveToDate} onChange={e => setArchiveToDate(e.target.value)} className="p-4 bg-slate-50 border rounded-2xl text-[10px] font-black uppercase outline-none focus:border-red-700" />
                <input placeholder="PATIENT / HUB / ID..." value={archiveQuery} onChange={e => setArchiveQuery(e.target.value)} className="p-4 bg-slate-50 border rounded-2xl text-[10px] font-black uppercase outline-none focus:border-red-700" />
                <button onClick={handleArchiveSearch} className="md:col-span-4 py-4 bg-slate-900 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-xl">Retrieve Records</button>
             </div>
          </div>
          <div className="grid grid-cols-1 gap-6">
            {appliedArchiveOrders.map(o => (
              <div key={o.id} className="bg-white p-8 rounded-[3rem] border shadow-lg hover:border-red-700 transition-all flex flex-col gap-6">
                <div className="flex justify-between items-start">
                   <h4 className="text-xl font-black italic uppercase text-red-700 tracking-tighter">{o.lab.replace('_', ' ')}</h4>
                   <div className="flex gap-2">
                      <button onClick={() => shareToWhatsApp(o)} className="bg-emerald-50 text-emerald-600 px-4 py-2 rounded-xl text-[8px] font-black uppercase italic hover:bg-emerald-600 hover:text-white transition-all">Details</button>
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
                         <p className="text-[8px] font-black text-slate-300 uppercase italic">Bill</p>
                         <p className="text-xl font-black text-red-700 italic leading-none">₹{o.totalAmount.toLocaleString()}/-</p>
                      </div>
                      <div className="flex gap-2">
                        <button 
                          onClick={() => handlePrint(o, 'B2B')}
                          className="px-4 py-2 bg-[#2b4fa1] text-white rounded-xl shadow-md text-[8px] font-black uppercase flex items-center gap-2 group active:scale-95 transition-all"
                        >
                           <i className="fas fa-file-invoice"></i> B2B Print
                        </button>
                        <button 
                          onClick={() => handlePrint(o, 'MRP')}
                          className="px-4 py-2 bg-rose-600 text-white rounded-xl shadow-md text-[8px] font-black uppercase flex items-center gap-2 group active:scale-95 transition-all"
                        >
                           <i className="fas fa-file-invoice-dollar"></i> MRP Print
                        </button>
                      </div>
                   </div>
                </div>
              </div>
            ))}
            {appliedArchiveOrders.length === 0 && (
              <div className="py-20 text-center bg-white rounded-[3.5rem] border-4 border-dashed border-slate-100 italic text-slate-200 uppercase font-black text-sm">No records pulled from cloud.</div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'registration' && (
        <div className="max-w-3xl mx-auto bg-white p-12 rounded-[4.5rem] border shadow-2xl animate-in slide-in-from-right-10 border-t-[16px] border-red-700">
          <div className="border-l-8 border-red-700 pl-6"><h3 className="text-3xl font-black italic uppercase text-slate-900 tracking-tighter">Direct Registration</h3></div>
          {regStep === 1 && (
            <div className="space-y-8 mt-10">
               <div className="space-y-2"><label className="text-[10px] font-black text-slate-400 uppercase italic ml-2">SELECT HUB HUB HUB</label><select value={regHubId} onChange={e => setRegHubId(e.target.value)} className="w-full p-6 bg-slate-50 border-2 rounded-3xl font-black uppercase text-sm outline-none focus:border-red-700"><option value="">SELECT PARTNER...</option><option value="WALK_IN">WALK-IN (MRP)</option>{partners.map(p => <option key={p.id} value={p.id}>{p.clinicName}</option>)}</select></div>
               <div className="space-y-2"><label className="text-[10px] font-black text-slate-400 uppercase italic ml-2">Patient name:</label><input placeholder="PATIENT NAME" value={regPatient.name} onChange={e => setRegPatient({...regPatient, name: e.target.value})} className="w-full p-6 bg-slate-50 border-2 rounded-3xl font-black uppercase text-sm outline-none focus:border-red-700 shadow-inner" /></div>
               <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                 <div className="space-y-2"><label className="text-[10px] font-black text-slate-400 uppercase italic ml-2">Age:</label><div className="flex items-center gap-2"><input type="number" placeholder="YY" value={regPatient.age} onChange={e => setRegPatient({...regPatient, age: e.target.value})} className="flex-1 p-6 bg-slate-50 border-2 rounded-3xl font-black text-sm outline-none" /><input type="number" placeholder="MM" value={regPatient.months} onChange={e => setRegPatient({...regPatient, months: e.target.value})} className="flex-1 p-6 bg-slate-50 border-2 rounded-3xl font-black text-sm outline-none" /></div></div>
                 <div className="space-y-2"><label className="text-[10px] font-black text-slate-400 uppercase italic ml-2">Gender:</label><select value={regPatient.gender} onChange={e => setRegPatient({...regPatient, gender: e.target.value})} className="w-full p-6 bg-slate-50 border-2 rounded-3xl font-black uppercase text-sm outline-none"><option value="MALE">MALE</option><option value="FEMALE">FEMALE</option><option value="OTHER">OTHER</option></select></div>
               </div>
               <div className="space-y-2"><label className="text-[10px] font-black text-slate-400 uppercase italic ml-2">Doctor name :</label><input placeholder="DR. NAME" value={regPatient.doc} onChange={e => setRegPatient({...regPatient, doc: e.target.value})} className="w-full p-6 bg-slate-50 border-2 rounded-3xl font-black uppercase text-sm outline-none focus:border-red-700 shadow-inner" /></div>
               <button onClick={() => regHubId && regPatient.name && setRegStep(2)} className="w-full py-6 bg-slate-900 text-white rounded-[2rem] font-black uppercase text-[10px] tracking-widest shadow-xl">Continue Booking</button>
            </div>
          )}
          {regStep === 2 && (
            <div className="space-y-10 mt-10">
               <div className="flex flex-col md:flex-row gap-4">
                 {getAllowedLabsForHub(regHubId).map(lab => (
                   <button 
                     key={lab}
                     onClick={() => setRegLab(lab)} 
                     className={`flex-1 py-10 rounded-[2.5rem] border-4 font-black italic text-xl transition-all ${regLab === lab ? 'border-red-700 bg-red-50 text-red-700 shadow-xl' : 'border-slate-50 text-slate-300'}`}
                   >
                     {lab.replace('_', ' ')}
                   </button>
                 ))}
               </div>
               <div className="relative"><input placeholder="SEARCH TESTS..." value={regSearch} onChange={e => setRegSearch(e.target.value)} className="w-full p-7 bg-slate-50 rounded-[2.5rem] font-black uppercase text-sm outline-none border-2 border-transparent focus:border-red-700 shadow-inner" />{regSearch.length > 1 && (<div className="absolute top-full left-0 w-full bg-white border-2 rounded-2xl mt-2 shadow-2xl z-50 max-h-60 overflow-y-auto">{searchAvailableTests(regSearch, regLab, regHubId).map(t => (<button key={t.id} onClick={() => { if(!regCart.some(i => i.id === t.id)) setRegCart([...regCart, t]); setRegSearch(''); }} className="w-full p-6 text-left border-b hover:bg-slate-50 flex justify-between items-center group"><div><span className="text-xs font-black uppercase italic block group-hover:text-red-700 transition-colors">{t.name}</span><span className="text-[8px] text-slate-300 font-mono uppercase">{t.id}</span></div><span className="text-xs font-black text-emerald-600 italic">₹{getPrice(t, regLab, regHubId).toLocaleString()}</span></button>))}</div>)}</div>
               <div className="flex flex-wrap gap-3">{regCart.map((t, i) => (<div key={i} className="bg-slate-900 text-white px-6 py-3 rounded-2xl text-[10px] font-black uppercase flex items-center gap-4 animate-in zoom-in-95"><span>{t.name}</span><button onClick={() => setRegCart(regCart.filter((_, idx) => idx !== i))}><i className="fas fa-times-circle text-lg"></i></button></div>))}</div>
               <div className="flex gap-4 pt-6"><button onClick={() => setRegStep(1)} className="flex-1 py-6 bg-slate-100 rounded-3xl font-black uppercase text-[10px]">Back</button><button onClick={() => regCart.length > 0 && setRegStep(3)} className="flex-[2] py-6 bg-slate-900 text-white rounded-3xl font-black uppercase text-[10px] tracking-widest">Confirm Registration</button></div>
            </div>
          )}
          {regStep === 3 && (
            <div className="space-y-10 mt-10 animate-in fade-in">
               <div className="bg-slate-50 p-10 rounded-[4rem] border shadow-inner space-y-6">
                  <p className="text-3xl font-black italic uppercase text-slate-900 leading-none">{regPatient.name}</p>
                  <div className="flex justify-between items-center pt-4 border-t">
                    <p className="text-[11px] font-black text-slate-400 uppercase italic">Subtotal:</p>
                    <p className="text-xl font-black text-slate-900 italic">₹{regCart.reduce((s, t) => s + getPrice(t, regLab, regHubId), 0).toLocaleString()}</p>
                  </div>
                  
                  <div className="space-y-3 pt-4 border-t">
                    <p className="text-[10px] font-black text-slate-400 uppercase italic ml-2">Discount Option:</p>
                    <div className="flex items-center gap-4">
                      <div className="flex bg-white rounded-xl border p-1 gap-1">
                        <button 
                          onClick={() => setRegDiscountType('PERCENT')} 
                          className={`px-4 py-2 rounded-lg text-[9px] font-black uppercase transition-all ${regDiscountType === 'PERCENT' ? 'bg-slate-900 text-white' : 'text-slate-300'}`}
                        >
                          %
                        </button>
                        <button 
                          onClick={() => setRegDiscountType('FLAT')} 
                          className={`px-4 py-2 rounded-lg text-[9px] font-black uppercase transition-all ${regDiscountType === 'FLAT' ? 'bg-slate-900 text-white' : 'text-slate-300'}`}
                        >
                          ₹
                        </button>
                      </div>
                      <input 
                        type="number" 
                        value={regDiscountValue} 
                        onChange={(e) => setRegDiscountValue(e.target.value)} 
                        className="flex-1 p-4 bg-white border rounded-2xl font-black text-sm outline-none focus:border-red-700 shadow-inner" 
                        placeholder="0" 
                      />
                    </div>
                  </div>

                  <div className="flex justify-between items-center pt-6 border-t border-slate-200">
                    <p className="text-[12px] font-black text-red-700 uppercase italic tracking-wider">Final Payable:</p>
                    <p className="text-4xl font-black text-red-700 italic tracking-tighter">₹{currentRegistrationTotal.toLocaleString()}/-</p>
                  </div>
               </div>
               <button onClick={handleBooking} className="w-full py-8 bg-emerald-600 text-white rounded-[2.5rem] font-black uppercase text-xs tracking-[0.4em] shadow-xl transition-all active:scale-95 hover:bg-emerald-500">Complete Cloud Booking</button>
            </div>
          )}
        </div>
      )}

      {activeTab === 'estimate' && (
        <div className="bg-white p-12 rounded-[4.5rem] border shadow-2xl animate-in slide-in-from-right-10 space-y-10 border-t-[16px] border-blue-600">
          <div className="border-l-8 border-blue-600 pl-8 leading-none tracking-tighter"><h3 className="text-3xl font-black italic uppercase">B2B Rate Quoter</h3></div>
          
          <div className="space-y-4">
            <p className="text-[10px] font-black text-slate-400 uppercase italic ml-2">Clinic Name (Hub)</p>
            <select value={estHubId} onChange={e => setEstHubId(e.target.value)} className="w-full p-6 bg-slate-50 border-2 rounded-3xl font-black uppercase text-sm outline-none focus:border-blue-600">
              <option value="WALK_IN">WALK-IN (MRP)</option>
              {partners.map(p => <option key={p.id} value={p.id}>{p.clinicName} ({p.id})</option>)}
            </select>
          </div>

          <div className="space-y-4">
            <p className="text-[10px] font-black text-slate-300 uppercase italic ml-2">Pricing Display Mode</p>
            <div className="grid grid-cols-3 gap-2">
              {[{ id: 'RATE', label: 'B2B Rate' }, { id: 'MRP', label: 'MRP Only' }, { id: 'BOTH', label: 'Detailed' }].map(m => (
                <button key={m.id} onClick={() => setEstMode(m.id as any)} className={`py-4 rounded-2xl font-black text-[10px] uppercase transition-all ${estMode === m.id ? 'bg-blue-600 text-white shadow-lg' : 'bg-slate-50 text-slate-300'}`}>{m.label}</button>
              ))}
            </div>
          </div>
          
          <div className="flex flex-col md:flex-row gap-4">
            {getAllowedLabsForHub(estHubId).map(lab => (
              <button 
                key={lab} 
                onClick={() => setEstLab(lab)} 
                className={`flex-1 py-10 rounded-[2.5rem] border-4 font-black italic text-xl transition-all ${estLab === lab ? 'border-blue-600 bg-blue-50 text-blue-600 shadow-xl' : 'border-slate-50 text-slate-300'}`}
              >
                {lab.replace('_', ' ')}
              </button>
            ))}
          </div>
          
          <div className="relative">
            <input autoComplete="off" placeholder="QUICK SEARCH TESTS..." value={estSearch} onChange={e => setEstSearch(e.target.value)} className="w-full p-7 bg-slate-50 border-2 rounded-[2.5rem] font-black uppercase text-sm outline-none shadow-inner focus:border-blue-600" />
            {estSearch.length > 1 && (
              <div className="absolute top-full left-0 w-full bg-white border-2 rounded-2xl mt-2 shadow-2xl z-50 max-h-60 overflow-y-auto">
                {searchAvailableTests(estSearch, estLab, estHubId).map(t => (
                  <button key={t.id} onClick={() => { if(!estCart.some(i => i.id === t.id)) setEstCart([...estCart, t]); setEstSearch(''); }} className="w-full p-6 text-left border-b hover:bg-slate-50 flex justify-between items-center group">
                    <div>
                      <span className="text-xs font-black uppercase italic group-hover:text-blue-600 transition-colors block">{t.name}</span>
                      <span className="text-[8px] text-slate-300 uppercase font-mono">{t.id}</span>
                    </div>
                    <div className="text-right">
                      <span className="text-[9px] font-black text-rose-500 italic block">MRP: ₹{(t.mrp || 0).toLocaleString()}</span>
                      <span className="text-xs font-black text-blue-600 italic">B2B: ₹{getPrice(t, estLab, estHubId).toLocaleString()}</span>
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
             <div className="pt-10 border-t text-center space-y-8">
               <div className="space-y-4">
                 {(estMode === 'RATE' || estMode === 'BOTH') && (
                   <div>
                     <p className="text-[11px] font-black text-slate-300 uppercase italic leading-none">Net B2B Total</p>
                     <p className="text-5xl font-black italic tracking-tighter text-blue-600 mt-2">₹{estCart.reduce((s, t) => s + getPrice(t, estLab, estHubId), 0).toLocaleString()}/-</p>
                   </div>
                 )}
                 {(estMode === 'MRP' || estMode === 'BOTH') && (
                   <div>
                     <p className="text-[11px] font-black text-slate-300 uppercase italic leading-none">Gross MRP Total</p>
                     <p className="text-5xl font-black italic tracking-tighter text-rose-600 mt-2">₹{estCart.reduce((s, t) => s + (t.mrp || 0), 0).toLocaleString()}/-</p>
                   </div>
                 )}
               </div>
               <button onClick={() => {
                let msg = `*SEVA HEALTH SERVICE ESTIMATE*\n*LAB*: ${estLab.replace('_','')}\n-------------------------------------\n`;
                estCart.forEach(t => {
                  msg += `• *${t.name.toUpperCase()}*\n`;
                  if (estMode === 'RATE' || estMode === 'BOTH') msg += `  Rate: ₹${getPrice(t, estLab, estHubId).toLocaleString()}\n`;
                  if (estMode === 'MRP' || estMode === 'BOTH') msg += `  MRP: ₹${(t.mrp || 0).toLocaleString()}\n`;
                });
                msg += `-------------------------------------\n`;
                if (estMode === 'RATE' || estMode === 'BOTH') msg += `*B2B TOTAL*: *${estCart.reduce((s, t) => s + getPrice(t, estLab, estHubId), 0).toLocaleString()}/-*\n`;
                if (estMode === 'MRP' || estMode === 'BOTH') msg += `*MRP TOTAL*: *${estCart.reduce((s, t) => s + (t.mrp || 0), 0).toLocaleString()}/-*`;
                window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank');
               }} className="w-full py-8 bg-emerald-600 text-white rounded-[2.5rem] font-black uppercase text-xs tracking-[0.4em] shadow-2xl flex items-center justify-center gap-6 active:scale-95 transition-all"><i className="fab fa-whatsapp text-3xl"></i> Send WhatsApp Quote</button>
             </div>
          )}
        </div>
      )}

      {activeTab === 'ads' && (
        <div className="bg-white p-8 md:p-12 rounded-[3.5rem] border shadow-xl animate-in fade-in space-y-10">
          <div className="border-l-8 border-slate-900 pl-6"><h3 className="text-2xl font-black italic uppercase text-slate-900 tracking-tighter leading-none">Hub Broadcast Management</h3></div>
          <div className="bg-slate-50 p-8 rounded-[3rem] border space-y-6">
             <div className="space-y-2"><label className="text-[10px] font-black text-slate-400 uppercase ml-2 italic">Target Audience</label><select value={adTargetId} onChange={e => setAdTargetId(e.target.value)} className="w-full p-4 bg-white border rounded-2xl font-black uppercase outline-none focus:border-red-700"><option value="ALL">ALL HUBS</option>{partners.map(p => <option key={p.id} value={p.id}>{p.clinicName} ({p.id})</option>)}</select></div>
             
             <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase ml-2 italic">Add Media (Photo/Video)</label>
                  <div className="flex gap-2">
                    <input type="file" accept="image/*,video/*" id="ad-file" className="hidden" onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        const reader = new FileReader();
                        reader.onload = (ev) => {
                          const url = ev.target?.result as string;
                          const type = file.type.startsWith('video') ? 'VIDEO' : 'IMAGE';
                          setAdMedia({ url, type });
                        };
                        reader.readAsDataURL(file);
                      }
                    }} />
                    <button onClick={() => document.getElementById('ad-file')?.click()} className="flex-1 py-4 bg-white border-2 border-dashed rounded-2xl text-[9px] font-black uppercase text-slate-400 hover:border-red-700 hover:text-red-700 transition-all flex items-center justify-center gap-2">
                      <i className="fas fa-file-upload"></i> {adMedia ? 'Change File' : 'Pick File'}
                    </button>
                    {adMedia && <button onClick={() => setAdMedia(null)} className="w-12 bg-rose-50 text-rose-500 rounded-2xl"><i className="fas fa-times"></i></button>}
                  </div>
                  {adMedia && (
                    <div className="mt-2 p-2 bg-white border rounded-xl animate-in zoom-in-95">
                      {adMedia.type === 'IMAGE' ? <img src={adMedia.url} className="h-20 rounded-lg mx-auto" /> : <div className="h-20 bg-slate-900 rounded-lg flex items-center justify-center text-white text-[8px] font-black italic">VIDEO SELECTED</div>}
                    </div>
                  )}
                </div>
                <div className="space-y-2"><label className="text-[10px] font-black text-slate-400 uppercase ml-2 italic">Broadcast Note</label><textarea value={adNote} onChange={e => setAdNote(e.target.value)} className="w-full p-4 bg-white border rounded-2xl font-black uppercase outline-none focus:border-red-700 min-h-[100px]" placeholder="ANNOUNCEMENT TEXT..."></textarea></div>
             </div>
             
             <button onClick={handleAddAd} className="w-full py-5 bg-slate-900 text-white rounded-2xl font-black uppercase text-[10px] tracking-widest shadow-xl">Go Live</button>
          </div>
          <div className="space-y-4">
             {ads.map(ad => (
               <div key={ad.id} className="p-6 bg-white border-2 rounded-3xl flex justify-between items-center group hover:border-red-700 transition-all">
                  <div className="flex-1 pr-6 flex gap-4 items-center">
                    {ad.mediaUrl && (
                      <div className="w-16 h-16 rounded-xl overflow-hidden border bg-slate-50 flex-shrink-0">
                        {ad.mediaType === 'IMAGE' ? <img src={ad.mediaUrl} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center bg-slate-900 text-white"><i className="fas fa-video text-xs"></i></div>}
                      </div>
                    )}
                    <div>
                      <p className="text-[9px] font-black text-red-700 uppercase italic mb-1">Target: {ad.targetUserIds[0]}</p>
                      <p className="text-[11px] font-black italic text-slate-900 uppercase leading-relaxed">{ad.note}</p>
                    </div>
                  </div>
                  <button onClick={async () => {
                    try {
                      await runTransaction({ type: 'delete', collection: 'advertisements', id: ad.id });
                      showToast('success', 'Broadcast Deleted');
                    } catch (e) {
                      showToast('error', 'Delete Failed');
                    }
                  }} className="w-10 h-10 rounded-xl bg-rose-50 text-rose-300 hover:text-rose-600 flex items-center justify-center transition-all"><i className="fas fa-trash-alt"></i></button>
               </div>
             ))}
          </div>
        </div>
      )}

      {activeTab === 'target' && (
        <div className="bg-white p-8 md:p-12 rounded-[3.5rem] border shadow-xl animate-in fade-in space-y-10">
          <div className="border-l-8 border-emerald-600 pl-6"><h3 className="text-2xl font-black italic uppercase text-slate-900 tracking-tighter">Clinic Performance Track</h3></div>
          <div className="overflow-x-auto custom-scrollbar">
            <table className="w-full text-left min-w-[700px]">
              <thead><tr className="bg-slate-900 text-white text-[10px] font-black uppercase italic tracking-widest"><th className="p-6">Hub Detail</th><th className="p-6 text-right">Achieved (Bill)</th><th className="p-6 text-center">Current Target</th><th className="p-6 text-center">Progress</th><th className="p-6 text-center">Action</th></tr></thead>
              <tbody className="text-[11px] font-bold text-slate-600 uppercase italic">
                {partners.map(p => {
                  const bill = orders.filter(o => o.customerId === p.id && o.status !== 'CANCELLED').reduce((s,o) => s + o.totalAmount, 0);
                  const targetVal = p.monthlyTarget || 10000;
                  const progress = Math.min((bill / targetVal) * 100, 100);
                  return (
                    <tr key={p.id} className="border-b hover:bg-slate-50 transition-all">
                      <td className="p-6 font-black">{p.clinicName} <span className="text-[9px] text-slate-300 ml-2">({p.id})</span></td>
                      <td className="p-6 text-right text-slate-900 font-mono italic">₹{bill.toLocaleString()}</td>
                      <td className="p-6 text-center text-emerald-600">₹{targetVal.toLocaleString()}</td>
                      <td className="p-6 text-center w-40"><div className="h-4 bg-slate-100 rounded-full overflow-hidden border relative"><div className="absolute top-0 left-0 h-full bg-emerald-500 transition-all" style={{width:`${progress}%`}}></div><span className="relative z-10 text-[8px] font-black mix-blend-difference text-white">{progress.toFixed(0)}%</span></div></td>
                      <td className="p-6 text-center">
                        <input type="number" onBlur={async (e) => await runTransaction(async tx => tx.update(`users:${p.id}`, { monthlyTarget: parseFloat(e.target.value) }))} placeholder="Set Target" className="w-24 p-2 bg-slate-50 border rounded-lg text-center font-black" defaultValue={p.monthlyTarget} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* MODALS & OVERLAYS */}

      {isRegistering && (
        <div className="fixed inset-0 z-[3000] bg-slate-900/70 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white w-full max-w-2xl rounded-[4rem] p-12 shadow-2xl relative animate-in zoom-in-95 border-t-[16px] border-red-700 my-10">
            <button onClick={() => { setIsRegistering(false); setControlUser(null); }} className="absolute top-10 right-10 text-slate-200 hover:text-red-600 transition-colors text-3xl"><i className="fas fa-times-circle"></i></button>
            <h3 className="text-4xl font-black italic uppercase text-slate-900 tracking-tighter text-center mb-10">{controlUser ? 'Update Integration' : 'New Hub Access'}</h3>
            <form onSubmit={handleSavePartner} className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="space-y-2"><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest italic ml-2">Clinic Name*</label><input required value={regClinicName} onChange={e => setRegClinicName(e.target.value)} className="w-full p-5 bg-slate-50 border rounded-2xl font-black uppercase text-sm outline-none" placeholder="E.G. CITY LAB" /></div>
              <div className="space-y-2"><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest italic ml-2">Hub ID (Unique)*</label><input required value={regId} onChange={e => setRegId(e.target.value)} disabled={!!controlUser} className="w-full p-5 bg-slate-50 border rounded-2xl font-black uppercase text-sm outline-none disabled:opacity-50" placeholder="HUB101" /></div>
              <div className="space-y-2 relative">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest italic ml-2">Portal Access PIN*</label>
                <div className="relative">
                  <input 
                    required 
                    type={showRegPassword ? "text" : "password"} 
                    value={regPassword} 
                    onChange={e => setRegPassword(e.target.value)} 
                    className="w-full p-5 bg-slate-50 border rounded-2xl font-black text-sm outline-none pr-12" 
                    placeholder="••••••" 
                  />
                  <button 
                    type="button"
                    onClick={() => setShowRegPassword(!showRegPassword)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-300 hover:text-slate-600"
                  >
                    <i className={`fas ${showRegPassword ? 'fa-eye-slash' : 'fa-eye'}`}></i>
                  </button>
                </div>
              </div>
              <div className="space-y-2"><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest italic ml-2">Primary Contact</label><input value={regContact} onChange={e => setRegContact(e.target.value)} className="w-full p-5 bg-slate-50 border rounded-2xl text-sm outline-none" placeholder="PHONE" /></div>
              <div className="md:col-span-2 space-y-2"><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest italic ml-2">Physical Location</label><input value={regAddress} onChange={e => setRegAddress(e.target.value)} className="w-full p-5 bg-slate-50 border rounded-2xl text-sm outline-none" placeholder="ADDRESS" /></div>
              <button type="submit" className="w-full py-6 md:col-span-2 bg-slate-900 text-white rounded-[2rem] font-black uppercase text-xs tracking-[0.4em] shadow-2xl hover:bg-red-700 transition-all mt-6">Authorize Partner Cloud</button>
            </form>
          </div>
        </div>
      )}

      {message && (
        <div className={`fixed bottom-14 left-1/2 -translate-x-1/2 px-12 py-6 rounded-[2.5rem] text-white font-black text-[11px] uppercase shadow-2xl z-[6000] animate-in slide-in-from-bottom-24 border-2 border-white/20 backdrop-blur-2xl ${message.type === 'success' ? 'bg-emerald-600/90' : 'bg-rose-600/90'}`}>
           <div className="flex items-center gap-8"><i className={`fas ${message.type === 'success' ? 'fa-check-double' : 'fa-triangle-exclamation'} text-2xl`}/><span className="tracking-[0.4em] italic">{message.text}</span></div>
        </div>
      )}
    </div>
  );
}