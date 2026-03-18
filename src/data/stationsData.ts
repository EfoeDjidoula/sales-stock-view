// Station data extracted from the Excel file
export interface DailyRecord {
  date: string;
  products: ProductRecord[];
  totalSales: number;
}

export interface ProductRecord {
  product: string;
  indexArrivee: number;
  indexDepart: number;
  quantity: number;
  unitPrice: number;
  amount: number;
}

export interface StockRecord {
  tank: string;
  capacity: number;
  openingStock: number;
  closingStock: number;
  output: number;
}

export interface Station {
  id: string;
  name: string;
  location: string;
  dailyRecords: DailyRecord[];
  currentStock: StockRecord[];
}

// Sample data based on the Excel structure
export const stations: Station[] = [
  {
    id: "akassato",
    name: "AKASSATO",
    location: "Akassato",
    dailyRecords: [],
    currentStock: [
      { tank: "SUPER (1) 15000 L", capacity: 15000, openingStock: 0, closingStock: 0, output: 0 },
      { tank: "SUPER (2) 5000 L", capacity: 5000, openingStock: 0, closingStock: 0, output: 0 },
      { tank: "GASOIL (1) 15000 L", capacity: 15000, openingStock: 0, closingStock: 0, output: 0 },
      { tank: "GASOIL (2) 5000 L", capacity: 5000, openingStock: 0, closingStock: 0, output: 0 },
    ]
  },
  {
    id: "allada",
    name: "ALLADA",
    location: "Allada",
    dailyRecords: [],
    currentStock: [
      { tank: "SUPER 10000 L", capacity: 10000, openingStock: 0, closingStock: 0, output: 0 },
      { tank: "GASOIL (1) 20000 L", capacity: 20000, openingStock: 0, closingStock: 0, output: 0 },
      { tank: "GASOIL (2) 20000 L", capacity: 20000, openingStock: 0, closingStock: 0, output: 0 },
    ]
  },
  {
    id: "dedokpo",
    name: "DEDOKPO",
    location: "Akpakpa",
    dailyRecords: [],
    currentStock: [
      { tank: "SUPER (1) 20000 L", capacity: 20000, openingStock: 0, closingStock: 0, output: 0 },
      { tank: "SUPER (2) 20000 L", capacity: 20000, openingStock: 0, closingStock: 0, output: 0 },
      { tank: "GASOIL (1) 20000 L", capacity: 20000, openingStock: 0, closingStock: 0, output: 0 },
      { tank: "GASOIL (2) 20000 L", capacity: 20000, openingStock: 0, closingStock: 0, output: 0 },
    ]
  },
  {
    id: "dekoungbe",
    name: "DEKOUNGBE",
    location: "Dèkoungbé",
    dailyRecords: [],
    currentStock: [
      { tank: "SUPER (1) 15000 L", capacity: 15000, openingStock: 0, closingStock: 0, output: 0 },
      { tank: "GASOIL (1) 20000 L", capacity: 20000, openingStock: 0, closingStock: 0, output: 0 },
    ]
  },
  {
    id: "djougou",
    name: "DJOUGOU",
    location: "Djougou",
    dailyRecords: [],
    currentStock: [
      { tank: "SUPER 10000 L", capacity: 10000, openingStock: 0, closingStock: 0, output: 0 },
      { tank: "GASOIL (1) 15000 L", capacity: 15000, openingStock: 0, closingStock: 0, output: 0 },
    ]
  },
  {
    id: "enangnon",
    name: "ENANGNON",
    location: "Cotonou",
    dailyRecords: [],
    currentStock: [
      { tank: "SUPER (1) 15000 L", capacity: 15000, openingStock: 0, closingStock: 0, output: 0 },
      { tank: "GASOIL (1) 15000 L", capacity: 15000, openingStock: 0, closingStock: 0, output: 0 },
    ]
  },
  {
    id: "fidjrosse",
    name: "FIDJROSSE",
    location: "Cotonou",
    dailyRecords: [],
    currentStock: [
      { tank: "SUPER (1) 10000 L", capacity: 10000, openingStock: 0, closingStock: 0, output: 0 },
      { tank: "GASOIL (1) 15000 L", capacity: 15000, openingStock: 0, closingStock: 0, output: 0 },
    ]
  },
  {
    id: "godomey",
    name: "GODOMEY",
    location: "Godomey",
    dailyRecords: [],
    currentStock: [
      { tank: "SUPER (1) 10000 L", capacity: 10000, openingStock: 0, closingStock: 0, output: 0 },
      { tank: "GASOIL (1) 15000 L", capacity: 15000, openingStock: 0, closingStock: 0, output: 0 },
    ]
  },
  {
    id: "hevie",
    name: "HEVIE",
    location: "Hêvié",
    dailyRecords: [],
    currentStock: [
      { tank: "SUPER (1) 10000 L", capacity: 10000, openingStock: 0, closingStock: 0, output: 0 },
      { tank: "GASOIL (1) 15000 L", capacity: 15000, openingStock: 0, closingStock: 0, output: 0 },
    ]
  },
  {
    id: "parakou",
    name: "PARAKOU",
    location: "Parakou",
    dailyRecords: [],
    currentStock: [
      { tank: "SUPER (1) 15000 L", capacity: 15000, openingStock: 0, closingStock: 0, output: 0 },
      { tank: "GASOIL (1) 20000 L", capacity: 20000, openingStock: 0, closingStock: 0, output: 0 },
    ]
  },
  {
    id: "tankpe",
    name: "TANKPE",
    location: "Tankpè",
    dailyRecords: [],
    currentStock: [
      { tank: "SUPER (1) 10000 L", capacity: 10000, openingStock: 0, closingStock: 0, output: 0 },
      { tank: "GASOIL (1) 10000 L", capacity: 10000, openingStock: 0, closingStock: 0, output: 0 },
    ]
  },
];

// Helper functions
export const formatCurrency = (amount: number): string => {
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'XOF',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
};

export const formatNumber = (num: number): string => {
  return new Intl.NumberFormat('fr-FR').format(num);
};

export const getStationTotalSales = (station: Station, period: 'day' | 'week' | 'month'): number => {
  const records = station.dailyRecords;
  switch (period) {
    case 'day':
      return records[records.length - 1]?.totalSales || 0;
    case 'week':
      return records.slice(-7).reduce((sum, r) => sum + r.totalSales, 0);
    case 'month':
      return records.reduce((sum, r) => sum + r.totalSales, 0);
  }
};

export const getAllStationsTotalSales = (period: 'day' | 'week' | 'month'): number => {
  return stations.reduce((sum, station) => sum + getStationTotalSales(station, period), 0);
};

export const getStockPercentage = (stock: StockRecord): number => {
  return Math.round((stock.closingStock / stock.capacity) * 100);
};
