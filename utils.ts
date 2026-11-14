import { InventoryRecord, SalesRecord, AdvertisementRecord, MergedItem, ChartDataPoint } from './types';
import * as XLSX from 'xlsx';

// Helper to read file as text (CSV)
export const readFileAsText = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target?.result as string);
    reader.onerror = (e) => reject(new Error("Failed to read file"));
    reader.readAsText(file);
  });
};

// Helper to read Excel file and convert to CSV string
export const readExcelAsCSV = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const csv = XLSX.utils.sheet_to_csv(worksheet);
        resolve(csv);
      } catch (err) {
        reject(new Error("Failed to parse Excel file. Ensure it is not password protected."));
      }
    };
    reader.onerror = (e) => reject(new Error("Failed to read file"));
    reader.readAsArrayBuffer(file);
  });
};

// Helper to read all sheets from an Ads Excel file into a serialized multi-sheet CSV string
export const ADS_SHEET_MARKER = '###BLINKIT_SHEET:';

export const readExcelAdsSheets = (file: File): Promise<{ content: string; sheetNames: string[] }> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array', cellDates: true });
        const sections: string[] = [];
        const includedSheets: string[] = [];

        for (const sheetName of workbook.SheetNames) {
          const worksheet = workbook.Sheets[sheetName];
          if (!worksheet) continue;
          const csv = XLSX.utils.sheet_to_csv(worksheet, { dateNF: 'yyyy-mm-dd' });
          if (csv && csv.trim().length > 0) {
            sections.push(`${ADS_SHEET_MARKER}${sheetName}###\n${csv.trim()}`);
            includedSheets.push(sheetName);
          }
        }

        if (sections.length === 0) {
          reject(new Error('Excel file contains no readable sheets.'));
          return;
        }

        resolve({
          content: sections.join('\n'),
          sheetNames: includedSheets,
        });
      } catch {
        reject(new Error('Failed to parse Excel file. Ensure it is not password protected.'));
      }
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsArrayBuffer(file);
  });
};

const cleanString = (val: string) => val ? val.replace(/^"|"$/g, '').replace(/""/g, '"').trim() : '';
const parseNum = (val: string) => {
  if (!val) return 0;
  const cleaned = val.replace(/,/g, '').trim();
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
};

// Helper to normalize DD-MM-YYYY / YYYY-MM-DD / DD/MM/YYYY to YYYY-MM-DD
const parseIndDate = (dateStr: string): string | null => {
  if (!dateStr) return null;
  const trimmed = dateStr.trim();
  if (!trimmed || trimmed.toLowerCase() === 'total') return null;

  // Already YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return trimmed;
  }

  // Handle DD-MM-YYYY or D-M-YYYY
  const dashParts = trimmed.split('-');
  if (dashParts.length === 3) {
    if (dashParts[0].length === 4) {
      return `${dashParts[0]}-${dashParts[1].padStart(2, '0')}-${dashParts[2].padStart(2, '0')}`;
    }
    if (dashParts[2].length === 4) {
      return `${dashParts[2]}-${dashParts[1].padStart(2, '0')}-${dashParts[0].padStart(2, '0')}`;
    }
  }

  // Handle DD/MM/YYYY or YYYY/MM/DD
  const slashParts = trimmed.split('/');
  if (slashParts.length === 3) {
    if (slashParts[0].length === 4) {
      return `${slashParts[0]}-${slashParts[1].padStart(2, '0')}-${slashParts[2].padStart(2, '0')}`;
    }
    if (slashParts[2].length === 4) {
      return `${slashParts[2]}-${slashParts[1].padStart(2, '0')}-${slashParts[0].padStart(2, '0')}`;
    }
  }

  const d = new Date(trimmed);
  if (!isNaN(d.getTime())) return d.toISOString().split('T')[0];
  return null;
};

