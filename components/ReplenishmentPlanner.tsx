import React, { useMemo, useState } from 'react';
import { InventoryRecord, SalesRecord } from '../types';
import {
  Truck, Search, Download, AlertTriangle, Package, CheckCircle2,
  ArrowRightLeft, Filter, FileSpreadsheet, Info
} from 'lucide-react';
import * as XLSX from 'xlsx';

interface ReplenishmentPlannerProps {
  inventoryData: InventoryRecord[];
  salesData: SalesRecord[];
  onSelectProduct: (itemId: string) => void;
}

type VelocityWindow = '30d' | '15d' | '7d' | 'report';
type PriorityFilter = 'DISPATCH' | 'CRITICAL' | 'EXCESS' | 'ALL';

export const ReplenishmentPlanner: React.FC<ReplenishmentPlannerProps> = ({
  inventoryData,
  salesData,
  onSelectProduct,
}) => {
  const [targetDays, setTargetDays] = useState<number>(45);
  const [subtractIncoming, setSubtractIncoming] = useState<boolean>(true);
  const [velocityWindow, setVelocityWindow] = useState<VelocityWindow>('30d');
  const [warehouseFilter, setWarehouseFilter] = useState<string>('All');
  const [brandFilter, setBrandFilter] = useState<string>('All');
  const [priorityFilter, setPriorityFilter] = useState<PriorityFilter>('DISPATCH');
  const [searchTerm, setSearchTerm] = useState<string>('');

  const uniqueWarehouses = useMemo(
    () => Array.from(new Set(inventoryData.map(i => i.warehouseName))).sort(),
    [inventoryData]
  );

  const uniqueBrands = useMemo(
    () => Array.from(new Set(inventoryData.map(i => i.brandName))).sort(),
    [inventoryData]
  );

  // Sales report totals per itemId + active day span
  const reportVelocityMap = useMemo(() => {
    const qtyMap = new Map<string, number>();
    let minDate = '';
    let maxDate = '';

    salesData.forEach(s => {
      qtyMap.set(s.itemId, (qtyMap.get(s.itemId) || 0) + s.quantity);
      if (s.date && /^\d{4}-\d{2}-\d{2}/.test(s.date)) {
        const d = s.date.substring(0, 10);
        if (!minDate || d < minDate) minDate = d;
        if (!maxDate || d > maxDate) maxDate = d;
      }
    });

    let spanDays = 30;
    if (minDate && maxDate) {
      const diff = Math.round(
        (new Date(maxDate).getTime() - new Date(minDate).getTime()) / (1000 * 60 * 60 * 24)
      ) + 1;
      if (diff >= 1) spanDays = diff;
    }

    // Count warehouses per itemId to allocate proportional fallback if needed
    const whCountMap = new Map<string, number>();
    const whTotalSellableMap = new Map<string, number>();
    inventoryData.forEach(inv => {
      whCountMap.set(inv.itemId, (whCountMap.get(inv.itemId) || 0) + 1);
      whTotalSellableMap.set(inv.itemId, (whTotalSellableMap.get(inv.itemId) || 0) + inv.totalSellable);
    });

    return { qtyMap, spanDays, whCountMap, whTotalSellableMap };
  }, [salesData, inventoryData]);

  // Build warehouse-level replenishment rows
  const replenishmentRows = useMemo(() => {
    const rows = inventoryData.map(inv => {
      let dailySales = 0;
      if (velocityWindow === '7d') {
        dailySales = (inv.soldLast7 || 0) / 7;
      } else if (velocityWindow === '15d') {
        dailySales = (inv.soldLast15 || 0) / 15;
      } else if (velocityWindow === 'report') {
        const totalItemReportQty = reportVelocityMap.qtyMap.get(inv.itemId) || 0;
        const totalSell = reportVelocityMap.whTotalSellableMap.get(inv.itemId) || 0;
        const whCount = reportVelocityMap.whCountMap.get(inv.itemId) || 1;
        const share = totalSell > 0 ? inv.totalSellable / totalSell : 1 / whCount;
        dailySales = (totalItemReportQty * share) / reportVelocityMap.spanDays;
      } else {
        // Default 30d with fallback to report if soldLast30 is missing
        if ((inv.soldLast30 || 0) > 0) {
          dailySales = (inv.soldLast30 || 0) / 30;
        } else {
          const totalItemReportQty = reportVelocityMap.qtyMap.get(inv.itemId) || 0;
          const totalSell = reportVelocityMap.whTotalSellableMap.get(inv.itemId) || 0;
          const whCount = reportVelocityMap.whCountMap.get(inv.itemId) || 1;
          const share = totalSell > 0 ? inv.totalSellable / totalSell : 1 / whCount;
          dailySales = (totalItemReportQty * share) / reportVelocityMap.spanDays;
        }
      }

      const targetStock = Math.ceil(dailySales * targetDays);
      const effectiveStock = subtractIncoming
        ? inv.totalSellable + Math.max(0, inv.incomingScheduled)
        : inv.totalSellable;

      const recommendedDispatch = Math.max(0, targetStock - effectiveStock);
      const excessQty = effectiveStock > targetStock && dailySales > 0
        ? Math.max(0, effectiveStock - Math.ceil(dailySales * (targetDays + 15)))
        : effectiveStock > 0 && dailySales === 0
          ? effectiveStock
          : 0;

      const currentRunwayDays = dailySales > 0 ? Math.floor(inv.totalSellable / dailySales) : 999;

      let priority: 'Stockout' | 'Critical' | 'Low' | 'Healthy' | 'Excess' = 'Healthy';
      if (inv.totalSellable === 0 && dailySales > 0) priority = 'Stockout';
      else if (currentRunwayDays < 7 && dailySales > 0) priority = 'Critical';
      else if (recommendedDispatch > 0) priority = 'Low';
      else if (excessQty > 0) priority = 'Excess';

      return {
        ...inv,
        dailySales,
        targetStock,
        effectiveStock,
        recommendedDispatch,
        excessQty,
        currentRunwayDays,
        priority,
      };
    });

    // Identify warehouses with excess stock per itemId to suggest rebalance source
    const excessByItem = new Map<string, { warehouseName: string; qty: number }[]>();
    rows.forEach(r => {
      if (r.excessQty > 0) {
        const list = excessByItem.get(r.itemId) || [];
        list.push({ warehouseName: r.warehouseName, qty: r.excessQty });
        excessByItem.set(r.itemId, list);
      }
    });

    return rows.map(r => {
      const sources = (excessByItem.get(r.itemId) || []).filter(
        s => s.warehouseName !== r.warehouseName
      );
      return {
        ...r,
        rebalanceFrom: r.recommendedDispatch > 0 && sources.length > 0 ? sources[0] : null,
      };
    });
  }, [inventoryData, velocityWindow, targetDays, subtractIncoming, reportVelocityMap]);

  const filteredRows = useMemo(() => {
    return replenishmentRows
      .filter(r => {
        if (warehouseFilter !== 'All' && r.warehouseName !== warehouseFilter) return false;
        if (brandFilter !== 'All' && r.brandName !== brandFilter) return false;
        if (priorityFilter === 'DISPATCH' && r.recommendedDispatch <= 0) return false;
        if (priorityFilter === 'CRITICAL' && r.priority !== 'Stockout' && r.priority !== 'Critical') return false;
        if (priorityFilter === 'EXCESS' && r.excessQty <= 0) return false;
        if (searchTerm) {
          const q = searchTerm.toLowerCase();
          return (
            r.itemName.toLowerCase().includes(q) ||
            r.itemId.toLowerCase().includes(q) ||
            r.warehouseName.toLowerCase().includes(q)
          );
        }
        return true;
      })
      .sort((a, b) => b.recommendedDispatch - a.recommendedDispatch);
  }, [replenishmentRows, warehouseFilter, brandFilter, priorityFilter, searchTerm]);

  // Warehouse summary cards
  const warehouseSummary = useMemo(() => {
    const map = new Map<string, { warehouse: string; dispatchUnits: number; criticalSkus: number; totalSkus: number }>();
    replenishmentRows.forEach(r => {
      if (brandFilter !== 'All' && r.brandName !== brandFilter) return;
      const entry = map.get(r.warehouseName) || {
        warehouse: r.warehouseName,
        dispatchUnits: 0,
        criticalSkus: 0,
        totalSkus: 0,
      };
      entry.dispatchUnits += r.recommendedDispatch;
      if (r.priority === 'Stockout' || r.priority === 'Critical') entry.criticalSkus += 1;
      if (r.recommendedDispatch > 0) entry.totalSkus += 1;
      map.set(r.warehouseName, entry);
    });
    return Array.from(map.values())
      .filter(w => w.dispatchUnits > 0 || w.criticalSkus > 0)
      .sort((a, b) => b.dispatchUnits - a.dispatchUnits);
  }, [replenishmentRows, brandFilter]);

  const kpis = useMemo(() => {
    const totalDispatchUnits = filteredRows.reduce((s, r) => s + r.recommendedDispatch, 0);
    const skusNeedingStock = replenishmentRows.filter(r => r.recommendedDispatch > 0).length;
    const criticalCount = replenishmentRows.filter(r => r.priority === 'Stockout' || r.priority === 'Critical').length;
    const totalExcessUnits = replenishmentRows.reduce((s, r) => s + r.excessQty, 0);
    return { totalDispatchUnits, skusNeedingStock, criticalCount, totalExcessUnits };
  }, [filteredRows, replenishmentRows]);

  const handleExportExcel = () => {
    const exportData = filteredRows.map(r => ({
      'Warehouse': r.warehouseName,
      'Warehouse ID': r.warehouseId,
      'Item ID': r.itemId,
      'Product Name': r.itemName,
      'Brand': r.brandName,
      'UPC': r.upc,
      'Current Sellable': r.totalSellable,
      'Incoming Scheduled': r.incomingScheduled,
      'Daily Sales Rate': Number(r.dailySales.toFixed(2)),
      'Current Runway (Days)': r.currentRunwayDays >= 999 ? '999+' : r.currentRunwayDays,
      [`Target Stock (${targetDays}d)`]: r.targetStock,
      'Recommended Dispatch Qty': r.recommendedDispatch,
      'Excess Qty': r.excessQty,
      'Priority': r.priority,
      'Rebalance Suggestion': r.rebalanceFrom ? `From ${r.rebalanceFrom.warehouseName} (${r.rebalanceFrom.qty} avail)` : '-',
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Replenishment PO Plan');
    XLSX.writeFile(wb, `Blinkit_Replenishment_Plan_${targetDays}d_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const handleExportCSV = () => {
    const headers = [
      'Warehouse', 'Item ID', 'Product Name', 'Brand', 'Current Sellable',
      'Incoming', 'Daily Rate', 'Runway Days', `Target (${targetDays}d)`, 'Dispatch Qty', 'Priority'
    ];
    const rows = filteredRows.map(r => [
      `"${r.warehouseName.replace(/"/g, '""')}"`,
      r.itemId,
      `"${r.itemName.replace(/"/g, '""')}"`,
      `"${r.brandName.replace(/"/g, '""')}"`,
      r.totalSellable,
      r.incomingScheduled,
      r.dailySales.toFixed(2),
      r.currentRunwayDays >= 999 ? '999+' : r.currentRunwayDays,
      r.targetStock,
      r.recommendedDispatch,
      r.priority
    ]);

    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Blinkit_PO_Dispatch_${targetDays}d_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  if (inventoryData.length === 0) {
    return (
      <div className="bg-white dark:bg-slate-800 p-10 rounded-2xl border border-gray-100 dark:border-slate-700 text-center max-w-lg mx-auto mt-12">
        <Truck className="w-12 h-12 text-yellow-500 mx-auto mb-3 opacity-80" />
        <h3 className="text-lg font-bold text-gray-900 dark:text-white">No Warehouse Inventory Loaded</h3>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Upload your Blinkit Warehouse Stock sheet in Data Import to generate warehouse-wise PO & replenishment quantities.
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
            <Truck className="w-6 h-6 text-yellow-500" />
            Warehouse Replenishment & PO Planner
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            Warehouse-by-SKU dispatch calculator to prevent stockouts and rebalance overstocked hubs.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={handleExportCSV}
            className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 hover:bg-gray-50 dark:hover:bg-slate-700 text-gray-700 dark:text-gray-200 rounded-lg text-sm font-medium transition-colors"
          >
            <Download className="w-4 h-4" />
            Export CSV
          </button>
          <button
            onClick={handleExportExcel}
            className="flex items-center gap-2 px-4 py-2 bg-yellow-400 hover:bg-yellow-300 text-slate-900 rounded-lg text-sm font-bold shadow-sm transition-colors"
          >
            <FileSpreadsheet className="w-4 h-4" />
            Download PO Sheet (.xlsx)
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-slate-800 p-5 rounded-xl border border-gray-100 dark:border-slate-700 shadow-sm">
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Recommended Dispatch</p>
          <p className="text-2xl font-extrabold text-indigo-600 dark:text-indigo-400 mt-1">
            {kpis.totalDispatchUnits.toLocaleString()} units
          </p>
          <p className="text-xs text-gray-400 mt-1">For {targetDays}-day stock cover (filtered)</p>
        </div>

        <div className="bg-white dark:bg-slate-800 p-5 rounded-xl border border-gray-100 dark:border-slate-700 shadow-sm">
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Warehouse Lines to Restock</p>
          <p className="text-2xl font-extrabold text-gray-900 dark:text-white mt-1">
            {kpis.skusNeedingStock.toLocaleString()}
          </p>
          <p className="text-xs text-gray-400 mt-1">SKU-warehouse pairs below {targetDays}d cover</p>
        </div>

        <div className="bg-white dark:bg-slate-800 p-5 rounded-xl border border-red-100 dark:border-red-900/30 shadow-sm">
          <p className="text-xs font-medium text-red-600 dark:text-red-400 uppercase tracking-wider flex items-center gap-1">
            <AlertTriangle className="w-3.5 h-3.5" /> Critical / Stockout (&lt;7d)
          </p>
          <p className="text-2xl font-extrabold text-red-600 dark:text-red-400 mt-1">
            {kpis.criticalCount.toLocaleString()}
          </p>
          <p className="text-xs text-gray-400 mt-1">Urgent PO required</p>
        </div>

        <div className="bg-white dark:bg-slate-800 p-5 rounded-xl border border-amber-100 dark:border-amber-900/30 shadow-sm">
          <p className="text-xs font-medium text-amber-600 dark:text-amber-400 uppercase tracking-wider flex items-center gap-1">
            <ArrowRightLeft className="w-3.5 h-3.5" /> Rebalanceable Excess
          </p>
          <p className="text-2xl font-extrabold text-amber-600 dark:text-amber-400 mt-1">
            {kpis.totalExcessUnits.toLocaleString()} units
          </p>
          <p className="text-xs text-gray-400 mt-1">Overstocked across warehouses</p>
        </div>
      </div>

      {/* Controls Bar */}
      <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-gray-100 dark:border-slate-700 shadow-sm space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
          <div>
            <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1">
              Target Cover Days: <span className="text-indigo-600 dark:text-indigo-400 font-bold">{targetDays}d</span>
            </label>
            <div className="flex items-center gap-1.5">
              {[15, 30, 45, 60].map(d => (
                <button
                  key={d}
                  onClick={() => setTargetDays(d)}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                    targetDays === d
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-slate-600'
                  }`}
                >
                  {d}d
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1">Velocity Basis</label>
            <select
              value={velocityWindow}
              onChange={(e) => setVelocityWindow(e.target.value as VelocityWindow)}
              className="w-full p-2 text-xs border border-gray-200 dark:border-slate-600 rounded-lg bg-gray-50 dark:bg-slate-700 text-gray-800 dark:text-white outline-none focus:ring-2 focus:ring-yellow-400"
            >
              <option value="30d">Inventory Sold (Last 30d)</option>
              <option value="15d">Inventory Sold (Last 15d)</option>
              <option value="7d">Inventory Sold (Last 7d)</option>
              <option value="report">Uploaded Sales Reports</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1">Warehouse</label>
            <select
              value={warehouseFilter}
              onChange={(e) => setWarehouseFilter(e.target.value)}
              className="w-full p-2 text-xs border border-gray-200 dark:border-slate-600 rounded-lg bg-gray-50 dark:bg-slate-700 text-gray-800 dark:text-white outline-none focus:ring-2 focus:ring-yellow-400"
            >
              <option value="All">All Warehouses ({uniqueWarehouses.length})</option>
              {uniqueWarehouses.map(w => (
                <option key={w} value={w}>{w}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1">Brand</label>
            <select
              value={brandFilter}
              onChange={(e) => setBrandFilter(e.target.value)}
              className="w-full p-2 text-xs border border-gray-200 dark:border-slate-600 rounded-lg bg-gray-50 dark:bg-slate-700 text-gray-800 dark:text-white outline-none focus:ring-2 focus:ring-yellow-400"
            >
              <option value="All">All Brands</option>
              {uniqueBrands.map(b => (
                <option key={b} value={b}>{b}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1">View Priority</label>
            <select
              value={priorityFilter}
              onChange={(e) => setPriorityFilter(e.target.value as PriorityFilter)}
              className="w-full p-2 text-xs border border-gray-200 dark:border-slate-600 rounded-lg bg-gray-50 dark:bg-slate-700 text-gray-800 dark:text-white outline-none focus:ring-2 focus:ring-yellow-400"
            >
              <option value="DISPATCH">Needs Dispatch (&gt;0 qty)</option>
              <option value="CRITICAL">Critical &amp; Stockout Only</option>
              <option value="EXCESS">Overstocked / Excess Only</option>
              <option value="ALL">All Warehouse Lines</option>
            </select>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 pt-2 border-t border-gray-100 dark:border-slate-700">
          <div className="relative w-full sm:w-80">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search SKU, Product, or Warehouse..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 text-xs border border-gray-200 dark:border-slate-600 rounded-lg bg-gray-50 dark:bg-slate-700 text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-yellow-400"
            />
          </div>

          <label className="flex items-center gap-2 text-xs font-medium text-gray-700 dark:text-gray-300 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={subtractIncoming}
              onChange={(e) => setSubtractIncoming(e.target.checked)}
              className="rounded text-indigo-600 focus:ring-indigo-500"
            />
            Subtract Incoming Scheduled Stock from Dispatch Qty
          </label>
        </div>
      </div>

      {/* Quick Warehouse Dispatch Pills */}
      {warehouseSummary.length > 0 && (
        <div className="flex items-center gap-2 overflow-x-auto pb-1 custom-scrollbar">
          <button
            onClick={() => setWarehouseFilter('All')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold shrink-0 transition-colors border ${
              warehouseFilter === 'All'
                ? 'bg-slate-900 text-white dark:bg-yellow-400 dark:text-slate-900 border-transparent'
                : 'bg-white dark:bg-slate-800 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-slate-700 hover:bg-gray-50'
            }`}
          >
            All Hubs
          </button>
          {warehouseSummary.map(w => (
            <button
              key={w.warehouse}
              onClick={() => setWarehouseFilter(w.warehouse === warehouseFilter ? 'All' : w.warehouse)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold shrink-0 transition-colors border flex items-center gap-2 ${
                warehouseFilter === w.warehouse
                  ? 'bg-indigo-600 text-white border-indigo-600'
                  : 'bg-white dark:bg-slate-800 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-slate-700 hover:border-indigo-400'
              }`}
            >
              <span>{w.warehouse}</span>
              <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                warehouseFilter === w.warehouse
                  ? 'bg-white/20 text-white'
                  : 'bg-indigo-50 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300'
              }`}>
                {w.dispatchUnits.toLocaleString()} qty
              </span>
            </button>
          ))}
        </div>
      )}

      {/* Main Table */}
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-100 dark:border-slate-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-gray-50 dark:bg-slate-700/70 text-gray-600 dark:text-gray-300 uppercase font-semibold border-b border-gray-100 dark:border-slate-700">
              <tr>
                <th className="px-4 py-3.5">Product &amp; SKU</th>
                <th className="px-4 py-3.5">Warehouse Hub</th>
                <th className="px-4 py-3.5 text-center">Priority</th>
                <th className="px-4 py-3.5 text-right">Sellable</th>
                <th className="px-4 py-3.5 text-right">Incoming</th>
                <th className="px-4 py-3.5 text-right">Daily Rate</th>
                <th className="px-4 py-3.5 text-right">Runway</th>
                <th className="px-4 py-3.5 text-right">Target ({targetDays}d)</th>
                <th className="px-4 py-3.5 text-right bg-indigo-50/70 dark:bg-indigo-950/30 text-indigo-700 dark:text-indigo-300">
                  Dispatch Qty
                </th>
                <th className="px-4 py-3.5">Rebalance Tip</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
              {filteredRows.slice(0, 200).map((row, idx) => (
                <tr
                  key={`${row.itemId}-${row.warehouseId}-${idx}`}
                  onClick={() => onSelectProduct(row.itemId)}
                  className="hover:bg-gray-50 dark:hover:bg-slate-700/40 cursor-pointer transition-colors"
                >
                  <td className="px-4 py-3 max-w-[240px]">
                    <div className="font-semibold text-gray-900 dark:text-gray-100 truncate" title={row.itemName}>
                      {row.itemName}
                    </div>
                    <div className="text-[11px] text-gray-400 mt-0.5">
                      ID: {row.itemId} • {row.brandName}
                    </div>
                  </td>
                  <td className="px-4 py-3 font-medium text-gray-700 dark:text-gray-300 whitespace-nowrap">
                    {row.warehouseName}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                      row.priority === 'Stockout' ? 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300' :
                      row.priority === 'Critical' ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300' :
                      row.priority === 'Low' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300' :
                      row.priority === 'Excess' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300' :
                      'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300'
                    }`}>
                      {row.priority}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right font-semibold text-gray-900 dark:text-white">
                    {row.totalSellable.toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-right text-amber-600 dark:text-amber-400 font-medium">
                    {row.incomingScheduled > 0 ? `+${row.incomingScheduled}` : '0'}
                  </td>
                  <td className="px-4 py-3 text-right text-gray-600 dark:text-gray-300">
                    {row.dailySales.toFixed(1)}/d
                  </td>
                  <td className="px-4 py-3 text-right font-medium">
                    <span className={row.currentRunwayDays < 7 ? 'text-red-600 dark:text-red-400 font-bold' : 'text-gray-600 dark:text-gray-300'}>
                      {row.currentRunwayDays >= 999 ? '∞' : `${row.currentRunwayDays}d`}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right text-gray-600 dark:text-gray-300 font-medium">
                    {row.targetStock.toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-right bg-indigo-50/40 dark:bg-indigo-950/20">
                    {row.recommendedDispatch > 0 ? (
                      <span className="inline-block px-2.5 py-1 rounded-md bg-indigo-600 text-white font-bold">
                        {row.recommendedDispatch.toLocaleString()}
                      </span>
                    ) : (
                      <span className="text-gray-400">0</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-[11px] text-gray-500 dark:text-gray-400">
                    {row.rebalanceFrom ? (
                      <span className="text-amber-700 dark:text-amber-300 font-medium">
                        Pull from {row.rebalanceFrom.warehouseName} ({row.rebalanceFrom.qty} excess)
                      </span>
                    ) : row.excessQty > 0 ? (
                      <span className="text-amber-600 dark:text-amber-400">
                        {row.excessQty} excess units
                      </span>
                    ) : (
                      <span>-</span>
                    )}
                  </td>
                </tr>
              ))}
              {filteredRows.length === 0 && (
                <tr>
                  <td colSpan={10} className="px-6 py-12 text-center text-gray-400 dark:text-gray-500">
                    <CheckCircle2 className="w-8 h-8 mx-auto mb-2 text-green-500 opacity-70" />
                    No warehouse lines match this filter.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {filteredRows.length > 200 && (
          <div className="px-4 py-2.5 bg-gray-50 dark:bg-slate-900/50 border-t border-gray-100 dark:border-slate-700 text-xs text-gray-500 flex items-center gap-2">
            <Info className="w-4 h-4 text-blue-500" />
            Showing top 200 rows sorted by highest dispatch qty. Download Excel/CSV for all {filteredRows.length} rows.
          </div>
        )}
      </div>
    </div>
  );
};
