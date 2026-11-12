import React, { useState, useMemo, useRef, useEffect } from 'react';
import { InventoryRecord } from '../types';
import { Search, ArrowUpDown, ArrowDown, ArrowUp, Filter, Download, ChevronDown, FileSpreadsheet, FileText, File, Check } from 'lucide-react';
import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

interface InventoryTableProps {
  data: InventoryRecord[];
  onSelectProduct: (itemId: string) => void;
}

type SortField = keyof InventoryRecord | 'revenue'; 
type SortOrder = 'asc' | 'desc';

export const InventoryTable: React.FC<InventoryTableProps> = ({ data, onSelectProduct }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [sortField, setSortField] = useState<SortField>('totalSellable');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [showFilters, setShowFilters] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);
  
  // Warehouse multi-select state
  const [isWarehouseDropdownOpen, setIsWarehouseDropdownOpen] = useState(false);
  const warehouseDropdownRef = useRef<HTMLDivElement>(null);
  const exportMenuRef = useRef<HTMLDivElement>(null);
  
  // Filters State
  const [filters, setFilters] = useState({
    brand: 'All',
    warehouses: [] as string[], // Empty array implies 'All'
    showReportSales: false,
  });

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (exportMenuRef.current && !exportMenuRef.current.contains(event.target as Node)) {
        setShowExportMenu(false);
      }
      if (warehouseDropdownRef.current && !warehouseDropdownRef.current.contains(event.target as Node)) {
        setIsWarehouseDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Extract Unique Values
  const uniqueBrands = useMemo(() => Array.from(new Set(data.map(i => i.brandName))).sort(), [data]);
  const uniqueWarehouses = useMemo(() => Array.from(new Set(data.map(i => i.warehouseName))).sort(), [data]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('desc');
    }
  };

  const filteredData = data
    .filter(item => {
        const matchesSearch = item.itemName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                              item.itemId.includes(searchTerm);
        const matchesBrand = filters.brand === 'All' || item.brandName === filters.brand;
        const matchesWarehouse = filters.warehouses.length === 0 || filters.warehouses.includes(item.warehouseName);
        
        return matchesSearch && matchesBrand && matchesWarehouse;
    })
    .sort((a, b) => {
      const aValue = a[sortField as keyof InventoryRecord];
      const bValue = b[sortField as keyof InventoryRecord];
      
      if (typeof aValue === 'string' && typeof bValue === 'string') {
        return sortOrder === 'asc' ? aValue.localeCompare(bValue) : bValue.localeCompare(aValue);
      }
      
      return sortOrder === 'asc' 
        ? (aValue as number) - (bValue as number) 
        : (bValue as number) - (aValue as number);
    });
  
  // Totals Calculation
  const totals = useMemo(() => {
    const sum = (field: keyof InventoryRecord) => 
      filteredData.reduce((acc, curr) => acc + (Number(curr[field]) || 0), 0);
    
    const count = filteredData.length;
    const reportSalesSum = filteredData.reduce((acc, curr) => acc + (curr.reportSalesQty || 0), 0);
    
    return {
      sellable: sum('totalSellable'),
      darkstore: sum('sellableDarkstore'),
      unsellable: sum('totalUnsellable'),
      damaged: sum('unsellableDamaged'),
      sold30: sum('soldLast30'),
      incoming: sum('incomingScheduled'),
      reportSalesAvg: count > 0 ? reportSalesSum / count : 0,
      forecastSum: sum('forecast45d')
    };
  }, [filteredData]);

  const getExportData = () => {
     return filteredData.map(row => ({
        'Item ID': row.itemId,
        'Item Name': row.itemName,
        'Brand': row.brandName,
        'Warehouse': row.warehouseName,
        'Sellable': row.totalSellable,
        'Darkstore': row.sellableDarkstore,
        'Unsellable': row.totalUnsellable,
        'Damaged': row.unsellableDamaged,
        'Expired': row.unsellableExpired,
        'Sold (30d)': row.soldLast30 || 0,
        'Incoming': row.incomingScheduled,
        'Sales (Report)': row.reportSalesQty || 0,
        'ASP': row.reportSalesASP || 0,
        'Forecast (45d)': row.forecast45d || 0
     }));
  };

  // ... (export handlers remain same)
  const handleExportCSV = () => {
    const exportData = getExportData();
    if (exportData.length === 0) return;

    const headers = Object.keys(exportData[0]);
    const csvRows = [
      headers,
      ...exportData.map(row => Object.values(row).map(val => `"${String(val).replace(/"/g, '""')}"`))
    ];

    const csvContent = "data:text/csv;charset=utf-8," + csvRows.map(e => e.join(",")).join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `inventory_export_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setShowExportMenu(false);
  };

  const handleExportExcel = () => {
    const exportData = getExportData();
    if (exportData.length === 0) return;

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Inventory");
    XLSX.writeFile(workbook, `inventory_export_${new Date().toISOString().split('T')[0]}.xlsx`);
    setShowExportMenu(false);
  };

  const handleExportPDF = () => {
    const exportData = getExportData();
    if (exportData.length === 0) return;

    const doc = new jsPDF();
    const tableColumn = Object.keys(exportData[0]);
    const tableRows = exportData.map(row => Object.values(row));

    doc.setFontSize(14);
    doc.text("Blinkit Inventory Report", 14, 15);
    doc.setFontSize(10);
    doc.text(`Generated on: ${new Date().toLocaleDateString()}`, 14, 22);

    autoTable(doc, {
      head: [tableColumn],
      body: tableRows,
      startY: 30,
      styles: { fontSize: 8 },
      headStyles: { fillColor: [59, 130, 246] } // Blue header
    });

    doc.save(`inventory_export_${new Date().toISOString().split('T')[0]}.pdf`);
    setShowExportMenu(false);
  };

  const toggleWarehouse = (warehouse: string) => {
    setFilters(prev => {
      const isSelected = prev.warehouses.includes(warehouse);
      if (isSelected) {
        return { ...prev, warehouses: prev.warehouses.filter(w => w !== warehouse) };
      } else {
        return { ...prev, warehouses: [...prev.warehouses, warehouse] };
      }
    });
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <ArrowUpDown className="w-4 h-4 text-gray-300 dark:text-gray-600" />;
    return sortOrder === 'asc' 
      ? <ArrowUp className="w-4 h-4 text-blue-600 dark:text-blue-400" /> 
      : <ArrowDown className="w-4 h-4 text-blue-600 dark:text-blue-400" />;
  };

  return (
    <div className="space-y-4">
      {/* Header & Search */}
      <div className="bg-white dark:bg-slate-800 p-4 rounded-xl shadow-sm border border-gray-100 dark:border-slate-700 transition-colors">
        <div className="flex flex-col md:flex-row justify-between items-center gap-4 mb-4">
            <h2 className="text-xl font-bold text-gray-800 dark:text-white">Raw Inventory Data</h2>
            <div className="flex gap-2 w-full md:w-auto">
                {/* Export Dropdown */}
                <div className="relative" ref={exportMenuRef}>
                    <button 
                        onClick={() => setShowExportMenu(!showExportMenu)}
                        className="px-4 py-2 rounded-lg border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-slate-700 flex items-center gap-2 text-sm font-medium transition-colors"
                    >
                        <Download className="w-4 h-4" />
                        Export
                        <ChevronDown className="w-3 h-3 ml-1" />
                    </button>
                    {showExportMenu && (
                        <div className="absolute right-0 mt-2 w-48 bg-white dark:bg-slate-800 rounded-lg shadow-lg border border-gray-100 dark:border-slate-700 z-50 animate-in slide-in-from-top-2 fade-in duration-200 overflow-hidden">
                            <button 
                                onClick={handleExportExcel}
                                className="w-full text-left px-4 py-3 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-slate-700 flex items-center gap-2"
                            >
                                <FileSpreadsheet className="w-4 h-4 text-green-600" />
                                Export as Excel
                            </button>
                            <button 
                                onClick={handleExportCSV}
                                className="w-full text-left px-4 py-3 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-slate-700 flex items-center gap-2"
                            >
                                <FileText className="w-4 h-4 text-blue-600" />
                                Export as CSV
                            </button>
                             <button 
                                onClick={handleExportPDF}
                                className="w-full text-left px-4 py-3 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-slate-700 flex items-center gap-2 border-t border-gray-100 dark:border-slate-700"
                            >
                                <File className="w-4 h-4 text-red-600" />
                                Export as PDF
                            </button>
                        </div>
                    )}
                </div>

                <button 
                    onClick={() => setShowFilters(!showFilters)}
                    className={`px-4 py-2 rounded-lg border flex items-center gap-2 text-sm font-medium transition-colors ${
                      showFilters 
                        ? 'bg-slate-100 dark:bg-slate-700 border-slate-300 dark:border-slate-600 text-slate-800 dark:text-white' 
                        : 'bg-white dark:bg-slate-800 border-gray-200 dark:border-slate-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-slate-700'
                    }`}
                >
                    <Filter className="w-4 h-4" />
                    Filters
                </button>
                <div className="relative flex-1 md:w-80">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500 w-4 h-4" />
                    <input
                        type="text"
                        placeholder="Search Product Name or ID..."
                        className="w-full pl-10 pr-4 py-2 border border-gray-200 dark:border-slate-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-700 text-gray-800 dark:text-white placeholder-gray-400 dark:placeholder-gray-500"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
            </div>
        </div>

        {/* Expandable Filter Panel */}
        {showFilters && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4 border-t border-gray-100 dark:border-slate-700 animate-in slide-in-from-top-1">
                {/* Multi-Select Warehouse Dropdown */}
                <div className="relative" ref={warehouseDropdownRef}>
                    <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Warehouse</label>
                    <button
                        onClick={() => setIsWarehouseDropdownOpen(!isWarehouseDropdownOpen)}
                        className="w-full p-2 border border-gray-200 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-700 text-gray-800 dark:text-white flex justify-between items-center focus:border-blue-500 outline-none"
                    >
                        <span className="truncate">
                            {filters.warehouses.length === 0 
                                ? 'All Warehouses' 
                                : filters.warehouses.length === 1 
                                    ? filters.warehouses[0] 
                                    : `${filters.warehouses.length} Selected`}
                        </span>
                        <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${isWarehouseDropdownOpen ? 'rotate-180' : ''}`} />
                    </button>
                    
                    {isWarehouseDropdownOpen && (
                        <div className="absolute top-full left-0 mt-1 w-full max-h-60 overflow-y-auto bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-600 rounded-lg shadow-lg z-20 p-2 space-y-1">
                             <div 
                                onClick={() => setFilters(prev => ({...prev, warehouses: []}))}
                                className={`flex items-center gap-2 p-2 rounded cursor-pointer hover:bg-gray-50 dark:hover:bg-slate-700 ${filters.warehouses.length === 0 ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-600' : 'text-gray-700 dark:text-gray-200'}`}
                             >
                                <div className={`w-4 h-4 rounded border flex items-center justify-center ${filters.warehouses.length === 0 ? 'border-blue-500 bg-blue-500' : 'border-gray-300 dark:border-slate-500'}`}>
                                    {filters.warehouses.length === 0 && <Check className="w-3 h-3 text-white" />}
                                </div>
                                <span className="text-sm font-medium">All Warehouses</span>
                             </div>
                             
                             {uniqueWarehouses.map(w => {
                                 const isSelected = filters.warehouses.includes(w);
                                 return (
                                    <div 
                                        key={w}
                                        onClick={() => toggleWarehouse(w)}
                                        className="flex items-center gap-2 p-2 rounded cursor-pointer hover:bg-gray-50 dark:hover:bg-slate-700 text-gray-700 dark:text-gray-200"
                                    >
                                        <div className={`w-4 h-4 rounded border flex items-center justify-center ${isSelected ? 'border-blue-500 bg-blue-500' : 'border-gray-300 dark:border-slate-500'}`}>
                                            {isSelected && <Check className="w-3 h-3 text-white" />}
                                        </div>
                                        <span className="text-sm truncate" title={w}>{w}</span>
                                    </div>
                                 );
                             })}
                        </div>
                    )}
                </div>

                <div>
                    <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Brand</label>
                    <select 
                        className="w-full p-2 border border-gray-200 dark:border-slate-600 rounded-lg text-sm outline-none focus:border-blue-500 bg-white dark:bg-slate-700 text-gray-800 dark:text-white"
                        value={filters.brand}
                        onChange={(e) => setFilters({...filters, brand: e.target.value})}
                    >
                        <option value="All">All Brands</option>
                        {uniqueBrands.map(b => <option key={b} value={b}>{b}</option>)}
                    </select>
                </div>
                <div className="flex items-center gap-2 pt-5">
                    <input 
                      type="checkbox"
                      id="showReportSales"
                      checked={filters.showReportSales}
                      onChange={(e) => setFilters({...filters, showReportSales: e.target.checked})}
                      className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <label htmlFor="showReportSales" className="text-sm font-medium text-gray-700 dark:text-gray-200 cursor-pointer">
                      Show Sales Report Qty
                    </label>
                </div>
                <div className="flex items-end">
                    <button 
                        onClick={() => setFilters({brand: 'All', warehouses: [], showReportSales: false})}
                        className="text-sm text-blue-600 dark:text-blue-400 hover:underline px-2 py-2"
                    >
                        Clear Filters
                    </button>
                </div>
            </div>
        )}
      </div>

      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-100 dark:border-slate-700 overflow-hidden transition-colors">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-gray-50 dark:bg-slate-700 text-gray-600 dark:text-gray-300 font-medium border-b border-gray-200 dark:border-slate-600">
              <tr>
                <th className="px-6 py-4 cursor-pointer hover:bg-gray-100 dark:hover:bg-slate-600" onClick={() => handleSort('itemName')}>
                  <div className="flex items-center gap-2">Product Details <SortIcon field="itemName" /></div>
                </th>
                <th className="px-6 py-4 cursor-pointer hover:bg-gray-100 dark:hover:bg-slate-600" onClick={() => handleSort('warehouseName')}>
                   <div className="flex items-center gap-2">Warehouse <SortIcon field="warehouseName" /></div>
                </th>
                <th className="px-6 py-4 text-right cursor-pointer hover:bg-gray-100 dark:hover:bg-slate-600" onClick={() => handleSort('totalSellable')}>
                   <div className="flex items-center justify-end gap-2">Sellable <SortIcon field="totalSellable" /></div>
                </th>
                 <th className="px-6 py-4 text-right cursor-pointer hover:bg-gray-100 dark:hover:bg-slate-600" onClick={() => handleSort('sellableDarkstore')}>
                   <div className="flex items-center justify-end gap-2">Darkstore <SortIcon field="sellableDarkstore" /></div>
                </th>
                <th className="px-6 py-4 text-right cursor-pointer hover:bg-gray-100 dark:hover:bg-slate-600" onClick={() => handleSort('totalUnsellable')}>
                   <div className="flex items-center justify-end gap-2">Unsellable <SortIcon field="totalUnsellable" /></div>
                </th>
                <th className="px-6 py-4 text-right cursor-pointer hover:bg-gray-100 dark:hover:bg-slate-600" onClick={() => handleSort('unsellableDamaged')}>
                   <div className="flex items-center justify-end gap-2">Damaged <SortIcon field="unsellableDamaged" /></div>
                </th>
                <th className="px-6 py-4 text-right cursor-pointer hover:bg-gray-100 dark:hover:bg-slate-600" onClick={() => handleSort('soldLast30')}>
                   <div className="flex items-center justify-end gap-2">Sold (30d) <SortIcon field="soldLast30" /></div>
                </th>
                <th className="px-6 py-4 text-right cursor-pointer hover:bg-gray-100 dark:hover:bg-slate-600" onClick={() => handleSort('incomingScheduled')}>
                   <div className="flex items-center justify-end gap-2">Incoming <SortIcon field="incomingScheduled" /></div>
                </th>
                {filters.showReportSales && (
                  <>
                    <th className="px-6 py-4 text-right cursor-pointer hover:bg-gray-100 dark:hover:bg-slate-600" onClick={() => handleSort('reportSalesQty')}>
                      <div className="flex items-center justify-end gap-2 text-purple-600 dark:text-purple-400">Sold (Report) <SortIcon field="reportSalesQty" /></div>
                    </th>
                    <th className="px-6 py-4 text-right cursor-pointer hover:bg-gray-100 dark:hover:bg-slate-600" onClick={() => handleSort('reportSalesASP')}>
                      <div className="flex items-center justify-end gap-2 text-purple-600 dark:text-purple-400">ASP <SortIcon field="reportSalesASP" /></div>
                    </th>
                    <th className="px-6 py-4 text-right cursor-pointer hover:bg-gray-100 dark:hover:bg-slate-600" onClick={() => handleSort('forecast45d')}>
                      <div className="flex items-center justify-end gap-2 text-indigo-600 dark:text-indigo-400">Req (45d) <SortIcon field="forecast45d" /></div>
                    </th>
                  </>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
              {filteredData.map((record, idx) => (
                <tr 
                  key={`${record.itemId}-${record.warehouseId}-${idx}`} 
                  onClick={() => onSelectProduct(record.itemId)}
                  className="hover:bg-blue-50 dark:hover:bg-slate-700/60 cursor-pointer transition-colors group"
                >
                  <td className="px-6 py-4 max-w-xs">
                    <div className="font-medium text-gray-900 dark:text-gray-100 truncate group-hover:text-blue-600 dark:group-hover:text-blue-400" title={record.itemName}>{record.itemName}</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">ID: {record.itemId} | {record.brandName}</div>
                  </td>
                  <td className="px-6 py-4 text-gray-600 dark:text-gray-300">{record.warehouseName}</td>
                  <td className="px-6 py-4 text-right font-medium text-green-600 dark:text-green-400 bg-green-50/50 dark:bg-green-900/20">{record.totalSellable}</td>
                  <td className="px-6 py-4 text-right text-gray-600 dark:text-gray-300">{record.sellableDarkstore}</td>
                  <td className="px-6 py-4 text-right font-medium text-red-600 dark:text-red-400 bg-red-50/50 dark:bg-red-900/20">{record.totalUnsellable}</td>
                  <td className="px-6 py-4 text-right text-gray-600 dark:text-gray-300">{record.unsellableDamaged}</td>
                  <td className="px-6 py-4 text-right text-blue-600 dark:text-blue-400 font-medium">{record.soldLast30}</td>
                  <td className="px-6 py-4 text-right font-medium text-amber-600 dark:text-amber-400 bg-amber-50/30 dark:bg-amber-900/10">{record.incomingScheduled}</td>
                  {filters.showReportSales && (
                    <>
                      <td className="px-6 py-4 text-right font-bold text-purple-600 dark:text-purple-400 bg-purple-50/50 dark:bg-purple-900/20">{record.reportSalesQty || 0}</td>
                      <td className="px-6 py-4 text-right font-medium text-purple-600 dark:text-purple-400">₹{record.reportSalesASP?.toFixed(1) || 0}</td>
                      <td className="px-6 py-4 text-right font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/20">{record.forecast45d || 0}</td>
                    </>
                  )}
                </tr>
              ))}
              {filteredData.length === 0 && (
                <tr>
                  <td colSpan={filters.showReportSales ? 11 : 8} className="px-6 py-12 text-center text-gray-400 dark:text-gray-500">
                    No records found matching your filters.
                  </td>
                </tr>
              )}
            </tbody>
            {filteredData.length > 0 && (
              <tfoot className="bg-gray-100 dark:bg-slate-700/80 font-bold border-t-2 border-gray-200 dark:border-slate-600">
                <tr>
                  <td colSpan={2} className="px-6 py-4 text-gray-800 dark:text-gray-100">SUBTOTAL (Filtered)</td>
                  <td className="px-6 py-4 text-right text-green-700 dark:text-green-400">{totals.sellable.toLocaleString()}</td>
                  <td className="px-6 py-4 text-right text-gray-700 dark:text-gray-200">{totals.darkstore.toLocaleString()}</td>
                  <td className="px-6 py-4 text-right text-red-700 dark:text-red-400">{totals.unsellable.toLocaleString()}</td>
                  <td className="px-6 py-4 text-right text-gray-700 dark:text-gray-200">{totals.damaged.toLocaleString()}</td>
                  <td className="px-6 py-4 text-right text-blue-700 dark:text-blue-400">{totals.sold30.toLocaleString()}</td>
                  <td className="px-6 py-4 text-right text-amber-700 dark:text-amber-400">{totals.incoming.toLocaleString()}</td>
                  {filters.showReportSales && (
                    <>
                      <td className="px-6 py-4 text-right text-purple-700 dark:text-purple-300">
                        <div className="text-[10px] uppercase opacity-60 font-medium">Avg</div>
                        {totals.reportSalesAvg.toFixed(1)}
                      </td>
                      <td className="px-6 py-4 text-right text-purple-700 dark:text-purple-300"></td>
                      <td className="px-6 py-4 text-right text-indigo-700 dark:text-indigo-300">
                        <div className="text-[10px] uppercase opacity-60 font-medium">Total Req</div>
                        {totals.forecastSum.toLocaleString()}
                      </td>
                    </>
                  )}
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  );
};