export const parseInventoryCSV = (csvContent: string): InventoryRecord[] => {
  const lines = csvContent.trim().split('\n');
  const records: InventoryRecord[] = [];

  let headerIndex = -1;
  for(let i=0; i<Math.min(lines.length, 20); i++) {
     const lineLower = lines[i].toLowerCase();
     if(lineLower.includes('item id') && (lineLower.includes('warehouse') || lineLower.includes('total sellable'))) {
        headerIndex = i;
        break;
     }
  }

  if (headerIndex === -1) {
    throw new Error("Invalid Inventory File: Could not find required columns ('Item ID', 'Warehouse details', 'Total sellable').");
  }

  const startIndex = headerIndex + 1;

  for (let i = startIndex; i < lines.length; i++) {
    const line = lines[i];
    const values = line.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/);
    
    if (values.length < 5) continue; 

    records.push({
      itemId: cleanString(values[0]),
      itemName: cleanString(values[1]),
      brandName: cleanString(values[2]),
      upc: cleanString(values[3]),
      uom: cleanString(values[4]),
      warehouseId: cleanString(values[5]),
      warehouseName: cleanString(values[6]),
      netScheduled: parseNum(values[7]),
      incomingScheduled: parseNum(values[8]),
      recalled: parseNum(values[9]),
      totalSellable: parseNum(values[10]),
      sellableWarehouse: parseNum(values[11]),
      sellableInBetween: parseNum(values[12]),
      sellableDarkstore: parseNum(values[13]),
      totalUnsellable: parseNum(values[14]),
      unsellableDamaged: parseNum(values[15]),
      unsellableLost: parseNum(values[16]),
      unsellableExpired: parseNum(values[17]),
      unsellableNearExpiry: parseNum(values[18]),
      soldLast7: parseNum(values[19]),
      soldLast15: parseNum(values[20]),
      soldLast30: parseNum(values[21]),
    });
  }
  
  if (records.length === 0) throw new Error("No data found in the Inventory file.");

  return records;
};

export const parseSalesCSV = (csvContent: string): SalesRecord[] => {
  const lines = csvContent.trim().split('\n');
  const records: SalesRecord[] = [];
  
  let idIndex = -1, qtyIndex = -1, revIndex = -1, nameIndex = -1, brandIndex = -1, dateIndex = -1, cityIndex = -1, orderIdIndex = -1;
  
  const headerRow = lines.find(l => {
    const lower = l.toLowerCase();
    return (lower.includes('item id') || lower.includes('sku')) && (lower.includes('quantity') || lower.includes('qty'));
  });
  
  if (!headerRow) throw new Error("Invalid Sales File: Missing required columns ('Item Id', 'Quantity').");

  const headers = headerRow.toLowerCase().split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/).map(h => h.trim().replace(/"/g, ''));
  idIndex = headers.findIndex(h => h.includes('item id') || h.includes('sku') || h.includes('identifier'));
  qtyIndex = headers.findIndex(h => h.includes('quantity') || h.includes('qty') || h.includes('sold'));
  revIndex = headers.findIndex(h => h.includes('bill amount') || h.includes('revenue') || h.includes('total amount') || h.includes('total gross'));
  nameIndex = headers.findIndex(h => h.includes('product name') || h.includes('item name'));
  brandIndex = headers.findIndex(h => h.includes('brand name'));
  dateIndex = headers.findIndex(h => h.includes('order date') || h.includes('date'));
  cityIndex = headers.findIndex(h => h.includes('customer city') || (h.includes('city') && !h.includes('supply')));
  orderIdIndex = headers.findIndex(h => h.includes('order id') || h === 'order_id');

  const startIndex = lines.indexOf(headerRow) + 1;

  for (let i = startIndex; i < lines.length; i++) {
    const line = lines[i];
    const values = line.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/);
    
    if (values.length <= Math.max(idIndex, qtyIndex)) continue;

    records.push({
      orderId: orderIdIndex > -1 ? cleanString(values[orderIdIndex]) || undefined : undefined,
      itemId: cleanString(values[idIndex]),
      itemName: nameIndex > -1 ? cleanString(values[nameIndex]) : undefined,
      brandName: brandIndex > -1 ? cleanString(values[brandIndex]) : undefined,
      quantity: parseNum(values[qtyIndex]),
      revenue: revIndex > -1 ? parseFloat(cleanString(values[revIndex]) || '0') : 0,
      date: dateIndex > -1 ? cleanString(values[dateIndex]) : undefined,
      customerCity: cityIndex > -1 ? cleanString(values[cityIndex]) : 'Unknown'
    });
  }

  if (records.length === 0) throw new Error("No sales records found.");

  return records;
};

