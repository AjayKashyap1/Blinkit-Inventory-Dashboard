import React, { useMemo, useState } from 'react';
import { InventoryRecord, MergedItem, SalesRecord, AdvertisementRecord } from '../types';
import { aggregateByWarehouse, prepareSalesChartData, aggregateSalesByCity } from '../utils';
import { ExecutiveSummaryModal } from './ExecutiveSummaryModal';
import { 
  ComposedChart, Bar, BarChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, 
  PieChart, Pie, Cell, Area
} from 'recharts';
import { 
  Package, AlertTriangle, TrendingUp, ArchiveX, Filter, IndianRupee, X, Download, 
  Activity, BarChart2, Layers, MapPin, Search, ArrowUpDown, ShoppingBag, ExternalLink, ChevronRight, Check, FileText
} from 'lucide-react';

interface DashboardProps {
  mergedData: MergedItem[];
  rawInventory: InventoryRecord[];
  salesData: SalesRecord[];
  adsData?: AdvertisementRecord[];
  onSelectProduct: (itemId: string) => void;
  onSelectCity?: (city: string) => void;
}

const COLORS = ['#10B981', '#F59E0B', '#EF4444', '#3B82F6', '#8B5CF6'];
const STATUS_COLORS: {[key: string]: string} = {
  'Healthy': '#10B981',
  'Overstocked': '#F59E0B',
  'Low Stock': '#3B82F6',
  'Stockout': '#EF4444'
};

