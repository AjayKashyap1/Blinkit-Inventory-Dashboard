import React, { useMemo, useState, useRef } from 'react';
import {
  SalesRecord,
  InventoryRecord,
  AdvertisementRecord,
  ProductCostConfig,
  GlobalProfitConfig,
} from '../types';
import {
  IndianRupee, TrendingUp, TrendingDown, Upload, Download, Search,
  Percent, Calculator, AlertCircle, Check, FileSpreadsheet, Megaphone, Sliders
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { readFileAsText, readExcelAsCSV } from '../utils';

interface ProfitAnalyticsProps {
  salesData: SalesRecord[];
  inventoryData: InventoryRecord[];
  adsData: AdvertisementRecord[];
  productCosts: Record<string, ProductCostConfig>;
  onUpdateProductCosts: (costs: Record<string, ProductCostConfig>) => void;
  globalConfig: GlobalProfitConfig;
  onUpdateGlobalConfig: (config: GlobalProfitConfig) => void;
  onSelectProduct: (itemId: string) => void;
}

export const ProfitAnalytics: React.FC<ProfitAnalyticsProps> = ({
  salesData,
  inventoryData,
  adsData,
  productCosts,
  onUpdateProductCosts,
  globalConfig,
  onUpdateGlobalConfig,
  onSelectProduct,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'PROFITABLE' | 'THIN' | 'LOSS'>('ALL');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [showSettings, setShowSettings] = useState(true);
  const [importNotice, setImportNotice] = useState<string | null>(null);
  const costFileInputRef = useRef<HTMLInputElement>(null);

  // Filter sales & ads by optional date range
  const filteredSales = useMemo(() => {
    return salesData.filter(s => {
      if (s.date) {
        if (startDate && s.date < startDate) return false;
        if (endDate && s.date > endDate) return false;
      }
      return true;
    });
  }, [salesData, startDate, endDate]);

  const filteredAds = useMemo(() => {
    return adsData.filter(a => {
      if (a.date) {
        if (startDate && a.date < startDate) return false;
        if (endDate && a.date > endDate) return false;
      }
      return true;
    });
  }, [adsData, startDate, endDate]);

  // Inventory lookup for item names / brands
  const invLookup = useMemo(() => {
    const map = new Map<string, { name: string; brand: string }>();
    inventoryData.forEach(inv => {
      if (!map.has(inv.itemId)) {
        map.set(inv.itemId, { name: inv.itemName, brand: inv.brandName });
      }
    });
    return map;
  }, [inventoryData]);

  // Total Ad Spend
  const totalAdSpend = useMemo(
    () => filteredAds.reduce((sum, a) => sum + (a.spend || 0), 0),
    [filteredAds]
  );

  // Aggregate SKU-level revenue, units, and profit metrics
  const skuProfitRows = useMemo(() => {
    const map = new Map<string, {
      itemId: string;
      itemName: string;
      brandName: string;
      unitsSold: number;
      grossRevenue: number;
    }>();

    filteredSales.forEach(s => {
      const lookup = invLookup.get(s.itemId);
      const existing = map.get(s.itemId) || {
        itemId: s.itemId,
        itemName: s.itemName || lookup?.name || `Item ${s.itemId}`,
        brandName: s.brandName || lookup?.brand || 'Unknown',
        unitsSold: 0,
        grossRevenue: 0,
      };
      existing.unitsSold += s.quantity;
      existing.grossRevenue += s.revenue;
      map.set(s.itemId, existing);
    });

    const totalRevenueAll = Array.from(map.values()).reduce((sum, x) => sum + x.grossRevenue, 0);

    return Array.from(map.values()).map(item => {
      const asp = item.unitsSold > 0 ? item.grossRevenue / item.unitsSold : 0;
      const customCost = productCosts[item.itemId];
      const hasCustomCogs = customCost && customCost.costPrice > 0;

      const unitCogs = hasCustomCogs
        ? customCost.costPrice
        : asp * (globalConfig.defaultCogsPct / 100);
      const totalCogs = unitCogs * item.unitsSold;

      const commPct = customCost?.commissionPct ?? globalConfig.defaultCommissionPct;
      const shipPerUnit = customCost?.shippingFee ?? globalConfig.defaultShippingPerUnit;

      const baseCommission = item.grossRevenue * (commPct / 100);
      const baseShipping = shipPerUnit * item.unitsSold;
      const gstOnFees = (baseCommission + baseShipping) * (globalConfig.gstOnFeesPct / 100);
      const totalPlatformFees = baseCommission + baseShipping + gstOnFees;

      // Allocate Ad Spend proportionally by revenue share for SKU TACoS visibility
      const revShare = totalRevenueAll > 0 ? item.grossRevenue / totalRevenueAll : 0;
      const allocatedAdSpend = totalAdSpend * revShare;

      const netProfit = item.grossRevenue - totalCogs - totalPlatformFees - allocatedAdSpend;
      const netMarginPct = item.grossRevenue > 0 ? (netProfit / item.grossRevenue) * 100 : 0;

      let status: 'Profitable' | 'Thin Margin' | 'Loss' = 'Profitable';
      if (netProfit < 0) status = 'Loss';
      else if (netMarginPct < 10) status = 'Thin Margin';

      return {
        ...item,
        asp,
        unitCogs,
        hasCustomCogs,
        totalCogs,
        commPct,
        shipPerUnit,
        totalPlatformFees,
        allocatedAdSpend,
        netProfit,
        netMarginPct,
        status,
      };
    });
  }, [filteredSales, invLookup, productCosts, globalConfig, totalAdSpend]);

  // Overall P&L KPIs
  const pnlTotals = useMemo(() => {
    const grossRevenue = skuProfitRows.reduce((s, r) => s + r.grossRevenue, 0);
    const totalUnits = skuProfitRows.reduce((s, r) => s + r.unitsSold, 0);
    const totalCogs = skuProfitRows.reduce((s, r) => s + r.totalCogs, 0);
    const totalFees = skuProfitRows.reduce((s, r) => s + r.totalPlatformFees, 0);
    const netProfit = grossRevenue - totalCogs - totalFees - totalAdSpend;
    const netMarginPct = grossRevenue > 0 ? (netProfit / grossRevenue) * 100 : 0;
    const tacosPct = grossRevenue > 0 ? (totalAdSpend / grossRevenue) * 100 : 0;
    const customCostCount = skuProfitRows.filter(r => r.hasCustomCogs).length;

    return {
      grossRevenue,
      totalUnits,
      totalCogs,
      totalFees,
      totalAdSpend,
      netProfit,
      netMarginPct,
      tacosPct,
      customCostCount,
    };
  }, [skuProfitRows, totalAdSpend]);

  const filteredRows = useMemo(() => {
    return skuProfitRows
      .filter(r => {
        if (statusFilter === 'PROFITABLE' && r.status !== 'Profitable') return false;
        if (statusFilter === 'THIN' && r.status !== 'Thin Margin') return false;
        if (statusFilter === 'LOSS' && r.status !== 'Loss') return false;
        if (searchTerm) {
          const q = searchTerm.toLowerCase();
          return (
            r.itemName.toLowerCase().includes(q) ||
            r.itemId.toLowerCase().includes(q) ||
            r.brandName.toLowerCase().includes(q)
          );
        }
        return true;
      })
      .sort((a, b) => b.grossRevenue - a.grossRevenue);
  }, [skuProfitRows, statusFilter, searchTerm]);

  const handleCostChange = (itemId: string, value: string) => {
    const num = parseFloat(value);
    const next = { ...productCosts };
    if (isNaN(num) || num <= 0) {
      delete next[itemId];
    } else {
      next[itemId] = {
        ...next[itemId],
        itemId,
        costPrice: num,
      };
    }
    onUpdateProductCosts(next);
  };

  const handleDownloadTemplate = () => {
    const rows = [
      ['Item Id', 'Product Name', 'Cost Price (COGS)', 'Commission % (Optional)', 'Shipping Fee INR (Optional)'],
      ...skuProfitRows.map(r => [
        r.itemId,
        `"${r.itemName.replace(/"/g, '""')}"`,
        r.hasCustomCogs ? r.unitCogs.toFixed(2) : '',
        productCosts[r.itemId]?.commissionPct ?? '',
        productCosts[r.itemId]?.shippingFee ?? '',
      ]),
    ];
    const csv = rows.map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'Blinkit_SKU_COGS_Template.csv';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleUploadCostSheet = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      let csv = '';
      if (file.name.endsWith('.csv')) csv = await readFileAsText(file);
      else if (file.name.match(/\.(xlsx|xls)$/i)) csv = await readExcelAsCSV(file);
      else throw new Error('Please upload .csv or .xlsx');

      const lines = csv.trim().split('\n');
      if (lines.length < 2) throw new Error('Cost sheet is empty');

      const headers = lines[0].toLowerCase().split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/).map(h => h.replace(/"/g, '').trim());
      const idIdx = headers.findIndex(h => h.includes('item id') || h.includes('sku'));
      const costIdx = headers.findIndex(h => h.includes('cost') || h.includes('cogs') || h.includes('landing'));
      const commIdx = headers.findIndex(h => h.includes('commission'));
      const shipIdx = headers.findIndex(h => h.includes('shipping') || h.includes('handling'));

      if (idIdx === -1 || costIdx === -1) {
        throw new Error('Missing required columns: "Item Id" and "Cost Price (COGS)"');
      }

      const next = { ...productCosts };
      let updated = 0;
      for (let i = 1; i < lines.length; i++) {
        const vals = lines[i].split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/).map(v => v.replace(/^"|"$/g, '').trim());
        const itemId = vals[idIdx];
        const costPrice = parseFloat(vals[costIdx]?.replace(/,/g, '') || '');
        if (!itemId || isNaN(costPrice) || costPrice <= 0) continue;

        const commPct = commIdx > -1 ? parseFloat(vals[commIdx]) : undefined;
        const shippingFee = shipIdx > -1 ? parseFloat(vals[shipIdx]) : undefined;

        next[itemId] = {
          itemId,
          costPrice,
          commissionPct: commPct !== undefined && !isNaN(commPct) ? commPct : undefined,
          shippingFee: shippingFee !== undefined && !isNaN(shippingFee) ? shippingFee : undefined,
        };
        updated++;
      }

      onUpdateProductCosts(next);
      setImportNotice(`Updated COGS for ${updated} SKUs and saved locally!`);
      setTimeout(() => setImportNotice(null), 5000);
    } catch (err: any) {
      setImportNotice(`Error: ${err.message || 'Failed to parse COGS file'}`);
      setTimeout(() => setImportNotice(null), 5000);
    } finally {
      e.target.value = '';
    }
  };

  const handleExportPnL = () => {
    const data = filteredRows.map(r => ({
      'Item ID': r.itemId,
      'Product Name': r.itemName,
      'Brand': r.brandName,
      'Units Sold': r.unitsSold,
      'ASP (INR)': Number(r.asp.toFixed(2)),
      'Gross Revenue (INR)': Number(r.grossRevenue.toFixed(2)),
      'Unit COGS (INR)': Number(r.unitCogs.toFixed(2)),
      'COGS Source': r.hasCustomCogs ? 'Custom SKU Cost' : `Default (${globalConfig.defaultCogsPct}%)`,
      'Total COGS (INR)': Number(r.totalCogs.toFixed(2)),
      'Platform & Shipping Fees (INR)': Number(r.totalPlatformFees.toFixed(2)),
      'Allocated Ad Spend (INR)': Number(r.allocatedAdSpend.toFixed(2)),
      'Net Profit (INR)': Number(r.netProfit.toFixed(2)),
      'Net Margin %': Number(r.netMarginPct.toFixed(2)),
      'Status': r.status,
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Blinkit P&L');
    XLSX.writeFile(wb, `Blinkit_PnL_Report_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const formatCurrency = (val: number) =>
    new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(val);

  if (salesData.length === 0) {
    return (
      <div className="bg-white dark:bg-slate-800 p-10 rounded-2xl border border-gray-100 dark:border-slate-700 text-center max-w-lg mx-auto mt-12">
        <Calculator className="w-12 h-12 text-emerald-500 mx-auto mb-3 opacity-80" />
        <h3 className="text-lg font-bold text-gray-900 dark:text-white">No Sales Data Available</h3>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Upload your Sales Reports (and optionally Ads Reports) to calculate Net Profit, Margins, and TACoS.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-10">
      {/* Header */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <Calculator className="w-6 h-6 text-emerald-500" />
            Net Profit, Margin &amp; TACoS Calculator
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            Track true profitability after COGS, Blinkit fees, logistics, and Ad Spend (TACoS). All SKU costs save locally.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setShowSettings(!showSettings)}
            className="flex items-center gap-1.5 px-3 py-2 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 hover:bg-gray-50 dark:hover:bg-slate-700 text-gray-700 dark:text-gray-200 rounded-lg text-xs font-semibold transition-colors"
          >
            <Sliders className="w-4 h-4" />
            {showSettings ? 'Hide Assumptions' : 'Fee Assumptions'}
          </button>
          <button
            onClick={handleDownloadTemplate}
            className="flex items-center gap-1.5 px-3 py-2 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 hover:bg-gray-50 dark:hover:bg-slate-700 text-gray-700 dark:text-gray-200 rounded-lg text-xs font-semibold transition-colors"
          >
            <Download className="w-4 h-4" />
            COGS Template
          </button>
          <button
            onClick={() => costFileInputRef.current?.click()}
            className="flex items-center gap-1.5 px-3 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-lg text-xs font-bold transition-colors shadow-sm"
          >
            <Upload className="w-4 h-4" />
            Upload COGS Sheet
          </button>
          <input
            ref={costFileInputRef}
            type="file"
            className="hidden"
            accept=".csv, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel"
            onChange={handleUploadCostSheet}
          />
          <button
            onClick={handleExportPnL}
            className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold transition-colors shadow-sm"
          >
            <FileSpreadsheet className="w-4 h-4" />
            Export P&amp;L (.xlsx)
          </button>
        </div>
      </div>

      {importNotice && (
        <div className={`p-3 rounded-xl text-xs font-medium flex items-center gap-2 border ${
          importNotice.startsWith('Error')
            ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800 text-red-700 dark:text-red-300'
            : 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300'
        }`}>
          {importNotice.startsWith('Error') ? <AlertCircle className="w-4 h-4 shrink-0" /> : <Check className="w-4 h-4 shrink-0" />}
          <span>{importNotice}</span>
        </div>
      )}

      {/* P&L KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="bg-white dark:bg-slate-800 p-5 rounded-xl border border-gray-100 dark:border-slate-700 shadow-sm">
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400">Gross Sales Revenue</p>
          <p className="text-xl font-extrabold text-gray-900 dark:text-white mt-1">{formatCurrency(pnlTotals.grossRevenue)}</p>
          <p className="text-[11px] text-gray-400 mt-1">{pnlTotals.totalUnits.toLocaleString()} units sold</p>
        </div>

        <div className="bg-white dark:bg-slate-800 p-5 rounded-xl border border-gray-100 dark:border-slate-700 shadow-sm">
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400">Estimated COGS</p>
          <p className="text-xl font-extrabold text-slate-700 dark:text-slate-200 mt-1">{formatCurrency(pnlTotals.totalCogs)}</p>
          <p className="text-[11px] text-gray-400 mt-1">
            {pnlTotals.customCostCount}/{skuProfitRows.length} SKUs custom priced
          </p>
        </div>

        <div className="bg-white dark:bg-slate-800 p-5 rounded-xl border border-gray-100 dark:border-slate-700 shadow-sm">
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400">Platform &amp; Logistics Fees</p>
          <p className="text-xl font-extrabold text-amber-600 dark:text-amber-400 mt-1">{formatCurrency(pnlTotals.totalFees)}</p>
          <p className="text-[11px] text-gray-400 mt-1">
            {globalConfig.defaultCommissionPct}% comm + ₹{globalConfig.defaultShippingPerUnit}/u + GST
          </p>
        </div>

        <div className="bg-white dark:bg-slate-800 p-5 rounded-xl border border-purple-100 dark:border-purple-900/30 shadow-sm">
          <p className="text-xs font-medium text-purple-600 dark:text-purple-400 flex items-center gap-1">
            <Megaphone className="w-3.5 h-3.5" /> Ad Spend &amp; TACoS
          </p>
          <p className="text-xl font-extrabold text-purple-700 dark:text-purple-300 mt-1">
            {pnlTotals.tacosPct.toFixed(1)}% TACoS
          </p>
          <p className="text-[11px] text-gray-400 mt-1">Ad Spend: {formatCurrency(pnlTotals.totalAdSpend)}</p>
        </div>

        <div className={`p-5 rounded-xl border shadow-sm ${
          pnlTotals.netProfit >= 0
            ? 'bg-emerald-50/60 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800'
            : 'bg-red-50/60 dark:bg-red-950/20 border-red-200 dark:border-red-800'
        }`}>
          <p className="text-xs font-semibold text-gray-600 dark:text-gray-300 flex items-center gap-1">
            {pnlTotals.netProfit >= 0 ? (
              <TrendingUp className="w-3.5 h-3.5 text-emerald-600" />
            ) : (
              <TrendingDown className="w-3.5 h-3.5 text-red-600" />
            )}
            Net Profit (After Ads)
          </p>
          <p className={`text-xl font-black mt-1 ${
            pnlTotals.netProfit >= 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'
          }`}>
            {formatCurrency(pnlTotals.netProfit)}
          </p>
          <p className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 mt-1">
            Net Margin: {pnlTotals.netMarginPct.toFixed(1)}%
          </p>
        </div>
      </div>

      {/* Global Assumptions & Date Filter */}
      {showSettings && (
        <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-gray-100 dark:border-slate-700 shadow-sm">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            <div>
              <label className="block text-[11px] font-semibold text-gray-500 dark:text-gray-400 mb-1">
                Fallback COGS (% of ASP)
              </label>
              <input
                type="number"
                min={0}
                max={100}
                value={globalConfig.defaultCogsPct}
                onChange={(e) => onUpdateGlobalConfig({ ...globalConfig, defaultCogsPct: Number(e.target.value) || 0 })}
                className="w-full p-2 text-xs border border-gray-200 dark:border-slate-600 rounded-lg bg-gray-50 dark:bg-slate-700 text-gray-900 dark:text-white"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-gray-500 dark:text-gray-400 mb-1">
                Blinkit Commission (%)
              </label>
              <input
                type="number"
                min={0}
                max={100}
                value={globalConfig.defaultCommissionPct}
                onChange={(e) => onUpdateGlobalConfig({ ...globalConfig, defaultCommissionPct: Number(e.target.value) || 0 })}
                className="w-full p-2 text-xs border border-gray-200 dark:border-slate-600 rounded-lg bg-gray-50 dark:bg-slate-700 text-gray-900 dark:text-white"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-gray-500 dark:text-gray-400 mb-1">
                Fulfillment / Unit (₹)
              </label>
              <input
                type="number"
                min={0}
                value={globalConfig.defaultShippingPerUnit}
                onChange={(e) => onUpdateGlobalConfig({ ...globalConfig, defaultShippingPerUnit: Number(e.target.value) || 0 })}
                className="w-full p-2 text-xs border border-gray-200 dark:border-slate-600 rounded-lg bg-gray-50 dark:bg-slate-700 text-gray-900 dark:text-white"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-gray-500 dark:text-gray-400 mb-1">
                GST on Fees (%)
              </label>
              <input
                type="number"
                min={0}
                max={50}
                value={globalConfig.gstOnFeesPct}
                onChange={(e) => onUpdateGlobalConfig({ ...globalConfig, gstOnFeesPct: Number(e.target.value) || 0 })}
                className="w-full p-2 text-xs border border-gray-200 dark:border-slate-600 rounded-lg bg-gray-50 dark:bg-slate-700 text-gray-900 dark:text-white"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-gray-500 dark:text-gray-400 mb-1">
                Start Date
              </label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full p-2 text-xs border border-gray-200 dark:border-slate-600 rounded-lg bg-gray-50 dark:bg-slate-700 text-gray-900 dark:text-white"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-gray-500 dark:text-gray-400 mb-1">
                End Date
              </label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full p-2 text-xs border border-gray-200 dark:border-slate-600 rounded-lg bg-gray-50 dark:bg-slate-700 text-gray-900 dark:text-white"
              />
            </div>
          </div>
        </div>
      )}

      {/* SKU Profitability Table */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-100 dark:border-slate-700 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-gray-100 dark:border-slate-700 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
          <div className="relative w-full sm:w-80">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search SKU or Product..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 text-xs border border-gray-200 dark:border-slate-600 rounded-lg bg-gray-50 dark:bg-slate-700 text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          <div className="flex items-center gap-1.5">
            {(['ALL', 'PROFITABLE', 'THIN', 'LOSS'] as const).map(st => (
              <button
                key={st}
                onClick={() => setStatusFilter(st)}
                className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors ${
                  statusFilter === st
                    ? 'bg-slate-900 text-white dark:bg-yellow-400 dark:text-slate-900'
                    : 'bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200'
                }`}
              >
                {st === 'ALL' ? 'All SKUs' : st === 'PROFITABLE' ? 'Profitable' : st === 'THIN' ? 'Thin (<10%)' : 'Loss Making'}
              </button>
            ))}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-gray-50 dark:bg-slate-700/60 text-gray-600 dark:text-gray-300 font-semibold uppercase border-b border-gray-100 dark:border-slate-700">
              <tr>
                <th className="px-4 py-3.5">Product &amp; SKU</th>
                <th className="px-4 py-3.5 text-right">Units</th>
                <th className="px-4 py-3.5 text-right">ASP</th>
                <th className="px-4 py-3.5 text-right">Gross Rev</th>
                <th className="px-4 py-3.5 text-right bg-yellow-50/60 dark:bg-yellow-950/20">Unit COGS (₹) ✎</th>
                <th className="px-4 py-3.5 text-right">Total COGS</th>
                <th className="px-4 py-3.5 text-right">Fees + Ship</th>
                <th className="px-4 py-3.5 text-right">Ad Share</th>
                <th className="px-4 py-3.5 text-right">Net Profit</th>
                <th className="px-4 py-3.5 text-right">Margin %</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
              {filteredRows.map(row => (
                <tr key={row.itemId} className="hover:bg-gray-50 dark:hover:bg-slate-700/40 transition-colors">
                  <td
                    onClick={() => onSelectProduct(row.itemId)}
                    className="px-4 py-3 max-w-[230px] cursor-pointer group"
                  >
                    <div className="font-semibold text-gray-900 dark:text-gray-100 group-hover:text-blue-600 truncate" title={row.itemName}>
                      {row.itemName}
                    </div>
                    <div className="text-[11px] text-gray-400">
                      ID: {row.itemId} • {row.brandName}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right font-medium text-gray-700 dark:text-gray-300">
                    {row.unitsSold.toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-right text-gray-600 dark:text-gray-300">
                    ₹{row.asp.toFixed(0)}
                  </td>
                  <td className="px-4 py-3 text-right font-semibold text-gray-900 dark:text-white">
                    {formatCurrency(row.grossRevenue)}
                  </td>
                  <td className="px-4 py-3 text-right bg-yellow-50/30 dark:bg-yellow-950/10">
                    <input
                      type="number"
                      min={0}
                      placeholder={row.unitCogs.toFixed(0)}
                      value={productCosts[row.itemId]?.costPrice ?? ''}
                      onChange={(e) => handleCostChange(row.itemId, e.target.value)}
                      className={`w-20 px-2 py-1 text-right text-xs rounded border outline-none focus:ring-2 focus:ring-yellow-400 ${
                        row.hasCustomCogs
                          ? 'border-emerald-300 bg-white dark:bg-slate-700 text-emerald-700 dark:text-emerald-300 font-bold'
                          : 'border-gray-200 dark:border-slate-600 bg-gray-50 dark:bg-slate-800 text-gray-500 dark:text-gray-400'
                      }`}
                      title={row.hasCustomCogs ? 'Custom SKU COGS saved locally' : `Using ${globalConfig.defaultCogsPct}% of ASP default`}
                    />
                  </td>
                  <td className="px-4 py-3 text-right text-gray-600 dark:text-gray-300">
                    {formatCurrency(row.totalCogs)}
                  </td>
                  <td className="px-4 py-3 text-right text-amber-600 dark:text-amber-400">
                    {formatCurrency(row.totalPlatformFees)}
                  </td>
                  <td className="px-4 py-3 text-right text-purple-600 dark:text-purple-400">
                    {formatCurrency(row.allocatedAdSpend)}
                  </td>
                  <td className={`px-4 py-3 text-right font-bold ${
                    row.netProfit >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'
                  }`}>
                    {formatCurrency(row.netProfit)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${
                      row.status === 'Profitable' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' :
                      row.status === 'Thin Margin' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300' :
                      'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'
                    }`}>
                      {row.netMarginPct.toFixed(1)}%
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