const parseSingleAdsSheetCSV = (csvContent: string, sheetLabel?: string): AdvertisementRecord[] => {
  const lines = csvContent.trim().split('\n');
  const records: AdvertisementRecord[] = [];

  let headerIndex = -1;
  for (let i = 0; i < Math.min(lines.length, 25); i++) {
    const lineLower = lines[i].toLowerCase();
    const hasDate = lineLower.includes('date');
    const hasCampaign = lineLower.includes('campaign name') || lineLower.includes('campaign id') || lineLower.includes('campaign');
    const hasMetric =
      lineLower.includes('impressions') ||
      lineLower.includes('estimated budget consumed') ||
      lineLower.includes('budget consumed') ||
      lineLower.includes('spend');
    if (hasDate && hasCampaign && hasMetric) {
      headerIndex = i;
      break;
    }
  }

  if (headerIndex === -1) {
    throw new Error('Invalid Ads Report: Missing required columns (Date, Campaign Name, Impressions/Spend).');
  }

  const headers = lines[headerIndex]
    .toLowerCase()
    .split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/)
    .map(h => h.trim().replace(/"/g, ''));

  const findCol = (...candidates: string[]) => {
    for (const c of candidates) {
      const idx = headers.findIndex(h => h === c || h.includes(c));
      if (idx !== -1) return idx;
    }
    return -1;
  };

  const idxDate = findCol('date');
  const idxCmpId = findCol('campaign id', 'campaign_id');
  const idxCmpName = findCol('campaign name', 'campaign_name', 'campaign');
  const idxTargetType = findCol('targeting type', 'targeting_type', 'placement', 'slot', 'ad type', 'ad format');
  const idxTargetVal = findCol('targeting value', 'targeting_value', 'keyword', 'product name', 'item name', 'banner name');
  const idxMatchType = findCol('match type', 'match_type');
  const idxImp = findCol('impressions', 'impr');
  const idxCpm = findCol('cpm');
  const idxCtr = findCol('ctr');
  const idxSpend = findCol('estimated budget consumed', 'budget consumed', 'ad spend', 'total spend', 'spend', 'cost');
  const idxDirSales = findCol('direct sales');
  const idxIndSales = findCol('indirect sales');
  const idxTotalSales = findCol('total sales', 'attributed sales', 'sales', 'revenue');
  const idxDirRoas = findCol('direct roas');
  const idxTotRoas = findCol('total roas', 'roas');
  const idxDirUnits = findCol('direct quantities sold', 'direct units', 'direct orders');
  const idxIndUnits = findCol('indirect quantities sold', 'indirect units', 'indirect orders');
  const idxTotalUnits = findCol('quantities sold', 'total units', 'units sold', 'total orders', 'orders');

  const normalizedAdType = sheetLabel ? sheetLabel.trim() : undefined;

  for (let i = headerIndex + 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line || !line.trim()) continue;
    const values = line.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/);
    if (values.length < 3) continue;

    const rawDate = idxDate > -1 ? cleanString(values[idxDate]) : '';
    const parsedDate = parseIndDate(rawDate);
    if (!parsedDate) continue; // Skip blank/summary/Total rows

    const campaignId = idxCmpId > -1 ? cleanString(values[idxCmpId]) : '';
    const campaignName = idxCmpName > -1 ? cleanString(values[idxCmpName]) : '';
    if (!campaignName && !campaignId) continue;

    const impressions = idxImp > -1 ? parseNum(values[idxImp]) : 0;
    const spend = idxSpend > -1 ? parseNum(values[idxSpend]) : 0;
    const directSales =
      idxDirSales > -1
        ? parseNum(values[idxDirSales])
        : idxIndSales === -1 && idxTotalSales > -1
          ? parseNum(values[idxTotalSales])
          : 0;
    const indirectSales = idxIndSales > -1 ? parseNum(values[idxIndSales]) : 0;
    const directUnits =
      idxDirUnits > -1
        ? parseNum(values[idxDirUnits])
        : idxIndUnits === -1 && idxTotalUnits > -1
          ? parseNum(values[idxTotalUnits])
          : 0;
    const indirectUnits = idxIndUnits > -1 ? parseNum(values[idxIndUnits]) : 0;

    const cpm = idxCpm > -1 ? parseNum(values[idxCpm]) : (impressions > 0 ? (spend / impressions) * 1000 : 0);
    const directRoas = idxDirRoas > -1 ? parseNum(values[idxDirRoas]) : (spend > 0 ? directSales / spend : 0);
    const totalRoas = idxTotRoas > -1 ? parseNum(values[idxTotRoas]) : (spend > 0 ? (directSales + indirectSales) / spend : 0);
    const ctr = idxCtr > -1 ? parseNum(values[idxCtr]) : undefined;

    records.push({
      date: parsedDate,
      campaignId,
      campaignName: campaignName || `Campaign ${campaignId}`,
      targetingType: idxTargetType > -1 ? cleanString(values[idxTargetType]) : (normalizedAdType || ''),
      targetingValue: idxTargetVal > -1 ? cleanString(values[idxTargetVal]) : '',
      matchType: idxMatchType > -1 ? cleanString(values[idxMatchType]) : '',
      impressions,
      cpm,
      spend,
      directSales,
      indirectSales,
      directRoas,
      totalRoas,
      directUnits,
      indirectUnits,
      ctr,
      adType: normalizedAdType,
    });
  }

  return records;
};

