import React, { useMemo, useState } from 'react';
import { InventoryRecord, MergedItem } from '../types';
import {
  AlertTriangle, ArchiveX, Clock, Flame, Download, Search,
  CheckCircle2, PackageX, TrendingDown, FileSpreadsheet
} from 'lucide-react';
import * as XLSX from 'xlsx';

interface ActionAlertsProps {
  inventoryData: InventoryRecord[];
  mergedData: MergedItem[];
  onSelectProduct: (itemId: string) => void;
}

type AlertTab = 'EXPIRY_UNSELLABLE' | 'DEAD_SLOW' | 'STOCKOUT_RISK';

export const ActionAlerts: React.FC<ActionAlertsProps> = ({
  inventoryData,
  mergedData,
  onSelectProduct,
}) => {
  const [activeTab, setActiveTab] = useState<AlertTab>('EXPIRY_UNSELLABLE');
  const [searchTerm, setSearchTerm] = useState('');
  const [warehouseFilter, setWarehouseFilter] = useState('All');

  const uniqueWarehouses = useMemo(
    () => Array.from(new Set(inventoryData.map(i => i.warehouseName))).sort(),
    [inventoryData]
  );

  // Lookup ASP per item from mergedData (fallback ₹400 if no sales ASP available)
  const itemMetaMap = useMemo(() => {
    const map = new Map<string, MergedItem>();
    mergedData.forEach(m => map.set(m.itemId, m));
    return map;
  }, [mergedData]);

  // 1. Near-Expiry & Unsellable (Expired, Damaged, Lost, Near Expiry)
  const unsellableRows = useMemo(() => {
    return inventoryData
      .filter(r =>
        r.unsellableNearExpiry > 0 ||
        r.unsellableExpired > 0 ||
        r.unsellableDamaged > 0 ||
        r.unsellableLost > 0 ||
        r.totalUnsellable > 0
      )
      .map(r => {
        const asp = itemMetaMap.get(r.itemId)?.avgSalesPrice || 0;
        const atRiskUnits = r.totalUnsellable;
        const estimatedValueAtRisk = asp > 0 ? atRiskUnits * asp : 0;
        let primaryIssue = 'Unsellable';
        if (r.unsellableNearExpiry > 0) primaryIssue = 'Near Expiry (Clearance Urgency)';
        else if (r.unsellableExpired > 0) primaryIssue = 'Expired (Recall / Write-off)';
        else if (r.unsellableDamaged > 0) primaryIssue = 'Damaged (Claim Dispute)';
        else if (r.unsellableLost > 0) primaryIssue = 'Lost in Transit/WH (Claim)';

        return {
          ...r,
          asp,
          atRiskUnits,
          estimatedValueAtRisk,
          primaryIssue,
        };
      })
      .sort((a, b) => b.estimatedValueAtRisk - a.estimatedValueAtRisk || b.atRiskUnits - a.atRiskUnits);
  }, [inventoryData, itemMetaMap]);

  // 2. Dead Stock & Slow-Moving SKUs (Merged item-level & warehouse-level)
  const deadSlowRows = useMemo(() => {
    return mergedData
      .filter(m => m.totalSellable > 0 && (m.salesVelocity === 0 || m.inventoryRunway > 90))
      .map(m => {
        const lockedCapital = m.avgSalesPrice > 0 ? m.totalSellable * m.avgSalesPrice : 0;
        const isDead = m.salesVelocity === 0;
        const recommendation = isDead
          ? 'Run Flash Discount / Bundle or Recall'
          : 'Pause Replenishment & Boost Ads';

        return {
          ...m,
          lockedCapital,
          category: isDead ? 'Dead Stock (0 Sales)' : 'Slow Moving (>90d Cover)',
          recommendation,
        };
      })
      .sort((a, b) => b.totalSellable - a.totalSellable);
  }, [mergedData]);

  // 3. Stockout & Critical Low Runway Alerts
  const stockoutRiskRows = useMemo(() => {
    return mergedData
      .filter(m => m.salesVelocity > 0 && (m.totalSellable === 0 || m.inventoryRunway < 7))
      .map(m => {
        const dailySales = m.salesVelocity / 30;
        const dailyRevLoss = m.avgSalesPrice > 0 ? dailySales * m.avgSalesPrice : 0;
        return {
          ...m,
          dailySales,
          dailyRevLoss,
          urgency: m.totalSellable === 0 ? 'Out of Stock Now' : `Only ${m.inventoryRunway}d Left`,
        };
      })
      .sort((a, b) => b.dailyRevLoss - a.dailyRevLoss || b.salesVelocity - a.salesVelocity);
  }, [mergedData]);

  // Summary KPIs
  const kpis = useMemo(() => {
    const nearExpiryUnits = inventoryData.reduce((s, r) => s + r.unsellableNearExpiry, 0);
    const totalUnsellableUnits = inventoryData.reduce((s, r) => s + r.totalUnsellable, 0);
    const totalUnsellableValue = unsellableRows.reduce((s, r) => s + r.estimatedValueAtRisk, 0);
    const deadStockUnits = deadSlowRows.reduce((s, r) => s + r.totalSellable, 0);
    const deadCapital = deadSlowRows.reduce((s, r) => s + r.lockedCapital, 0);
    const dailyRevAtRisk = stockoutRiskRows.reduce((s, r) => s + r.dailyRevLoss, 0);

    return {
      nearExpiryUnits,
      totalUnsellableUnits,
      totalUnsellableValue,
      deadStockCount: deadSlowRows.length,
      deadStockUnits,
      deadCapital,
      stockoutCount: stockoutRiskRows.length,
      dailyRevAtRisk,
    };
  }, [inventoryData, unsellableRows, deadSlowRows, stockoutRiskRows]);

  const filteredUnsellable = useMemo(() => {
    return unsellableRows.filter(r => {
      if (warehouseFilter !== 'All' && r.warehouseName !== warehouseFilter) return false;
      if (searchTerm) {
        const q = searchTerm.toLowerCase();
        return r.itemName.toLowerCase().includes(q) || r.itemId.toLowerCase().includes(q);
      }
      return true;
    });
  }, [unsellableRows, warehouseFilter, searchTerm]);

  const filteredDeadSlow = useMemo(() => {
    return deadSlowRows.filter(r => {
      if (searchTerm) {
        const q = searchTerm.toLowerCase();
        return r.itemName.toLowerCase().includes(q) || r.itemId.toLowerCase().includes(q);
      }
      return true;
    });
  }, [deadSlowRows, searchTerm]);

  const filteredStockout = useMemo(() => {
    return stockoutRiskRows.filter(r => {
      if (searchTerm) {
        const q = searchTerm.toLowerCase();
        return r.itemName.toLowerCase().includes(q) || r.itemId.toLowerCase().includes(q);
      }
      return true;
    });
  }, [stockoutRiskRows, searchTerm]);

  const formatCurrency = (val: number) =>
    new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(val);

  const handleExportAlerts = () => {
    const wb = XLSX.utils.book_new();

    const ws1 = XLSX.utils.json_to_sheet(
      unsellableRows.map(r => ({
        'Item ID': r.itemId,
        'Product Name': r.itemName,
        'Warehouse': r.warehouseName,
        'Near Expiry': r.unsellableNearExpiry,
        'Expired': r.unsellableExpired,
        'Damaged': r.unsellableDamaged,
        'Lost': r.unsellableLost,
        'Total Unsellable': r.totalUnsellable,
        'Est. Value at Risk (INR)': Math.round(r.estimatedValueAtRisk),
        'Primary Action': r.primaryIssue,
      }))
    );
    XLSX.utils.book_append_sheet(wb, ws1, 'Near-Expiry & Unsellable');

    const ws2 = XLSX.utils.json_to_sheet(
      deadSlowRows.map(r => ({
        'Item ID': r.itemId,
        'Product Name': r.itemName,
        'Brand': r.brandName,
        'Sellable Stock': r.totalSellable,
        'Sales Velocity': r.salesVelocity,
        'Runway (Days)': r.inventoryRunway >= 999 ? '999+' : r.inventoryRunway,
        'Category': r.category,
        'Locked Capital (INR)': Math.round(r.lockedCapital),
        'Recommended Action': r.recommendation,
      }))
    );
    XLSX.utils.book_append_sheet(wb, ws2, 'Dead & Slow Stock');

    const ws3 = XLSX.utils.json_to_sheet(
      stockoutRiskRows.map(r => ({
        'Item ID': r.itemId,
        'Product Name': r.itemName,
        'Brand': r.brandName,
        'Current Sellable': r.totalSellable,
        'Sales Velocity (Units)': r.salesVelocity,
        'Daily Rate': Number(r.dailySales.toFixed(2)),
        'Urgency': r.urgency,
        'Est. Daily Rev Loss (INR)': Math.round(r.dailyRevLoss),
        '45d Forecast Needed': r.shipmentForecast45d,
      }))
    );
    XLSX.utils.book_append_sheet(wb, ws3, 'Stockout Risks');

    XLSX.writeFile(wb, `Blinkit_Action_Alerts_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  if (inventoryData.length === 0) {
    return (
      <div className="bg-white dark:bg-slate-800 p-10 rounded-2xl border border-gray-100 dark:border-slate-700 text-center max-w-lg mx-auto mt-12">
        <AlertTriangle className="w-12 h-12 text-amber-500 mx-auto mb-3 opacity-80" />
        <h3 className="text-lg font-bold text-gray-900 dark:text-white">No Inventory Data Found</h3>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Upload your Warehouse Stock sheet in Data Import to inspect Near-Expiry, Dead Stock, and Stockout alerts.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-10">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <AlertTriangle className="w-6 h-6 text-red-500" />
            Near-Expiry, Dead Stock &amp; Risk Alerts
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            Actionable loss-prevention lists: claim damaged/lost stock, liquidate dead inventory, and prevent stockouts.
          </p>
        </div>

        <button
          onClick={handleExportAlerts}
          className="flex items-center gap-2 px-4 py-2 bg-slate-900 hover:bg-slate-800 dark:bg-yellow-400 dark:hover:bg-yellow-300 text-white dark:text-slate-900 rounded-lg text-xs font-bold shadow-sm transition-colors"
        >
          <FileSpreadsheet className="w-4 h-4" />
          Export All Action Lists (.xlsx)
        </button>
      </div>

      {/* Summary KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-slate-800 p-5 rounded-xl border border-red-100 dark:border-red-900/30 shadow-sm">
          <p className="text-xs font-medium text-red-600 dark:text-red-400 flex items-center gap-1">
            <ArchiveX className="w-3.5 h-3.5" /> Unsellable &amp; Near-Expiry Risk
          </p>
          <p className="text-2xl font-extrabold text-gray-900 dark:text-white mt-1">
            {kpis.totalUnsellableUnits.toLocaleString()} units
          </p>
          <p className="text-xs text-gray-400 mt-1">
            {kpis.nearExpiryUnits} near-expiry • Est. {formatCurrency(kpis.totalUnsellableValue)} value
          </p>
        </div>

        <div className="bg-white dark:bg-slate-800 p-5 rounded-xl border border-amber-100 dark:border-amber-900/30 shadow-sm">
          <p className="text-xs font-medium text-amber-600 dark:text-amber-400 flex items-center gap-1">
            <Clock className="w-3.5 h-3.5" /> Dead / Slow-Moving SKUs
          </p>
          <p className="text-2xl font-extrabold text-gray-900 dark:text-white mt-1">
            {kpis.deadStockCount} SKUs
          </p>
          <p className="text-xs text-gray-400 mt-1">
            {kpis.deadStockUnits.toLocaleString()} units • {formatCurrency(kpis.deadCapital)} capital locked
          </p>
        </div>

        <div className="bg-white dark:bg-slate-800 p-5 rounded-xl border border-orange-100 dark:border-orange-900/30 shadow-sm">
          <p className="text-xs font-medium text-orange-600 dark:text-orange-400 flex items-center gap-1">
            <PackageX className="w-3.5 h-3.5" /> Stockout &amp; &lt;7d Critical SKUs
          </p>
          <p className="text-2xl font-extrabold text-gray-900 dark:text-white mt-1">
            {kpis.stockoutCount} SKUs
          </p>
          <p className="text-xs text-gray-400 mt-1">Active demand losing sales</p>
        </div>

        <div className="bg-white dark:bg-slate-800 p-5 rounded-xl border border-purple-100 dark:border-purple-900/30 shadow-sm">
          <p className="text-xs font-medium text-purple-600 dark:text-purple-400 flex items-center gap-1">
            <TrendingDown className="w-3.5 h-3.5" /> Est. Daily Stockout Loss
          </p>
          <p className="text-2xl font-extrabold text-purple-700 dark:text-purple-300 mt-1">
            {formatCurrency(kpis.dailyRevAtRisk)}/day
          </p>
          <p className="text-xs text-gray-400 mt-1">Recoverable with urgent dispatch</p>
        </div>
      </div>

      {/* Tabs + Filters */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-100 dark:border-slate-700 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-gray-100 dark:border-slate-700 flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setActiveTab('EXPIRY_UNSELLABLE')}
              className={`px-3.5 py-2 rounded-lg text-xs font-bold transition-colors flex items-center gap-1.5 ${
                activeTab === 'EXPIRY_UNSELLABLE'
                  ? 'bg-red-600 text-white shadow-sm'
                  : 'bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200'
              }`}
            >
              <ArchiveX className="w-4 h-4" />
              Near-Expiry &amp; Unsellable ({unsellableRows.length})
            </button>
            <button
              onClick={() => setActiveTab('DEAD_SLOW')}
              className={`px-3.5 py-2 rounded-lg text-xs font-bold transition-colors flex items-center gap-1.5 ${
                activeTab === 'DEAD_SLOW'
                  ? 'bg-amber-500 text-slate-900 shadow-sm'
                  : 'bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200'
              }`}
            >
              <Clock className="w-4 h-4" />
              Dead &amp; Slow Stock ({deadSlowRows.length})
            </button>
            <button
              onClick={() => setActiveTab('STOCKOUT_RISK')}
              className={`px-3.5 py-2 rounded-lg text-xs font-bold transition-colors flex items-center gap-1.5 ${
                activeTab === 'STOCKOUT_RISK'
                  ? 'bg-orange-600 text-white shadow-sm'
                  : 'bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200'
              }`}
            >
              <Flame className="w-4 h-4" />
              Stockout Revenue Risk ({stockoutRiskRows.length})
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto">
            {activeTab === 'EXPIRY_UNSELLABLE' && (
              <select
                value={warehouseFilter}
                onChange={(e) => setWarehouseFilter(e.target.value)}
                className="p-1.5 text-xs border border-gray-200 dark:border-slate-600 rounded-lg bg-gray-50 dark:bg-slate-700 text-gray-800 dark:text-white"
              >
                <option value="All">All Warehouses</option>
                {uniqueWarehouses.map(w => (
                  <option key={w} value={w}>{w}</option>
                ))}
              </select>
            )}
            <div className="relative flex-1 sm:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search SKU or Product..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 text-xs border border-gray-200 dark:border-slate-600 rounded-lg bg-gray-50 dark:bg-slate-700 text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-yellow-400"
              />
            </div>
          </div>
        </div>

        {/* Tab 1: Near-Expiry & Unsellable */}
        {activeTab === 'EXPIRY_UNSELLABLE' && (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-gray-50 dark:bg-slate-700/60 text-gray-600 dark:text-gray-300 font-semibold uppercase border-b border-gray-100 dark:border-slate-700">
                <tr>
                  <th className="px-4 py-3">Product &amp; SKU</th>
                  <th className="px-4 py-3">Warehouse</th>
                  <th className="px-4 py-3 text-right text-amber-600 dark:text-amber-400">Near Expiry</th>
                  <th className="px-4 py-3 text-right text-red-600 dark:text-red-400">Expired</th>
                  <th className="px-4 py-3 text-right">Damaged</th>
                  <th className="px-4 py-3 text-right">Lost</th>
                  <th className="px-4 py-3 text-right">Total Risk Qty</th>
                  <th className="px-4 py-3 text-right">Est. ₹ Risk</th>
                  <th className="px-4 py-3">Recommended Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
                {filteredUnsellable.map((r, i) => (
                  <tr
                    key={`${r.itemId}-${r.warehouseId}-${i}`}
                    onClick={() => onSelectProduct(r.itemId)}
                    className="hover:bg-red-50/40 dark:hover:bg-red-950/20 cursor-pointer transition-colors"
                  >
                    <td className="px-4 py-3 max-w-[230px]">
                      <div className="font-semibold text-gray-900 dark:text-gray-100 truncate" title={r.itemName}>
                        {r.itemName}
                      </div>
                      <div className="text-[11px] text-gray-400">ID: {r.itemId}</div>
                    </td>
                    <td className="px-4 py-3 font-medium text-gray-700 dark:text-gray-300 whitespace-nowrap">{r.warehouseName}</td>
                    <td className="px-4 py-3 text-right font-bold text-amber-600 dark:text-amber-400">{r.unsellableNearExpiry}</td>
                    <td className="px-4 py-3 text-right font-bold text-red-600 dark:text-red-400">{r.unsellableExpired}</td>
                    <td className="px-4 py-3 text-right text-gray-600 dark:text-gray-300">{r.unsellableDamaged}</td>
                    <td className="px-4 py-3 text-right text-gray-600 dark:text-gray-300">{r.unsellableLost}</td>
                    <td className="px-4 py-3 text-right font-extrabold text-gray-900 dark:text-white">{r.totalUnsellable}</td>
                    <td className="px-4 py-3 text-right font-bold text-red-600 dark:text-red-400">
                      {r.estimatedValueAtRisk > 0 ? formatCurrency(r.estimatedValueAtRisk) : '-'}
                    </td>
                    <td className="px-4 py-3">
                      <span className="px-2 py-0.5 rounded bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300 font-medium text-[11px]">
                        {r.primaryIssue}
                      </span>
                    </td>
                  </tr>
                ))}
                {filteredUnsellable.length === 0 && (
                  <tr>
                    <td colSpan={9} className="px-6 py-10 text-center text-gray-400">
                      <CheckCircle2 className="w-8 h-8 mx-auto mb-2 text-green-500" />
                      No near-expiry or unsellable stock risks found!
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Tab 2: Dead & Slow Stock */}
        {activeTab === 'DEAD_SLOW' && (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-gray-50 dark:bg-slate-700/60 text-gray-600 dark:text-gray-300 font-semibold uppercase border-b border-gray-100 dark:border-slate-700">
                <tr>
                  <th className="px-4 py-3">Product &amp; SKU</th>
                  <th className="px-4 py-3">Category</th>
                  <th className="px-4 py-3 text-right">Sellable Stock</th>
                  <th className="px-4 py-3 text-right">Sales (Units)</th>
                  <th className="px-4 py-3 text-right">Stock Cover</th>
                  <th className="px-4 py-3 text-right">Locked Capital</th>
                  <th className="px-4 py-3">Action Plan</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
                {filteredDeadSlow.map(r => (
                  <tr
                    key={r.itemId}
                    onClick={() => onSelectProduct(r.itemId)}
                    className="hover:bg-amber-50/40 dark:hover:bg-amber-950/20 cursor-pointer transition-colors"
                  >
                    <td className="px-4 py-3 max-w-[260px]">
                      <div className="font-semibold text-gray-900 dark:text-gray-100 truncate" title={r.itemName}>
                        {r.itemName}
                      </div>
                      <div className="text-[11px] text-gray-400">ID: {r.itemId} • {r.brandName}</div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        r.salesVelocity === 0
                          ? 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'
                          : 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
                      }`}>
                        {r.category}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-bold text-gray-900 dark:text-white">{r.totalSellable.toLocaleString()}</td>
                    <td className="px-4 py-3 text-right text-gray-600 dark:text-gray-300">{r.salesVelocity}</td>
                    <td className="px-4 py-3 text-right font-medium text-amber-600 dark:text-amber-400">
                      {r.inventoryRunway >= 999 ? '∞ (No Sales)' : `${r.inventoryRunway} days`}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-gray-900 dark:text-white">
                      {r.lockedCapital > 0 ? formatCurrency(r.lockedCapital) : '-'}
                    </td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300 font-medium">{r.recommendation}</td>
                  </tr>
                ))}
                {filteredDeadSlow.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-6 py-10 text-center text-gray-400">
                      No dead or slow-moving SKUs detected!
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Tab 3: Stockout Risk */}
        {activeTab === 'STOCKOUT_RISK' && (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-gray-50 dark:bg-slate-700/60 text-gray-600 dark:text-gray-300 font-semibold uppercase border-b border-gray-100 dark:border-slate-700">
                <tr>
                  <th className="px-4 py-3">Product &amp; SKU</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Sellable Left</th>
                  <th className="px-4 py-3 text-right">Daily Velocity</th>
                  <th className="px-4 py-3 text-right">Est. Daily Loss</th>
                  <th className="px-4 py-3 text-right">45d Req Qty</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
                {filteredStockout.map(r => (
                  <tr
                    key={r.itemId}
                    onClick={() => onSelectProduct(r.itemId)}
                    className="hover:bg-orange-50/40 dark:hover:bg-orange-950/20 cursor-pointer transition-colors"
                  >
                    <td className="px-4 py-3 max-w-[260px]">
                      <div className="font-semibold text-gray-900 dark:text-gray-100 truncate" title={r.itemName}>
                        {r.itemName}
                      </div>
                      <div className="text-[11px] text-gray-400">ID: {r.itemId} • {r.brandName}</div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        r.totalSellable === 0
                          ? 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'
                          : 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300'
                      }`}>
                        {r.urgency}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-bold text-gray-900 dark:text-white">{r.totalSellable}</td>
                    <td className="px-4 py-3 text-right text-gray-600 dark:text-gray-300">{r.dailySales.toFixed(1)}/day</td>
                    <td className="px-4 py-3 text-right font-bold text-red-600 dark:text-red-400">
                      {r.dailyRevLoss > 0 ? `${formatCurrency(r.dailyRevLoss)}/d` : '-'}
                    </td>
                    <td className="px-4 py-3 text-right font-bold text-indigo-600 dark:text-indigo-400">
                      {r.shipmentForecast45d.toLocaleString()} units
                    </td>
                  </tr>
                ))}
                {filteredStockout.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-6 py-10 text-center text-gray-400">
                      No critical stockouts detected!
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