export const Dashboard: React.FC<DashboardProps> = ({ mergedData, rawInventory, salesData, adsData = [], onSelectProduct, onSelectCity }) => {
  const [chartPeriod, setChartPeriod] = useState<'daily' | 'weekly' | 'monthly'>('daily');
  const [chartType, setChartType] = useState<'mixed' | 'line' | 'bar'>('mixed');
  const [filters, setFilters] = useState({
    brand: 'All',
    status: 'All',
    warehouse: 'All',
    startDate: '',
    endDate: ''
  });
  const [showFilters, setShowFilters] = useState(false);
  const [showExecutiveModal, setShowExecutiveModal] = useState(false);

  // City Breakdown Modal States
  const [selectedCityForModal, setSelectedCityForModal] = useState<string | null>(null);
  const [cityModalSearch, setCityModalSearch] = useState('');
  const [cityModalSortBy, setCityModalSortBy] = useState<'units' | 'revenue' | 'name'>('units');
  const [cityModalSortOrder, setCityModalSortOrder] = useState<'asc' | 'desc'>('desc');
  const [cityDisplayMode, setCityDisplayMode] = useState<'chart' | 'list'>('chart');

  // --- Derived Data for Filters ---
  const uniqueBrands = useMemo(() => Array.from(new Set(mergedData.map(i => i.brandName))).sort(), [mergedData]);
  const uniqueWarehouses = useMemo(() => Array.from(new Set(rawInventory.map(i => i.warehouseName))).sort(), [rawInventory]);
  
  // --- Filter Logic ---
  const filteredData = useMemo(() => {
    return mergedData.filter(item => {
      const matchBrand = filters.brand === 'All' || item.brandName === filters.brand;
      const matchStatus = filters.status === 'All' || item.stockStatus === filters.status;
      const matchWarehouse = filters.warehouse === 'All' || filters.warehouse in item.warehouseDistribution;
      return matchBrand && matchStatus && matchWarehouse;
    });
  }, [mergedData, filters, rawInventory]);

  // Filter raw inventory for Warehouse chart
  const filteredInventory = useMemo(() => {
    return rawInventory.filter(item => {
      const matchBrand = filters.brand === 'All' || item.brandName === filters.brand;
      const matchWarehouse = filters.warehouse === 'All' || item.warehouseName === filters.warehouse;
      return matchBrand && matchWarehouse;
    });
  }, [rawInventory, filters]);

  // Filter sales data for charts (By Brand, AND items matching current status/warehouse filters, AND Date Range)
  const filteredSales = useMemo(() => {
    const filteredItemIds = new Set(filteredData.map(i => i.itemId));
    return salesData.filter(sale => {
      const matchBrand = filters.brand === 'All' || (sale.brandName && sale.brandName === filters.brand);
      const matchItem = filteredItemIds.has(sale.itemId);
      
      // Date Filter
      let matchDate = true;
      if (sale.date) {
        if (filters.startDate && sale.date < filters.startDate) matchDate = false;
        if (filters.endDate && sale.date > filters.endDate) matchDate = false;
      }

      return matchBrand && matchItem && matchDate;
    });
  }, [salesData, filteredData, filters.brand, filters.startDate, filters.endDate]);

  // Aggregated sales by itemId for the current filtered period
  const itemSalesMap = useMemo(() => {
    const map = new Map<string, { qty: number; revenue: number }>();
    filteredSales.forEach(sale => {
      const current = map.get(sale.itemId) || { qty: 0, revenue: 0 };
      map.set(sale.itemId, {
        qty: current.qty + sale.quantity,
        revenue: current.revenue + sale.revenue
      });
    });
    return map;
  }, [filteredSales]);

  // --- Aggregations ---
  const warehouseStats = useMemo(() => aggregateByWarehouse(filteredInventory), [filteredInventory]);
  const chartData = useMemo(() => prepareSalesChartData(filteredSales), [filteredSales]);
  const allCityStats = useMemo(() => aggregateSalesByCity(filteredSales), [filteredSales]);
  const cityStats = useMemo(() => allCityStats.slice(0, 8), [allCityStats]); // Top 8 cities for chart

  // Inventory & Merged Lookup for item names & brands
  const invMap = useMemo(() => {
    const map = new Map<string, { name: string; brand: string }>();
    rawInventory.forEach(inv => {
      if (!map.has(inv.itemId)) {
        map.set(inv.itemId, { name: inv.itemName, brand: inv.brandName });
      }
    });
    mergedData.forEach(m => {
      if (!map.has(m.itemId)) {
        map.set(m.itemId, { name: m.itemName, brand: m.brandName });
      }
    });
    return map;
  }, [rawInventory, mergedData]);

  // Handle clicking on any city
  const handleCityClick = (cityName: string) => {
    if (!cityName) return;
    setSelectedCityForModal(cityName);
    setCityModalSearch('');
    setCityModalSortBy('units');
    setCityModalSortOrder('desc');
  };

  // Product breakdown for the selected city modal
  const cityProductsData = useMemo(() => {
    if (!selectedCityForModal) return [];

    const map = new Map<string, {
      itemId: string;
      name: string;
      brand: string;
      quantity: number;
      revenue: number;
    }>();

    const targetCityLower = selectedCityForModal.trim().toLowerCase();

    filteredSales
      .filter(s => (s.customerCity || 'Unknown').trim().toLowerCase() === targetCityLower)
      .forEach(s => {
        const existing = map.get(s.itemId);
        const lookup = invMap.get(s.itemId);
        const name = s.itemName || lookup?.name || `Product ${s.itemId}`;
        const brand = s.brandName || lookup?.brand || 'Unknown';

        if (!existing) {
          map.set(s.itemId, {
            itemId: s.itemId,
            name,
            brand,
            quantity: s.quantity,
            revenue: s.revenue
          });
        } else {
          existing.quantity += s.quantity;
          existing.revenue += s.revenue;
        }
      });

    return Array.from(map.values());
  }, [selectedCityForModal, filteredSales, invMap]);

  // City modal totals
  const cityModalTotals = useMemo(() => {
    const totalUnits = cityProductsData.reduce((sum, p) => sum + p.quantity, 0);
    const totalRev = cityProductsData.reduce((sum, p) => sum + p.revenue, 0);
    const uniqueProducts = cityProductsData.length;
    const avgASP = totalUnits > 0 ? totalRev / totalUnits : 0;
    return { totalUnits, totalRev, uniqueProducts, avgASP };
  }, [cityProductsData]);

  // Filtered & sorted products in modal
  const filteredCityModalProducts = useMemo(() => {
    return cityProductsData
      .filter(p => 
        p.name.toLowerCase().includes(cityModalSearch.toLowerCase()) ||
        p.itemId.toLowerCase().includes(cityModalSearch.toLowerCase()) ||
        p.brand.toLowerCase().includes(cityModalSearch.toLowerCase())
      )
      .sort((a, b) => {
        let diff = 0;
        if (cityModalSortBy === 'units') diff = b.quantity - a.quantity;
        else if (cityModalSortBy === 'revenue') diff = b.revenue - a.revenue;
        else if (cityModalSortBy === 'name') diff = a.name.localeCompare(b.name);
        return cityModalSortOrder === 'asc' ? -diff : diff;
      });
  }, [cityProductsData, cityModalSearch, cityModalSortBy, cityModalSortOrder]);

  // Modal CSV export
  const handleExportCityModalCSV = () => {
    if (!selectedCityForModal || cityProductsData.length === 0) return;
    const rows = [
      ['City', 'Item ID', 'Product Name', 'Brand', 'Units Sold', 'Total Revenue (INR)', 'ASP (INR)', 'Share of City Units (%)'],
      ...cityProductsData.map(p => [
        selectedCityForModal,
        p.itemId,
        `"${p.name.replace(/"/g, '""')}"`,
        `"${p.brand.replace(/"/g, '""')}"`,
        p.quantity,
        p.revenue,
        (p.quantity > 0 ? (p.revenue / p.quantity).toFixed(2) : '0'),
        (cityModalTotals.totalUnits > 0 ? ((p.quantity / cityModalTotals.totalUnits) * 100).toFixed(2) : '0') + '%'
      ])
    ];

    const csvContent = "data:text/csv;charset=utf-8," + rows.map(e => e.join(",")).join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `Blinkit_${selectedCityForModal.replace(/\s+/g, '_')}_Units_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // KPIs
  const totalSellable = useMemo(() => {
    return filteredData.reduce((sum, r) => {
      return sum + (filters.warehouse === 'All' ? r.totalSellable : (r.warehouseDistribution[filters.warehouse] || 0));
    }, 0);
  }, [filteredData, filters.warehouse]);

  const totalUnsellable = filteredData.reduce((sum, r) => sum + r.totalUnsellable, 0);
  
  const totalRevenue = useMemo(() => {
    let total = 0;
    itemSalesMap.forEach(s => total += s.revenue);
    return total;
  }, [itemSalesMap]);

  const totalSalesVelocity = useMemo(() => {
    let total = 0;
    itemSalesMap.forEach(s => total += s.qty);
    return total;
  }, [itemSalesMap]);

  const averageASP = totalSalesVelocity > 0 ? totalRevenue / totalSalesVelocity : 0;
  
  const unsellableRatio = totalSellable + totalUnsellable > 0 
    ? ((totalUnsellable / (totalSellable + totalUnsellable)) * 100).toFixed(1)
    : "0";

  // Top Selling Items (by Revenue)
  const topRevenueItems = useMemo(() => {
    return Array.from(itemSalesMap.entries())
      .map(([id, sales]) => {
        const itemInfo = mergedData.find(m => m.itemId === id);
        return {
          id,
          name: itemInfo?.itemName || id,
          fullName: itemInfo?.itemName || id,
          revenue: sales.revenue,
          qty: sales.qty,
          asp: sales.qty > 0 ? sales.revenue / sales.qty : 0
        };
      })
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5)
      .map(item => ({
        ...item,
        name: item.name.length > 20 ? item.name.substring(0, 20) + '...' : item.name,
      }));
  }, [itemSalesMap, mergedData]);

  // Stock Status Distribution
  const stockStatusData = [
    { name: 'Healthy', value: filteredData.filter(i => i.stockStatus === 'Healthy').length },
    { name: 'Overstocked', value: filteredData.filter(i => i.stockStatus === 'Overstocked').length },
    { name: 'Low Stock', value: filteredData.filter(i => i.stockStatus === 'Low').length },
    { name: 'Stockout', value: filteredData.filter(i => i.stockStatus === 'Stockout').length },
  ].filter(x => x.value > 0);

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0
    }).format(val);
  };

  const handleExportChartData = () => {
    const data = chartData[chartPeriod];
    if (!data || data.length === 0) return;

    const csvRows = [
      ['Date', 'Period Label', 'Revenue (INR)', 'Units Sold'],
      ...data.map(row => [
        row.date,
        row.label,
        row.revenue,
        row.quantity
      ])
    ];

    const csvContent = "data:text/csv;charset=utf-8," + csvRows.map(e => e.join(",")).join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `blinkit_sales_trend_${chartPeriod}_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Tooltip Style for Dark Mode Compatibility
  // Forces text to be dark even if parent is in dark mode
  const tooltipStyle = {
    contentStyle: { 
      borderRadius: '8px', 
      border: 'none', 
      boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)', 
      backgroundColor: '#ffffff',
      color: '#1f2937' // Force dark text
    },
    itemStyle: { color: '#1f2937' },
    labelStyle: { color: '#4b5563', fontWeight: 600 }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-800 dark:text-white">Inventory & Sales Intelligence</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">Analysis based on imported Sales Report & Inventory Sheet</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowExecutiveModal(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-yellow-400 hover:bg-yellow-300 text-slate-900 font-bold text-sm shadow-sm transition-colors"
          >
            <FileText className="w-4 h-4" />
            Executive Report
          </button>
          <button 
            onClick={() => setShowFilters(!showFilters)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
              showFilters 
                ? 'bg-slate-800 text-white dark:bg-yellow-400 dark:text-slate-900 font-medium' 
                : 'bg-white dark:bg-slate-800 border border-gray-300 dark:border-slate-700 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-slate-700'
            }`}
          >
            <Filter className="w-4 h-4" />
            Filters {filters.brand !== 'All' || filters.status !== 'All' || filters.warehouse !== 'All' || filters.startDate || filters.endDate ? '(Active)' : ''}
          </button>
        </div>
      </div>

      {/* Multi-Filter Panel */}
      {showFilters && (
        <div className="bg-white dark:bg-slate-800 p-4 rounded-xl shadow-sm border border-yellow-200 dark:border-yellow-500/30 animate-in slide-in-from-top-2">
          <div className="flex justify-between items-center mb-3">
            <h3 className="text-sm font-bold text-gray-700 dark:text-gray-200 uppercase tracking-wide">Filter Analysis Data</h3>
            <button onClick={() => setFilters({brand: 'All', status: 'All', warehouse: 'All', startDate: '', endDate: ''})} className="text-xs text-blue-600 dark:text-blue-400 hover:underline">Reset All</button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Start Date</label>
              <input 
                type="date"
                className="w-full p-2 border border-gray-200 dark:border-slate-600 rounded-lg text-sm outline-none focus:border-yellow-400 bg-white dark:bg-slate-700 text-gray-800 dark:text-white"
                value={filters.startDate}
                onChange={(e) => setFilters({...filters, startDate: e.target.value})}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">End Date</label>
              <input 
                type="date"
                className="w-full p-2 border border-gray-200 dark:border-slate-600 rounded-lg text-sm outline-none focus:border-yellow-400 bg-white dark:bg-slate-700 text-gray-800 dark:text-white"
                value={filters.endDate}
                onChange={(e) => setFilters({...filters, endDate: e.target.value})}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Brand</label>
              <select 
                className="w-full p-2 border border-gray-200 dark:border-slate-600 rounded-lg text-sm outline-none focus:border-yellow-400 bg-white dark:bg-slate-700 text-gray-800 dark:text-white"
                value={filters.brand}
                onChange={(e) => setFilters({...filters, brand: e.target.value})}
              >
                <option value="All">All Brands</option>
                {uniqueBrands.map(b => <option key={b} value={b}>{b}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Stock Status</label>
              <select 
                className="w-full p-2 border border-gray-200 dark:border-slate-600 rounded-lg text-sm outline-none focus:border-yellow-400 bg-white dark:bg-slate-700 text-gray-800 dark:text-white"
                value={filters.status}
                onChange={(e) => setFilters({...filters, status: e.target.value})}
              >
                <option value="All">All Statuses</option>
                <option value="Healthy">Healthy</option>
                <option value="Overstocked">Overstocked</option>
                <option value="Low Stock">Low Stock</option>
                <option value="Stockout">Stockout</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Warehouse</label>
              <select 
                className="w-full p-2 border border-gray-200 dark:border-slate-600 rounded-lg text-sm outline-none focus:border-yellow-400 bg-white dark:bg-slate-700 text-gray-800 dark:text-white"
                value={filters.warehouse}
                onChange={(e) => setFilters({...filters, warehouse: e.target.value})}
              >
                <option value="All">All Locations</option>
                {uniqueWarehouses.map(w => <option key={w} value={w}>{w}</option>)}
              </select>
            </div>
          </div>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-sm border border-gray-100 dark:border-slate-700 flex items-center justify-between transition-colors">
          <div>
            <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Total Revenue</p>
            <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">{formatCurrency(totalRevenue)}</p>
            <div className="flex items-center gap-1 mt-2 text-xs font-medium text-green-600 dark:text-green-400">
               <span className="bg-green-50 dark:bg-green-900/30 px-1.5 py-0.5 rounded">From Sales Report</span>
            </div>
          </div>
          <div className="bg-green-50 dark:bg-green-900/20 p-3 rounded-lg">
            <IndianRupee className="w-6 h-6 text-green-600 dark:text-green-400" />
          </div>
        </div>

        <div className="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-sm border border-gray-100 dark:border-slate-700 flex items-center justify-between transition-colors">
          <div>
            <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Sales Velocity (Qty)</p>
            <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">{totalSalesVelocity.toLocaleString()}</p>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-2">Total Units Sold</p>
          </div>
          <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded-lg">
            <TrendingUp className="w-6 h-6 text-blue-600 dark:text-blue-400" />
          </div>
        </div>

        <div className="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-sm border border-gray-100 dark:border-slate-700 flex items-center justify-between transition-colors">
          <div>
            <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Active Inventory</p>
            <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">{totalSellable.toLocaleString()}</p>
            <div className="flex items-center gap-1 mt-2 text-xs font-medium text-orange-600 dark:text-orange-400">
               <span className="bg-orange-50 dark:bg-orange-900/30 px-1.5 py-0.5 rounded">Sellable Units</span>
            </div>
          </div>
          <div className="bg-orange-50 dark:bg-orange-900/20 p-3 rounded-lg">
            <Package className="w-6 h-6 text-orange-600 dark:text-orange-400" />
          </div>
        </div>

        <div className="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-sm border border-gray-100 dark:border-slate-700 flex items-center justify-between transition-colors">
          <div>
            <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Average Price (ASP)</p>
            <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">{formatCurrency(averageASP)}</p>
             <p className="text-xs text-gray-400 dark:text-gray-500 mt-2">Per Unit Sold</p>
          </div>
          <div className="bg-purple-50 dark:bg-purple-900/20 p-3 rounded-lg">
            <Activity className="w-6 h-6 text-purple-600 dark:text-purple-400" />
          </div>
        </div>
      </div>

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Sales Timeline Chart - Dual Axis (Revenue + Units) */}
        <div className="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-sm border border-gray-100 dark:border-slate-700 lg:col-span-2 transition-colors">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
            <div>
               <h3 className="text-lg font-bold text-gray-800 dark:text-white">Revenue & Volume Trend</h3>
               <p className="text-xs text-gray-500 dark:text-gray-400">Comparing financial performance with sales volume over time</p>
            </div>
            
            <div className="flex items-center gap-3">
              <button 
                onClick={handleExportChartData}
                className="p-1.5 text-gray-400 hover:text-blue-600 dark:text-gray-500 dark:hover:text-blue-400 transition-colors"
                title="Export Data to CSV"
              >
                <Download className="w-4 h-4" />
              </button>
              
              <div className="flex bg-gray-100 dark:bg-slate-700 rounded-lg p-1">
                <button
                  onClick={() => setChartType('mixed')}
                  className={`p-1.5 rounded-md transition-all ${chartType === 'mixed' ? 'bg-white dark:bg-slate-600 text-blue-600 dark:text-blue-400 shadow-sm' : 'text-gray-400 dark:text-gray-400 hover:text-gray-700'}`}
                  title="Mixed Chart"
                >
                  <Layers className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setChartType('line')}
                  className={`p-1.5 rounded-md transition-all ${chartType === 'line' ? 'bg-white dark:bg-slate-600 text-blue-600 dark:text-blue-400 shadow-sm' : 'text-gray-400 dark:text-gray-400 hover:text-gray-700'}`}
                  title="Line Chart"
                >
                  <Activity className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setChartType('bar')}
                  className={`p-1.5 rounded-md transition-all ${chartType === 'bar' ? 'bg-white dark:bg-slate-600 text-blue-600 dark:text-blue-400 shadow-sm' : 'text-gray-400 dark:text-gray-400 hover:text-gray-700'}`}
                  title="Bar Chart"
                >
                  <BarChart2 className="w-4 h-4" />
                </button>
              </div>

              <div className="flex bg-gray-100 dark:bg-slate-700 rounded-lg p-1">
                {['daily', 'weekly', 'monthly'].map((period) => (
                  <button
                    key={period}
                    onClick={() => setChartPeriod(period as any)}
                    className={`px-3 py-1 text-xs font-medium rounded-md capitalize transition-all ${
                      chartPeriod === period 
                        ? 'bg-white dark:bg-slate-600 text-blue-600 dark:text-blue-400 shadow-sm' 
                        : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                    }`}
                  >
                    {period}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartData[chartPeriod]} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.1}/>
                    <stop offset="95%" stopColor="#3B82F6" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" strokeOpacity={0.5} />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#94a3b8' }} minTickGap={30} axisLine={false} tickLine={false} />
                
                {/* Left Axis: Revenue */}
                <YAxis 
                  yAxisId="left"
                  tickFormatter={(val) => `₹${val/1000}k`} 
                  tick={{ fontSize: 11, fill: '#3B82F6' }} 
                  axisLine={false} 
                  tickLine={false} 
                />
                
                {/* Right Axis: Units */}
                <YAxis 
                  yAxisId="right" 
                  orientation="right" 
                  tick={{ fontSize: 11, fill: '#F59E0B' }} 
                  axisLine={false} 
                  tickLine={false} 
                  allowDecimals={false}
                />

                <Tooltip 
                  formatter={(value: number, name: string) => {
                     if (name === 'revenue') return [formatCurrency(value), 'Revenue'];
                     if (name === 'quantity') return [value, 'Units Sold'];
                     return [value, name];
                  }}
                  {...tooltipStyle}
                />
                <Legend iconType="circle" wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} />
                
                {/* Render based on chartType */}
                {chartType === 'mixed' && (
                  <>
                    <Area yAxisId="left" type="monotone" dataKey="revenue" name="Revenue (₹)" stroke="#3B82F6" strokeWidth={2} fillOpacity={1} fill="url(#colorRevenue)" />
                    <Bar yAxisId="right" dataKey="quantity" name="Units Sold" fill="#F59E0B" barSize={20} radius={[4, 4, 0, 0]} />
                  </>
                )}
                
                {chartType === 'line' && (
                  <>
                    <Line yAxisId="left" type="monotone" dataKey="revenue" name="Revenue (₹)" stroke="#3B82F6" strokeWidth={2} dot={{r: 3}} />
                    <Line yAxisId="right" type="monotone" dataKey="quantity" name="Units Sold" stroke="#F59E0B" strokeWidth={2} dot={{r: 3}} />
                  </>
                )}

                {chartType === 'bar' && (
                  <>
                    <Bar yAxisId="left" dataKey="revenue" name="Revenue (₹)" fill="#3B82F6" barSize={20} radius={[4, 4, 0, 0]} />
                    <Bar yAxisId="right" dataKey="quantity" name="Units Sold" fill="#F59E0B" barSize={20} radius={[4, 4, 0, 0]} />
                  </>
                )}

              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Top Revenue Items */}
        <div className="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-sm border border-gray-100 dark:border-slate-700 transition-colors">
          <h3 className="text-lg font-bold text-gray-800 dark:text-white mb-4">Top Revenue Drivers</h3>
          <div className="h-80 overflow-y-auto pr-2 custom-scrollbar">
             {topRevenueItems.map((item, idx) => (
                <div 
                  key={idx} 
                  onClick={() => onSelectProduct(item.id)}
                  className="mb-4 last:mb-0 cursor-pointer group hover:bg-gray-50 dark:hover:bg-slate-700/50 p-2 rounded-lg transition-colors"
                >
                   <div className="flex justify-between items-start mb-1">
                      <span className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate max-w-[180px] group-hover:text-blue-600 dark:group-hover:text-blue-400" title={item.fullName}>{item.name}</span>
                      <span className="text-sm font-bold text-green-600 dark:text-green-400">{formatCurrency(item.revenue)}</span>
                   </div>
                   <div className="w-full bg-gray-100 dark:bg-slate-700 rounded-full h-1.5 mb-1">
                      <div className="bg-green-500 h-1.5 rounded-full" style={{ width: `${Math.min(100, (item.revenue / (topRevenueItems[0]?.revenue || 1)) * 100)}%` }}></div>
                   </div>
                   <div className="flex justify-between text-xs text-gray-400 dark:text-gray-500">
                      <span>{item.qty} units sold</span>
                      <span className="font-medium text-purple-600 dark:text-purple-400">ASP: ₹{item.asp.toFixed(0)}</span>
                   </div>
                </div>
             ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Stock Status Breakdown */}
        <div className="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-sm border border-gray-100 dark:border-slate-700 transition-colors">
          <h3 className="text-lg font-bold text-gray-800 dark:text-white mb-4">Stock Health Distribution</h3>
          <div className="flex items-center">
            <div className="h-56 w-1/2">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={stockStatusData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={2}
                    dataKey="value"
                    stroke="none"
                  >
                    {stockStatusData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={STATUS_COLORS[entry.name]} />
                    ))}
                  </Pie>
                  <Tooltip {...tooltipStyle} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="w-1/2 space-y-3">
               {stockStatusData.map((item) => (
                  <div key={item.name} className="flex items-center justify-between text-sm">
                     <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: STATUS_COLORS[item.name] }}></div>
                        <span className="text-gray-600 dark:text-gray-300">{item.name}</span>
                     </div>
                     <span className="font-semibold text-gray-900 dark:text-white">{item.value}</span>
                  </div>
               ))}
            </div>
          </div>
        </div>

        {/* Sales by City */}
        <div className="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-sm border border-gray-100 dark:border-slate-700 transition-colors flex flex-col">
          <div className="flex justify-between items-center mb-3">
             <div className="flex items-center gap-2">
               <h3 className="text-lg font-bold text-gray-800 dark:text-white flex items-center gap-2">
                 <MapPin className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                 Sales by City
               </h3>
               <span className="text-[10px] uppercase font-bold text-purple-700 dark:text-purple-300 bg-purple-100 dark:bg-purple-900/40 px-2 py-0.5 rounded-full">
                 Click City for Units
               </span>
             </div>
             
             {allCityStats.length > 0 && (
               <div className="flex items-center gap-1 bg-gray-100 dark:bg-slate-700 p-0.5 rounded-lg text-xs">
                 <button
                   onClick={() => setCityDisplayMode('chart')}
                   className={`px-2 py-1 rounded-md transition-colors font-semibold ${
                     cityDisplayMode === 'chart' 
                       ? 'bg-white dark:bg-slate-600 text-purple-600 dark:text-purple-400 shadow-sm' 
                       : 'text-gray-500 dark:text-gray-400 hover:text-gray-900'
                   }`}
                 >
                   Chart
                 </button>
                 <button
                   onClick={() => setCityDisplayMode('list')}
                   className={`px-2 py-1 rounded-md transition-colors font-semibold ${
                     cityDisplayMode === 'list' 
                       ? 'bg-white dark:bg-slate-600 text-purple-600 dark:text-purple-400 shadow-sm' 
                       : 'text-gray-500 dark:text-gray-400 hover:text-gray-900'
                   }`}
                 >
                   All ({allCityStats.length})
                 </button>
               </div>
             )}
          </div>

          <p className="text-xs text-gray-400 dark:text-gray-500 mb-3">
            Click on any city to see product-wise units sold in that region.
          </p>

          <div className="h-60 flex-1">
             {allCityStats.length > 0 ? (
               cityDisplayMode === 'chart' ? (
                 <div className="h-full flex flex-col">
                   <div className="h-44">
                     <ResponsiveContainer width="100%" height="100%">
                       <BarChart 
                          data={cityStats} 
                          layout="vertical" 
                          margin={{ top: 0, right: 25, left: 35, bottom: 0 }}
                          onClick={(data: any) => {
                             const cityName = data?.activePayload?.[0]?.payload?.name || data?.name;
                             if (cityName) handleCityClick(cityName);
                          }}
                          className="cursor-pointer"
                       >
                         <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#E5E7EB" strokeOpacity={0.5} />
                         <XAxis type="number" hide />
                         <YAxis 
                           type="category" 
                           dataKey="name" 
                           width={80} 
                           tick={{ fontSize: 10, fill: '#94a3b8', cursor: 'pointer' }} 
                           axisLine={false} 
                           tickLine={false}
                           onClick={(e: any) => {
                             if (e && e.value) handleCityClick(e.value);
                           }} 
                         />
                         <Tooltip 
                            cursor={{ fill: 'rgba(139, 92, 246, 0.08)' }} 
                            formatter={(value: any, name: any, item: any) => [
                              `${item.payload.quantity?.toLocaleString() || 0} Units (${formatCurrency(value)})`,
                              'Sales Volume'
                            ]}
                            {...tooltipStyle} 
                         />
                         <Bar 
                           dataKey="revenue" 
                           name="Revenue" 
                           fill="#8B5CF6" 
                           radius={[0, 4, 4, 0]} 
                           barSize={12} 
                           cursor="pointer"
                           onClick={(entry: any) => {
                             if (entry?.name) handleCityClick(entry.name);
                           }}
                         />
                       </BarChart>
                     </ResponsiveContainer>
                   </div>

                   {/* Quick-click top city badges with units */}
                   <div className="mt-auto pt-2 border-t border-gray-100 dark:border-slate-700/60 flex items-center gap-1.5 overflow-x-auto custom-scrollbar pb-1">
                     <span className="text-[10px] text-gray-400 dark:text-gray-500 font-semibold uppercase shrink-0">
                       Quick View:
                     </span>
                     {cityStats.map(city => (
                       <button
                         key={city.name}
                         onClick={() => handleCityClick(city.name)}
                         className="px-2 py-0.5 text-[11px] font-medium rounded-md bg-purple-50 hover:bg-purple-100 dark:bg-purple-950/40 dark:hover:bg-purple-900/50 text-purple-700 dark:text-purple-300 transition-colors shrink-0 flex items-center gap-1"
                         title={`Click to view products sold in ${city.name}`}
                       >
                         <span>{city.name}</span>
                         <span className="font-bold text-[10px]">({city.quantity} units)</span>
                       </button>
                     ))}
                   </div>
                 </div>
               ) : (
                 /* All Cities List View */
                 <div className="h-full overflow-y-auto pr-1 space-y-1.5 custom-scrollbar">
                   {allCityStats.map((city, idx) => (
                     <div
                       key={city.name}
                       onClick={() => handleCityClick(city.name)}
                       className="p-2.5 rounded-lg bg-gray-50 hover:bg-purple-50 dark:bg-slate-700/50 dark:hover:bg-purple-950/30 border border-gray-100 dark:border-slate-700 flex items-center justify-between cursor-pointer transition-colors group"
                     >
                       <div className="flex items-center gap-2 min-w-0">
                         <span className="text-xs font-bold text-gray-400 w-4">{idx + 1}.</span>
                         <span className="text-xs font-bold text-gray-800 dark:text-gray-200 group-hover:text-purple-600 dark:group-hover:text-purple-400 truncate">
                           {city.name}
                         </span>
                       </div>
                       <div className="flex items-center gap-3 shrink-0">
                         <span className="px-2 py-0.5 rounded bg-purple-100 dark:bg-purple-900/50 text-purple-800 dark:text-purple-300 text-xs font-extrabold">
                           {city.quantity.toLocaleString()} units
                         </span>
                         <span className="text-xs font-semibold text-gray-600 dark:text-gray-400">
                           {formatCurrency(city.revenue)}
                         </span>
                         <ChevronRight className="w-3.5 h-3.5 text-gray-400 group-hover:text-purple-600" />
                       </div>
                     </div>
                   ))}
                 </div>
               )
             ) : (
                <div className="flex items-center justify-center h-full text-sm text-gray-400">
                   No City Data Available
                </div>
             )}
          </div>
        </div>

        {/* Warehouse Stock */}
        <div className="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-sm border border-gray-100 dark:border-slate-700 transition-colors">
          <h3 className="text-lg font-bold text-gray-800 dark:text-white mb-4">Stock by Warehouse (Filtered)</h3>
          <div className="h-56">
             <ResponsiveContainer width="100%" height="100%">
               <BarChart data={warehouseStats} layout="vertical" margin={{ top: 0, right: 30, left: 40, bottom: 0 }}>
                 <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#E5E7EB" strokeOpacity={0.5} />
                 <XAxis type="number" hide />
                 <YAxis type="category" dataKey="name" width={100} tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                 <Tooltip cursor={{fill: 'transparent'}} {...tooltipStyle} />
                 <Legend wrapperStyle={{ fontSize: '11px' }}/>
                 <Bar dataKey="sellable" name="Sellable" stackId="a" fill="#10B981" radius={[0, 4, 4, 0]} barSize={12} />
                 <Bar dataKey="unsellable" name="Unsellable" stackId="a" fill="#EF4444" radius={[0, 4, 4, 0]} barSize={12} />
               </BarChart>
             </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* City Product Breakdown Modal */}
      {selectedCityForModal && (
        <div 
          className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-4 sm:p-6 animate-in fade-in duration-200"
          onClick={() => setSelectedCityForModal(null)}
        >
          <div 
            className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl border border-gray-100 dark:border-slate-700 w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="p-5 border-b border-gray-100 dark:border-slate-700 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-gradient-to-r from-purple-50/50 to-white dark:from-purple-950/20 dark:to-slate-800">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-purple-600 text-white rounded-xl shadow-md">
                  <MapPin className="w-6 h-6" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-xl font-extrabold text-gray-900 dark:text-white">
                      {selectedCityForModal}
                    </h3>
                    <span className="px-2.5 py-0.5 rounded-full bg-purple-100 dark:bg-purple-900/50 text-purple-700 dark:text-purple-300 text-xs font-bold">
                      City Sales Breakdown
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                    Product-wise units sold & revenue in {selectedCityForModal}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 self-end sm:self-auto">
                <button
                  onClick={handleExportCityModalCSV}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 hover:bg-gray-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-gray-700 dark:text-gray-200 rounded-lg text-xs font-semibold transition-colors"
                  title="Export city breakdown to CSV"
                >
                  <Download className="w-3.5 h-3.5" />
                  Export CSV
                </button>
                {onSelectCity && (
                  <button
                    onClick={() => {
                      const c = selectedCityForModal;
                      setSelectedCityForModal(null);
                      onSelectCity(c);
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-600 hover:bg-purple-500 text-white rounded-lg text-xs font-bold transition-colors shadow-sm"
                    title="Open full page analytics for this city"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    Full Analytics
                  </button>
                )}
                <button
                  onClick={() => setSelectedCityForModal(null)}
                  className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Modal KPI Mini Summary */}
            <div className="p-4 bg-gray-50/70 dark:bg-slate-900/40 border-b border-gray-100 dark:border-slate-700 grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
              <div className="p-3 bg-white dark:bg-slate-800 rounded-xl border border-purple-100 dark:border-purple-900/30">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Total Units Sold</p>
                <p className="text-xl font-black text-purple-600 dark:text-purple-400 mt-0.5">
                  {cityModalTotals.totalUnits.toLocaleString()}
                </p>
              </div>
              <div className="p-3 bg-white dark:bg-slate-800 rounded-xl border border-gray-100 dark:border-slate-700">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">City Revenue</p>
                <p className="text-xl font-bold text-gray-900 dark:text-white mt-0.5">
                  {formatCurrency(cityModalTotals.totalRev)}
                </p>
              </div>
              <div className="p-3 bg-white dark:bg-slate-800 rounded-xl border border-gray-100 dark:border-slate-700">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Unique Products</p>
                <p className="text-xl font-bold text-gray-900 dark:text-white mt-0.5">
                  {cityModalTotals.uniqueProducts} SKUs
                </p>
              </div>
              <div className="p-3 bg-white dark:bg-slate-800 rounded-xl border border-gray-100 dark:border-slate-700">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Average Price (ASP)</p>
                <p className="text-xl font-bold text-gray-900 dark:text-white mt-0.5">
                  ₹{cityModalTotals.avgASP.toFixed(0)}
                </p>
              </div>
            </div>

            {/* Search & Filter Toolbar */}
            <div className="p-4 border-b border-gray-100 dark:border-slate-700 flex flex-col sm:flex-row justify-between items-center gap-3">
              <div className="relative w-full sm:w-72">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                <input
                  type="text"
                  placeholder="Search product or SKU..."
                  value={cityModalSearch}
                  onChange={(e) => setCityModalSearch(e.target.value)}
                  className="w-full pl-9 pr-3 py-1.5 text-xs rounded-lg border border-gray-200 dark:border-slate-600 bg-gray-50 dark:bg-slate-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>

              <div className="flex items-center gap-2 self-start sm:self-auto text-xs">
                <span className="text-gray-400 text-[11px] font-medium">Sort by:</span>
                <button
                  onClick={() => {
                    if (cityModalSortBy === 'units') {
                      setCityModalSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
                    } else {
                      setCityModalSortBy('units');
                      setCityModalSortOrder('desc');
                    }
                  }}
                  className={`px-2.5 py-1 rounded-md font-semibold transition-colors flex items-center gap-1 ${
                    cityModalSortBy === 'units'
                      ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/50 dark:text-purple-300'
                      : 'bg-gray-100 text-gray-600 dark:bg-slate-700 dark:text-gray-300'
                  }`}
                >
                  Units Sold {cityModalSortBy === 'units' && (cityModalSortOrder === 'desc' ? '↓' : '↑')}
                </button>
                <button
                  onClick={() => {
                    if (cityModalSortBy === 'revenue') {
                      setCityModalSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
                    } else {
                      setCityModalSortBy('revenue');
                      setCityModalSortOrder('desc');
                    }
                  }}
                  className={`px-2.5 py-1 rounded-md font-semibold transition-colors flex items-center gap-1 ${
                    cityModalSortBy === 'revenue'
                      ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/50 dark:text-purple-300'
                      : 'bg-gray-100 text-gray-600 dark:bg-slate-700 dark:text-gray-300'
                  }`}
                >
                  Revenue {cityModalSortBy === 'revenue' && (cityModalSortOrder === 'desc' ? '↓' : '↑')}
                </button>
                <button
                  onClick={() => {
                    if (cityModalSortBy === 'name') {
                      setCityModalSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
                    } else {
                      setCityModalSortBy('name');
                      setCityModalSortOrder('asc');
                    }
                  }}
                  className={`px-2.5 py-1 rounded-md font-semibold transition-colors flex items-center gap-1 ${
                    cityModalSortBy === 'name'
                      ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/50 dark:text-purple-300'
                      : 'bg-gray-100 text-gray-600 dark:bg-slate-700 dark:text-gray-300'
                  }`}
                >
                  Name
                </button>
              </div>
            </div>

            {/* Table of products */}
            <div className="flex-1 overflow-y-auto max-h-[55vh] custom-scrollbar">
              <table className="w-full text-xs text-left">
                <thead className="bg-gray-50 dark:bg-slate-700 text-gray-600 dark:text-gray-300 font-semibold sticky top-0 z-10 border-b border-gray-100 dark:border-slate-700">
                  <tr>
                    <th className="px-5 py-3 w-10">#</th>
                    <th className="px-5 py-3">Product Name & SKU</th>
                    <th className="px-5 py-3 text-right bg-purple-50/60 dark:bg-purple-950/20 text-purple-700 dark:text-purple-300 font-bold">
                      Units Sold
                    </th>
                    <th className="px-5 py-3 text-right">Revenue</th>
                    <th className="px-5 py-3 text-right">ASP</th>
                    <th className="px-5 py-3 text-right">% of City</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
                  {filteredCityModalProducts.map((p, idx) => {
                    const asp = p.quantity > 0 ? p.revenue / p.quantity : 0;
                    const pct = cityModalTotals.totalUnits > 0 ? (p.quantity / cityModalTotals.totalUnits) * 100 : 0;
                    return (
                      <tr 
                        key={p.itemId} 
                        onClick={() => {
                          setSelectedCityForModal(null);
                          onSelectProduct(p.itemId);
                        }}
                        className="hover:bg-purple-50/60 dark:hover:bg-purple-950/30 cursor-pointer transition-colors group"
                        title="Click to view product details"
                      >
                        <td className="px-5 py-3 text-gray-400 font-bold">
                          {idx + 1}
                        </td>
                        <td className="px-5 py-3">
                          <div className="font-semibold text-gray-900 dark:text-gray-100 group-hover:text-purple-600 dark:group-hover:text-purple-400 truncate max-w-sm" title={p.name}>
                            {p.name}
                          </div>
                          <div className="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5 flex items-center gap-2">
                            <span>ID: {p.itemId}</span>
                            <span>•</span>
                            <span className="text-gray-600 dark:text-gray-400 font-medium">{p.brand}</span>
                          </div>
                        </td>
                        <td className="px-5 py-3 text-right bg-purple-50/30 dark:bg-purple-950/10">
                          <span className="inline-flex items-center gap-1 px-3 py-1 rounded-lg bg-purple-100 dark:bg-purple-900/60 text-purple-900 dark:text-purple-200 font-extrabold text-sm shadow-sm">
                            <ShoppingBag className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
                            {p.quantity.toLocaleString()} Units
                          </span>
                        </td>
                        <td className="px-5 py-3 text-right font-semibold text-gray-900 dark:text-white">
                          {formatCurrency(p.revenue)}
                        </td>
                        <td className="px-5 py-3 text-right font-medium text-gray-600 dark:text-gray-300">
                          ₹{asp.toFixed(0)}
                        </td>
                        <td className="px-5 py-3 text-right">
                          <div className="font-medium text-gray-700 dark:text-gray-300">{pct.toFixed(1)}%</div>
                          <div className="w-16 bg-gray-200 dark:bg-slate-700 rounded-full h-1 mt-1 ml-auto overflow-hidden">
                            <div className="bg-purple-600 h-1 rounded-full" style={{ width: `${Math.min(100, pct)}%` }} />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {filteredCityModalProducts.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-6 py-12 text-center text-gray-400 dark:text-slate-500">
                        No products found matching "{cityModalSearch}".
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Modal Footer */}
            <div className="p-3 bg-gray-50 dark:bg-slate-900/60 border-t border-gray-100 dark:border-slate-700 flex justify-between items-center text-xs text-gray-500 dark:text-gray-400">
              <span>Showing {filteredCityModalProducts.length} of {cityProductsData.length} products</span>
              <button
                onClick={() => setSelectedCityForModal(null)}
                className="px-4 py-1.5 bg-gray-200 hover:bg-gray-300 dark:bg-slate-700 dark:hover:bg-slate-600 text-gray-800 dark:text-gray-200 rounded-lg font-semibold transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Executive Summary Report Modal (PDF & WhatsApp) */}
      <ExecutiveSummaryModal
        isOpen={showExecutiveModal}
        onClose={() => setShowExecutiveModal(false)}
        totalRevenue={totalRevenue}
        totalUnitsSold={totalSalesVelocity}
        averageASP={averageASP}
        totalSellable={totalSellable}
        totalUnsellable={totalUnsellable}
        topProducts={topRevenueItems}
        topCities={allCityStats}
        filteredItems={filteredData}
        adsData={adsData}
        activeFilters={filters}
      />
    </div>
  );
};