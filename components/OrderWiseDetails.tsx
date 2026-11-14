import React, { useMemo, useState, useEffect } from 'react';
import {
  SalesRecord,
  InventoryRecord,
  ProductCostConfig,
  GlobalProfitConfig,
} from '../types';
import {
  Receipt, Search, Download, Filter, Calendar, MapPin, User,
  Package, IndianRupee, Sliders, X, ChevronLeft, ChevronRight,
  Layers, Eye, ArrowDownRight, CheckCircle2, Info
} from 'lucide-react';
import * as XLSX from 'xlsx';

interface OrderWiseDetailsProps {
  salesData: SalesRecord[];
  inventoryData: InventoryRecord[];
  productCosts: Record<string, ProductCostConfig>;
  globalConfig: GlobalProfitConfig;
  onUpdateGlobalConfig: (config: GlobalProfitConfig) => void;
  onSelectProduct: (itemId: string) => void;
}

interface EnrichedLineItem {
  key: string;
  orderNo: string;
  date: string;
  itemId: string;
  itemName: string;
  brandName: string;
  customerName: string;
  customerAddress: string;
  customerCity: string;
  customerState: string;
  supplyLocation: string;
  orderStatus: string;
  units: number;
  mrp: number;
  sellingPrice: number;
  igst: number;
  cgst: number;
  sgst: number;
  totalTax: number;
  invoiceAmount: number;
  commission: number;
  shipping: number;
  feeGst: number;
  tcs: number;
  tds: number;
  otherCharges: number;
  totalCharges: number;
  receivedAmount: number;
  chargeSource: 'Actual' | 'Estimated';
}

interface GroupedOrder {
  orderNo: string;
  date: string;
  customerName: string;
  customerAddress: string;
  customerCity: string;
  customerState: string;
  supplyLocation: string;
  orderStatus: string;
  items: EnrichedLineItem[];
  units: number;
  totalTax: number;
  invoiceAmount: number;
  commission: number;
  shipping: number;
  feeGst: number;
  tcs: number;
  tds: number;
  otherCharges: number;
  totalCharges: number;
  receivedAmount: number;
  chargeSource: 'Actual' | 'Estimated';
}

const PAGE_SIZE = 50;

