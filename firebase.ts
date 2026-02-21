import Gun from 'https://esm.sh/gun@0.2020.1239/gun.js';

// Initialize Gun with public relay peers for cross-device/cross-browser sync
const gun = Gun({
  peers: [
    'https://gun-manhattan.herokuapp.com/gun',
    'https://p2p.xyz/gun'
  ]
});

// A unique namespace for this portal to prevent collisions with other Gun users
const APP_KEY = 'seva_health_service_v3_production_stable';
const appData = gun.get(APP_KEY);

const initialData: any = {
  users: [
    { id: 'SHS', name: 'ADMIN SEVA', role: 'ADMIN', totalPaid: 0, walletBalance: 0, contactNumber: '9988776655', password: '111', address: 'Main Hub, Sector 5', status: 'ACTIVE', isDeleted: false },
    { id: 'LK01', name: 'L.K DAS', clinicName: 'L.K DAS', role: 'USER', totalPaid: 0, walletBalance: 5000, contactNumber: '9876543210', password: '123', address: 'Kolkata, MG Road', status: 'ACTIVE', isDeleted: false, paymentMode: 'LIMIT', walletLimit: 0 },
    { id: 'AK02', name: 'AK CLINIC', clinicName: 'AK CLINIC', role: 'USER', totalPaid: 0, walletBalance: 2500, contactNumber: '9123456789', password: '456', address: 'Howrah, Station Rd', status: 'ACTIVE', isDeleted: false, paymentMode: 'DAILY' }
  ],
  tests: [
    { id: 'T001', name: 'CBC (Complete Blood Count)', category: 'HAEMATOLOGY', longLifePrice: 150, thyrocarePrice: 200, mrp: 350 },
    { id: 'T002', name: 'Lipid Profile', category: 'BIOCHEMISTRY', longLifePrice: 450, thyrocarePrice: 500, mrp: 1200 },
    { id: 'T003', name: 'Thyroid Profile (T3, T4, TSH)', category: 'IMMUNOLOGY', longLifePrice: 300, thyrocarePrice: 350, mrp: 800 },
    { id: 'T004', name: 'HbA1c', category: 'DIABETOLOGY', longLifePrice: 250, thyrocarePrice: 280, mrp: 600 }
  ],
  orders: [],
  transactions: [],
  advertisements: []
};

// Local cache to provide synchronous 'get' access
let localState: any = { ...initialData };

const listeners: Record<string, Function[]> = {};

const triggerListeners = (collection: string) => {
  if (listeners[collection]) {
    const data = Array.isArray(localState[collection]) ? localState[collection] : [];
    const snap = { 
      docs: data.map((item: any) => ({
        data: () => item,
        id: item.id
      }))
    };
    listeners[collection].forEach(callback => callback(snap));
  }
};

// Listen for any changes in the cloud and update local state
appData.on((data: any) => {
  if (data) {
    Object.keys(data).forEach(key => {
      if (key !== '_' && data[key]) {
        try {
          const raw = data[key];
          const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
          
          // Ensure we always store arrays for known collections
          if (['users', 'tests', 'orders', 'transactions', 'advertisements'].includes(key)) {
            localState[key] = Array.isArray(parsed) ? parsed : [];
          } else {
            localState[key] = parsed;
          }
          
          if (listeners[key]) {
            triggerListeners(key);
          }
        } catch (e) {
          // If not valid JSON or unexpected format, ignore or set empty
          if (['users', 'tests', 'orders', 'transactions', 'advertisements'].includes(key)) {
             localState[key] = localState[key] || [];
          }
        }
      }
    });
  }
});

export const db = {
  get: (collection: string) => Array.isArray(localState[collection]) ? localState[collection] : [],
};

export const onSnapshot = (collection: string, callback: any) => {
  if (!listeners[collection]) listeners[collection] = [];
  listeners[collection].push(callback);
  
  const data = Array.isArray(localState[collection]) ? localState[collection] : [];
  // Send current state immediately
  callback({ 
    docs: data.map((item: any) => ({
      data: () => item,
      id: item.id
    }))
  });

  return () => {
    listeners[collection] = listeners[collection].filter(l => l !== callback);
  };
};

export const runTransaction = async (action: (tx: any) => Promise<void>) => {
  const tx = {
    update: (path: string, data: any) => {
      const [collection, id] = path.split(':');
      if (!localState[collection] || !Array.isArray(localState[collection])) return;
      const idx = localState[collection].findIndex((item: any) => item.id === id);
      if (idx !== -1) {
        localState[collection][idx] = { ...localState[collection][idx], ...data };
        appData.get(collection).put(JSON.stringify(localState[collection]));
        triggerListeners(collection);
      }
    },
    set: (collection: string, data: any) => {
      if (!localState[collection] || !Array.isArray(localState[collection])) localState[collection] = [];
      const idx = localState[collection].findIndex((item: any) => item.id === data.id);
      if (idx !== -1) {
        localState[collection][idx] = data;
      } else {
        localState[collection].push(data);
      }
      appData.get(collection).put(JSON.stringify(localState[collection]));
      triggerListeners(collection);
    },
    delete: (collection: string, id: string) => {
      if (!localState[collection] || !Array.isArray(localState[collection])) return;
      localState[collection] = localState[collection].filter((item: any) => item.id !== id);
      appData.get(collection).put(JSON.stringify(localState[collection]));
      triggerListeners(collection);
    }
  };
  await action(tx);
};

// Seed initial data if the database is empty (First run)
setTimeout(() => {
  const orders = Array.isArray(localState.orders) ? localState.orders : [];
  const users = Array.isArray(localState.users) ? localState.users : [];
  
  if (orders.length === 0 && users.length <= 3) {
     Object.keys(initialData).forEach(key => {
       appData.get(key).put(JSON.stringify(initialData[key]));
     });
  }
}, 3000);