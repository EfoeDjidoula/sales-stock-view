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
    location: "Abomey-Calavi",
    dailyRecords: [
      {
        date: "2026-01-01",
        products: [
          { product: "SUPER", indexArrivee: 71534.04, indexDepart: 71441.91, quantity: 225.25, unitPrice: 695, amount: 454258.95 },
          { product: "GASOIL", indexArrivee: 390759.00, indexDepart: 390449.41, quantity: 463.73, unitPrice: 720, amount: 333885.60 },
        ],
        totalSales: 788144.55
      },
      {
        date: "2026-01-02",
        products: [
          { product: "SUPER", indexArrivee: 71535.48, indexDepart: 71534.04, quantity: 498.58, unitPrice: 695, amount: 346513.10 },
          { product: "GASOIL", indexArrivee: 391143.61, indexDepart: 390759.00, quantity: 576.87, unitPrice: 720, amount: 415346.40 },
        ],
        totalSales: 761859.50
      },
      {
        date: "2026-01-03",
        products: [
          { product: "SUPER", indexArrivee: 71535.48, indexDepart: 71535.48, quantity: 469.21, unitPrice: 695, amount: 326100.95 },
          { product: "GASOIL", indexArrivee: 391413.85, indexDepart: 391143.61, quantity: 619.05, unitPrice: 720, amount: 445716.00 },
        ],
        totalSales: 771816.95
      },
      {
        date: "2026-01-04",
        products: [
          { product: "SUPER", indexArrivee: 71535.73, indexDepart: 71535.48, quantity: 111.79, unitPrice: 695, amount: 77694.05 },
          { product: "GASOIL", indexArrivee: 391802.84, indexDepart: 391413.85, quantity: 711.41, unitPrice: 720, amount: 512215.20 },
        ],
        totalSales: 589909.25
      },
    ],
    currentStock: [
      { tank: "SUPER (1) 15000 L", capacity: 15000, openingStock: 340, closingStock: 340, output: 0.25 },
      { tank: "SUPER (2) 5000 L", capacity: 5000, openingStock: 252, closingStock: 245, output: 111.54 },
      { tank: "GASOIL (1) 15000 L", capacity: 15000, openingStock: 3510, closingStock: 3520, output: 482.75 },
      { tank: "GASOIL (2) 5000 L", capacity: 5000, openingStock: 412, closingStock: 405, output: 228.66 },
    ]
  },
  {
    id: "allada",
    name: "ALLADA",
    location: "Allada",
    dailyRecords: [
      {
        date: "2026-01-01",
        products: [
          { product: "SUPER", indexArrivee: 45230.50, indexDepart: 45120.30, quantity: 110.20, unitPrice: 695, amount: 76589.00 },
          { product: "GASOIL", indexArrivee: 128450.00, indexDepart: 128150.80, quantity: 299.20, unitPrice: 720, amount: 215424.00 },
        ],
        totalSales: 292013.00
      },
      {
        date: "2026-01-02",
        products: [
          { product: "SUPER", indexArrivee: 45380.20, indexDepart: 45230.50, quantity: 149.70, unitPrice: 695, amount: 104041.50 },
          { product: "GASOIL", indexArrivee: 128780.50, indexDepart: 128450.00, quantity: 330.50, unitPrice: 720, amount: 237960.00 },
        ],
        totalSales: 342001.50
      },
      {
        date: "2026-01-03",
        products: [
          { product: "SUPER", indexArrivee: 45520.80, indexDepart: 45380.20, quantity: 140.60, unitPrice: 695, amount: 97717.00 },
          { product: "GASOIL", indexArrivee: 129100.30, indexDepart: 128780.50, quantity: 319.80, unitPrice: 720, amount: 230256.00 },
        ],
        totalSales: 327973.00
      },
      {
        date: "2026-01-04",
        products: [
          { product: "SUPER", indexArrivee: 45650.40, indexDepart: 45520.80, quantity: 129.60, unitPrice: 695, amount: 90072.00 },
          { product: "GASOIL", indexArrivee: 129420.60, indexDepart: 129100.30, quantity: 320.30, unitPrice: 720, amount: 230616.00 },
        ],
        totalSales: 320688.00
      },
    ],
    currentStock: [
      { tank: "SUPER (1) 10000 L", capacity: 10000, openingStock: 2500, closingStock: 2370, output: 129.60 },
      { tank: "GASOIL (1) 10000 L", capacity: 10000, openingStock: 4200, closingStock: 3880, output: 320.30 },
    ]
  },
  {
    id: "dedokpo",
    name: "DEDOKPO",
    location: "Cotonou",
    dailyRecords: [
      {
        date: "2026-01-01",
        products: [
          { product: "SUPER", indexArrivee: 89120.30, indexDepart: 88950.20, quantity: 170.10, unitPrice: 695, amount: 118219.50 },
          { product: "GASOIL", indexArrivee: 245680.00, indexDepart: 245320.50, quantity: 359.50, unitPrice: 720, amount: 258840.00 },
        ],
        totalSales: 377059.50
      },
      {
        date: "2026-01-02",
        products: [
          { product: "SUPER", indexArrivee: 89320.80, indexDepart: 89120.30, quantity: 200.50, unitPrice: 695, amount: 139347.50 },
          { product: "GASOIL", indexArrivee: 246120.30, indexDepart: 245680.00, quantity: 440.30, unitPrice: 720, amount: 317016.00 },
        ],
        totalSales: 456363.50
      },
      {
        date: "2026-01-03",
        products: [
          { product: "SUPER", indexArrivee: 89550.60, indexDepart: 89320.80, quantity: 229.80, unitPrice: 695, amount: 159711.00 },
          { product: "GASOIL", indexArrivee: 246580.90, indexDepart: 246120.30, quantity: 460.60, unitPrice: 720, amount: 331632.00 },
        ],
        totalSales: 491343.00
      },
      {
        date: "2026-01-04",
        products: [
          { product: "SUPER", indexArrivee: 89780.20, indexDepart: 89550.60, quantity: 229.60, unitPrice: 695, amount: 159572.00 },
          { product: "GASOIL", indexArrivee: 247050.40, indexDepart: 246580.90, quantity: 469.50, unitPrice: 720, amount: 338040.00 },
        ],
        totalSales: 497612.00
      },
    ],
    currentStock: [
      { tank: "SUPER (1) 15000 L", capacity: 15000, openingStock: 5800, closingStock: 5570, output: 229.60 },
      { tank: "GASOIL (1) 15000 L", capacity: 15000, openingStock: 7200, closingStock: 6730, output: 469.50 },
    ]
  },
  {
    id: "fidjrosse",
    name: "FIDJROSSE",
    location: "Cotonou",
    dailyRecords: [
      {
        date: "2026-01-01",
        products: [
          { product: "SUPER", indexArrivee: 52340.60, indexDepart: 52180.20, quantity: 160.40, unitPrice: 695, amount: 111478.00 },
          { product: "GASOIL", indexArrivee: 178920.50, indexDepart: 178580.30, quantity: 340.20, unitPrice: 720, amount: 244944.00 },
        ],
        totalSales: 356422.00
      },
      {
        date: "2026-01-02",
        products: [
          { product: "SUPER", indexArrivee: 52520.30, indexDepart: 52340.60, quantity: 179.70, unitPrice: 695, amount: 124891.50 },
          { product: "GASOIL", indexArrivee: 179310.80, indexDepart: 178920.50, quantity: 390.30, unitPrice: 720, amount: 281016.00 },
        ],
        totalSales: 405907.50
      },
      {
        date: "2026-01-03",
        products: [
          { product: "SUPER", indexArrivee: 52710.50, indexDepart: 52520.30, quantity: 190.20, unitPrice: 695, amount: 132189.00 },
          { product: "GASOIL", indexArrivee: 179720.40, indexDepart: 179310.80, quantity: 409.60, unitPrice: 720, amount: 294912.00 },
        ],
        totalSales: 427101.00
      },
      {
        date: "2026-01-04",
        products: [
          { product: "SUPER", indexArrivee: 52890.80, indexDepart: 52710.50, quantity: 180.30, unitPrice: 695, amount: 125308.50 },
          { product: "GASOIL", indexArrivee: 180150.20, indexDepart: 179720.40, quantity: 429.80, unitPrice: 720, amount: 309456.00 },
        ],
        totalSales: 434764.50
      },
    ],
    currentStock: [
      { tank: "SUPER (1) 10000 L", capacity: 10000, openingStock: 3200, closingStock: 3020, output: 180.30 },
      { tank: "GASOIL (1) 15000 L", capacity: 15000, openingStock: 6800, closingStock: 6370, output: 429.80 },
    ]
  },
  {
    id: "godomey",
    name: "GODOMEY",
    location: "Abomey-Calavi",
    dailyRecords: [
      {
        date: "2026-01-01",
        products: [
          { product: "SUPER", indexArrivee: 38760.20, indexDepart: 38580.50, quantity: 179.70, unitPrice: 695, amount: 124891.50 },
          { product: "GASOIL", indexArrivee: 156340.80, indexDepart: 155980.20, quantity: 360.60, unitPrice: 720, amount: 259632.00 },
        ],
        totalSales: 384523.50
      },
      {
        date: "2026-01-02",
        products: [
          { product: "SUPER", indexArrivee: 38960.50, indexDepart: 38760.20, quantity: 200.30, unitPrice: 695, amount: 139208.50 },
          { product: "GASOIL", indexArrivee: 156780.30, indexDepart: 156340.80, quantity: 439.50, unitPrice: 720, amount: 316440.00 },
        ],
        totalSales: 455648.50
      },
      {
        date: "2026-01-03",
        products: [
          { product: "SUPER", indexArrivee: 39180.80, indexDepart: 38960.50, quantity: 220.30, unitPrice: 695, amount: 153108.50 },
          { product: "GASOIL", indexArrivee: 157250.60, indexDepart: 156780.30, quantity: 470.30, unitPrice: 720, amount: 338616.00 },
        ],
        totalSales: 491724.50
      },
      {
        date: "2026-01-04",
        products: [
          { product: "SUPER", indexArrivee: 39420.30, indexDepart: 39180.80, quantity: 239.50, unitPrice: 695, amount: 166452.50 },
          { product: "GASOIL", indexArrivee: 157750.20, indexDepart: 157250.60, quantity: 499.60, unitPrice: 720, amount: 359712.00 },
        ],
        totalSales: 526164.50
      },
    ],
    currentStock: [
      { tank: "SUPER (1) 10000 L", capacity: 10000, openingStock: 4100, closingStock: 3860, output: 239.50 },
      { tank: "GASOIL (1) 15000 L", capacity: 15000, openingStock: 8500, closingStock: 8000, output: 499.60 },
    ]
  },
  {
    id: "parakou",
    name: "PARAKOU",
    location: "Parakou",
    dailyRecords: [
      {
        date: "2026-01-01",
        products: [
          { product: "SUPER", indexArrivee: 28450.30, indexDepart: 28280.60, quantity: 169.70, unitPrice: 695, amount: 117941.50 },
          { product: "GASOIL", indexArrivee: 98760.50, indexDepart: 98420.80, quantity: 339.70, unitPrice: 720, amount: 244584.00 },
        ],
        totalSales: 362525.50
      },
      {
        date: "2026-01-02",
        products: [
          { product: "SUPER", indexArrivee: 28640.80, indexDepart: 28450.30, quantity: 190.50, unitPrice: 695, amount: 132397.50 },
          { product: "GASOIL", indexArrivee: 99180.30, indexDepart: 98760.50, quantity: 419.80, unitPrice: 720, amount: 302256.00 },
        ],
        totalSales: 434653.50
      },
      {
        date: "2026-01-03",
        products: [
          { product: "SUPER", indexArrivee: 28850.20, indexDepart: 28640.80, quantity: 209.40, unitPrice: 695, amount: 145533.00 },
          { product: "GASOIL", indexArrivee: 99620.60, indexDepart: 99180.30, quantity: 440.30, unitPrice: 720, amount: 317016.00 },
        ],
        totalSales: 462549.00
      },
      {
        date: "2026-01-04",
        products: [
          { product: "SUPER", indexArrivee: 29080.50, indexDepart: 28850.20, quantity: 230.30, unitPrice: 695, amount: 160058.50 },
          { product: "GASOIL", indexArrivee: 100080.40, indexDepart: 99620.60, quantity: 459.80, unitPrice: 720, amount: 331056.00 },
        ],
        totalSales: 491114.50
      },
    ],
    currentStock: [
      { tank: "SUPER (1) 15000 L", capacity: 15000, openingStock: 6200, closingStock: 5970, output: 230.30 },
      { tank: "GASOIL (1) 20000 L", capacity: 20000, openingStock: 12500, closingStock: 12040, output: 459.80 },
    ]
  },
  {
    id: "tankpe",
    name: "TANKPE",
    location: "Porto-Novo",
    dailyRecords: [
      {
        date: "2026-01-01",
        products: [
          { product: "SUPER", indexArrivee: 15680.40, indexDepart: 15520.80, quantity: 159.60, unitPrice: 695, amount: 110922.00 },
          { product: "GASOIL", indexArrivee: 67890.20, indexDepart: 67580.50, quantity: 309.70, unitPrice: 720, amount: 222984.00 },
        ],
        totalSales: 333906.00
      },
      {
        date: "2026-01-02",
        products: [
          { product: "SUPER", indexArrivee: 15860.30, indexDepart: 15680.40, quantity: 179.90, unitPrice: 695, amount: 125030.50 },
          { product: "GASOIL", indexArrivee: 68250.80, indexDepart: 67890.20, quantity: 360.60, unitPrice: 720, amount: 259632.00 },
        ],
        totalSales: 384662.50
      },
      {
        date: "2026-01-03",
        products: [
          { product: "SUPER", indexArrivee: 16050.60, indexDepart: 15860.30, quantity: 190.30, unitPrice: 695, amount: 132258.50 },
          { product: "GASOIL", indexArrivee: 68640.50, indexDepart: 68250.80, quantity: 389.70, unitPrice: 720, amount: 280584.00 },
        ],
        totalSales: 412842.50
      },
      {
        date: "2026-01-04",
        products: [
          { product: "SUPER", indexArrivee: 16260.80, indexDepart: 16050.60, quantity: 210.20, unitPrice: 695, amount: 146089.00 },
          { product: "GASOIL", indexArrivee: 69050.30, indexDepart: 68640.50, quantity: 409.80, unitPrice: 720, amount: 295056.00 },
        ],
        totalSales: 441145.00
      },
    ],
    currentStock: [
      { tank: "SUPER (1) 10000 L", capacity: 10000, openingStock: 3800, closingStock: 3590, output: 210.20 },
      { tank: "GASOIL (1) 10000 L", capacity: 10000, openingStock: 5600, closingStock: 5190, output: 409.80 },
    ]
  },
  {
    id: "djougou",
    name: "DJOUGOU",
    location: "Djougou",
    dailyRecords: [
      {
        date: "2026-01-01",
        products: [
          { product: "SUPER", indexArrivee: 12340.50, indexDepart: 12180.20, quantity: 160.30, unitPrice: 695, amount: 111408.50 },
          { product: "GASOIL", indexArrivee: 45680.30, indexDepart: 45380.60, quantity: 299.70, unitPrice: 720, amount: 215784.00 },
        ],
        totalSales: 327192.50
      },
      {
        date: "2026-01-02",
        products: [
          { product: "SUPER", indexArrivee: 12520.80, indexDepart: 12340.50, quantity: 180.30, unitPrice: 695, amount: 125308.50 },
          { product: "GASOIL", indexArrivee: 46020.50, indexDepart: 45680.30, quantity: 340.20, unitPrice: 720, amount: 244944.00 },
        ],
        totalSales: 370252.50
      },
      {
        date: "2026-01-03",
        products: [
          { product: "SUPER", indexArrivee: 12720.30, indexDepart: 12520.80, quantity: 199.50, unitPrice: 695, amount: 138652.50 },
          { product: "GASOIL", indexArrivee: 46380.80, indexDepart: 46020.50, quantity: 360.30, unitPrice: 720, amount: 259416.00 },
        ],
        totalSales: 398068.50
      },
      {
        date: "2026-01-04",
        products: [
          { product: "SUPER", indexArrivee: 12940.60, indexDepart: 12720.30, quantity: 220.30, unitPrice: 695, amount: 153108.50 },
          { product: "GASOIL", indexArrivee: 46760.20, indexDepart: 46380.80, quantity: 379.40, unitPrice: 720, amount: 273168.00 },
        ],
        totalSales: 426276.50
      },
    ],
    currentStock: [
      { tank: "SUPER (1) 10000 L", capacity: 10000, openingStock: 4500, closingStock: 4280, output: 220.30 },
      { tank: "GASOIL (1) 15000 L", capacity: 15000, openingStock: 8200, closingStock: 7820, output: 379.40 },
    ]
  },
  {
    id: "dekoungbe",
    name: "DEKOUNGBE",
    location: "Cotonou",
    dailyRecords: [
      {
        date: "2026-01-01",
        products: [
          { product: "SUPER", indexArrivee: 22560.30, indexDepart: 22380.50, quantity: 179.80, unitPrice: 695, amount: 124961.00 },
          { product: "GASOIL", indexArrivee: 78450.60, indexDepart: 78120.30, quantity: 330.30, unitPrice: 720, amount: 237816.00 },
        ],
        totalSales: 362777.00
      },
      {
        date: "2026-01-02",
        products: [
          { product: "SUPER", indexArrivee: 22780.50, indexDepart: 22560.30, quantity: 220.20, unitPrice: 695, amount: 153039.00 },
          { product: "GASOIL", indexArrivee: 78850.20, indexDepart: 78450.60, quantity: 399.60, unitPrice: 720, amount: 287712.00 },
        ],
        totalSales: 440751.00
      },
      {
        date: "2026-01-03",
        products: [
          { product: "SUPER", indexArrivee: 23020.80, indexDepart: 22780.50, quantity: 240.30, unitPrice: 695, amount: 167008.50 },
          { product: "GASOIL", indexArrivee: 79280.50, indexDepart: 78850.20, quantity: 430.30, unitPrice: 720, amount: 309816.00 },
        ],
        totalSales: 476824.50
      },
      {
        date: "2026-01-04",
        products: [
          { product: "SUPER", indexArrivee: 23280.30, indexDepart: 23020.80, quantity: 259.50, unitPrice: 695, amount: 180352.50 },
          { product: "GASOIL", indexArrivee: 79740.80, indexDepart: 79280.50, quantity: 460.30, unitPrice: 720, amount: 331416.00 },
        ],
        totalSales: 511768.50
      },
    ],
    currentStock: [
      { tank: "SUPER (1) 15000 L", capacity: 15000, openingStock: 7200, closingStock: 6940, output: 259.50 },
      { tank: "GASOIL (1) 20000 L", capacity: 20000, openingStock: 11800, closingStock: 11340, output: 460.30 },
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
