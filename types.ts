import React from 'react';

export interface InventoryRecord {
  itemId: string;
  itemName: string;
  brandName: string;
  upc: string;
  uom: string;
  warehouseId: string;
  warehouseName: string;
  netScheduled: number;
  incomingScheduled: number;
  recalled: number;
  totalSellable: number;
  sellableWarehouse: number;
  sellableInBetween: number;
  sellableDarkstore: number;
  totalUnsellable: number;
  unsellableDamaged: number;
  unsellableLost: number;
  unsellableExpired: number;
  unsellableNearExpiry: number;
  soldLast7?: number;
  soldLast15?: number;
  soldLast30?: number;
  reportSalesQty?: number;
  reportSalesASP?: number;
  forecast45d?: number;
}

export interface SalesRecord {
  orderId?: string;
  itemId: string;
  itemName?: string;
  brandName?: string;
  quantity: number;
  revenue: number;
  date?: string; // YYYY-MM-DD
  customerCity?: string;
}

export interface AdvertisementRecord {
  date: string;
  campaignId: string;
  campaignName: string;
  targetingType: string;
  targetingValue: string;
  matchType: string;
  impressions: number;
  cpm: number;
  spend: number; // Estimated Budget Consumed
  directSales: number;
  indirectSales: number;
  directRoas: number;
  totalRoas: number;
  directUnits: number;
  indirectUnits: number;
  ctr?: number; // Calculated if not present
}

export interface MergedItem {
  itemId: string;
  itemName: string;
  brandName: string;
  totalSellable: number;
  totalUnsellable: number;
  salesVelocity: number; 
  totalRevenue: number; 
  avgSalesPrice: number;
  inventoryRunway: number; 
  shipmentForecast45d: number;
  warehouseDistribution: { [key: string]: number };
  stockStatus: 'Healthy' | 'Overstocked' | 'Stockout' | 'Low';
}

export interface ChartDataPoint {
  date: string;
  revenue: number;
  quantity: number;
  label: string;
  spend?: number;
  impressions?: number;
  roas?: number;
}

export interface DataSource {
  id: string;
  type: FileType;
  fileName: string;
  uploadDate: number;
  isActive: boolean;
  rowCount: number;
  rawContent?: string;
  parsedData?: (InventoryRecord | SalesRecord | AdvertisementRecord)[];
  dateRange?: { start: string; end: string };
  fileHash?: string;
}

export interface ProductCostConfig {
  itemId: string;
  costPrice: number; // COGS per unit in INR
  commissionPct?: number; // Optional SKU override %
  shippingFee?: number; // Optional SKU override INR
}

export type CostTier = 'T1' | 'T2' | 'T3' | 'T4';

export interface GlobalProfitConfig {
  defaultCogsPct: number; // Fallback % of ASP if SKU COGS not provided (e.g. 55%)
  defaultCommissionPct: number; // Blinkit commission % (e.g. 15%)
  defaultShippingPerUnit: number; // Avg handling/shipping fee per unit INR (e.g. 25)
  gstOnFeesPct: number; // GST % on commission/fees (e.g. 18%)
  activeCostTier?: CostTier; // Tier cost used in P&L calculation (default T1)
  t2DiscountPct?: number; // T2 = T1 - 10%
  t3DiscountPct?: number; // T3 = T2 - 5%
  t4DiscountPct?: number; // T4 = T3 - 5%
}

export type FileType = 'INVENTORY' | 'SALES' | 'ADVERTISEMENT';

export enum ViewMode {
  DASHBOARD = 'DASHBOARD',
  INVENTORY_LIST = 'INVENTORY_LIST',
  ADS_ANALYTICS = 'ADS_ANALYTICS',
  REPLENISHMENT = 'REPLENISHMENT',
  PROFIT_ANALYTICS = 'PROFIT_ANALYTICS',
  ACTION_ALERTS = 'ACTION_ALERTS',
  DATA_IMPORT = 'DATA_IMPORT',
  PRODUCT_DETAIL = 'PRODUCT_DETAIL',
  CITY_DETAIL = 'CITY_DETAIL',
}