export const extractAdsSheetNames = (rawContent: string): string[] | undefined => {
  if (!rawContent.includes(ADS_SHEET_MARKER)) return undefined;
  const matches = Array.from(rawContent.matchAll(/^###BLINKIT_SHEET:(.+?)###$/gm));
  return matches.length > 0 ? matches.map(m => m[1].trim()) : undefined;
};

export const parseAdsCSV = (csvContent: string): AdvertisementRecord[] => {
  if (csvContent.includes(ADS_SHEET_MARKER)) {
    const lines = csvContent.split('\n');
    const sheetChunks: { name: string; lines: string[] }[] = [];
    let currentChunk: { name: string; lines: string[] } | null = null;

    for (const line of lines) {
      const markerMatch = line.trim().match(/^###BLINKIT_SHEET:(.+?)###$/);
      if (markerMatch) {
        if (currentChunk) sheetChunks.push(currentChunk);
        currentChunk = { name: markerMatch[1].trim(), lines: [] };
      } else if (currentChunk) {
        currentChunk.lines.push(line);
      }
    }
    if (currentChunk) sheetChunks.push(currentChunk);

    const allRecords: AdvertisementRecord[] = [];
    let validSheetCount = 0;

    for (const chunk of sheetChunks) {
      const chunkCsv = chunk.lines.join('\n').trim();
      if (!chunkCsv) continue;
      try {
        const parsed = parseSingleAdsSheetCSV(chunkCsv, chunk.name);
        validSheetCount++;
        allRecords.push(...parsed);
      } catch {
        // Skip non-ads or empty metadata sheets inside the workbook
      }
    }

    if (validSheetCount === 0) {
      throw new Error('Invalid Ads Workbook: Could not find valid Ads columns in any sheet (PRODUCT_LISTING, PRODUCT_RECOMMENDATION, BANNER_LISTING).');
    }

    return allRecords;
  }

  return parseSingleAdsSheetCSV(csvContent);
};

export const mergeData = (inventory: InventoryRecord[], sales: SalesRecord[]): MergedItem[] => {
  const map = new Map<string, MergedItem>();

  // Process Inventory First
  inventory.forEach(inv => {
    if (!map.has(inv.itemId)) {
      map.set(inv.itemId, {
        itemId: inv.itemId,
        itemName: inv.itemName,
        brandName: inv.brandName,
        totalSellable: 0,
        totalUnsellable: 0,
        salesVelocity: 0,
        totalRevenue: 0,
        avgSalesPrice: 0,
        inventoryRunway: 0,
        shipmentForecast45d: 0,
        warehouseDistribution: {},
        stockStatus: 'Healthy'
      });
    }
    const item = map.get(inv.itemId)!;
    item.totalSellable += inv.totalSellable;
    item.totalUnsellable += inv.totalUnsellable;
    
    if (!item.warehouseDistribution[inv.warehouseName]) {
       item.warehouseDistribution[inv.warehouseName] = 0;
    }
    item.warehouseDistribution[inv.warehouseName] += inv.totalSellable;
  });

  // Process Sales
  if (sales.length > 0) {
    sales.forEach(sale => {
      if (!map.has(sale.itemId)) {
        map.set(sale.itemId, {
          itemId: sale.itemId,
          itemName: sale.itemName || `Unknown Item (${sale.itemId})`,
          brandName: sale.brandName || 'Unknown',
          totalSellable: 0,
          totalUnsellable: 0,
          salesVelocity: 0,
          totalRevenue: 0,
          avgSalesPrice: 0,
          inventoryRunway: 0,
          shipmentForecast45d: 0,
          warehouseDistribution: {},
          stockStatus: 'Stockout'
        });
      }
      
      const item = map.get(sale.itemId)!;
      item.salesVelocity += sale.quantity;
      item.totalRevenue += sale.revenue;
    });
  } else {
     // Fallback
     inventory.forEach(inv => {
        if (map.has(inv.itemId)) {
           const item = map.get(inv.itemId)!;
           item.salesVelocity += (inv.soldLast30 || 0);
        }
     });
  }

  // Calculate Derived Metrics
  map.forEach(item => {
    const dailySales = item.salesVelocity / 30;
    item.avgSalesPrice = item.salesVelocity > 0 ? item.totalRevenue / item.salesVelocity : 0;
    item.inventoryRunway = dailySales > 0 ? Math.floor(item.totalSellable / dailySales) : 999;
    
    // Forecast: (Daily Sales * 45 days) - Current Inventory
    // If requirement is less than current stock, forecast is 0
    const requirement = Math.ceil(dailySales * 45);
    item.shipmentForecast45d = Math.max(0, requirement - item.totalSellable);

    if (item.totalSellable === 0 && item.salesVelocity > 0) item.stockStatus = 'Stockout';
    else if (item.inventoryRunway < 7 && item.salesVelocity > 0) item.stockStatus = 'Low';
    else if (item.inventoryRunway > 60) item.stockStatus = 'Overstocked';
    else item.stockStatus = 'Healthy';
  });

  return Array.from(map.values());
};

export const prepareSalesChartData = (sales: SalesRecord[]) => {
  const sorted = [...sales].sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  
  const dailyMap = new Map<string, ChartDataPoint>();
  const weeklyMap = new Map<string, ChartDataPoint>();
  const monthlyMap = new Map<string, ChartDataPoint>();

  sorted.forEach(sale => {
    if (!sale.date) return;
    const dateObj = new Date(sale.date);
    if (isNaN(dateObj.getTime())) return;

    const dayKey = sale.date;
    const monthKey = sale.date.substring(0, 7); // YYYY-MM
    
    // Week Logic
    const d = new Date(dateObj);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + 4 - (d.getDay() || 7));
    const yearStart = new Date(d.getFullYear(), 0, 1);
    const weekNo = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
    const weekKey = `${d.getFullYear()}-W${weekNo}`;

    // Helper to accumulate
    const acc = (map: Map<string, ChartDataPoint>, key: string, label: string) => {
      if (!map.has(key)) map.set(key, { date: key, label, revenue: 0, quantity: 0 });
      const entry = map.get(key)!;
      entry.revenue += sale.revenue;
      entry.quantity += sale.quantity;
    };

    acc(dailyMap, dayKey, dayKey);
    acc(monthlyMap, monthKey, monthKey);
    acc(weeklyMap, weekKey, `Week ${weekNo}`);
  });

  return {
    daily: Array.from(dailyMap.values()),
    weekly: Array.from(weeklyMap.values()),
    monthly: Array.from(monthlyMap.values())
  };
};

export const aggregateByWarehouse = (records: InventoryRecord[]) => {
  const map = new Map<string, { name: string; sellable: number; unsellable: number }>();
  records.forEach(r => {
    if (!map.has(r.warehouseName)) {
      map.set(r.warehouseName, { name: r.warehouseName, sellable: 0, unsellable: 0 });
    }
    const w = map.get(r.warehouseName)!;
    w.sellable += r.totalSellable;
    w.unsellable += r.totalUnsellable;
  });
  return Array.from(map.values());
};

export const aggregateSalesByCity = (sales: SalesRecord[]) => {
  const map = new Map<string, { name: string; revenue: number; quantity: number }>();
  sales.forEach(s => {
    const city = s.customerCity || 'Unknown';
    if (!map.has(city)) {
      map.set(city, { name: city, revenue: 0, quantity: 0 });
    }
    const entry = map.get(city)!;
    entry.revenue += s.revenue;
    entry.quantity += s.quantity;
  });
  return Array.from(map.values()).sort((a, b) => b.revenue - a.revenue);
};

export const aggregateAdsData = (records: AdvertisementRecord[]) => {
  const sorted = [...records].sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  
  const dailyMap = new Map<string, ChartDataPoint>();
  const weeklyMap = new Map<string, ChartDataPoint>();
  const monthlyMap = new Map<string, ChartDataPoint>();

  sorted.forEach(rec => {
    if (!rec.date) return;
    const dateObj = new Date(rec.date);
    if (isNaN(dateObj.getTime())) return;

    const dayKey = rec.date;
    const monthKey = rec.date.substring(0, 7); // YYYY-MM
    
    // Week Logic
    const d = new Date(dateObj);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + 4 - (d.getDay() || 7));
    const yearStart = new Date(d.getFullYear(), 0, 1);
    const weekNo = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
    const weekKey = `${d.getFullYear()}-W${weekNo}`;

    // Helper to accumulate
    const acc = (map: Map<string, ChartDataPoint>, key: string, label: string) => {
      if (!map.has(key)) {
        map.set(key, { date: key, label, revenue: 0, quantity: 0, spend: 0, impressions: 0 });
      }
      const entry = map.get(key)!;
      entry.spend = (entry.spend || 0) + rec.spend;
      entry.revenue += (rec.directSales + rec.indirectSales);
      entry.impressions = (entry.impressions || 0) + rec.impressions;
      entry.quantity += (rec.directUnits + rec.indirectUnits);
    };

    acc(dailyMap, dayKey, dayKey);
    acc(weeklyMap, weekKey, `Week ${weekNo}`);
    acc(monthlyMap, monthKey, monthKey);
  });

  // Calculate Aggregated Totals
  const totalSpend = records.reduce((sum, r) => sum + r.spend, 0);
  const totalSales = records.reduce((sum, r) => sum + r.directSales + r.indirectSales, 0);
  const totalImpressions = records.reduce((sum, r) => sum + r.impressions, 0);
  const totalRoas = totalSpend > 0 ? totalSales / totalSpend : 0;

  return {
    daily: Array.from(dailyMap.values()),
    weekly: Array.from(weeklyMap.values()),
    monthly: Array.from(monthlyMap.values()),
    totals: { totalSpend, totalSales, totalImpressions, totalRoas }
  };
};

// --- Duplicate Protection & Date Range Helpers ---

export const computeContentHash = (content: string): string => {
  const normalized = content.trim();
  let hash = 2166136261;
  for (let i = 0; i < normalized.length; i++) {
    hash ^= normalized.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `${(hash >>> 0).toString(16)}-${normalized.length}`;
};

export const extractDateRange = (
  records: (SalesRecord | AdvertisementRecord)[]
): { start: string; end: string } | undefined => {
  let minDate = '';
  let maxDate = '';

  for (const r of records) {
    const d = r.date?.trim();
    if (!d || !/^\d{4}-\d{2}-\d{2}/.test(d)) continue;
    const cleanDate = d.substring(0, 10);
    if (!minDate || cleanDate < minDate) minDate = cleanDate;
    if (!maxDate || cleanDate > maxDate) maxDate = cleanDate;
  }

  return minDate && maxDate ? { start: minDate, end: maxDate } : undefined;
};

export const doDateRangesOverlap = (
  a?: { start: string; end: string },
  b?: { start: string; end: string }
): boolean => {
  if (!a || !b) return false;
  return a.start <= b.end && b.start <= a.end;
};

export const deduplicateSalesAcrossSheets = (
  sheetRecordLists: SalesRecord[][]
): { records: SalesRecord[]; removedCount: number } => {
  if (sheetRecordLists.length <= 1) {
    return { records: sheetRecordLists[0] || [], removedCount: 0 };
  }

  const seenOrderKeys = new Set<string>();
  const seenRowSignaturesFromPrevSheets = new Set<string>();
  const result: SalesRecord[] = [];
  let removedCount = 0;

  for (const sheetRows of sheetRecordLists) {
    const currentSheetSignatures: string[] = [];

    for (const row of sheetRows) {
      if (row.orderId) {
        const orderKey = `${row.orderId}__${row.itemId}__${row.quantity}__${row.revenue}`;
        if (seenOrderKeys.has(orderKey)) {
          removedCount++;
          continue;
        }
        seenOrderKeys.add(orderKey);
        result.push(row);
      } else {
        // When Order Id is unavailable, only deduplicate identical rows across DIFFERENT sheets
        const sig = `${row.date || ''}__${row.itemId}__${row.customerCity || ''}__${row.quantity}__${row.revenue}`;
        if (seenRowSignaturesFromPrevSheets.has(sig)) {
          removedCount++;
          continue;
        }
        currentSheetSignatures.push(sig);
        result.push(row);
      }
    }

    for (const sig of currentSheetSignatures) {
      seenRowSignaturesFromPrevSheets.add(sig);
    }
  }

  return { records: result, removedCount };
};

export const deduplicateAdsAcrossSheets = (
  sheetRecordLists: AdvertisementRecord[][]
): { records: AdvertisementRecord[]; removedCount: number } => {
  if (sheetRecordLists.length <= 1) {
    return { records: sheetRecordLists[0] || [], removedCount: 0 };
  }

  const seenKeys = new Set<string>();
  const result: AdvertisementRecord[] = [];
  let removedCount = 0;

  for (const sheetRows of sheetRecordLists) {
    for (const row of sheetRows) {
      const key = `${row.adType || ''}__${row.date}__${row.campaignId}__${row.campaignName}__${row.targetingType}__${row.targetingValue}__${row.matchType}__${row.spend}__${row.impressions}`;
      if (seenKeys.has(key)) {
        removedCount++;
        continue;
      }
      seenKeys.add(key);
      result.push(row);
    }
  }

  return { records: result, removedCount };
};