export const OrderWiseDetails: React.FC<OrderWiseDetailsProps> = ({
  salesData,
  inventoryData,
  productCosts,
  globalConfig,
  onUpdateGlobalConfig,
  onSelectProduct,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [stateFilter, setStateFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState('All');
  const [viewType, setViewType] = useState<'ORDER' | 'ITEM'>('ORDER');
  const [showRates, setShowRates] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedOrder, setSelectedOrder] = useState<GroupedOrder | null>(null);

  const invLookup = useMemo(() => {
    const map = new Map<string, { name: string; brand: string }>();
    inventoryData.forEach(inv => {
      if (!map.has(inv.itemId)) {
        map.set(inv.itemId, { name: inv.itemName, brand: inv.brandName });
      }
    });
    return map;
  }, [inventoryData]);

  const tcsPct = globalConfig.tcsPct ?? 0;
  const tdsPct = globalConfig.tdsPct ?? 0;

  // Enrich every line item with itemized charges and received amount
  const enrichedLines = useMemo<EnrichedLineItem[]>(() => {
    return salesData.map((s, idx) => {
      const lookup = invLookup.get(s.itemId);
      const customCost = productCosts[s.itemId];
      const commPct = customCost?.commissionPct ?? globalConfig.defaultCommissionPct;
      const shipPerUnit = customCost?.shippingFee ?? globalConfig.defaultShippingPerUnit;

      const invoiceAmount = s.revenue || 0;
      const units = s.quantity || 0;

      const hasSheetCharges =
        s.commissionCharge !== undefined ||
        s.shippingCharge !== undefined ||
        s.feeGstCharge !== undefined ||
        s.receivedAmount !== undefined;

      const commission =
        s.commissionCharge !== undefined
          ? s.commissionCharge
          : invoiceAmount * (commPct / 100);
      const shipping =
        s.shippingCharge !== undefined
          ? s.shippingCharge
          : shipPerUnit * units;
      const feeGst =
        s.feeGstCharge !== undefined
          ? s.feeGstCharge
          : (commission + shipping) * (globalConfig.gstOnFeesPct / 100);
      const tcs =
        s.tcsCharge !== undefined
          ? s.tcsCharge
          : invoiceAmount * (tcsPct / 100);
      const tds =
        s.tdsCharge !== undefined
          ? s.tdsCharge
          : invoiceAmount * (tdsPct / 100);
      const otherCharges = s.otherCharges ?? 0;

      const totalCharges = commission + shipping + feeGst + tcs + tds + otherCharges;
      const receivedAmount =
        s.receivedAmount !== undefined
          ? s.receivedAmount
          : invoiceAmount - totalCharges;

      const city = s.customerCity && s.customerCity !== 'Unknown' ? s.customerCity : 'N/A';
      const state = s.customerState || 'N/A';
      const address =
        s.customerAddress ||
        (city !== 'N/A' || state !== 'N/A'
          ? [city !== 'N/A' ? city : '', state !== 'N/A' ? state : ''].filter(Boolean).join(', ')
          : 'Not in Sheet');

      const customerName =
        s.customerName || (city !== 'N/A' ? `Customer (${city})` : 'Blinkit Customer');

      const supplyLocation = [s.supplyCity, s.supplyState].filter(Boolean).join(', ') || 'Blinkit Hub';

      const igst = s.igst ?? 0;
      const cgst = s.cgst ?? 0;
      const sgst = s.sgst ?? 0;
      const totalTax = s.totalTax ?? igst + cgst + sgst;

      return {
        key: `${s.orderId || 'ROW'}-${s.itemId}-${idx}`,
        orderNo: s.orderId || `ORD-${String(idx + 1).padStart(5, '0')}`,
        date: s.date || 'N/A',
        itemId: s.itemId,
        itemName: s.itemName || lookup?.name || `Item ${s.itemId}`,
        brandName: s.brandName || lookup?.brand || 'Unknown',
        customerName,
        customerAddress: address,
        customerCity: city,
        customerState: state,
        supplyLocation,
        orderStatus: s.orderStatus || 'DELIVERED',
        units,
        mrp: s.mrp ?? 0,
        sellingPrice: s.sellingPrice ?? (units > 0 ? invoiceAmount / units : invoiceAmount),
        igst,
        cgst,
        sgst,
        totalTax,
        invoiceAmount,
        commission,
        shipping,
        feeGst,
        tcs,
        tds,
        otherCharges,
        totalCharges,
        receivedAmount,
        chargeSource: hasSheetCharges ? 'Actual' : 'Estimated',
      };
    });
  }, [salesData, invLookup, productCosts, globalConfig, tcsPct, tdsPct]);

  const availableStates = useMemo(() => {
    const set = new Set<string>();
    enrichedLines.forEach(l => {
      if (l.customerState && l.customerState !== 'N/A') set.add(l.customerState);
    });
    return Array.from(set).sort();
  }, [enrichedLines]);

  const availableStatuses = useMemo(() => {
    const set = new Set<string>();
    enrichedLines.forEach(l => {
      if (l.orderStatus) set.add(l.orderStatus);
    });
    return Array.from(set).sort();
  }, [enrichedLines]);

  // Filtered line items
  const filteredLines = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return enrichedLines.filter(l => {
      if (startDate && l.date !== 'N/A' && l.date < startDate) return false;
      if (endDate && l.date !== 'N/A' && l.date > endDate) return false;
      if (stateFilter !== 'All' && l.customerState !== stateFilter) return false;
      if (statusFilter !== 'All' && l.orderStatus !== statusFilter) return false;
      if (q) {
        const hay = `${l.orderNo} ${l.itemId} ${l.itemName} ${l.customerName} ${l.customerAddress} ${l.customerCity} ${l.customerState}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [enrichedLines, startDate, endDate, stateFilter, statusFilter, searchTerm]);

  // Group into Orders by Order No
  const groupedOrders = useMemo<GroupedOrder[]>(() => {
    const map = new Map<string, GroupedOrder>();

    for (const line of filteredLines) {
      const existing = map.get(line.orderNo);
      if (!existing) {
        map.set(line.orderNo, {
          orderNo: line.orderNo,
          date: line.date,
          customerName: line.customerName,
          customerAddress: line.customerAddress,
          customerCity: line.customerCity,
          customerState: line.customerState,
          supplyLocation: line.supplyLocation,
          orderStatus: line.orderStatus,
          items: [line],
          units: line.units,
          totalTax: line.totalTax,
          invoiceAmount: line.invoiceAmount,
          commission: line.commission,
          shipping: line.shipping,
          feeGst: line.feeGst,
          tcs: line.tcs,
          tds: line.tds,
          otherCharges: line.otherCharges,
          totalCharges: line.totalCharges,
          receivedAmount: line.receivedAmount,
          chargeSource: line.chargeSource,
        });
      } else {
        existing.items.push(line);
        existing.units += line.units;
        existing.totalTax += line.totalTax;
        existing.invoiceAmount += line.invoiceAmount;
        existing.commission += line.commission;
        existing.shipping += line.shipping;
        existing.feeGst += line.feeGst;
        existing.tcs += line.tcs;
        existing.tds += line.tds;
        existing.otherCharges += line.otherCharges;
        existing.totalCharges += line.totalCharges;
        existing.receivedAmount += line.receivedAmount;
        if (line.chargeSource === 'Actual') existing.chargeSource = 'Actual';
      }
    }

    return Array.from(map.values()).sort((a, b) => b.date.localeCompare(a.date));
  }, [filteredLines]);

  // Reset pagination when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, startDate, endDate, stateFilter, statusFilter, viewType]);

  // Summary Totals across filtered orders
  const summary = useMemo(() => {
    const totalOrders = groupedOrders.length;
    const totalUnits = filteredLines.reduce((s, l) => s + l.units, 0);
    const totalInvoice = filteredLines.reduce((s, l) => s + l.invoiceAmount, 0);
    const totalCharges = filteredLines.reduce((s, l) => s + l.totalCharges, 0);
    const totalReceived = filteredLines.reduce((s, l) => s + l.receivedAmount, 0);
    const totalTax = filteredLines.reduce((s, l) => s + l.totalTax, 0);
    const totalComm = filteredLines.reduce((s, l) => s + l.commission, 0);
    const totalShip = filteredLines.reduce((s, l) => s + l.shipping, 0);
    const totalFeeGst = filteredLines.reduce((s, l) => s + l.feeGst, 0);

    return {
      totalOrders,
      totalLines: filteredLines.length,
      totalUnits,
      totalInvoice,
      totalCharges,
      totalReceived,
      totalTax,
      totalComm,
      totalShip,
      totalFeeGst,
      receivedPct: totalInvoice > 0 ? (totalReceived / totalInvoice) * 100 : 0,
      chargePct: totalInvoice > 0 ? (totalCharges / totalInvoice) * 100 : 0,
    };
  }, [groupedOrders, filteredLines]);

  const activeRowsCount = viewType === 'ORDER' ? groupedOrders.length : filteredLines.length;
  const totalPages = Math.max(1, Math.ceil(activeRowsCount / PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);

  const pagedOrders = useMemo(
    () => groupedOrders.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE),
    [groupedOrders, safePage]
  );

  const pagedLines = useMemo(
    () =>
      [...filteredLines]
        .sort((a, b) => b.date.localeCompare(a.date))
        .slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE),
    [filteredLines, safePage]
  );

  const handleOpenLineAsOrder = (line: EnrichedLineItem) => {
    const found = groupedOrders.find(o => o.orderNo === line.orderNo);
    if (found) setSelectedOrder(found);
  };

  const handleExportExcel = () => {
    const orderRows = groupedOrders.map(o => ({
      'Order No': o.orderNo,
      'Order Date': o.date,
      'Status': o.orderStatus,
      'Items': o.items.map(i => `${i.itemName} (x${i.units})`).join(' | '),
      'Customer': o.customerName,
      'Address / City': o.customerAddress,
      'State': o.customerState,
      'Supply Hub': o.supplyLocation,
      'Total Units': o.units,
      'Invoice Amount (INR)': Number(o.invoiceAmount.toFixed(2)),
      'Product GST Included (INR)': Number(o.totalTax.toFixed(2)),
      'Blinkit Commission (INR)': Number(o.commission.toFixed(2)),
      'Fulfillment / Shipping Fee (INR)': Number(o.shipping.toFixed(2)),
      'GST on Fees (INR)': Number(o.feeGst.toFixed(2)),
      'TCS (INR)': Number(o.tcs.toFixed(2)),
      'TDS (INR)': Number(o.tds.toFixed(2)),
      'Other Charges (INR)': Number(o.otherCharges.toFixed(2)),
      'Total Charges Cut (INR)': Number(o.totalCharges.toFixed(2)),
      'Net Received Amount (INR)': Number(o.receivedAmount.toFixed(2)),
      'Charge Basis': o.chargeSource,
    }));

    const itemRows = filteredLines.map(l => ({
      'Order No': l.orderNo,
      'Order Date': l.date,
      'Item ID': l.itemId,
      'Item Name': l.itemName,
      'Brand': l.brandName,
      'Status': l.orderStatus,
      'Customer': l.customerName,
      'Address': l.customerAddress,
      'City': l.customerCity,
      'State': l.customerState,
      'Units': l.units,
      'MRP (INR)': Number(l.mrp.toFixed(2)),
      'Selling Price (INR)': Number(l.sellingPrice.toFixed(2)),
      'Tax (INR)': Number(l.totalTax.toFixed(2)),
      'Invoice Amount (INR)': Number(l.invoiceAmount.toFixed(2)),
      'Commission (INR)': Number(l.commission.toFixed(2)),
      'Fulfillment Fee (INR)': Number(l.shipping.toFixed(2)),
      'GST on Fees (INR)': Number(l.feeGst.toFixed(2)),
      'TCS (INR)': Number(l.tcs.toFixed(2)),
      'TDS (INR)': Number(l.tds.toFixed(2)),
      'Total Charges Cut (INR)': Number(l.totalCharges.toFixed(2)),
      'Net Received Amount (INR)': Number(l.receivedAmount.toFixed(2)),
    }));

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(orderRows), 'Order Wise Summary');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(itemRows), 'Item Line Details');
    XLSX.writeFile(wb, `Blinkit_Order_Wise_Details_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const formatINR = (val: number) =>
    new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(val);

  const formatINR0 = (val: number) =>
    new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(val);

  if (salesData.length === 0) {
    return (
      <div className="bg-white dark:bg-slate-800 p-10 rounded-2xl border border-gray-100 dark:border-slate-700 text-center max-w-lg mx-auto mt-12">
        <Receipt className="w-12 h-12 text-yellow-500 mx-auto mb-3 opacity-80" />
        <h3 className="text-lg font-bold text-gray-900 dark:text-white">No Order Data Found</h3>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Upload your Blinkit Sales Reports to view Order-Wise Invoice, Customer, State, Charges, and Received Amount breakdown.
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
            <Receipt className="w-6 h-6 text-yellow-500" />
            Order-Wise Details &amp; Charges Breakdown
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            Order No, Date, Item, Customer, Address, State, Units, Invoice Amount, Deducted Charges &amp; Net Received Amount.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setShowRates(!showRates)}
            className="flex items-center gap-1.5 px-3 py-2 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 hover:bg-gray-50 dark:hover:bg-slate-700 text-gray-700 dark:text-gray-200 rounded-lg text-xs font-semibold transition-colors"
          >
            <Sliders className="w-4 h-4" />
            {showRates ? 'Hide Charge Rates' : 'Edit Charge Rates'}
          </button>
          <button
            onClick={handleExportExcel}
            className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold transition-colors shadow-sm"
          >
            <Download className="w-4 h-4" />
            Export Orders (.xlsx)
          </button>
        </div>
      </div>

      {/* KPI Summary Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-gray-100 dark:border-slate-700 shadow-sm">
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400">Total Orders &amp; Units</p>
          <p className="text-xl font-extrabold text-gray-900 dark:text-white mt-1">
            {summary.totalOrders.toLocaleString()} Orders
          </p>
          <p className="text-[11px] text-gray-400 mt-1">
            {summary.totalUnits.toLocaleString()} units ({summary.totalLines.toLocaleString()} line items)
          </p>
        </div>

        <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-gray-100 dark:border-slate-700 shadow-sm">
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400">Gross Invoice Amount</p>
          <p className="text-xl font-extrabold text-blue-600 dark:text-blue-400 mt-1">
            {formatINR0(summary.totalInvoice)}
          </p>
          <p className="text-[11px] text-gray-400 mt-1">
            Avg Order: {formatINR0(summary.totalOrders > 0 ? summary.totalInvoice / summary.totalOrders : 0)}
          </p>
        </div>

        <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-amber-100 dark:border-amber-900/30 shadow-sm">
          <p className="text-xs font-medium text-amber-600 dark:text-amber-400">Total Charges Cut</p>
          <p className="text-xl font-extrabold text-red-600 dark:text-red-400 mt-1">
            - {formatINR0(summary.totalCharges)}
          </p>
          <p className="text-[11px] text-gray-400 mt-1">
            {summary.chargePct.toFixed(1)}% of Invoice (Comm + Ship + GST)
          </p>
        </div>

        <div className="bg-emerald-50/70 dark:bg-emerald-950/20 p-4 rounded-xl border border-emerald-200 dark:border-emerald-800 shadow-sm">
          <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-300">Net Received Amount</p>
          <p className="text-xl font-black text-emerald-700 dark:text-emerald-400 mt-1">
            {formatINR0(summary.totalReceived)}
          </p>
          <p className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 mt-1">
            {summary.receivedPct.toFixed(1)}% of Invoice Payout
          </p>
        </div>

        <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-gray-100 dark:border-slate-700 shadow-sm">
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400">Product Tax (GST in Bill)</p>
          <p className="text-xl font-extrabold text-slate-700 dark:text-slate-200 mt-1">
            {formatINR0(summary.totalTax)}
          </p>
          <p className="text-[11px] text-gray-400 mt-1">
            Comm: {formatINR0(summary.totalComm)} • Fee GST: {formatINR0(summary.totalFeeGst)}
          </p>
        </div>
      </div>

      {/* Collapsible Charge Rate Configuration */}
      {showRates && (
        <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-gray-100 dark:border-slate-700 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold text-gray-700 dark:text-gray-200 uppercase tracking-wide flex items-center gap-1.5">
              <Info className="w-3.5 h-3.5 text-blue-500" />
              Platform Charge Deduction Rules (Auto-saved locally; overridden automatically if your sheet includes actual payout columns)
            </h4>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
            <div>
              <label className="block text-[11px] font-semibold text-gray-500 dark:text-gray-400 mb-1">
                Blinkit Commission (%)
              </label>
              <input
                type="number"
                min={0}
                max={100}
                step={0.5}
                value={globalConfig.defaultCommissionPct}
                onChange={(e) => onUpdateGlobalConfig({ ...globalConfig, defaultCommissionPct: Math.max(0, Number(e.target.value) || 0) })}
                className="w-full p-2 text-xs border border-gray-200 dark:border-slate-600 rounded-lg bg-gray-50 dark:bg-slate-700 text-gray-900 dark:text-white"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-gray-500 dark:text-gray-400 mb-1">
                Fulfillment / Shipping (₹/unit)
              </label>
              <input
                type="number"
                min={0}
                value={globalConfig.defaultShippingPerUnit}
                onChange={(e) => onUpdateGlobalConfig({ ...globalConfig, defaultShippingPerUnit: Math.max(0, Number(e.target.value) || 0) })}
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
                onChange={(e) => onUpdateGlobalConfig({ ...globalConfig, gstOnFeesPct: Math.max(0, Number(e.target.value) || 0) })}
                className="w-full p-2 text-xs border border-gray-200 dark:border-slate-600 rounded-lg bg-gray-50 dark:bg-slate-700 text-gray-900 dark:text-white"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-gray-500 dark:text-gray-400 mb-1">
                TCS (%)
              </label>
              <input
                type="number"
                min={0}
                max={10}
                step={0.1}
                value={tcsPct}
                onChange={(e) => onUpdateGlobalConfig({ ...globalConfig, tcsPct: Math.max(0, Number(e.target.value) || 0) })}
                className="w-full p-2 text-xs border border-gray-200 dark:border-slate-600 rounded-lg bg-gray-50 dark:bg-slate-700 text-gray-900 dark:text-white"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-gray-500 dark:text-gray-400 mb-1">
                TDS u/s 194-O (%)
              </label>
              <input
                type="number"
                min={0}
                max={10}
                step={0.1}
                value={tdsPct}
                onChange={(e) => onUpdateGlobalConfig({ ...globalConfig, tdsPct: Math.max(0, Number(e.target.value) || 0) })}
                className="w-full p-2 text-xs border border-gray-200 dark:border-slate-600 rounded-lg bg-gray-50 dark:bg-slate-700 text-gray-900 dark:text-white"
              />
            </div>
          </div>
        </div>
      )}

      {/* Search, Filters & View Switcher */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-100 dark:border-slate-700 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-gray-100 dark:border-slate-700 flex flex-col xl:flex-row justify-between items-start xl:items-center gap-3">
          <div className="flex flex-wrap items-center gap-2.5 w-full xl:w-auto">
            <div className="relative flex-1 min-w-[230px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search Order No, Item, Customer, Address, State..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 text-xs border border-gray-200 dark:border-slate-600 rounded-lg bg-gray-50 dark:bg-slate-700 text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-yellow-400"
              />
            </div>

            <div className="flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-gray-400" />
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="px-2 py-1.5 text-xs border border-gray-200 dark:border-slate-600 rounded-lg bg-gray-50 dark:bg-slate-700 text-gray-900 dark:text-white"
                title="Start Date"
              />
              <span className="text-xs text-gray-400">to</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="px-2 py-1.5 text-xs border border-gray-200 dark:border-slate-600 rounded-lg bg-gray-50 dark:bg-slate-700 text-gray-900 dark:text-white"
                title="End Date"
              />
            </div>

            <select
              value={stateFilter}
              onChange={(e) => setStateFilter(e.target.value)}
              className="px-2.5 py-1.5 text-xs border border-gray-200 dark:border-slate-600 rounded-lg bg-gray-50 dark:bg-slate-700 text-gray-800 dark:text-white"
            >
              <option value="All">All States ({availableStates.length})</option>
              {availableStates.map(st => (
                <option key={st} value={st}>{st}</option>
              ))}
            </select>

            {availableStatuses.length > 1 && (
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="px-2.5 py-1.5 text-xs border border-gray-200 dark:border-slate-600 rounded-lg bg-gray-50 dark:bg-slate-700 text-gray-800 dark:text-white"
              >
                <option value="All">All Statuses</option>
                {availableStatuses.map(st => (
                  <option key={st} value={st}>{st}</option>
                ))}
              </select>
            )}
          </div>

          <div className="flex items-center gap-1.5 bg-gray-100 dark:bg-slate-700 p-1 rounded-lg shrink-0">
            <button
              onClick={() => setViewType('ORDER')}
              className={`px-3 py-1 rounded-md text-xs font-bold transition-colors ${
                viewType === 'ORDER'
                  ? 'bg-white dark:bg-slate-600 text-slate-900 dark:text-white shadow-sm'
                  : 'text-gray-500 dark:text-gray-300 hover:text-gray-800'
              }`}
            >
              Order-Wise ({groupedOrders.length})
            </button>
            <button
              onClick={() => setViewType('ITEM')}
              className={`px-3 py-1 rounded-md text-xs font-bold transition-colors ${
                viewType === 'ITEM'
                  ? 'bg-white dark:bg-slate-600 text-slate-900 dark:text-white shadow-sm'
                  : 'text-gray-500 dark:text-gray-300 hover:text-gray-800'
              }`}
            >
              Line Items ({filteredLines.length})
            </button>
          </div>
        </div>

        {/* Orders / Lines Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-gray-50 dark:bg-slate-700/60 text-gray-600 dark:text-gray-300 font-semibold uppercase border-b border-gray-100 dark:border-slate-700">
              <tr>
                <th className="px-4 py-3.5">Order No &amp; Date</th>
                <th className="px-3 py-3.5">Item(s)</th>
                <th className="px-3 py-3.5">Customer &amp; Address</th>
                <th className="px-3 py-3.5">State</th>
                <th className="px-3 py-3.5 text-right">Units</th>
                <th className="px-3 py-3.5 text-right">Invoice Amt</th>
                <th className="px-3 py-3.5 text-right">Charges Cut</th>
                <th className="px-3 py-3.5 text-right">Received Amt</th>
                <th className="px-4 py-3.5 text-center">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
              {viewType === 'ORDER' ? (
                pagedOrders.map(order => {
                  const firstItem = order.items[0];
                  const extraItemsCount = order.items.length - 1;
                  return (
                    <tr
                      key={order.orderNo}
                      onClick={() => setSelectedOrder(order)}
                      className="hover:bg-yellow-50/40 dark:hover:bg-slate-700/40 cursor-pointer transition-colors"
                    >
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="font-bold text-gray-900 dark:text-white font-mono">
                          #{order.orderNo}
                        </div>
                        <div className="text-[11px] text-gray-400 flex items-center gap-1.5 mt-0.5">
                          <span>{order.date}</span>
                          <span className={`px-1.5 py-0.2 rounded text-[9px] font-bold ${
                            order.orderStatus.toUpperCase().includes('DELIVERED')
                              ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
                              : 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
                          }`}>
                            {order.orderStatus}
                          </span>
                        </div>
                      </td>

                      <td className="px-3 py-3 max-w-[230px]">
                        <div className="font-semibold text-gray-800 dark:text-gray-200 truncate" title={firstItem.itemName}>
                          {firstItem.itemName}
                        </div>
                        <div className="text-[11px] text-gray-400 flex items-center gap-1.5">
                          <span>ID: {firstItem.itemId}</span>
                          {extraItemsCount > 0 && (
                            <span className="px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 font-bold text-[10px]">
                              +{extraItemsCount} more
                            </span>
                          )}
                        </div>
                      </td>

                      <td className="px-3 py-3 max-w-[200px]">
                        <div className="font-semibold text-gray-800 dark:text-gray-200 truncate flex items-center gap-1">
                          <User className="w-3 h-3 text-gray-400 shrink-0" />
                          <span className="truncate">{order.customerName}</span>
                        </div>
                        <div className="text-[11px] text-gray-400 truncate flex items-center gap-1 mt-0.5" title={order.customerAddress}>
                          <MapPin className="w-3 h-3 text-gray-400 shrink-0" />
                          <span className="truncate">{order.customerAddress}</span>
                        </div>
                      </td>

                      <td className="px-3 py-3 whitespace-nowrap text-gray-700 dark:text-gray-300 font-medium">
                        {order.customerState}
                      </td>

                      <td className="px-3 py-3 text-right font-bold text-gray-800 dark:text-gray-200">
                        {order.units}
                      </td>

                      <td className="px-3 py-3 text-right whitespace-nowrap">
                        <div className="font-bold text-gray-900 dark:text-white">
                          {formatINR(order.invoiceAmount)}
                        </div>
                        {order.totalTax > 0 && (
                          <div className="text-[10px] text-gray-400">
                            Tax: {formatINR(order.totalTax)}
                          </div>
                        )}
                      </td>

                      <td className="px-3 py-3 text-right whitespace-nowrap">
                        <div className="font-semibold text-red-600 dark:text-red-400">
                          - {formatINR(order.totalCharges)}
                        </div>
                        <div className="text-[10px] text-gray-400" title="Commission + Fulfillment + GST on Fees">
                          Comm ₹{order.commission.toFixed(0)} + Ship ₹{order.shipping.toFixed(0)} + GST ₹{order.feeGst.toFixed(0)}
                        </div>
                      </td>

                      <td className="px-3 py-3 text-right whitespace-nowrap">
                        <div className="font-extrabold text-emerald-600 dark:text-emerald-400">
                          {formatINR(order.receivedAmount)}
                        </div>
                        <div className="text-[10px] text-gray-400">
                          {order.invoiceAmount > 0 ? ((order.receivedAmount / order.invoiceAmount) * 100).toFixed(1) : '0.0'}% payout
                        </div>
                      </td>

                      <td className="px-4 py-3 text-center">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedOrder(order);
                          }}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-700 hover:bg-yellow-400 hover:text-slate-900 text-gray-700 dark:text-gray-200 font-semibold text-[11px] transition-colors"
                        >
                          <Eye className="w-3 h-3" />
                          View
                        </button>
                      </td>
                    </tr>
                  );
                })
              ) : (
                pagedLines.map(line => (
                  <tr
                    key={line.key}
                    onClick={() => handleOpenLineAsOrder(line)}
                    className="hover:bg-yellow-50/40 dark:hover:bg-slate-700/40 cursor-pointer transition-colors"
                  >
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="font-bold text-gray-900 dark:text-white font-mono">
                        #{line.orderNo}
                      </div>
                      <div className="text-[11px] text-gray-400">
                        {line.date} • {line.orderStatus}
                      </div>
                    </td>

                    <td className="px-3 py-3 max-w-[230px]">
                      <div
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectProduct(line.itemId);
                        }}
                        className="font-semibold text-gray-800 dark:text-gray-200 hover:text-blue-600 truncate"
                        title={line.itemName}
                      >
                        {line.itemName}
                      </div>
                      <div className="text-[11px] text-gray-400">
                        ID: {line.itemId} • {line.brandName}
                      </div>
                    </td>

                    <td className="px-3 py-3 max-w-[200px]">
                      <div className="font-semibold text-gray-800 dark:text-gray-200 truncate">
                        {line.customerName}
                      </div>
                      <div className="text-[11px] text-gray-400 truncate" title={line.customerAddress}>
                        {line.customerAddress}
                      </div>
                    </td>

                    <td className="px-3 py-3 whitespace-nowrap text-gray-700 dark:text-gray-300 font-medium">
                      {line.customerState}
                    </td>

                    <td className="px-3 py-3 text-right font-bold text-gray-800 dark:text-gray-200">
                      {line.units}
                    </td>

                    <td className="px-3 py-3 text-right whitespace-nowrap">
                      <div className="font-bold text-gray-900 dark:text-white">
                        {formatINR(line.invoiceAmount)}
                      </div>
                      <div className="text-[10px] text-gray-400">
                        SP: ₹{line.sellingPrice.toFixed(0)} {line.totalTax > 0 ? `• Tax: ₹${line.totalTax.toFixed(2)}` : ''}
                      </div>
                    </td>

                    <td className="px-3 py-3 text-right whitespace-nowrap">
                      <div className="font-semibold text-red-600 dark:text-red-400">
                        - {formatINR(line.totalCharges)}
                      </div>
                      <div className="text-[10px] text-gray-400">
                        C ₹{line.commission.toFixed(0)} + S ₹{line.shipping.toFixed(0)} + G ₹{line.feeGst.toFixed(0)}
                      </div>
                    </td>

                    <td className="px-3 py-3 text-right whitespace-nowrap font-extrabold text-emerald-600 dark:text-emerald-400">
                      {formatINR(line.receivedAmount)}
                    </td>

                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleOpenLineAsOrder(line);
                        }}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-700 hover:bg-yellow-400 hover:text-slate-900 text-gray-700 dark:text-gray-200 font-semibold text-[11px] transition-colors"
                      >
                        <Eye className="w-3 h-3" />
                        View
                      </button>
                    </td>
                  </tr>
                ))
              )}

              {activeRowsCount === 0 && (
                <tr>
                  <td colSpan={9} className="px-6 py-10 text-center text-gray-500 dark:text-gray-400">
                    No matching orders found for the current search/filter criteria.
                  </td>
                </tr>
              )}
            </tbody>

            {/* Subtotal Row */}
            {activeRowsCount > 0 && (
              <tfoot className="bg-slate-50 dark:bg-slate-700/80 border-t-2 border-gray-200 dark:border-slate-600 font-bold text-gray-900 dark:text-white">
                <tr>
                  <td className="px-4 py-3" colSpan={4}>
                    Subtotal ({summary.totalOrders.toLocaleString()} Orders / {summary.totalLines.toLocaleString()} Line Items)
                  </td>
                  <td className="px-3 py-3 text-right">{summary.totalUnits.toLocaleString()}</td>
                  <td className="px-3 py-3 text-right">{formatINR(summary.totalInvoice)}</td>
                  <td className="px-3 py-3 text-right text-red-600 dark:text-red-400">
                    - {formatINR(summary.totalCharges)}
                  </td>
                  <td className="px-3 py-3 text-right text-emerald-600 dark:text-emerald-400">
                    {formatINR(summary.totalReceived)}
                  </td>
                  <td className="px-4 py-3 text-center text-[11px] text-gray-400">
                    {summary.receivedPct.toFixed(1)}%
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="px-4 py-3 border-t border-gray-100 dark:border-slate-700 flex items-center justify-between text-xs text-gray-600 dark:text-gray-300">
            <span>
              Showing {((safePage - 1) * PAGE_SIZE + 1).toLocaleString()}–{Math.min(safePage * PAGE_SIZE, activeRowsCount).toLocaleString()} of {activeRowsCount.toLocaleString()}
            </span>
            <div className="flex items-center gap-1.5">
              <button
                disabled={safePage <= 1}
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                className="p-1.5 rounded-lg border border-gray-200 dark:border-slate-600 disabled:opacity-40 hover:bg-gray-100 dark:hover:bg-slate-700"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="px-2 font-semibold">
                Page {safePage} / {totalPages}
              </span>
              <button
                disabled={safePage >= totalPages}
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                className="p-1.5 rounded-lg border border-gray-200 dark:border-slate-600 disabled:opacity-40 hover:bg-gray-100 dark:hover:bg-slate-700"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Order Detail & Charge Breakdown Modal */}
      {selectedOrder && (
        <div
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setSelectedOrder(null)}
        >
          <div
            className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-200 dark:border-slate-700 shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="p-5 border-b border-gray-100 dark:border-slate-700 flex items-start justify-between gap-4 sticky top-0 bg-white dark:bg-slate-800 z-10">
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-lg font-extrabold text-gray-900 dark:text-white font-mono">
                    Order #{selectedOrder.orderNo}
                  </h3>
                  <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                    {selectedOrder.orderStatus}
                  </span>
                  <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${
                    selectedOrder.chargeSource === 'Actual'
                      ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300'
                      : 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300'
                  }`}>
                    {selectedOrder.chargeSource === 'Actual' ? 'Actual Sheet Charges' : 'Calculated via Fee Rules'}
                  </span>
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Order Date: <strong className="text-gray-700 dark:text-gray-200">{selectedOrder.date}</strong> • Supply Hub: <strong className="text-gray-700 dark:text-gray-200">{selectedOrder.supplyLocation}</strong>
                </p>
              </div>
              <button
                onClick={() => setSelectedOrder(null)}
                className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-slate-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-5">
              {/* Customer, Address & State */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 bg-gray-50 dark:bg-slate-900/50 p-4 rounded-xl border border-gray-100 dark:border-slate-700">
                <div>
                  <p className="text-[11px] font-semibold text-gray-400 uppercase flex items-center gap-1">
                    <User className="w-3 h-3" /> Customer
                  </p>
                  <p className="text-sm font-bold text-gray-900 dark:text-white mt-0.5">
                    {selectedOrder.customerName}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] font-semibold text-gray-400 uppercase flex items-center gap-1">
                    <MapPin className="w-3 h-3" /> Address / City
                  </p>
                  <p className="text-sm font-semibold text-gray-800 dark:text-gray-200 mt-0.5">
                    {selectedOrder.customerAddress}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] font-semibold text-gray-400 uppercase">State</p>
                  <p className="text-sm font-bold text-gray-900 dark:text-white mt-0.5">
                    {selectedOrder.customerState}
                  </p>
                </div>
              </div>

              {/* Ordered Items */}
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-2 flex items-center gap-1.5">
                  <Package className="w-3.5 h-3.5 text-yellow-500" />
                  Items in Order ({selectedOrder.items.length} SKU{selectedOrder.items.length > 1 ? 's' : ''}, {selectedOrder.units} Unit{selectedOrder.units > 1 ? 's' : ''})
                </h4>
                <div className="border border-gray-100 dark:border-slate-700 rounded-xl overflow-hidden">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-gray-50 dark:bg-slate-700/60 text-gray-600 dark:text-gray-300 font-semibold">
                      <tr>
                        <th className="px-3 py-2.5">Item</th>
                        <th className="px-3 py-2.5 text-right">Units</th>
                        <th className="px-3 py-2.5 text-right">MRP</th>
                        <th className="px-3 py-2.5 text-right">Selling Price</th>
                        <th className="px-3 py-2.5 text-right">Tax (GST)</th>
                        <th className="px-3 py-2.5 text-right">Invoice Amt</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
                      {selectedOrder.items.map(item => (
                        <tr key={item.key}>
                          <td className="px-3 py-2.5">
                            <button
                              onClick={() => {
                                setSelectedOrder(null);
                                onSelectProduct(item.itemId);
                              }}
                              className="text-left font-semibold text-gray-900 dark:text-white hover:text-blue-600"
                            >
                              {item.itemName}
                            </button>
                            <div className="text-[11px] text-gray-400">
                              ID: {item.itemId} • {item.brandName}
                            </div>
                          </td>
                          <td className="px-3 py-2.5 text-right font-bold">{item.units}</td>
                          <td className="px-3 py-2.5 text-right text-gray-500">
                            {item.mrp > 0 ? `₹${item.mrp.toFixed(0)}` : '—'}
                          </td>
                          <td className="px-3 py-2.5 text-right text-gray-700 dark:text-gray-300">
                            ₹{item.sellingPrice.toFixed(2)}
                          </td>
                          <td className="px-3 py-2.5 text-right text-gray-500">
                            {item.totalTax > 0 ? formatINR(item.totalTax) : '—'}
                            {(item.cgst > 0 || item.sgst > 0 || item.igst > 0) && (
                              <div className="text-[10px] text-gray-400">
                                {item.igst > 0
                                  ? `IGST ₹${item.igst.toFixed(2)}`
                                  : `C ₹${item.cgst.toFixed(2)} + S ₹${item.sgst.toFixed(2)}`}
                              </div>
                            )}
                          </td>
                          <td className="px-3 py-2.5 text-right font-bold text-gray-900 dark:text-white">
                            {formatINR(item.invoiceAmount)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Charges Waterfall & Net Received */}
              <div className="bg-slate-50 dark:bg-slate-900/60 rounded-xl border border-gray-200 dark:border-slate-700 p-4 space-y-2.5">
                <h4 className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-1 flex items-center gap-1.5">
                  <IndianRupee className="w-3.5 h-3.5 text-emerald-500" />
                  Kya Kya Charges Cut Hue &amp; Net Received Breakdown
                </h4>

                <div className="flex justify-between text-sm font-bold text-gray-900 dark:text-white pb-2 border-b border-gray-200 dark:border-slate-700">
                  <span>Gross Invoice Amount ({selectedOrder.units} units)</span>
                  <span>{formatINR(selectedOrder.invoiceAmount)}</span>
                </div>

                <div className="space-y-1.5 text-xs">
                  <div className="flex justify-between text-gray-700 dark:text-gray-300">
                    <span className="flex items-center gap-1.5">
                      <ArrowDownRight className="w-3.5 h-3.5 text-red-500" />
                      Blinkit Commission ({globalConfig.defaultCommissionPct}% default / SKU override)
                    </span>
                    <span className="font-semibold text-red-600 dark:text-red-400">
                      - {formatINR(selectedOrder.commission)}
                    </span>
                  </div>

                  <div className="flex justify-between text-gray-700 dark:text-gray-300">
                    <span className="flex items-center gap-1.5">
                      <ArrowDownRight className="w-3.5 h-3.5 text-red-500" />
                      Fulfillment / Shipping / Handling Fee (₹{globalConfig.defaultShippingPerUnit}/unit)
                    </span>
                    <span className="font-semibold text-red-600 dark:text-red-400">
                      - {formatINR(selectedOrder.shipping)}
                    </span>
                  </div>

                  <div className="flex justify-between text-gray-700 dark:text-gray-300">
                    <span className="flex items-center gap-1.5">
                      <ArrowDownRight className="w-3.5 h-3.5 text-red-500" />
                      GST on Marketplace Fees ({globalConfig.gstOnFeesPct}% of Comm + Fulfillment)
                    </span>
                    <span className="font-semibold text-red-600 dark:text-red-400">
                      - {formatINR(selectedOrder.feeGst)}
                    </span>
                  </div>

                  {selectedOrder.tcs > 0 && (
                    <div className="flex justify-between text-gray-700 dark:text-gray-300">
                      <span className="flex items-center gap-1.5">
                        <ArrowDownRight className="w-3.5 h-3.5 text-red-500" />
                        TCS Deduction ({tcsPct}%)
                      </span>
                      <span className="font-semibold text-red-600 dark:text-red-400">
                        - {formatINR(selectedOrder.tcs)}
                      </span>
                    </div>
                  )}

                  {selectedOrder.tds > 0 && (
                    <div className="flex justify-between text-gray-700 dark:text-gray-300">
                      <span className="flex items-center gap-1.5">
                        <ArrowDownRight className="w-3.5 h-3.5 text-red-500" />
                        TDS u/s 194-O ({tdsPct}%)
                      </span>
                      <span className="font-semibold text-red-600 dark:text-red-400">
                        - {formatINR(selectedOrder.tds)}
                      </span>
                    </div>
                  )}

                  {selectedOrder.otherCharges > 0 && (
                    <div className="flex justify-between text-gray-700 dark:text-gray-300">
                      <span className="flex items-center gap-1.5">
                        <ArrowDownRight className="w-3.5 h-3.5 text-red-500" />
                        Other Charges / Deductions
                      </span>
                      <span className="font-semibold text-red-600 dark:text-red-400">
                        - {formatINR(selectedOrder.otherCharges)}
                      </span>
                    </div>
                  )}
                </div>

                <div className="flex justify-between text-xs font-bold text-red-600 dark:text-red-400 pt-2 border-t border-gray-200 dark:border-slate-700">
                  <span>Total Charges Cut</span>
                  <span>- {formatINR(selectedOrder.totalCharges)}</span>
                </div>

                <div className="flex justify-between items-center text-base font-black text-emerald-700 dark:text-emerald-400 pt-2 border-t-2 border-emerald-200 dark:border-emerald-800">
                  <span className="flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4" />
                    Net Received Amount (Payout)
                  </span>
                  <span>{formatINR(selectedOrder.receivedAmount)}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
